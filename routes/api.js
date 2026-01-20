// routes/api.js - ESKİ SAĞLAM YAPI + 2 PLAYLIST ÖZELLİĞİ + GÜNCEL STATS
const express = require('express');
const router = express.Router();
const SpotifyWebApi = require('spotify-web-api-node');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Playlist = require('../models/Playlist');

// --- İZİNLER (Kişisel verileri çekmek için ŞART) ---
const SCOPES = [
    'user-read-private',
    'user-read-email',
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-public',
    'playlist-modify-private',
    'user-top-read' // En çok dinlenenleri çekmek için
];

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
            spotifyApi.setAccessToken(data.body['access_token']);
            user.spotifyData.accessToken = data.body['access_token'];
            user.spotifyData.expiresAt = new Date(Date.now() + 3600 * 1000);
            await user.save();
        } catch (err) { return null; }
    }
    return { api: spotifyApi, user: user };
}

// --- LOGIN (İzinleri Almak İçin) ---
router.get('/login', (req, res) => {
    const spotifyApi = new SpotifyWebApi({
        clientId: process.env.SPOTIPY_CLIENT_ID,
        clientSecret: process.env.SPOTIPY_CLIENT_SECRET,
        redirectUri: process.env.SPOTIPY_REDIRECT_URI
    });
    res.redirect(spotifyApi.createAuthorizeURL(SCOPES));
});

// --- CALLBACK ---
router.get('/', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.redirect('/api/login'); // Kod yoksa logine at

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
    } catch (err) { res.status(500).send(`Error: ${err.message}`); }
});

// --- PROFILE ---
router.get('/me', async (req, res) => {
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const me = await client.api.getMe();
        res.json({ username: me.body.display_name, image: me.body.images?.[0]?.url || null, email: me.body.email });
    } catch (e) { res.json({ username: 'User', image: null, email: null }); }
});

// --- USER PLAYLISTS ---
router.get('/my-playlists', async (req, res) => {
    const client = await getSpotifyClient(req, res);
    if (!client) return res.json([]); 
    try {
        const data = await client.api.getUserPlaylists({ limit: 50 });
        res.json(data.body.items);
    } catch (e) { res.json([]); }
});

// --- YARDIMCI FONKSİYON: ARAMA İLE PLAYLIST OLUŞTURMA ---
// Senin eski kodundaki mantığı buraya taşıdım.
async function createPlaylistFromSearch(client, moodName, keywords, originalText) {
    let myArtists = [];
    try {
        // En çok dinlenenleri al (short_term = Son 4 Hafta)
        const topArtists = await client.api.getMyTopArtists({ limit: 10, time_range: 'short_term' });
        myArtists = topArtists.body.items.map(a => a.name);
    } catch (e) {
        console.log("Artist verisi çekilemedi.");
    }

    // Eğer sanatçı yoksa varsayılanlar
    if (myArtists.length === 0) myArtists = ["The Weeknd", "Coldplay", "Arctic Monkeys", "Duman"];

    let finalTracks = [];
    myArtists.sort(() => 0.5 - Math.random()); // Karıştır

    // 1. Senin sanatçılarını kullanarak arama yap (Kişiselleştirme)
    for (let artist of myArtists.slice(0, 5)) {
        const keyword = keywords[Math.floor(Math.random() * keywords.length)];
        try {
            // Örn: artist:Duman sad
            const res = await client.api.searchTracks(`artist:"${artist}" ${keyword}`, { limit: 2 });
            if (res.body.tracks.items.length > 0) finalTracks.push(...res.body.tracks.items);
            else {
                // Bulamazsa sadece sanatçıyı ara
                const fallback = await client.api.searchTracks(`artist:"${artist}"`, { limit: 1 });
                if (fallback.body.tracks.items.length > 0) finalTracks.push(fallback.body.tracks.items[0]);
            }
        } catch (e) {}
    }

    // 2. Yetmezse genel arama yap (Tamamlayıcı)
    if(finalTracks.length < 5) {
        const gen = await client.api.searchTracks(`${keywords[0]} hits`, { limit: 10 });
        if(gen.body.tracks) finalTracks.push(...gen.body.tracks.items);
    }

    const trackUris = [...new Set(finalTracks.map(t => t.uri))];
    if (trackUris.length === 0) return null;

    // Playlist Oluştur
    const me = await client.api.getMe();
    const playlist = await client.api.createPlaylist(me.body.id, { 
        name: `Feelify: ${moodName}`, description: `Mood: ${originalText}`, public: true 
    });
    
    await client.api.addTracksToPlaylist(playlist.body.id, trackUris);

    // DB Kayıt
    const newPlaylist = new Playlist({
        userId: client.user._id,
        playlistName: `Feelify: ${moodName}`,
        spotifyPlaylistId: playlist.body.id,
        tracks: finalTracks.map(t => ({ trackName: t.name, artistName: t.artists[0].name, spotifyTrackId: t.id })),
        aiAnalysis: { sourceMood: originalText, dominantGenres: [moodName] }
    });
    await newPlaylist.save();

    return {
        name: moodName,
        url: playlist.body.external_urls.spotify,
        image: playlist.body.images?.[0]?.url || null
    };
}

// --- GENERATE MELODY (2 PLAYLIST DESTEKLİ) ---
router.post('/generate-melody', async (req, res) => {
    const { feeling_text } = req.body;
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ success: false, error: 'Session closed' });

    try {
        const text = feeling_text.toLowerCase();
        let configs = [];

        // MANTIK: Kötü hissediyorsa 2 tane, İyi hissediyorsa 1 tane
        if (text.includes('sad') || text.includes('üzgün') || text.includes('bad') || text.includes('cry') || text.includes('depress')) {
            // 1. Ayna (Hüzünlü)
            configs.push({ name: "Sad Vibes 🌧️", keywords: ["acoustic", "sad", "slow", "piano"] });
            // 2. İlaç (Mutlu)
            configs.push({ name: "Mood Booster 🚀", keywords: ["happy", "upbeat", "dance", "energy"] });
        }
        else if (text.includes('angry') || text.includes('kızgın')) {
            configs.push({ name: "Release Anger 🔥", keywords: ["metal", "rock", "hard"] });
            configs.push({ name: "Calm Down 🍃", keywords: ["chill", "ambient", "calm"] });
        }
        else {
            // Pozitif / Normal
            let name = "Daily Mix";
            let keywords = ["best", "hits"];
            
            if (text.includes('happy') || text.includes('mutlu')) { name = "Happy Hits"; keywords = ["pop", "summer", "party"]; }
            else if (text.includes('chill')) { name = "Chill Mode"; keywords = ["lofi", "jazz", "chill"]; }
            
            configs.push({ name: name, keywords: keywords });
        }

        const results = [];
        for (let conf of configs) {
            // Helper fonksiyonu çağır
            const result = await createPlaylistFromSearch(client, conf.name, conf.keywords, feeling_text);
            if (result) results.push(result);
        }

        if (results.length === 0) return res.status(400).json({ success: false, error: "No tracks found." });

        // Frontend'e array (dizi) dönüyoruz
        res.json({ success: true, playlists: results });

    } catch (error) { 
        console.error(error);
        res.status(500).json({ success: false, error: "Error occurred." });
    }
});

// --- STATS (GÜNCEL: short_term) ---
router.get('/stats', async (req, res) => {
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ error: 'Unauthorized' });
    try {
        // short_term = Son 4 Hafta
        const tracks = await client.api.getMyTopTracks({ limit: 10, time_range: 'short_term' });
        const artists = await client.api.getMyTopArtists({ limit: 10, time_range: 'short_term' });
        res.json({ tracks: tracks.body.items, artists: artists.body.items });
    } catch (e) { res.status(500).json({ error: 'No data' }); }
});

// --- SUPPORT MAIL ---
router.post('/send-support', async (req, res) => {
    const { userEmail, message } = req.body;
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: 'feelify22@gmail.com', pass: process.env.EMAIL_PASS }
    });
    const ticketId = Math.floor(1000 + Math.random() * 9000);

    try {
        await transporter.sendMail({
            from: `"${userEmail}" <feelify22@gmail.com>`, to: 'feelify22@gmail.com', replyTo: userEmail,
            subject: `🚨 [TICKET #${ticketId}] Support: ${userEmail}`,
            text: `User: ${userEmail}\nMessage:\n${message}\nTicket ID: ${ticketId}`
        });
        await transporter.sendMail({
            from: `"Feelify Support" <feelify22@gmail.com>`, to: userEmail,
            subject: `Ticket Received! [#${ticketId}]`,
            html: `<h3>Hi!</h3><p>We received your ticket #${ticketId}.</p><p>Message: ${message}</p>`
        });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

module.exports = router;