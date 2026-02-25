const {
    Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder,
    ButtonBuilder, ButtonStyle, ActionRowBuilder, ChannelType
} = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildInvites,
    ],
    partials: ['MESSAGE', 'CHANNEL', 'REACTION'],
});

// ─────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────
const prefix              = 'v!';
const coinEmoji           = '<a:coin:1475856179497275594>';
const giveawayEmoji       = '<:giveaway:1475844346258522273>';
const GIVEAWAY_EMOJI_ID   = '1475844346258522273';
const GIVEAWAY_EMOJI_NAME = 'giveaway';

const WELCOME_CHANNEL_ID  = '1475548830635130990';
const GOODBYE_CHANNEL_ID  = '1475913121951387759';
const INVITE_LOG_CHANNEL  = '1475548832371703819';
const VOUCH_CHANNEL_ID    = '1475548871483723887';
const VOUCH_EMOJI_ID      = '1475862816861720588';
const STAFF_CHANNEL_ID    = '1475548875376033854';
const PROMO_CHANNEL_ID    = '1475548886218309692';
const DEMO_CHANNEL_ID     = '1475548887434526832';
const STAFFWARN_CHANNEL   = '1475548889028497591';
const TICKET_CATEGORY_ID  = '1475548827476951041';
const CHEST_SHOP_CHANNEL  = '1475548846669955254';
const ADMIN_ROLE_ID       = '1474425221455937579';

const STAFF_ROLES = [
    'Founder', 'Co-Founder', 'Head of all Staff', 'Server Manager',
    'Head Administrator', 'Senior Administrator', 'Administrator', 'Junior Administrator',
    'Head Moderator', 'Senior Moderator', 'Moderator', 'Trial Moderator',
];

// Chest rewards — SAB and ETFB prizes are separate (one game picked randomly on open)
const CHEST_REWARDS = [
    { weight: 500, rarity: '🟡 Common',    color: 0x95A5A6, sabPrize: '5 Secrets',       etfbPrize: '25OC/S'       },
    { weight: 300, rarity: '🔵 Uncommon',  color: 0x3498DB, sabPrize: '5 Good Secrets',  etfbPrize: '75OC/S'       },
    { weight:   1, rarity: '🌟 JACKPOT!!', color: 0xFFD700, sabPrize: '50 Secrets',       etfbPrize: '4 Celestials' },
];

// ─────────────────────────────────────────
//  DATABASE
// ─────────────────────────────────────────
let db = { users: {}, giveaways: {}, staffMessageId: null, invites: {}, tickets: {}, chestShopMessageId: null };

const loadDB = () => {
    if (!fs.existsSync('./database.json')) return;
    try {
        const raw             = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
        db.users              = raw.users              || {};
        db.giveaways          = raw.giveaways          || {};
        db.staffMessageId     = raw.staffMessageId     || null;
        db.invites            = raw.invites            || {};
        db.tickets            = raw.tickets            || {};
        db.chestShopMessageId = raw.chestShopMessageId || null;
    } catch { console.log('DB load error — starting fresh.'); }
};
loadDB();

const saveData = () => {
    try { fs.writeFileSync('./database.json', JSON.stringify(db, null, 2)); }
    catch (e) { console.error('SAVE ERROR:', e.message); }
};

// Auto-save every 60s as a safety net
setInterval(saveData, 60_000);

// Save on process exit
process.on('SIGINT',  () => { saveData(); process.exit(); });
process.on('SIGTERM', () => { saveData(); process.exit(); });

// ─────────────────────────────────────────
//  LOGGER
// ─────────────────────────────────────────
const botLogs = [];
const logger = (msg) => {
    const e = `[${new Date().toLocaleTimeString()}] ${msg}`;
    botLogs.push(e); console.log(e);
    if (botLogs.length > 50) botLogs.shift();
};

// ─────────────────────────────────────────
//  USER DATA
// ─────────────────────────────────────────
const getUserData = (id) => {
    if (!db.users[id]) db.users[id] = { coins: 0, warns: 0, staffWarns: [], lastWork: 0, lastDaily: 0, inventory: [] };
    const u = db.users[id];
    if (!Array.isArray(u.staffWarns)) u.staffWarns = [];
    if (!Array.isArray(u.inventory))  u.inventory  = [];
    if (typeof u.warns !== 'number')  u.warns      = 0;
    if (typeof u.coins !== 'number')  u.coins      = 0;
    return u;
};

// ─────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────
const parseTime = (str) => {
    if (!str) return null;
    const m = str.match(/^(\d+)(s|sec|m|min|h|hr|hour|d|day)s?$/i);
    if (!m) return null;
    const v = parseInt(m[1]), u = m[2].toLowerCase();
    if (u==='s'||u==='sec')            return v*1000;
    if (u==='m'||u==='min')            return v*60000;
    if (u==='h'||u==='hr'||u==='hour') return v*3600000;
    if (u==='d'||u==='day')            return v*86400000;
    return null;
};

const formatDuration = (ms) => {
    const s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60),d=Math.floor(h/24);
    if(d>0)return`${d}d ${h%24}h`;if(h>0)return`${h}h ${m%60}m`;if(m>0)return`${m}m ${s%60}s`;return`${s}s`;
};

const findRole = (guild, name) => {
    if (!name) return null;
    const l = name.toLowerCase().trim();
    return guild.roles.cache.find(r => r.name.toLowerCase() === l)
        || guild.roles.cache.find(r => r.name.toLowerCase().includes(l))
        || guild.roles.cache.find(r => l.includes(r.name.toLowerCase()) && r.name.length > 3)
        || null;
};

const isStaffMember = (member) => {
    if (!member) return false;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    return member.roles.cache.some(r =>
        r.name === 'bot perms' ||
        STAFF_ROLES.some(sr => r.name.toLowerCase().includes(sr.toLowerCase()) || sr.toLowerCase().includes(r.name.toLowerCase()))
    );
};

const isAdmin = (member) => {
    if (!member) return false;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    return member.roles.cache.has(ADMIN_ROLE_ID);
};

const removeStaffRoles = async (target) => {
    const toRemove = target.roles.cache.filter(r =>
        STAFF_ROLES.some(sn => r.name.toLowerCase().includes(sn.toLowerCase()) || sn.toLowerCase().includes(r.name.toLowerCase()))
    );
    let count = 0;
    for (const [,r] of toRemove) { await target.roles.remove(r).catch(()=>{}); count++; }
    return count;
};

const rollChest = () => {
    const total = CHEST_REWARDS.reduce((a,r) => a+r.weight, 0);
    let rand = Math.random() * total;
    for (const r of CHEST_REWARDS) { rand -= r.weight; if (rand <= 0) return r; }
    return CHEST_REWARDS[0];
};

// ─────────────────────────────────────────
//  CHEST SHOP
// ─────────────────────────────────────────
const buildChestShopEmbed = () => new EmbedBuilder()
    .setTitle('🎁 Mystery Chest Shop')
    .setColor(0xF1C40F)
    .setDescription(
        `Click the button below to purchase a **Mystery Chest** for **250** ${coinEmoji}!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `**🎲 Possible Rewards**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🟡 **Common** *(~62.4% chance)*\n` +
        `> **[SAB]** 5 Secrets\n` +
        `> **[ETFB]** 25OC/S\n\n` +
        `🔵 **Uncommon** *(~37.5% chance)*\n` +
        `> **[SAB]** 5 Good Secrets\n` +
        `> **[ETFB]** 75OC/S\n\n` +
        `🌟 **JACKPOT!!** *(~0.1% chance)*\n` +
        `> **[SAB]** 50 Secrets\n` +
        `> **[ETFB]** 4 Celestials\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `> A random game (**SAB** or **ETFB**) is chosen when you open.\n` +
        `> Use \`v!open chest\` after buying!`
    )
    .setFooter({ text: 'One game only — may the RNG be with you!' });

const chestShopRow = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder()
        .setCustomId('buy_chest')
        .setLabel('🎁 Buy Mystery Chest — 250 coins')
        .setStyle(ButtonStyle.Primary),
);

const updateChestShop = async () => {
    try {
        const ch = await client.channels.fetch(CHEST_SHOP_CHANNEL);
        if (!ch) return;
        const embed = buildChestShopEmbed();
        const row   = chestShopRow();
        if (db.chestShopMessageId) {
            try {
                const existing = await ch.messages.fetch(db.chestShopMessageId);
                await existing.edit({ embeds: [embed], components: [row] });
                return;
            } catch { db.chestShopMessageId = null; saveData(); }
        }
        const recent = await ch.messages.fetch({ limit: 20 });
        const botMsg = recent.find(m => m.author.id === client.user.id && m.embeds.length > 0);
        if (botMsg) {
            await botMsg.edit({ embeds: [embed], components: [row] });
            db.chestShopMessageId = botMsg.id; saveData();
            return;
        }
        await Promise.all(recent.map(m => m.delete().catch(()=>{})));
        const sent = await ch.send({ embeds: [embed], components: [row] });
        db.chestShopMessageId = sent.id; saveData();
        logger(`Chest shop posted (${sent.id})`);
    } catch (err) { logger(`Chest shop error: ${err.message}`); }
};

// ─────────────────────────────────────────
//  STAFF LIST  — role headings ping the role
// ─────────────────────────────────────────
const buildStaffEmbed = async (guild) => {
    try { await guild.members.fetch(); } catch {}
    const fields = [];
    for (const rn of STAFF_ROLES) {
        const role = guild.roles.cache.find(r => r.name.toLowerCase().includes(rn.toLowerCase()))
            || guild.roles.cache.find(r => rn.toLowerCase().includes(r.name.toLowerCase()) && r.name.length > 3);
        if (!role) {
            // No role found — show plain name with no members
            fields.push({ name: `▸ ${rn}`, value: '_None_', inline: false });
            continue;
        }
        const memberList = role.members.size > 0 ? role.members.map(m => `<@${m.id}>`).join('  ') : '_None_';
        // Field name = plain role name (Discord does NOT render mentions in field names)
        // Field value = role mention (clickable/pingable) + member list
        fields.push({
            name: `▸ ${role.name} (${role.members.size})`,
            value: `<@&${role.id}>\n${memberList}`,
            inline: false,
        });
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
        const ch    = await client.channels.fetch(STAFF_CHANNEL_ID);
        const embed = await buildStaffEmbed(ch.guild);
        if (db.staffMessageId) {
            try {
                const existing = await ch.messages.fetch(db.staffMessageId);
                await existing.edit({ embeds: [embed] });
                logger(`Staff list edited (${db.staffMessageId})`);
                return;
            } catch { db.staffMessageId = null; saveData(); }
        }
        const recent = await ch.messages.fetch({ limit: 20 });
        const botMsg = recent.find(m => m.author.id === client.user.id && m.embeds.length > 0);
        if (botMsg) {
            await botMsg.edit({ embeds: [embed] });
            db.staffMessageId = botMsg.id; saveData();
            return;
        }
        await Promise.all(recent.map(m => m.delete().catch(()=>{})));
        const sent = await ch.send({ embeds: [embed] });
        db.staffMessageId = sent.id; saveData();
        logger(`Staff list posted fresh (${sent.id})`);
    } catch (err) { logger(`Staff list error: ${err.message}`); }
};

// ─────────────────────────────────────────
//  GIVEAWAY
// ─────────────────────────────────────────
const buildGiveawayEmbed = (gw, live=true) => {
    const ts = Math.floor(gw.endsAt/1000);
    if (live) return new EmbedBuilder()
        .setTitle(`${giveawayEmoji}  G I V E A W A Y  ${giveawayEmoji}`)
        .setDescription(
            `## ${giveawayEmoji} ${gw.prize} ${giveawayEmoji}\n\n` +
            `> React with ${giveawayEmoji} to enter!\n\n` +
            `**⏰ Ends:** <t:${ts}:R> *(<t:${ts}:f>)*\n` +
            `**🏆 Winners:** ${gw.winners}\n` +
            `**⏱️ Duration:** ${formatDuration(gw.endsAt - gw.startedAt)}\n` +
            `**🎟️ Hosted by:** <@${gw.hostId}>`
        )
        .setColor(0xF1C40F)
        .setFooter({ text: '🎉 Good luck! • Ends' });

    return new EmbedBuilder()
        .setTitle(`${giveawayEmoji}  GIVEAWAY ENDED`)
        .setDescription(
            `## 🎁 ${gw.prize}\n\n` +
            `**🏆 Winner(s):** ${gw.winnerMentions || 'None'}\n` +
            `**🎟️ Hosted by:** <@${gw.hostId}>\n` +
            `**👥 Entries:** ${gw.totalEntries ?? 0}\n` +
            `**🏅 Winners:** ${gw.winners}`
        )
        .setColor(0x2ECC71)
        .setFooter({ text: 'Giveaway ended' });
};

const pickWinnersFromMsg = async (msg, count) => {
    const rxn = msg.reactions.cache.get(GIVEAWAY_EMOJI_NAME)
        || msg.reactions.cache.find(r => r.emoji.id === GIVEAWAY_EMOJI_ID);
    let entries = [];
    if (rxn) { const u = await rxn.users.fetch(); entries = [...u.filter(u => !u.bot).values()]; }
    if (entries.length === 0) return { picked: [], entries };
    const pool = [...entries], picked = [];
    for (let i = 0; i < Math.min(count, entries.length); i++) {
        const idx = Math.floor(Math.random() * pool.length);
        picked.push(pool.splice(idx, 1)[0]);
    }
    return { picked, entries };
};

const endGiveaway = async (channelId, msgId, reroll=false) => {
    const gw = db.giveaways[msgId];
    if (!gw) return;
    if (gw.ended && !reroll) return;
    try {
        const ch  = await client.channels.fetch(channelId);
        const msg = await ch.messages.fetch(msgId);
        const { picked, entries } = await pickWinnersFromMsg(msg, gw.winners);
        let winnerMentions = 'No valid entries';
        if (picked.length > 0) {
            winnerMentions = picked.map(u => `<@${u.id}>`).join(', ');
            for (const w of picked) {
                const d = getUserData(w.id);
                if (gw.isCoins) { d.coins += gw.coinsAmount; }
                else { d.inventory.push({ item: gw.prize, from: 'Giveaway', date: new Date().toLocaleDateString() }); }
            }
            saveData();
            const note = gw.isCoins
                ? ' Coins added to your balance!'
                : ' Use `v!inv` to view your prize, then `v!claim` to open a claim ticket!';
            ch.send(`${reroll ? '🔄 **Reroll!**' : giveawayEmoji} Congratulations ${winnerMentions}! You won **${gw.prize}**!${note}`);
            logger(`GW ${reroll?'rerolled':'ended'}: "${gw.prize}" — ${picked.map(u=>u.tag||u.id).join(', ')}`);
        } else {
            ch.send(`❌ No valid entries for **${gw.prize}**.`);
        }
        gw.ended = true; gw.winnerMentions = winnerMentions; gw.totalEntries = entries.length;
        saveData();
        await msg.edit({ embeds: [buildGiveawayEmbed(gw, false)] });
    } catch (err) { logger(`GW end error: ${err.message}`); }
};

// ─────────────────────────────────────────
//  WELCOME / GOODBYE
// ─────────────────────────────────────────
const sendWelcome = async (member, ch) => ch.send({ embeds: [new EmbedBuilder()
    .setTitle(`✨ Welcome to ${member.guild.name}!`)
    .setDescription(`Hey ${member}, welcome aboard! 🎉\nYou are our **#${member.guild.memberCount}** member!\n\n> Check the rules and enjoy your stay!`)
    .setThumbnail(member.user.displayAvatarURL({dynamic:true,size:512}))
    .setColor(0x5865F2)
    .setFooter({text:member.guild.name,iconURL:member.guild.iconURL({dynamic:true})})
]});

const sendGoodbye = async (member, ch) => ch.send({ embeds: [new EmbedBuilder()
    .setTitle(`👋 Goodbye, ${member.user.username}`)
    .setDescription(`**${member.user.tag}** has left.\nWe now have **${member.guild.memberCount}** members.\n\n> We hope to see you again!`)
    .setThumbnail(member.user.displayAvatarURL({dynamic:true,size:512}))
    .setColor(0xFF4444)
    .setFooter({text:member.guild.name,iconURL:member.guild.iconURL({dynamic:true})})
]});

// ─────────────────────────────────────────
//  TICKET HELPERS
// ─────────────────────────────────────────
const ticketButtons = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('🔒 Close').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Secondary),
);

const createTicket = async (guild, user, reason) => {
    try {
        const name = `claim-${user.username.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,12)}-${Date.now().toString().slice(-4)}`;
        const ch = await guild.channels.create({
            name,
            type: ChannelType.GuildText,
            parent: TICKET_CATEGORY_ID,
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny:  [PermissionsBitField.Flags.ViewChannel] },
                { id: user.id,                 allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                { id: ADMIN_ROLE_ID,            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            ],
        });
        db.tickets[ch.id] = { userId: user.id, reason: reason||'Claim', open: true, createdAt: Date.now() };
        saveData();
        await ch.send({
            content: `${user} — Ticket created! Staff will be with you shortly.`,
            embeds: [new EmbedBuilder()
                .setTitle('🎫 Claim Ticket').setColor(0x5865F2)
                .setDescription(`**User:** ${user}\n**Reason:**\n${reason||'Prize Claim'}\n\n> Staff will deliver your prizes here.`)
            ],
            components: [ticketButtons()],
        });
        return ch;
    } catch (err) { logger(`Ticket create error: ${err.message}`); return null; }
};

// ─────────────────────────────────────────
//  INVITE CACHE
// ─────────────────────────────────────────
const inviteCache = new Map();
const cacheInvites = async (guild) => {
    try { inviteCache.set(guild.id, new Map((await guild.invites.fetch()).map(i=>[i.code,i.uses]))); } catch {}
};

// ─────────────────────────────────────────
//  READY
// ─────────────────────────────────────────
client.once('ready', async () => {
    logger(`Bot Active — ${client.user.tag}`);

    // Resume giveaways
    for (const [id, gw] of Object.entries(db.giveaways)) {
        if (gw.ended) continue;
        const rem = gw.endsAt - Date.now();
        if (rem <= 0) endGiveaway(gw.channelId, id);
        else { setTimeout(() => endGiveaway(gw.channelId, id), rem); logger(`Resumed GW: "${gw.prize}" in ${formatDuration(rem)}`); }
    }

    for (const g of client.guilds.cache.values()) await cacheInvites(g);

    setTimeout(async () => {
        await updateStaffList();
        await updateChestShop();
        setInterval(async () => { await updateStaffList(); await updateChestShop(); }, 3_600_000);
    }, 5000);
});

// ─────────────────────────────────────────
//  INVITE EVENTS
// ─────────────────────────────────────────
client.on('inviteCreate', i => { const c=inviteCache.get(i.guild.id)||new Map(); c.set(i.code,i.uses); inviteCache.set(i.guild.id,c); });
client.on('inviteDelete', i => { const c=inviteCache.get(i.guild.id); if(c) c.delete(i.code); });

client.on('guildMemberAdd', async (member) => {
    const wCh = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (wCh) { await sendWelcome(member, wCh); logger(`Welcome: ${member.user.tag}`); }
    try {
        const oldCache   = inviteCache.get(member.guild.id) || new Map();
        const newInvites = await member.guild.invites.fetch();
        inviteCache.set(member.guild.id, new Map(newInvites.map(i=>[i.code,i.uses])));
        const used  = newInvites.find(i => (oldCache.get(i.code)||0) < i.uses);
        const logCh = member.guild.channels.cache.get(INVITE_LOG_CHANNEL);
        if (logCh) {
            if (used) {
                if (!db.invites[used.inviterId]) db.invites[used.inviterId] = { count:0, users:[] };
                db.invites[used.inviterId].count++;
                db.invites[used.inviterId].users.push(member.id);
                saveData();
                logCh.send({ embeds: [new EmbedBuilder()
                    .setTitle('📨 Member Joined').setColor(0x2ECC71)
                    .setDescription(`${member} joined using an invite from <@${used.inviterId}>\n**Code:** \`${used.code}\`\n**Total invites by <@${used.inviterId}>:** ${db.invites[used.inviterId].count}`)
                    .setThumbnail(member.user.displayAvatarURL({dynamic:true}))
                ]});
            } else {
                logCh.send({ embeds: [new EmbedBuilder()
                    .setTitle('📨 Member Joined').setColor(0x99AAB5)
                    .setDescription(`${member} joined — invite source unknown.`)
                    .setThumbnail(member.user.displayAvatarURL({dynamic:true}))
                ]});
            }
        }
    } catch (err) { logger(`Invite track error: ${err.message}`); }
});

client.on('guildMemberRemove', async (member) => {
    const gCh = member.guild.channels.cache.get(GOODBYE_CHANNEL_ID);
    if (gCh) { await sendGoodbye(member, gCh); logger(`Goodbye: ${member.user.tag}`); }
    try {
        const logCh = member.guild.channels.cache.get(INVITE_LOG_CHANNEL);
        if (!logCh) return;
        let invitedBy = null;
        for (const [id,data] of Object.entries(db.invites)) { if (data.users&&data.users.includes(member.id)) { invitedBy=id; break; } }
        logCh.send({ embeds: [new EmbedBuilder()
            .setTitle('📤 Member Left').setColor(0xFF4444)
            .setDescription(`**${member.user.tag}** left.\n${invitedBy?`**Was invited by:** <@${invitedBy}>`:'Invite source unknown'}`)
            .setThumbnail(member.user.displayAvatarURL({dynamic:true}))
        ]});
    } catch {}
});

// ─────────────────────────────────────────
//  VOUCH AUTO-REACT
// ─────────────────────────────────────────
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || msg.channel.id !== VOUCH_CHANNEL_ID) return;
    try { const e=msg.guild.emojis.cache.get(VOUCH_EMOJI_ID); if(e) await msg.react(e); } catch {}
});

// ─────────────────────────────────────────
//  BUTTON INTERACTIONS
// ─────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    // ── Chest shop buy button ──
    if (interaction.customId === 'buy_chest') {
        const data = getUserData(interaction.user.id);
        if (data.coins < 250) {
            return interaction.reply({ embeds: [new EmbedBuilder()
                .setTitle('❌ Not Enough Coins')
                .setDescription(`You need **250** ${coinEmoji} but only have **${data.coins}**.`)
                .setColor(0xFF0000)
            ], ephemeral: true });
        }
        data.coins -= 250;
        data.inventory.push({ item: '🎁 Mystery Chest', from: 'Shop', date: new Date().toLocaleDateString() });
        saveData();
        return interaction.reply({ embeds: [new EmbedBuilder()
            .setTitle('✅ Mystery Chest Purchased!')
            .setDescription(`You bought a **Mystery Chest** for **250** ${coinEmoji}!\n> Balance: **${data.coins}** ${coinEmoji}\n> Use \`v!open chest\` to open it and discover your prize!`)
            .setColor(0x2ECC71)
        ], ephemeral: true });
    }

    // ── Ticket buttons ──
    const ticket = db.tickets[interaction.channel.id];
    if (!ticket) return;
    if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: '❌ Only admins can manage tickets.', ephemeral: true });
    }

    if (interaction.customId === 'ticket_close') {
        await interaction.channel.permissionOverwrites.edit(ticket.userId, { SendMessages: false }).catch(()=>{});
        ticket.open = false; saveData();
        await interaction.update({
            embeds: [new EmbedBuilder().setTitle('🔒 Ticket Closed').setDescription(`Closed by ${interaction.user}.`).setColor(0xFF4444)],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_reopen').setLabel('🔓 Reopen').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('ticket_delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger),
            )],
        });
    }

    if (interaction.customId === 'ticket_reopen') {
        await interaction.channel.permissionOverwrites.edit(ticket.userId, { SendMessages: true }).catch(()=>{});
        ticket.open = true; saveData();
        await interaction.update({
            embeds: [new EmbedBuilder().setTitle('🔓 Ticket Reopened').setDescription(`Reopened by ${interaction.user}.`).setColor(0x2ECC71)],
            components: [ticketButtons()],
        });
    }

    if (interaction.customId === 'ticket_delete') {
        await interaction.reply({ content: '🗑️ Deleting ticket in 3s...' });
        delete db.tickets[interaction.channel.id]; saveData();
        setTimeout(() => interaction.channel.delete().catch(()=>{}), 3000);
    }
});

// ─────────────────────────────────────────
//  ANTI-SPAM + COINS + COMMANDS
// ─────────────────────────────────────────
let lastAuthorId=null, consecutiveCount=0;

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (!message.content.startsWith(prefix)) {
        const staff = isStaffMember(message.member);
        if (message.author.id === lastAuthorId) consecutiveCount++;
        else { lastAuthorId=message.author.id; consecutiveCount=1; }
        if (consecutiveCount >= 5 && !staff) {
            const d=getUserData(message.author.id);
            d.warns++; d.coins=Math.max(0,d.coins-50); saveData(); consecutiveCount=0;
            message.channel.send({ content:`${message.author}`, embeds:[new EmbedBuilder()
                .setTitle('🚫 Anti-Spam').setColor(0xFF0000)
                .setDescription(`Too many consecutive messages!\n> Lost **50** ${coinEmoji} and received a warning.`)
                .addFields({name:'⚠️ Warns',value:`${d.warns}`,inline:true})
            ]});
        } else if (consecutiveCount>=5&&staff) { consecutiveCount=0; }
        getUserData(message.author.id).coins++;
        saveData();
        return;
    }

    const args    = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const admin   = isAdmin(message.member);

    try {

    // ══════════════════════════════════════
    //  PUBLIC COMMANDS
    // ══════════════════════════════════════

    if (command==='help'||command==='h') {
        return message.channel.send({ embeds: [new EmbedBuilder()
            .setTitle('📖 Command List')
            .setColor(0x5865F2)
            .setDescription(`Prefix: \`v!\` — For admin commands: \`v!adminhelp\` / \`v!ah\``)
            .addFields(
                { name: '💰 Economy',           value: '`v!coins` `v!c` `v!bal` `v!balance`\n`v!work` `v!daily` `v!gamble <amt>` `v!transfer @u <amt>`\n`v!leaderboard`', inline: false },
                { name: '🎁 Chest & Inventory', value: '`v!inv [@user]` — View inventory\n`v!open chest` — Open a Mystery Chest\n`v!claim` — Claim all prizes (creates ticket)\n*(Buy chests in the shop channel!)*', inline: false },
                { name: 'ℹ️ Info',              value: '`v!serverinfo` / `v!si`\n`v!userinfo [@user]` / `v!ui`\n`v!staffinfo [@user]`', inline: false },
                { name: '🎮 Fun',               value: '`v!8ball <question>`', inline: false },
            )
        ]});
    }

    if (command==='coins'||command==='c'||command==='bal'||command==='balance') {
        const target = message.mentions.users.first() || message.author;
        const data   = getUserData(target.id);
        await message.guild.members.fetch().catch(()=>{});
        const nonAdmin = Object.entries(db.users).filter(([id])=>{
            const m=message.guild.members.cache.get(id);
            return m&&!m.permissions.has(PermissionsBitField.Flags.Administrator)&&!m.roles.cache.has(ADMIN_ROLE_ID);
        });
        const rank = nonAdmin.sort(([,a],[,b])=>b.coins-a.coins).findIndex(([id])=>id===target.id)+1;
        return message.channel.send({ embeds: [new EmbedBuilder()
            .setTitle('💰 Wallet')
            .setColor(0xF1C40F)
            .setThumbnail(target.displayAvatarURL({dynamic:true,size:256}))
            .addFields(
                { name: '👤 User',          value: `${target}`, inline: true },
                { name: `${coinEmoji} Coins`,  value: `**${data.coins}**`, inline: true },
                { name: '📊 Rank',          value: `#${rank||'N/A'}`, inline: true },
                { name: '⚠️ Warns',         value: `${data.warns}`, inline: true },
                { name: '🎒 Inventory',     value: `${data.inventory.length} item(s)`, inline: true },
            )
            .setFooter({ text: target.tag })
        ]});
    }

    if (command==='work') {
        const data=getUserData(message.author.id);
        const rem=3_600_000-(Date.now()-data.lastWork);
        if(rem>0) return message.reply({embeds:[new EmbedBuilder().setTitle('⏳ Cooldown').setColor(0xFF9900).setDescription(`Work again in **${Math.ceil(rem/60000)} min**.`)]});
        const earned=Math.floor(Math.random()*100)+10;
        data.coins+=earned; data.lastWork=Date.now(); saveData();
        return message.channel.send({embeds:[new EmbedBuilder().setTitle('💼 Work Complete!').setColor(0x2ECC71)
            .setDescription(`You earned **${earned}** ${coinEmoji}!\n> Balance: **${data.coins}** ${coinEmoji}`)]});
    }

    if (command==='daily') {
        const data=getUserData(message.author.id);
        const rem=86_400_000-(Date.now()-data.lastDaily);
        if(rem>0) return message.reply({embeds:[new EmbedBuilder().setTitle('⏳ Already Claimed').setColor(0xFF9900).setDescription(`Come back in **${Math.ceil(rem/3600000)} hr(s)**.`)]});
        const earned=Math.floor(Math.random()*11)+10;
        data.coins+=earned; data.lastDaily=Date.now(); saveData();
        return message.channel.send({embeds:[new EmbedBuilder().setTitle('🎁 Daily Reward!').setColor(0xF1C40F)
            .setDescription(`You claimed **${earned}** ${coinEmoji}!\n> Balance: **${data.coins}** ${coinEmoji}`)]});
    }

    if (command==='gamble') {
        const amt=parseInt(args[0]); const data=getUserData(message.author.id);
        if(isNaN(amt)||amt<10) return message.reply({embeds:[new EmbedBuilder().setDescription('❌ Min gamble is **10** coins.').setColor(0xFF0000)]});
        if(data.coins<amt)     return message.reply({embeds:[new EmbedBuilder().setDescription('❌ Not enough coins.').setColor(0xFF0000)]});
        const win=Math.random()>0.5; data.coins+=win?amt:-amt; saveData();
        return message.reply({embeds:[new EmbedBuilder()
            .setTitle(win?'🎲 You Won!':'🎲 You Lost!')
            .setDescription(`You ${win?'won':'lost'} **${amt}** ${coinEmoji}!\n> Balance: **${data.coins}** ${coinEmoji}`)
            .setColor(win?0x2ECC71:0xFF0000)]});
    }

    if (command==='transfer') {
        const target=message.mentions.users.first(); const amt=parseInt(args[1]);
        if(!target)                       return message.reply('❌ Mention a user.');
        if(target.id===message.author.id) return message.reply('❌ Cannot transfer to yourself.');
        if(target.bot)                    return message.reply('❌ Cannot transfer to a bot.');
        if(isNaN(amt)||amt<1)             return message.reply('❌ Enter a valid amount (≥1).');
        const sData=getUserData(message.author.id);
        if(sData.coins<amt)               return message.reply('❌ Not enough coins.');
        const tData=getUserData(target.id); sData.coins-=amt; tData.coins+=amt; saveData();
        return message.channel.send({embeds:[new EmbedBuilder().setTitle(`${coinEmoji} Transfer Complete`).setColor(0x2ECC71)
            .setDescription(`**${message.author.username}** sent **${amt}** ${coinEmoji} to **${target.username}**.`)
            .addFields({name:'Your Balance',value:`${sData.coins} ${coinEmoji}`,inline:true},{name:`${target.username}'s Bal`,value:`${tData.coins} ${coinEmoji}`,inline:true})]});
    }

    if (command==='leaderboard'||command==='lb') {
        await message.guild.members.fetch().catch(()=>{});
        const sorted=Object.entries(db.users)
            .filter(([id])=>{const m=message.guild.members.cache.get(id); return m&&!m.permissions.has(PermissionsBitField.Flags.Administrator)&&!m.roles.cache.has(ADMIN_ROLE_ID);})
            .sort(([,a],[,b])=>b.coins-a.coins).slice(0,10);
        const medals=['🥇','🥈','🥉'];
        const lines=sorted.map(([id,d],i)=>`${medals[i]||`**#${i+1}**`} <@${id}> — **${d.coins}** ${coinEmoji}`).join('\n');
        return message.channel.send({embeds:[new EmbedBuilder().setTitle(`${coinEmoji} Top 10 Leaderboard`).setDescription(lines||'No data yet.').setColor(0xF1C40F)]});
    }

    if (command==='inv') {
        const target=message.mentions.users.first()||message.author;
        const data=getUserData(target.id);
        if(data.inventory.length===0) return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle(`🎒 ${target.username}'s Inventory`).setDescription('Empty! Buy a chest in the shop channel.').setColor(0x99AAB5)]});
        const lines=data.inventory.map((e,i)=>`**${i+1}.** ${e.item}\n> *From: ${e.from}* — ${e.date}`).join('\n\n');
        return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle(`🎒 ${target.username}'s Inventory`).setDescription(lines).setColor(0xF1C40F)
            .setFooter({text:`${data.inventory.length} item(s) • v!open chest | v!claim to claim prizes`})]});
    }

    if (command==='open'&&args[0]==='chest') {
        const data=getUserData(message.author.id);
        const idx=data.inventory.findIndex(e=>e.item.toLowerCase().includes('chest'));
        if(idx===-1) return message.reply('❌ You don\'t have a Mystery Chest! Buy one in the shop channel.');
        // Remove chest first
        data.inventory.splice(idx,1);
        const reward=rollChest();
        const game=Math.random()<0.5?'SAB':'ETFB';
        const prize=game==='SAB'?reward.sabPrize:reward.etfbPrize;
        const fullPrize=`${prize} [${game}]`;
        data.inventory.push({item:fullPrize,from:'Mystery Chest',date:new Date().toLocaleDateString()});
        saveData();
        return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle('🎁 Mystery Chest Opened!')
            .setColor(reward.color)
            .setDescription(
                `${message.author} cracked open a **Mystery Chest**!\n\n` +
                `**${reward.rarity}**\n` +
                `> 🎮 **Game:** ${game}\n` +
                `> 🏆 **Prize:** ${prize}\n\n` +
                `Prize added to your inventory!\nUse \`v!claim\` to open a ticket and receive it.`
            )
            .setFooter({text:'Prize saved to your inventory.'})
        ]});
    }

    if (command==='claim') {
        const data=getUserData(message.author.id);
        if(data.inventory.length===0) return message.reply('❌ Your inventory is empty — nothing to claim!');
        const list=data.inventory.map((e,i)=>`${i+1}. ${e.item}`).join('\n');
        // Remove all items from inventory
        const saved=[...data.inventory];
        data.inventory=[]; saveData();
        const ticket=await createTicket(message.guild,message.author,`Claiming prizes:\n${list}`);
        if(ticket) {
            return message.reply({embeds:[new EmbedBuilder()
                .setTitle('🎫 Claim Ticket Created!').setColor(0x5865F2)
                .setDescription(`Your ticket has been opened in ${ticket}!\n\n**Items claimed:**\n${list}`)
            ]});
        } else {
            // Restore if ticket creation failed
            data.inventory=saved; saveData();
            return message.reply('❌ Could not create ticket. Please contact an admin.');
        }
    }

    if (command==='serverinfo'||command==='si') {
        const g=message.guild; await g.members.fetch().catch(()=>{});
        const bots=g.members.cache.filter(m=>m.user.bot).size;
        return message.channel.send({embeds:[new EmbedBuilder().setTitle(`🏠 ${g.name}`).setColor(0x5865F2)
            .setThumbnail(g.iconURL({dynamic:true,size:512})).setFooter({text:`ID: ${g.id}`})
            .addFields(
                {name:'👑 Owner',   value:`<@${g.ownerId}>`,inline:true},
                {name:'📅 Created',value:`<t:${Math.floor(g.createdTimestamp/1000)}:D>`,inline:true},
                {name:'👥 Members',value:`${g.memberCount} (${g.memberCount-bots} human, ${bots} bots)`,inline:true},
                {name:'💬 Channels',value:`${g.channels.cache.size}`,inline:true},
                {name:'🎭 Roles',  value:`${g.roles.cache.size}`,inline:true},
                {name:'🚀 Boosts', value:`Level ${g.premiumTier} (${g.premiumSubscriptionCount||0})`,inline:true},
            )]});
    }

    if (command==='userinfo'||command==='ui') {
        const target=message.mentions.members.first()||message.member;
        const roles=target.roles.cache.filter(r=>r.id!==message.guild.id).sort((a,b)=>b.position-a.position).map(r=>r.toString()).slice(0,5).join(', ')||'None';
        return message.channel.send({embeds:[new EmbedBuilder().setTitle(`👤 ${target.user.tag}`).setColor(target.displayHexColor||0x5865F2)
            .setThumbnail(target.user.displayAvatarURL({dynamic:true,size:512}))
            .addFields(
                {name:'🆔 ID',       value:target.id,inline:true},
                {name:'📅 Joined',  value:`<t:${Math.floor(target.joinedTimestamp/1000)}:D>`,inline:true},
                {name:'🎂 Created', value:`<t:${Math.floor(target.user.createdTimestamp/1000)}:D>`,inline:true},
                {name:'🤖 Bot?',    value:target.user.bot?'Yes':'No',inline:true},
                {name:'🎭 Top Roles',value:roles,inline:false},
            )]});
    }

    if (command==='8ball') {
        const q=args.join(' '); if(!q) return message.reply('❌ Ask a question!');
        const A=['✅ It is certain.','✅ Without a doubt.','✅ Yes, definitely.','✅ Most likely.','✅ Outlook good.','✅ Signs point to yes.',
            '🤔 Reply hazy, try again.','🤔 Ask again later.','🤔 Cannot predict now.',
            '❌ Don\'t count on it.','❌ Very doubtful.','❌ My sources say no.','❌ Outlook not so good.','❌ Absolutely not.'];
        return message.channel.send({embeds:[new EmbedBuilder().setTitle('🎱 Magic 8-Ball').setColor(0x2C2F33)
            .addFields({name:'❓ Question',value:q},{name:'🎱 Answer',value:A[Math.floor(Math.random()*A.length)]})]});
    }

    if (command==='staffinfo') {
        const target=message.mentions.members.first()||message.member;
        const staffRole=target.roles.cache.find(r=>STAFF_ROLES.some(sn=>r.name.toLowerCase().includes(sn.toLowerCase())||sn.toLowerCase().includes(r.name.toLowerCase())));
        const data=getUserData(target.id);
        const warnLines=data.staffWarns.length>0
            ?data.staffWarns.map((w,i)=>`**${i+1}.** ${w.reason} — *by ${w.by}* (${w.date})`).join('\n')
            :'_None_';
        return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle(`🧑‍💼 Staff Info — ${target.user.username}`)
            .setColor(staffRole?0x5865F2:0x99AAB5)
            .setThumbnail(target.user.displayAvatarURL({dynamic:true,size:256}))
            .addFields(
                {name:'👤 User',      value:`${target}`,inline:true},
                {name:'🏅 Staff Role',value:staffRole?`<@&${staffRole.id}>`:'_Not staff_',inline:true},
                {name:'📅 Joined',    value:`<t:${Math.floor(target.joinedTimestamp/1000)}:D>`,inline:true},
                {name:`⚠️ Staff Warns (${data.staffWarns.length})`,value:warnLines,inline:false},
            )]});
    }

    // ══════════════════════════════════════
    //  ADMIN GATE
    // ══════════════════════════════════════
    if (!admin) return;

    if (command==='adminhelp'||command==='ah') {
        return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle('🔐 Admin Command Panel').setColor(0xFF0000)
            .setDescription(`All commands require <@&${ADMIN_ROLE_ID}> or Administrator.`)
            .addFields(
                {name:'👥 Staff',          value:'`v!promo @u <role>` `v!demo @u <role>` `v!fire @u`\n`v!staffwarn @u <reason>` `v!updatestaff` `v!staffinfo @u`',inline:false},
                {name:'🔨 Moderation',     value:'`v!warn @u` `v!unwarn @u` `v!warns @u`\n`v!kick @u [reason]` `v!ban @u [reason]`\n`v!mute @u [mins]` `v!unmute @u`',inline:false},
                {name:'📢 Channels',       value:'`v!purge <n>` `v!purge all` `v!lock` `v!unlock`',inline:false},
                {name:'🎉 Coin Giveaway',  value:'`v!giveaway <coins> <time> [winners]` / `v!gw`\n*(Number prize → coins added to balance)*',inline:false},
                {name:'🎁 Item Giveaway',  value:'`v!itemgw <prize text> <time> [winners]`\n*(Text prize → goes to winners\' inventory)*',inline:false},
                {name:'🔄 GW Tools',       value:'`v!reroll <messageId>` `v!end <messageId>`',inline:false},
                {name:'💰 Economy',        value:'`v!add coins @u <n>` `v!remove coins @u <n>` `v!reset coins @u`',inline:false},
                {name:'🎒 Inventory',      value:'`v!addinv @u <item>` `v!clearinv @u`',inline:false},
                {name:'✏️ Misc',           value:'`v!setnick @u <n>` / `v!changenick @u <n>`\n`v!logs` `v!test welcome` `v!test goodbye`',inline:false},
                {name:'🎫 Tickets',        value:'`v!close` `v!open` `v!rename <n>` *(inside ticket channel)*',inline:false},
            )
        ]});
    }

    if (command==='staffwarn') {
        const target=message.mentions.members.first(); const reason=args.slice(1).join(' ');
        if(!target) return message.reply('❌ Usage: `v!staffwarn @user <reason>`');
        if(!reason) return message.reply('❌ Provide a reason.');
        if(!isStaffMember(target)) return message.reply('❌ That user is not staff. Use `v!warn` for regular members.');
        const data=getUserData(target.id);
        data.staffWarns.push({reason,by:message.author.tag,date:new Date().toLocaleDateString()});
        saveData();
        const embed=new EmbedBuilder().setTitle('⚠️ Staff Warning Issued').setColor(0xFF9900)
            .setThumbnail(target.user.displayAvatarURL({dynamic:true,size:256}))
            .addFields(
                {name:'👤 Staff Member',      value:`${target}`,inline:true},
                {name:'📋 Issued by',         value:`${message.author}`,inline:true},
                {name:'⚠️ Total Staff Warns', value:`${data.staffWarns.length}`,inline:true},
                {name:'📝 Reason',            value:reason,inline:false},
            );
        const warnCh=message.guild.channels.cache.get(STAFFWARN_CHANNEL);
        if(warnCh) await warnCh.send({content:`${target}`,embeds:[embed]});
        message.reply(`✅ Staff warning issued to **${target.user.username}**. Posted in <#${STAFFWARN_CHANNEL}>.`);
        logger(`StaffWarn: ${target.user.tag} — "${reason}" by ${message.author.tag}`);
    }

    if (command==='warn') {
        const target=message.mentions.users.first(); if(!target) return message.reply('❌ Mention a user.');
        const data=getUserData(target.id); data.warns++; saveData();
        message.channel.send({content:`<@${target.id}>`,embeds:[new EmbedBuilder().setTitle('⚠️ Warning Issued').setColor(0xFF9900)
            .setDescription(`**${target.tag}** has been warned.\n> Total warnings: **${data.warns}**`)]});
    }

    if (command==='unwarn') {
        const target=message.mentions.users.first(); if(!target) return message.reply('❌ Mention a user.');
        const data=getUserData(target.id); data.warns=Math.max(0,data.warns-1); saveData();
        message.channel.send({embeds:[new EmbedBuilder().setTitle('✅ Warning Removed').setColor(0x2ECC71)
            .setDescription(`**${target.tag}** now has **${data.warns}** warning(s).`)]});
    }

    if (command==='warns') {
        const target=message.mentions.users.first()||message.author;
        const data=getUserData(target.id);
        message.channel.send({embeds:[new EmbedBuilder().setTitle(`⚠️ Warnings — ${target.username}`).setColor(0xFF9900)
            .setDescription(`**${data.warns}** regular warning(s).`)]});
    }

    if (command==='kick') {
        const target=message.mentions.members.first(); const reason=args.slice(1).join(' ')||'No reason';
        if(!target) return message.reply('❌ Mention a user.');
        await target.kick(reason);
        message.channel.send({content:`<@${target.id}>`,embeds:[new EmbedBuilder().setTitle('👢 Kicked').setColor(0xFF9900)
            .setDescription(`**${target.user.tag}** was kicked.\n> **Reason:** ${reason}`)]});
    }

    if (command==='ban') {
        const target=message.mentions.members.first(); const reason=args.slice(1).join(' ')||'No reason';
        if(!target) return message.reply('❌ Mention a user.');
        await target.ban({reason});
        message.channel.send({content:`<@${target.id}>`,embeds:[new EmbedBuilder().setTitle('🔨 Banned').setColor(0xFF0000)
            .setDescription(`**${target.user.tag}** was banned.\n> **Reason:** ${reason}`)]});
    }

    if (command==='mute') {
        const target=message.mentions.members.first(); if(!target) return message.reply('❌ Mention a user.');
        const mins=parseInt(args[1])||60;
        await target.timeout(mins*60_000,`Muted by ${message.author.tag}`);
        message.channel.send({content:`<@${target.id}>`,embeds:[new EmbedBuilder().setTitle('🔇 Muted').setColor(0xFF9900)
            .setDescription(`**${target.user.tag}** muted for **${mins} min**.`)]});
    }

    if (command==='unmute') {
        const target=message.mentions.members.first(); if(!target) return message.reply('❌ Mention a user.');
        await target.timeout(null);
        message.channel.send({embeds:[new EmbedBuilder().setTitle('🔊 Unmuted').setColor(0x2ECC71)
            .setDescription(`**${target.user.tag}** has been unmuted.`)]});
    }

    if (command==='purge') {
        if(args[0]==='all') {
            let deleted=0,fetched;
            do{fetched=await message.channel.bulkDelete(100,true);deleted+=fetched.size;}while(fetched.size>=2);
            const m=await message.channel.send({embeds:[new EmbedBuilder().setTitle('🧹 Purge Complete').setDescription(`Deleted **${deleted}** messages.`).setColor(0xFF4444)]});
            setTimeout(()=>m.delete().catch(()=>{}),4000);
        } else {
            const amt=parseInt(args[0]);
            if(isNaN(amt)||amt<1||amt>100) return message.reply('❌ Enter 1–100 or `v!purge all`.');
            await message.channel.bulkDelete(amt+1,true);
            const m=await message.channel.send({embeds:[new EmbedBuilder().setTitle('🧹 Purge Complete').setDescription(`Deleted **${amt}** messages.`).setColor(0xFF4444)]});
            setTimeout(()=>m.delete().catch(()=>{}),4000);
        }
    }

    if (command==='lock') {
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone,{SendMessages:false});
        message.channel.send({embeds:[new EmbedBuilder().setTitle('🔒 Channel Locked').setDescription(`**#${message.channel.name}** has been locked.`).setColor(0xFF0000)]});
    }

    if (command==='unlock') {
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone,{SendMessages:true});
        message.channel.send({embeds:[new EmbedBuilder().setTitle('🔓 Channel Unlocked').setDescription(`**#${message.channel.name}** has been unlocked.`).setColor(0x2ECC71)]});
    }

    if (command==='setnick'||command==='changenick') {
        const target=message.mentions.members.first(); const nick=args.slice(1).join(' ');
        if(!target) return message.reply('❌ Mention a user.');
        if(!nick)   return message.reply('❌ Provide a nickname.');
        await target.setNickname(nick);
        message.channel.send({embeds:[new EmbedBuilder().setTitle('✏️ Nickname Changed').setColor(0x5865F2)
            .setDescription(`**${target.user.tag}** → **${nick}**`)]});
    }

    if (command==='add'&&args[0]==='coins') {
        const target=message.mentions.users.first(); const amt=parseInt(args[2]);
        if(!target||isNaN(amt)) return message.reply('❌ Usage: `v!add coins @user <amt>`');
        getUserData(target.id).coins+=amt; saveData();
        message.channel.send({embeds:[new EmbedBuilder().setTitle('✅ Coins Added').setColor(0x2ECC71)
            .setDescription(`Added **${amt}** ${coinEmoji} to **${target.username}**.`)]});
    }

    if (command==='remove'&&args[0]==='coins') {
        const target=message.mentions.users.first(); const amt=parseInt(args[2]);
        if(!target||isNaN(amt)) return message.reply('❌ Usage: `v!remove coins @user <amt>`');
        const d=getUserData(target.id); d.coins=Math.max(0,d.coins-amt); saveData();
        message.channel.send({embeds:[new EmbedBuilder().setTitle('✅ Coins Removed').setColor(0xFF9900)
            .setDescription(`Removed **${amt}** ${coinEmoji} from **${target.username}**.`)]});
    }

    if (command==='reset'&&args[0]==='coins') {
        const target=message.mentions.users.first(); if(!target) return message.reply('❌ Mention a user.');
        getUserData(target.id).coins=0; saveData();
        message.channel.send({embeds:[new EmbedBuilder().setTitle('🔄 Coins Reset').setColor(0xFF9900)
            .setDescription(`**${target.username}**'s coins reset to 0.`)]});
    }

    if (command==='addinv') {
        const target=message.mentions.users.first(); const item=args.slice(1).join(' ');
        if(!target) return message.reply('❌ Usage: `v!addinv @user <item>`');
        if(!item)   return message.reply('❌ Provide an item name.');
        getUserData(target.id).inventory.push({item,from:'Admin',date:new Date().toLocaleDateString()});
        saveData();
        message.channel.send({embeds:[new EmbedBuilder().setTitle('✅ Item Added').setColor(0x2ECC71)
            .setDescription(`Added **${item}** to **${target.username}**'s inventory.`)]});
    }

    if (command==='clearinv') {
        const target=message.mentions.users.first(); if(!target) return message.reply('❌ Mention a user.');
        const d=getUserData(target.id); const count=d.inventory.length; d.inventory=[]; saveData();
        message.channel.send({embeds:[new EmbedBuilder().setTitle('🗑️ Inventory Cleared').setColor(0xFF9900)
            .setDescription(`Cleared **${count}** item(s) from **${target.username}**'s inventory.`)]});
    }

    if (command==='logs') {
        message.channel.send({embeds:[new EmbedBuilder().setTitle('🖥️ Bot Logs').setColor(0x2C2F33)
            .setDescription(`\`\`\`\n${botLogs.join('\n')||'Empty'}\n\`\`\``)]});
    }

    if (command==='test') {
        const sub=args[0]?.toLowerCase();
        if(sub==='welcome') {
            const ch=message.guild.channels.cache.get(WELCOME_CHANNEL_ID);
            if(!ch) return message.reply('❌ Welcome channel not found.');
            await sendWelcome(message.member,ch); message.reply('✅ Welcome test sent!');
        } else if(sub==='goodbye') {
            const ch=message.guild.channels.cache.get(GOODBYE_CHANNEL_ID);
            if(!ch) return message.reply('❌ Goodbye channel not found.');
            await sendGoodbye(message.member,ch); message.reply('✅ Goodbye test sent!');
        } else { message.reply('❌ Usage: `v!test welcome` or `v!test goodbye`'); }
    }

    if (command==='updatestaff') {
        message.reply('🔄 Updating staff list...');
        await updateStaffList();
        message.channel.send('✅ Staff list updated!');
    }

    // ── COIN GIVEAWAY ──
    if (command==='giveaway'||command==='gw') {
        if(args.length<2) return message.reply('❌ Usage: `v!giveaway <coins> <time> [winners]`');
        const coinsArg=parseInt(args[0]); const timeArg=args[1]; const winnersArg=parseInt(args[2])||1;
        if(isNaN(coinsArg)||coinsArg<1) return message.reply('❌ Prize must be a number (coins). For item prizes use `v!itemgw`.');
        const durationMs=parseTime(timeArg);
        if(!durationMs) return message.reply('❌ Invalid time. Examples: `1m` `1h` `1d`');
        if(winnersArg<1||winnersArg>20) return message.reply('❌ Winners must be 1–20.');
        const prize=`${coinEmoji} ${coinsArg} coins`;
        const gwData={prize,isCoins:true,coinsAmount:coinsArg,hostId:message.author.id,channelId:message.channel.id,winners:winnersArg,endsAt:Date.now()+durationMs,startedAt:Date.now(),ended:false};
        await message.delete().catch(()=>{});
        const gMsg=await message.channel.send({embeds:[buildGiveawayEmbed(gwData,true)]});
        try{await gMsg.react(`${GIVEAWAY_EMOJI_NAME}:${GIVEAWAY_EMOJI_ID}`);}catch{await gMsg.react('🎉');}
        gwData.messageId=gMsg.id; db.giveaways[gMsg.id]=gwData; saveData();
        logger(`GW: "${prize}", ${winnersArg}W, ${formatDuration(durationMs)}`);
        setTimeout(()=>endGiveaway(message.channel.id,gMsg.id),durationMs);
    }

    // ── ITEM GIVEAWAY ──
    if (command==='itemgw') {
        if(args.length<2) return message.reply('❌ Usage: `v!itemgw <prize text> <time> [winners]`');
        let prizeArgs, timeArg, winnersArg=1;
        const last=args[args.length-1]; const secondLast=args[args.length-2];
        if(!isNaN(parseInt(last))&&parseTime(secondLast)) {
            winnersArg=parseInt(last); timeArg=secondLast; prizeArgs=args.slice(0,-2);
        } else if(parseTime(last)) {
            timeArg=last; prizeArgs=args.slice(0,-1);
        } else {
            return message.reply('❌ Could not parse. Usage: `v!itemgw <prize text> <time> [winners]`');
        }
        const prize=prizeArgs.join(' ');
        if(!prize) return message.reply('❌ Provide a prize text.');
        const durationMs=parseTime(timeArg);
        if(!durationMs) return message.reply('❌ Invalid time.');
        if(winnersArg<1||winnersArg>20) return message.reply('❌ Winners must be 1–20.');
        const gwData={prize:`🎁 ${prize}`,isCoins:false,coinsAmount:0,hostId:message.author.id,channelId:message.channel.id,winners:winnersArg,endsAt:Date.now()+durationMs,startedAt:Date.now(),ended:false};
        await message.delete().catch(()=>{});
        const gMsg=await message.channel.send({embeds:[buildGiveawayEmbed(gwData,true)]});
        try{await gMsg.react(`${GIVEAWAY_EMOJI_NAME}:${GIVEAWAY_EMOJI_ID}`);}catch{await gMsg.react('🎉');}
        gwData.messageId=gMsg.id; db.giveaways[gMsg.id]=gwData; saveData();
        logger(`ItemGW: "${prize}", ${winnersArg}W, ${formatDuration(durationMs)}`);
        setTimeout(()=>endGiveaway(message.channel.id,gMsg.id),durationMs);
    }

    // ── REROLL ──
    if (command==='reroll') {
        const msgId=args[0];
        if(!msgId) return message.reply('❌ Usage: `v!reroll <messageId>`');
        const gw=db.giveaways[msgId];
        if(!gw)       return message.reply('❌ No giveaway found with that ID.');
        if(!gw.ended) return message.reply('⚠️ Giveaway hasn\'t ended yet. Use `v!end <id>` first.');
        await endGiveaway(gw.channelId,msgId,true);
        message.reply('✅ Giveaway rerolled!');
    }

    // ── END GW ──
    if (command==='end') {
        const msgId=args[0];
        if(!msgId) return message.reply('❌ Usage: `v!end <messageId>`');
        const gw=db.giveaways[msgId];
        if(!gw)      return message.reply('❌ No giveaway found with that ID.');
        if(gw.ended) return message.reply('⚠️ Already ended. Use `v!reroll <id>` to reroll.');
        await endGiveaway(gw.channelId,msgId);
        message.reply('✅ Giveaway ended early!');
    }

    if (command==='promo') {
        const target=message.mentions.members.first(); const roleName=args.slice(1).join(' ');
        if(!target)   return message.reply('❌ Usage: `v!promo @user <role name>`');
        if(!roleName) return message.reply('❌ Provide a role name.');
        const newRole=findRole(message.guild,roleName);
        if(!newRole)  return message.reply(`❌ Role **${roleName}** not found.`);
        await removeStaffRoles(target);
        await target.roles.add(newRole);
        const embed=new EmbedBuilder().setTitle('🎉 Staff Promotion').setColor(0x2ECC71)
            .setDescription(`Congratulations to ${target}! 🎊\nPromoted to <@&${newRole.id}>!\n> Keep up the great work!`)
            .setThumbnail(target.user.displayAvatarURL({dynamic:true,size:256}))
            .addFields({name:'👤 Member',value:`${target}`,inline:true},{name:'🏅 New Role',value:`<@&${newRole.id}>`,inline:true},{name:'📋 By',value:`${message.author}`,inline:true});
        const ch=message.guild.channels.cache.get(PROMO_CHANNEL_ID);
        if(ch) await ch.send({content:`${target}`,embeds:[embed]});
        message.reply(`✅ **${target.user.username}** promoted to **${newRole.name}**!`);
        await updateStaffList();
        logger(`Promo: ${target.user.tag} → ${newRole.name}`);
    }

    if (command==='demo') {
        const target=message.mentions.members.first(); const roleName=args.slice(1).join(' ');
        if(!target)   return message.reply('❌ Usage: `v!demo @user <role name>`');
        if(!roleName) return message.reply('❌ Provide a role name.');
        const newRole=findRole(message.guild,roleName);
        if(!newRole)  return message.reply(`❌ Role **${roleName}** not found.`);
        await removeStaffRoles(target);
        await target.roles.add(newRole);
        const embed=new EmbedBuilder().setTitle('📉 Staff Demotion').setColor(0xFF4444)
            .setDescription(`${target} has been demoted.\nNew role: <@&${newRole.id}>.\n> Please reflect and improve.`)
            .setThumbnail(target.user.displayAvatarURL({dynamic:true,size:256}))
            .addFields({name:'👤 Member',value:`${target}`,inline:true},{name:'📉 New Role',value:`<@&${newRole.id}>`,inline:true},{name:'📋 By',value:`${message.author}`,inline:true});
        const ch=message.guild.channels.cache.get(DEMO_CHANNEL_ID);
        if(ch) await ch.send({content:`${target}`,embeds:[embed]});
        message.reply(`✅ **${target.user.username}** demoted to **${newRole.name}**.`);
        await updateStaffList();
        logger(`Demo: ${target.user.tag} → ${newRole.name}`);
    }

    if (command==='fire') {
        const target=message.mentions.members.first();
        if(!target) return message.reply('❌ Usage: `v!fire @user`');
        const removed=await removeStaffRoles(target);
        message.channel.send({content:`<@${target.id}>`,embeds:[new EmbedBuilder().setTitle('🔥 Staff Fired').setColor(0xFF0000)
            .setDescription(`**${target.user.tag}** has been removed from the staff team.\n> Removed **${removed}** staff role(s).`)
            .setThumbnail(target.user.displayAvatarURL({dynamic:true,size:256}))
            .addFields({name:'👤 User',value:`${target}`,inline:true},{name:'📋 By',value:`${message.author}`,inline:true})]});
        await updateStaffList();
        logger(`Fire: ${target.user.tag} — ${removed} role(s) by ${message.author.tag}`);
    }

    // ── TICKET COMMANDS ──
    if (command==='close') {
        const ticket=db.tickets[message.channel.id];
        if(!ticket) return message.reply('❌ Not a ticket channel.');
        await message.channel.permissionOverwrites.edit(ticket.userId,{SendMessages:false}).catch(()=>{});
        ticket.open=false; saveData();
        message.channel.send({embeds:[new EmbedBuilder().setTitle('🔒 Ticket Closed').setColor(0xFF4444)
            .setDescription(`Closed by ${message.author}.`)],
            components:[new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_reopen').setLabel('🔓 Reopen').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('ticket_delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger),
            )]});
    }

    if (command==='open'&&db.tickets[message.channel.id]) {
        const ticket=db.tickets[message.channel.id];
        await message.channel.permissionOverwrites.edit(ticket.userId,{SendMessages:true}).catch(()=>{});
        ticket.open=true; saveData();
        message.channel.send({embeds:[new EmbedBuilder().setTitle('🔓 Ticket Reopened').setColor(0x2ECC71)
            .setDescription(`Reopened by ${message.author}.`)],components:[ticketButtons()]});
    }

    if (command==='rename') {
        if(!db.tickets[message.channel.id]) return message.reply('❌ Not a ticket channel.');
        const newName=args.join('-').toLowerCase().replace(/[^a-z0-9-]/g,'');
        if(!newName) return message.reply('❌ Provide a valid name.');
        await message.channel.setName(newName);
        message.channel.send({embeds:[new EmbedBuilder().setTitle('✏️ Ticket Renamed').setColor(0x5865F2)
            .setDescription(`Channel renamed to **${newName}**.`)]});
    }

    } catch(err) {
        logger(`ERR [${command}]: ${err.message}`);
        message.channel.send({embeds:[new EmbedBuilder().setDescription(`❌ Error: \`${err.message}\``).setColor(0xFF0000)]}).catch(()=>{});
    }
});

client.login(process.env.TOKEN);
