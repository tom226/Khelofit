const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authRequired } = require('../middleware/auth');

// GET /api/users/profile — Get my profile
router.get('/profile', authRequired, async (req, res) => {
    try {
        const user = await User.findById(req.userId).lean();
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.json({ success: true, user });
    } catch (err) {
        console.error('Get Profile Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/users/profile — Update my profile
router.put('/profile', authRequired, async (req, res) => {
    try {
        const allowed = ['name', 'language', 'city', 'sportsPrefs', 'goals'];
        const updates = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                updates[key] = req.body[key];
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, message: 'No valid fields to update' });
        }

        const user = await User.findByIdAndUpdate(
            req.userId,
            { $set: updates },
            { new: true, runValidators: true }
        ).lean();

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, user });
    } catch (err) {
        console.error('Update Profile Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
