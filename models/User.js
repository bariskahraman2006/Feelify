const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Spotify Token Verileri için Alt Şema
const SpotifyDataSchema = new Schema({
    spotifyUserId: { type: String, required: true, unique: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    expiresAt: { type: Date, required: true }
}, { _id: false });

// İstatistikler için Alt Şema (YENİ EKLENDİ)
const MoodStatSchema = new Schema({
    originalMood: String,       // Örn: "I am so sad"
    chosenPlaylistType: String, // "Mirror" (Ayna) veya "Lift" (Yükseltici)
    playlistName: String,       // "Sad Vibes"
    timestamp: { type: Date, default: Date.now } // Ne zaman beğendi?
}, { _id: false });

// Ana Kullanıcı Şeması
const UserSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        match: [/.+@.+\..+/, 'Lütfen geçerli bir email adresi girin']
    },
    image: { 
        type: String // Profil resmi için eklendi (Api.js bunu göndermeye çalışıyordu)
    },
    passwordHash: {
        type: String,
        required: false 
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    spotifyData: {
        type: SpotifyDataSchema,
        required: true
    },
    // --- KRİTİK EKLEME: Kullanıcının beğeni geçmişi ---
    moodStats: [MoodStatSchema] 
});

module.exports = mongoose.model('User', UserSchema, 'Users');