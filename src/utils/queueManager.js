const fs = require('fs').promises;
const path = require('path');

class QueueManager {
    constructor() {
        this.queues = new Map(); // guildId -> queue object
        this.playlistsDir = path.join(__dirname, '..', '..', 'data', 'playlists');
        this.ensurePlaylistsDir();
    }

    async ensurePlaylistsDir() {
        try {
            await fs.mkdir(this.playlistsDir, { recursive: true });
        } catch (error) {
            console.error('Error creating playlists directory:', error);
        }
    }

    // Get or create queue for guild
    getQueue(guildId) {
        if (!this.queues.has(guildId)) {
            this.queues.set(guildId, {
                songs: [],
                currentIndex: 0,
                isPlaying: false,
                isPaused: false,
                loop: false,
                shuffle: false,
                connection: null,
                player: null,
                textChannel: null
            });
        }
        return this.queues.get(guildId);
    }

    // Add song to queue
    addSong(guildId, song) {
        const queue = this.getQueue(guildId);
        queue.songs.push({
            title: song.title,
            url: song.url,
            duration: song.duration,
            thumbnail: song.thumbnail,
            requestedBy: song.requestedBy,
            source: song.source || 'youtube' // 'youtube' or 'spotify'
        });
        return queue.songs.length;
    }

    // Add multiple songs to queue
    addSongs(guildId, songs) {
        const queue = this.getQueue(guildId);
        const startIndex = queue.songs.length;
        
        songs.forEach(song => {
            queue.songs.push({
                title: song.title,
                url: song.url,
                duration: song.duration,
                thumbnail: song.thumbnail,
                requestedBy: song.requestedBy,
                source: song.source || 'youtube'
            });
        });
        
        return { startIndex, endIndex: queue.songs.length - 1, count: songs.length };
    }

    // Get current song
    getCurrentSong(guildId) {
        const queue = this.getQueue(guildId);
        return queue.songs[queue.currentIndex] || null;
    }

    // Skip to next song
    skipSong(guildId) {
        const queue = this.getQueue(guildId);
        
        if (queue.shuffle && queue.songs.length > 1) {
            // Random next song (excluding current)
            const availableIndices = queue.songs
                .map((_, index) => index)
                .filter(index => index !== queue.currentIndex);
            queue.currentIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
        } else {
            queue.currentIndex++;
            
            if (queue.currentIndex >= queue.songs.length) {
                if (queue.loop) {
                    queue.currentIndex = 0;
                } else {
                    return null; // End of queue
                }
            }
        }
        
        return this.getCurrentSong(guildId);
    }

    // Skip to previous song
    previousSong(guildId) {
        const queue = this.getQueue(guildId);
        
        if (queue.shuffle) {
            // Random previous song
            queue.currentIndex = Math.floor(Math.random() * queue.songs.length);
        } else {
            queue.currentIndex--;
            
            if (queue.currentIndex < 0) {
                if (queue.loop) {
                    queue.currentIndex = queue.songs.length - 1;
                } else {
                    queue.currentIndex = 0;
                    return null;
                }
            }
        }
        
        return this.getCurrentSong(guildId);
    }

    // Clear queue
    clearQueue(guildId) {
        const queue = this.getQueue(guildId);
        queue.songs = [];
        queue.currentIndex = 0;
        queue.isPlaying = false;
        queue.isPaused = false;
    }

    // Remove song by index
    removeSong(guildId, index) {
        const queue = this.getQueue(guildId);
        if (index >= 0 && index < queue.songs.length) {
            const removed = queue.songs.splice(index, 1)[0];
            
            // Adjust current index if needed
            if (index < queue.currentIndex) {
                queue.currentIndex--;
            } else if (index === queue.currentIndex && queue.currentIndex >= queue.songs.length) {
                queue.currentIndex = 0;
            }
            
            return removed;
        }
        return null;
    }

    // Toggle shuffle
    toggleShuffle(guildId) {
        const queue = this.getQueue(guildId);
        queue.shuffle = !queue.shuffle;
        return queue.shuffle;
    }

    // Toggle loop
    toggleLoop(guildId) {
        const queue = this.getQueue(guildId);
        queue.loop = !queue.loop;
        return queue.loop;
    }

    // Get queue status
    getQueueStatus(guildId) {
        const queue = this.getQueue(guildId);
        return {
            songsCount: queue.songs.length,
            currentIndex: queue.currentIndex,
            isPlaying: queue.isPlaying,
            isPaused: queue.isPaused,
            loop: queue.loop,
            shuffle: queue.shuffle,
            currentSong: this.getCurrentSong(guildId),
            upNext: queue.songs.slice(queue.currentIndex + 1, queue.currentIndex + 6) // Next 5 songs
        };
    }

    // Save playlist to file
    async savePlaylist(guildId, name, songs = null) {
        try {
            const queue = this.getQueue(guildId);
            const playlistData = {
                name,
                songs: songs || queue.songs,
                createdAt: new Date().toISOString(),
                guildId
            };
            
            const filename = `${guildId}_${name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
            const filepath = path.join(this.playlistsDir, filename);
            
            await fs.writeFile(filepath, JSON.stringify(playlistData, null, 2));
            return { success: true, filename };
        } catch (error) {
            console.error('Error saving playlist:', error);
            return { success: false, error: error.message };
        }
    }

    // Load playlist from file
    async loadPlaylist(guildId, name) {
        try {
            const filename = `${guildId}_${name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
            const filepath = path.join(this.playlistsDir, filename);
            
            const data = await fs.readFile(filepath, 'utf8');
            const playlist = JSON.parse(data);
            
            return { success: true, playlist };
        } catch (error) {
            console.error('Error loading playlist:', error);
            return { success: false, error: error.message };
        }
    }

    // List saved playlists for guild
    async listPlaylists(guildId) {
        try {
            const files = await fs.readdir(this.playlistsDir);
            const guildPlaylists = [];
            
            for (const file of files) {
                if (file.startsWith(`${guildId}_`) && file.endsWith('.json')) {
                    try {
                        const filepath = path.join(this.playlistsDir, file);
                        const data = await fs.readFile(filepath, 'utf8');
                        const playlist = JSON.parse(data);
                        
                        guildPlaylists.push({
                            name: playlist.name,
                            songCount: playlist.songs.length,
                            createdAt: playlist.createdAt,
                            filename: file
                        });
                    } catch (error) {
                        console.error(`Error reading playlist file ${file}:`, error);
                    }
                }
            }
            
            return { success: true, playlists: guildPlaylists };
        } catch (error) {
            console.error('Error listing playlists:', error);
            return { success: false, error: error.message };
        }
    }

    // Delete queue and cleanup
    deleteQueue(guildId) {
        if (this.queues.has(guildId)) {
            const queue = this.queues.get(guildId);
            
            // Cleanup voice connection
            if (queue.connection) {
                queue.connection.destroy();
            }
            
            // Cleanup audio player
            if (queue.player) {
                queue.player.stop();
            }
            
            this.queues.delete(guildId);
        }
    }
}

module.exports = new QueueManager(); 