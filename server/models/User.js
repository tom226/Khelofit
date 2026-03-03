const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: false,
        default: undefined,
        trim: true,
        match: [/^\+91[6-9]\d{9}$/, 'Please provide a valid Indian phone number']
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email'],
        default: undefined
    },
    passwordHash: {
        type: String,
        select: false
    },
    authProvider: {
        type: String,
        enum: ['email', 'google', 'otp'],
        default: 'email'
    },
    googlePicture: {
        type: String,
        default: ''
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
    healthProfile: {
        age: { type: Number, default: 0 },
        heightCm: { type: Number, default: 0 },
        weightKg: { type: Number, default: 0 },
        sleepHours: { type: Number, default: 0 }
    },
    integrations: {
        healthApp: {
            connected: { type: Boolean, default: false },
            provider: { type: String, default: '' },
            lastSyncedAt: { type: Date, default: null }
        }
    },
    goals: {
        type: Object,
        default: {}
    }
}, {
    timestamps: true
});

userSchema.index(
    { phone: 1 },
    {
        unique: true,
        partialFilterExpression: { phone: { $type: 'string' } }
    }
);

userSchema.index(
    { email: 1 },
    {
        unique: true,
        partialFilterExpression: { email: { $type: 'string' } }
    }
);

module.exports = mongoose.model('User', userSchema);