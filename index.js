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
    if (!db.users[id]) db.users[id] = { coins: 0, warns: 0, lastWork: 0 };
    return db.users[id];
};

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
        const spamEmbed = new EmbedBuilder().setTitle("🚫 Anti-Spam").setDescription(`Consecutive messages detected. You lost **50** ${coinEmoji}.`).setColor(0xFF0000);
        message.channel.send({ embeds: [spamEmbed] });
    }

    // 2. COIN EARNING (1 per message)
    if (!message.content.startsWith(prefix)) {
        const data = getUserData(message.author.id);
        data.coins += 1;
        saveData();
    }

    if (!message.content.startsWith(prefix)) return;
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const hasPerms = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || 
                     message.member.roles.cache.some(role => role.name === 'bot perms');

    try {
        // --- PUBLIC COMMANDS ---
        if (command === 'help') {
            const hEmbed = new EmbedBuilder()
                .setTitle("Command Menu")
                .setDescription("Prefix: `v!`")
                .addFields(
                    { name: '💰 Economy', value: '`coins`, `work`, `gamble`, `shop`, `chests`' },
                    { name: '🛠️ Staff', value: '`adminhelp`' }
                ).setColor(0x5865F2);
            message.channel.send({ embeds: [hEmbed] });
        }

        if (command === 'coins' || command === 'bal') {
            const target = message.mentions.users.first() || message.author;
            const data = getUserData(target.id);
            message.channel.send(`${target.username} has **${data.coins}** ${coinEmoji}`);
        }

        if (command === 'work') {
            const data = getUserData(message.author.id);
            const cooldown = 3600000; // 1 hour
            if (Date.now() - data.lastWork < cooldown) return message.reply("You can work again in 1 hour.");
            
            const earned = Math.floor(Math.random() * 100) + 10;
            data.coins += earned;
            data.lastWork = Date.now();
            saveData();
            message.channel.send(`💼 You worked and earned **${earned}** ${coinEmoji}!`);
        }

        if (command === 'gamble') {
            const amount = parseInt(args[0]);
            const data = getUserData(message.author.id);
            if (isNaN(amount) || amount < 10) return message.reply("Minimum gamble is 10 coins.");
            if (data.coins < amount) return message.reply("Insufficient coins.");
            
            if (Math.random() > 0.5) {
                data.coins += amount;
                message.reply(`🎲 You won **${amount}** ${coinEmoji}!`);
            } else {
                data.coins -= amount;
                message.reply(`🎲 You lost **${amount}** ${coinEmoji}.`);
            }
            saveData();
        }

        // --- ADMIN COMMANDS ---
        if (!hasPerms) return;

        if (command === 'adminhelp') {
            const aEmbed = new EmbedBuilder()
                .setTitle("Admin Control Panel")
                .setColor(0xFF0000)
                .addFields(
                    { name: 'Economy', value: '`v!add coins @user [amount]`, `v!remove coins @user [amount]`, `v!reset coins @user`' },
                    { name: 'Mod', value: '`v!warn`, `v!unwarn`, `v!kick`, `v!ban`, `v!mute`, `v!purge [amount]`' },
                    { name: 'System', value: '`v!logs`, `v!giveaway [prize]`' }
                );
            message.channel.send({ embeds: [aEmbed] });
        }

        if (command === 'purge') {
            const amount = parseInt(args[0]);
            if (isNaN(amount) || amount > 100) return message.reply("Enter amount (1-100).");
            await message.channel.bulkDelete(amount, true);
            message.channel.send(`🧹 Deleted ${amount} messages.`).then(m => setTimeout(() => m.delete(), 3000));
        }

        if (command === 'mute') {
            const target = message.mentions.members.first();
            if (!target) return message.reply("Mention user.");
            await target.timeout(60 * 60 * 1000, "Admin Mute");
            message.channel.send(`🔇 **${target.user.tag}** muted for 1 hour.`);
        }

        if (command === 'add' && args[0] === 'coins') {
            const target = message.mentions.users.first();
            const amt = parseInt(args[2]);
            if (!target || isNaN(amt)) return;
            getUserData(target.id).coins += amt;
            saveData();
            message.channel.send(`✅ Added ${amt} ${coinEmoji} to ${target.username}.`);
        }

        if (command === 'logs') {
            message.channel.send(`**Terminal:**\n\`\`\`txt\n${botLogs.join('\n') || "Empty"}\n\`\`\``);
        }

        // (Other logic for ban, warn, giveaway from previous code stays same)

    } catch (err) {
        logger(`ERR: ${command} | ${err.message}`);
    }
});

client.once('ready', () => logger(`Bot Active - Commands Loaded.`));
client.login(process.env.TOKEN);
