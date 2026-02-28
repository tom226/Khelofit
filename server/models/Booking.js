const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    eventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true,
        index: true
    },
    ticketId: {
        type: String,
        unique: true
    },
    status: {
        type: String,
        enum: ['confirmed', 'cancelled', 'pending'],
        default: 'confirmed'
    },
    amount: {
        type: Number,
        default: 0
    },
    paymentId: { type: String, default: '' },     // Razorpay payment ID
    paymentStatus: {
        type: String,
        enum: ['paid', 'free', 'refunded', 'pending'],
        default: 'free'
    }
}, {
    timestamps: true
});

// Generate ticket ID before saving
bookingSchema.pre('save', function (next) {
    if (!this.ticketId) {
        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
        this.ticketId = `KF-${datePart}-${rand}`;
    }
    next();
});

bookingSchema.index({ userId: 1, eventId: 1 }, { unique: true });

module.exports = mongoose.model('Booking', bookingSchema);
