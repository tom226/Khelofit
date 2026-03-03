const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const Meal = require('../models/Meal');
const Activity = require('../models/Activity');
const Referral = require('../models/Referral');
const Match = require('../models/Match');
const Event = require('../models/Event');

router.use(authRequired);

function computeHealthScore({ mealSummary, activityStats }) {
    const calories = Number(mealSummary?.totalCalories || 0);
    const protein = Number(mealSummary?.totalProtein || 0);
    const sessions = Number(activityStats?.sessionsCount || 0);
    const streak = Number(activityStats?.streak || 0);
    const calorieScore = Math.max(0, 40 - Math.abs(2200 - calories) / 55);
    const proteinScore = Math.min(20, protein / 2.5);
    const activityScore = Math.min(25, sessions * 5);
    const streakScore = Math.min(15, streak * 1.5);
    return Math.max(0, Math.min(100, Math.round(calorieScore + proteinScore + activityScore + streakScore)));
}

async function getMealSummary(userId, date) {
    const summary = await Meal.aggregate([
        { $match: { userId, date } },
        {
            $group: {
                _id: null,
                totalCalories: { $sum: '$totalCalories' },
                totalProtein: { $sum: '$totalProtein' },
                totalCarbs: { $sum: '$totalCarbs' },
                totalFat: { $sum: '$totalFat' },
                mealCount: { $sum: 1 }
            }
        }
    ]);
    return summary[0] || { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0, mealCount: 0 };
}

async function getActivityStats(userId, period = 'week') {
    const now = new Date();
    const start = new Date();
    if (period === 'month') start.setMonth(now.getMonth() - 1);
    else start.setDate(now.getDate() - 7);

    const startStr = start.toISOString().slice(0, 10);
    const endStr = now.toISOString().slice(0, 10);

    const activities = await Activity.find({
        userId,
        date: { $gte: startStr, $lte: endStr }
    }).lean();

    const totalDuration = activities.reduce((sum, a) => sum + (a.durationMinutes || 0), 0);
    const totalCalories = activities.reduce((sum, a) => sum + (a.caloriesBurned || 0), 0);
    const activeDays = new Set(activities.map((a) => a.date)).size;

    const allDates = await Activity.distinct('date', { userId });
    const daySet = new Set(allDates);
    let streak = 0;
    const d = new Date();
    while (daySet.has(d.toISOString().slice(0, 10))) {
        streak++;
        d.setDate(d.getDate() - 1);
    }

    return { period, totalDuration, totalCalories, activeDays, sessionsCount: activities.length, streak };
}

router.get('/health-score', async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().slice(0, 10);
        const [mealSummary, activityStats] = await Promise.all([
            getMealSummary(req.userId, date),
            getActivityStats(req.userId, 'week')
        ]);
        const score = computeHealthScore({ mealSummary, activityStats });
        res.json({ success: true, date, score, mealSummary, activityStats });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/dashboard', async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().slice(0, 10);

        const [mealSummary, activityStats, referral, openMatches, upcomingEvents] = await Promise.all([
            getMealSummary(req.userId, date),
            getActivityStats(req.userId, 'week'),
            Referral.findOne({ userId: req.userId }).lean(),
            Match.countDocuments({ status: 'open' }),
            Event.countDocuments({ status: 'upcoming' })
        ]);

        const score = computeHealthScore({ mealSummary, activityStats });

        res.json({
            success: true,
            date,
            healthScore: score,
            mealSummary,
            activityStats,
            referral: {
                pointsEarned: referral?.pointsEarned || 0,
                totalReferrals: referral?.totalReferrals || 0,
                code: referral?.code || ''
            },
            openMatches,
            upcomingEvents
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
