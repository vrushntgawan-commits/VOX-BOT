const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

const prefix = 'v!';

// Bot Logs System: Captures recent console activity
let botLogs = [];
const addLog = (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    botLogs.push(`[${timestamp}] ${msg}`);
    if (botLogs.length > 15) botLogs.shift(); // Keep only the last 15 logs
};

client.once('ready', () => {
    addLog(`Logged in as ${client.user.tag}`);
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
    if (!message.content.startsWith(prefix) || message.author.bot) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Permission Check: Admin or "bot perms" role
    const hasPerms = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || 
                     message.member.roles.cache.some(role => role.name === 'bot perms');

    // 1. HELP COMMAND (Empty as requested)
    if (command === 'help') {
        message.channel.send("Help menu is currently empty.");
    }

    // 2. ADMIN COMMANDS
    if (!hasPerms) return; // Stop if user doesn't have permissions

    const target = message.mentions.members.first();
    const reason = args.slice(1).join(" ") || "No reason provided";

    if (command === 'adminhelp') {
        const adminEmbed = new EmbedBuilder()
            .setTitle('Admin Commands')
            .setColor(0xFF0000)
            .addFields(
                { name: '`v!kick @user [reason]`', value: 'Kicks a member' },
                { name: '`v!ban @user [reason]`', value: 'Bans a member' },
                { name: '`v!mute @user`', value: 'Mutes a member (Timeout)' },
                { name: '`v!unmute @user`', value: 'Removes mute/timeout' },
                { name: '`v!purge [amount]`', value: 'Deletes up to 100 messages' },
                { name: '`v!warn @user [reason]`', value: 'Sends a warning to user' },
                { name: '`v!logs`', value: 'View recent bot terminal activity' }
            );
        message.channel.send({ embeds: [adminEmbed] });
    }

    if (command === 'logs') {
        const logContent = botLogs.length > 0 ? botLogs.join('\n') : "No logs available yet.";
        message.channel.send(`**Terminal Logs:**\n\`\`\`txt\n${logContent}\n\`\`\``);
    }

    if (command === 'kick') {
        if (!target) return message.reply("Please mention a user.");
        await target.kick(reason).catch(e => addLog(`Error Kicking: ${e.message}`));
        message.channel.send(`✅ **${target.user.tag}** kicked.`);
        addLog(`Kicked ${target.user.tag} for ${reason}`);
    }

    if (command === 'ban') {
        if (!target) return message.reply("Please mention a user.");
        await target.ban({ reason }).catch(e => addLog(`Error Banning: ${e.message}`));
        message.channel.send(`⛔ **${target.user.tag}** banned.`);
        addLog(`Banned ${target.user.tag}`);
    }

    if (command === 'mute') {
        if (!target) return message.reply("Mention a user.");
        await target.timeout(60 * 60 * 1000, reason).catch(e => addLog(`Error Muting: ${e.message}`));
        message.channel.send(`🔇 **${target.user.tag}** muted for 1 hour.`);
        addLog(`Muted ${target.user.tag}`);
    }

    if (command === 'unmute') {
        if (!target) return message.reply("Mention a user.");
        await target.timeout(null).catch(e => addLog(`Error Unmuting: ${e.message}`));
        message.channel.send(`🔊 **${target.user.tag}** unmuted.`);
        addLog(`Unmuted ${target.user.tag}`);
    }

    if (command === 'warn') {
        if (!target) return message.reply("Mention a user.");
        target.send(`⚠️ Warning from **${message.guild.name}**: ${reason}`).catch(() => {});
        message.channel.send(`⚠️ **${target.user.tag}** warned.`);
        addLog(`Warned ${target.user.tag}`);
    }

    if (command === 'purge') {
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply("Enter 1-100.");
        await message.channel.bulkDelete(amount, true).catch(e => addLog(`Error Purging: ${e.message}`));
        message.channel.send(`🧹 Deleted ${amount} messages.`).then(m => setTimeout(() => m.delete(), 3000));
        addLog(`Purged ${amount} messages in #${message.channel.name}`);
    }
});

// Error handling to prevent bot crashes
process.on('unhandledRejection', error => {
    addLog(`CRITICAL ERROR: ${error.message}`);
});

client.login(process.env.TOKEN);
