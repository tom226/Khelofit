const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const { getPushConfig, subscribeUser, unsubscribeUser, sendPushToUser } = require('../utils/push');

router.get('/config', (req, res) => {
    const config = getPushConfig();
    res.json({ success: true, ...config });
});

router.post('/subscribe', authRequired, async (req, res) => {
    try {
        const { subscription } = req.body || {};
        const result = await subscribeUser(req.userId, subscription, req.headers['user-agent'] || '');
        if (!result.enabled) {
            return res.status(400).json({ success: false, message: 'Push notifications are not configured on server' });
        }
        res.status(201).json({ success: true, message: 'Push subscription saved' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.post('/unsubscribe', authRequired, async (req, res) => {
    try {
        const { endpoint } = req.body || {};
        const result = await unsubscribeUser(req.userId, endpoint);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.post('/test', authRequired, async (req, res) => {
    try {
        const result = await sendPushToUser(req.userId, {
            title: 'KheloFit Push Test',
            message: 'Push notifications are active on this device.',
            url: '/app',
            tag: 'khelofit-test'
        });
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
