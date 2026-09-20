module.exports={
 brand:process.env.BRAND||'NeoByMe',devBy:process.env.DEV_BY||'Haseeb',timezone:process.env.BOT_TIMEZONE||'Asia/Karachi',
 channels:{welcome:process.env.WELCOME_CHANNEL_ID||'',goodbye:process.env.GOODBYE_CHANNEL_ID||'',log:process.env.LOG_CHANNEL_ID||'',modLog:process.env.MOD_LOG_CHANNEL_ID||'',ticketCategory:process.env.TICKET_CATEGORY_ID||''},
 emoji:{ticket:'🎫',giveaway:'🎉',success:'✅',error:'❌',shield:'🛡️',coin:'🪙',tree:'🌱',youtube:'▶️'}
};
