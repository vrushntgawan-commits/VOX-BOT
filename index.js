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
    if (!db.users[id]) db.users[id] = { coins: 0, warns: 0 };
    return db.users[id];
};

// --- SPAM TRACKING ---
let lastAuthorId = null;
let consecutiveCount = 0;

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 1. CONSECUTIVE MESSAGE ANTI-SPAM
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
        consecutiveCount = 0; // Reset after punish

        const spamEmbed = new EmbedBuilder()
            .setTitle("🚫 Anti-Spam Triggered")
            .setDescription(`Stop sending consecutive messages! You lost **50** ${coinEmoji} and gained a warn.`)
            .setColor(0xFF0000);
        message.channel.send({ embeds: [spamEmbed] });
        
        if (data.warns >= 5) {
            await message.member.timeout(300000, "Excessive Spamming").catch(() => {});
            logger(`Timed out ${message.author.tag} for spamming.`);
        }
    }

    // 2. COIN EARNING (1 per message)
    if (!message.content.startsWith(prefix)) {
        const data = getUserData(message.author.id);
        data.coins += 1;
        saveData();
    }

    // 3. COMMANDS
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const hasPerms = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || 
                     message.member.roles.cache.some(role => role.name === 'bot perms');

    try {
        // --- PUBLIC COMMANDS ---
        if (command === 'help') {
            message.channel.send("Available commands: `v!coins`, `v!shop`, `v!chests`. Admins use `v!adminhelp`.");
        }

        if (command === 'coins') {
            const target = message.mentions.users.first() || message.author;
            const data = getUserData(target.id);
            message.channel.send(`${target.username} has **${data.coins}** ${coinEmoji}`);
        }

        // --- ADMIN COMMANDS ---
        if (!hasPerms) return;

        if (command === 'logs') {
            const logBlock = botLogs.length > 0 ? botLogs.join('\n') : "No logs recorded.";
            message.channel.send(`**Terminal Output:**\n\`\`\`txt\n${logBlock}\n\`\`\``);
        }

        if (command === 'add' && args[0] === 'coins') {
            const target = message.mentions.users.first();
            const amount = parseInt(args[2]);
            if (!target || isNaN(amount)) return message.reply("Usage: `v!add coins @user 100`.");
            getUserData(target.id).coins += amount;
            saveData();
            message.channel.send(`✅ Added **${amount}** ${coinEmoji} to ${target.username}.`);
        }

        if (command === 'remove' && args[0] === 'coins') {
            const target = message.mentions.users.first();
            const amount = parseInt(args[2]);
            if (!target || isNaN(amount)) return message.reply("Usage: `v!remove coins @user 100`.");
            getUserData(target.id).coins = Math.max(0, getUserData(target.id).coins - amount);
            saveData();
            message.channel.send(`✅ Removed **${amount}** ${coinEmoji} from ${target.username}.`);
        }

        if (command === 'reset' && args[0] === 'coins') {
            const target = message.mentions.users.first();
            if (!target) return message.reply("Usage: `v!reset coins @user`.");
            getUserData(target.id).coins = 0;
            saveData();
            message.channel.send(`🔄 Reset ${coinEmoji} for ${target.username}.`);
        }

        // --- MODERATION ---
        const targetMember = message.mentions.members.first();
        const reason = args.slice(1).join(" ") || "No reason provided";

        if (command === 'warn') {
            if (!targetMember) return message.reply("Mention someone.");
            const d = getUserData(targetMember.id);
            d.warns += 1; saveData();
            const embed = new EmbedBuilder().setTitle("Warned").setDescription(`Warned in ${message.guild.name}. Reason: ${reason}`).setColor(0xFFFF00);
            await targetMember.send({ embeds: [embed] }).catch(() => {});
            message.channel.send({ embeds: [embed.setAuthor({ name: targetMember.user.tag })] });
            logger(`Warned ${targetMember.user.tag}`);
        }

        if (command === 'unwarn') {
            if (!targetMember) return message.reply("Mention someone.");
            const d = getUserData(targetMember.id);
            d.warns = Math.max(0, d.warns - 1); saveData();
            message.channel.send(`✅ ${targetMember.user.tag} unwarned.`);
        }

        if (command === 'ban') {
            if (!targetMember) return message.reply("Mention someone.");
            const embed = new EmbedBuilder().setTitle("Banned").setDescription(`Banned from ${message.guild.name}. Reason: ${reason}`).setColor(0xFF0000);
            await targetMember.send({ embeds: [embed] }).catch(() => {});
            await targetMember.ban({ reason });
            message.channel.send({ embeds: [embed] });
            logger(`Banned ${targetMember.user.tag}`);
        }

        if (command === 'giveaway') {
            const prize = args.join(" ");
            message.channel.send({
                embeds: [new EmbedBuilder().setTitle(`${giveawayEmoji} GIVEAWAY`).setDescription(`Prize: **${prize}**\nReact to enter!`).setColor(0x00FF00)]
            }).then(m => m.react('🎉'));
        }

        // --- SOON ---
        if (command === 'shop' || command === 'chests') {
            message.channel.send({ embeds: [new EmbedBuilder().setTitle("Coming Soon").setDescription(`The ${command} system is coming soon!`).setColor(0x5865F2)] });
        }

    } catch (err) {
        logger(`ERROR executing ${command}: ${err.message}`);
    }
});

client.once('ready', () => {
    logger(`Bot Status: Online | Prefix: ${prefix}`);
    logger(`Commands Loaded: coins, add coins, remove coins, reset coins, shop, chests, warn, unwarn, ban, logs, giveaway`);
});

process.on('unhandledRejection', e => logger(`CRASH PREVENTED: ${e.message}`));

client.login(process.env.TOKEN);
