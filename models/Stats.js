
const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const TopArtistSchema = new Schema({
    spotifyArtistId: { type: String, required: true },
    artistName: { type: String, required: true },
    genres: [String],
    imageUrl: { type: String },
    rank: { type: Number, required: true }
}, { _id: false });

const TopTrackSchema = new Schema({
    spotifyTrackId: { type: String, required: true },
    trackName: { type: String, required: true },
    artistName: { type: String, required: true },
    albumName: { type: String },
    imageUrl: { type: String },
    rank: { type: Number, required: true }
}, { _id: false });


const StatsSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
   
    weekStartDate: {
        type: Date,
        required: true
    },
    
    timeRange: { 
        type: String, 
        default: 'short_term', 
        enum: ['short_term', 'medium_term', 'long_term'] 
    },
    topArtists: [TopArtistSchema],
    topTracks: [TopTrackSchema],
    createdAt: {
        type: Date,
        default: Date.now
    }
});


module.exports = mongoose.model('Stats', StatsSchema, 'Stats');