const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { authRequired } = require('../middleware/auth');

router.use(authRequired);

router.get('/', async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const unreadOnly = String(req.query.unreadOnly || '').toLowerCase() === 'true';
        const filter = { userId: req.userId };
        if (unreadOnly) filter.read = false;

        const rows = await Notification.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        const unreadCount = await Notification.countDocuments({ userId: req.userId, read: false });

        res.json({ success: true, data: rows, unreadCount });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const { type = 'system', title, message, data = {} } = req.body || {};
        if (!title || !message) {
            return res.status(400).json({ success: false, message: 'title and message are required' });
        }

        const item = await Notification.create({
            userId: req.userId,
            type,
            title,
            message,
            data
        });

        res.status(201).json({ success: true, data: item });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/:id/read', async (req, res) => {
    try {
        const row = await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.userId },
            { read: true, readAt: new Date() },
            { returnDocument: 'after' }
        ).lean();

        if (!row) return res.status(404).json({ success: false, message: 'Notification not found' });

        res.json({ success: true, data: row });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/read-all', async (req, res) => {
    try {
        const result = await Notification.updateMany(
            { userId: req.userId, read: false },
            { read: true, readAt: new Date() }
        );

        res.json({ success: true, modified: result.modifiedCount || 0 });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const removed = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.userId });
        if (!removed) return res.status(404).json({ success: false, message: 'Notification not found' });
        res.json({ success: true, message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
