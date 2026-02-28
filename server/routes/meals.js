const express = require('express');
const router = express.Router();
const Meal = require('../models/Meal');
const { authRequired } = require('../middleware/auth');

router.use(authRequired);

router.post('/', async (req, res) => {
    try {
        const { date, mealType, items, notes, photoUrl } = req.body;
        if (!date || !mealType || !items?.length) return res.status(400).json({ success: false, message: 'date, mealType, items required' });
        const totalCalories = items.reduce((s, i) => s + (i.calories || 0) * (i.quantity || 1), 0);
        const totalProtein = items.reduce((s, i) => s + (i.protein || 0) * (i.quantity || 1), 0);
        const totalCarbs = items.reduce((s, i) => s + (i.carbs || 0) * (i.quantity || 1), 0);
        const totalFat = items.reduce((s, i) => s + (i.fat || 0) * (i.quantity || 1), 0);
        const meal = await Meal.create({ userId: req.user.id, date, mealType, items, notes, photoUrl, totalCalories, totalProtein, totalCarbs, totalFat });
        res.status(201).json({ success: true, data: meal });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ success: false, message: 'date query required' });
        const meals = await Meal.find({ userId: req.user.id, date }).sort({ mealType: 1 }).lean();
        res.json({ success: true, data: meals });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/summary', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ success: false, message: 'date query required' });
        const summary = await Meal.aggregate([
            { $match: { userId: req.user.id, date } },
            { $group: { _id: null, totalCalories: { $sum: '$totalCalories' }, totalProtein: { $sum: '$totalProtein' }, totalCarbs: { $sum: '$totalCarbs' }, totalFat: { $sum: '$totalFat' }, mealCount: { $sum: 1 } } }
        ]);
        res.json({ success: true, data: summary[0] || { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0, mealCount: 0 } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', async (req, res) => {
    try {
        const meal = await Meal.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        if (!meal) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, message: 'Deleted' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;