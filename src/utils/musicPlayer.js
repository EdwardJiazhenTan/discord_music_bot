const { 
    createAudioPlayer, 
    createAudioResource, 
    joinVoiceChannel, 
    AudioPlayerStatus, 
    VoiceConnectionStatus,
    getVoiceConnection,
    entersState
} = require('@discordjs/voice');
const { EmbedBuilder } = require('discord.js');
const youtubeSearch = require('./youtubeSearch');
const queueManager = require('./queueManager');

class MusicPlayer {
    constructor() {
        this.players = new Map(); // guildId -> player
        this.connections = new Map(); // guildId -> connection
    }

    // Join voice channel
    async joinChannel(voiceChannel) {
        try {
            const guildId = voiceChannel.guild.id;
            
            // Check if already connected
            const existingConnection = getVoiceConnection(guildId);
            if (existingConnection) {
                return existingConnection;
            }

            console.log(`🔊 Joining voice channel: ${voiceChannel.name} in ${voiceChannel.guild.name}`);

            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guildId,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });

            // Wait for connection to be ready
            await entersState(connection, VoiceConnectionStatus.Ready, 30000);

            // Store connection
            this.connections.set(guildId, connection);
            
            // Update queue manager
            const queue = queueManager.getQueue(guildId);
            queue.connection = connection;

            // Handle connection events
            connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                    ]);
                } catch (error) {
                    console.log(`🔇 Voice connection lost in ${voiceChannel.guild.name}`);
                    this.cleanup(guildId);
                }
            });

            connection.on('error', error => {
                console.error('Voice connection error:', error);
                this.cleanup(guildId);
            });

            console.log(`✅ Successfully joined voice channel in ${voiceChannel.guild.name}`);
            return connection;

        } catch (error) {
            console.error('Error joining voice channel:', error);
            throw error;
        }
    }

    // Create and setup audio player for guild
    createPlayer(guildId) {
        if (this.players.has(guildId)) {
            return this.players.get(guildId);
        }

        const player = createAudioPlayer();
        this.players.set(guildId, player);

        // Handle player events
        player.on(AudioPlayerStatus.Playing, () => {
            const queue = queueManager.getQueue(guildId);
            queue.isPlaying = true;
            queue.isPaused = false;
            
            const currentSong = queueManager.getCurrentSong(guildId);
            if (currentSong) {
                console.log(`▶️ Now playing: ${currentSong.title}`);
            }
        });

        player.on(AudioPlayerStatus.Paused, () => {
            const queue = queueManager.getQueue(guildId);
            queue.isPlaying = false;
            queue.isPaused = true;
            console.log(`⏸️ Playback paused in guild ${guildId}`);
        });

        player.on(AudioPlayerStatus.Idle, () => {
            const queue = queueManager.getQueue(guildId);
            queue.isPlaying = false;
            queue.isPaused = false;
            
            console.log(`⏹️ Playback finished in guild ${guildId}`);
            
            // Auto-play next song
            setTimeout(() => {
                this.playNext(guildId);
            }, 1000);
        });

        player.on('error', error => {
            console.error('Audio player error:', error);
            
            // Try to play next song on error
            setTimeout(() => {
                this.playNext(guildId);
            }, 2000);
        });

        return player;
    }

    // Play current song
    async playSong(guildId) {
        try {
            const queue = queueManager.getQueue(guildId);
            const currentSong = queueManager.getCurrentSong(guildId);

            if (!currentSong) {
                console.log(`❌ No current song to play in guild ${guildId}`);
                return false;
            }

            console.log(`🎵 Playing: ${currentSong.title}`);

            // Create audio resource
            const stream = youtubeSearch.getAudioStream(currentSong.url);
            const resource = createAudioResource(stream, {
                metadata: {
                    title: currentSong.title,
                    url: currentSong.url
                }
            });

            // Get or create player
            const player = this.createPlayer(guildId);
            
            // Get connection
            const connection = this.connections.get(guildId) || queue.connection;
            
            if (!connection) {
                console.error(`❌ No voice connection for guild ${guildId}`);
                return false;
            }

            // Subscribe connection to player
            connection.subscribe(player);
            
            // Play the resource
            player.play(resource);

            // Update queue
            queue.player = player;
            queue.isPlaying = true;
            queue.isPaused = false;

            return true;

        } catch (error) {
            console.error('Error playing song:', error);
            return false;
        }
    }

    // Play next song in queue
    async playNext(guildId) {
        try {
            const nextSong = queueManager.skipSong(guildId);
            
            if (!nextSong) {
                console.log(`📭 Queue finished in guild ${guildId}`);
                
                // Send "queue finished" message if text channel is available
                const queue = queueManager.getQueue(guildId);
                if (queue.textChannel) {
                    const embed = new EmbedBuilder()
                        .setColor('#FF6B6B')
                        .setTitle('🎵 Queue Finished')
                        .setDescription('No more songs in the queue!')
                        .setTimestamp();
                    
                    await queue.textChannel.send({ embeds: [embed] });
                }
                
                return false;
            }

            return await this.playSong(guildId);

        } catch (error) {
            console.error('Error playing next song:', error);
            return false;
        }
    }

    // Pause playback
    pause(guildId) {
        const player = this.players.get(guildId);
        if (player) {
            player.pause();
            return true;
        }
        return false;
    }

    // Resume playback
    resume(guildId) {
        const player = this.players.get(guildId);
        if (player) {
            player.unpause();
            return true;
        }
        return false;
    }

    // Stop playback
    stop(guildId) {
        const player = this.players.get(guildId);
        if (player) {
            player.stop();
            return true;
        }
        return false;
    }

    // Skip to next song
    async skip(guildId) {
        const player = this.players.get(guildId);
        if (player) {
            player.stop(); // This will trigger the 'idle' event and play next song
            return true;
        }
        return false;
    }

    // Leave voice channel and cleanup
    async leave(guildId) {
        try {
            console.log(`🔇 Leaving voice channel in guild ${guildId}`);
            
            // Stop player
            const player = this.players.get(guildId);
            if (player) {
                player.stop();
            }

            // Destroy connection
            const connection = this.connections.get(guildId) || getVoiceConnection(guildId);
            if (connection) {
                connection.destroy();
            }

            // Cleanup
            this.cleanup(guildId);

            return true;

        } catch (error) {
            console.error('Error leaving voice channel:', error);
            return false;
        }
    }

    // Cleanup resources for guild
    cleanup(guildId) {
        // Remove player
        const player = this.players.get(guildId);
        if (player) {
            player.stop();
            this.players.delete(guildId);
        }

        // Remove connection
        this.connections.delete(guildId);

        // Clear queue
        queueManager.deleteQueue(guildId);

        console.log(`🧹 Cleaned up resources for guild ${guildId}`);
    }

    // Get player status
    getStatus(guildId) {
        const player = this.players.get(guildId);
        const connection = this.connections.get(guildId);
        const queue = queueManager.getQueue(guildId);

        return {
            hasPlayer: !!player,
            hasConnection: !!connection,
            playerState: player?.state?.status || 'idle',
            connectionState: connection?.state?.status || 'disconnected',
            isPlaying: queue.isPlaying,
            isPaused: queue.isPaused,
            currentSong: queueManager.getCurrentSong(guildId)
        };
    }

    // Create now playing embed
    createNowPlayingEmbed(song, queuePosition = null) {
        const embed = new EmbedBuilder()
            .setColor('#4ECDC4')
            .setTitle('🎵 Now Playing')
            .setDescription(`**[${song.title}](${song.url})**`)
            .addFields([
                { name: '⏱️ Duration', value: song.duration || 'Unknown', inline: true },
                { name: '📺 Channel', value: song.channel || 'Unknown', inline: true },
                { name: '👤 Requested by', value: song.requestedBy || 'Unknown', inline: true }
            ])
            .setTimestamp();

        if (song.thumbnail) {
            embed.setThumbnail(song.thumbnail);
        }

        if (queuePosition !== null) {
            embed.addFields([
                { name: '📍 Position in Queue', value: `${queuePosition + 1}`, inline: true }
            ]);
        }

        return embed;
    }

    // Create queue embed
    createQueueEmbed(guildId, page = 0, itemsPerPage = 10) {
        const queue = queueManager.getQueue(guildId);
        const currentSong = queueManager.getCurrentSong(guildId);
        
        const embed = new EmbedBuilder()
            .setColor('#45B7D1')
            .setTitle('📋 Music Queue')
            .setTimestamp();

        if (queue.songs.length === 0) {
            embed.setDescription('Queue is empty! Use `/play` to add songs.');
            return embed;
        }

        // Current song
        if (currentSong) {
            embed.addFields([
                { 
                    name: '▶️ Currently Playing', 
                    value: `**[${currentSong.title}](${currentSong.url})**\n` +
                           `Duration: ${currentSong.duration} | Requested by: ${currentSong.requestedBy}`,
                    inline: false 
                }
            ]);
        }

        // Queue songs
        const startIndex = page * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, queue.songs.length);
        const queueSongs = queue.songs.slice(startIndex, endIndex);

        if (queueSongs.length > 0) {
            const queueList = queueSongs.map((song, index) => {
                const position = startIndex + index + 1;
                const isNext = position === queue.currentIndex + 1;
                const prefix = isNext ? '🔜' : `${position}.`;
                
                return `${prefix} **[${song.title}](${song.url})**\n` +
                       `   Duration: ${song.duration} | By: ${song.requestedBy}`;
            }).join('\n\n');

            embed.addFields([
                { name: '📝 Up Next', value: queueList, inline: false }
            ]);
        }

        // Queue info
        const totalPages = Math.ceil(queue.songs.length / itemsPerPage);
        embed.setFooter({ 
            text: `Page ${page + 1}/${totalPages} | ${queue.songs.length} songs total` +
                  (queue.loop ? ' | 🔁 Loop ON' : '') +
                  (queue.shuffle ? ' | 🔀 Shuffle ON' : '')
        });

        return embed;
    }
}

module.exports = new MusicPlayer(); 