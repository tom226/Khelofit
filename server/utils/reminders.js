const User = require('../models/User');
const Meal = require('../models/Meal');
const Activity = require('../models/Activity');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const { safeNotify } = require('./notifications');

let reminderTimer = null;

function toIstParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(date);

    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return {
        date: `${map.year}-${map.month}-${map.day}`,
        hour: Number(map.hour),
        minute: Number(map.minute)
    };
}

async function hasReminderSentToday(userId, reminderKey) {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Notification.exists({
        userId,
        type: 'system',
        'data.reminderKey': reminderKey,
        createdAt: { $gte: dayStart }
    });
}

async function sendReminderIfNeeded({ userId, reminderKey, title, message, data = {} }) {
    const alreadySent = await hasReminderSentToday(userId, reminderKey);
    if (alreadySent) return false;

    await safeNotify({
        userId,
        type: 'system',
        title,
        message,
        data: { ...data, reminderKey }
    });

    return true;
}

async function runReminderCycle() {
    const { date, hour } = toIstParts();
    const users = await User.find({}, { _id: 1, name: 1 }).lean();
    if (!users.length) return { users: 0, reminders: 0 };

    let remindersSent = 0;

    for (const user of users) {
        const userId = user._id;

        if (hour >= 8 && hour <= 11) {
            const mealCountToday = await Meal.countDocuments({ userId, date });
            if (mealCountToday === 0) {
                const sent = await sendReminderIfNeeded({
                    userId,
                    reminderKey: `meal-log-${date}`,
                    title: 'Nutrition reminder',
                    message: 'Log your first meal of the day to keep your health score on track.',
                    data: { category: 'meal', date }
                });
                if (sent) remindersSent += 1;
            }
        }

        if (hour >= 18 && hour <= 21) {
            const activityCountToday = await Activity.countDocuments({ userId, date });
            if (activityCountToday === 0) {
                const sent = await sendReminderIfNeeded({
                    userId,
                    reminderKey: `activity-log-${date}`,
                    title: 'Workout reminder',
                    message: 'No activity logged today yet. A quick 20-minute session keeps your streak alive.',
                    data: { category: 'activity', date }
                });
                if (sent) remindersSent += 1;
            }
        }

        if (hour >= 10 && hour <= 20) {
            const pendingPayments = await Booking.countDocuments({
                userId,
                status: 'pending',
                paymentStatus: 'pending'
            });
            if (pendingPayments > 0) {
                const sent = await sendReminderIfNeeded({
                    userId,
                    reminderKey: `pending-payments-${date}`,
                    title: 'Pending booking payment',
                    message: `You have ${pendingPayments} pending booking payment(s). Complete payment to confirm your spot.`,
                    data: { category: 'payment', pendingPayments }
                });
                if (sent) remindersSent += 1;
            }
        }
    }

    return { users: users.length, reminders: remindersSent };
}

function startReminderScheduler() {
    if (String(process.env.ENABLE_SMART_REMINDERS || 'true').toLowerCase() !== 'true') {
        console.log('⏸️ Smart reminders disabled by config');
        return;
    }

    const intervalMinutes = Math.max(5, Number(process.env.REMINDER_INTERVAL_MINUTES || 15));
    const intervalMs = intervalMinutes * 60 * 1000;

    if (reminderTimer) clearInterval(reminderTimer);

    runReminderCycle()
        .then((result) => {
            console.log(`🔔 Smart reminders cycle complete (startup): users=${result.users}, sent=${result.reminders}`);
        })
        .catch((err) => {
            console.warn('Smart reminder startup cycle warning:', err.message);
        });

    reminderTimer = setInterval(async () => {
        try {
            const result = await runReminderCycle();
            if (result.reminders > 0) {
                console.log(`🔔 Smart reminders sent: ${result.reminders} (users scanned: ${result.users})`);
            }
        } catch (err) {
            console.warn('Smart reminder cycle warning:', err.message);
        }
    }, intervalMs);

    console.log(`✅ Smart reminders scheduler started (every ${intervalMinutes} min)`);
}

module.exports = {
    startReminderScheduler,
    runReminderCycle
};
