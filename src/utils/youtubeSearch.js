const YouTube = require('youtube-sr').default;
const ytdl = require('ytdl-core');

class YouTubeSearch {
    constructor() {
        this.maxResults = 10;
    }

    // Check if string is a valid YouTube URL
    isYouTubeURL(str) {
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]+/;
        return youtubeRegex.test(str);
    }

    // Extract video ID from YouTube URL
    extractVideoId(url) {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    // Search YouTube by query
    async searchByQuery(query, limit = 5) {
        try {
            console.log(`🔍 Searching YouTube for: "${query}"`);
            
            const results = await YouTube.search(query, {
                limit: limit,
                type: 'video'
            });

            if (!results || results.length === 0) {
                return { success: false, error: 'No results found' };
            }

            const songs = results.map(video => ({
                title: video.title,
                url: video.url,
                duration: this.formatDuration(video.duration),
                durationMs: video.duration,
                thumbnail: video.thumbnail?.url || video.thumbnail?.displayThumbnailURL?.() || null,
                channel: video.channel?.name || 'Unknown',
                views: video.views || 0,
                source: 'youtube'
            }));

            console.log(`✅ Found ${songs.length} results for "${query}"`);
            return { success: true, songs };

        } catch (error) {
            console.error('YouTube search error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get video info from YouTube URL
    async getVideoInfo(url) {
        try {
            console.log(`📺 Fetching YouTube video info: ${url}`);
            
            // First try with youtube-sr for better metadata
            const videoId = this.extractVideoId(url);
            if (videoId) {
                try {
                    const video = await YouTube.getVideo(url);
                    if (video) {
                        const song = {
                            title: video.title,
                            url: video.url,
                            duration: this.formatDuration(video.duration),
                            durationMs: video.duration,
                            thumbnail: video.thumbnail?.url || video.thumbnail?.displayThumbnailURL?.() || null,
                            channel: video.channel?.name || 'Unknown',
                            views: video.views || 0,
                            source: 'youtube'
                        };
                        
                        console.log(`✅ Retrieved video info: "${song.title}"`);
                        return { success: true, song };
                    }
                } catch (srError) {
                    console.log('youtube-sr failed, trying ytdl-core...');
                }
            }

            // Fallback to ytdl-core
            const info = await ytdl.getInfo(url);
            const details = info.videoDetails;

            const song = {
                title: details.title,
                url: details.video_url,
                duration: this.formatDuration(parseInt(details.lengthSeconds) * 1000),
                durationMs: parseInt(details.lengthSeconds) * 1000,
                thumbnail: details.thumbnails?.[0]?.url || null,
                channel: details.author?.name || 'Unknown',
                views: parseInt(details.viewCount) || 0,
                source: 'youtube'
            };

            console.log(`✅ Retrieved video info: "${song.title}"`);
            return { success: true, song };

        } catch (error) {
            console.error('Error getting video info:', error);
            return { success: false, error: error.message };
        }
    }

    // Search by artist name
    async searchByArtist(artistName, limit = 10) {
        try {
            // Search for popular songs by artist
            const queries = [
                `${artistName} songs`,
                `${artistName} best hits`,
                `${artistName} popular`
            ];

            const allResults = [];
            
            for (const query of queries) {
                const result = await this.searchByQuery(query, Math.ceil(limit / queries.length));
                if (result.success) {
                    allResults.push(...result.songs);
                }
            }

            // Remove duplicates and limit results
            const uniqueSongs = [];
            const seenUrls = new Set();
            
            for (const song of allResults) {
                if (!seenUrls.has(song.url) && uniqueSongs.length < limit) {
                    seenUrls.add(song.url);
                    uniqueSongs.push(song);
                }
            }

            if (uniqueSongs.length === 0) {
                return { success: false, error: `No songs found for artist: ${artistName}` };
            }

            console.log(`✅ Found ${uniqueSongs.length} songs for artist: ${artistName}`);
            return { success: true, songs: uniqueSongs };

        } catch (error) {
            console.error('Error searching by artist:', error);
            return { success: false, error: error.message };
        }
    }

    // Check if YouTube URL is playable
    async isPlayable(url) {
        try {
            const info = await ytdl.getInfo(url);
            const formats = ytdl.filterFormats(info.formats, 'audioonly');
            return formats.length > 0;
        } catch (error) {
            console.error('Error checking if URL is playable:', error);
            return false;
        }
    }

    // Get audio stream for playing
    getAudioStream(url, options = {}) {
        const defaultOptions = {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 25, // 32MB buffer
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            },
            // Add these options to prevent stream expiration
            begin: 0,
            liveBuffer: 1000,
            highWaterMark: 1024 * 512, // 512KB buffer
            dlChunkSize: 1024 * 1024 // 1MB chunks
        };

        const streamOptions = { ...defaultOptions, ...options };
        
        console.log(`🎵 Creating audio stream with options:`, {
            filter: streamOptions.filter,
            quality: streamOptions.quality,
            bufferSize: streamOptions.highWaterMark
        });

        try {
            // Get fresh video info first to avoid expired URLs
            return ytdl(url, streamOptions);
        } catch (error) {
            console.error('❌ Error creating ytdl stream:', error);
            throw error;
        }
    }

    // Get fresh stream with retry logic
    async getAudioStreamWithRetry(url, options = {}, retries = 3) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                console.log(`🔄 Stream attempt ${attempt}/${retries} for: ${url}`);
                
                // Get fresh video info to avoid expired URLs
                const info = await ytdl.getInfo(url);
                const formats = ytdl.filterFormats(info.formats, 'audioonly');
                
                if (formats.length === 0) {
                    throw new Error('No audio formats available');
                }

                console.log(`📺 Found ${formats.length} audio formats`);
                
                const stream = this.getAudioStream(url, options);
                
                // Add error handling to stream
                stream.on('error', (error) => {
                    console.error(`❌ Stream error on attempt ${attempt}:`, error.message);
                });

                return stream;
                
            } catch (error) {
                console.error(`❌ Attempt ${attempt} failed:`, error.message);
                
                if (attempt === retries) {
                    throw error;
                }
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    }

    // Format duration from milliseconds to MM:SS or HH:MM:SS
    formatDuration(ms) {
        if (!ms || ms === 0) return '0:00';
        
        const seconds = Math.floor(ms / 1000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
    }

    // Validate and get multiple videos from URLs
    async getMultipleVideoInfo(urls) {
        const results = [];
        
        for (const url of urls) {
            if (this.isYouTubeURL(url)) {
                const result = await this.getVideoInfo(url);
                if (result.success) {
                    results.push(result.song);
                }
            }
        }

        return results;
    }
}

module.exports = new YouTubeSearch(); 