const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: ['MESSAGE', 'CHANNEL', 'REACTION'],
});

const prefix = 'v!';
const coinEmoji = '<a:coin:1475856179497275594>';
const giveawayEmoji = '<:giveaway:1475844346258522273>';
const GIVEAWAY_EMOJI_ID   = '1475844346258522273';
const GIVEAWAY_EMOJI_NAME = 'giveaway';

const WELCOME_CHANNEL_ID = '1475548830635130990';
const GOODBYE_CHANNEL_ID = '1475913121951387759';

// ─────────────────────────────────────────
//  DATABASE & LOGGING
// ─────────────────────────────────────────
let db = { users: {}, giveaways: {} };
if (fs.existsSync('./database.json')) {
    const loaded = JSON.parse(fs.readFileSync('./database.json'));
    db.users     = loaded.users     || {};
    db.giveaways = loaded.giveaways || {};
}
const saveData = () => fs.writeFileSync('./database.json', JSON.stringify(db, null, 2));

const botLogs = [];
const logger = (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${msg}`;
    botLogs.push(entry);
    console.log(entry);
    if (botLogs.length > 50) botLogs.shift();
};

const getUserData = (id) => {
    if (!db.users[id]) db.users[id] = { coins: 0, warns: 0, lastWork: 0, lastDaily: 0 };
    return db.users[id];
};

// ─────────────────────────────────────────
//  TIME PARSER  (1h, 1d, 1m, 1s, 1hr, 1day, 1min)
// ─────────────────────────────────────────
const parseTime = (str) => {
    if (!str) return null;
    const match = str.match(/^(\d+)(s|sec|m|min|h|hr|hour|d|day)s?$/i);
    if (!match) return null;
    const val  = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 's' || unit === 'sec')                    return val * 1000;
    if (unit === 'm' || unit === 'min')                    return val * 60 * 1000;
    if (unit === 'h' || unit === 'hr' || unit === 'hour')  return val * 3600 * 1000;
    if (unit === 'd' || unit === 'day')                    return val * 86400 * 1000;
    return null;
};

const formatDuration = (ms) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
};

// ─────────────────────────────────────────
//  GIVEAWAY HELPERS
// ─────────────────────────────────────────
const buildGiveawayEmbed = (gw, live = true) => {
    const endsTs = Math.floor(gw.endsAt / 1000);
    if (live) {
        return new EmbedBuilder()
            .setTitle(`${giveawayEmoji}  G I V E A W A Y  ${giveawayEmoji}`)
            .setDescription(
                `## 🎁 ${gw.prize}\n\n` +
                `> React with ${giveawayEmoji} to enter!\n\n` +
                `**⏰ Ends:** <t:${endsTs}:R>  *(* <t:${endsTs}:f> *)*\n` +
                `**🏆 Winners:** ${gw.winners}\n` +
                `**⏱️ Duration:** ${formatDuration(gw.endsAt - gw.startedAt)}\n` +
                `**🎟️ Hosted by:** <@${gw.hostId}>`
            )
            .setColor(0xF1C40F)
            .setFooter({ text: `🎉 Good luck to all participants! • Ends` });
    } else {
        return new EmbedBuilder()
            .setTitle(`${giveawayEmoji}  GIVEAWAY ENDED`)
            .setDescription(
                `## 🎁 ${gw.prize}\n\n` +
                `**🏆 Winner(s):** ${gw.winnerMentions || 'None'}\n` +
                `**🎟️ Hosted by:** <@${gw.hostId}>\n` +
                `**👥 Total Entries:** ${gw.totalEntries ?? 0}\n` +
                `**🏅 Winners drawn:** ${gw.winners}`
            )
            .setColor(0x2ECC71)
            .setFooter({ text: `Giveaway ended` });
    }
};

const endGiveaway = async (channelId, msgId) => {
    const gw = db.giveaways[msgId];
    if (!gw || gw.ended) return;
    try {
        const channel    = await client.channels.fetch(channelId);
        const fetchedMsg = await channel.messages.fetch(msgId);
        const reaction   = fetchedMsg.reactions.cache.get(GIVEAWAY_EMOJI_NAME)
            || fetchedMsg.reactions.cache.find(r => r.emoji.id === GIVEAWAY_EMOJI_ID);

        let entries = [];
        if (reaction) {
            const users = await reaction.users.fetch();
            entries = [...users.filter(u => !u.bot).values()];
        }

        let winnerMentions = 'No valid entries';
        if (entries.length > 0) {
            const count  = Math.min(gw.winners, entries.length);
            const pool   = [...entries];
            const picked = [];
            for (let i = 0; i < count; i++) {
                const idx = Math.floor(Math.random() * pool.length);
                picked.push(pool.splice(idx, 1)[0]);
            }
            winnerMentions = picked.map(u => `<@${u.id}>`).join(', ');

            // Give coins to winners
            for (const winner of picked) {
                const wData = getUserData(winner.id);
                wData.coins += gw.coinsAmount;
            }
            saveData();

            channel.send(`${giveawayEmoji} Congratulations ${winnerMentions}! You won **${gw.prize}** and the coins have been added to your balance!`);
            logger(`Giveaway ended: "${gw.prize}" — Winners: ${picked.map(u => u.tag).join(', ')}`);
        } else {
            channel.send(`❌ No valid entries for the giveaway **${gw.prize}**.`);
        }

        gw.ended           = true;
        gw.winnerMentions  = winnerMentions;
        gw.totalEntries    = entries.length;
        saveData();

        await fetchedMsg.edit({ embeds: [buildGiveawayEmbed(gw, false)] });
    } catch (err) {
        logger(`Giveaway end error: ${err.message}`);
    }
};

// Resume giveaways on restart
client.once('ready', async () => {
    logger(`Bot Active — ${client.user.tag} | Commands Loaded.`);
    for (const [msgId, gw] of Object.entries(db.giveaways)) {
        if (gw.ended) continue;
        const remaining = gw.endsAt - Date.now();
        if (remaining <= 0) {
            endGiveaway(gw.channelId, msgId);
        } else {
            setTimeout(() => endGiveaway(gw.channelId, msgId), remaining);
            logger(`Resumed giveaway: "${gw.prize}" ends in ${formatDuration(remaining)}`);
        }
    }
});

// ─────────────────────────────────────────
//  WELCOME / GOODBYE
// ─────────────────────────────────────────
const sendWelcome = async (member, channel) => {
    const embed = new EmbedBuilder()
        .setTitle(`✨ Welcome to ${member.guild.name}!`)
        .setDescription(
            `Hey ${member}, welcome aboard! 🎉\n` +
            `You are our **#${member.guild.memberCount}** member!\n\n` +
            `> Make sure to check the rules and enjoy your stay!`
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setColor(0x5865F2)
        .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL({ dynamic: true }) });
    channel.send({ embeds: [embed] });
};

const sendGoodbye = async (member, channel) => {
    const embed = new EmbedBuilder()
        .setTitle(`👋 See you later, ${member.user.username}`)
        .setDescription(
            `**${member.user.tag}** has left the server.\n` +
            `We now have **${member.guild.memberCount}** members.\n\n` +
            `> We hope to see you again someday!`
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setColor(0xFF4444)
        .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL({ dynamic: true }) });
    channel.send({ embeds: [embed] });
};

client.on('guildMemberAdd', async (member) => {
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!channel) return;
    await sendWelcome(member, channel);
    logger(`Welcome sent for ${member.user.tag}`);
});

client.on('guildMemberRemove', async (member) => {
    const channel = member.guild.channels.cache.get(GOODBYE_CHANNEL_ID);
    if (!channel) return;
    await sendGoodbye(member, channel);
    logger(`Goodbye sent for ${member.user.tag}`);
});

// ─────────────────────────────────────────
//  ANTI-SPAM & COIN EARN
// ─────────────────────────────────────────
let lastAuthorId    = null;
let consecutiveCount = 0;

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Anti-spam — only counts regular chat messages, NOT commands
    if (!message.content.startsWith(prefix)) {
        if (message.author.id === lastAuthorId) {
            consecutiveCount++;
        } else {
            lastAuthorId     = message.author.id;
            consecutiveCount = 1;
        }
        if (consecutiveCount >= 5) {
            const data = getUserData(message.author.id);
            data.warns  += 1;
            data.coins   = Math.max(0, data.coins - 50);
            saveData();
            consecutiveCount = 0;
            message.channel.send({
                content: `${message.author}`,
                embeds: [
                    new EmbedBuilder()
                        .setTitle('🚫 Anti-Spam Triggered')
                        .setDescription(
                            `Slow down! You've been sending too many consecutive messages.\n\n` +
                            `> You lost **50** ${coinEmoji} and received a warning.`
                        )
                        .addFields({ name: '⚠️ Total Warnings', value: `${data.warns}`, inline: true })
                        .setColor(0xFF0000)
                ]
            });
        }
    }

    // Earn 1 coin per non-command message
    if (!message.content.startsWith(prefix)) {
        const data = getUserData(message.author.id);
        data.coins += 1;
        saveData();
    }

    if (!message.content.startsWith(prefix)) return;

    const args    = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const hasPerms = message.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                     message.member.roles.cache.some(r => r.name === 'bot perms');

    try {

    // ═══════════════════════════════════════
    //  HELP
    // ═══════════════════════════════════════

    if (command === 'help') {
        const sub = args[0]?.toLowerCase();

        if (sub === 'economy') {
            return message.channel.send({ embeds: [
                new EmbedBuilder()
                    .setTitle('💰 Economy Commands')
                    .setColor(0xF1C40F)
                    .addFields(
                        { name: '`v!coins [@user]`',          value: 'Check coin balance.' },
                        { name: '`v!bal [@user]`',            value: 'Alias for `v!coins`.' },
                        { name: '`v!work`',                   value: 'Work for coins. (1hr cooldown)' },
                        { name: '`v!daily`',                  value: 'Claim daily reward. (24hr cooldown)' },
                        { name: '`v!gamble <amount>`',        value: 'Gamble your coins. Min 10.' },
                        { name: '`v!transfer @user <amount>`', value: 'Send coins to another user.' },
                        { name: '`v!leaderboard`',            value: 'Top 10 richest. Alias: `v!lb`' },
                    )
                    .setFooter({ text: 'v!help for all categories' })
            ]});
        }

        if (sub === 'info') {
            return message.channel.send({ embeds: [
                new EmbedBuilder()
                    .setTitle('ℹ️ Info Commands')
                    .setColor(0x5865F2)
                    .addFields(
                        { name: '`v!serverinfo`',       value: 'Shows server info. Alias: `v!si`' },
                        { name: '`v!userinfo [@user]`', value: 'Shows user info. Alias: `v!ui`' },
                    )
                    .setFooter({ text: 'v!help for all categories' })
            ]});
        }

        if (sub === 'fun') {
            return message.channel.send({ embeds: [
                new EmbedBuilder()
                    .setTitle('🎮 Fun Commands')
                    .setColor(0x9B59B6)
                    .addFields(
                        { name: '`v!8ball <question>`', value: 'Ask the magic 8-ball.' },
                    )
                    .setFooter({ text: 'v!help for all categories' })
            ]});
        }

        // Main help
        message.channel.send({ embeds: [
            new EmbedBuilder()
                .setTitle('📖 Command Menu')
                .setDescription(`Prefix: \`v!\`\nUse \`v!help <category>\` for details.`)
                .addFields(
                    { name: '💰 Economy', value: '`v!help economy`', inline: true },
                    { name: 'ℹ️ Info',    value: '`v!help info`',    inline: true },
                    { name: '🎮 Fun',     value: '`v!help fun`',     inline: true },
                    { name: '🛠️ Staff',   value: '`v!adminhelp`',    inline: true },
                )
                .setColor(0x5865F2)
                .setFooter({ text: 'Use v!adminhelp for staff commands' })
        ]});
    }

    // ═══════════════════════════════════════
    //  ECONOMY
    // ═══════════════════════════════════════

    if (command === 'coins' || command === 'bal') {
        const target = message.mentions.users.first() || message.author;
        const data   = getUserData(target.id);
        const rank   = Object.entries(db.users).sort(([,a],[,b]) => b.coins - a.coins).findIndex(([id]) => id === target.id) + 1;
        message.channel.send({ embeds: [
            new EmbedBuilder()
                .setTitle(`${coinEmoji} ${target.username}'s Wallet`)
                .setDescription(
                    `╔══════════════════════╗\n` +
                    `  ${coinEmoji}  **Coins:** ${data.coins}\n` +
                    `  🏅  **Rank:** #${rank || '?'}\n` +
                    `  ⚠️  **Warns:** ${data.warns}\n` +
                    `╚══════════════════════╝`
                )
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .setColor(0xF1C40F)
        ]});
    }

    if (command === 'work') {
        const data      = getUserData(message.author.id);
        const cooldown  = 3600000;
        const remaining = cooldown - (Date.now() - data.lastWork);
        if (remaining > 0) {
            const mins = Math.ceil(remaining / 60000);
            return message.reply({ embeds: [
                new EmbedBuilder().setTitle('⏳ On Cooldown').setDescription(`You can work again in **${mins} minute(s)**.`).setColor(0xFF9900)
            ]});
        }
        const earned   = Math.floor(Math.random() * 100) + 10;
        data.coins    += earned;
        data.lastWork  = Date.now();
        saveData();
        message.channel.send({ embeds: [
            new EmbedBuilder()
                .setTitle('💼 Work Complete!')
                .setDescription(`You earned **${earned}** ${coinEmoji}!\n> Balance: **${data.coins}** ${coinEmoji}`)
                .setColor(0x2ECC71)
        ]});
    }

    if (command === 'daily') {
        const data      = getUserData(message.author.id);
        const cooldown  = 86400000;
        const remaining = cooldown - (Date.now() - data.lastDaily);
        if (remaining > 0) {
            const hours = Math.ceil(remaining / 3600000);
            return message.reply({ embeds: [
                new EmbedBuilder().setTitle('⏳ Already Claimed').setDescription(`Come back in **${hours} hour(s)** for your next daily!`).setColor(0xFF9900)
            ]});
        }
        const earned    = Math.floor(Math.random() * 11) + 10;
        data.coins     += earned;
        data.lastDaily  = Date.now();
        saveData();
        message.channel.send({ embeds: [
            new EmbedBuilder()
                .setTitle('🎁 Daily Reward!')
                .setDescription(`You claimed **${earned}** ${coinEmoji}!\n> Balance: **${data.coins}** ${coinEmoji}`)
                .setColor(0xF1C40F)
        ]});
    }

    if (command === 'gamble') {
        const amount = parseInt(args[0]);
        const data   = getUserData(message.author.id);
        if (isNaN(amount) || amount < 10)
            return message.reply({ embeds: [new EmbedBuilder().setDescription('❌ Minimum gamble is **10** coins.').setColor(0xFF0000)] });
        if (data.coins < amount)
            return message.reply({ embeds: [new EmbedBuilder().setDescription('❌ You don\'t have enough coins.').setColor(0xFF0000)] });
        const win   = Math.random() > 0.5;
        data.coins += win ? amount : -amount;
        saveData();
        message.reply({ embeds: [
            new EmbedBuilder()
                .setTitle(win ? '🎲 You Won!' : '🎲 You Lost!')
                .setDescription(`You ${win ? 'won' : 'lost'} **${amount}** ${coinEmoji}!\n> Balance: **${data.coins}** ${coinEmoji}`)
                .setColor(win ? 0x2ECC71 : 0xFF0000)
        ]});
    }

    if (command === 'transfer') {
        const target = message.mentions.users.first();
        const amount = parseInt(args[1]);
        if (!target)                          return message.reply('❌ Mention a user.');
        if (target.id === message.author.id)  return message.reply('❌ You can\'t transfer to yourself.');
        if (target.bot)                       return message.reply('❌ You can\'t transfer to a bot.');
        if (isNaN(amount) || amount < 1)      return message.reply('❌ Enter a valid amount.');
        const senderData = getUserData(message.author.id);
        if (senderData.coins < amount)        return message.reply('❌ Not enough coins.');
        const targetData   = getUserData(target.id);
        senderData.coins  -= amount;
        targetData.coins  += amount;
        saveData();
        message.channel.send({ embeds: [
            new EmbedBuilder()
                .setTitle(`${coinEmoji} Transfer Complete`)
                .setDescription(`**${message.author.username}** sent **${amount}** ${coinEmoji} to **${target.username}**.`)
                .addFields(
                    { name: 'Your Balance',             value: `${senderData.coins} ${coinEmoji}`, inline: true },
                    { name: `${target.username}'s Bal`, value: `${targetData.coins} ${coinEmoji}`, inline: true },
                )
                .setColor(0x2ECC71)
        ]});
    }

    if (command === 'leaderboard' || command === 'lb') {
        const sorted = Object.entries(db.users)
            .sort(([, a], [, b]) => b.coins - a.coins)
            .slice(0, 10);
        const medals = ['🥇', '🥈', '🥉'];
        const lines  = sorted.map(([id, data], i) =>
            `${medals[i] || `**#${i + 1}**`} <@${id}> — **${data.coins}** ${coinEmoji}`
        ).join('\n');
        message.channel.send({ embeds: [
            new EmbedBuilder()
                .setTitle(`${coinEmoji} Coin Leaderboard`)
                .setDescription(lines || 'No data yet.')
                .setColor(0xF1C40F)
        ]});
    }

    // ═══════════════════════════════════════
    //  INFO
    // ═══════════════════════════════════════

    if (command === 'serverinfo' || command === 'si') {
        const guild  = message.guild;
        await guild.members.fetch();
        const bots   = guild.members.cache.filter(m => m.user.bot).size;
        const humans = guild.memberCount - bots;
        message.channel.send({ embeds: [
            new EmbedBuilder()
                .setTitle(`🏠 ${guild.name}`)
                .setThumbnail(guild.iconURL({ dynamic: true, size: 512 }))
                .addFields(
                    { name: '👑 Owner',        value: `<@${guild.ownerId}>`,                                   inline: true },
                    { name: '📅 Created',      value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,    inline: true },
                    { name: '👥 Members',      value: `${guild.memberCount} (${humans} humans, ${bots} bots)`, inline: true },
                    { name: '💬 Channels',     value: `${guild.channels.cache.size}`,                          inline: true },
                    { name: '🎭 Roles',        value: `${guild.roles.cache.size}`,                             inline: true },
                    { name: '😀 Emojis',       value: `${guild.emojis.cache.size}`,                            inline: true },
                    { name: '🚀 Boost Level',  value: `Level ${guild.premiumTier}`,                            inline: true },
                    { name: '💎 Boosts',       value: `${guild.premiumSubscriptionCount || 0}`,                inline: true },
                    { name: '🔒 Verification', value: `${guild.verificationLevel}`,                            inline: true },
                )
                .setColor(0x5865F2)
                .setFooter({ text: `ID: ${guild.id}` })
        ]});
    }

    if (command === 'userinfo' || command === 'ui') {
        const target = message.mentions.members.first() || message.member;
        const roles  = target.roles.cache
            .filter(r => r.id !== message.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(r => r.toString()).slice(0, 5).join(', ') || 'None';
        message.channel.send({ embeds: [
            new EmbedBuilder()
                .setTitle(`👤 ${target.user.tag}`)
                .setThumbnail(target.user.displayAvatarURL({ dynamic: true, size: 512 }))
                .addFields(
                    { name: '🆔 ID',             value: target.id,                                               inline: true },
                    { name: '📅 Joined',          value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:D>`,   inline: true },
                    { name: '🎂 Account Created', value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:D>`, inline: true },
                    { name: '🤖 Bot?',            value: target.user.bot ? 'Yes' : 'No',                         inline: true },
                    { name: '🎭 Top Roles',       value: roles },
                )
                .setColor(target.displayHexColor || 0x5865F2)
        ]});
    }

    // ═══════════════════════════════════════
    //  FUN
    // ═══════════════════════════════════════

    if (command === '8ball') {
        const question = args.join(' ');
        if (!question) return message.reply('❌ Ask a question!');
        const responses = [
            '✅ It is certain.', '✅ Without a doubt.', '✅ Yes, definitely.',
            '✅ Most likely.', '✅ Outlook good.', '✅ Signs point to yes.',
            '🤔 Reply hazy, try again.', '🤔 Ask again later.', '🤔 Cannot predict now.',
            '❌ Don\'t count on it.', '❌ Very doubtful.', '❌ My sources say no.',
            '❌ Outlook not so good.', '❌ Absolutely not.',
        ];
        message.channel.send({ embeds: [
            new EmbedBuilder()
                .setTitle('🎱 Magic 8-Ball')
                .addFields(
                    { name: '❓ Question', value: question },
                    { name: '🎱 Answer',   value: responses[Math.floor(Math.random() * responses.length)] },
                )
                .setColor(0x2C2F33)
        ]});
    }

    // ═══════════════════════════════════════
    //  ADMIN GATE
    // ═══════════════════════════════════════
    if (!hasPerms) return;

    // ═══════════════════════════════════════
    //  ADMIN HELP
    // ═══════════════════════════════════════

    if (command === 'adminhelp') {
        const sub = args[0]?.toLowerCase();

        if (sub === 'economy') {
            return message.channel.send({ embeds: [
                new EmbedBuilder()
                    .setTitle('💰 Admin — Economy')
                    .setColor(0xF1C40F)
                    .addFields(
                        { name: '`v!add coins @user <amt>`',    value: 'Add coins to a user.' },
                        { name: '`v!remove coins @user <amt>`', value: 'Remove coins from a user.' },
                        { name: '`v!reset coins @user`',        value: 'Reset a user\'s coins to 0.' },
                    )
                    .setFooter({ text: 'v!adminhelp for all categories' })
            ]});
        }

        if (sub === 'mod') {
            return message.channel.send({ embeds: [
                new EmbedBuilder()
                    .setTitle('🔨 Admin — Moderation')
                    .setColor(0xFF0000)
                    .addFields(
                        { name: '`v!warn @user`',           value: 'Warn a user.' },
                        { name: '`v!unwarn @user`',         value: 'Remove a warning.' },
                        { name: '`v!warns @user`',          value: 'Check warnings.' },
                        { name: '`v!kick @user [reason]`',  value: 'Kick a user.' },
                        { name: '`v!ban @user [reason]`',   value: 'Ban a user.' },
                        { name: '`v!mute @user [mins]`',    value: 'Timeout a user (default 60m).' },
                        { name: '`v!unmute @user`',         value: 'Remove timeout.' },
                        { name: '`v!setnick @user <name>`', value: 'Set a user\'s nickname.' },
                    )
                    .setFooter({ text: 'v!adminhelp for all categories' })
            ]});
        }

        if (sub === 'channel') {
            return message.channel.send({ embeds: [
                new EmbedBuilder()
                    .setTitle('📢 Admin — Channel')
                    .setColor(0x3498DB)
                    .addFields(
                        { name: '`v!purge <amount>`', value: 'Delete up to 100 messages.' },
                        { name: '`v!purge all`',      value: 'Delete ALL messages in channel.' },
                        { name: '`v!lock`',           value: 'Lock channel from @everyone.' },
                        { name: '`v!unlock`',         value: 'Unlock channel.' },
                    )
                    .setFooter({ text: 'v!adminhelp for all categories' })
            ]});
        }

        if (sub === 'giveaway') {
            return message.channel.send({ embeds: [
                new EmbedBuilder()
                    .setTitle(`${giveawayEmoji} Admin — Giveaway`)
                    .setColor(0xF1C40F)
                    .addFields(
                        { name: '`v!giveaway <time> <coins> [winners]`', value:
                            'Start a giveaway. Winners get coins automatically!\n\n' +
                            '**time formats:** `1s` `1m` `1h` `1hr` `1d` `1day` `1min`\n' +
                            '**coins** — prize amount (required)\n' +
                            '**winners** — optional, default 1\n\n' +
                            '**Examples:**\n' +
                            '`v!giveaway 1h 500` — 1 winner, 500 coins, 1 hour\n' +
                            '`v!giveaway 30m 1000 3` — 3 winners, 1000 coins each, 30 mins\n' +
                            '`v!gw 1d 250` — alias `v!gw` also works!'
                        },
                    )
                    .setFooter({ text: 'v!adminhelp for all categories' })
            ]});
        }

        if (sub === 'system') {
            return message.channel.send({ embeds: [
                new EmbedBuilder()
                    .setTitle('⚙️ Admin — System')
                    .setColor(0x2C2F33)
                    .addFields(
                        { name: '`v!logs`',          value: 'View recent bot logs.' },
                        { name: '`v!test welcome`',  value: 'Test the welcome message.' },
                        { name: '`v!test goodbye`',  value: 'Test the goodbye message.' },
                    )
                    .setFooter({ text: 'v!adminhelp for all categories' })
            ]});
        }

        // Main adminhelp
        message.channel.send({ embeds: [
            new EmbedBuilder()
                .setTitle('🔐 Admin Control Panel')
                .setDescription('Use `v!adminhelp <category>` for details.')
                .setColor(0xFF0000)
                .addFields(
                    { name: '💰 Economy',             value: '`v!adminhelp economy`',  inline: true },
                    { name: '🔨 Moderation',          value: '`v!adminhelp mod`',      inline: true },
                    { name: '📢 Channel',             value: '`v!adminhelp channel`',  inline: true },
                    { name: `${giveawayEmoji} Giveaway`, value: '`v!adminhelp giveaway`', inline: true },
                    { name: '⚙️ System',              value: '`v!adminhelp system`',   inline: true },
                )
        ]});
    }

    // ═══════════════════════════════════════
    //  TEST COMMANDS
    // ═══════════════════════════════════════

    if (command === 'test') {
        const sub = args[0]?.toLowerCase();
        if (sub === 'welcome') {
            const ch = message.guild.channels.cache.get(WELCOME_CHANNEL_ID);
            if (!ch) return message.reply('❌ Welcome channel not found.');
            await sendWelcome(message.member, ch);
            message.reply('✅ Welcome message sent to the welcome channel!');
        } else if (sub === 'goodbye') {
            const ch = message.guild.channels.cache.get(GOODBYE_CHANNEL_ID);
            if (!ch) return message.reply('❌ Goodbye channel not found.');
            await sendGoodbye(message.member, ch);
            message.reply('✅ Goodbye message sent to the goodbye channel!');
        } else {
            message.reply('❌ Usage: `v!test welcome` or `v!test goodbye`');
        }
    }

    // ═══════════════════════════════════════
    //  MODERATION
    // ═══════════════════════════════════════

    if (command === 'purge') {
        if (args[0] === 'all') {
            let deleted = 0, fetched;
            do {
                fetched   = await message.channel.bulkDelete(100, true);
                deleted  += fetched.size;
            } while (fetched.size >= 2);
            const m = await message.channel.send({ embeds: [
                new EmbedBuilder().setTitle('🧹 Purge Complete').setDescription(`Deleted **${deleted}** messages.`).setColor(0xFF4444)
            ]});
            setTimeout(() => m.delete().catch(() => {}), 4000);
        } else {
            const amount = parseInt(args[0]);
            if (isNaN(amount) || amount < 1 || amount > 100)
                return message.reply({ embeds: [new EmbedBuilder().setDescription('❌ Enter 1–100 or use `v!purge all`.').setColor(0xFF0000)] });
            await message.channel.bulkDelete(amount + 1, true);
            const m = await message.channel.send({ embeds: [
                new EmbedBuilder().setTitle('🧹 Purge Complete').setDescription(`Deleted **${amount}** messages.`).setColor(0xFF4444)
            ]});
            setTimeout(() => m.delete().catch(() => {}), 4000);
        }
    }

    if (command === 'mute') {
        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Mention a user.');
        const mins = parseInt(args[1]) || 60;
        await target.timeout(mins * 60 * 1000, `Muted by ${message.author.tag}`);
        message.channel.send({ content: `<@${target.id}>`, embeds: [
            new EmbedBuilder().setTitle('🔇 User Muted').setDescription(`**${target.user.tag}** muted for **${mins} minute(s)**.`).setColor(0xFF9900)
        ]});
    }

    if (command === 'unmute') {
        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Mention a user.');
        await target.timeout(null);
        message.channel.send({ embeds: [
            new EmbedBuilder().setTitle('🔊 User Unmuted').setDescription(`**${target.user.tag}** unmuted.`).setColor(0x2ECC71)
        ]});
    }

    if (command === 'kick') {
        const target = message.mentions.members.first();
        const reason = args.slice(1).join(' ') || 'No reason provided';
        if (!target) return message.reply('❌ Mention a user.');
        await target.kick(reason);
        message.channel.send({ content: `<@${target.id}>`, embeds: [
            new EmbedBuilder().setTitle('👢 User Kicked').setDescription(`**${target.user.tag}** was kicked.\nReason: ${reason}`).setColor(0xFF9900)
        ]});
    }

    if (command === 'ban') {
        const target = message.mentions.members.first();
        const reason = args.slice(1).join(' ') || 'No reason provided';
        if (!target) return message.reply('❌ Mention a user.');
        await target.ban({ reason });
        message.channel.send({ content: `<@${target.id}>`, embeds: [
            new EmbedBuilder().setTitle('🔨 User Banned').setDescription(`**${target.user.tag}** was banned.\nReason: ${reason}`).setColor(0xFF0000)
        ]});
    }

    if (command === 'warn') {
        const target = message.mentions.users.first();
        if (!target) return message.reply('❌ Mention a user.');
        const data = getUserData(target.id);
        data.warns += 1;
        saveData();
        message.channel.send({ content: `<@${target.id}>`, embeds: [
            new EmbedBuilder().setTitle('⚠️ Warning Issued').setDescription(`**${target.tag}** has been warned. Total: **${data.warns}** warning(s).`).setColor(0xFF9900)
        ]});
    }

    if (command === 'unwarn') {
        const target = message.mentions.users.first();
        if (!target) return message.reply('❌ Mention a user.');
        const data = getUserData(target.id);
        data.warns = Math.max(0, data.warns - 1);
        saveData();
        message.channel.send({ embeds: [
            new EmbedBuilder().setTitle('✅ Warning Removed').setDescription(`**${target.tag}** now has **${data.warns}** warning(s).`).setColor(0x2ECC71)
        ]});
    }

    if (command === 'warns') {
        const target = message.mentions.users.first() || message.author;
        const data   = getUserData(target.id);
        message.channel.send({ embeds: [
            new EmbedBuilder().setTitle(`⚠️ Warnings — ${target.username}`).setDescription(`**${data.warns}** warning(s).`).setColor(0xFF9900)
        ]});
    }

    if (command === 'setnick') {
        const target = message.mentions.members.first();
        const nick   = args.slice(1).join(' ');
        if (!target) return message.reply('❌ Mention a user.');
        if (!nick)   return message.reply('❌ Provide a nickname.');
        await target.setNickname(nick);
        message.channel.send({ embeds: [
            new EmbedBuilder().setTitle('✏️ Nickname Changed').setDescription(`**${target.user.tag}**'s nickname → **${nick}**.`).setColor(0x5865F2)
        ]});
    }

    if (command === 'lock') {
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        message.channel.send({ embeds: [
            new EmbedBuilder().setTitle('🔒 Channel Locked').setDescription(`**#${message.channel.name}** locked by ${message.author}.`).setColor(0xFF0000)
        ]});
    }

    if (command === 'unlock') {
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        message.channel.send({ embeds: [
            new EmbedBuilder().setTitle('🔓 Channel Unlocked').setDescription(`**#${message.channel.name}** unlocked by ${message.author}.`).setColor(0x2ECC71)
        ]});
    }

    // ═══════════════════════════════════════
    //  ADMIN ECONOMY
    // ═══════════════════════════════════════

    if (command === 'add' && args[0] === 'coins') {
        const target = message.mentions.users.first();
        const amt    = parseInt(args[2]);
        if (!target || isNaN(amt)) return message.reply('❌ Usage: `v!add coins @user <amount>`');
        getUserData(target.id).coins += amt;
        saveData();
        message.channel.send({ embeds: [
            new EmbedBuilder().setTitle('✅ Coins Added').setDescription(`Added **${amt}** ${coinEmoji} to **${target.username}**.`).setColor(0x2ECC71)
        ]});
    }

    if (command === 'remove' && args[0] === 'coins') {
        const target = message.mentions.users.first();
        const amt    = parseInt(args[2]);
        if (!target || isNaN(amt)) return message.reply('❌ Usage: `v!remove coins @user <amount>`');
        const data = getUserData(target.id);
        data.coins = Math.max(0, data.coins - amt);
        saveData();
        message.channel.send({ embeds: [
            new EmbedBuilder().setTitle('✅ Coins Removed').setDescription(`Removed **${amt}** ${coinEmoji} from **${target.username}**.`).setColor(0xFF9900)
        ]});
    }

    if (command === 'reset' && args[0] === 'coins') {
        const target = message.mentions.users.first();
        if (!target) return message.reply('❌ Mention a user.');
        getUserData(target.id).coins = 0;
        saveData();
        message.channel.send({ embeds: [
            new EmbedBuilder().setTitle('🔄 Coins Reset').setDescription(`**${target.username}**'s coins reset to 0.`).setColor(0xFF9900)
        ]});
    }

    // ═══════════════════════════════════════
    //  LOGS
    // ═══════════════════════════════════════

    if (command === 'logs') {
        message.channel.send({ embeds: [
            new EmbedBuilder()
                .setTitle('🖥️ Bot Logs')
                .setDescription(`\`\`\`txt\n${botLogs.join('\n') || 'Empty'}\n\`\`\``)
                .setColor(0x2C2F33)
        ]});
    }

    // ═══════════════════════════════════════
    //  GIVEAWAY  —  v!giveaway <time> <coins> [winners]
    //               v!gw       <time> <coins> [winners]
    // ═══════════════════════════════════════

    if (command === 'giveaway' || command === 'gw') {
        const timeArg    = args[0];
        const coinsArg   = parseInt(args[1]);
        const winnersArg = parseInt(args[2]) || 1;
        const durationMs = parseTime(timeArg);

        if (!durationMs)
            return message.reply({ embeds: [
                new EmbedBuilder()
                    .setDescription('❌ Invalid time format.\n**Valid:** `1s`, `1m`, `1min`, `1h`, `1hr`, `1d`, `1day`\n**Usage:** `v!giveaway <time> <coins> [winners]`')
                    .setColor(0xFF0000)
            ]});

        if (isNaN(coinsArg) || coinsArg < 1)
            return message.reply({ embeds: [
                new EmbedBuilder()
                    .setDescription('❌ Provide a valid coin amount.\n**Usage:** `v!giveaway <time> <coins> [winners]`')
                    .setColor(0xFF0000)
            ]});

        if (winnersArg < 1 || winnersArg > 20)
            return message.reply({ embeds: [
                new EmbedBuilder().setDescription('❌ Winners must be between 1 and 20.').setColor(0xFF0000)
            ]});

        const endsAt = Date.now() + durationMs;
        const prize  = `${coinEmoji} ${coinsArg} ${coinEmoji}`;

        const gwData = {
            prize,
            coinsAmount: coinsArg,
            hostId:      message.author.id,
            channelId:   message.channel.id,
            winners:     winnersArg,
            endsAt,
            startedAt:   Date.now(),
            ended:       false,
        };

        await message.delete().catch(() => {});
        const gMsg = await message.channel.send({ embeds: [buildGiveawayEmbed(gwData, true)] });

        // React with custom giveaway emoji
        try {
            await gMsg.react(`${GIVEAWAY_EMOJI_NAME}:${GIVEAWAY_EMOJI_ID}`);
        } catch {
            await gMsg.react('🎉'); // fallback if emoji not found
        }

        gwData.messageId    = gMsg.id;
        db.giveaways[gMsg.id] = gwData;
        saveData();

        logger(`Giveaway started: ${coinsArg} coins, ${winnersArg} winner(s), ends in ${formatDuration(durationMs)} by ${message.author.tag}`);
        setTimeout(() => endGiveaway(message.channel.id, gMsg.id), durationMs);
    }

    } catch (err) {
        logger(`ERR: ${command} | ${err.message}`);
        message.channel.send({ embeds: [
            new EmbedBuilder().setDescription(`❌ Error: \`${err.message}\``).setColor(0xFF0000)
        ]});
    }
});

client.login(process.env.TOKEN);
