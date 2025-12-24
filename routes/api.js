// Dosya: routes/api.js (HATA GÖSTEREN VERSİYON)
const express = require('express');
const router = express.Router();
const SpotifyWebApi = require('spotify-web-api-node');
const User = require('../models/User');
const Playlist = require('../models/Playlist');

// --- YARDIMCI: Token Yönetimi ---
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

    // Token Süresi Dolduysa Yenile
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

// --- CALLBACK (Spotify'dan Dönüş) ---
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

        // Veritabanına Kaydet (feelifyDB'ye yazar)
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

        // Cookie Ayarla
        res.cookie('spotify_user_id', me.body.id, { maxAge: 3600000 });
        res.cookie('access_token', accessToken, { maxAge: 3600000 });
        
        res.redirect('/');

    } catch (err) {
        // --- BURASI GÜNCELLENDİ: Sessizce yönlendirmek yerine hatayı gösteriyoruz ---
        console.error("GİRİŞ HATASI DETAYI:", err);
        console.error("Hata Mesajı:", err.message);
        
        // Tarayıcı ekranına hatayı bas (Böylece ne olduğunu görürsün)
        res.status(500).send(`
            <h1>Giriş Başarısız Oldu!</h1>
            <p><strong>Hata Mesajı:</strong> ${err.message}</p>
            <p>Lütfen terminaldeki logları kontrol edin veya Spotify Developer Dashboard'da e-postanızın ekli olduğundan emin olun.</p>
            <a href="/login">Tekrar Dene</a>
        `);
    }
});

// --- KULLANICI BİLGİLERİ ---
router.get('/me', async (req, res) => {
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ error: 'Giriş yok' });
    try {
        const me = await client.api.getMe();
        res.json({ username: me.body.display_name, image: me.body.images?.[0]?.url || null });
    } catch (e) { res.json({ username: 'User', image: null }); }
});

// --- PLAYLISTLER ---
router.get('/my-playlists', async (req, res) => {
    const client = await getSpotifyClient(req, res);
    if (!client) return res.json([]);
    const lists = await Playlist.find({ userId: client.user._id }).sort({ createdAt: -1 }).limit(20);
    res.json(lists);
});

// --- İSTATİSTİKLER ---
router.get('/stats', async (req, res) => {
    const client = await getSpotifyClient(req, res);
    
    // Oturum kontrolü
    if (!client) return res.status(401).json({ error: 'Giriş yok' });

    try {
        // Hem Top Tracks hem Top Artists çekiyoruz
        const tracks = await client.api.getMyTopTracks({ limit: 10, time_range: 'short_term' });
        const artists = await client.api.getMyTopArtists({ limit: 10, time_range: 'short_term' });
        
        // JSON olarak dönüyoruz
        res.json({ 
            tracks: tracks.body.items, 
            artists: artists.body.items 
        });
        
    } catch (e) { 
        console.error("Stats API Hatası:", e);
        res.status(500).json({ error: 'Veri çekilemedi. Spotify izni eksik olabilir.' }); 
    }
});

// --- MELODİ OLUŞTURMA ---
router.post('/generate-melody', async (req, res) => {
    const { feeling_text } = req.body;
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ success: false, error: 'Oturum kapalı' });

    try {
        const text = feeling_text.toLowerCase();
        
        // 1. ADIM: Sevilen Sanatçıları Bul
        let myArtists = [];
        try {
            const topArtistsData = await client.api.getMyTopArtists({ limit: 10, time_range: 'medium_term' });
            myArtists = topArtistsData.body.items.map(a => a.name);
        } catch (e) { console.log("Sanatçı verisi alınamadı, yedekler kullanılıyor."); }

        if (myArtists.length === 0) myArtists = ["The Weeknd", "Coldplay", "Arctic Monkeys"]; // Yedek

        // 2. ADIM: Mood Kelimelerini Belirle
        let keywords = ["best"];
        let moodName = "Daily Mix";
        
        if (text.includes('sad') || text.includes('üzgün') || text.includes('cry')) {
            keywords = ["acoustic", "slow", "sad", "ballad"];
            moodName = "Sad Vibes";
        } else if (text.includes('happy') || text.includes('mutlu') || text.includes('party')) {
            keywords = ["upbeat", "dance", "party", "remix"];
            moodName = "Happy Hits";
        } else if (text.includes('rock') || text.includes('metal') || text.includes('angry')) {
            keywords = ["rock", "metal", "live", "heavy"];
            moodName = "Rock Energy";
        } else if (text.includes('chill') || text.includes('study') || text.includes('relax')) {
            keywords = ["acoustic", "chill", "instrumental"];
            moodName = "Chill Mode";
        }

        // 3. ADIM: Arama Yap
        let finalTracks = [];
        myArtists.sort(() => 0.5 - Math.random());

        for (let artist of myArtists.slice(0, 5)) {
            const keyword = keywords[Math.floor(Math.random() * keywords.length)];
            const query = `artist:"${artist}" ${keyword}`;
            
            try {
                const searchRes = await client.api.searchTracks(query, { limit: 2 });
                if (searchRes.body.tracks.items.length > 0) {
                    finalTracks.push(...searchRes.body.tracks.items);
                } else {
                    const fallback = await client.api.searchTracks(`artist:"${artist}"`, { limit: 1 });
                    if (fallback.body.tracks.items.length > 0) finalTracks.push(fallback.body.tracks.items[0]);
                }
            } catch (e) { console.log("Arama hatası:", e.message); }
        }

        if (finalTracks.length < 5) {
            const generalRes = await client.api.searchTracks(text, { limit: 10 });
            finalTracks.push(...generalRes.body.tracks.items);
        }

        const trackUris = [...new Set(finalTracks.map(t => t.uri))];

        // 4. ADIM: Playlist Oluştur
        const playlist = await client.api.createPlaylist(`Feelify: ${moodName}`, { 
            description: `Mood: ${feeling_text} | Senin sanatçılarından derlendi.`, public: true 
        });

        await client.api.addTracksToPlaylist(playlist.body.id, trackUris);

        // 5. ADIM: DB Kayıt
        const newPlaylist = new Playlist({
            userId: client.user._id,
            playlistName: `Feelify: ${moodName}`,
            spotifyPlaylistId: playlist.body.id,
            tracks: finalTracks.map(t => ({ 
                trackName: t.name, 
                artistName: t.artists[0].name,
                spotifyTrackId: t.id 
            })),
            aiAnalysis: { sourceMood: feeling_text, dominantGenres: [moodName] }
        });
        await newPlaylist.save();

        res.json({ success: true, playlist_url: playlist.body.external_urls.spotify, mood: moodName, genre: "Personalized Mix" });

    } catch (error) {
        console.error("HATA:", error);
        res.status(500).json({ success: false, error: "Bir hata oluştu." });
    }
});

module.exports = router;