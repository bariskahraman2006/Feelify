
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TrackSchema = new Schema({
    spotifyTrackId: { type: String, required: true },
    trackName: { type: String, required: true },
    artistName: { type: String, required: true },
    albumName: { type: String }
}, { _id: false });

const AiAnalysisSchema = new Schema({
    sourceMood: { type: String },
    averageValence: { type: Number },
    averageEnergy: { type: Number },
    dominantGenres: [String] 
}, { _id: false });

const PlaylistSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    playlistName: {
        type: String,
        required: true
    },
    
    
    spotifyPlaylistId: { 
        type: String, 
        required: true 
    },
    

    createdAt: {
        type: Date,
        default: Date.now
    },
    tracks: [TrackSchema], 
    aiAnalysis: {
        type: AiAnalysisSchema
    }
});

module.exports = mongoose.model('Playlist', PlaylistSchema, 'Playlists');