const mongoose = require('mongoose');

const foodSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        index: 'text'
    },
    nameHi: {
        type: String,
        trim: true,
        default: ''
    },
    category: {
        type: String,
        enum: ['grain', 'dal', 'vegetable', 'fruit', 'dairy', 'meat', 'snack',
               'sweet', 'beverage', 'bread', 'rice', 'curry', 'chutney', 'other'],
        default: 'other'
    },
    region: {
        type: String,
        default: ''           // e.g. 'north', 'south', 'bengali', 'gujarati'
    },
    servingSize: {
        type: Number,
        default: 100          // grams
    },
    servingUnit: {
        type: String,
        default: 'g'
    },
    calories: { type: Number, default: 0 },
    protein: { type: Number, default: 0 },
    carbs: { type: Number, default: 0 },
    fat: { type: Number, default: 0 },
    fiber: { type: Number, default: 0 },
    sugar: { type: Number, default: 0 },
    sodium: { type: Number, default: 0 },
    isVeg: { type: Boolean, default: true },
    tags: [String]
}, {
    timestamps: true
});

foodSchema.index({ name: 'text', nameHi: 'text', tags: 'text' });

module.exports = mongoose.model('Food', foodSchema);
