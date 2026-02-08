// routes/api.js - FINAL (Mail Fix + Audio Analysis + Stats + Like)
const express = require('express');
const router = express.Router();
const SpotifyWebApi = require('spotify-web-api-node');
const nodemailer = require('nodemailer'); // Mail kütüphanesi
const User = require('../models/User');
const Playlist = require('../models/Playlist');

// --- İZİNLER ---
const SCOPES = [
    'user-read-private', 'user-read-email', 'playlist-read-private',
    'playlist-read-collaborative', 'playlist-modify-public', 'playlist-modify-private',
    'user-top-read', 'user-read-recently-played'
];

// --- MOOD SÖZLÜĞÜ ---
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

// --- AUDIO FEATURES FILTER ---
async function filterTracksByMood(client, tracks, moodCategory) {
    if (!tracks || tracks.length === 0) return [];
    try {
        const uniqueTracks = tracks.filter((v,i,a)=>a.findIndex(t=>(t.id===v.id))===i).slice(0, 50);
        const trackIds = uniqueTracks.map(t => t.id);
        const data = await client.api.getAudioFeaturesForTracks(trackIds);
        const features = data.body.audio_features;

        const filteredTracks = uniqueTracks.filter((track, index) => {
            const f = features[index];
            if (!f) return false;
            if (moodCategory === 'sad') return f.valence <= 0.4 && f.energy <= 0.65;
            else if (moodCategory === 'happy' || moodCategory === 'lift') return f.valence >= 0.5 && f.energy >= 0.55;
            else if (moodCategory === 'angry') return f.energy >= 0.75;
            else if (moodCategory === 'chill') return f.energy <= 0.5;
            return true;
        });
        return filteredTracks;
    } catch (e) { return tracks; }
}

// --- PLAYLIST CREATOR ---
async function createPlaylistFromSearch(client, moodConfig, feelingText) {
    let myArtists = [];
    try {
        let topData = await client.api.getMyTopArtists({ limit: 10, time_range: 'short_term' });
        if (topData.body.items.length < 3) topData = await client.api.getMyTopArtists({ limit: 10, time_range: 'medium_term' });
        myArtists = topData.body.items.map(a => ({ id: a.id, name: a.name }));
    } catch (e) {}

    if (myArtists.length === 0) myArtists = [{id: '1Xyo4u8uXC1ZmMpatF05PJ', name: 'The Weeknd'}]; 

    let poolOfTracks = []; 
    const targetArtists = myArtists.sort(() => 0.5 - Math.random()).slice(0, 5);
    for (let artist of targetArtists) {
        try {
            const topTracksRes = await client.api.getArtistTopTracks(artist.id, 'TR');
            if (topTracksRes.body.tracks) poolOfTracks.push(...topTracksRes.body.tracks);
        } catch (e) {}
    }

    if (poolOfTracks.length < 5) {
        try {
            const searchRes = await client.api.searchTracks(`${moodConfig.keywords[0]} music`, { limit: 20 });
            if (searchRes.body.tracks) poolOfTracks.push(...searchRes.body.tracks.items);
        } catch(e) {}
    }

    let analysisCategory = 'neutral';
    const nameLower = moodConfig.name.toLowerCase();
    if (nameLower.includes('sad') || nameLower.includes('vibes')) analysisCategory = 'sad';
    else if (nameLower.includes('booster') || nameLower.includes('happy')) analysisCategory = 'happy'; 
    else if (nameLower.includes('anger') || nameLower.includes('release')) analysisCategory = 'angry';
    else if (nameLower.includes('calm') || nameLower.includes('chill')) analysisCategory = 'chill';

    let finalTracks = await filterTracksByMood(client, poolOfTracks, analysisCategory);

    if (finalTracks.length < 5) finalTracks = poolOfTracks.sort(() => 0.5 - Math.random()).slice(0, 10);
    else finalTracks = finalTracks.sort(() => 0.5 - Math.random()).slice(0, 15);

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

    return { name: moodConfig.name, url: playlist.body.external_urls.spotify, image: playlist.body.images?.[0]?.url || null };
}

router.post('/generate-melody', async (req, res) => {
    const { feeling_text } = req.body;
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ success: false, error: 'Session closed' });

    try {
        const text = feeling_text.toLowerCase();
        
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

        const detectedMood = analyzeMood(feeling_text); 
        let configs = [];

        if (detectedMood === 'sad') {
            configs.push({ name: "Sad Vibes 🌧️", keywords: ["sad"] });
            configs.push({ name: "Mood Booster 🚀", keywords: ["happy"] });
        } else if (detectedMood === 'angry') {
            configs.push({ name: "Release Anger 🔥", keywords: ["metal"] });
            configs.push({ name: "Calm Down 🍃", keywords: ["chill"] });
        } else if (detectedMood === 'happy') {
            configs.push({ name: "Happy Hits 🎉", keywords: ["pop"] });
        } else if (detectedMood === 'chill') {
            configs.push({ name: "Chill Mode ☕", keywords: ["chill"] });
        } else {
            configs.push({ name: "Daily Mix 🎵", keywords: ["mix"] });
        }

        const results = [];
        for (let conf of configs) {
            const result = await createPlaylistFromSearch(client, conf, feeling_text);
            if (result) results.push(result);
        }

        if (results.length === 0) return res.status(400).json({ success: false, error: "No tracks found." });
        res.json({ success: true, playlists: results });
    } catch (error) { res.status(500).json({ success: false, error: "Error occurred." }); }
});

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
        } else if (detectedMood === 'angry') {
            if (p.includes('calm') || p.includes('chill') || p.includes('down')) type = "Lift";
            else if (p.includes('anger') || p.includes('release') || p.includes('metal') || p.includes('rock')) type = "Mirror";
        }

        client.user.moodStats.push({ originalMood: mood, chosenPlaylistType: type, playlistName: playlistName });
        await client.user.save();
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

router.get('/stats', async (req, res) => {
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ error: 'Unauthorized' });

    try {
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

router.get('/emotion-analysis', async (req, res) => {
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
        const recently = await client.api.getMyRecentlyPlayedTracks({ limit: 50 });
        const items = recently.body.items || [];
        const trackList = items.map(it => it.track).filter(Boolean);
        
        if (trackList.length === 0) return res.json({ genreData: [], message: 'No recent tracks' });
        
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

        res.json({ genreData, totalTracks: trackList.length });
    } catch (e) {
        if (e.statusCode === 403) return res.status(403).json({ error: 'insufficient_scope' });
        res.status(500).json({ error: 'Analysis failed' });
    }
});

router.get('/me', async (req, res) => { const c=await getSpotifyClient(req,res); if(!c) return res.status(401).json({}); try{const m=await c.api.getMe(); res.json({username:m.body.display_name, image:m.body.images?.[0]?.url, email:m.body.email});}catch(e){res.json({});} });
router.get('/my-playlists', async (req, res) => { const c=await getSpotifyClient(req,res); if(!c) return res.json([]); try{const d=await c.api.getUserPlaylists({limit:50}); res.json(d.body.items);}catch(e){res.json([]);} });

// --- MAIL ROUTE (DÜZELTİLDİ) ---
router.post('/send-support', async (req, res) => {
    const { userEmail, message } = req.body;

    // 1. Transporter Ayarı (Env'den çekmeli)
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER, // feelify22@gmail.com
            pass: process.env.EMAIL_PASS  // ALDIĞIN 16 HANELİ ŞİFRE
        }
    });

    const ticketId = Math.floor(1000 + Math.random() * 9000);

    try {
        // A) ADMİNE MAIL AT
        await transporter.sendMail({
            from: `"Feelify App" <${process.env.EMAIL_USER}>`, 
            to: process.env.EMAIL_USER, // Kendine gönder
            replyTo: userEmail,         // Cevapla deyince kullanıcıya gitsin
            subject: `🚨 [TICKET #${ticketId}] Support Request: ${userEmail}`,
            text: `User: ${userEmail}\nMessage:\n${message}\nTicket ID: ${ticketId}`
        });

        // B) KULLANICIYA OTOMATİK CEVAP AT
        await transporter.sendMail({
            from: `"Feelify Support" <${process.env.EMAIL_USER}>`, 
            to: userEmail,
            subject: `We received your ticket! [#${ticketId}]`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #1DB954;">Hello!</h2>
                    <p>Thanks for reaching out to Feelify Support.</p>
                    <p>We received your message: <i>"${message}"</i></p>
                    <p>Our team will get back to you shortly.</p>
                    <br>
                    <p>Best regards,<br><b>The Feelify Team 🎧</b></p>
                </div>
            `
        });

        console.log(`Support mail sent for ticket #${ticketId}`);
        res.json({ success: true });

    } catch (error) { 
        console.error("Mail Error:", error);
        res.status(500).json({ success: false, error: error.message }); 
    }
});

module.exports = router;