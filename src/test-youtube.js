#!/usr/bin/env node

const youtubeSearch = require('./utils/youtubeSearch');
const ytdl = require('ytdl-core');

async function testYouTubeStreaming() {
    console.log('🧪 Testing YouTube streaming functionality...\n');
    
    // Test 1: Search functionality
    console.log('📋 Test 1: YouTube Search');
    try {
        const searchResult = await youtubeSearch.searchByQuery('never gonna give you up', 1);
        if (searchResult.success && searchResult.songs.length > 0) {
            console.log('✅ Search successful');
            console.log(`   Found: ${searchResult.songs[0].title}`);
            console.log(`   URL: ${searchResult.songs[0].url}`);
        } else {
            console.log('❌ Search failed');
        }
    } catch (error) {
        console.log('❌ Search error:', error.message);
    }
    
    console.log('\n📋 Test 2: Video Info Extraction');
    const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    try {
        const videoResult = await youtubeSearch.getVideoInfo(testUrl);
        if (videoResult.success) {
            console.log('✅ Video info extraction successful');
            console.log(`   Title: ${videoResult.song.title}`);
            console.log(`   Duration: ${videoResult.song.duration}`);
        } else {
            console.log('❌ Video info extraction failed:', videoResult.error);
        }
    } catch (error) {
        console.log('❌ Video info error:', error.message);
    }
    
    console.log('\n📋 Test 3: Stream Creation (ytdl-core)');
    try {
        // Test if we can get video info without streaming
        const info = await ytdl.getInfo(testUrl);
        console.log('✅ ytdl.getInfo() successful');
        console.log(`   Title: ${info.videoDetails.title}`);
        
        // Test audio formats availability
        const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
        console.log(`✅ Found ${audioFormats.length} audio formats`);
        
        if (audioFormats.length > 0) {
            console.log('   Best format:', {
                quality: audioFormats[0].quality,
                container: audioFormats[0].container,
                codecs: audioFormats[0].codecs
            });
        }
        
    } catch (error) {
        console.log('❌ ytdl-core error:', error.message);
        if (error.message.includes('Could not extract functions')) {
            console.log('   This is the "Could not extract functions" error - YouTube API changed');
        }
    }
    
    console.log('\n📋 Test 4: Alternative Stream Method');
    try {
        // Test our retry mechanism
        const stream = await youtubeSearch.getAudioStreamWithRetry(testUrl, 1);
        console.log('✅ Stream creation successful via retry method');
        
        // Test if stream emits data
        let dataReceived = false;
        const timeout = setTimeout(() => {
            if (!dataReceived) {
                console.log('⚠️ No data received from stream within 5 seconds');
            }
        }, 5000);
        
        stream.once('data', () => {
            dataReceived = true;
            clearTimeout(timeout);
            console.log('✅ Stream is emitting data');
            stream.destroy(); // Clean up
        });
        
        stream.once('error', (error) => {
            clearTimeout(timeout);
            console.log('❌ Stream error:', error.message);
        });
        
    } catch (error) {
        console.log('❌ Stream creation error:', error.message);
    }
    
    console.log('\n🏁 Test completed. Check results above.\n');
}

// Run tests
testYouTubeStreaming().catch(console.error); 