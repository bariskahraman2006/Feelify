// Dosya: models/User.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SpotifyDataSchema = new Schema({
    spotifyUserId: { type: String, required: true, unique: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    expiresAt: { type: Date, required: true }
}, { _id: false });

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
    // DÜZELTME BURADA YAPILDI:
    passwordHash: {
        type: String,
        required: false // <-- ARTIK ZORUNLU DEĞİL (Spotify kullanıcıları için)
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    spotifyData: {
        type: SpotifyDataSchema,
        required: true
    }
});

module.exports = mongoose.model('User', UserSchema, 'Users');