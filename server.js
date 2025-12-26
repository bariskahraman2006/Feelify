
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const apiRoutes = require('./routes/api');
const app = express();

app.use(express.json());
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public'), { index: false })); 


mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Successfully Connected To The MongoDB '))
    .catch(err => console.log('❌ DataBase Error:', err));




app.get('/', (req, res) => {
    
    if (req.cookies.spotify_user_id) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
       
        res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
});

app.get('/login', (req, res) => {
    const SpotifyWebApi = require('spotify-web-api-node');
    const spotifyApi = new SpotifyWebApi({
        clientId: process.env.SPOTIPY_CLIENT_ID,
        clientSecret: process.env.SPOTIPY_CLIENT_SECRET,
        redirectUri: process.env.SPOTIPY_REDIRECT_URI
    });
    const scopes = [
        'user-read-email', 
        'user-library-read', 
        'playlist-modify-public', 
        'playlist-read-private', 
        'user-read-private', 
        'user-top-read'
    ];
    
    res.redirect(spotifyApi.createAuthorizeURL(scopes));
});

app.use('/callback', apiRoutes); 
app.use('/api', apiRoutes);

app.get('/logout', (req, res) => {
    res.clearCookie('spotify_user_id');
    res.clearCookie('access_token');
    res.redirect('/'); 
});

app.get('/stats', (req, res) => {
    if (req.cookies.spotify_user_id) {
        res.sendFile(path.join(__dirname, 'public', 'stats.html'));
    } else {
        res.redirect('/');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://127.0.0.1:${PORT} adress.`);
});