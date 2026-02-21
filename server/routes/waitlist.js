const express = require('express');
const router = express.Router();
const Waitlist = require('../models/Waitlist');

// POST /api/waitlist — Add to waitlist
router.post('/', async (req, res) => {
    try {
        const { name, phone, email, city, interests, referredBy, source } = req.body;

        // Check required fields
        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        // Normalize phone
        const normalizedPhone = phone.startsWith('+91') ? phone : `+91${phone}`;

        // Check if already registered
        const existing = await Waitlist.findOne({ phone: normalizedPhone });
        if (existing) {
            return res.json({
                success: true,
                message: 'You\'re already on the waitlist! 🎉',
                referralCode: existing.referralCode,
                position: existing.position,
                alreadyExists: true
            });
        }

        // Create new entry
        const entry = new Waitlist({
            name: name || '',
            phone: normalizedPhone,
            email: email || '',
            city: city || '',
            interests: interests || [],
            referredBy: referredBy || '',
            source: source || 'main_form',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        await entry.save();

        // If referred by someone, increment their referral count
        if (referredBy) {
            await Waitlist.findOneAndUpdate(
                { referralCode: referredBy.toUpperCase() },
                { $inc: { referralCount: 1 } }
            );
        }

        res.status(201).json({
            success: true,
            message: 'Welcome to KheloFit! You\'re on the waitlist! 🚀',
            referralCode: entry.referralCode,
            position: entry.position
        });

    } catch (err) {
        console.error('Waitlist Error:', err.message);

        // Duplicate key error
        if (err.code === 11000) {
            const existing = await Waitlist.findOne({ phone: req.body.phone });
            if (existing) {
                return res.json({
                    success: true,
                    message: 'You\'re already on the waitlist! 🎉',
                    referralCode: existing.referralCode,
                    position: existing.position,
                    alreadyExists: true
                });
            }
        }

        res.status(500).json({
            success: false,
            message: 'Something went wrong. Please try again.'
        });
    }
});

// GET /api/waitlist/count — Get total waitlist count
router.get('/count', async (req, res) => {
    try {
        const count = await Waitlist.countDocuments();
        res.json({ count, success: true });
    } catch {
        res.json({ count: 0, success: false });
    }
});

// GET /api/waitlist/position/:code — Check position by referral code
router.get('/position/:code', async (req, res) => {
    try {
        const entry = await Waitlist.findOne({
            referralCode: req.params.code.toUpperCase()
        }).select('name position referralCount createdAt');

        if (!entry) {
            return res.status(404).json({
                success: false,
                message: 'Referral code not found'
            });
        }

        res.json({
            success: true,
            position: entry.position,
            referralCount: entry.referralCount,
            joinedAt: entry.createdAt
        });
    } catch {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/waitlist/referrals/:code — Referral stats for a user
router.get('/referrals/:code', async (req, res) => {
    try {
        const code = req.params.code.toUpperCase();
        const entry = await Waitlist.findOne({ referralCode: code }).select('name position referralCount createdAt');

        if (!entry) {
            return res.status(404).json({ success: false, message: 'Referral code not found' });
        }

        const totalReferrals = await Waitlist.countDocuments({ referredBy: code });

        res.json({
            success: true,
            referralCode: code,
            referralCount: entry.referralCount,
            totalReferrals,
            position: entry.position,
            joinedAt: entry.createdAt
        });
    } catch {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/waitlist/referrals/top?limit=10 — Leaderboard
router.get('/referrals/top', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
        const leaders = await Waitlist.find({ referralCount: { $gt: 0 } })
            .sort({ referralCount: -1, createdAt: 1 })
            .limit(limit)
            .select('name phone referralCode referralCount position');

        res.json({ success: true, leaders });
    } catch {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
