const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, Collection } = require('discord.js');
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

// Data Storage (Simple JSON)
let db = { users: {} };
if (fs.existsSync('./database.json')) {
    db = JSON.parse(fs.readFileSync('./database.json'));
}

const saveData = () => fs.writeFileSync('./database.json', JSON.stringify(db, null, 2));

const getUserData = (id) => {
    if (!db.users[id]) {
        db.users[id] = { coins: 0, warns: 0, lastMessages: [] };
    }
    return db.users[id];
};

// Anti-Spam Tracking
const userMessages = new Map();

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const data = getUserData(message.author.id);

    // --- 1. COIN SYSTEM (1 per message) ---
    if (!message.content.startsWith(prefix)) {
        data.coins += 1;
        saveData();
    }

    // --- 2. ANTI-SPAM SYSTEM ---
    let logs = userMessages.get(message.author.id) || [];
    logs.push(Date.now());
    const recent = logs.filter(time => Date.now() - time < 5000); // 5 seconds window
    userMessages.set(message.author.id, recent);

    if (recent.length >= 5) {
        data.warns += 1;
        data.coins = Math.max(0, data.coins - 50); // Lose 50 coins
        saveData();
        userMessages.set(message.author.id, []); // Reset spam tracker

        const spamEmbed = new EmbedBuilder()
            .setTitle("🚫 Anti-Spam Triggered")
            .setDescription(`Stop spamming! You have been warned and lost **50** ${coinEmoji}.`)
            .setColor(0xFF0000);
        
        message.channel.send({ content: `<@${message.author.id}>`, embeds: [spamEmbed] });

        if (data.warns >= 3) {
            await message.member.timeout(10 * 60 * 1000, "Spamming").catch(() => {});
            message.channel.send(`🔇 ${message.author.tag} has been timed out for excessive warns.`);
        }
    }

    // --- COMMAND HANDLING ---
    if (!message.content.startsWith(prefix)) return;
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const hasPerms = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || 
                     message.member.roles.cache.some(role => role.name === 'bot perms');

    // --- COIN COMMANDS ---
    if (command === 'coins') {
        const target = message.mentions.users.first() || message.author;
        const targetData = getUserData(target.id);
        message.channel.send(`${target.username} has **${targetData.coins}** ${coinEmoji}`);
    }

    if (command === 'addcoins' && hasPerms) {
        const target = message.mentions.users.first();
        const amount = parseInt(args[1]);
        if (!target || isNaN(amount)) return message.reply("Use: `v!addcoins @user 100`.");
        getUserData(target.id).coins += amount;
        saveData();
        message.channel.send(`✅ Added **${amount}** ${coinEmoji} to ${target.username}.`);
    }

    // --- MODERATION COMMANDS ---
    const targetMember = message.mentions.members.first();
    const reason = args.slice(1).join(" ") || "No reason provided";

    const modEmbed = (action, color, member, reason) => {
        return new EmbedBuilder()
            .setTitle(`Action: ${action}`)
            .addFields(
                { name: 'Target', value: `${member.user.tag}`, inline: true },
                { name: 'Reason', value: reason, inline: true }
            )
            .setColor(color)
            .setTimestamp();
    };

    if (command === 'warn' && hasPerms) {
        if (!targetMember) return message.reply("Mention someone.");
        const tData = getUserData(targetMember.id);
        tData.warns += 1;
        saveData();
        const embed = modEmbed("Warn", 0xFFFF00, targetMember, reason);
        message.channel.send({ embeds: [embed] });
        targetMember.send({ embeds: [embed] }).catch(() => {});
    }

    if (command === 'unwarn' && hasPerms) {
        if (!targetMember) return message.reply("Mention someone.");
        const tData = getUserData(targetMember.id);
        tData.warns = Math.max(0, tData.warns - 1);
        saveData();
        message.channel.send(`✅ Unwarned **${targetMember.user.tag}**. They now have **${tData.warns}** warns.`);
    }

    if (command === 'kick' && hasPerms) {
        if (!targetMember) return message.reply("Mention someone.");
        const embed = modEmbed("Kick", 0xFFA500, targetMember, reason);
        await targetMember.send({ embeds: [embed] }).catch(() => {});
        await targetMember.kick(reason);
        message.channel.send({ embeds: [embed] });
    }

    if (command === 'ban' && hasPerms) {
        if (!targetMember) return message.reply("Mention someone.");
        const embed = modEmbed("Ban", 0xFF0000, targetMember, reason);
        await targetMember.send({ embeds: [embed] }).catch(() => {});
        await targetMember.ban({ reason });
        message.channel.send({ embeds: [embed] });
    }

    // --- COMING SOON ---
    if (command === 'shop' || command === 'chests') {
        const soonEmbed = new EmbedBuilder()
            .setTitle("🏗️ Under Construction")
            .setDescription(`The **${command}** system is coming soon! Start earning ${coinEmoji} now to be ready.`)
            .setColor(0x00AAFF);
        message.channel.send({ embeds: [soonEmbed] });
    }

    // --- GIVEAWAY (BASIC) ---
    if (command === 'giveaway' && hasPerms) {
        const item = args.join(" ");
        if (!item) return message.reply("What is the giveaway for?");
        const gEmbed = new EmbedBuilder()
            .setTitle("🎉 GIVEAWAY!")
            .setDescription(`Prize: **${item}**\nReact with 🎉 to enter! (Ends in 1 minute - Example)`)
            .setColor(0x00FF00);
        message.channel.send({ embeds: [gEmbed] }).then(m => m.react('🎉'));
    }
});

client.once('ready', () => console.log('Bot is live!'));
client.login(process.env.TOKEN);
