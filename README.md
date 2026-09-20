# NeoByMe — Railway Discord Bot

Railway-ready Discord.js v14 bot starter with 150+ slash commands, professional tickets, giveaways, moderation, automod, welcome/goodbye, economy, games, counting/tree systems, invite tracking foundation, YouTube ping foundation, logging and custom emoji configuration.

## Deploy
1. Upload this repository to GitHub.
2. Create a Railway service from the GitHub repository.
3. Add the variables in `.env.example` to Railway.
4. Set `DISCORD_TOKEN` and `CLIENT_ID`.
5. Set `GUILD_ID` for a test server (recommended during development).
6. Run `npm run register` once, then Railway runs `npm start`.

Enable Server Members, Message Content and Guild Invites intents in the Discord Developer Portal.

SQLite is stored in `data/neobyme.sqlite`; use a Railway persistent volume if you want data to survive redeploys.
