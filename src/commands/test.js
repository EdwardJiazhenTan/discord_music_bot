const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const youtubeSearch = require('../utils/youtubeSearch');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('Test YouTube functionality')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('YouTube URL to test')
                .setRequired(true)
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply();
            
            const url = interaction.options.getString('url');
            
            // Test if it's a valid YouTube URL
            if (!youtubeSearch.isYouTubeURL(url)) {
                const embed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ Invalid URL')
                    .setDescription('Please provide a valid YouTube URL');
                
                return await interaction.editReply({ embeds: [embed] });
            }
            
            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🧪 Testing YouTube URL')
                .setDescription(`Testing: ${url}`)
                .addFields({ name: 'Status', value: '⏳ Checking video info...' });
            
            await interaction.editReply({ embeds: [embed] });
            
            // Test getting video info
            console.log(`🧪 Testing video info for: ${url}`);
            const videoResult = await youtubeSearch.getVideoInfo(url);
            
            if (!videoResult.success) {
                const failEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ Video Info Failed')
                    .setDescription(`Error: ${videoResult.error}`)
                    .addFields({ name: 'URL', value: url });
                
                return await interaction.editReply({ embeds: [failEmbed] });
            }
            
            // Test playability
            console.log(`🧪 Testing playability for: ${url}`);
            let playabilityText = '⏳ Checking...';
            try {
                const isPlayable = await youtubeSearch.isPlayable(url);
                playabilityText = isPlayable ? '✅ Playable' : '❌ Not playable';
            } catch (playError) {
                playabilityText = `❌ Error: ${playError.message}`;
            }
            
            // Test stream creation
            console.log(`🧪 Testing stream creation for: ${url}`);
            let streamText = '⏳ Testing stream...';
            try {
                const stream = await youtubeSearch.getAudioStreamWithRetry(url, 1);
                if (stream) {
                    streamText = '✅ Stream created successfully';
                    stream.destroy(); // Clean up
                } else {
                    streamText = '❌ No stream returned';
                }
            } catch (streamError) {
                streamText = `❌ Stream error: ${streamError.message}`;
            }
            
            const successEmbed = new EmbedBuilder()
                .setColor('#00D166')
                .setTitle('🧪 YouTube Test Results')
                .setDescription(`**${videoResult.song.title}**`)
                .addFields(
                    { name: '👤 Channel', value: videoResult.song.channel, inline: true },
                    { name: '⏱️ Duration', value: videoResult.song.duration, inline: true },
                    { name: '👁️ Views', value: videoResult.song.views.toLocaleString(), inline: true },
                    { name: '🎵 Playability Test', value: playabilityText, inline: true },
                    { name: '🔊 Stream Test', value: streamText, inline: true },
                    { name: '🔗 URL', value: url, inline: false }
                )
                .setThumbnail(videoResult.song.thumbnail);
            
            await interaction.editReply({ embeds: [successEmbed] });
            
        } catch (error) {
            console.error('Error in test command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Test Failed')
                .setDescription(`Unexpected error: ${error.message}`)
                .addFields({ name: 'Error Type', value: error.name || 'Unknown' });
            
            try {
                if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else if (!interaction.replied) {
                    await interaction.reply({ embeds: [errorEmbed] });
                }
            } catch (replyError) {
                console.error('Error sending test error response:', replyError);
            }
        }
    },
}; 