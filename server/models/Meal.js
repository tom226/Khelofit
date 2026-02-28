const mongoose = require('mongoose');

const mealSchema = new mongoose.Schema({
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
    mealType: {
        type: String,
        enum: ['breakfast', 'lunch', 'dinner', 'snack'],
        required: true
    },
    items: [{
        name: { type: String, required: true },
        quantity: { type: Number, default: 1 },
        unit: { type: String, default: 'serving' },
        calories: { type: Number, default: 0 },
        protein: { type: Number, default: 0 },
        carbs: { type: Number, default: 0 },
        fat: { type: Number, default: 0 },
        fiber: { type: Number, default: 0 },
        foodDbId: { type: mongoose.Schema.Types.ObjectId, ref: 'Food' }
    }],
    totalCalories: { type: Number, default: 0 },
    totalProtein: { type: Number, default: 0 },
    totalCarbs: { type: Number, default: 0 },
    totalFat: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    photoUrl: { type: String, default: '' }
}, {
    timestamps: true
});

mealSchema.index({ userId: 1, date: 1 });

module.exports = mongoose.model('Meal', mealSchema);
