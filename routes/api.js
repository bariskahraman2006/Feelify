// routes/api.js - %100 ÇALIŞAN SPOTIFY MODU
const express = require('express');
const router = express.Router();
const SpotifyWebApi = require('spotify-web-api-node');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Playlist = require('../models/Playlist');

// --- TOKEN YÖNETİMİ ---
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
            const newToken = data.body['access_token'];
            spotifyApi.setAccessToken(newToken);
            user.spotifyData.accessToken = newToken;
            user.spotifyData.expiresAt = new Date(Date.now() + 3600 * 1000);
            await user.save();
        } catch (err) { return null; }
    }
    return { api: spotifyApi, user: user };
}

// --- CALLBACK ---
router.get('/', async (req, res) => {
    const code = req.query.code;
    const spotifyApi = new SpotifyWebApi({
        clientId: process.env.SPOTIPY_CLIENT_ID,
        clientSecret: process.env.SPOTIPY_CLIENT_SECRET,
        redirectUri: process.env.SPOTIPY_REDIRECT_URI
    });

    try {
        const data = await spotifyApi.authorizationCodeGrant(code);
        const accessToken = data.body['access_token'];
        const refreshToken = data.body['refresh_token'];
        spotifyApi.setAccessToken(accessToken);
        const me = await spotifyApi.getMe();

        await User.findOneAndUpdate(
            { 'spotifyData.spotifyUserId': me.body.id },
            {
                username: me.body.display_name,
                email: me.body.email,
                spotifyData: {
                    spotifyUserId: me.body.id,
                    accessToken: accessToken,
                    refreshToken: refreshToken,
                    expiresAt: new Date(Date.now() + 3600 * 1000)
                }
            },
            { upsert: true, new: true }
        );

        res.cookie('spotify_user_id', me.body.id, { maxAge: 3600000 });
        res.cookie('access_token', accessToken, { maxAge: 3600000 });
        res.redirect('/');
    } catch (err) { res.status(500).send(`Hata: ${err.message}`); }
});

// --- KULLANICI BİLGİSİ ---
router.get('/me', async (req, res) => {
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ error: 'Giriş yok' });
    try {
        const me = await client.api.getMe();
        res.json({ username: me.body.display_name, image: me.body.images?.[0]?.url || null, email: me.body.email });
    } catch (e) { res.json({ username: 'User', image: null, email: null }); }
});

// --- PLAYLISTLERİ GETİR (DÜZELTİLEN KISIM) ---
router.get('/my-playlists', async (req, res) => {
    const client = await getSpotifyClient(req, res);
    if (!client) return res.json([]); // Giriş yoksa boş liste dön
    
    try {
        // DB yerine direkt Spotify'dan çekiyoruz (Resimli ve Linkli gelir)
        const data = await client.api.getUserPlaylists({ limit: 50 });
        res.json(data.body.items);
    } catch (e) {
        console.error("Playlist Hatası:", e);
        res.json([]); // Hata olursa boş liste dön, "Connection Failed" dedirtme
    }
});

// --- DESTEK MAİLİ ---
router.post('/send-support', async (req, res) => {
    const { userEmail, message } = req.body;
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
            subject: `Feelify Destek: ${userEmail}`,
            text: `Kullanıcı: ${userEmail}\n\nMesaj:\n${message}`
        });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: "Mail hatası." }); }
});

// --- STATS ---
router.get('/stats', async (req, res) => {
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ error: 'Giriş yok' });
    try {
        const tracks = await client.api.getMyTopTracks({ limit: 10, time_range: 'short_term' });
        const artists = await client.api.getMyTopArtists({ limit: 10, time_range: 'short_term' });
        res.json({ tracks: tracks.body.items, artists: artists.body.items });
    } catch (e) { res.status(500).json({ error: 'Veri yok' }); }
});

// --- MELODİ OLUŞTURMA ---
router.post('/generate-melody', async (req, res) => {
    const { feeling_text } = req.body;
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ success: false, error: 'Oturum kapalı' });

    try {
        const text = feeling_text.toLowerCase();
        let myArtists = [];
        try {
            const topArtists = await client.api.getMyTopArtists({ limit: 10, time_range: 'medium_term' });
            myArtists = topArtists.body.items.map(a => a.name);
        } catch (e) {}
        if (myArtists.length === 0) myArtists = ["The Weeknd", "Coldplay", "Arctic Monkeys"];

        let moodName = "Daily Mix";
        let keywords = ["best"];
        if (text.includes('sad') || text.includes('üzgün')) { moodName = "Sad Vibes"; keywords = ["acoustic", "sad"]; }
        else if (text.includes('happy') || text.includes('mutlu')) { moodName = "Happy Hits"; keywords = ["upbeat", "pop"]; }
        else if (text.includes('rock') || text.includes('metal')) { moodName = "Rock Energy"; keywords = ["rock", "metal"]; }
        else if (text.includes('chill')) { moodName = "Chill Mode"; keywords = ["chill", "lofi"]; }

        let finalTracks = [];
        myArtists.sort(() => 0.5 - Math.random());

        for (let artist of myArtists.slice(0, 5)) {
            const keyword = keywords[Math.floor(Math.random() * keywords.length)];
            try {
                const res = await client.api.searchTracks(`artist:"${artist}" ${keyword}`, { limit: 2 });
                if (res.body.tracks.items.length > 0) finalTracks.push(...res.body.tracks.items);
                else {
                    const fallback = await client.api.searchTracks(`artist:"${artist}"`, { limit: 1 });
                    if (fallback.body.tracks.items.length > 0) finalTracks.push(fallback.body.tracks.items[0]);
                }
            } catch (e) {}
        }

        if(finalTracks.length === 0) {
            const gen = await client.api.searchTracks(text, { limit: 5 });
            if(gen.body.tracks) finalTracks.push(...gen.body.tracks.items);
        }

        const trackUris = [...new Set(finalTracks.map(t => t.uri))];
        if (trackUris.length === 0) return res.status(400).json({ success: false, error: "Şarkı bulunamadı." });

        const me = await client.api.getMe();
        const playlist = await client.api.createPlaylist(me.body.id, { 
            name: `Feelify: ${moodName}`, description: `Mood: ${feeling_text}`, public: true 
        });
        await client.api.addTracksToPlaylist(playlist.body.id, trackUris);

        // Opsiyonel DB Kayıt
        const newPlaylist = new Playlist({
            userId: client.user._id,
            playlistName: `Feelify: ${moodName}`,
            spotifyPlaylistId: playlist.body.id,
            tracks: finalTracks.map(t => ({ trackName: t.name, artistName: t.artists[0].name, spotifyTrackId: t.id })),
            aiAnalysis: { sourceMood: feeling_text, dominantGenres: [moodName] }
        });
        await newPlaylist.save();

        res.json({ success: true, playlist_url: playlist.body.external_urls.spotify, mood: moodName });

    } catch (error) { 
        console.error(error);
        res.status(500).json({ success: false, error: "Hata oluştu." });
    }
});

module.exports = router;