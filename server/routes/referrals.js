const express = require('express');
const router = express.Router();
const Referral = require('../models/Referral');
const User = require('../models/User');
const { authRequired } = require('../middleware/auth');
const { safeNotify } = require('../utils/notifications');

function generateReferralCode(name, userId) {
  const prefix = (name || 'KF').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4) || 'KF';
  const suffix = String(userId).slice(-4).toUpperCase();
  return `${prefix}${suffix}`;
}

router.use(authRequired);

router.get('/me', async (req, res) => {
  try {
    let referral = await Referral.findOne({ userId: req.userId }).lean();

    if (!referral) {
      const user = await User.findById(req.userId).lean();
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const code = generateReferralCode(user.name, user._id);
      referral = await Referral.create({
        userId: req.userId,
        code,
        referredUsers: [],
        totalReferrals: 0,
        pointsEarned: 0,
      });
      referral = referral.toObject();
    }

    res.json({ success: true, data: referral });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/apply', async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ success: false, message: 'code is required' });

    const ref = await Referral.findOne({ code: String(code).toUpperCase() });
    if (!ref) return res.status(404).json({ success: false, message: 'Invalid referral code' });

    if (String(ref.userId) === String(req.userId)) {
      return res.status(400).json({ success: false, message: 'Cannot apply your own referral code' });
    }

    if (ref.referredUsers.some((u) => String(u.userId) === String(req.userId))) {
      return res.json({ success: true, message: 'Referral already applied' });
    }

    ref.referredUsers.push({ userId: req.userId });
    ref.totalReferrals = ref.referredUsers.length;
    ref.pointsEarned = ref.totalReferrals * 50;
    await ref.save();

    await safeNotify({
      userId: req.userId,
      type: 'referral',
      title: 'Referral applied',
      message: `Referral code ${ref.code} applied successfully.`,
      data: { code: ref.code }
    });

    res.json({ success: true, data: { code: ref.code, totalReferrals: ref.totalReferrals, pointsEarned: ref.pointsEarned } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const leaders = await Referral.find({ totalReferrals: { $gt: 0 } })
      .sort({ totalReferrals: -1, pointsEarned: -1 })
      .limit(limit)
      .populate('userId', 'name city')
      .lean();

    res.json({ success: true, data: leaders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
