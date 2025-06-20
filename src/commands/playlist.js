const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const queueManager = require('../utils/queueManager');
const musicPlayer = require('../utils/musicPlayer');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('playlist')
        .setDescription('Manage saved playlists')
        .addSubcommand(subcommand =>
            subcommand
                .setName('save')
                .setDescription('Save current queue as a playlist')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name for the playlist')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('load')
                .setDescription('Load a saved playlist')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name of the playlist to load')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all saved playlists')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear the current queue')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a song from the queue')
                .addIntegerOption(option =>
                    option.setName('position')
                        .setDescription('Position of the song to remove (1-based)')
                        .setMinValue(1)
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guild.id;

            switch (subcommand) {
                case 'save':
                    return await this.handleSave(interaction, guildId);
                case 'load':
                    return await this.handleLoad(interaction, guildId);
                case 'list':
                    return await this.handleList(interaction, guildId);
                case 'clear':
                    return await this.handleClear(interaction, guildId);
                case 'remove':
                    return await this.handleRemove(interaction, guildId);
                default:
                    return await interaction.reply({
                        content: 'Unknown subcommand!',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error in playlist command:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Error')
                .setDescription('An error occurred while executing the command.');
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.reply({ embeds: [embed] });
            }
        }
    },

    async handleSave(interaction, guildId) {
        const name = interaction.options.getString('name');
        const queue = queueManager.getQueue(guildId);

        if (queue.songs.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Empty Queue')
                .setDescription('Cannot save an empty queue! Add some songs first.');
            
            return await interaction.reply({ embeds: [embed] });
        }

        const result = await queueManager.savePlaylist(guildId, name);

        if (result.success) {
            const embed = new EmbedBuilder()
                .setColor('#4ECDC4')
                .setTitle('💾 Playlist Saved')
                .setDescription(`Playlist **"${name}"** has been saved successfully!`)
                .addFields([
                    { name: '🎵 Songs Count', value: `${queue.songs.length}`, inline: true },
                    { name: '👤 Saved by', value: interaction.member.displayName, inline: true }
                ])
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Save Failed')
                .setDescription(`Failed to save playlist: ${result.error}`);
            
            await interaction.reply({ embeds: [embed] });
        }
    },

    async handleLoad(interaction, guildId) {
        const name = interaction.options.getString('name');
        const member = interaction.member;

        // Check if user is in a voice channel
        if (!member.voice.channel) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Error')
                .setDescription('You need to be in a voice channel to load a playlist!');
            
            return await interaction.reply({ embeds: [embed] });
        }

        await interaction.deferReply();

        const result = await queueManager.loadPlaylist(guildId, name);

        if (!result.success) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Load Failed')
                .setDescription(`Failed to load playlist: ${result.error}`);
            
            return await interaction.editReply({ embeds: [embed] });
        }

        const playlist = result.playlist;
        
        // Add requester info to songs
        const songsWithRequester = playlist.songs.map(song => ({
            ...song,
            requestedBy: member.displayName
        }));

        // Add songs to queue
        const addResult = queueManager.addSongs(guildId, songsWithRequester);
        
        // Set text channel for queue updates
        const queue = queueManager.getQueue(guildId);
        queue.textChannel = interaction.channel;

        // Join voice channel and start playing if not already playing
        const wasEmpty = addResult.startIndex === 0;
        
        if (wasEmpty) {
            await musicPlayer.joinChannel(member.voice.channel);
            await musicPlayer.playSong(guildId);
        }

        const embed = new EmbedBuilder()
            .setColor('#4ECDC4')
            .setTitle('📋 Playlist Loaded')
            .setDescription(`Loaded playlist **"${playlist.name}"**`)
            .addFields([
                { name: '🎵 Songs Count', value: `${playlist.songs.length}`, inline: true },
                { name: '📍 Queue Position', value: `${addResult.startIndex + 1} - ${addResult.endIndex + 1}`, inline: true },
                { name: '👤 Loaded by', value: member.displayName, inline: true },
                { name: '📅 Created', value: new Date(playlist.createdAt).toLocaleDateString(), inline: true }
            ])
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleList(interaction, guildId) {
        const result = await queueManager.listPlaylists(guildId);

        if (!result.success) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Error')
                .setDescription(`Failed to list playlists: ${result.error}`);
            
            return await interaction.reply({ embeds: [embed] });
        }

        if (result.playlists.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('📋 No Playlists')
                .setDescription('No saved playlists found for this server.\nUse `/playlist save <name>` to save your first playlist!');
            
            return await interaction.reply({ embeds: [embed] });
        }

        const playlistList = result.playlists.map((playlist, index) => {
            const createdDate = new Date(playlist.createdAt).toLocaleDateString();
            return `${index + 1}. **${playlist.name}**\n   🎵 ${playlist.songCount} songs | 📅 ${createdDate}`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
            .setColor('#45B7D1')
            .setTitle('📋 Saved Playlists')
            .setDescription(playlistList)
            .setFooter({ text: `Total: ${result.playlists.length} playlists` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async handleClear(interaction, guildId) {
        const queue = queueManager.getQueue(guildId);

        if (queue.songs.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Empty Queue')
                .setDescription('The queue is already empty!');
            
            return await interaction.reply({ embeds: [embed] });
        }

        const songCount = queue.songs.length;
        
        // Stop current playback and clear queue
        musicPlayer.stop(guildId);
        queueManager.clearQueue(guildId);

        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('🗑️ Queue Cleared')
            .setDescription(`Removed ${songCount} songs from the queue.`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async handleRemove(interaction, guildId) {
        const position = interaction.options.getInteger('position');
        const queue = queueManager.getQueue(guildId);

        if (queue.songs.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Empty Queue')
                .setDescription('The queue is empty!');
            
            return await interaction.reply({ embeds: [embed] });
        }

        if (position > queue.songs.length) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Invalid Position')
                .setDescription(`Position ${position} is out of range. Queue has ${queue.songs.length} songs.`);
            
            return await interaction.reply({ embeds: [embed] });
        }

        // Convert to 0-based index
        const index = position - 1;
        
        // Check if trying to remove currently playing song
        if (index === queue.currentIndex && queue.isPlaying) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Cannot Remove')
                .setDescription('Cannot remove the currently playing song. Use `/controls skip` instead.');
            
            return await interaction.reply({ embeds: [embed] });
        }

        const removedSong = queueManager.removeSong(guildId, index);

        if (removedSong) {
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('🗑️ Song Removed')
                .setDescription(`Removed **${removedSong.title}** from position ${position}`)
                .addFields([
                    { name: '👤 Originally requested by', value: removedSong.requestedBy || 'Unknown', inline: true },
                    { name: '⏱️ Duration', value: removedSong.duration || 'Unknown', inline: true }
                ])
                .setTimestamp();

            if (removedSong.thumbnail) {
                embed.setThumbnail(removedSong.thumbnail);
            }

            await interaction.reply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Remove Failed')
                .setDescription('Failed to remove the song from the queue.');
            
            await interaction.reply({ embeds: [embed] });
        }
    }
}; 