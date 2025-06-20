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
                    { name: 'YouTube by Artist', value: 'artist' }
                )
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
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
                
                return await interaction.editReply({ embeds: [embed] });
            }

            // Set text channel for queue updates
            const queue = queueManager.getQueue(guildId);
            queue.textChannel = interaction.channel;

            // Check if it's a Spotify playlist URL
            if (spotifyApi.isSpotifyPlaylistURL(query)) {
                return await this.handleSpotifyPlaylist(interaction, query, member);
            }

            // Check if it's a YouTube URL
            if (youtubeSearch.isYouTubeURL(query)) {
                return await this.handleYouTubeURL(interaction, query, member);
            }

            // Handle search by source
            if (source === 'artist') {
                return await this.handleArtistSearch(interaction, query, member);
            } else {
                return await this.handleYouTubeSearch(interaction, query, member);
            }

        } catch (error) {
            console.error('Error in play command:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing your request. Please try again.');
            
            if (interaction.deferred) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.reply({ embeds: [embed] });
            }
        }
    },

    async handleYouTubeURL(interaction, url, member) {
        const guildId = interaction.guild.id;
        
        const result = await youtubeSearch.getVideoInfo(url);
        
        if (!result.success) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Error')
                .setDescription(`Failed to get video info: ${result.error}`);
            
            return await interaction.editReply({ embeds: [embed] });
        }

        const song = {
            ...result.song,
            requestedBy: member.displayName
        };

        return await this.addSongAndPlay(interaction, song, member);
    },

    async handleYouTubeSearch(interaction, query, member) {
        const result = await youtubeSearch.searchByQuery(query, 1);
        
        if (!result.success || result.songs.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ No Results')
                .setDescription(`No results found for: "${query}"`);
            
            return await interaction.editReply({ embeds: [embed] });
        }

        const song = {
            ...result.songs[0],
            requestedBy: member.displayName
        };

        return await this.addSongAndPlay(interaction, song, member);
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
    },

    async addSongAndPlay(interaction, song, member) {
        const guildId = interaction.guild.id;
        
        // Add song to queue
        const queuePosition = queueManager.addSong(guildId, song);
        
        // Join voice channel and start playing if queue was empty
        const wasEmpty = queuePosition === 1;
        
        if (wasEmpty) {
            await musicPlayer.joinChannel(member.voice.channel);
            await musicPlayer.playSong(guildId);
        }

        // Create response embed
        const embed = musicPlayer.createNowPlayingEmbed(song, wasEmpty ? null : queuePosition - 1);
        
        if (!wasEmpty) {
            embed.setTitle('🎵 Added to Queue');
            embed.addFields([
                { name: '📍 Position in Queue', value: `${queuePosition}`, inline: true }
            ]);
        }

        return await interaction.editReply({ embeds: [embed] });
    }
}; 