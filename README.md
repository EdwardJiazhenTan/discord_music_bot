# Discord Music Bot 🎵

A lightweight Discord music bot built with Node.js and discord.js v14 that supports YouTube playback and Spotify playlist integration.

## ✨ Features

### 🎵 Music Playback

- Play music from YouTube URLs
- Search and play songs by name
- Search and play songs by artist name
- Add Spotify playlists to queue (converts to YouTube)
- High-quality audio streaming with ytdl-core

### 🎛️ Playback Controls

- ⏸️ Pause/Resume playback
- ⏭️ Skip to next song
- ⏹️ Stop playback and clear queue
- 🔀 Shuffle mode
- 🔁 Loop mode
- 📋 Queue management

### 📋 Playlist Management

- Save current queue as custom playlist
- Load saved playlists
- List all saved playlists
- Remove songs from queue
- Clear entire queue

### 🎯 Smart Features

- Auto-disconnect when alone in voice channel
- Automatic queue progression
- Rich embed messages with song info
- Error handling and user feedback
- Lightweight memory usage

## 🚀 Setup Instructions

### Prerequisites

- Node.js 16.9.0 or higher
- Discord Application with Bot Token
- Spotify Developer Account (optional, for playlist features)

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd discord_music_bot
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_application_id_here
GUILD_ID=your_discord_server_id_here

# Optional: YouTube API (for enhanced search)
YOUTUBE_API_KEY=your_youtube_api_key_here

# Optional: Spotify Integration
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
```

### 3. Getting Required Tokens

#### Discord Bot Token:

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or select existing one
3. Go to "Bot" section → Copy Token
4. Go to "General Information" → Copy Application ID (CLIENT_ID)

#### Discord Server ID (GUILD_ID):

1. Enable Developer Mode in Discord settings
2. Right-click your server → Copy Server ID

#### Spotify Credentials (Optional):

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Copy Client ID and Client Secret

### 4. Deploy Commands

```bash
npm run deploy-commands
```

### 5. Start the Bot

```bash
# Production
npm start

# Development (with auto-restart)
npm run dev
```

## 🎵 Commands

### `/play <query> [source]`

Play music or add to queue

- **query**: Song name, YouTube URL, or Spotify playlist URL
- **source**: `youtube` (default) or `artist`

**Examples:**

```
/play Never Gonna Give You Up
/play https://www.youtube.com/watch?v=dQw4w9WgXcQ
/play https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
/play Eminem source:artist
```

### `/controls`

Music playback controls

#### Subcommands:

- `/controls pause` - Pause current song
- `/controls resume` - Resume playback
- `/controls skip` - Skip to next song
- `/controls stop` - Stop and clear queue
- `/controls shuffle` - Toggle shuffle mode
- `/controls loop` - Toggle loop mode
- `/controls nowplaying` - Show current song info
- `/controls queue [page]` - Show queue (paginated)

### `/playlist`

Playlist management

#### Subcommands:

- `/playlist save <name>` - Save current queue as playlist
- `/playlist load <name>` - Load saved playlist
- `/playlist list` - List all saved playlists
- `/playlist clear` - Clear current queue
- `/playlist remove <position>` - Remove song at position

## 📁 Project Structure

```
discord_music_bot/
├── src/
│   ├── commands/           # Slash command handlers
│   │   ├── play.js        # Main play command
│   │   ├── controls.js    # Playback controls
│   │   └── playlist.js    # Playlist management
│   ├── utils/             # Utility modules
│   │   ├── queueManager.js    # Queue management
│   │   ├── musicPlayer.js     # Audio player logic
│   │   ├── youtubeSearch.js   # YouTube integration
│   │   └── spotifyApi.js      # Spotify integration
│   ├── deploy-commands.js # Command deployment script
│   └── index.js          # Main bot file
├── data/
│   └── playlists/        # Saved playlists (JSON files)
├── package.json
├── .env                  # Environment variables
├── .gitignore
└── README.md
```

## 🔧 Configuration

### Audio Quality Settings

The bot uses high-quality audio streaming with optimized buffering:

- **Format**: Audio-only streams
- **Quality**: Highest available
- **Buffer**: 32MB for smooth playback

### Queue Limits

- **Default queue size**: Unlimited
- **Playlist conversion**: Up to 50 tracks per batch
- **Search results**: Up to 10 results per query

## 🎯 Usage Examples

### Basic Music Playing

```
User: /play Bohemian Rhapsody
Bot: 🎵 Now Playing: Queen - Bohemian Rhapsody

User: /play https://youtu.be/fJ9rUzIMcZQ
Bot: 🎵 Added to Queue: Queen - Bohemian Rhapsody (Position 2)
```

### Spotify Playlist Integration

```
User: /play https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
Bot: 🔄 Processing Spotify Playlist...
Bot: 🎵 Spotify Playlist Added: "Today's Top Hits" (47/50 tracks converted)
```

### Artist Search

```
User: /play "The Beatles" source:artist
Bot: 🎵 Added Artist Songs: Added 5 songs by The Beatles to the queue!
```

### Queue Management

```
User: /controls queue
Bot: 📋 Music Queue showing current and upcoming songs

User: /playlist save "My Favorites"
Bot: 💾 Playlist Saved: "My Favorites" (12 songs)
```

## 🛠️ Troubleshooting

### Common Issues

**Bot not responding to commands:**

- Ensure bot has proper permissions in your server
- Check if commands are deployed: `npm run deploy-commands`
- Verify DISCORD_TOKEN and CLIENT_ID in .env

**Audio not playing:**

- Bot needs "Connect" and "Speak" permissions in voice channels
- User must be in a voice channel before using `/play`
- Check if ffmpeg is properly installed

**Spotify playlists not working:**

- Verify SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET
- Ensure playlist is public or you have access
- Some tracks may not be found on YouTube

**High memory usage:**

- Restart bot periodically for long-running instances
- Clear queue with `/playlist clear` if very large
- Monitor playlist sizes (recommended: <100 songs)

### Performance Tips

- Use GUILD_ID in .env for faster command deployment during development
- Keep playlists under 50 songs for optimal conversion speed
- Regularly clean up saved playlists in `data/playlists/`

## 📝 License

MIT License - feel free to modify and distribute!

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review console logs for error messages
3. Ensure all environment variables are set correctly
4. Verify bot permissions in Discord server

---

**Enjoy your music! 🎵**
