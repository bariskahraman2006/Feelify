const express = require('express');
const router = express.Router();
const SpotifyWebApi = require('spotify-web-api-node');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Playlist = require('../models/Playlist');

// Helper function to get Spotify Client
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

// Spotify Callback Route
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
    } catch (err) { res.status(500).send(`Error: ${err.message}`); }
});

// Profile Info
router.get('/me', async (req, res) => {
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const me = await client.api.getMe();
        res.json({ username: me.body.display_name, image: me.body.images?.[0]?.url || null, email: me.body.email });
    } catch (e) { res.json({ username: 'User', image: null, email: null }); }
});

// User Playlists
router.get('/my-playlists', async (req, res) => {
    const client = await getSpotifyClient(req, res);
    if (!client) return res.json([]); 
    
    try {
        const data = await client.api.getUserPlaylists({ limit: 50 });
        res.json(data.body.items);
    } catch (e) {
        console.error("Playlist Error:", e);
        res.json([]); 
    }
});

// --- UPDATED SUPPORT EMAIL ROUTE (FULLY ENGLISH & TICKET FORMAT) ---
router.post('/send-support', async (req, res) => {
    const { userEmail, message } = req.body;

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'feelify22@gmail.com',
            pass: process.env.EMAIL_PASS
        }
    });

    const ticketId = Math.floor(1000 + Math.random() * 9000);

    // 1. ADMIN NOTIFICATION (Sent to you)
    const adminMailOptions = {
        from: `"${userEmail} (Support Ticket)" <feelify22@gmail.com>`,
        to: 'feelify22@gmail.com',
        replyTo: userEmail,
        subject: `🚨 [TICKET #${ticketId}] New Support Request from: ${userEmail}`,
        text: `You have received a new support ticket!\n\nUser: ${userEmail}\n\nMessage:\n${message}\n\n--- Ticket ID: ${ticketId} ---`
    };

    // 2. USER AUTO-REPLY (Sent to the user)
    const userAutoReplyOptions = {
        from: `"Feelify Support" <feelify22@gmail.com>`,
        to: userEmail,
        subject: `Ticket Received! [#${ticketId}] - Feelify Support`,
        html: `
            <div style="font-family: 'Montserrat', sans-serif; background-color: #0f0f0f; color: white; padding: 20px; border-radius: 10px;">
                <h2 style="color: #1ed760;">Hi there!</h2>
                <p>Thanks for reaching out to <strong>Feelify</strong>. We've received your support ticket (<strong>#${ticketId}</strong>) and our team will get back to you as soon as possible.</p>
                <hr style="border: 0; border-top: 1px solid #333;">
                <p style="font-size: 12px; color: #b3b3b3;">Your message: <br> "<em>${message}</em>"</p>
                <p style="color: #1ed760; font-weight: bold;">Keep vibing!</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(adminMailOptions);
        await transporter.sendMail(userAutoReplyOptions);
        res.json({ success: true });
    } catch (error) {
        console.error("Mail sending error:", error);
        res.status(500).json({ success: false, error: "Mail could not be sent." });
    }
});

// Stats Route
router.get('/stats', async (req, res) => {
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const tracks = await client.api.getMyTopTracks({ limit: 10, time_range: 'short_term' });
        const artists = await client.api.getMyTopArtists({ limit: 10, time_range: 'short_term' });
        res.json({ tracks: tracks.body.items, artists: artists.body.items });
    } catch (e) { res.status(500).json({ error: 'No data' }); }
});

// AI Melody Generation
router.post('/generate-melody', async (req, res) => {
    const { feeling_text } = req.body;
    const client = await getSpotifyClient(req, res);
    if (!client) return res.status(401).json({ success: false, error: 'Session closed' });

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
        if (trackUris.length === 0) return res.status(400).json({ success: false, error: "No tracks found." });

        const me = await client.api.getMe();
        const playlist = await client.api.createPlaylist(me.body.id, { 
            name: `Feelify: ${moodName}`, description: `Mood: ${feeling_text}`, public: true 
        });
        await client.api.addTracksToPlaylist(playlist.body.id, trackUris);

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
        res.status(500).json({ success: false, error: "Error occurred." });
    }
});

module.exports = router;