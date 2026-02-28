const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    category: {
        type: String,
        enum: ['marathon', 'cricket', 'football', 'yoga', 'workshop', 'camp', 'tournament', 'other'],
        required: true
    },
    city: {
        type: String,
        required: true,
        index: true
    },
    venue: {
        name: { type: String, default: '' },
        address: { type: String, default: '' },
        lat: Number,
        lng: Number
    },
    date: {
        type: Date,
        required: true,
        index: true
    },
    endDate: Date,
    maxParticipants: {
        type: Number,
        default: 0        // 0 = unlimited
    },
    registeredCount: {
        type: Number,
        default: 0
    },
    price: {
        type: Number,
        default: 0         // 0 = free
    },
    currency: {
        type: String,
        default: 'INR'
    },
    imageUrl: { type: String, default: '' },
    organizer: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    status: {
        type: String,
        enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
        default: 'upcoming'
    },
    tags: [String]
}, {
    timestamps: true
});

eventSchema.index({ city: 1, date: 1, category: 1 });

module.exports = mongoose.model('Event', eventSchema);
