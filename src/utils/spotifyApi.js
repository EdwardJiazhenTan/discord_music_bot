const SpotifyWebApi = require('spotify-web-api-node');
const youtubeSearch = require('./youtubeSearch');

class SpotifyAPI {
    constructor() {
        this.spotifyApi = new SpotifyWebApi({
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET
        });
        
        this.tokenExpiresAt = null;
        this.isAuthenticated = false;
    }

    // Authenticate with Spotify using Client Credentials flow
    async authenticate() {
        try {
            console.log('🔐 Authenticating with Spotify...');
            
            const data = await this.spotifyApi.clientCredentialsGrant();
            
            this.spotifyApi.setAccessToken(data.body['access_token']);
            this.tokenExpiresAt = Date.now() + (data.body['expires_in'] * 1000);
            this.isAuthenticated = true;
            
            console.log('✅ Spotify authentication successful');
            return true;
            
        } catch (error) {
            console.error('❌ Spotify authentication failed:', error.message);
            this.isAuthenticated = false;
            return false;
        }
    }

    // Check if token needs refresh
    async ensureAuthenticated() {
        if (!this.isAuthenticated || (this.tokenExpiresAt && Date.now() >= this.tokenExpiresAt - 60000)) {
            return await this.authenticate();
        }
        return true;
    }

    // Extract playlist ID from Spotify URL
    extractPlaylistId(url) {
        const regex = /(?:https?:\/\/)?(?:open\.)?spotify\.com\/playlist\/([a-zA-Z0-9]+)/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    // Check if string is a Spotify playlist URL
    isSpotifyPlaylistURL(str) {
        return /(?:https?:\/\/)?(?:open\.)?spotify\.com\/playlist\/[a-zA-Z0-9]+/.test(str);
    }

    // Get playlist tracks from Spotify
    async getPlaylistTracks(playlistId) {
        try {
            if (!await this.ensureAuthenticated()) {
                return { success: false, error: 'Failed to authenticate with Spotify' };
            }

            console.log(`🎵 Fetching Spotify playlist: ${playlistId}`);

            // Get playlist info
            const playlistInfo = await this.spotifyApi.getPlaylist(playlistId);
            const playlistName = playlistInfo.body.name;
            const totalTracks = playlistInfo.body.tracks.total;

            console.log(`📋 Playlist: "${playlistName}" (${totalTracks} tracks)`);

            // Get all tracks (handle pagination)
            const allTracks = [];
            let offset = 0;
            const limit = 50; // Spotify API limit

            while (offset < totalTracks) {
                const tracksData = await this.spotifyApi.getPlaylistTracks(playlistId, {
                    offset: offset,
                    limit: limit,
                    fields: 'items(track(name,artists,duration_ms,external_urls))'
                });

                const tracks = tracksData.body.items
                    .filter(item => item.track && item.track.name) // Filter out null tracks
                    .map(item => ({
                        title: item.track.name,
                        artists: item.track.artists.map(artist => artist.name),
                        duration: item.track.duration_ms,
                        spotifyUrl: item.track.external_urls?.spotify || null,
                        source: 'spotify'
                    }));

                allTracks.push(...tracks);
                offset += limit;
            }

            console.log(`✅ Retrieved ${allTracks.length} tracks from Spotify playlist`);

            return {
                success: true,
                playlist: {
                    name: playlistName,
                    tracks: allTracks,
                    totalTracks: allTracks.length
                }
            };

        } catch (error) {
            console.error('Error fetching Spotify playlist:', error);
            
            if (error.statusCode === 404) {
                return { success: false, error: 'Playlist not found or is private' };
            } else if (error.statusCode === 401) {
                // Token expired, try to re-authenticate
                this.isAuthenticated = false;
                if (await this.ensureAuthenticated()) {
                    return await this.getPlaylistTracks(playlistId); // Retry once
                }
                return { success: false, error: 'Authentication failed' };
            }
            
            return { success: false, error: error.message };
        }
    }

    // Convert Spotify tracks to YouTube searches
    async convertToYouTubeTracks(spotifyTracks, requestedBy) {
        const youtubeTracks = [];
        const failedTracks = [];

        console.log(`🔄 Converting ${spotifyTracks.length} Spotify tracks to YouTube...`);

        for (let i = 0; i < spotifyTracks.length; i++) {
            const track = spotifyTracks[i];
            const searchQuery = `${track.artists.join(' ')} ${track.title}`;
            
            try {
                console.log(`[${i + 1}/${spotifyTracks.length}] Searching: ${searchQuery}`);
                
                const searchResult = await youtubeSearch.searchByQuery(searchQuery, 1);
                
                if (searchResult.success && searchResult.songs.length > 0) {
                    const youtubeSong = searchResult.songs[0];
                    youtubeTracks.push({
                        ...youtubeSong,
                        requestedBy: requestedBy,
                        originalSpotifyTrack: track
                    });
                } else {
                    failedTracks.push(track);
                    console.log(`❌ No YouTube result for: ${searchQuery}`);
                }
                
                // Add small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`Error searching for ${searchQuery}:`, error);
                failedTracks.push(track);
            }
        }

        console.log(`✅ Successfully converted ${youtubeTracks.length}/${spotifyTracks.length} tracks`);
        
        if (failedTracks.length > 0) {
            console.log(`⚠️ Failed to find YouTube equivalents for ${failedTracks.length} tracks`);
        }

        return {
            success: true,
            tracks: youtubeTracks,
            failedTracks: failedTracks,
            successRate: `${youtubeTracks.length}/${spotifyTracks.length}`
        };
    }

    // Get playlist from URL and convert to YouTube
    async getPlaylistFromURL(url, requestedBy) {
        try {
            const playlistId = this.extractPlaylistId(url);
            
            if (!playlistId) {
                return { success: false, error: 'Invalid Spotify playlist URL' };
            }

            // Get Spotify playlist
            const playlistResult = await this.getPlaylistTracks(playlistId);
            
            if (!playlistResult.success) {
                return playlistResult;
            }

            // Convert to YouTube tracks
            const conversionResult = await this.convertToYouTubeTracks(
                playlistResult.playlist.tracks, 
                requestedBy
            );

            return {
                success: true,
                playlist: {
                    name: playlistResult.playlist.name,
                    originalCount: playlistResult.playlist.totalTracks,
                    convertedCount: conversionResult.tracks.length,
                    tracks: conversionResult.tracks,
                    failedTracks: conversionResult.failedTracks,
                    successRate: conversionResult.successRate
                }
            };

        } catch (error) {
            console.error('Error processing Spotify playlist URL:', error);
            return { success: false, error: error.message };
        }
    }

    // Search for tracks by artist on Spotify
    async searchArtistTracks(artistName, limit = 20) {
        try {
            if (!await this.ensureAuthenticated()) {
                return { success: false, error: 'Failed to authenticate with Spotify' };
            }

            console.log(`🔍 Searching Spotify for artist: ${artistName}`);

            const searchResult = await this.spotifyApi.searchTracks(`artist:${artistName}`, {
                limit: limit,
                market: 'US'
            });

            const tracks = searchResult.body.tracks.items.map(track => ({
                title: track.name,
                artists: track.artists.map(artist => artist.name),
                duration: track.duration_ms,
                spotifyUrl: track.external_urls?.spotify || null,
                popularity: track.popularity || 0,
                source: 'spotify'
            }));

            console.log(`✅ Found ${tracks.length} tracks for artist: ${artistName}`);

            return {
                success: true,
                tracks: tracks
            };

        } catch (error) {
            console.error('Error searching Spotify for artist:', error);
            return { success: false, error: error.message };
        }
    }

    // Format duration from milliseconds
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}

module.exports = new SpotifyAPI(); 