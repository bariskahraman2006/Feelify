// routes/api.js - GEMINI AI ENTEGRASYONU 🧠
const express = require('express');
const router = express.Router();
const SpotifyWebApi = require('spotify-web-api-node');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Playlist = require('../models/Playlist');

// --- YENİ EKLENDİ: GEMINI AI ---
const { GoogleGenerativeAI } = require('@google/generative-ai');

const SCOPES = [
    'user-read-private', 'user-read-email', 'playlist-read-private',
    'playlist-read-collaborative', 'playlist-modify-public', 'playlist-modify-private',
    'user-top-read', 'user-read-recently-played'
];

const MOOD_DICTIONARY = {
    sad: ['sad', 'bad', 'terrible', 'awful', 'disgusting', 'depress', 'cry', 'lonely', 'broken', 'hurt', 'pain', 'grief', 'down', 'blue', 'unhappy', 'miss', 'sorry', 'tired of', 'hopeless', 'gloomy', 'miserable', 'upset', 'heartbroken'],
    angry: ['angry', 'mad', 'furious', 'rage', 'hate', 'annoyed', 'irritated', 'pissed', 'sucks', 'damn', 'fight', 'scream', 'violent', 'hostile', 'offended', 'bitter'],
    happy: ['happy', 'good', 'great', 'awesome', 'excited', 'joy', 'love', 'wonderful', 'best', 'party', 'dance', 'fun', 'cheerful', 'delighted', 'glad', 'amazing', 'fantastic', 'excellent'],
    chill: ['chill', 'relax', 'calm', 'tired', 'sleep', 'study', 'focus', 'coffee', 'rain', 'peace', 'quiet', 'meditate', 'bored', 'lazy', 'nap', 'reading']
};

function analyzeMood(text) {
    const lowerText = text.toLowerCase();
    if (MOOD_DICTIONARY.sad.some(word => lowerText.includes(word))) return 'sad';
    if (MOOD_DICTIONARY.angry.some(word => lowerText.includes(word))) return 'angry';
    if (MOOD_DICTIONARY.happy.some(word => lowerText.includes(word))) return 'happy';
    if (MOOD_DICTIONARY.chill.some(word => lowerText.includes(word))) return 'chill';
    return 'neutral';
}

async function getSpotifyClient(req, res) {
    if (!req.cookies.spotify_user_id) return null;
    const user = await User.findOne({ 'spotifyData.spotifyUserId': req.cookies.spotify_user_id });
    if (!user) return null;

    const spotifyApi = new SpotifyWebApi({
        clientId: process.env.SPOTIPY_CLIENT_ID,
        clientSecret: process.env.SPOTIPY_CLIENT_SECRET,
        redirectUri: process.env.SPOTIPY_REDIRECT_URI
    });

    spotifyApi.setAccessToken(user.spotifyData.accessToken);
    spotifyApi.setRefreshToken(user.spotifyData.refreshToken);

    if (new Date() > user.spotifyData.expiresAt) {
        try {
            const data = await spotifyApi.refreshAccessToken();
            spotifyApi.setAccessToken(data.body['access_token']);
            user.spotifyData.accessToken = data.body['access_token'];
            user.spotifyData.expiresAt = new Date(Date.now() + 3600 * 1000);
            await user.save();
        } catch (err) { return null; }
    }
    return { api: spotifyApi, user: user };
}

// --- GERÇEK YAPAY ZEKA (GEMINI) ALGORİTMASI ---
async function createPlaylistWithGemini(client, feelingText) {
    // 1. Kullanıcının Müzik Zevkini Çek
    let topArtists = [];
    let userGenres = new Set();
    try {
        const topData = await client.api.getMyTopArtists({ limit: 20, time_range: 'short_term' });
        topArtists = topData.body.items.map(a => a.name);
        topData.body.items.forEach(a => { if (a.genres) a.genres.forEach(g => userGenres.add(g)); });
    } catch(e) { console.log("Top artists fetch failed"); }

    const artistString = topArtists.slice(0, 10).join(', ') || "Popular artists";
    const genreString = Array.from(userGenres).slice(0, 10).join(', ') || "Mixed genres";

    // 2. Gemini'ye Emir Ver (Prompt Engineering)
    // Sadece JSON formatında gerçek şarkı isimleri istiyoruz.
    const prompt = `You are an expert music curator. 
    The user is feeling: "${feelingText}". 
    Their favorite artists are: ${artistString}. 
    Their favorite genres are: ${genreString}. 
    
    Task: Create a playlist of 15 real, existing songs that perfectly match their current feeling and align with their musical taste. 
    
    IMPORTANT RULE: Return ONLY a valid JSON array of objects. Do not include markdown formatting like \`\`\`json. Do not include any extra text.
    Format exactly like this:
    [
      {"artist": "Artist Name", "song": "Song Name"}
    ]`;

    // 3. Gemini ile İletişim Kur
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    let aiSongs = [];

    try {
        const result = await model.generateContent(prompt);
        let text = result.response.text();
        
        // Markdown vb. varsa temizle ve JSON'a çevir
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        aiSongs = JSON.parse(text);
    } catch (e) {
        console.error("Gemini Parse Error:", e);
        return null; // AI saçmalarsa veya hata verirse durdur.
    }

    // 4. Gemini'nin Önerdiği Şarkıları Spotify'da Bul
    let trackUris = [];
    let savedTracksInfo = [];

    for (let item of aiSongs) {
        try {
            // Şarkı adını ve sanatçıyı aynı anda aratarak nokta atışı buluyoruz.
            const searchStr = `track:${item.song} artist:${item.artist}`;
            const searchRes = await client.api.searchTracks(searchStr, { limit: 1 });
            
            if (searchRes.body.tracks && searchRes.body.tracks.items.length > 0) {
                const track = searchRes.body.tracks.items[0];
                trackUris.push(track.uri);
                savedTracksInfo.push({
                    trackName: track.name,
                    artistName: track.artists[0].name,
                    spotifyTrackId: track.id
                });
            }
        } catch (e) {
            console.log(`Failed to find on Spotify: ${item.song}`);
        }
    }

    if (trackUris.length === 0) return null;

    // 5. Çalma Listesini İsmiyle Oluştur
    const me = await client.api.getMe();
    const detectedMood = analyzeMood(feelingText);
    
    let playlistName = "Daily Mix 🎵";
    if (detectedMood === 'sad') playlistName = "Sad Vibes 🌧️";
    else if (detectedMood === 'angry') playlistName = "Release Anger 🔥";
    else if (detectedMood === 'happy') playlistName = "Happy Hits 🎉";
    else if (detectedMood === 'chill') playlistName = "Calm Down 🍃";

    const playlist = await client.api.createPlaylist(me.body.id, { 
        name: `Feelify: ${playlistName}`, 
        description: `Mood: ${feelingText} | Curated precisely by Feelify AI (Gemini)`, 
        public: true 
    });
    
    await client.api.addTracksToPlaylist(playlist.body.id, trackUris);

    // 6. Veritabanına (MongoDB) Kaydet
    const newPlaylist = new Playlist({
        userId: client.user._id,
        playlistName: `Feelify: ${playlistName}`,
        spotifyPlaylistId: playlist.body.id,
        tracks: savedTracksInfo,
        aiAnalysis: { sourceMood: feelingText, dominantGenres: ["AI Generated"] }
    });
    await newPlaylist.save();

    return { name: playlistName, url: playlist.body.external_urls.spotify, image: null };
}

// --- API ROTASI (Güncellendi) ---
router.post('/generate-melody', async (req, res) => {
    const { feeling_text } = req.body;
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ success: false, error: 'Session closed' });

    try {
        const text = feeling_text.toLowerCase();
        
        // Lvbel C5 Easter Egg (Korundu)
        if (text.includes('a-a-a-a') || text.includes('lvbel') || text.includes('c5')) {
            try {
                const lvbelTracks = await client.api.searchTracks('artist:Lvbel C5', { limit: 10 });
                const trackUris = lvbelTracks.body.tracks.items.map(t => t.uri);
                const me = await client.api.getMe();
                const playlist = await client.api.createPlaylist(me.body.id, { name: "Feelify: BABA GELDİ", description: "Lvbel C5 Special", public: true });
                await client.api.addTracksToPlaylist(playlist.body.id, trackUris);
                return res.json({ success: true, playlists: [{ name: "BABA GELDİ", url: playlist.body.external_urls.spotify, image: null }] });
            } catch (e) {}
        }

        // Bütün işi Gemini'ye bırakıyoruz
        const result = await createPlaylistWithGemini(client, feeling_text);
        
        if (!result) return res.status(400).json({ success: false, error: "AI couldn't generate matching tracks." });
        res.json({ success: true, playlists: [result] });

    } catch (error) { 
        console.error(error);
        res.status(500).json({ success: false, error: "Error occurred with AI Engine." }); 
    }
});

// ... (stats, emotion-analysis, mail vb. diğer rotalar aynı kalıyor)

router.get('/stats', async (req, res) => {
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const tracks = await client.api.getMyTopTracks({ limit: 10, time_range: 'short_term' });
        const artists = await client.api.getMyTopArtists({ limit: 10, time_range: 'short_term' });
        res.json({ tracks: tracks.body.items, artists: artists.body.items });
    } catch (e) { res.status(500).json({ error: 'No data' }); }
});

router.get('/emotion-analysis', async (req, res) => {
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
        const recently = await client.api.getMyRecentlyPlayedTracks({ limit: 50 });
        const items = recently.body.items || [];
        const trackList = items.map(it => it.track).filter(Boolean);
        
        if (trackList.length === 0) return res.json({ emotionData: [], genreData: [], message: 'No recent tracks' });
        
        const artistIds = [...new Set(trackList.map(t => t.artists?.[0]?.id).filter(Boolean))];
        let artistGenres = {};
        try {
            for (let i = 0; i < artistIds.length; i += 50) {
                const slice = artistIds.slice(i, i + 50);
                const artistsRes = await client.api.getArtists(slice);
                artistsRes.body.artists.forEach(a => {
                    artistGenres[a.id] = (a.genres && a.genres.length > 0) ? a.genres[0] : null;
                });
            }
        } catch (e) {}

        const genreMap = {};
        trackList.forEach((track) => {
            const primaryArtistId = track.artists?.[0]?.id;
            let genre = artistGenres[primaryArtistId] || 'Pop';
            if (Array.isArray(genre)) genre = genre[0];
            genre = genre.charAt(0).toUpperCase() + genre.slice(1);
            genreMap[genre] = (genreMap[genre] || 0) + 1;
        });

        const genreData = Object.entries(genreMap).map(([genre, count]) => ({
            label: genre, value: count, percentage: ((count / trackList.length) * 100).toFixed(1)
        })).sort((a, b) => b.value - a.value).slice(0, 10);

        res.json({ emotionData: [], genreData, totalTracks: trackList.length });
    } catch (e) {
        if (e && e.statusCode === 403) return res.status(403).json({ error: 'insufficient_scope' });
        res.status(500).json({ error: 'Analysis failed' });
    }
});

router.get('/me', async (req, res) => { const c=await getSpotifyClient(req,res); if(!c) return res.status(401).json({}); try{const m=await c.api.getMe(); res.json({username:m.body.display_name, image:m.body.images?.[0]?.url, email:m.body.email});}catch(e){res.json({});} });
router.get('/my-playlists', async (req, res) => { const c=await getSpotifyClient(req,res); if(!c) return res.json([]); try{const d=await c.api.getUserPlaylists({limit:50}); res.json(d.body.items);}catch(e){res.json([]);} });

router.post('/send-support', async (req, res) => {
    const { userEmail, message } = req.body;
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    const ticketId = Math.floor(1000 + Math.random() * 9000);

    try {
        await transporter.sendMail({
            from: `"${userEmail}" <${process.env.EMAIL_USER}>`, to: process.env.EMAIL_USER, replyTo: userEmail,
            subject: `🚨 [TICKET #${ticketId}] Support Request: ${userEmail}`,
            text: `User: ${userEmail}\nMessage:\n${message}\nTicket ID: ${ticketId}`
        });
        await transporter.sendMail({
            from: `"Feelify Support" <${process.env.EMAIL_USER}>`, to: userEmail,
            subject: `We received your ticket! [#${ticketId}]`,
            html: `<h3>Hello!</h3><p>We received your message: <i>"${message}"</i></p><p>Best regards,<br><b>The Feelify Team 🎧</b></p>`
        });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

module.exports = router;