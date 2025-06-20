const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Check for FFmpeg availability
const { exec } = require('child_process');

function checkFFmpeg() {
    return new Promise((resolve) => {
        exec('ffmpeg -version', (error, stdout, stderr) => {
            if (error) {
                console.log('⚠️ FFmpeg not found in PATH, using ffmpeg-static');
                resolve(false);
            } else {
                console.log('✅ FFmpeg found in system PATH');
                resolve(true);
            }
        });
    });
}

// Create Discord client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        // GatewayIntentBits.GuildMessages, // Not needed for slash commands
        // GatewayIntentBits.MessageContent  // Privileged intent - enable in Discord Portal if needed
    ]
});

// Initialize command collection
client.commands = new Collection();

// Load commands from commands directory
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`✅ Loaded command: ${command.data.name}`);
    } else {
        console.log(`⚠️ Command at ${filePath} is missing required "data" or "execute" property.`);
    }
}

// Initialize music queues for each guild
client.musicQueues = new Map();

// Simple HTTP server for health checks (required by some cloud platforms)
const http = require('http');
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'Bot is running!',
            uptime: process.uptime(),
            guilds: client.guilds.cache.size,
            timestamp: new Date().toISOString()
        }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 Health check server running on port ${PORT}`);
});

// Bot ready event
client.once('ready', async () => {
    console.log(`🎵 ${client.user.tag} is online and ready to play music!`);
    console.log(`📊 Serving ${client.guilds.cache.size} servers`);
    
    // Check FFmpeg availability
    await checkFFmpeg();
    
    // Set bot presence
    client.user.setPresence({
        activities: [{
            name: '🎵 Music | /play',
            type: 2 // LISTENING
        }],
        status: 'online'
    });
});

// Handle slash command interactions
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error('Error executing command:', error);
        
        const errorMessage = 'There was an error while executing this command!';
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
});

// Handle voice state updates (user joins/leaves voice channels)
client.on('voiceStateUpdate', (oldState, newState) => {
    // Auto-disconnect if bot is alone in voice channel
    if (oldState.channelId && oldState.channel && oldState.channel.members.size === 1) {
        const connection = client.musicQueues.get(oldState.guild.id)?.connection;
        if (connection) {
            connection.destroy();
            client.musicQueues.delete(oldState.guild.id);
            console.log(`🔇 Left voice channel in ${oldState.guild.name} (no users remaining)`);
        }
    }
});

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN); 