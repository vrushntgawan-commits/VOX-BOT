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

// ─────────────────────────────────────────
//  CONSTANTS — all defined first
// ─────────────────────────────────────────
const prefix          = 'v!';
const coinEmoji       = '<a:coin:1475856179497275594>';
const giveawayEmoji   = '<:giveaway:1475844346258522273>';
const GIVEAWAY_EMOJI_ID   = '1475844346258522273';
const GIVEAWAY_EMOJI_NAME = 'giveaway';

const WELCOME_CHANNEL_ID = '1475548830635130990';
const GOODBYE_CHANNEL_ID = '1475913121951387759';
const VOUCH_CHANNEL_ID   = '1475548871483723887';
const VOUCH_EMOJI_ID     = '1475862816861720588';
const STAFF_CHANNEL_ID   = '1475548875376033854';
const PROMO_CHANNEL_ID   = '1475548886218309692';
const DEMO_CHANNEL_ID    = '1475548887434526832';

const STAFF_ROLES = [
    'Founder', 'Co-Founder', 'Head of all Staff', 'Server Manager',
    'Head Administrator', 'Senior Administrator', 'Administrator', 'Junior Administrator',
    'Head Moderator', 'Senior Moderator', 'Moderator', 'Trial Moderator',
];

// ─────────────────────────────────────────
//  DATABASE
// ─────────────────────────────────────────
let db = { users: {}, giveaways: {}, staffMessageId: null };
if (fs.existsSync('./database.json')) {
    try {
        const loaded      = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
        db.users          = loaded.users          || {};
        db.giveaways      = loaded.giveaways      || {};
        db.staffMessageId = loaded.staffMessageId || null;
    } catch { console.log('DB load error, starting fresh.'); }
}
const saveData = () => fs.writeFileSync('./database.json', JSON.stringify(db, null, 2));

// ─────────────────────────────────────────
//  LOGGER
// ─────────────────────────────────────────
const botLogs = [];
const logger = (msg) => {
    const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
    botLogs.push(entry);
    console.log(entry);
    if (botLogs.length > 50) botLogs.shift();
};

// ─────────────────────────────────────────
//  USER DATA
// ─────────────────────────────────────────
const getUserData = (id) => {
    if (!db.users[id]) db.users[id] = { coins: 0, warns: 0, lastWork: 0, lastDaily: 0 };
    return db.users[id];
};

// ─────────────────────────────────────────
//  TIME PARSER
// ─────────────────────────────────────────
const parseTime = (str) => {
    if (!str) return null;
    const match = str.match(/^(\d+)(s|sec|m|min|h|hr|hour|d|day)s?$/i);
    if (!match) return null;
    const val = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 's' || unit === 'sec')                   return val * 1000;
    if (unit === 'm' || unit === 'min')                   return val * 60000;
    if (unit === 'h' || unit === 'hr' || unit === 'hour') return val * 3600000;
    if (unit === 'd' || unit === 'day')                   return val * 86400000;
    return null;
};

const formatDuration = (ms) => {
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
};

// ─────────────────────────────────────────
//  ROLE FINDER — fuzzy match by name
// ─────────────────────────────────────────
const findRole = (guild, name) => {
    if (!name) return null;
    const lower = name.toLowerCase().trim();
    return guild.roles.cache.find(r => r.name.toLowerCase() === lower)
        || guild.roles.cache.find(r => r.name.toLowerCase().includes(lower))
        || null;
};

// ─────────────────────────────────────────
//  STAFF LIST
// ─────────────────────────────────────────
const buildStaffEmbed = async (guild) => {
    await guild.members.fetch();
    const fields = [];
    for (const roleName of STAFF_ROLES) {
        const role = guild.roles.cache.find(r => r.name === roleName);
        if (!role) {
            fields.push({ name: roleName, value: '_Role not found_', inline: false });
            continue;
        }
        const members = role.members.size > 0
            ? role.members.map(m => `<@${m.id}>`).join('\n')
            : '_None_';
        fields.push({ name: `${roleName} (${role.members.size})`, value: members, inline: false });
    }
    return new EmbedBuilder()
        .setTitle('👥 Staff List')
        .setDescription(`**${guild.name}** Staff Team`)
        .addFields(fields)
        .setColor(0x5865F2)
        .setFooter({ text: `Last updated: ${new Date().toLocaleString()}` });
};

const updateStaffList = async () => {
    try {
        const channel = await client.channels.fetch(STAFF_CHANNEL_ID);
        const embed   = await buildStaffEmbed(channel.guild);

        // Always try to edit the saved message ID first
        if (db.staffMessageId) {
            try {
                const existing = await channel.messages.fetch(db.staffMessageId);
                await existing.edit({ embeds: [embed] });
                logger(`Staff list edited (msg: ${db.staffMessageId})`);
                return;
            } catch (e) {
                logger(`Saved message not found (${e.message}), will post fresh.`);
                db.staffMessageId = null;
                saveData();
            }
        }

        // No saved message — scan channel for bot's own messages to reuse
        const recent = await channel.messages.fetch({ limit: 20 });
        const botMsg = recent.find(m => m.author.id === client.user.id && m.embeds.length > 0);
        if (botMsg) {
            await botMsg.edit({ embeds: [embed] });
            db.staffMessageId = botMsg.id;
            saveData();
            logger(`Staff list found & edited existing bot message (${botMsg.id})`);
            return;
        }

        // Nothing found — clear and post fresh
        await Promise.all(recent.map(m => m.delete().catch(() => {})));
        const sent = await channel.send({ embeds: [embed] });
        db.staffMessageId = sent.id;
        saveData();
        logger(`Staff list posted fresh (msg: ${sent.id})`);
    } catch (err) {
        logger(`Staff list error: ${err.message}`);
    }
};

// ─────────────────────────────────────────
//  GIVEAWAY HELPERS
// ─────────────────────────────────────────
const buildGiveawayEmbed = (gw, live = true) => {
    const ts = Math.floor(gw.endsAt / 1000);
    if (live) {
        return new EmbedBuilder()
            .setTitle(`${giveawayEmoji}  G I V E A W A Y  ${giveawayEmoji}`)
            .setDescription(
                `## 🎁 ${gw.prize}\n\n` +
                `> React with ${giveawayEmoji} below to enter!\n\n` +
                `**⏰ Ends:** <t:${ts}:R>  *(<t:${ts}:f>)*\n` +
                `**🏆 Winners:** ${gw.winners}\n` +
                `**⏱️ Duration:** ${formatDuration(gw.endsAt - gw.startedAt)}\n` +
                `**🎟️ Hosted by:** <@${gw.hostId}>`
            )
            .setColor(0xF1C40F)
            .setFooter({ text: '🎉 Good luck! • Ends' });
    }
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
        .setFooter({ text: 'Giveaway ended' });
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
            const pool = [...entries], picked = [];
            for (let i = 0; i < Math.min(gw.winners, entries.length); i++) {
                const idx = Math.floor(Math.random() * pool.length);
                picked.push(pool.splice(idx, 1)[0]);
            }
            winnerMentions = picked.map(u => `<@${u.id}>`).join(', ');
            for (const w of picked) { const d = getUserData(w.id); d.coins += gw.coinsAmount; }
            saveData();
            channel.send(`${giveawayEmoji} Congratulations ${winnerMentions}! You won **${gw.prize}** — coins added to your balance!`);
            logger(`GW ended: "${gw.prize}" — Winners: ${picked.map(u => u.tag).join(', ')}`);
        } else {
            channel.send(`❌ No valid entries for **${gw.prize}**.`);
        }

        gw.ended = true; gw.winnerMentions = winnerMentions; gw.totalEntries = entries.length;
        saveData();
        await fetchedMsg.edit({ embeds: [buildGiveawayEmbed(gw, false)] });
    } catch (err) { logger(`GW end error: ${err.message}`); }
};

// ─────────────────────────────────────────
//  WELCOME / GOODBYE
// ─────────────────────────────────────────
const sendWelcome = async (member, channel) => {
    channel.send({ embeds: [new EmbedBuilder()
        .setTitle(`✨ Welcome to ${member.guild.name}!`)
        .setDescription(`Hey ${member}, welcome aboard! 🎉\nYou are our **#${member.guild.memberCount}** member!\n\n> Make sure to check the rules and enjoy your stay!`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setColor(0x5865F2)
        .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL({ dynamic: true }) })
    ]});
};

const sendGoodbye = async (member, channel) => {
    channel.send({ embeds: [new EmbedBuilder()
        .setTitle(`👋 Goodbye, ${member.user.username}`)
        .setDescription(`**${member.user.tag}** has left.\nWe now have **${member.guild.memberCount}** members.\n\n> We hope to see you again!`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setColor(0xFF4444)
        .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL({ dynamic: true }) })
    ]});
};

// ─────────────────────────────────────────
//  READY
// ─────────────────────────────────────────
client.once('ready', async () => {
    logger(`Bot Active — ${client.user.tag}`);
    // Resume giveaways
    for (const [msgId, gw] of Object.entries(db.giveaways)) {
        if (gw.ended) continue;
        const rem = gw.endsAt - Date.now();
        if (rem <= 0) endGiveaway(gw.channelId, msgId);
        else { setTimeout(() => endGiveaway(gw.channelId, msgId), rem); logger(`Resumed GW: "${gw.prize}" in ${formatDuration(rem)}`); }
    }
    // Staff list after 5s then every hour
    setTimeout(async () => { await updateStaffList(); setInterval(updateStaffList, 3600000); }, 5000);
});

client.on('guildMemberAdd',    async (m) => { const ch = m.guild.channels.cache.get(WELCOME_CHANNEL_ID); if (ch) { await sendWelcome(m, ch); logger(`Welcome: ${m.user.tag}`); } });
client.on('guildMemberRemove', async (m) => { const ch = m.guild.channels.cache.get(GOODBYE_CHANNEL_ID); if (ch) { await sendGoodbye(m, ch); logger(`Goodbye: ${m.user.tag}`); } });

// Vouch auto-react
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || msg.channel.id !== VOUCH_CHANNEL_ID) return;
    try { const e = msg.guild.emojis.cache.get(VOUCH_EMOJI_ID); if (e) await msg.react(e); } catch {}
});

// ─────────────────────────────────────────
//  ANTI-SPAM + COINS + COMMANDS
// ─────────────────────────────────────────
let lastAuthorId = null, consecutiveCount = 0;

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Anti-spam (chat only, not commands)
    if (!message.content.startsWith(prefix)) {
        const isStaff = message.member && (
            message.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
            message.member.roles.cache.some(r => STAFF_ROLES.includes(r.name) || r.name === 'bot perms')
        );

        if (message.author.id === lastAuthorId) consecutiveCount++;
        else { lastAuthorId = message.author.id; consecutiveCount = 1; }

        if (consecutiveCount >= 5 && !isStaff) {
            const d = getUserData(message.author.id);
            d.warns++; d.coins = Math.max(0, d.coins - 50); saveData(); consecutiveCount = 0;
            message.channel.send({ content: `${message.author}`, embeds: [new EmbedBuilder()
                .setTitle('🚫 Anti-Spam').setColor(0xFF0000)
                .setDescription(`Too many consecutive messages!\n> Lost **50** ${coinEmoji} and received a warning.`)
                .addFields({ name: '⚠️ Warnings', value: `${d.warns}`, inline: true })
            ]});
        } else if (consecutiveCount >= 5 && isStaff) {
            consecutiveCount = 0; // reset silently for staff
        }

        // Earn coin
        const d = getUserData(message.author.id);
        d.coins++; saveData();
        return;
    }

    const args    = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const hasPerms = message.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                     message.member.roles.cache.some(r => r.name === 'bot perms');

    try {

    // ═══════════════════════════════════════
    //  PUBLIC COMMANDS
    // ═══════════════════════════════════════

    if (command === 'help') {
        const sub = args[0]?.toLowerCase();
        if (sub === 'economy') return message.channel.send({ embeds: [new EmbedBuilder().setTitle('💰 Economy').setColor(0xF1C40F).addFields(
            { name: '`v!coins [@user]`', value: 'Check balance.' },
            { name: '`v!work`', value: 'Work for coins. (1hr)' },
            { name: '`v!daily`', value: 'Daily reward. (24hr)' },
            { name: '`v!gamble <amt>`', value: 'Gamble coins. Min 10.' },
            { name: '`v!transfer @user <amt>`', value: 'Send coins.' },
            { name: '`v!leaderboard`', value: 'Top 10 richest.' },
        ).setFooter({ text: 'v!help for categories' })]});

        if (sub === 'info') return message.channel.send({ embeds: [new EmbedBuilder().setTitle('ℹ️ Info').setColor(0x5865F2).addFields(
            { name: '`v!serverinfo`', value: 'Server info.' },
            { name: '`v!userinfo [@user]`', value: 'User info.' },
        ).setFooter({ text: 'v!help for categories' })]});

        if (sub === 'fun') return message.channel.send({ embeds: [new EmbedBuilder().setTitle('🎮 Fun').setColor(0x9B59B6).addFields(
            { name: '`v!8ball <q>`', value: 'Ask the 8-ball.' },
        ).setFooter({ text: 'v!help for categories' })]});

        message.channel.send({ embeds: [new EmbedBuilder().setTitle('📖 Command Menu').setColor(0x5865F2)
            .setDescription('Prefix: `v!` — Use `v!help <category>` for details.')
            .addFields(
                { name: '💰 Economy', value: '`v!help economy`', inline: true },
                { name: 'ℹ️ Info',    value: '`v!help info`',    inline: true },
                { name: '🎮 Fun',     value: '`v!help fun`',     inline: true },
                { name: '🛠️ Staff',   value: '`v!adminhelp`',    inline: true },
            )
        ]});
    }

    if (command === 'coins' || command === 'bal') {
        const target = message.mentions.users.first() || message.author;
        const data   = getUserData(target.id);
        await message.guild.members.fetch();
        const nonAdmin = Object.entries(db.users).filter(([id]) => {
            const m = message.guild.members.cache.get(id);
            return m && !m.permissions.has(PermissionsBitField.Flags.Administrator) && !m.roles.cache.some(r => r.name === 'bot perms');
        });
        const rank = nonAdmin.sort(([,a],[,b]) => b.coins - a.coins).findIndex(([id]) => id === target.id) + 1;
        message.channel.send({ embeds: [new EmbedBuilder()
            .setTitle('💰 Wallet')
            .setDescription(`**User:** ${target}\n**Coins:** ${data.coins} ${coinEmoji}\n**Rank:** #${rank || 'N/A'}\n**Warns:** ${data.warns} ⚠️`)
            .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }))
            .setColor(0xF1C40F).setFooter({ text: target.tag })
        ]});
    }

    if (command === 'work') {
        const data = getUserData(message.author.id);
        const rem  = 3600000 - (Date.now() - data.lastWork);
        if (rem > 0) return message.reply({ embeds: [new EmbedBuilder().setTitle('⏳ Cooldown').setDescription(`Work again in **${Math.ceil(rem/60000)} min**.`).setColor(0xFF9900)] });
        const earned = Math.floor(Math.random() * 100) + 10;
        data.coins += earned; data.lastWork = Date.now(); saveData();
        message.channel.send({ embeds: [new EmbedBuilder().setTitle('💼 Work Complete!').setColor(0x2ECC71)
            .setDescription(`You earned **${earned}** ${coinEmoji}!\n> Balance: **${data.coins}** ${coinEmoji}`)] });
    }

    if (command === 'daily') {
        const data = getUserData(message.author.id);
        const rem  = 86400000 - (Date.now() - data.lastDaily);
        if (rem > 0) return message.reply({ embeds: [new EmbedBuilder().setTitle('⏳ Already Claimed').setDescription(`Come back in **${Math.ceil(rem/3600000)} hr(s)**.`).setColor(0xFF9900)] });
        const earned = Math.floor(Math.random() * 11) + 10;
        data.coins += earned; data.lastDaily = Date.now(); saveData();
        message.channel.send({ embeds: [new EmbedBuilder().setTitle('🎁 Daily!').setColor(0xF1C40F)
            .setDescription(`You claimed **${earned}** ${coinEmoji}!\n> Balance: **${data.coins}** ${coinEmoji}`)] });
    }

    if (command === 'gamble') {
        const amt  = parseInt(args[0]);
        const data = getUserData(message.author.id);
        if (isNaN(amt) || amt < 10) return message.reply({ embeds: [new EmbedBuilder().setDescription('❌ Min gamble is **10** coins.').setColor(0xFF0000)] });
        if (data.coins < amt)       return message.reply({ embeds: [new EmbedBuilder().setDescription('❌ Not enough coins.').setColor(0xFF0000)] });
        const win = Math.random() > 0.5;
        data.coins += win ? amt : -amt; saveData();
        message.reply({ embeds: [new EmbedBuilder()
            .setTitle(win ? '🎲 You Won!' : '🎲 You Lost!')
            .setDescription(`You ${win ? 'won' : 'lost'} **${amt}** ${coinEmoji}!\n> Balance: **${data.coins}** ${coinEmoji}`)
            .setColor(win ? 0x2ECC71 : 0xFF0000)
        ]});
    }

    if (command === 'transfer') {
        const target = message.mentions.users.first();
        const amt    = parseInt(args[1]);
        if (!target)                         return message.reply('❌ Mention a user.');
        if (target.id === message.author.id) return message.reply('❌ Cannot transfer to yourself.');
        if (target.bot)                      return message.reply('❌ Cannot transfer to a bot.');
        if (isNaN(amt) || amt < 1)           return message.reply('❌ Enter a valid amount.');
        const sData = getUserData(message.author.id);
        if (sData.coins < amt)               return message.reply('❌ Not enough coins.');
        const tData = getUserData(target.id);
        sData.coins -= amt; tData.coins += amt; saveData();
        message.channel.send({ embeds: [new EmbedBuilder().setTitle(`${coinEmoji} Transfer Complete`).setColor(0x2ECC71)
            .setDescription(`**${message.author.username}** sent **${amt}** ${coinEmoji} to **${target.username}**.`)
            .addFields(
                { name: 'Your Balance',              value: `${sData.coins} ${coinEmoji}`, inline: true },
                { name: `${target.username}'s Bal`,  value: `${tData.coins} ${coinEmoji}`, inline: true },
            )
        ]});
    }

    if (command === 'leaderboard' || command === 'lb') {
        await message.guild.members.fetch();
        const sorted = Object.entries(db.users)
            .filter(([id]) => { const m = message.guild.members.cache.get(id); return m && !m.permissions.has(PermissionsBitField.Flags.Administrator) && !m.roles.cache.some(r => r.name === 'bot perms'); })
            .sort(([,a],[,b]) => b.coins - a.coins).slice(0, 10);
        const medals = ['🥇','🥈','🥉'];
        const lines  = sorted.map(([id, d], i) => `${medals[i] || `**#${i+1}**`} <@${id}> — **${d.coins}** ${coinEmoji}`).join('\n');
        message.channel.send({ embeds: [new EmbedBuilder().setTitle(`${coinEmoji} Leaderboard`).setDescription(lines || 'No data yet.').setColor(0xF1C40F)] });
    }

    if (command === 'serverinfo' || command === 'si') {
        const g = message.guild; await g.members.fetch();
        const bots = g.members.cache.filter(m => m.user.bot).size;
        message.channel.send({ embeds: [new EmbedBuilder().setTitle(`🏠 ${g.name}`).setColor(0x5865F2)
            .setThumbnail(g.iconURL({ dynamic: true, size: 512 }))
            .setFooter({ text: `ID: ${g.id}` })
            .addFields(
                { name: '👑 Owner',    value: `<@${g.ownerId}>`, inline: true },
                { name: '📅 Created', value: `<t:${Math.floor(g.createdTimestamp/1000)}:D>`, inline: true },
                { name: '👥 Members', value: `${g.memberCount} (${g.memberCount-bots} humans, ${bots} bots)`, inline: true },
                { name: '💬 Channels',value: `${g.channels.cache.size}`, inline: true },
                { name: '🎭 Roles',   value: `${g.roles.cache.size}`, inline: true },
                { name: '🚀 Boosts',  value: `Level ${g.premiumTier} (${g.premiumSubscriptionCount||0} boosts)`, inline: true },
            )
        ]});
    }

    if (command === 'userinfo' || command === 'ui') {
        const target = message.mentions.members.first() || message.member;
        const roles  = target.roles.cache.filter(r => r.id !== message.guild.id).sort((a,b) => b.position - a.position).map(r => r.toString()).slice(0,5).join(', ') || 'None';
        message.channel.send({ embeds: [new EmbedBuilder().setTitle(`👤 ${target.user.tag}`).setColor(target.displayHexColor || 0x5865F2)
            .setThumbnail(target.user.displayAvatarURL({ dynamic: true, size: 512 }))
            .addFields(
                { name: '🆔 ID',            value: target.id, inline: true },
                { name: '📅 Joined',        value: `<t:${Math.floor(target.joinedTimestamp/1000)}:D>`, inline: true },
                { name: '🎂 Created',       value: `<t:${Math.floor(target.user.createdTimestamp/1000)}:D>`, inline: true },
                { name: '🤖 Bot?',          value: target.user.bot ? 'Yes' : 'No', inline: true },
                { name: '🎭 Top Roles',     value: roles },
            )
        ]});
    }

    if (command === '8ball') {
        const q = args.join(' ');
        if (!q) return message.reply('❌ Ask a question!');
        const answers = ['✅ It is certain.','✅ Without a doubt.','✅ Yes, definitely.','✅ Most likely.','✅ Outlook good.','✅ Signs point to yes.','🤔 Reply hazy, try again.','🤔 Ask again later.','🤔 Cannot predict now.','❌ Don\'t count on it.','❌ Very doubtful.','❌ My sources say no.','❌ Outlook not so good.','❌ Absolutely not.'];
        message.channel.send({ embeds: [new EmbedBuilder().setTitle('🎱 Magic 8-Ball').setColor(0x2C2F33)
            .addFields({ name: '❓ Question', value: q }, { name: '🎱 Answer', value: answers[Math.floor(Math.random()*answers.length)] })
        ]});
    }

    if (command === 'staffinfo') {
        const target = message.mentions.members.first() || message.member;
        await message.guild.members.fetch();
        const staffRole = STAFF_ROLES.map(rn => message.guild.roles.cache.find(r => r.name === rn))
            .filter(r => r && target.roles.cache.has(r.id))[0];
        message.channel.send({ embeds: [new EmbedBuilder().setTitle(`🧑‍💼 Staff Info — ${target.user.username}`).setColor(0x5865F2)
            .setThumbnail(target.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: '👤 User',       value: `${target}`, inline: true },
                { name: '🏅 Staff Role', value: staffRole ? `**${staffRole.name}**` : '_Not a staff member_', inline: true },
                { name: '📅 Joined',     value: `<t:${Math.floor(target.joinedTimestamp/1000)}:D>`, inline: true },
            )
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
        if (sub === 'economy') return message.channel.send({ embeds: [new EmbedBuilder().setTitle('💰 Admin — Economy').setColor(0xF1C40F).addFields(
            { name: '`v!add coins @user <amt>`',    value: 'Add coins.' },
            { name: '`v!remove coins @user <amt>`', value: 'Remove coins.' },
            { name: '`v!reset coins @user`',        value: 'Reset coins to 0.' },
        ).setFooter({ text: 'v!adminhelp for categories' })]});

        if (sub === 'mod') return message.channel.send({ embeds: [new EmbedBuilder().setTitle('🔨 Admin — Mod').setColor(0xFF0000).addFields(
            { name: '`v!warn @user`',                  value: 'Warn user.' },
            { name: '`v!unwarn @user`',                value: 'Remove warn.' },
            { name: '`v!warns @user`',                 value: 'Check warns.' },
            { name: '`v!kick @user [reason]`',         value: 'Kick user.' },
            { name: '`v!ban @user [reason]`',          value: 'Ban user.' },
            { name: '`v!mute @user [mins]`',           value: 'Timeout user (def 60m).' },
            { name: '`v!unmute @user`',                value: 'Remove timeout.' },
            { name: '`v!setnick @user <name>`',        value: 'Set nickname.' },
            { name: '`v!promo @user <role name>`',     value: 'Promote staff. Posts in promo ch.' },
            { name: '`v!demo @user <role name>`',      value: 'Demote staff. Posts in demo ch.' },
            { name: '`v!fire @user`',                  value: 'Remove ALL staff roles.' },
            { name: '`v!staffinfo @user`',             value: 'Show staff role info.' },
        ).setFooter({ text: 'v!adminhelp for categories' })]});

        if (sub === 'channel') return message.channel.send({ embeds: [new EmbedBuilder().setTitle('📢 Admin — Channel').setColor(0x3498DB).addFields(
            { name: '`v!purge <amt>`', value: 'Delete messages (max 100).' },
            { name: '`v!purge all`',   value: 'Delete all messages.' },
            { name: '`v!lock`',        value: 'Lock channel.' },
            { name: '`v!unlock`',      value: 'Unlock channel.' },
        ).setFooter({ text: 'v!adminhelp for categories' })]});

        if (sub === 'giveaway') return message.channel.send({ embeds: [new EmbedBuilder().setTitle(`${giveawayEmoji} Admin — Giveaway`).setColor(0xF1C40F).addFields(
            { name: '`v!giveaway <time> <coins> [winners]`', value:
                'Start a giveaway. Winners get coins!\n\n' +
                '**Time:** `1s` `1m` `1h` `1hr` `1d` `1day`\n' +
                '**Examples:**\n`v!giveaway 1h 500` — 1 winner\n`v!giveaway 30m 1000 3` — 3 winners\n`v!gw 1d 250` — alias also works'
            },
        ).setFooter({ text: 'v!adminhelp for categories' })]});

        if (sub === 'system') return message.channel.send({ embeds: [new EmbedBuilder().setTitle('⚙️ Admin — System').setColor(0x2C2F33).addFields(
            { name: '`v!logs`',          value: 'Bot logs.' },
            { name: '`v!updatestaff`',   value: 'Force update staff list.' },
            { name: '`v!test welcome`',  value: 'Test welcome msg.' },
            { name: '`v!test goodbye`',  value: 'Test goodbye msg.' },
        ).setFooter({ text: 'v!adminhelp for categories' })]});

        message.channel.send({ embeds: [new EmbedBuilder().setTitle('🔐 Admin Control Panel').setColor(0xFF0000)
            .setDescription('Use `v!adminhelp <category>` for details.')
            .addFields(
                { name: '💰 Economy',             value: '`v!adminhelp economy`',  inline: true },
                { name: '🔨 Moderation',          value: '`v!adminhelp mod`',      inline: true },
                { name: '📢 Channel',             value: '`v!adminhelp channel`',  inline: true },
                { name: `${giveawayEmoji} GW`,    value: '`v!adminhelp giveaway`', inline: true },
                { name: '⚙️ System',              value: '`v!adminhelp system`',   inline: true },
            )
        ]});
    }

    // ─── TEST ───
    if (command === 'test') {
        const sub = args[0]?.toLowerCase();
        if (sub === 'welcome') {
            const ch = message.guild.channels.cache.get(WELCOME_CHANNEL_ID);
            if (!ch) return message.reply('❌ Welcome channel not found.');
            await sendWelcome(message.member, ch);
            message.reply('✅ Welcome test sent!');
        } else if (sub === 'goodbye') {
            const ch = message.guild.channels.cache.get(GOODBYE_CHANNEL_ID);
            if (!ch) return message.reply('❌ Goodbye channel not found.');
            await sendGoodbye(message.member, ch);
            message.reply('✅ Goodbye test sent!');
        } else {
            message.reply('❌ Usage: `v!test welcome` or `v!test goodbye`');
        }
    }

    // ─── UPDATESTAFF ───
    if (command === 'updatestaff') {
        await message.reply('🔄 Updating staff list...');
        await updateStaffList();
        message.channel.send('✅ Staff list updated!');
    }

    // ─── PURGE ───
    if (command === 'purge') {
        if (args[0] === 'all') {
            let deleted = 0, fetched;
            do { fetched = await message.channel.bulkDelete(100, true); deleted += fetched.size; } while (fetched.size >= 2);
            const m = await message.channel.send({ embeds: [new EmbedBuilder().setTitle('🧹 Purge Complete').setDescription(`Deleted **${deleted}** messages.`).setColor(0xFF4444)] });
            setTimeout(() => m.delete().catch(() => {}), 4000);
        } else {
            const amt = parseInt(args[0]);
            if (isNaN(amt) || amt < 1 || amt > 100) return message.reply({ embeds: [new EmbedBuilder().setDescription('❌ Enter 1–100 or use `v!purge all`.').setColor(0xFF0000)] });
            await message.channel.bulkDelete(amt + 1, true);
            const m = await message.channel.send({ embeds: [new EmbedBuilder().setTitle('🧹 Purge Complete').setDescription(`Deleted **${amt}** messages.`).setColor(0xFF4444)] });
            setTimeout(() => m.delete().catch(() => {}), 4000);
        }
    }

    // ─── MUTE / UNMUTE ───
    if (command === 'mute') {
        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Mention a user.');
        const mins = parseInt(args[1]) || 60;
        await target.timeout(mins * 60000, `Muted by ${message.author.tag}`);
        message.channel.send({ content: `<@${target.id}>`, embeds: [new EmbedBuilder().setTitle('🔇 Muted').setDescription(`**${target.user.tag}** muted for **${mins}m**.`).setColor(0xFF9900)] });
    }

    if (command === 'unmute') {
        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Mention a user.');
        await target.timeout(null);
        message.channel.send({ embeds: [new EmbedBuilder().setTitle('🔊 Unmuted').setDescription(`**${target.user.tag}** unmuted.`).setColor(0x2ECC71)] });
    }

    // ─── KICK / BAN ───
    if (command === 'kick') {
        const target = message.mentions.members.first();
        const reason = args.slice(1).join(' ') || 'No reason';
        if (!target) return message.reply('❌ Mention a user.');
        await target.kick(reason);
        message.channel.send({ content: `<@${target.id}>`, embeds: [new EmbedBuilder().setTitle('👢 Kicked').setDescription(`**${target.user.tag}** kicked.\nReason: ${reason}`).setColor(0xFF9900)] });
    }

    if (command === 'ban') {
        const target = message.mentions.members.first();
        const reason = args.slice(1).join(' ') || 'No reason';
        if (!target) return message.reply('❌ Mention a user.');
        await target.ban({ reason });
        message.channel.send({ content: `<@${target.id}>`, embeds: [new EmbedBuilder().setTitle('🔨 Banned').setDescription(`**${target.user.tag}** banned.\nReason: ${reason}`).setColor(0xFF0000)] });
    }

    // ─── WARN / UNWARN / WARNS ───
    if (command === 'warn') {
        const target = message.mentions.users.first();
        if (!target) return message.reply('❌ Mention a user.');
        const data = getUserData(target.id); data.warns++; saveData();
        message.channel.send({ content: `<@${target.id}>`, embeds: [new EmbedBuilder().setTitle('⚠️ Warning').setDescription(`**${target.tag}** warned. Total: **${data.warns}**.`).setColor(0xFF9900)] });
    }

    if (command === 'unwarn') {
        const target = message.mentions.users.first();
        if (!target) return message.reply('❌ Mention a user.');
        const data = getUserData(target.id); data.warns = Math.max(0, data.warns - 1); saveData();
        message.channel.send({ embeds: [new EmbedBuilder().setTitle('✅ Warning Removed').setDescription(`**${target.tag}** now has **${data.warns}** warning(s).`).setColor(0x2ECC71)] });
    }

    if (command === 'warns') {
        const target = message.mentions.users.first() || message.author;
        const data   = getUserData(target.id);
        message.channel.send({ embeds: [new EmbedBuilder().setTitle(`⚠️ Warns — ${target.username}`).setDescription(`**${data.warns}** warning(s).`).setColor(0xFF9900)] });
    }

    // ─── SETNICK / LOCK / UNLOCK ───
    if (command === 'setnick') {
        const target = message.mentions.members.first();
        const nick   = args.slice(1).join(' ');
        if (!target) return message.reply('❌ Mention a user.');
        if (!nick)   return message.reply('❌ Provide a nickname.');
        await target.setNickname(nick);
        message.channel.send({ embeds: [new EmbedBuilder().setTitle('✏️ Nickname Changed').setDescription(`**${target.user.tag}** → **${nick}**.`).setColor(0x5865F2)] });
    }

    if (command === 'lock') {
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        message.channel.send({ embeds: [new EmbedBuilder().setTitle('🔒 Locked').setDescription(`**#${message.channel.name}** locked.`).setColor(0xFF0000)] });
    }

    if (command === 'unlock') {
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        message.channel.send({ embeds: [new EmbedBuilder().setTitle('🔓 Unlocked').setDescription(`**#${message.channel.name}** unlocked.`).setColor(0x2ECC71)] });
    }

    // ─── ADMIN ECONOMY ───
    if (command === 'add' && args[0] === 'coins') {
        const target = message.mentions.users.first(); const amt = parseInt(args[2]);
        if (!target || isNaN(amt)) return message.reply('❌ Usage: `v!add coins @user <amt>`');
        getUserData(target.id).coins += amt; saveData();
        message.channel.send({ embeds: [new EmbedBuilder().setTitle('✅ Coins Added').setDescription(`Added **${amt}** ${coinEmoji} to **${target.username}**.`).setColor(0x2ECC71)] });
    }

    if (command === 'remove' && args[0] === 'coins') {
        const target = message.mentions.users.first(); const amt = parseInt(args[2]);
        if (!target || isNaN(amt)) return message.reply('❌ Usage: `v!remove coins @user <amt>`');
        const data = getUserData(target.id); data.coins = Math.max(0, data.coins - amt); saveData();
        message.channel.send({ embeds: [new EmbedBuilder().setTitle('✅ Coins Removed').setDescription(`Removed **${amt}** ${coinEmoji} from **${target.username}**.`).setColor(0xFF9900)] });
    }

    if (command === 'reset' && args[0] === 'coins') {
        const target = message.mentions.users.first();
        if (!target) return message.reply('❌ Mention a user.');
        getUserData(target.id).coins = 0; saveData();
        message.channel.send({ embeds: [new EmbedBuilder().setTitle('🔄 Coins Reset').setDescription(`**${target.username}**'s coins reset to 0.`).setColor(0xFF9900)] });
    }

    // ─── LOGS ───
    if (command === 'logs') {
        message.channel.send({ embeds: [new EmbedBuilder().setTitle('🖥️ Bot Logs').setColor(0x2C2F33)
            .setDescription(`\`\`\`txt\n${botLogs.join('\n') || 'Empty'}\n\`\`\``)] });
    }

    // ─── GIVEAWAY ───
    if (command === 'giveaway' || command === 'gw') {
        const durationMs = parseTime(args[0]);
        const coinsArg   = parseInt(args[1]);
        const winnersArg = parseInt(args[2]) || 1;

        if (!durationMs)              return message.reply({ embeds: [new EmbedBuilder().setDescription('❌ Invalid time. Use `1s` `1m` `1h` `1d` etc.\n**Usage:** `v!giveaway <time> <coins> [winners]`').setColor(0xFF0000)] });
        if (isNaN(coinsArg) || coinsArg < 1) return message.reply({ embeds: [new EmbedBuilder().setDescription('❌ Provide a valid coin amount.').setColor(0xFF0000)] });
        if (winnersArg < 1 || winnersArg > 20) return message.reply({ embeds: [new EmbedBuilder().setDescription('❌ Winners must be 1–20.').setColor(0xFF0000)] });

        const endsAt = Date.now() + durationMs;
        const prize  = `${coinEmoji} ${coinsArg} ${coinEmoji}`;
        const gwData = { prize, coinsAmount: coinsArg, hostId: message.author.id, channelId: message.channel.id, winners: winnersArg, endsAt, startedAt: Date.now(), ended: false };

        await message.delete().catch(() => {});
        const gMsg = await message.channel.send({ embeds: [buildGiveawayEmbed(gwData, true)] });
        try { await gMsg.react(`${GIVEAWAY_EMOJI_NAME}:${GIVEAWAY_EMOJI_ID}`); } catch { await gMsg.react('🎉'); }

        gwData.messageId = gMsg.id;
        db.giveaways[gMsg.id] = gwData; saveData();
        logger(`GW started: ${coinsArg} coins, ${winnersArg} winner(s), ${formatDuration(durationMs)}`);
        setTimeout(() => endGiveaway(message.channel.id, gMsg.id), durationMs);
    }

    // ─── PROMO ───
    if (command === 'promo') {
        const target   = message.mentions.members.first();
        const roleName = args.slice(1).join(' ');
        if (!target)   return message.reply('❌ Mention a user. Usage: `v!promo @user <role name>`');
        if (!roleName) return message.reply('❌ Provide a role name. Usage: `v!promo @user <role name>`');

        const newRole = findRole(message.guild, roleName);
        if (!newRole)  return message.reply(`❌ Role **${roleName}** not found. Check spelling.`);

        // Remove all current staff roles
        for (const sn of STAFF_ROLES) {
            const r = message.guild.roles.cache.find(x => x.name === sn);
            if (r && target.roles.cache.has(r.id)) await target.roles.remove(r).catch(() => {});
        }
        await target.roles.add(newRole);

        const embed = new EmbedBuilder().setTitle('🎉 Staff Promotion').setColor(0x2ECC71)
            .setDescription(`Congratulations to ${target}! 🎊\n\nPromoted to **${newRole.name}**!\n> Keep up the great work!`)
            .setThumbnail(target.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: '👤 Staff Member', value: `${target}`, inline: true },
                { name: '🏅 New Role',     value: `**${newRole.name}**`, inline: true },
                { name: '📋 By',           value: `${message.author}`, inline: true },
            );

        const ch = message.guild.channels.cache.get(PROMO_CHANNEL_ID);
        if (ch) await ch.send({ content: `${target}`, embeds: [embed] });
        message.reply(`✅ **${target.user.username}** promoted to **${newRole.name}**!`);
        await updateStaffList();
        logger(`Promo: ${target.user.tag} → ${newRole.name}`);
    }

    // ─── DEMO ───
    if (command === 'demo') {
        const target   = message.mentions.members.first();
        const roleName = args.slice(1).join(' ');
        if (!target)   return message.reply('❌ Mention a user. Usage: `v!demo @user <role name>`');
        if (!roleName) return message.reply('❌ Provide a role name. Usage: `v!demo @user <role name>`');

        const newRole = findRole(message.guild, roleName);
        if (!newRole)  return message.reply(`❌ Role **${roleName}** not found. Check spelling.`);

        // Remove all current staff roles
        for (const sn of STAFF_ROLES) {
            const r = message.guild.roles.cache.find(x => x.name === sn);
            if (r && target.roles.cache.has(r.id)) await target.roles.remove(r).catch(() => {});
        }
        await target.roles.add(newRole);

        const embed = new EmbedBuilder().setTitle('📉 Staff Demotion').setColor(0xFF4444)
            .setDescription(`${target} has been demoted.\n\nNew role: **${newRole.name}**.\n> Please reflect and strive to improve.`)
            .setThumbnail(target.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: '👤 Staff Member', value: `${target}`, inline: true },
                { name: '📉 New Role',     value: `**${newRole.name}**`, inline: true },
                { name: '📋 By',           value: `${message.author}`, inline: true },
            );

        const ch = message.guild.channels.cache.get(DEMO_CHANNEL_ID);
        if (ch) await ch.send({ content: `${target}`, embeds: [embed] });
        message.reply(`✅ **${target.user.username}** demoted to **${newRole.name}**.`);
        await updateStaffList();
        logger(`Demo: ${target.user.tag} → ${newRole.name}`);
    }

    // ─── FIRE ───
    if (command === 'fire') {
        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Mention a user. Usage: `v!fire @user`');

        let removed = 0;
        for (const sn of STAFF_ROLES) {
            const r = message.guild.roles.cache.find(x => x.name === sn);
            if (r && target.roles.cache.has(r.id)) { await target.roles.remove(r).catch(() => {}); removed++; }
        }

        const embed = new EmbedBuilder().setTitle('🔥 Staff Fired').setColor(0xFF0000)
            .setDescription(`**${target.user.tag}** has been removed from the staff team.\n> Removed **${removed}** staff role(s).`)
            .setThumbnail(target.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: '👤 User',  value: `${target}`, inline: true },
                { name: '📋 By',    value: `${message.author}`, inline: true },
            );

        message.channel.send({ content: `<@${target.id}>`, embeds: [embed] });
        await updateStaffList();
        logger(`Fire: ${target.user.tag} — ${removed} role(s) removed by ${message.author.tag}`);
    }

    } catch (err) {
        logger(`ERR: ${command} | ${err.message}`);
        message.channel.send({ embeds: [new EmbedBuilder().setDescription(`❌ Error: \`${err.message}\``).setColor(0xFF0000)] });
    }
});

client.login(process.env.TOKEN);
