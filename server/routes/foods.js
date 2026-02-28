const express = require('express');
const router = express.Router();
const Food = require('../models/Food');


router.get('/', async (req, res) => {
    try {
        const { limit = 50, category } = req.query;
        const filter = category ? { category } : {};
        const foods = await Food.find(filter).sort({ name: 1 }).limit(Math.min(Number(limit), 200)).lean();
        res.json({ success: true, data: foods, count: foods.length });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/search', async (req, res) => {
    try {
        const { q, limit = 20 } = req.query;
        if (!q || q.length < 2) return res.json({ success: true, data: [] });
        const foods = await Food.find({ $text: { $search: q } }, { score: { $meta: 'textScore' } })
            .sort({ score: { $meta: 'textScore' } }).limit(Math.min(Number(limit), 50)).lean();
        res.json({ success: true, data: foods });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/categories', async (req, res) => {
    try {
        const cats = await Food.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]);
        res.json({ success: true, data: cats });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/category/:cat', async (req, res) => {
    try {
        const foods = await Food.find({ category: req.params.cat }).sort({ name: 1 }).lean();
        res.json({ success: true, data: foods });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', async (req, res) => {
    try {
        const food = await Food.findById(req.params.id).lean();
        if (!food) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, data: food });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;