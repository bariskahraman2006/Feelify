// models/Stats.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Alt şemalar (Sub-schemas) - Veri tekrarını önlemek ve düzenli tutmak
const TopArtistSchema = new Schema({
    spotifyArtistId: { type: String, required: true },
    artistName: { type: String, required: true },
    genres: [String],
    imageUrl: { type: String },
    rank: { type: Number, required: true } // 1. sırada, 2. sırada vb.
}, { _id: false });

const TopTrackSchema = new Schema({
    spotifyTrackId: { type: String, required: true },
    trackName: { type: String, required: true },
    artistName: { type: String, required: true },
    albumName: { type: String },
    imageUrl: { type: String },
    rank: { type: Number, required: true }
}, { _id: false });

// Ana Stats Şeması
const StatsSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true // Sorgu performansını artırmak için index ekledik
    },
    // Bu istatistiğin hangi haftayı temsil ettiğini belirtir
    weekStartDate: {
        type: Date,
        required: true
    },
    // Spotify API'sinde 'time_range' parametresi (short_term, medium_term, long_term)
    // yıllık özet istersek diye bu alanı tutalım.
    timeRange: { 
        type: String, 
        default: 'short_term', // Spotify API karşılığı: Last 4 weeks
        enum: ['short_term', 'medium_term', 'long_term'] 
    },
    topArtists: [TopArtistSchema],
    topTracks: [TopTrackSchema],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Aynı kullanıcı için aynı hafta birden fazla kayıt oluşmasını engellemek istersek diye:
// StatsSchema.index({ userId: 1, weekStartDate: 1 }, { unique: true });

module.exports = mongoose.model('Stats', StatsSchema, 'Stats');