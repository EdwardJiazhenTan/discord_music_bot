const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const youtubeSearch = require('../utils/youtubeSearch');
const spotifyApi = require('../utils/spotifyApi');
const queueManager = require('../utils/queueManager');
const musicPlayer = require('../utils/musicPlayer');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play music from YouTube or add Spotify playlist to queue')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Song name, YouTube URL, or Spotify playlist URL')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('source')
                .setDescription('Specify search source')
                .addChoices(
                    { name: 'YouTube', value: 'youtube' },
                    { name: 'YouTube by Artist', value: 'artist' },
                    { name: 'Spotify', value: 'spotify' }
                )
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            // Check if interaction is still valid
            if (interaction.replied || interaction.deferred) {
                console.log('⚠️ Interaction already handled, skipping...');
                return;
            }

            await interaction.deferReply();

            const query = interaction.options.getString('query');
            const source = interaction.options.getString('source') || 'youtube';
            const guildId = interaction.guild.id;
            const member = interaction.member;

            // Check if user is in a voice channel
            if (!member.voice.channel) {
                const embed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ Error')
                    .setDescription('You need to be in a voice channel to play music!');
                
                return await this.safeEditReply(interaction, { embeds: [embed] });
            }

            // Set text channel for queue updates
            const queue = queueManager.getQueue(guildId);
            queue.textChannel = interaction.channel;

            if (source === 'youtube') {
                if (youtubeSearch.isYouTubeURL(query)) {
                    await this.handleYouTubeURL(interaction, query, member);
                } else {
                    await this.handleYouTubeSearch(interaction, query, member);
                }
            } else if (source === 'spotify') {
                await this.handleSpotifyURL(interaction, query, member);
            } else if (source === 'artist') {
                await this.handleArtistSearch(interaction, query, member);
            }

        } catch (error) {
            console.error('❌ Error in play command:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Unexpected Error')
                .setDescription('Something went wrong while processing your request.')
                .addFields({ 
                    name: '🔧 What you can try', 
                    value: '• Try the command again\n• Check if the URL is valid\n• Contact support if the issue persists' 
                });

            await this.safeEditReply(interaction, { embeds: [embed] });
        }
    },

    // Safe method to edit reply without causing errors
    async safeEditReply(interaction, content) {
        try {
            if (interaction.deferred) {
                return await interaction.editReply(content);
            } else if (!interaction.replied) {
                return await interaction.reply(content);
            }
        } catch (error) {
            console.error('❌ Failed to respond to interaction:', error.message);
        }
    },

    // Handle YouTube URL
    async handleYouTubeURL(interaction, url, member) {
        try {
            const result = await youtubeSearch.getVideoInfo(url);
            
            if (!result.success) {
                const embed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ YouTube Error')
                    .setDescription(`Failed to get video information: ${result.error}`)
                    .addFields({ 
                        name: '💡 Troubleshooting', 
                        value: '• Make sure the video is not private or region-locked\n• Try copying the URL again\n• Some videos may be temporarily unavailable' 
                    });
                
                return await this.safeEditReply(interaction, { embeds: [embed] });
            }

            const song = {
                title: result.video.title,
                url: url,
                duration: result.video.duration,
                thumbnail: result.video.thumbnail,
                requestedBy: member.user.tag
            };

            return await this.addToQueueAndPlay(interaction, song, member);

        } catch (error) {
            console.error('❌ Error handling YouTube URL:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ YouTube Processing Error')
                .setDescription('Could not process the YouTube video')
                .addFields({ 
                    name: '🔧 Common solutions', 
                    value: '• Video might be private or age-restricted\n• YouTube might be temporarily unavailable\n• Try a different video' 
                });
            
            await this.safeEditReply(interaction, { embeds: [embed] });
        }
    },

    // Handle YouTube search by query
    async handleYouTubeSearch(interaction, query, member) {
        try {
            const result = await youtubeSearch.searchByQuery(query, 1);
            
            if (!result.success || !result.songs || result.songs.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('🔍 No Results Found')
                    .setDescription(`Could not find any videos for: **${query}**`)
                    .addFields({ 
                        name: '💡 Try these tips', 
                        value: '• Use more specific search terms\n• Include the artist name\n• Try different keywords\n• Check spelling' 
                    });
                
                return await this.safeEditReply(interaction, { embeds: [embed] });
            }

            const song = result.songs[0];
            song.requestedBy = member.user.tag;

            return await this.addToQueueAndPlay(interaction, song, member);

        } catch (error) {
            console.error('❌ Error in YouTube search:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Search Error')
                .setDescription('Could not search YouTube at this time')
                .addFields({ 
                    name: '🔧 What to try', 
                    value: '• Try again in a moment\n• Use a direct YouTube URL instead\n• Check your search terms' 
                });
            
            await this.safeEditReply(interaction, { embeds: [embed] });
        }
    },

    async handleArtistSearch(interaction, artistName, member) {
        const result = await youtubeSearch.searchByArtist(artistName, 5);
        
        if (!result.success || result.songs.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ No Results')
                .setDescription(`No songs found for artist: "${artistName}"`);
            
            return await interaction.editReply({ embeds: [embed] });
        }

        const guildId = interaction.guild.id;
        const songsWithRequester = result.songs.map(song => ({
            ...song,
            requestedBy: member.displayName
        }));

        // Add all songs to queue
        const addResult = queueManager.addSongs(guildId, songsWithRequester);
        
        // Join voice channel and start playing if not already playing
        const wasEmpty = addResult.startIndex === 0;
        
        if (wasEmpty) {
            await musicPlayer.joinChannel(member.voice.channel);
            await musicPlayer.playSong(guildId);
        }

        const embed = new EmbedBuilder()
            .setColor('#4ECDC4')
            .setTitle('🎵 Added Artist Songs')
            .setDescription(`Added **${addResult.count}** songs by **${artistName}** to the queue!`)
            .addFields([
                { name: '📍 Queue Position', value: `${addResult.startIndex + 1} - ${addResult.endIndex + 1}`, inline: true },
                { name: '👤 Requested by', value: member.displayName, inline: true }
            ])
            .setTimestamp();

        // Show first few songs
        const songList = songsWithRequester.slice(0, 5).map((song, index) => 
            `${index + 1}. **${song.title}** (${song.duration})`
        ).join('\n');

        if (songsWithRequester.length > 5) {
            embed.addFields([
                { name: '🎵 Songs Preview', value: songList + `\n... and ${songsWithRequester.length - 5} more`, inline: false }
            ]);
        } else {
            embed.addFields([
                { name: '🎵 Songs Added', value: songList, inline: false }
            ]);
        }

        return await interaction.editReply({ embeds: [embed] });
    },

    // Helper method to add song to queue and start playing
    async addToQueueAndPlay(interaction, song, member) {
        try {
            const queuePosition = queueManager.addSong(interaction.guild.id, song);
            
            const embed = new EmbedBuilder()
                .setColor('#00D166')
                .setTitle('✅ Added to Queue')
                .setDescription(`**${song.title}**`)
                .addFields(
                    { name: '⏱️ Duration', value: song.duration || 'Unknown', inline: true },
                    { name: '📍 Position', value: `${queuePosition}`, inline: true },
                    { name: '👤 Requested by', value: song.requestedBy, inline: true }
                )
                .setThumbnail(song.thumbnail);

            await this.safeEditReply(interaction, { embeds: [embed] });

            // Try to join voice channel and play
            const connection = await musicPlayer.joinChannel(member.voice.channel);
            if (connection && queuePosition === 1) {
                try {
                    await musicPlayer.playSong(interaction.guild.id);
                } catch (playError) {
                    console.error('❌ Error starting playback:', playError);
                    
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#FF6B6B')
                        .setTitle('❌ Playback Error')
                        .setDescription('Added to queue but failed to start playing.')
                        .addFields({ 
                            name: '🔄 Try these solutions', 
                            value: '• Use `/controls skip` to try the next song\n• Wait a moment and try again\n• Check your internet connection' 
                        });
                    
                    await interaction.followUp({ embeds: [errorEmbed] });
                }
            }

        } catch (error) {
            console.error('❌ Error adding to queue:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Queue Error')
                .setDescription('Failed to add song to queue')
                .addFields({ 
                    name: '🔧 What happened', 
                    value: '• Queue system encountered an error\n• Try the command again\n• Contact support if this persists' 
                });
            
            await this.safeEditReply(interaction, { embeds: [embed] });
        }
    },

    async handleSpotifyURL(interaction, url, member) {
        try {
            // Check if it's a Spotify playlist URL
            if (spotifyApi.isSpotifyPlaylistURL(url)) {
                return await this.handleSpotifyPlaylist(interaction, url, member);
            }
            
            // Handle other Spotify URLs (tracks, albums, etc.)
            const embed = new EmbedBuilder()
                .setColor('#1DB954')
                .setTitle('🎵 Spotify Integration')
                .setDescription('Spotify track/album links are not yet supported. Try a playlist URL or search for the song on YouTube.')
                .addFields({ 
                    name: '💡 What you can do', 
                    value: '• Copy the song title and use `/play` to search YouTube\n• Use a Spotify playlist URL\n• Use direct YouTube URLs' 
                });
            
            await this.safeEditReply(interaction, { embeds: [embed] });

        } catch (error) {
            console.error('❌ Error handling Spotify URL:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Spotify Error')
                .setDescription('Could not process the Spotify URL')
                .addFields({ 
                    name: '🔧 Common issues', 
                    value: '• URL might be invalid\n• Playlist might be private\n• Try copying the URL again' 
                });
            
            await this.safeEditReply(interaction, { embeds: [embed] });
        }
    },

    async handleSpotifyPlaylist(interaction, url, member) {
        const guildId = interaction.guild.id;
        
        // Show loading message
        const loadingEmbed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('🔄 Processing Spotify Playlist')
            .setDescription('Fetching playlist and converting to YouTube... This may take a moment.');
        
        await interaction.editReply({ embeds: [loadingEmbed] });

        const result = await spotifyApi.getPlaylistFromURL(url, member.displayName);
        
        if (!result.success) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Spotify Error')
                .setDescription(`Failed to process Spotify playlist: ${result.error}`);
            
            return await interaction.editReply({ embeds: [embed] });
        }

        const playlist = result.playlist;
        
        if (playlist.tracks.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ No Tracks')
                .setDescription('No playable tracks found in the Spotify playlist.');
            
            return await interaction.editReply({ embeds: [embed] });
        }

        // Add songs to queue
        const addResult = queueManager.addSongs(guildId, playlist.tracks);
        
        // Join voice channel and start playing if not already playing
        const wasEmpty = addResult.startIndex === 0;
        
        if (wasEmpty) {
            await musicPlayer.joinChannel(member.voice.channel);
            await musicPlayer.playSong(guildId);
        }

        const embed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('🎵 Spotify Playlist Added')
            .setDescription(`**${playlist.name}**`)
            .addFields([
                { name: '📊 Conversion Stats', value: `${playlist.convertedCount}/${playlist.originalCount} tracks converted`, inline: true },
                { name: '📍 Queue Position', value: `${addResult.startIndex + 1} - ${addResult.endIndex + 1}`, inline: true },
                { name: '👤 Requested by', value: member.displayName, inline: true }
            ])
            .setTimestamp();

        // Show conversion success rate
        const successRate = (playlist.convertedCount / playlist.originalCount * 100).toFixed(1);
        embed.addFields([
            { name: '✅ Success Rate', value: `${successRate}%`, inline: true }
        ]);

        // Show failed tracks if any
        if (playlist.failedTracks.length > 0 && playlist.failedTracks.length <= 5) {
            const failedList = playlist.failedTracks.map(track => 
                `• ${track.artists.join(', ')} - ${track.title}`
            ).join('\n');
            
            embed.addFields([
                { name: '⚠️ Tracks Not Found', value: failedList, inline: false }
            ]);
        } else if (playlist.failedTracks.length > 5) {
            embed.addFields([
                { name: '⚠️ Tracks Not Found', value: `${playlist.failedTracks.length} tracks could not be found on YouTube`, inline: false }
            ]);
        }

        return await interaction.editReply({ embeds: [embed] });
    }
}; 