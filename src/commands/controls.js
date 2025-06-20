const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const queueManager = require('../utils/queueManager');
const musicPlayer = require('../utils/musicPlayer');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('controls')
        .setDescription('Music playback controls')
        .addSubcommand(subcommand =>
            subcommand
                .setName('pause')
                .setDescription('Pause the current song')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('resume')
                .setDescription('Resume playback')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('skip')
                .setDescription('Skip to the next song')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('Stop playback and clear the queue')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('shuffle')
                .setDescription('Toggle shuffle mode')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('loop')
                .setDescription('Toggle loop mode')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('nowplaying')
                .setDescription('Show currently playing song')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('queue')
                .setDescription('Show the current queue')
                .addIntegerOption(option =>
                    option.setName('page')
                        .setDescription('Page number (default: 1)')
                        .setMinValue(1)
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guild.id;

            switch (subcommand) {
                case 'pause':
                    return await this.handlePause(interaction, guildId);
                case 'resume':
                    return await this.handleResume(interaction, guildId);
                case 'skip':
                    return await this.handleSkip(interaction, guildId);
                case 'stop':
                    return await this.handleStop(interaction, guildId);
                case 'shuffle':
                    return await this.handleShuffle(interaction, guildId);
                case 'loop':
                    return await this.handleLoop(interaction, guildId);
                case 'nowplaying':
                    return await this.handleNowPlaying(interaction, guildId);
                case 'queue':
                    return await this.handleQueue(interaction, guildId);
                default:
                    return await interaction.reply({
                        content: 'Unknown subcommand!',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error in controls command:', error);
            
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

    async handlePause(interaction, guildId) {
        const queue = queueManager.getQueue(guildId);
        
        if (!queue.isPlaying) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Nothing Playing')
                .setDescription('No music is currently playing!');
            
            return await interaction.reply({ embeds: [embed] });
        }

        if (queue.isPaused) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Already Paused')
                .setDescription('Music is already paused!');
            
            return await interaction.reply({ embeds: [embed] });
        }

        const success = musicPlayer.pause(guildId);
        
        if (success) {
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('⏸️ Paused')
                .setDescription('Music playback has been paused.')
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Error')
                .setDescription('Failed to pause playback.');
            
            await interaction.reply({ embeds: [embed] });
        }
    },

    async handleResume(interaction, guildId) {
        const queue = queueManager.getQueue(guildId);
        
        if (!queue.isPaused) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Not Paused')
                .setDescription('Music is not currently paused!');
            
            return await interaction.reply({ embeds: [embed] });
        }

        const success = musicPlayer.resume(guildId);
        
        if (success) {
            const currentSong = queueManager.getCurrentSong(guildId);
            const embed = new EmbedBuilder()
                .setColor('#4ECDC4')
                .setTitle('▶️ Resumed')
                .setDescription(currentSong ? `Resumed: **${currentSong.title}**` : 'Music playback has been resumed.')
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Error')
                .setDescription('Failed to resume playback.');
            
            await interaction.reply({ embeds: [embed] });
        }
    },

    async handleSkip(interaction, guildId) {
        const currentSong = queueManager.getCurrentSong(guildId);
        
        if (!currentSong) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Nothing Playing')
                .setDescription('No music is currently playing!');
            
            return await interaction.reply({ embeds: [embed] });
        }

        const success = await musicPlayer.skip(guildId);
        
        if (success) {
            const embed = new EmbedBuilder()
                .setColor('#4ECDC4')
                .setTitle('⏭️ Skipped')
                .setDescription(`Skipped: **${currentSong.title}**`)
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Error')
                .setDescription('Failed to skip the song.');
            
            await interaction.reply({ embeds: [embed] });
        }
    },

    async handleStop(interaction, guildId) {
        const queue = queueManager.getQueue(guildId);
        
        if (queue.songs.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Nothing Playing')
                .setDescription('No music is currently playing!');
            
            return await interaction.reply({ embeds: [embed] });
        }

        // Stop playback and clear queue
        musicPlayer.stop(guildId);
        queueManager.clearQueue(guildId);
        
        // Leave voice channel
        await musicPlayer.leave(guildId);

        const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('⏹️ Stopped')
            .setDescription('Music playback stopped and queue cleared.')
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    },

    async handleShuffle(interaction, guildId) {
        const queue = queueManager.getQueue(guildId);
        
        if (queue.songs.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Empty Queue')
                .setDescription('The queue is empty!');
            
            return await interaction.reply({ embeds: [embed] });
        }

        const shuffleEnabled = queueManager.toggleShuffle(guildId);
        
        const embed = new EmbedBuilder()
            .setColor(shuffleEnabled ? '#4ECDC4' : '#FFA500')
            .setTitle(shuffleEnabled ? '🔀 Shuffle Enabled' : '🔀 Shuffle Disabled')
            .setDescription(shuffleEnabled ? 'Songs will now play in random order.' : 'Songs will now play in order.')
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    },

    async handleLoop(interaction, guildId) {
        const queue = queueManager.getQueue(guildId);
        
        if (queue.songs.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Empty Queue')
                .setDescription('The queue is empty!');
            
            return await interaction.reply({ embeds: [embed] });
        }

        const loopEnabled = queueManager.toggleLoop(guildId);
        
        const embed = new EmbedBuilder()
            .setColor(loopEnabled ? '#4ECDC4' : '#FFA500')
            .setTitle(loopEnabled ? '🔁 Loop Enabled' : '🔁 Loop Disabled')
            .setDescription(loopEnabled ? 'The queue will now repeat when it reaches the end.' : 'The queue will stop when it reaches the end.')
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    },

    async handleNowPlaying(interaction, guildId) {
        const currentSong = queueManager.getCurrentSong(guildId);
        const queue = queueManager.getQueue(guildId);
        
        if (!currentSong) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Nothing Playing')
                .setDescription('No music is currently playing!');
            
            return await interaction.reply({ embeds: [embed] });
        }

        const embed = musicPlayer.createNowPlayingEmbed(currentSong, queue.currentIndex);
        
        // Add playback status
        let statusText = '';
        if (queue.isPlaying) {
            statusText = '▶️ Playing';
        } else if (queue.isPaused) {
            statusText = '⏸️ Paused';
        } else {
            statusText = '⏹️ Stopped';
        }

        embed.addFields([
            { name: '🎵 Status', value: statusText, inline: true },
            { name: '📋 Queue Position', value: `${queue.currentIndex + 1}/${queue.songs.length}`, inline: true }
        ]);

        // Add loop/shuffle status
        const modes = [];
        if (queue.loop) modes.push('🔁 Loop');
        if (queue.shuffle) modes.push('🔀 Shuffle');
        
        if (modes.length > 0) {
            embed.addFields([
                { name: '⚙️ Modes', value: modes.join(' | '), inline: true }
            ]);
        }

        await interaction.reply({ embeds: [embed] });
    },

    async handleQueue(interaction, guildId) {
        const page = (interaction.options.getInteger('page') || 1) - 1;
        const embed = musicPlayer.createQueueEmbed(guildId, page, 10);
        
        await interaction.reply({ embeds: [embed] });
    }
}; 