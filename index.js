const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
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
const PREFIX        = 'v!';
const COIN_EMOJI    = '<a:coin:1475856179497275594>';
const GW_EMOJI      = '<:giveaway:1475844346258522273>';
const GW_EMOJI_ID   = '1475844346258522273';
const GW_EMOJI_NAME = 'giveaway';

const CH_WELCOME    = '1475548830635130990';
const CH_GOODBYE    = '1475913121951387759';
const CH_INVLOG     = '1475548832371703819';
const CH_VOUCH      = '1475548871483723887';
const CH_STAFF      = '1475548875376033854';
const CH_PROMO      = '1475548886218309692';
const CH_DEMO       = '1475548887434526832';
const CH_STAFFWARN  = '1475548889028497591';
const CH_SHOP       = '1475548846669955254';   // chest shop channel
const CAT_TICKETS   = '1475548827476951041';
const ROLE_ADMIN    = '1474425221455937579';
const VOUCH_EMO_ID  = '1475862816861720588';

const STAFF_ROLES = [
    'Founder','Co-Founder','Head of all Staff','Server Manager',
    'Head Administrator','Senior Administrator','Administrator','Junior Administrator',
    'Head Moderator','Senior Moderator','Moderator','Trial Moderator',
];

// Chest rewards — each has two separate prize pools (SAB and ETFB)
// When opening, bot randomly picks SAB or ETFB for the player
const CHEST_REWARDS = [
    {
        weight: 500, rarity: '🟡 Common', color: 0x95A5A6,
        sab:  '5 Secrets [SAB]',
        etfb: '25oc/s [ETFB]',
        chanceText: '50%',
    },
    {
        weight: 300, rarity: '🔵 Uncommon', color: 0x3498DB,
        sab:  '5 Good Secrets [SAB]',
        etfb: '75oc/s [ETFB]',
        chanceText: '~37.5%',
    },
    {
        weight: 1, rarity: '🌟 JACKPOT', color: 0xFFD700,
        sab:  '50 Secrets [SAB]',
        etfb: '4 Celestials [ETFB]',
        chanceText: '~0.125%',
    },
];

// ─────────────────────────────────────────
//  DATABASE  — load + save
// ─────────────────────────────────────────
let db = { users:{}, giveaways:{}, staffMessageId:null, invites:{}, tickets:{}, shopMessageId:null };

const loadDB = () => {
    if (!fs.existsSync('./database.json')) return;
    try {
        const raw = JSON.parse(fs.readFileSync('./database.json','utf8'));
        db.users          = raw.users          || {};
        db.giveaways      = raw.giveaways      || {};
        db.staffMessageId = raw.staffMessageId || null;
        db.invites        = raw.invites        || {};
        db.tickets        = raw.tickets        || {};
        db.shopMessageId  = raw.shopMessageId  || null;
    } catch(e) { console.error('DB load error:',e.message); }
};
loadDB();

const saveData = () => {
    try { fs.writeFileSync('./database.json', JSON.stringify(db, null, 2)); }
    catch(e) { console.error('DB save error:',e.message); }
};

// Auto-save every 30 seconds as a safety net
setInterval(saveData, 30000);

// ─────────────────────────────────────────
//  USER DATA
// ─────────────────────────────────────────
const getUser = (id) => {
    if (!db.users[id]) db.users[id] = { coins:0, warns:0, staffWarns:[], lastWork:0, lastDaily:0, inventory:[] };
    const u = db.users[id];
    if (!u.staffWarns) u.staffWarns = [];
    if (!u.inventory)  u.inventory  = [];
    if (!u.warns)      u.warns      = 0;
    return u;
};

// ─────────────────────────────────────────
//  LOGGER
// ─────────────────────────────────────────
const LOG = [];
const log = (msg) => {
    const e = `[${new Date().toLocaleTimeString()}] ${msg}`;
    LOG.push(e); console.log(e);
    if (LOG.length > 50) LOG.shift();
};

// ─────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────
const parseTime = (s) => {
    if (!s) return null;
    const m = s.match(/^(\d+)(s|sec|m|min|h|hr|hour|d|day)s?$/i);
    if (!m) return null;
    const v=parseInt(m[1]), u=m[2].toLowerCase();
    if(u==='s'||u==='sec')            return v*1000;
    if(u==='m'||u==='min')            return v*60000;
    if(u==='h'||u==='hr'||u==='hour') return v*3600000;
    if(u==='d'||u==='day')            return v*86400000;
    return null;
};
const fmtDur = (ms) => {
    const s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60),d=Math.floor(h/24);
    if(d>0)return`${d}d ${h%24}h`;if(h>0)return`${h}h ${m%60}m`;if(m>0)return`${m}m ${s%60}s`;return`${s}s`;
};

const findRole = (guild, name) => {
    if (!name) return null;
    const l = name.toLowerCase().trim();
    return guild.roles.cache.find(r=>r.name.toLowerCase()===l)
        || guild.roles.cache.find(r=>r.name.toLowerCase().includes(l))
        || guild.roles.cache.find(r=>l.includes(r.name.toLowerCase())&&r.name.length>3)
        || null;
};

const isStaff = (member) => {
    if (!member) return false;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    return member.roles.cache.some(r=>
        r.name==='bot perms'||
        STAFF_ROLES.some(sr=>r.name.toLowerCase().includes(sr.toLowerCase())||sr.toLowerCase().includes(r.name.toLowerCase()))
    );
};

const isAdmin = (member) => {
    if (!member) return false;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    return member.roles.cache.has(ROLE_ADMIN);
};

const removeStaffRoles = async (target) => {
    const toRemove = target.roles.cache.filter(r=>
        STAFF_ROLES.some(sn=>r.name.toLowerCase().includes(sn.toLowerCase())||sn.toLowerCase().includes(r.name.toLowerCase()))
    );
    let n=0; for(const[,r]of toRemove){await target.roles.remove(r).catch(()=>{});n++;} return n;
};

const rollChest = () => {
    const total = CHEST_REWARDS.reduce((a,r)=>a+r.weight,0);
    let rand = Math.random()*total;
    for(const r of CHEST_REWARDS){rand-=r.weight;if(rand<=0)return r;}
    return CHEST_REWARDS[0];
};

// ─────────────────────────────────────────
//  STAFF LIST — with role pings above each section
// ─────────────────────────────────────────
const buildStaffEmbed = async (guild) => {
    try { await guild.members.fetch(); } catch {}
    const fields = [];
    for (const rn of STAFF_ROLES) {
        const role = guild.roles.cache.find(r=>r.name.toLowerCase().includes(rn.toLowerCase()))
            || guild.roles.cache.find(r=>rn.toLowerCase().includes(r.name.toLowerCase())&&r.name.length>3);
        if (!role) {
            fields.push({ name: `${rn}`, value: `*Role not found*\n_ _`, inline: false });
            continue;
        }
        const memberList = role.members.size > 0
            ? role.members.map(m=>`<@${m.id}>`).join('\n')
            : '_None_';
        // Show role ping above member list so it's clickable
        fields.push({
            name: `${role.name} ─── ${role.members.size} member(s)`,
            value: `<@&${role.id}>\n${memberList}\n_ _`,
            inline: false,
        });
    }
    return new EmbedBuilder()
        .setTitle('👥 Staff List')
        .setDescription(`**${guild.name}** — Full Staff Team`)
        .addFields(fields)
        .setColor(0x5865F2)
        .setFooter({ text:`Last updated: ${new Date().toLocaleString()}` });
};

const updateStaffList = async () => {
    try {
        const ch = await client.channels.fetch(CH_STAFF);
        const embed = await buildStaffEmbed(ch.guild);
        if (db.staffMessageId) {
            try {
                const existing = await ch.messages.fetch(db.staffMessageId);
                await existing.edit({ embeds:[embed] });
                log(`Staff list edited (${db.staffMessageId})`); return;
            } catch { db.staffMessageId=null; saveData(); }
        }
        const recent = await ch.messages.fetch({ limit:20 });
        const botMsg = recent.find(m=>m.author.id===client.user.id&&m.embeds.length>0);
        if (botMsg) {
            await botMsg.edit({ embeds:[embed] });
            db.staffMessageId=botMsg.id; saveData();
            log(`Staff list reused (${botMsg.id})`); return;
        }
        await Promise.all(recent.map(m=>m.delete().catch(()=>{})));
        const sent = await ch.send({ embeds:[embed] });
        db.staffMessageId=sent.id; saveData();
        log(`Staff list fresh (${sent.id})`);
    } catch(err) { log(`Staff list err: ${err.message}`); }
};

// ─────────────────────────────────────────
//  SHOP — button panel posted in CH_SHOP
// ─────────────────────────────────────────
const buildShopEmbed = () => new EmbedBuilder()
    .setTitle('🛒 Vox Shop — Mystery Chest')
    .setColor(0xF1C40F)
    .setDescription(
        `## 🎁 Mystery Chest — **250** ${COIN_EMOJI}\n\n` +
        `Open a Mystery Chest for a chance at exclusive prizes!\n` +
        `You will receive either a **[SAB]** or **[ETFB]** prize — not both.\n\n` +
        `**📦 Possible Rewards:**\n` +
        CHEST_REWARDS.map(r =>
            `${r.rarity} **(${r.chanceText})**\n> 🎮 SAB: **${r.sab}**\n> 🎮 ETFB: **${r.etfb}**`
        ).join('\n\n')
    )
    .setFooter({ text:'Click the button below to buy a Mystery Chest for 250 coins!' });

const shopButtonRow = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('shop_buy_chest').setLabel('🎁 Buy Mystery Chest — 250 coins').setStyle(ButtonStyle.Primary)
);

const updateShopPanel = async () => {
    try {
        const ch = await client.channels.fetch(CH_SHOP);
        const embed = buildShopEmbed();
        const row   = shopButtonRow();
        if (db.shopMessageId) {
            try {
                const existing = await ch.messages.fetch(db.shopMessageId);
                await existing.edit({ embeds:[embed], components:[row] });
                log(`Shop panel updated (${db.shopMessageId})`); return;
            } catch { db.shopMessageId=null; saveData(); }
        }
        const recent = await ch.messages.fetch({ limit:20 });
        await Promise.all(recent.map(m=>m.delete().catch(()=>{})));
        const sent = await ch.send({ embeds:[embed], components:[row] });
        db.shopMessageId=sent.id; saveData();
        log(`Shop panel posted (${sent.id})`);
    } catch(err) { log(`Shop panel err: ${err.message}`); }
};

// ─────────────────────────────────────────
//  GIVEAWAY
// ─────────────────────────────────────────
const buildGwEmbed = (gw, live=true) => {
    const ts = Math.floor(gw.endsAt/1000);
    if (live) return new EmbedBuilder()
        .setTitle(`${GW_EMOJI}  G I V E A W A Y  ${GW_EMOJI}`)
        .setDescription(
            `## 🎁 ${gw.prize}\n\n` +
            `> React with ${GW_EMOJI} below to enter!\n\n` +
            `**⏰ Ends:** <t:${ts}:R>  *(<t:${ts}:f>)*\n` +
            `**🏆 Winners:** ${gw.winners}\n` +
            `**⏱️ Duration:** ${fmtDur(gw.endsAt-gw.startedAt)}\n` +
            `**🎟️ Hosted by:** <@${gw.hostId}>\n` +
            (gw.isItem ? `\n> 🎒 Winners receive this prize in their inventory!` : ``)
        )
        .setColor(0xF1C40F).setFooter({text:'🎉 Good luck!'});
    return new EmbedBuilder()
        .setTitle(`${GW_EMOJI}  GIVEAWAY ENDED`)
        .setDescription(
            `## 🎁 ${gw.prize}\n\n` +
            `**🏆 Winner(s):** ${gw.winnerMentions||'No entries'}\n` +
            `**🎟️ Hosted by:** <@${gw.hostId}>\n` +
            `**👥 Total Entries:** ${gw.totalEntries??0}`
        )
        .setColor(0x2ECC71).setFooter({text:'Giveaway ended'});
};

const pickGwWinners = async (ch, msg, gw) => {
    const rxn = msg.reactions.cache.get(GW_EMOJI_NAME)
        || msg.reactions.cache.find(r=>r.emoji.id===GW_EMOJI_ID);
    let entries=[];
    if(rxn){const u=await rxn.users.fetch();entries=[...u.filter(u=>!u.bot).values()];}
    if(entries.length===0) return {winnerMentions:'No valid entries',picked:[]};
    const pool=[...entries],picked=[];
    for(let i=0;i<Math.min(gw.winners,entries.length);i++){
        const idx=Math.floor(Math.random()*pool.length);
        picked.push(pool.splice(idx,1)[0]);
    }
    return {winnerMentions:picked.map(u=>`<@${u.id}>`).join(', '),picked};
};

const endGiveaway = async (channelId, msgId, force=false) => {
    const gw = db.giveaways[msgId];
    if(!gw||(gw.ended&&!force)) return;
    try {
        const ch  = await client.channels.fetch(channelId);
        const msg = await ch.messages.fetch(msgId);
        const {winnerMentions,picked} = await pickGwWinners(ch,msg,gw);
        if(picked.length>0){
            for(const w of picked){
                const d=getUser(w.id);
                if(gw.isItem){ d.inventory.push({item:gw.prize,from:'Giveaway',date:new Date().toLocaleDateString()}); }
                else { d.coins+=gw.coinsAmount; }
            }
            saveData();
            const note = gw.isItem ? 'Use `v!claim` to claim your prize!' : 'Coins added to balance!';
            ch.send(`${GW_EMOJI} Congratulations ${winnerMentions}! You won **${gw.prize}**! ${note}`);
            log(`GW ended: "${gw.prize}" — ${picked.map(u=>u.tag).join(', ')}`);
        } else { ch.send(`❌ No valid entries for **${gw.prize}**.`); }
        gw.ended=true; gw.winnerMentions=winnerMentions; gw.totalEntries=picked.length+(picked.length===0?0:0);
        // recount entries properly
        const rxn2=msg.reactions.cache.get(GW_EMOJI_NAME)||msg.reactions.cache.find(r=>r.emoji.id===GW_EMOJI_ID);
        if(rxn2){const u=await rxn2.users.fetch();gw.totalEntries=[...u.filter(u=>!u.bot).values()].length;}
        saveData();
        await msg.edit({embeds:[buildGwEmbed(gw,false)]});
    } catch(err) { log(`GW end err: ${err.message}`); }
};

// ─────────────────────────────────────────
//  WELCOME / GOODBYE
// ─────────────────────────────────────────
const sendWelcome = (member, ch) => ch.send({embeds:[new EmbedBuilder()
    .setTitle(`✨ Welcome to ${member.guild.name}!`)
    .setDescription(`Hey ${member}, welcome aboard! 🎉\nYou are member **#${member.guild.memberCount}**!\n\n> Read the rules and enjoy your stay!`)
    .setThumbnail(member.user.displayAvatarURL({dynamic:true,size:512}))
    .setColor(0x5865F2).setFooter({text:member.guild.name,iconURL:member.guild.iconURL({dynamic:true})})
]});

const sendGoodbye = (member, ch) => ch.send({embeds:[new EmbedBuilder()
    .setTitle(`👋 Goodbye, ${member.user.username}`)
    .setDescription(`**${member.user.tag}** has left the server.\nWe now have **${member.guild.memberCount}** members.\n\n> We hope to see you again!`)
    .setThumbnail(member.user.displayAvatarURL({dynamic:true,size:512}))
    .setColor(0xFF4444).setFooter({text:member.guild.name,iconURL:member.guild.iconURL({dynamic:true})})
]});

// ─────────────────────────────────────────
//  TICKETS
// ─────────────────────────────────────────
const ticketBtns = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tkt_close').setLabel('🔒 Close').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('tkt_delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Secondary),
);

const createTicket = async (guild, user, items) => {
    try {
        const name=`claim-${user.username.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,10)}-${Date.now().toString().slice(-4)}`;
        const ch = await guild.channels.create({
            name, type:0, parent:CAT_TICKETS,
            permissionOverwrites:[
                {id:guild.roles.everyone.id, deny:[PermissionsBitField.Flags.ViewChannel]},
                {id:user.id,                 allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory]},
                {id:ROLE_ADMIN,              allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory]},
            ],
        });
        db.tickets[ch.id]={userId:user.id,open:true,createdAt:Date.now()}; saveData();
        await ch.send({
            content:`${user} — Your claim ticket has been opened! Staff will be with you shortly.`,
            embeds:[new EmbedBuilder()
                .setTitle('🎫 Prize Claim Ticket').setColor(0x5865F2)
                .setDescription(`**User:** ${user}\n\n**📦 Items to Claim:**\n${items}\n\n> Staff will deliver your prizes here.`)
                .setFooter({text:'Use the buttons below to manage this ticket'})],
            components:[ticketBtns()],
        });
        return ch;
    } catch(err){log(`Ticket err: ${err.message}`);return null;}
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
client.once('clientReady', async () => {
    log(`Bot Active — ${client.user.tag}`);
    // Resume live giveaways
    for(const[id,gw]of Object.entries(db.giveaways)){
        if(gw.ended)continue;
        const rem=gw.endsAt-Date.now();
        if(rem<=0) endGiveaway(gw.channelId,id);
        else { setTimeout(()=>endGiveaway(gw.channelId,id),rem); log(`Resumed GW: "${gw.prize}" in ${fmtDur(rem)}`); }
    }
    for(const g of client.guilds.cache.values()) await cacheInvites(g);
    // Post shop panel then staff list
    setTimeout(async()=>{
        await updateShopPanel();
        await updateStaffList();
        setInterval(updateStaffList,3600000);
    },5000);
});

// ─────────────────────────────────────────
//  INVITE TRACKING
// ─────────────────────────────────────────
client.on('inviteCreate', i=>{const c=inviteCache.get(i.guild.id)||new Map();c.set(i.code,i.uses);inviteCache.set(i.guild.id,c);});
client.on('inviteDelete', i=>{const c=inviteCache.get(i.guild.id);if(c)c.delete(i.code);});

client.on('guildMemberAdd', async (member) => {
    const wCh=member.guild.channels.cache.get(CH_WELCOME);
    if(wCh){await sendWelcome(member,wCh);log(`Welcome: ${member.user.tag}`);}
    try {
        const old=inviteCache.get(member.guild.id)||new Map();
        const fresh=await member.guild.invites.fetch();
        inviteCache.set(member.guild.id,new Map(fresh.map(i=>[i.code,i.uses])));
        const used=fresh.find(i=>(old.get(i.code)||0)<i.uses);
        const logCh=member.guild.channels.cache.get(CH_INVLOG);
        if(!logCh)return;
        if(used){
            if(!db.invites[used.inviterId])db.invites[used.inviterId]={count:0,users:[]};
            db.invites[used.inviterId].count++;
            db.invites[used.inviterId].users.push(member.id);
            saveData();
            logCh.send({embeds:[new EmbedBuilder().setTitle('📨 Member Joined').setColor(0x2ECC71)
                .setDescription(`${member} joined using an invite from <@${used.inviterId}>\n**Code:** \`${used.code}\`\n**Total invites by <@${used.inviterId}>:** ${db.invites[used.inviterId].count}`)
                .setThumbnail(member.user.displayAvatarURL({dynamic:true}))]});
        } else {
            logCh.send({embeds:[new EmbedBuilder().setTitle('📨 Member Joined').setColor(0x99AAB5)
                .setDescription(`${member} joined — invite source unknown.`)
                .setThumbnail(member.user.displayAvatarURL({dynamic:true}))]});
        }
    } catch(err){log(`Invite track err: ${err.message}`);}
});

client.on('guildMemberRemove', async (member) => {
    const gCh=member.guild.channels.cache.get(CH_GOODBYE);
    if(gCh){await sendGoodbye(member,gCh);log(`Goodbye: ${member.user.tag}`);}
    try {
        const logCh=member.guild.channels.cache.get(CH_INVLOG);
        if(!logCh)return;
        let invitedBy=null;
        for(const[id,d]of Object.entries(db.invites)){if(d.users.includes(member.id)){invitedBy=id;break;}}
        logCh.send({embeds:[new EmbedBuilder().setTitle('📤 Member Left').setColor(0xFF4444)
            .setDescription(`**${member.user.tag}** left the server.\n${invitedBy?`**Was invited by:** <@${invitedBy}>`:'Invite source unknown'}`)
            .setThumbnail(member.user.displayAvatarURL({dynamic:true}))]});
    } catch {}
});

// ─────────────────────────────────────────
//  VOUCH AUTO-REACT
// ─────────────────────────────────────────
client.on('messageCreate', async (msg) => {
    if(msg.author.bot||msg.channel.id!==CH_VOUCH)return;
    try{const e=msg.guild.emojis.cache.get(VOUCH_EMO_ID);if(e)await msg.react(e);}catch{}
});

// ─────────────────────────────────────────
//  BUTTON INTERACTIONS (shop + tickets)
// ─────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
    if(!interaction.isButton())return;

    // ── SHOP: Buy Chest ──
    if(interaction.customId==='shop_buy_chest'){
        const data=getUser(interaction.user.id);
        if(data.coins<250) return interaction.reply({content:`❌ You need **250** ${COIN_EMOJI} but only have **${data.coins}**. Earn more with \`v!work\` or \`v!daily\`!`,ephemeral:true});
        data.coins-=250;
        data.inventory.push({item:'🎁 Mystery Chest',from:'Shop',date:new Date().toLocaleDateString(),isChest:true});
        saveData();
        return interaction.reply({content:`✅ You bought a **Mystery Chest** for **250** ${COIN_EMOJI}!\nBalance: **${data.coins}** ${COIN_EMOJI}\nUse \`v!open chest\` in any channel to open it!`,ephemeral:true});
    }

    // ── TICKETS ──
    const ticket=db.tickets[interaction.channel?.id];
    if(!ticket)return;
    if(!isAdmin(interaction.member))return interaction.reply({content:'❌ Only admins can manage tickets.',ephemeral:true});

    if(interaction.customId==='tkt_close'){
        await interaction.channel.permissionOverwrites.edit(ticket.userId,{SendMessages:false}).catch(()=>{});
        ticket.open=false;saveData();
        await interaction.update({embeds:[new EmbedBuilder().setTitle('🔒 Ticket Closed').setDescription(`Closed by ${interaction.user}.`).setColor(0xFF4444)],
            components:[new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tkt_reopen').setLabel('🔓 Reopen').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('tkt_delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger),
            )]});
    }
    if(interaction.customId==='tkt_reopen'){
        await interaction.channel.permissionOverwrites.edit(ticket.userId,{SendMessages:true}).catch(()=>{});
        ticket.open=true;saveData();
        await interaction.update({embeds:[new EmbedBuilder().setTitle('🔓 Ticket Reopened').setDescription(`Reopened by ${interaction.user}.`).setColor(0x2ECC71)],components:[ticketBtns()]});
    }
    if(interaction.customId==='tkt_delete'){
        await interaction.reply({content:'🗑️ Deleting in 3 seconds...'});
        delete db.tickets[interaction.channel.id];saveData();
        setTimeout(()=>interaction.channel.delete().catch(()=>{}),3000);
    }
});

// ─────────────────────────────────────────
//  ANTI-SPAM + COIN EARN + COMMANDS
// ─────────────────────────────────────────
// Track last message per CHANNEL (not globally) so chatting with a bot counts as different person
const lastMsgPerChannel = new Map(); // channelId -> {authorId, count}

client.on('messageCreate', async (message) => {
    if(message.author.bot)return;

    if(!message.content.startsWith(PREFIX)){
        // No coin gain/loss or spam penalties in this channel
        if(message.channel.id === '1476246808517673063') return;

        const chan = message.channel.id;
        const prev = lastMsgPerChannel.get(chan);

        // Anti-spam: only penalize if same person sent 5+ in a row with NO other person (human or bot) in between
        if(prev && prev.authorId===message.author.id){
            prev.count++;
        } else {
            lastMsgPerChannel.set(chan,{authorId:message.author.id,count:1});
        }

        const cur = lastMsgPerChannel.get(chan);
        if(cur.count>=5 && !isStaff(message.member)){
            const d=getUser(message.author.id);
            d.warns++;d.coins=Math.max(0,d.coins-50);saveData();
            cur.count=0;
            message.channel.send({content:`${message.author}`,embeds:[new EmbedBuilder()
                .setTitle('🚫 Spam Detected').setColor(0xFF0000)
                .setDescription(`You've been sending too many messages in a row!\n> Lost **50** ${COIN_EMOJI} · Warning added.`)
                .addFields({name:'⚠️ Total Warns',value:`${d.warns}`,inline:true})
            ]});
        }

        // Give 1 coin per message
        getUser(message.author.id).coins++;
        saveData();
        return;
    }

    const args    = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd     = args.shift().toLowerCase();
    const admin   = isAdmin(message.member);

    try {

    // ════════════════════════════════════
    //  PUBLIC COMMANDS
    // ════════════════════════════════════

    // ── HELP ──
    if(cmd==='help'||cmd==='h'){
        return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle('📖 Vox Bot — Commands')
            .setColor(0x5865F2)
            .setDescription('All public commands. Use `v!` prefix.')
            .addFields(
                {name:'💰 Economy',      value:'`v!coins` `v!c` `v!bal` `v!balance` · `v!work` · `v!daily` · `v!gamble <amt>` · `v!transfer @user <amt>` · `v!leaderboard` `v!lb`',inline:false},
                {name:'🎒 Inventory',    value:'`v!inv [@user]` · `v!open chest` · `v!claim`',inline:false},
                {name:'ℹ️ Info',         value:'`v!serverinfo` `v!si` · `v!userinfo [@user]` `v!ui` · `v!staffinfo [@user]`',inline:false},
                {name:'🎮 Fun',          value:'`v!8ball <question>`',inline:false},
            )
            .setFooter({text:'Admins: v!adminhelp (v!ah)'})
        ]});
    }

    // ── COINS / BAL ──
    if(cmd==='coins'||cmd==='c'||cmd==='bal'||cmd==='balance'){
        const target=message.mentions.users.first()||message.author;
        const data=getUser(target.id);
        await message.guild.members.fetch().catch(()=>{});
        const entries=Object.entries(db.users).filter(([id])=>{
            const m=message.guild.members.cache.get(id);
            return m&&!m.permissions.has(PermissionsBitField.Flags.Administrator)&&!m.roles.cache.has(ROLE_ADMIN);
        });
        const rank=entries.sort(([,a],[,b])=>b.coins-a.coins).findIndex(([id])=>id===target.id)+1;
        const member=message.guild.members.cache.get(target.id);
        return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle(`💰 ${target.username}'s Wallet`)
            .setColor(member?.displayHexColor||0xF1C40F)
            .setThumbnail(target.displayAvatarURL({dynamic:true,size:256}))
            .addFields(
                {name:'💵 Coins',     value:`**${data.coins}** ${COIN_EMOJI}`,inline:true},
                {name:'🏆 Rank',      value:`**#${rank||'N/A'}**`,inline:true},
                {name:'⚠️ Warns',     value:`**${data.warns}**`,inline:true},
                {name:'🎒 Inventory', value:`**${data.inventory.length}** item(s)`,inline:true},
            )
            .setFooter({text:target.tag})
        ]});
    }

    // ── WORK ──
    if(cmd==='work'){
        const data=getUser(message.author.id);
        const rem=3600000-(Date.now()-data.lastWork);
        if(rem>0)return message.reply({embeds:[new EmbedBuilder().setTitle('⏳ On Cooldown').setDescription(`Work again in **${Math.ceil(rem/60000)} min**.`).setColor(0xFF9900)]});
        const earned=Math.floor(Math.random()*100)+10;
        data.coins+=earned;data.lastWork=Date.now();saveData();
        return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle('💼 Work Complete!')
            .setColor(0x2ECC71)
            .setDescription(`You worked hard and earned **${earned}** ${COIN_EMOJI}!`)
            .addFields({name:'💰 New Balance',value:`**${data.coins}** ${COIN_EMOJI}`,inline:true})
        ]});
    }

    // ── DAILY ──
    if(cmd==='daily'){
        const data=getUser(message.author.id);
        const rem=86400000-(Date.now()-data.lastDaily);
        if(rem>0)return message.reply({embeds:[new EmbedBuilder().setTitle('⏳ Already Claimed').setDescription(`Come back in **${Math.ceil(rem/3600000)} hr(s)**.`).setColor(0xFF9900)]});
        const earned=Math.floor(Math.random()*11)+10;
        data.coins+=earned;data.lastDaily=Date.now();saveData();
        return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle('🎁 Daily Reward!')
            .setColor(0xF1C40F)
            .setDescription(`You claimed your daily reward!`)
            .addFields({name:'💰 Earned',value:`**${earned}** ${COIN_EMOJI}`,inline:true},{name:'💵 Balance',value:`**${data.coins}** ${COIN_EMOJI}`,inline:true})
        ]});
    }

    // ── GAMBLE ──
    if(cmd==='gamble'){
        const amt=parseInt(args[0]);const data=getUser(message.author.id);
        if(isNaN(amt)||amt<10)return message.reply({embeds:[new EmbedBuilder().setDescription('❌ Minimum gamble is **10** coins.').setColor(0xFF0000)]});
        if(data.coins<amt)return message.reply({embeds:[new EmbedBuilder().setDescription(`❌ You only have **${data.coins}** ${COIN_EMOJI}.`).setColor(0xFF0000)]});
        const win=Math.random()>0.5;data.coins+=win?amt:-amt;saveData();
        return message.reply({embeds:[new EmbedBuilder()
            .setTitle(win?'🎲 You Won!':'🎲 You Lost!')
            .setColor(win?0x2ECC71:0xFF0000)
            .addFields(
                {name:win?'💰 Won':'💸 Lost',value:`**${amt}** ${COIN_EMOJI}`,inline:true},
                {name:'💵 Balance',value:`**${data.coins}** ${COIN_EMOJI}`,inline:true},
            )
        ]});
    }

    // ── TRANSFER ──
    if(cmd==='transfer'){
        const target=message.mentions.users.first();const amt=parseInt(args[1]);
        if(!target)return message.reply('❌ Mention a user.');
        if(target.id===message.author.id)return message.reply('❌ Cannot transfer to yourself.');
        if(target.bot)return message.reply('❌ Cannot transfer to a bot.');
        if(isNaN(amt)||amt<1)return message.reply('❌ Enter a valid amount.');
        const sD=getUser(message.author.id);
        if(sD.coins<amt)return message.reply(`❌ You only have **${sD.coins}** ${COIN_EMOJI}.`);
        const tD=getUser(target.id);sD.coins-=amt;tD.coins+=amt;saveData();
        return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle(`${COIN_EMOJI} Transfer Complete`)
            .setColor(0x2ECC71)
            .setDescription(`**${message.author.username}** → **${target.username}**`)
            .addFields(
                {name:'💸 Sent',        value:`**${amt}** ${COIN_EMOJI}`,inline:true},
                {name:'💵 Your Balance',value:`**${sD.coins}** ${COIN_EMOJI}`,inline:true},
                {name:`${target.username}'s Bal`,value:`**${tD.coins}** ${COIN_EMOJI}`,inline:true},
            )
        ]});
    }

    // ── LEADERBOARD ──
    if(cmd==='leaderboard'||cmd==='lb'){
        await message.guild.members.fetch().catch(()=>{});
        const sorted=Object.entries(db.users)
            .filter(([id])=>{const m=message.guild.members.cache.get(id);return m&&!m.permissions.has(PermissionsBitField.Flags.Administrator)&&!m.roles.cache.has(ROLE_ADMIN);})
            .sort(([,a],[,b])=>b.coins-a.coins).slice(0,10);
        const medals=['🥇','🥈','🥉'];
        const lines=sorted.map(([id,d],i)=>`${medals[i]||`**#${i+1}**`} <@${id}> — **${d.coins}** ${COIN_EMOJI}`).join('\n');
        return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle(`${COIN_EMOJI} Coin Leaderboard`)
            .setDescription(lines||'No data yet.')
            .setColor(0xF1C40F)
        ]});
    }

    // ── INV ──
    if(cmd==='inv'){
        const target=message.mentions.users.first()||message.author;
        const data=getUser(target.id);
        if(data.inventory.length===0)return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle(`🎒 ${target.username}'s Inventory`)
            .setDescription('Empty! Purchase items in the shop channel.')
            .setColor(0x99AAB5)]});
        const lines=data.inventory.map((e,i)=>`**${i+1}.** ${e.item}\n> From: *${e.from}* · ${e.date}`).join('\n\n');
        return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle(`🎒 ${target.username}'s Inventory`)
            .setDescription(lines)
            .setColor(0xF1C40F)
            .setThumbnail(target.displayAvatarURL({dynamic:true,size:256}))
            .setFooter({text:`${data.inventory.length} item(s) · Use v!claim to claim prizes`})
        ]});
    }

    // ── OPEN CHEST ──
    if(cmd==='open'&&args[0]==='chest'){
        const data=getUser(message.author.id);
        // Cannot claim chests themselves — only actual prizes
        const idx=data.inventory.findIndex(e=>e.isChest===true);
        if(idx===-1)return message.reply(`❌ You don't have a Mystery Chest! Buy one in <#${CH_SHOP}>.`);
        data.inventory.splice(idx,1);
        const reward=rollChest();
        // Pick SAB or ETFB randomly
        const game=Math.random()<0.5?'sab':'etfb';
        const prize=game==='sab'?reward.sab:reward.etfb;
        const gameLabel=game==='sab'?'🎮 Roblox: SAB':'🎮 Roblox: ETFB';
        data.inventory.push({item:prize,from:'Mystery Chest',date:new Date().toLocaleDateString(),isChest:false});
        saveData();
        return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle('🎁 Mystery Chest Opened!')
            .setColor(reward.color)
            .setDescription(
                `${message.author} cracked open a **Mystery Chest!**\n\n` +
                `**${reward.rarity}**\n` +
                `**${gameLabel}**\n` +
                `> ## ${prize}\n\n` +
                `Use \`v!claim\` to create a ticket and claim your prize!`
            )
            .setFooter({text:'Prize added to inventory'})
        ]});
    }

    // ── CLAIM ──
    if(cmd==='claim'){
        const data=getUser(message.author.id);
        // Filter out chests — can't claim unopened chests
        const claimable=data.inventory.filter(e=>!e.isChest);
        if(claimable.length===0)return message.reply('❌ No claimable prizes in inventory! Open your chest first with `v!open chest`.');
        const itemList=claimable.map((e,i)=>`${i+1}. **${e.item}** *(${e.from}, ${e.date})*`).join('\n');
        const ticket=await createTicket(message.guild,message.author,itemList);
        if(!ticket)return message.reply('❌ Could not create ticket. Contact an admin.');
        // Remove claimed items from inventory (keep chests)
        data.inventory=data.inventory.filter(e=>e.isChest);
        saveData();
        return message.reply(`✅ Claim ticket created: ${ticket}!\nYour prizes have been moved out of your inventory. Staff will deliver them in the ticket.`);
    }

    // ── SERVER INFO ──
    if(cmd==='serverinfo'||cmd==='si'){
        const g=message.guild;await g.members.fetch().catch(()=>{});
        const bots=g.members.cache.filter(m=>m.user.bot).size;
        return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle(`🏠 ${g.name}`)
            .setColor(0x5865F2)
            .setThumbnail(g.iconURL({dynamic:true,size:512}))
            .setFooter({text:`ID: ${g.id}`})
            .addFields(
                {name:'👑 Owner',    value:`<@${g.ownerId}>`,inline:true},
                {name:'📅 Created', value:`<t:${Math.floor(g.createdTimestamp/1000)}:D>`,inline:true},
                {name:'👥 Members', value:`${g.memberCount} (${g.memberCount-bots} humans, ${bots} bots)`,inline:true},
                {name:'💬 Channels',value:`${g.channels.cache.size}`,inline:true},
                {name:'🎭 Roles',   value:`${g.roles.cache.size}`,inline:true},
                {name:'🚀 Boosts',  value:`Level ${g.premiumTier} (${g.premiumSubscriptionCount||0})`,inline:true},
            )
        ]});
    }

    // ── USER INFO ──
    if(cmd==='userinfo'||cmd==='ui'){
        const target=message.mentions.members.first()||message.member;
        const roles=target.roles.cache.filter(r=>r.id!==message.guild.id).sort((a,b)=>b.position-a.position).map(r=>`<@&${r.id}>`).slice(0,5).join(' ')||'None';
        return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle(`👤 ${target.user.tag}`)
            .setColor(target.displayHexColor||0x5865F2)
            .setThumbnail(target.user.displayAvatarURL({dynamic:true,size:512}))
            .addFields(
                {name:'🆔 ID',        value:`\`${target.id}\``,inline:true},
                {name:'📅 Joined',    value:`<t:${Math.floor(target.joinedTimestamp/1000)}:R>`,inline:true},
                {name:'🎂 Created',   value:`<t:${Math.floor(target.user.createdTimestamp/1000)}:R>`,inline:true},
                {name:'🤖 Bot',       value:target.user.bot?'Yes':'No',inline:true},
                {name:'🎭 Top Roles', value:roles,inline:false},
            )
        ]});
    }

    // ── 8BALL ──
    if(cmd==='8ball'){
        const q=args.join(' ');if(!q)return message.reply('❌ Ask a question!');
        const A=['✅ Absolutely!','✅ Without a doubt.','✅ Yes, definitely.','✅ Most likely.','✅ Signs point to yes.','🤔 Ask again later.','🤔 Cannot predict now.','🤔 Better not tell you now.','❌ Don\'t count on it.','❌ My sources say no.','❌ Very doubtful.','❌ Absolutely not.'];
        return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle('🎱 Magic 8-Ball')
            .setColor(0x2C2F33)
            .addFields({name:'❓ Question',value:q},{name:'🎱 Answer',value:A[Math.floor(Math.random()*A.length)]})
        ]});
    }

    // ── STAFF INFO ──
    if(cmd==='staffinfo'){
        const target=message.mentions.members.first()||message.member;
        const staffRole=target.roles.cache.find(r=>STAFF_ROLES.some(sn=>r.name.toLowerCase().includes(sn.toLowerCase())||sn.toLowerCase().includes(r.name.toLowerCase())));
        const data=getUser(target.id);
        const warnText=data.staffWarns.length>0
            ?data.staffWarns.map((w,i)=>`**${i+1}.** ${w.reason}\n> by ${w.by} · ${w.date}`).join('\n')
            :'_None_';
        return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle(`🧑‍💼 Staff Info — ${target.user.username}`)
            .setColor(staffRole?0x5865F2:0x99AAB5)
            .setThumbnail(target.user.displayAvatarURL({dynamic:true,size:256}))
            .addFields(
                {name:'👤 User',       value:`${target}`,inline:true},
                {name:'🏅 Staff Role', value:staffRole?`<@&${staffRole.id}>`:'_Not staff_',inline:true},
                {name:'📅 Joined',     value:`<t:${Math.floor(target.joinedTimestamp/1000)}:D>`,inline:true},
                {name:`⚠️ Staff Warns (${data.staffWarns.length})`,value:warnText,inline:false},
            )
        ]});
    }

    // ════════════════════════════════════
    //  ADMIN GATE
    // ════════════════════════════════════
    if(!admin)return;

    // ── ADMIN HELP ──
    if(cmd==='adminhelp'||cmd==='ah'){
        return message.channel.send({embeds:[new EmbedBuilder()
            .setTitle('🔐 Admin Commands')
            .setColor(0xFF0000)
            .setDescription(`Requires <@&${ROLE_ADMIN}> or Administrator.`)
            .addFields(
                {name:'👥 Staff',     value:'`v!promo @u <role>` `v!demo @u <role>` `v!fire @u` `v!staffwarn @u <reason>` `v!updatestaff`',inline:false},
                {name:'🔨 Mod',       value:'`v!warn @u` `v!unwarn @u` `v!warns @u` `v!kick @u` `v!ban @u` `v!mute @u [mins]` `v!unmute @u`',inline:false},
                {name:'📢 Channel',   value:'`v!purge <n>` `v!purge all` `v!lock` `v!unlock`',inline:false},
                {name:'🎁 Giveaway',  value:'`v!giveaway <coins> <time> [winners]` — coin GW\n`v!itemgw <prize> <time> [winners]` — item GW\n`v!end <msgId>` `v!reroll <msgId>`',inline:false},
                {name:'💰 Economy',   value:'`v!add coins @u <n>` `v!remove coins @u <n>` `v!reset coins @u`',inline:false},
                {name:'🎒 Inventory', value:'`v!addinv @u <item>` `v!clearinv @u`',inline:false},
                {name:'✏️ Misc',      value:'`v!setnick @u <n>` `v!logs` `v!test welcome/goodbye` `v!updateshop`',inline:false},
                {name:'🎫 Tickets',   value:'`v!close` `v!open` `v!rename <n>` (inside ticket channel)',inline:false},
            )
        ]});
    }

    // ── STAFF WARN ──
    if(cmd==='staffwarn'){
        const target=message.mentions.members.first();
        const reason=args.slice(1).join(' ');
        if(!target)return message.reply('❌ Usage: `v!staffwarn @user <reason>`');
        if(!reason)return message.reply('❌ Provide a reason.');
        if(!isStaff(target))return message.reply('❌ That user is not a staff member. Use `v!warn` for regular members.');
        const data=getUser(target.id);
        data.staffWarns.push({reason,by:message.author.tag,date:new Date().toLocaleDateString()});saveData();
        const embed=new EmbedBuilder().setTitle('⚠️ Staff Warning').setColor(0xFF9900)
            .setThumbnail(target.user.displayAvatarURL({dynamic:true,size:256}))
            .addFields(
                {name:'👤 Staff Member',     value:`${target}`,inline:true},
                {name:'📋 Issued by',        value:`${message.author}`,inline:true},
                {name:'📝 Reason',           value:reason,inline:false},
                {name:'⚠️ Total Staff Warns',value:`${data.staffWarns.length}`,inline:true},
            );
        const wCh=message.guild.channels.cache.get(CH_STAFFWARN);
        if(wCh)await wCh.send({content:`${target}`,embeds:[embed]});
        return message.reply(`✅ Staff warning issued. Posted in <#${CH_STAFFWARN}>.`);
    }

    // ── WARN / UNWARN / WARNS ──
    if(cmd==='warn'){
        const target=message.mentions.users.first();if(!target)return message.reply('❌ Mention a user.');
        const data=getUser(target.id);data.warns++;saveData();
        return message.channel.send({content:`<@${target.id}>`,embeds:[new EmbedBuilder()
            .setTitle('⚠️ Warning Issued').setColor(0xFF9900)
            .setDescription(`**${target.tag}** has been warned.`)
            .addFields({name:'Total Warns',value:`${data.warns}`,inline:true})]});
    }
    if(cmd==='unwarn'){
        const target=message.mentions.users.first();if(!target)return message.reply('❌ Mention a user.');
        const data=getUser(target.id);data.warns=Math.max(0,data.warns-1);saveData();
        return message.channel.send({embeds:[new EmbedBuilder().setTitle('✅ Warning Removed').setDescription(`**${target.tag}** now has **${data.warns}** warn(s).`).setColor(0x2ECC71)]});
    }
    if(cmd==='warns'){
        const target=message.mentions.users.first()||message.author;const data=getUser(target.id);
        return message.channel.send({embeds:[new EmbedBuilder().setTitle(`⚠️ Warns — ${target.username}`).setDescription(`**${data.warns}** warning(s).`).setColor(0xFF9900)]});
    }

    // ── KICK / BAN / MUTE / UNMUTE ──
    if(cmd==='kick'){
        const target=message.mentions.members.first();const reason=args.slice(1).join(' ')||'No reason';
        if(!target)return message.reply('❌ Mention a user.');
        await target.kick(reason);
        return message.channel.send({content:`<@${target.id}>`,embeds:[new EmbedBuilder().setTitle('👢 Kicked').setDescription(`**${target.user.tag}** was kicked.\n**Reason:** ${reason}`).setColor(0xFF9900)]});
    }
    if(cmd==='ban'){
        const target=message.mentions.members.first();const reason=args.slice(1).join(' ')||'No reason';
        if(!target)return message.reply('❌ Mention a user.');
        await target.ban({reason});
        return message.channel.send({content:`<@${target.id}>`,embeds:[new EmbedBuilder().setTitle('🔨 Banned').setDescription(`**${target.user.tag}** was banned.\n**Reason:** ${reason}`).setColor(0xFF0000)]});
    }
    if(cmd==='mute'){
        const target=message.mentions.members.first();if(!target)return message.reply('❌ Mention a user.');
        const mins=parseInt(args[1])||60;
        await target.timeout(mins*60000,`Muted by ${message.author.tag}`);
        return message.channel.send({content:`<@${target.id}>`,embeds:[new EmbedBuilder().setTitle('🔇 Muted').setDescription(`**${target.user.tag}** muted for **${mins}m**.`).setColor(0xFF9900)]});
    }
    if(cmd==='unmute'){
        const target=message.mentions.members.first();if(!target)return message.reply('❌ Mention a user.');
        await target.timeout(null);
        return message.channel.send({embeds:[new EmbedBuilder().setTitle('🔊 Unmuted').setDescription(`**${target.user.tag}** unmuted.`).setColor(0x2ECC71)]});
    }

    // ── PURGE ──
    if(cmd==='purge'){
        if(args[0]==='all'){
            let del=0,f;do{f=await message.channel.bulkDelete(100,true);del+=f.size;}while(f.size>=2);
            const m=await message.channel.send({embeds:[new EmbedBuilder().setTitle('🧹 Purge Complete').setDescription(`Deleted **${del}** messages.`).setColor(0xFF4444)]});
            setTimeout(()=>m.delete().catch(()=>{}),4000);
        } else {
            const n=parseInt(args[0]);
            if(isNaN(n)||n<1||n>100)return message.reply('❌ Enter 1–100 or `v!purge all`.');
            await message.channel.bulkDelete(n+1,true);
            const m=await message.channel.send({embeds:[new EmbedBuilder().setTitle('🧹 Purge Complete').setDescription(`Deleted **${n}** messages.`).setColor(0xFF4444)]});
            setTimeout(()=>m.delete().catch(()=>{}),4000);
        }
    }

    // ── LOCK / UNLOCK ──
    if(cmd==='lock'){
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone,{SendMessages:false});
        return message.channel.send({embeds:[new EmbedBuilder().setTitle('🔒 Locked').setDescription(`**#${message.channel.name}** is now locked.`).setColor(0xFF0000)]});
    }
    if(cmd==='unlock'){
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone,{SendMessages:true});
        return message.channel.send({embeds:[new EmbedBuilder().setTitle('🔓 Unlocked').setDescription(`**#${message.channel.name}** is now unlocked.`).setColor(0x2ECC71)]});
    }

    // ── SETNICK ──
    if(cmd==='setnick'){
        const target=message.mentions.members.first();const nick=args.slice(1).join(' ');
        if(!target)return message.reply('❌ Mention a user.');
        if(!nick)return message.reply('❌ Provide a nickname.');
        await target.setNickname(nick);
        return message.channel.send({embeds:[new EmbedBuilder().setTitle('✏️ Nickname Changed').setDescription(`**${target.user.tag}** → **${nick}**`).setColor(0x5865F2)]});
    }

    // ── ADMIN ECONOMY ──
    if(cmd==='add'&&args[0]==='coins'){
        const target=message.mentions.users.first();const amt=parseInt(args[2]);
        if(!target||isNaN(amt))return message.reply('❌ Usage: `v!add coins @user <amt>`');
        getUser(target.id).coins+=amt;saveData();
        return message.channel.send({embeds:[new EmbedBuilder().setTitle('✅ Coins Added').setDescription(`+**${amt}** ${COIN_EMOJI} → **${target.username}**.`).setColor(0x2ECC71)]});
    }
    if(cmd==='remove'&&args[0]==='coins'){
        const target=message.mentions.users.first();const amt=parseInt(args[2]);
        if(!target||isNaN(amt))return message.reply('❌ Usage: `v!remove coins @user <amt>`');
        const d=getUser(target.id);d.coins=Math.max(0,d.coins-amt);saveData();
        return message.channel.send({embeds:[new EmbedBuilder().setTitle('✅ Coins Removed').setDescription(`-**${amt}** ${COIN_EMOJI} from **${target.username}**.`).setColor(0xFF9900)]});
    }
    if(cmd==='reset'&&args[0]==='coins'){
        const target=message.mentions.users.first();if(!target)return message.reply('❌ Mention a user.');
        getUser(target.id).coins=0;saveData();
        return message.channel.send({embeds:[new EmbedBuilder().setTitle('🔄 Coins Reset').setDescription(`**${target.username}**'s coins reset to 0.`).setColor(0xFF9900)]});
    }

    // ── INVENTORY ADMIN ──
    if(cmd==='addinv'){
        const target=message.mentions.users.first();const item=args.slice(1).join(' ');
        if(!target)return message.reply('❌ Usage: `v!addinv @user <item>`');
        if(!item)return message.reply('❌ Provide an item name.');
        getUser(target.id).inventory.push({item,from:'Admin',date:new Date().toLocaleDateString(),isChest:false});saveData();
        return message.channel.send({embeds:[new EmbedBuilder().setTitle('✅ Item Added').setDescription(`Added **${item}** to **${target.username}**'s inventory.`).setColor(0x2ECC71)]});
    }
    if(cmd==='clearinv'){
        const target=message.mentions.users.first();if(!target)return message.reply('❌ Mention a user.');
        const d=getUser(target.id);const n=d.inventory.length;d.inventory=[];saveData();
        return message.channel.send({embeds:[new EmbedBuilder().setTitle('🗑️ Inventory Cleared').setDescription(`Cleared **${n}** item(s) from **${target.username}**.`).setColor(0xFF9900)]});
    }

    // ── LOGS ──
    if(cmd==='logs'){
        return message.channel.send({embeds:[new EmbedBuilder().setTitle('🖥️ Bot Logs').setColor(0x2C2F33)
            .setDescription(`\`\`\`\n${LOG.join('\n')||'Empty'}\n\`\`\``)]});
    }

    // ── TEST ──
    if(cmd==='test'){
        const sub=args[0]?.toLowerCase();
        if(sub==='welcome'){const ch=message.guild.channels.cache.get(CH_WELCOME);if(!ch)return message.reply('❌ Channel not found.');await sendWelcome(message.member,ch);return message.reply('✅ Sent!');}
        if(sub==='goodbye'){const ch=message.guild.channels.cache.get(CH_GOODBYE);if(!ch)return message.reply('❌ Channel not found.');await sendGoodbye(message.member,ch);return message.reply('✅ Sent!');}
        return message.reply('❌ `v!test welcome` or `v!test goodbye`');
    }

    // ── UPDATE STAFF ──
    if(cmd==='updatestaff'){
        await message.reply('🔄 Updating...');
        await updateStaffList();
        return message.channel.send('✅ Staff list updated!');
    }

    // ── UPDATE SHOP ──
    if(cmd==='updateshop'){
        await message.reply('🔄 Updating shop panel...');
        await updateShopPanel();
        return message.channel.send('✅ Shop panel updated!');
    }

    // ── GIVEAWAY (coins) ──
    if(cmd==='giveaway'||cmd==='gw'){
        if(args.length<2)return message.reply('❌ Usage: `v!giveaway <coins> <time> [winners]`\nExample: `v!giveaway 500 1h 2`');
        const coinsAmt=parseInt(args[0]);
        if(isNaN(coinsAmt)||coinsAmt<1)return message.reply('❌ Provide a valid coin amount.');
        const dur=parseTime(args[1]);if(!dur)return message.reply('❌ Invalid time. Use `1m` `1h` `1d` etc.');
        const winners=parseInt(args[2])||1;if(winners<1||winners>20)return message.reply('❌ Winners: 1–20.');
        const prize=`${COIN_EMOJI} ${coinsAmt} ${COIN_EMOJI}`;
        const gwData={prize,isItem:false,coinsAmount:coinsAmt,hostId:message.author.id,channelId:message.channel.id,winners,endsAt:Date.now()+dur,startedAt:Date.now(),ended:false};
        await message.delete().catch(()=>{});
        const gMsg=await message.channel.send({embeds:[buildGwEmbed(gwData,true)]});
        try{await gMsg.react(`${GW_EMOJI_NAME}:${GW_EMOJI_ID}`);}catch{await gMsg.react('🎉');}
        gwData.messageId=gMsg.id;db.giveaways[gMsg.id]=gwData;saveData();
        log(`GW (coins): "${prize}", ${winners} winner(s), ${fmtDur(dur)}`);
        setTimeout(()=>endGiveaway(message.channel.id,gMsg.id),dur);
        return;
    }

    // ── ITEM GIVEAWAY ──
    if(cmd==='itemgw'){
        if(args.length<2)return message.reply('❌ Usage: `v!itemgw <prize text> <time> [winners]`\nExample: `v!itemgw 50oc/s 30m 1`');
        // Last arg before potential winner count = time, check if 2nd to last is time
        const winnersArg=parseInt(args[args.length-1]);
        const hasWinners=!isNaN(winnersArg)&&args.length>2;
        const timeArg=hasWinners?args[args.length-2]:args[args.length-1];
        const prizeArgs=hasWinners?args.slice(0,args.length-2):args.slice(0,args.length-1);
        const prize=prizeArgs.join(' ');
        if(!prize)return message.reply('❌ Provide a prize name.');
        const dur=parseTime(timeArg);if(!dur)return message.reply('❌ Invalid time.');
        const winners=hasWinners?winnersArg:1;if(winners<1||winners>20)return message.reply('❌ Winners: 1–20.');
        const gwData={prize,isItem:true,coinsAmount:0,hostId:message.author.id,channelId:message.channel.id,winners,endsAt:Date.now()+dur,startedAt:Date.now(),ended:false};
        await message.delete().catch(()=>{});
        const gMsg=await message.channel.send({embeds:[buildGwEmbed(gwData,true)]});
        try{await gMsg.react(`${GW_EMOJI_NAME}:${GW_EMOJI_ID}`);}catch{await gMsg.react('🎉');}
        gwData.messageId=gMsg.id;db.giveaways[gMsg.id]=gwData;saveData();
        log(`GW (item): "${prize}", ${winners} winner(s), ${fmtDur(dur)}`);
        setTimeout(()=>endGiveaway(message.channel.id,gMsg.id),dur);
        return;
    }

    // ── END GIVEAWAY ──
    if(cmd==='end'){
        const msgId=args[0];if(!msgId)return message.reply('❌ Usage: `v!end <messageId>`');
        const gw=db.giveaways[msgId];if(!gw)return message.reply('❌ Giveaway not found.');
        if(gw.ended)return message.reply('❌ Giveaway already ended.');
        gw.endsAt=Date.now(); // force expire
        await endGiveaway(gw.channelId,msgId);
        return message.reply('✅ Giveaway ended!');
    }

    // ── REROLL GIVEAWAY ──
    if(cmd==='reroll'){
        const msgId=args[0];if(!msgId)return message.reply('❌ Usage: `v!reroll <messageId>`');
        const gw=db.giveaways[msgId];if(!gw)return message.reply('❌ Giveaway not found.');
        if(!gw.ended)return message.reply('❌ Giveaway has not ended yet. Use `v!end <id>` first.');
        try {
            const ch=await client.channels.fetch(gw.channelId);
            const msg=await ch.messages.fetch(msgId);
            const {winnerMentions,picked}=await pickGwWinners(ch,msg,gw);
            if(picked.length===0)return message.reply('❌ No valid entries to reroll.');
            for(const w of picked){
                const d=getUser(w.id);
                if(gw.isItem){d.inventory.push({item:gw.prize,from:'Giveaway Reroll',date:new Date().toLocaleDateString(),isChest:false});}
                else{d.coins+=gw.coinsAmount;}
            }
            saveData();
            gw.winnerMentions=winnerMentions;saveData();
            const note=gw.isItem?'Use `v!claim` to claim!':'Coins added to balance!';
            ch.send(`🔁 **Reroll!** New winner(s): ${winnerMentions}! You won **${gw.prize}**! ${note}`);
            await msg.edit({embeds:[buildGwEmbed(gw,false)]});
            return message.reply('✅ Giveaway rerolled!');
        } catch(err){return message.reply(`❌ Error: ${err.message}`);}
    }

    // ── PROMO ──
    if(cmd==='promo'){
        const target=message.mentions.members.first();const roleName=args.slice(1).join(' ');
        if(!target)return message.reply('❌ Usage: `v!promo @user <role>`');
        if(!roleName)return message.reply('❌ Provide a role name.');
        const role=findRole(message.guild,roleName);if(!role)return message.reply(`❌ Role **${roleName}** not found.`);
        await removeStaffRoles(target);await target.roles.add(role);
        const embed=new EmbedBuilder().setTitle('🎉 Staff Promotion').setColor(0x2ECC71)
            .setDescription(`Congratulations to ${target}! 🎊\nPromoted to **${role.name}**!\n> Keep up the great work!`)
            .setThumbnail(target.user.displayAvatarURL({dynamic:true,size:256}))
            .addFields({name:'👤 Member',value:`${target}`,inline:true},{name:'🏅 New Role',value:`<@&${role.id}>`,inline:true},{name:'📋 By',value:`${message.author}`,inline:true});
        const ch=message.guild.channels.cache.get(CH_PROMO);if(ch)await ch.send({content:`${target}`,embeds:[embed]});
        message.reply(`✅ **${target.user.username}** promoted to **${role.name}**!`);
        await updateStaffList();log(`Promo: ${target.user.tag} → ${role.name}`);
        return;
    }

    // ── DEMO ──
    if(cmd==='demo'){
        const target=message.mentions.members.first();const roleName=args.slice(1).join(' ');
        if(!target)return message.reply('❌ Usage: `v!demo @user <role>`');
        if(!roleName)return message.reply('❌ Provide a role name.');
        const role=findRole(message.guild,roleName);if(!role)return message.reply(`❌ Role **${roleName}** not found.`);
        await removeStaffRoles(target);await target.roles.add(role);
        const embed=new EmbedBuilder().setTitle('📉 Staff Demotion').setColor(0xFF4444)
            .setDescription(`${target} has been demoted.\nNew role: **${role.name}**.\n> Please reflect and improve.`)
            .setThumbnail(target.user.displayAvatarURL({dynamic:true,size:256}))
            .addFields({name:'👤 Member',value:`${target}`,inline:true},{name:'📉 New Role',value:`<@&${role.id}>`,inline:true},{name:'📋 By',value:`${message.author}`,inline:true});
        const ch=message.guild.channels.cache.get(CH_DEMO);if(ch)await ch.send({content:`${target}`,embeds:[embed]});
        message.reply(`✅ **${target.user.username}** demoted to **${role.name}**.`);
        await updateStaffList();log(`Demo: ${target.user.tag} → ${role.name}`);
        return;
    }

    // ── FIRE ──
    if(cmd==='fire'){
        const target=message.mentions.members.first();if(!target)return message.reply('❌ Mention a user.');
        const removed=await removeStaffRoles(target);
        const embed=new EmbedBuilder().setTitle('🔥 Staff Fired').setColor(0xFF0000)
            .setDescription(`**${target.user.tag}** has been removed from staff.\n> Removed **${removed}** role(s).`)
            .setThumbnail(target.user.displayAvatarURL({dynamic:true,size:256}))
            .addFields({name:'👤 User',value:`${target}`,inline:true},{name:'📋 By',value:`${message.author}`,inline:true});
        message.channel.send({content:`<@${target.id}>`,embeds:[embed]});
        await updateStaffList();log(`Fire: ${target.user.tag} — ${removed} role(s) by ${message.author.tag}`);
        return;
    }

    // ── TICKET COMMANDS ──
    if(cmd==='close'){
        const t=db.tickets[message.channel.id];if(!t)return message.reply('❌ Not a ticket channel.');
        await message.channel.permissionOverwrites.edit(t.userId,{SendMessages:false}).catch(()=>{});
        t.open=false;saveData();
        return message.channel.send({embeds:[new EmbedBuilder().setTitle('🔒 Closed').setDescription(`Closed by ${message.author}.`).setColor(0xFF4444)],
            components:[new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tkt_reopen').setLabel('🔓 Reopen').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('tkt_delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger),
            )]});
    }
    if(cmd==='open'){
        const t=db.tickets[message.channel.id];if(!t)return;
        await message.channel.permissionOverwrites.edit(t.userId,{SendMessages:true}).catch(()=>{});
        t.open=true;saveData();
        return message.channel.send({embeds:[new EmbedBuilder().setTitle('🔓 Reopened').setDescription(`Reopened by ${message.author}.`).setColor(0x2ECC71)],components:[ticketBtns()]});
    }
    if(cmd==='rename'){
        if(!db.tickets[message.channel.id])return message.reply('❌ Not a ticket channel.');
        const name=args.join('-').toLowerCase().replace(/[^a-z0-9-]/g,'');
        if(!name)return message.reply('❌ Provide a name.');
        await message.channel.setName(name);
        return message.channel.send({embeds:[new EmbedBuilder().setTitle('✏️ Renamed').setDescription(`Renamed to **${name}**.`).setColor(0x5865F2)]});
    }

    } catch(err){
        log(`ERR [${cmd}]: ${err.message}`);
        message.channel.send({embeds:[new EmbedBuilder().setDescription(`❌ \`${err.message}\``).setColor(0xFF0000)]});
    }
});

client.login(process.env.TOKEN);
