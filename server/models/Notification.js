const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['match', 'event', 'meal', 'activity', 'referral', 'system', 'coach', 'payment'],
        default: 'system'
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    data: {
        type: Object,
        default: {}
    },
    read: {
        type: Boolean,
        default: false,
        index: true
    },
    readAt: Date
}, {
    timestamps: true
});

notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
