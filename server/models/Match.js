const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    sport: {
        type: String,
        enum: ['cricket', 'football', 'badminton', 'tennis', 'kabaddi',
               'hockey', 'running', 'cycling', 'gym', 'yoga', 'other'],
        required: true
    },
    city: {
        type: String,
        required: true,
        index: true
    },
    location: {
        name: { type: String, default: '' },
        address: { type: String, default: '' },
        lat: Number,
        lng: Number
    },
    dateTime: {
        type: Date,
        required: true,
        index: true
    },
    skillLevel: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced', 'any'],
        default: 'any'
    },
    maxPlayers: {
        type: Number,
        default: 2,
        min: 2
    },
    players: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        joinedAt: { type: Date, default: Date.now }
    }],
    status: {
        type: String,
        enum: ['open', 'full', 'started', 'completed', 'cancelled'],
        default: 'open'
    },
    notes: { type: String, default: '' }
}, {
    timestamps: true
});

matchSchema.index({ city: 1, sport: 1, dateTime: 1, status: 1 });

module.exports = mongoose.model('Match', matchSchema);
