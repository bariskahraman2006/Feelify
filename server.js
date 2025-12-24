// Dosya: server.js (DÜZELTİLMİŞ VERSİYON)
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const apiRoutes = require('./routes/api');
const app = express();

// --- AYARLAR ---
app.use(express.json());
app.use(cookieParser());

// KRİTİK DÜZELTME BURADA:
// { index: false } diyerek, ana sayfaya gidildiğinde otomatik olarak index.html'i açmasını engelliyoruz.
// Böylece aşağıdaki kontrol mekanizmamız çalışabiliyor.
app.use(express.static(path.join(__dirname, 'public'), { index: false })); 

// --- VERİTABANI ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Bağlantısı Başarılı'))
    .catch(err => console.log('❌ DB Hatası:', err));

// --- ROTALAR ---

// Ana Sayfa Yönlendirmesi (KONTROL MEKANİZMASI)
app.get('/', (req, res) => {
    // Eğer kullanıcı giriş yapmışsa (çerezi varsa) Dashboard'a al
    if (req.cookies.spotify_user_id) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        // Yoksa Giriş Ekranına şutla
        res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
});

// Login Rotası
app.get('/login', (req, res) => {
    const SpotifyWebApi = require('spotify-web-api-node');
    const spotifyApi = new SpotifyWebApi({
        clientId: process.env.SPOTIPY_CLIENT_ID,
        clientSecret: process.env.SPOTIPY_CLIENT_SECRET,
        redirectUri: process.env.SPOTIPY_REDIRECT_URI
    });
// --- BURASI GÜNCELLENDİ: 'user-read-email' EKLENDİ ---
    const scopes = [
        'user-read-email', // <--- EKLENEN KISIM BU
        'user-library-read', 
        'playlist-modify-public', 
        'playlist-read-private', 
        'user-read-private', 
        'user-top-read'
    ];
    
    res.redirect(spotifyApi.createAuthorizeURL(scopes));
});

// API ve Callback Rotaları
app.use('/callback', apiRoutes); 
app.use('/api', apiRoutes);

// Çıkış Yap
app.get('/logout', (req, res) => {
    res.clearCookie('spotify_user_id');
    res.clearCookie('access_token');
    res.redirect('/'); // Ana rotaya at, orası zaten login.html'e yönlendirecek
});

// İstatistik Sayfası
app.get('/stats', (req, res) => {
    if (req.cookies.spotify_user_id) {
        res.sendFile(path.join(__dirname, 'public', 'stats.html'));
    } else {
        res.redirect('/');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Sunucu http://127.0.0.1:${PORT} adresinde çalışıyor.`);
});