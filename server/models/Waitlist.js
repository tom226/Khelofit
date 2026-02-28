const mongoose = require('mongoose');

const waitlistSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true,
        default: ''
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        unique: true,
        trim: true,
        match: [/^\+91[6-9]\d{9}$/, 'Please provide a valid Indian phone number']
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email'],
        default: ''
    },
    city: {
        type: String,
        trim: true,
        default: ''
    },
    interests: {
        type: [String],
        enum: [
            'health',
            'cricket',
            'running',
            'events',
            'matchmaking',
            'yoga',
            'sports',
            'ai-coach',
            'community',
            'all'
        ],
        default: []
    },
    referralCode: {
        type: String,
        unique: true,
        uppercase: true
    },
    referredBy: {
        type: String,
        trim: true,
        default: ''
    },
    referralCount: {
        type: Number,
        default: 0
    },
    position: {
        type: Number
    },
    source: {
        type: String,
        enum: ['hero_form', 'main_form', 'api'],
        default: 'main_form'
    },
    status: {
        type: String,
        enum: ['waiting', 'invited', 'active'],
        default: 'waiting'
    },
    ipAddress: String,
    userAgent: String
}, {
    timestamps: true
});

// Generate referral code and position before save
waitlistSchema.pre('save', async function() {
    if (!this.referralCode) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code;
        let attempts = 0;

        do {
            code = 'KF-';
            for (let i = 0; i < 5; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            attempts++;
        } while (
            await this.constructor.findOne({ referralCode: code }) &&
            attempts < 10
        );

        this.referralCode = code;
    }

    if (!this.position) {
        const count = await this.constructor.countDocuments();
        this.position = count + 1;
    }
});

// Index for fast lookups (avoid duplicates on unique fields already indexed)
waitlistSchema.index({ referredBy: 1 });
waitlistSchema.index({ referralCount: -1 });
waitlistSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Waitlist', waitlistSchema);
