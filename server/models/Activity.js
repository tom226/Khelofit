const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    date: {
        type: String,           // YYYY-MM-DD
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['running', 'walking', 'cycling', 'cricket', 'football', 'badminton',
               'tennis', 'swimming', 'gym', 'yoga', 'kabaddi', 'hockey', 'other'],
        required: true
    },
    durationMinutes: {
        type: Number,
        required: true,
        min: 1
    },
    caloriesBurned: {
        type: Number,
        default: 0
    },
    distanceKm: {
        type: Number,
        default: 0
    },
    // GPS data for running/walking/cycling
    gpsRoute: [{
        lat: Number,
        lng: Number,
        timestamp: Date
    }],
    avgPaceMinPerKm: { type: Number, default: 0 },
    notes: { type: String, default: '' }
}, {
    timestamps: true
});

activitySchema.index({ userId: 1, date: 1 });

module.exports = mongoose.model('Activity', activitySchema);
