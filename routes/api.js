// routes/api.js - FINAL (Stats Fixed to Short Term + Pro Playlist Logic)
const express = require('express');
const router = express.Router();
const SpotifyWebApi = require('spotify-web-api-node');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Playlist = require('../models/Playlist');

// --- SCOPES ---
const SCOPES = [
    'user-read-private',
    'user-read-email',
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-public',
    'playlist-modify-private',
    'user-top-read'
];

// --- MOOD DICTIONARY (ENGLISH ONLY) ---
const MOOD_DICTIONARY = {
    sad: ['sad', 'bad', 'terrible', 'awful', 'disgusting', 'depress', 'cry', 'lonely', 'broken', 'hurt', 'pain', 'grief', 'down', 'blue', 'unhappy', 'miss', 'sorry', 'tired of', 'hopeless', 'gloomy', 'miserable', 'upset', 'heartbroken'],
    angry: ['angry', 'mad', 'furious', 'rage', 'hate', 'annoyed', 'irritated', 'pissed', 'sucks', 'damn', 'fight', 'scream', 'violent', 'hostile', 'offended', 'bitter'],
    happy: ['happy', 'good', 'great', 'awesome', 'excited', 'joy', 'love', 'wonderful', 'best', 'party', 'dance', 'fun', 'cheerful', 'delighted', 'glad', 'amazing', 'fantastic', 'excellent'],
    chill: ['chill', 'relax', 'calm', 'tired', 'sleep', 'study', 'focus', 'coffee', 'rain', 'peace', 'quiet', 'meditate', 'bored', 'lazy', 'nap', 'reading']
};

// --- HELPER: MOOD ANALYSIS ---
function analyzeMood(text) {
    const lowerText = text.toLowerCase();
    if (MOOD_DICTIONARY.sad.some(word => lowerText.includes(word))) return 'sad';
    if (MOOD_DICTIONARY.angry.some(word => lowerText.includes(word))) return 'angry';
    if (MOOD_DICTIONARY.happy.some(word => lowerText.includes(word))) return 'happy';
    if (MOOD_DICTIONARY.chill.some(word => lowerText.includes(word))) return 'chill';
    return 'neutral';
}

// --- HELPER: GET SPOTIFY CLIENT ---
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

// --- LOGIN & CALLBACK ---
router.get('/login', (req, res) => {
    const spotifyApi = new SpotifyWebApi({
        clientId: process.env.SPOTIPY_CLIENT_ID,
        clientSecret: process.env.SPOTIPY_CLIENT_SECRET,
        redirectUri: process.env.SPOTIPY_REDIRECT_URI
    });
    res.redirect(spotifyApi.createAuthorizeURL(SCOPES));
});

router.get('/', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.redirect('/api/login');
    const spotifyApi = new SpotifyWebApi({
        clientId: process.env.SPOTIPY_CLIENT_ID,
        clientSecret: process.env.SPOTIPY_CLIENT_SECRET,
        redirectUri: process.env.SPOTIPY_REDIRECT_URI
    });
    try {
        const data = await spotifyApi.authorizationCodeGrant(code);
        spotifyApi.setAccessToken(data.body['access_token']);
        const me = await spotifyApi.getMe();
        await User.findOneAndUpdate(
            { 'spotifyData.spotifyUserId': me.body.id },
            {
                username: me.body.display_name,
                email: me.body.email,
                image: me.body.images?.[0]?.url,
                spotifyData: {
                    spotifyUserId: me.body.id,
                    accessToken: data.body['access_token'],
                    refreshToken: data.body['refresh_token'],
                    expiresAt: new Date(Date.now() + 3600 * 1000)
                }
            },
            { upsert: true, new: true }
        );
        res.cookie('spotify_user_id', me.body.id, { maxAge: 3600000, path: '/' });
        res.cookie('access_token', data.body['access_token'], { maxAge: 3600000, path: '/' });
        res.redirect('/');
    } catch (err) { res.status(500).send("Login Error."); }
});

// --- HELPER: AUDIO FEATURES FILTERING ---
async function filterTracksByMood(client, tracks, moodCategory) {
    if (!tracks || tracks.length === 0) return [];
    try {
        const trackIds = tracks.map(t => t.id).slice(0, 50); 
        const data = await client.api.getAudioFeaturesForTracks(trackIds);
        const features = data.body.audio_features;

        const filteredTracks = tracks.filter((track, index) => {
            const f = features[index];
            if (!f) return false;

            // SAD: Düşük Enerji (Sakin) ve Düşük Valence (Hüzünlü)
            if (moodCategory === 'sad') {
                return f.energy <= 0.6 && f.valence <= 0.4;
            }
            // HAPPY / LIFT: Yüksek Valence (Mutlu)
            else if (moodCategory === 'happy' || moodCategory === 'lift') {
                return f.valence >= 0.5;
            }
            // ANGRY: Çok Yüksek Enerji (Agresif)
            else if (moodCategory === 'angry') {
                return f.energy >= 0.7; 
            }
            // CHILL: Düşük Enerji
            else if (moodCategory === 'chill') {
                return f.energy <= 0.5;
            }
            return true; 
        });
        return filteredTracks;
    } catch (e) {
        console.error("Audio Features Error:", e);
        return tracks; 
    }
}

// --- HELPER: CREATE PLAYLIST (ARTIST CATALOG STRATEGY) ---
async function createPlaylistFromSearch(client, moodConfig, feelingText) {
    let myArtists = [];
    
    // 1. ADIM: Kullanıcının Top Artist'lerini çek (Önce kısa vade, yetmezse orta vade)
    try {
        let topData = await client.api.getMyTopArtists({ limit: 10, time_range: 'short_term' });
        if (topData.body.items.length < 3) {
            topData = await client.api.getMyTopArtists({ limit: 10, time_range: 'medium_term' });
        }
        myArtists = topData.body.items.map(a => ({ id: a.id, name: a.name }));
    } catch (e) { console.log("Top Artists çekilemedi."); }

    if (myArtists.length === 0) myArtists = [{id: '1Xyo4u8uXC1ZmMpatF05PJ', name: 'The Weeknd'}, {id: '4gzpq5DPGxSnKTe4SA8HAU', name: 'Coldplay'}]; 

    let poolOfTracks = []; 

    // 2. ADIM: Sanatçıların En Popüler Şarkılarını Çek
    const targetArtists = myArtists.sort(() => 0.5 - Math.random()).slice(0, 5);

    for (let artist of targetArtists) {
        try {
            const topTracksRes = await client.api.getArtistTopTracks(artist.id, 'TR');
            if (topTracksRes.body.tracks) {
                poolOfTracks.push(...topTracksRes.body.tracks);
            }
        } catch (e) {}
    }

    // 3. ADIM: Yedek Arama
    if (poolOfTracks.length < 5) {
        try {
            const searchRes = await client.api.searchTracks(`${moodConfig.keywords[0]} music`, { limit: 20 });
            if (searchRes.body.tracks) poolOfTracks.push(...searchRes.body.tracks.items);
        } catch(e) {}
    }

    // Tekrarları Temizle
    poolOfTracks = poolOfTracks.filter((v,i,a)=>a.findIndex(t=>(t.id===v.id))===i);

    // 4. ADIM: LABORATUVAR ANALİZİ
    let analysisCategory = 'neutral';
    const nameLower = moodConfig.name.toLowerCase();
    
    if (nameLower.includes('sad') || nameLower.includes('vibes')) analysisCategory = 'sad';
    else if (nameLower.includes('booster') || nameLower.includes('happy')) analysisCategory = 'happy'; 
    else if (nameLower.includes('anger') || nameLower.includes('release')) analysisCategory = 'angry';
    else if (nameLower.includes('calm') || nameLower.includes('chill')) analysisCategory = 'chill';

    let finalTracks = await filterTracksByMood(client, poolOfTracks, analysisCategory);

    // Yedek Plan
    if (finalTracks.length < 5) {
        finalTracks = poolOfTracks.sort(() => 0.5 - Math.random()).slice(0, 10);
    } else {
        finalTracks = finalTracks.sort(() => 0.5 - Math.random()).slice(0, 15);
    }

    // 5. ADIM: PLAYLIST OLUŞTUR
    const trackUris = finalTracks.map(t => t.uri);
    if (trackUris.length === 0) return null;

    const me = await client.api.getMe();
    const playlist = await client.api.createPlaylist(me.body.id, { 
        name: `Feelify: ${moodConfig.name}`, description: `Mood: ${feelingText}`, public: true 
    });
    
    await client.api.addTracksToPlaylist(playlist.body.id, trackUris);

    const newPlaylist = new Playlist({
        userId: client.user._id,
        playlistName: `Feelify: ${moodConfig.name}`,
        spotifyPlaylistId: playlist.body.id,
        tracks: finalTracks.map(t => ({ trackName: t.name, artistName: t.artists[0].name, spotifyTrackId: t.id })),
        aiAnalysis: { sourceMood: feelingText, dominantGenres: [moodConfig.name] }
    });
    await newPlaylist.save();

    return {
        name: moodConfig.name,
        url: playlist.body.external_urls.spotify,
        image: playlist.body.images?.[0]?.url || null
    };
}

// --- GENERATE MELODY ROUTE ---
router.post('/generate-melody', async (req, res) => {
    const { feeling_text } = req.body;
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ success: false, error: 'Session closed' });

    try {
        const detectedMood = analyzeMood(feeling_text); 
        let configs = [];

        if (detectedMood === 'sad') {
            configs.push({ name: "Sad Vibes 🌧️", keywords: ["sad"] });
            configs.push({ name: "Mood Booster 🚀", keywords: ["happy"] });
        }
        else if (detectedMood === 'angry') {
            configs.push({ name: "Release Anger 🔥", keywords: ["metal"] });
            configs.push({ name: "Calm Down 🍃", keywords: ["chill"] });
        }
        else if (detectedMood === 'happy') {
            configs.push({ name: "Happy Hits 🎉", keywords: ["pop"] });
        }
        else if (detectedMood === 'chill') {
            configs.push({ name: "Chill Mode ☕", keywords: ["chill"] });
        }
        else {
            configs.push({ name: "Daily Mix 🎵", keywords: ["mix"] });
        }

        const results = [];
        for (let conf of configs) {
            const result = await createPlaylistFromSearch(client, conf, feeling_text);
            if (result) results.push(result);
        }

        if (results.length === 0) return res.status(400).json({ success: false, error: "No tracks found." });
        res.json({ success: true, playlists: results });

    } catch (error) { 
        console.error(error);
        res.status(500).json({ success: false, error: "Error occurred." });
    }
});

// --- LIKE PLAYLIST ROUTE ---
router.post('/like-playlist', async (req, res) => {
    const { mood, playlistName } = req.body;
    const client = await getSpotifyClient(req, res);
    if (!client || !client.user) return res.status(401).json({ success: false });

    try {
        let type = "General Preference";
        const detectedMood = analyzeMood(mood);
        const p = playlistName.toLowerCase();

        if (detectedMood === 'sad') {
            if (p.includes('booster') || p.includes('happy') || p.includes('energy')) type = "Lift";
            else if (p.includes('sad') || p.includes('vibes') || p.includes('melancholy')) type = "Mirror";
        }
        else if (detectedMood === 'angry') {
            if (p.includes('calm') || p.includes('chill') || p.includes('down')) type = "Lift";
            else if (p.includes('anger') || p.includes('release') || p.includes('metal') || p.includes('rock')) type = "Mirror";
        }

        client.user.moodStats.push({ originalMood: mood, chosenPlaylistType: type, playlistName: playlistName });
        await client.user.save();
        
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

// --- STATS ROUTE (GÜNCELLENDİ: short_term) ---
router.get('/stats', async (req, res) => {
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ error: 'Unauthorized' });

    try {
        // İŞTE BURASI DÜZELTİLDİ: Sadece 'short_term' (Son 4 Hafta) verisi çekiliyor.
        const tracks = await client.api.getMyTopTracks({ limit: 10, time_range: 'short_term' });
        const artists = await client.api.getMyTopArtists({ limit: 10, time_range: 'short_term' });

        let moodBreakdown = { 'Sad': {}, 'Angry': {}, 'Total': 0 };

        if (client.user.moodStats && client.user.moodStats.length > 0) {
            client.user.moodStats.forEach(stat => {
                const type = stat.chosenPlaylistType;
                const moodCategory = analyzeMood(stat.originalMood || "");

                if (moodCategory === 'sad') moodBreakdown['Sad'][type] = (moodBreakdown['Sad'][type] || 0) + 1;
                else if (moodCategory === 'angry') moodBreakdown['Angry'][type] = (moodBreakdown['Angry'][type] || 0) + 1;
                moodBreakdown['Total']++;
            });
        }
        res.json({ tracks: tracks.body.items, artists: artists.body.items, moodData: moodBreakdown });
    } catch (e) { res.status(500).json({ error: 'No data' }); }
});

// --- OTHER ROUTES ---
router.get('/me', async (req, res) => { const c=await getSpotifyClient(req,res); if(!c) return res.status(401).json({}); try{const m=await c.api.getMe(); res.json({username:m.body.display_name, image:m.body.images?.[0]?.url, email:m.body.email});}catch(e){res.json({});} });
router.get('/my-playlists', async (req, res) => { const c=await getSpotifyClient(req,res); if(!c) return res.json([]); try{const d=await c.api.getUserPlaylists({limit:50}); res.json(d.body.items);}catch(e){res.json([]);} });
router.post('/send-support', async (req, res) => { 
    const { userEmail, message } = req.body;
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
    try { await transporter.sendMail({ from: userEmail, to: process.env.ADMIN_EMAIL, subject: `Support: ${userEmail}`, text: message }); res.json({ success: true }); } 
    catch (e) { res.status(500).json({ success: false }); }
});

module.exports = router;