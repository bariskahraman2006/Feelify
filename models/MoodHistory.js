
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MoodHistorySchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userInput: {
        type: String,
        required: true
    },
    detectedMood: {
        type: String,
        required: true
    },
    confidenceScore: {
        type: Number
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('MoodHistory', MoodHistorySchema, 'MoodHistory');