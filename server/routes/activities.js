const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const Activity = require('../models/Activity');

// POST /api/activities — log an activity
router.post('/', authRequired, async (req, res) => {
  try {
    const { type, durationMinutes, caloriesBurned, distanceKm, notes, date, gpsRoute } = req.body;
    const activity = new Activity({
      userId: req.userId,
      type,
      durationMinutes,
      caloriesBurned: caloriesBurned || 0,
      distanceKm: distanceKm || 0,
      notes: notes || '',
      date: date || new Date().toISOString().slice(0, 10),
      gpsRoute: gpsRoute || []
    });
    await activity.save();
    res.status(201).json(activity);
  } catch (err) {
    res.status(500).json({ error: 'Failed to log activity', details: err.message });
  }
});

// GET /api/activities — list activities (paginated, filterable)
router.get('/', authRequired, async (req, res) => {
  try {
    const { page = 1, limit = 20, from, to, type } = req.query;
    const filter = { userId: req.userId };
    if (type) filter.type = type;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (to) filter.date.$lte = to;
    }
    const activities = await Activity.find(filter)
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Activity.countDocuments(filter);
    res.json({ activities, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activities', details: err.message });
  }
});

// GET /api/activities/stats — weekly/monthly stats
router.get('/stats', authRequired, async (req, res) => {
  try {
    const { period = 'week' } = req.query;
    const now = new Date();
    const start = new Date();
    if (period === 'week') start.setDate(now.getDate() - 7);
    else if (period === 'month') start.setMonth(now.getMonth() - 1);
    else start.setDate(now.getDate() - 7);

    const startStr = start.toISOString().slice(0, 10);
    const endStr = now.toISOString().slice(0, 10);

    const activities = await Activity.find({
      userId: req.userId,
      date: { $gte: startStr, $lte: endStr }
    });

    const totalDuration = activities.reduce((sum, a) => sum + (a.durationMinutes || 0), 0);
    const totalCalories = activities.reduce((sum, a) => sum + (a.caloriesBurned || 0), 0);
    const activeDays = new Set(activities.map(a => a.date)).size;

    // Streak
    const allDates = await Activity.distinct('date', { userId: req.userId });
    const daySet = new Set(allDates);
    let streak = 0;
    const d = new Date();
    while (daySet.has(d.toISOString().slice(0, 10))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }

    res.json({ period, totalDuration, totalCalories, activeDays, sessionsCount: activities.length, streak });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats', details: err.message });
  }
});

module.exports = router;
