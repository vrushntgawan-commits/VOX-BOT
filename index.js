const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

const prefix = 'v!';
const coinEmoji = '<a:coin:1475856179497275594>';
const giveawayEmoji = '<:giveaway:1475844346258522273>';

const WELCOME_CHANNEL_ID = '1475548830635130990';
const GOODBYE_CHANNEL_ID = '1475913121951387759';

// --- DATABASE & LOGGING ---
let db = { users: {} };
if (fs.existsSync('./database.json')) {
    db = JSON.parse(fs.readFileSync('./database.json'));
}
const saveData = () => fs.writeFileSync('./database.json', JSON.stringify(db, null, 2));

const botLogs = [];
const logger = (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${msg}`;
    botLogs.push(entry);
    console.log(entry);
    if (botLogs.length > 20) botLogs.shift();
};

const getUserData = (id) => {
    if (!db.users[id]) db.users[id] = { coins: 0, warns: 0, lastWork: 0, lastDaily: 0 };
    return db.users[id];
};

// --- ACTIVE GIVEAWAYS ---
const activeGiveaways = new Map();

// --- WELCOME / GOODBYE ---
client.on('guildMemberAdd', async (member) => {
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle(`👋 Welcome to ${member.guild.name}!`)
        .setDescription(`Hey ${member}, we're glad you're here!\nYou are member **#${member.guild.memberCount}**.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setColor(0x5865F2)
        .setFooter({ text: `${member.guild.name}`, iconURL: member.guild.iconURL({ dynamic: true }) })
        .setTimestamp();

    channel.send({ embeds: [embed] });
    logger(`Welcome sent for ${member.user.tag}`);
});

client.on('guildMemberRemove', async (member) => {
    const channel = member.guild.channels.cache.get(GOODBYE_CHANNEL_ID);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle(`👋 Goodbye, ${member.user.username}`)
        .setDescription(`**${member.user.tag}** has left the server.\nWe now have **${member.guild.memberCount}** members.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setColor(0xFF4444)
        .setFooter({ text: `${member.guild.name}`, iconURL: member.guild.iconURL({ dynamic: true }) })
        .setTimestamp();

    channel.send({ embeds: [embed] });
    logger(`Goodbye sent for ${member.user.tag}`);
});

let lastAuthorId = null;
let consecutiveCount = 0;

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 1. CONSECUTIVE ANTI-SPAM
    if (message.author.id === lastAuthorId) {
        consecutiveCount++;
    } else {
        lastAuthorId = message.author.id;
        consecutiveCount = 1;
    }

    if (consecutiveCount >= 5) {
        const data = getUserData(message.author.id);
        data.warns += 1;
        data.coins = Math.max(0, data.coins - 50);
        saveData();
        consecutiveCount = 0;
        const spamEmbed = new EmbedBuilder()
            .setTitle("🚫 Anti-Spam Triggered")
            .setDescription(`${message.author}, slow down! You've been sending too many messages.\nYou lost **50** ${coinEmoji} and received a warning.`)
            .addFields({ name: 'Total Warnings', value: `${data.warns}` })
            .setColor(0xFF0000)
            .setTimestamp();
        message.channel.send({ embeds: [spamEmbed] });
    }

    // 2. COIN EARNING (1 per message)
    if (!message.content.startsWith(prefix)) {
        const data = getUserData(message.author.id);
        data.coins += 1;
        saveData();
    }

    // --- GIVEAWAY REACTION LISTENER ---
    // (handled in messageReactionAdd below)

    if (!message.content.startsWith(prefix)) return;
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const hasPerms = message.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        message.member.roles.cache.some(role => role.name === 'bot perms');

    try {

        // =====================
        // --- PUBLIC COMMANDS ---
        // =====================

        if (command === 'help') {
            const hEmbed = new EmbedBuilder()
                .setTitle("📖 Command Menu")
                .setDescription("Prefix: `v!`")
                .addFields(
                    { name: '💰 Economy', value: '`coins`, `bal`, `work`, `daily`, `gamble`, `leaderboard`' },
                    { name: 'ℹ️ Info', value: '`serverinfo`, `si`, `userinfo`, `ui`, `ping`' },
                    { name: '🛠️ Staff', value: '`adminhelp`' }
                )
                .setColor(0x5865F2)
                .setFooter({ text: 'Use v!adminhelp for staff commands' })
                .setTimestamp();
            message.channel.send({ embeds: [hEmbed] });
        }

        if (command === 'ping') {
            const embed = new EmbedBuilder()
                .setTitle('🏓 Pong!')
                .setDescription(`Latency: **${Math.round(client.ws.ping)}ms**`)
                .setColor(0x5865F2);
            message.channel.send({ embeds: [embed] });
        }

        if (command === 'coins' || command === 'bal') {
            const target = message.mentions.users.first() || message.author;
            const data = getUserData(target.id);
            const embed = new EmbedBuilder()
                .setTitle(`${coinEmoji} Balance`)
                .setDescription(`**${target.username}** has **${data.coins}** ${coinEmoji}`)
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .setColor(0xF1C40F)
                .setTimestamp();
            message.channel.send({ embeds: [embed] });
        }

        if (command === 'work') {
            const data = getUserData(message.author.id);
            const cooldown = 3600000; // 1 hour
            const remaining = cooldown - (Date.now() - data.lastWork);
            if (remaining > 0) {
                const mins = Math.ceil(remaining / 60000);
                const embed = new EmbedBuilder()
                    .setTitle('⏳ Cooldown')
                    .setDescription(`You can work again in **${mins} minute(s)**.`)
                    .setColor(0xFF9900);
                return message.reply({ embeds: [embed] });
            }
            const earned = Math.floor(Math.random() * 100) + 10;
            data.coins += earned;
            data.lastWork = Date.now();
            saveData();
            const embed = new EmbedBuilder()
                .setTitle('💼 Work Complete!')
                .setDescription(`You worked hard and earned **${earned}** ${coinEmoji}!\nBalance: **${data.coins}** ${coinEmoji}`)
                .setColor(0x2ECC71)
                .setTimestamp();
            message.channel.send({ embeds: [embed] });
        }

        if (command === 'daily') {
            const data = getUserData(message.author.id);
            const cooldown = 86400000; // 24 hours
            const remaining = cooldown - (Date.now() - data.lastDaily);
            if (remaining > 0) {
                const hours = Math.ceil(remaining / 3600000);
                const embed = new EmbedBuilder()
                    .setTitle('⏳ Daily Already Claimed')
                    .setDescription(`Come back in **${hours} hour(s)** for your next daily reward!`)
                    .setColor(0xFF9900);
                return message.reply({ embeds: [embed] });
            }
            const earned = Math.floor(Math.random() * 200) + 100;
            data.coins += earned;
            data.lastDaily = Date.now();
            saveData();
            const embed = new EmbedBuilder()
                .setTitle('🎁 Daily Reward!')
                .setDescription(`You claimed your daily reward of **${earned}** ${coinEmoji}!\nBalance: **${data.coins}** ${coinEmoji}`)
                .setColor(0xF1C40F)
                .setTimestamp();
            message.channel.send({ embeds: [embed] });
        }

        if (command === 'gamble') {
            const amount = parseInt(args[0]);
            const data = getUserData(message.author.id);
            if (isNaN(amount) || amount < 10) {
                const embed = new EmbedBuilder().setDescription('❌ Minimum gamble is **10** coins.').setColor(0xFF0000);
                return message.reply({ embeds: [embed] });
            }
            if (data.coins < amount) {
                const embed = new EmbedBuilder().setDescription('❌ You don\'t have enough coins.').setColor(0xFF0000);
                return message.reply({ embeds: [embed] });
            }
            const win = Math.random() > 0.5;
            if (win) {
                data.coins += amount;
                const embed = new EmbedBuilder()
                    .setTitle('🎲 You Won!')
                    .setDescription(`You won **${amount}** ${coinEmoji}!\nBalance: **${data.coins}** ${coinEmoji}`)
                    .setColor(0x2ECC71);
                message.reply({ embeds: [embed] });
            } else {
                data.coins -= amount;
                const embed = new EmbedBuilder()
                    .setTitle('🎲 You Lost!')
                    .setDescription(`You lost **${amount}** ${coinEmoji}.\nBalance: **${data.coins}** ${coinEmoji}`)
                    .setColor(0xFF0000);
                message.reply({ embeds: [embed] });
            }
            saveData();
        }

        if (command === 'leaderboard' || command === 'lb') {
            const sorted = Object.entries(db.users)
                .sort(([, a], [, b]) => b.coins - a.coins)
                .slice(0, 10);

            const medals = ['🥇', '🥈', '🥉'];
            const lines = sorted.map(([id, data], i) => {
                const medal = medals[i] || `**#${i + 1}**`;
                return `${medal} <@${id}> — **${data.coins}** ${coinEmoji}`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setTitle(`${coinEmoji} Leaderboard`)
                .setDescription(lines || 'No data yet.')
                .setColor(0xF1C40F)
                .setTimestamp();
            message.channel.send({ embeds: [embed] });
        }

        if (command === 'serverinfo' || command === 'si') {
            const guild = message.guild;
            await guild.members.fetch();
            const bots = guild.members.cache.filter(m => m.user.bot).size;
            const humans = guild.memberCount - bots;

            const embed = new EmbedBuilder()
                .setTitle(`🏠 ${guild.name}`)
                .setThumbnail(guild.iconURL({ dynamic: true, size: 512 }))
                .addFields(
                    { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
                    { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
                    { name: '👥 Members', value: `${guild.memberCount} (${humans} humans, ${bots} bots)`, inline: true },
                    { name: '💬 Channels', value: `${guild.channels.cache.size}`, inline: true },
                    { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true },
                    { name: '😀 Emojis', value: `${guild.emojis.cache.size}`, inline: true },
                    { name: '🔒 Verification', value: `${guild.verificationLevel}`, inline: true },
                    { name: '🚀 Boost Level', value: `Level ${guild.premiumTier}`, inline: true },
                    { name: '💎 Boosts', value: `${guild.premiumSubscriptionCount || 0}`, inline: true },
                )
                .setColor(0x5865F2)
                .setFooter({ text: `ID: ${guild.id}` })
                .setTimestamp();
            message.channel.send({ embeds: [embed] });
        }

        if (command === 'userinfo' || command === 'ui') {
            const target = message.mentions.members.first() || message.member;
            const roles = target.roles.cache
                .filter(r => r.id !== message.guild.id)
                .sort((a, b) => b.position - a.position)
                .map(r => r.toString())
                .slice(0, 5)
                .join(', ') || 'None';

            const embed = new EmbedBuilder()
                .setTitle(`👤 ${target.user.tag}`)
                .setThumbnail(target.user.displayAvatarURL({ dynamic: true, size: 512 }))
                .addFields(
                    { name: '🆔 ID', value: target.id, inline: true },
                    { name: '📅 Joined Server', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:D>`, inline: true },
                    { name: '🎂 Account Created', value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:D>`, inline: true },
                    { name: '🤖 Bot?', value: target.user.bot ? 'Yes' : 'No', inline: true },
                    { name: `🎭 Roles (top 5)`, value: roles },
                )
                .setColor(target.displayHexColor || 0x5865F2)
                .setTimestamp();
            message.channel.send({ embeds: [embed] });
        }

        // =====================
        // --- ADMIN COMMANDS ---
        // =====================
        if (!hasPerms) return;

        if (command === 'adminhelp') {
            const aEmbed = new EmbedBuilder()
                .setTitle("🔐 Admin Control Panel")
                .setColor(0xFF0000)
                .addFields(
                    { name: '💰 Economy', value: '`v!add coins @user [amt]`, `v!remove coins @user [amt]`, `v!reset coins @user`' },
                    { name: '🔨 Moderation', value: '`v!warn @user`, `v!unwarn @user`, `v!warns @user`, `v!kick @user [reason]`, `v!ban @user [reason]`, `v!mute @user [mins]`, `v!unmute @user`' },
                    { name: '🧹 Purge', value: '`v!purge [amount]`, `v!purge all`' },
                    { name: '🎉 Giveaway', value: '`v!giveaway [time in mins] [prize]`' },
                    { name: '⚙️ System', value: '`v!logs`' }
                )
                .setTimestamp();
            message.channel.send({ embeds: [aEmbed] });
        }

        if (command === 'purge') {
            if (args[0] === 'all') {
                let deleted = 0;
                // bulkDelete only works on messages < 14 days old, so we loop
                let fetched;
                do {
                    fetched = await message.channel.bulkDelete(100, true);
                    deleted += fetched.size;
                } while (fetched.size >= 2);

                const embed = new EmbedBuilder()
                    .setTitle('🧹 Purge Complete')
                    .setDescription(`Deleted **${deleted}** messages.`)
                    .setColor(0xFF4444);
                message.channel.send({ embeds: [embed] }).then(m => setTimeout(() => m.delete(), 4000));
            } else {
                const amount = parseInt(args[0]);
                if (isNaN(amount) || amount < 1 || amount > 100) {
                    const embed = new EmbedBuilder().setDescription('❌ Enter a number between 1 and 100, or use `v!purge all`.').setColor(0xFF0000);
                    return message.reply({ embeds: [embed] });
                }
                await message.channel.bulkDelete(amount + 1, true);
                const embed = new EmbedBuilder()
                    .setTitle('🧹 Purge Complete')
                    .setDescription(`Deleted **${amount}** messages.`)
                    .setColor(0xFF4444);
                message.channel.send({ embeds: [embed] }).then(m => setTimeout(() => m.delete(), 4000));
            }
        }

        if (command === 'mute') {
            const target = message.mentions.members.first();
            if (!target) return message.reply('❌ Mention a user.');
            const mins = parseInt(args[1]) || 60;
            await target.timeout(mins * 60 * 1000, `Muted by ${message.author.tag}`);
            const embed = new EmbedBuilder()
                .setTitle('🔇 User Muted')
                .setDescription(`**${target.user.tag}** has been muted for **${mins} minute(s)**.`)
                .setColor(0xFF9900)
                .setTimestamp();
            message.channel.send({ embeds: [embed] });
        }

        if (command === 'unmute') {
            const target = message.mentions.members.first();
            if (!target) return message.reply('❌ Mention a user.');
            await target.timeout(null);
            const embed = new EmbedBuilder()
                .setTitle('🔊 User Unmuted')
                .setDescription(`**${target.user.tag}** has been unmuted.`)
                .setColor(0x2ECC71)
                .setTimestamp();
            message.channel.send({ embeds: [embed] });
        }

        if (command === 'kick') {
            const target = message.mentions.members.first();
            const reason = args.slice(1).join(' ') || 'No reason provided';
            if (!target) return message.reply('❌ Mention a user.');
            await target.kick(reason);
            const embed = new EmbedBuilder()
                .setTitle('👢 User Kicked')
                .setDescription(`**${target.user.tag}** was kicked.\nReason: ${reason}`)
                .setColor(0xFF9900)
                .setTimestamp();
            message.channel.send({ embeds: [embed] });
        }

        if (command === 'ban') {
            const target = message.mentions.members.first();
            const reason = args.slice(1).join(' ') || 'No reason provided';
            if (!target) return message.reply('❌ Mention a user.');
            await target.ban({ reason });
            const embed = new EmbedBuilder()
                .setTitle('🔨 User Banned')
                .setDescription(`**${target.user.tag}** was banned.\nReason: ${reason}`)
                .setColor(0xFF0000)
                .setTimestamp();
            message.channel.send({ embeds: [embed] });
        }

        if (command === 'warn') {
            const target = message.mentions.users.first();
            if (!target) return message.reply('❌ Mention a user.');
            const data = getUserData(target.id);
            data.warns += 1;
            saveData();
            const embed = new EmbedBuilder()
                .setTitle('⚠️ Warning Issued')
                .setDescription(`**${target.tag}** has been warned. They now have **${data.warns}** warning(s).`)
                .setColor(0xFF9900)
                .setTimestamp();
            message.channel.send({ embeds: [embed] });
        }

        if (command === 'unwarn') {
            const target = message.mentions.users.first();
            if (!target) return message.reply('❌ Mention a user.');
            const data = getUserData(target.id);
            data.warns = Math.max(0, data.warns - 1);
            saveData();
            const embed = new EmbedBuilder()
                .setTitle('✅ Warning Removed')
                .setDescription(`**${target.tag}** now has **${data.warns}** warning(s).`)
                .setColor(0x2ECC71)
                .setTimestamp();
            message.channel.send({ embeds: [embed] });
        }

        if (command === 'warns') {
            const target = message.mentions.users.first() || message.author;
            const data = getUserData(target.id);
            const embed = new EmbedBuilder()
                .setTitle(`⚠️ Warnings — ${target.username}`)
                .setDescription(`**${target.tag}** has **${data.warns}** warning(s).`)
                .setColor(0xFF9900)
                .setTimestamp();
            message.channel.send({ embeds: [embed] });
        }

        if (command === 'add' && args[0] === 'coins') {
            const target = message.mentions.users.first();
            const amt = parseInt(args[2]);
            if (!target || isNaN(amt)) return message.reply('❌ Usage: `v!add coins @user [amount]`');
            getUserData(target.id).coins += amt;
            saveData();
            const embed = new EmbedBuilder()
                .setTitle('✅ Coins Added')
                .setDescription(`Added **${amt}** ${coinEmoji} to **${target.username}**.`)
                .setColor(0x2ECC71);
            message.channel.send({ embeds: [embed] });
        }

        if (command === 'remove' && args[0] === 'coins') {
            const target = message.mentions.users.first();
            const amt = parseInt(args[2]);
            if (!target || isNaN(amt)) return message.reply('❌ Usage: `v!remove coins @user [amount]`');
            const data = getUserData(target.id);
            data.coins = Math.max(0, data.coins - amt);
            saveData();
            const embed = new EmbedBuilder()
                .setTitle('✅ Coins Removed')
                .setDescription(`Removed **${amt}** ${coinEmoji} from **${target.username}**.`)
                .setColor(0xFF9900);
            message.channel.send({ embeds: [embed] });
        }

        if (command === 'reset' && args[0] === 'coins') {
            const target = message.mentions.users.first();
            if (!target) return message.reply('❌ Mention a user.');
            getUserData(target.id).coins = 0;
            saveData();
            const embed = new EmbedBuilder()
                .setTitle('🔄 Coins Reset')
                .setDescription(`**${target.username}**'s coins have been reset to 0.`)
                .setColor(0xFF9900);
            message.channel.send({ embeds: [embed] });
        }

        if (command === 'logs') {
            const embed = new EmbedBuilder()
                .setTitle('🖥️ Bot Logs')
                .setDescription(`\`\`\`txt\n${botLogs.join('\n') || 'Empty'}\n\`\`\``)
                .setColor(0x2C2F33)
                .setTimestamp();
            message.channel.send({ embeds: [embed] });
        }

        // --- IMPROVED GIVEAWAY ---
        // Usage: v!giveaway [time in minutes] [prize]
        if (command === 'giveaway') {
            const timeArg = parseInt(args[0]);
            const prize = args.slice(1).join(' ');

            if (isNaN(timeArg) || timeArg < 1) {
                const embed = new EmbedBuilder().setDescription('❌ Usage: `v!giveaway [time in mins] [prize]`').setColor(0xFF0000);
                return message.reply({ embeds: [embed] });
            }
            if (!prize) {
                const embed = new EmbedBuilder().setDescription('❌ Please provide a prize!').setColor(0xFF0000);
                return message.reply({ embeds: [embed] });
            }

            const endsAt = Date.now() + timeArg * 60 * 1000;

            const gEmbed = new EmbedBuilder()
                .setTitle(`${giveawayEmoji} GIVEAWAY ${giveawayEmoji}`)
                .setDescription(
                    `**${prize}**\n\n` +
                    `React with 🎉 to enter!\n\n` +
                    `⏰ Ends: <t:${Math.floor(endsAt / 1000)}:R>\n` +
                    `🏆 Winners: **1**\n` +
                    `🎟️ Hosted by: ${message.author}`
                )
                .setColor(0xF1C40F)
                .setFooter({ text: `Ends at` })
                .setTimestamp(endsAt);

            const gMsg = await message.channel.send({ embeds: [gEmbed] });
            await gMsg.react('🎉');

            activeGiveaways.set(gMsg.id, { prize, hostId: message.author.id, endsAt });

            logger(`Giveaway started: "${prize}" by ${message.author.tag} for ${timeArg} mins`);

            setTimeout(async () => {
                try {
                    const fetchedMsg = await message.channel.messages.fetch(gMsg.id);
                    const reaction = fetchedMsg.reactions.cache.get('🎉');

                    if (!reaction) {
                        message.channel.send('❌ No one entered the giveaway!');
                        return;
                    }

                    const users = await reaction.users.fetch();
                    const entries = users.filter(u => !u.bot);

                    if (entries.size === 0) {
                        message.channel.send('❌ No valid entries for the giveaway!');
                        return;
                    }

                    const winner = entries.random();

                    const endEmbed = new EmbedBuilder()
                        .setTitle(`${giveawayEmoji} Giveaway Ended!`)
                        .setDescription(
                            `**${prize}**\n\n` +
                            `🏆 Winner: ${winner}\n` +
                            `🎟️ Hosted by: <@${message.author.id}>\n` +
                            `👥 Total Entries: **${entries.size}**`
                        )
                        .setColor(0x2ECC71)
                        .setTimestamp();

                    await gMsg.edit({ embeds: [endEmbed] });
                    message.channel.send(`🎉 Congratulations ${winner}! You won **${prize}**!`);
                    activeGiveaways.delete(gMsg.id);
                    logger(`Giveaway ended: "${prize}" — Winner: ${winner.tag}`);
                } catch (err) {
                    logger(`Giveaway error: ${err.message}`);
                }
            }, timeArg * 60 * 1000);
        }

    } catch (err) {
        logger(`ERR: ${command} | ${err.message}`);
        const errEmbed = new EmbedBuilder()
            .setDescription(`❌ An error occurred: \`${err.message}\``)
            .setColor(0xFF0000);
        message.channel.send({ embeds: [errEmbed] });
    }
});

client.once('ready', () => logger(`Bot Active — ${client.user.tag} | Commands Loaded.`));
client.login(process.env.TOKEN);
