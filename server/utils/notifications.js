const Notification = require('../models/Notification');
const { sendPushToUser } = require('./push');

async function createNotification({ userId, type = 'system', title, message, data = {} }) {
    if (!userId || !title || !message) return null;
    return Notification.create({ userId, type, title, message, data });
}

async function safeNotify(payload) {
    try {
        const created = await createNotification(payload);
        if (created) {
            await sendPushToUser(payload.userId, {
                title: payload.title,
                message: payload.message,
                url: '/app',
                tag: payload.type || 'khelofit-update',
                data: payload.data || {}
            });
        }
    } catch (err) {
        console.warn('Notification create warning:', err.message);
    }
}

module.exports = { createNotification, safeNotify };
