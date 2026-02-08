const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SpotifyDataSchema = new Schema({
    spotifyUserId: { type: String, required: true, unique: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    expiresAt: { type: Date, required: true }
}, { _id: false });

// --- YENİ: BEĞENİ GEÇMİŞİ İÇİN ŞEMA ---
const MoodStatSchema = new Schema({
    originalMood: String,       // Örn: "I feel sad"
    chosenPlaylistType: String, // "Lift" (Mod Yükseltici) veya "Mirror" (Ayna)
    playlistName: String,       // Örn: "Sad Vibes"
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const UserSchema = new Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    image: { type: String },
    passwordHash: { type: String, required: false },
    createdAt: { type: Date, default: Date.now },
    spotifyData: { type: SpotifyDataSchema, required: true },
    
    // --- BURASI EKLENDİ ---
    moodStats: [MoodStatSchema] 
});

module.exports = mongoose.model('User', UserSchema, 'Users');