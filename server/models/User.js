const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: false,
        unique: true,
        sparse: true,
        trim: true,
        match: [/^\+91[6-9]\d{9}$/, 'Please provide a valid Indian phone number']
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email'],
        unique: true,
        sparse: true,
        default: ''
    },
    passwordHash: {
        type: String,
        select: false
    },
    name: {
        type: String,
        trim: true,
        default: ''
    },
    language: {
        type: String,
        trim: true,
        default: 'en'
    },
    city: {
        type: String,
        trim: true,
        default: ''
    },
    sportsPrefs: {
        type: [String],
        default: []
    },
    goals: {
        type: Object,
        default: {}
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);