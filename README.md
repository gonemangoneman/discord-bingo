# Stream Bingo Bot 🎯

A Discord Activity + Bot that lets your stream community play bingo with events that happen during a live stream.

## Features

- **Event Sets**: Organize bingo events into categories (General, Minecraft, Just Chatting, etc.)
- **Embedded Activity**: Polished bingo board UI rendered directly inside Discord
- **Real-time Sync**: Events are triggered via reactions, boards update instantly for all players
- **Scoring System**: Competitive point system with diminishing returns for multiple bingos
- **All-time Leaderboard**: Track cumulative scores across sessions

## Prerequisites

- **Node.js 22+** (uses built-in `node:sqlite`)
- **Discord Application** with Bot and Activity enabled
- **cloudflared** (for HTTPS tunneling during development)

## Setup

### 1. Discord Developer Portal

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**, name it (e.g., "Stream Bingo")
3. Go to **Bot** tab:
   - Click **Reset Token** and copy it
   - Enable these **Privileged Gateway Intents**:
     - ✅ Message Content Intent
     - ✅ Server Members Intent
4. Go to **OAuth2** tab:
   - Copy the **Client ID** and **Client Secret**
5. Go to **Activities** tab:
   - Enable Activities for your app
   - Under **URL Mappings**, add:
     - Target: `/{prefix}` → Root mapping
     - URL: Your cloudflared tunnel URL (you'll update this each time)

### 2. Environment Setup

```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_BOT_TOKEN=your_bot_token
PORT=3001
VITE_PORT=5173
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Invite the Bot

Use this URL (replace `YOUR_CLIENT_ID`):
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2147534912&scope=bot%20applications.commands
```

Permissions needed:
- Read Messages, Send Messages
- Manage Messages (for event channel cleanup)
- Add Reactions, Read Message History
- Use Embedded Activities

### 5. Register Slash Commands

```bash
npm run deploy-commands
```

### 6. Start Development

**Terminal 1** — Start the app:
```bash
npm run dev
```

**Terminal 2** — Start the tunnel:
```bash
npm run tunnel
```

Copy the tunnel URL and paste it into your Discord Developer Portal **Activities → URL Mappings**.

## Commands

| Command | Permission | Description |
|---------|-----------|-------------|
| `/bingo-setup` | Manage Server | Configure channels and bingo leader role |
| `/bingo-config` | Manage Server | Toggle auto-mark mode |
| `/bingo-set create <name>` | Bingo Leader | Create an event set |
| `/bingo-set add <set> <event>` | Bingo Leader | Add event to a set |
| `/bingo-set remove <set> <event>` | Bingo Leader | Remove event from a set |
| `/bingo-set list [set]` | Bingo Leader | List sets or events in a set |
| `/bingo-set delete <name>` | Bingo Leader | Delete an entire set |
| `/bingo-start` | Bingo Leader | Start a game (pick event sets) |
| `/bingo-end` | Bingo Leader | End the game, show scores |
| `/bingo` | Everyone | Open the bingo board activity |
| `/bingo-leaderboard` | Everyone | View all-time leaderboard |

## How to Play

1. **Admin** runs `/bingo-setup` to configure the bot
2. **Bingo Leader** creates event sets with `/bingo-set create` and adds events
3. **Bingo Leader** starts a game with `/bingo-start`, picking which sets to use
4. **Players** use `/bingo` to launch the activity and get their board
5. During the stream, the **Bingo Leader** reacts to events in the event channel when they happen
6. Boards update in real-time for all players
7. First to get 5-in-a-row gets the most points!
8. **Bingo Leader** ends the game with `/bingo-end`

## Scoring

| Position | Points |
|----------|--------|
| 1st bingo | 10 |
| 2nd bingo | 8 |
| 3rd bingo | 6 |
| 4th bingo | 5 |
| 5th bingo | 4 |
| 6th+ bingo | 3 |

Multiple bingos per player get 50% diminishing returns each.

## Tech Stack

- **Bot**: discord.js v14
- **Backend**: Express + Socket.io
- **Database**: SQLite (node:sqlite built-in)
- **Frontend**: Vite + Vanilla JS + Discord Embedded App SDK
- **Real-time**: Socket.io for board synchronization
