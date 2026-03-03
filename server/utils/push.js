const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:support@khelofit.app';

const enabled = Boolean(vapidPublicKey && vapidPrivateKey);

if (enabled) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

function getPushConfig() {
    return {
        enabled,
        publicKey: enabled ? vapidPublicKey : ''
    };
}

async function subscribeUser(userId, subscription, userAgent = '') {
    if (!enabled) return { enabled: false };
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        throw new Error('Invalid push subscription payload');
    }

    const payload = {
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime || null,
        keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth
        },
        userAgent: userAgent || ''
    };

    await PushSubscription.findOneAndUpdate(
        { endpoint: subscription.endpoint },
        { userId, ...payload },
        { upsert: true, new: true }
    );

    return { enabled: true };
}

async function unsubscribeUser(userId, endpoint) {
    if (!endpoint) return { deleted: 0 };
    const result = await PushSubscription.deleteOne({ userId, endpoint });
    return { deleted: result.deletedCount || 0 };
}

async function sendPushToUser(userId, payload) {
    if (!enabled || !userId) return { sent: 0, failed: 0, disabled: !enabled };

    const subscriptions = await PushSubscription.find({ userId }).lean();
    if (!subscriptions.length) return { sent: 0, failed: 0 };

    const message = JSON.stringify({
        title: payload?.title || 'KheloFit',
        body: payload?.message || 'You have a new update',
        url: payload?.url || '/app',
        tag: payload?.tag || 'khelofit-update',
        data: payload?.data || {}
    });

    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
        try {
            await webpush.sendNotification({
                endpoint: sub.endpoint,
                expirationTime: sub.expirationTime || null,
                keys: sub.keys
            }, message);
            sent += 1;
        } catch (err) {
            failed += 1;
            const statusCode = Number(err?.statusCode || 0);
            if (statusCode === 404 || statusCode === 410) {
                await PushSubscription.deleteOne({ endpoint: sub.endpoint });
            }
        }
    }

    return { sent, failed };
}

module.exports = {
    getPushConfig,
    subscribeUser,
    unsubscribeUser,
    sendPushToUser
};
