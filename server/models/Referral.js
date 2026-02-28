const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true
    },
    referredUsers: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        joinedAt: { type: Date, default: Date.now }
    }],
    totalReferrals: {
        type: Number,
        default: 0
    },
    pointsEarned: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Referral', referralSchema);
