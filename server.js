// server.js - FIXED LOGIN & CALLBACK
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

// Modeller ve Kütüphaneler
const User = require('./models/User');
const SpotifyWebApi = require('spotify-web-api-node');
const apiRoutes = require('./routes/api');

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { index: false })); 

// MongoDB Bağlantısı
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Successfully Connected To The MongoDB '))
    .catch(err => console.log('❌ DataBase Error:', err));

// --- ANA SAYFA YÖNLENDİRMESİ ---
app.get('/', (req, res) => {
    if (req.cookies.spotify_user_id) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
});

// --- LOGIN (Spotify'a Yönlendir) ---
app.get('/login', (req, res) => {
    const spotifyApi = new SpotifyWebApi({
        clientId: process.env.SPOTIPY_CLIENT_ID,
        clientSecret: process.env.SPOTIPY_CLIENT_SECRET,
        redirectUri: process.env.SPOTIPY_REDIRECT_URI
    });
    
    // GEREKLİ TÜM İZİNLER
    const scopes = [
        'user-read-email', 
        'user-library-read', 
        'playlist-modify-public', 
        'playlist-read-private', 
        'user-read-private', 
        'user-top-read',
        'user-read-recently-played', // Emotion Chart için şart
        'playlist-read-collaborative'
    ];
    
    res.redirect(spotifyApi.createAuthorizeURL(scopes));
});

// --- CALLBACK (Spotify'dan Dönüş - BURASI DÜZELTİLDİ) ---
app.get('/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.redirect('/login');

    const spotifyApi = new SpotifyWebApi({
        clientId: process.env.SPOTIPY_CLIENT_ID,
        clientSecret: process.env.SPOTIPY_CLIENT_SECRET,
        redirectUri: process.env.SPOTIPY_REDIRECT_URI
    });

    try {
        const data = await spotifyApi.authorizationCodeGrant(code);
        spotifyApi.setAccessToken(data.body['access_token']);
        const me = await spotifyApi.getMe();

        // Kullanıcıyı Bul veya Oluştur
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

        // Çerezleri Ayarla ve Ana Sayfaya At
        res.cookie('spotify_user_id', me.body.id, { maxAge: 3600000, path: '/' });
        res.cookie('access_token', data.body['access_token'], { maxAge: 3600000, path: '/' });
        res.redirect('/');

    } catch (err) {
        console.error("Callback Error:", err);
        res.redirect('/login');
    }
});

// --- LOGOUT ---
app.get('/logout', (req, res) => {
    res.clearCookie('spotify_user_id');
    res.clearCookie('access_token');
    res.redirect('/'); 
});

// --- SAYFA YÖNLENDİRMELERİ ---
app.get('/stats', (req, res) => {
    if (req.cookies.spotify_user_id) res.sendFile(path.join(__dirname, 'public', 'stats.html'));
    else res.redirect('/');
});

app.get('/emotion-chart', (req, res) => {
    if (req.cookies.spotify_user_id) res.sendFile(path.join(__dirname, 'public', 'emotion-chart.html'));
    else res.redirect('/');
});

// --- API ROTASINI BAĞLA ---
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://127.0.0.1:${PORT} adress.`);
});