const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const Otp = require('../models/Otp');
const User = require('../models/User');
const { authRequired } = require('../middleware/auth');

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const JWT_SECRET = process.env.JWT_SECRET || 'khelofit-dev-secret-change-me';
const JWT_EXPIRES_IN = '30d';

const hasTwilio = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM;
const hasMsg91 = process.env.MSG91_AUTHKEY && process.env.MSG91_TEMPLATE_ID && process.env.MSG91_SENDER;
const hasSendgrid = process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM;

function normalizePhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('91') && cleaned.length === 12) return `+${cleaned}`;
    if (cleaned.length === 10) return `+91${cleaned}`;
    return phone;
}

function validatePhone(phone) {
    return /^\+91[6-9]\d{9}$/.test(phone);
}

function validateEmail(email) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
}

async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

function generateOtp() {
    return ('' + Math.floor(100000 + Math.random() * 900000));
}

function signJwt(userId, phone) {
    return jwt.sign({ userId, phone }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function sendSmsOtp(to, code) {
    // Prefer MSG91 for India if configured
    if (hasMsg91) {
        try {
            const res = await fetch('https://control.msg91.com/api/v5/flow/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    authkey: process.env.MSG91_AUTHKEY
                },
                body: JSON.stringify({
                    template_id: process.env.MSG91_TEMPLATE_ID,
                    sender: process.env.MSG91_SENDER,
                    short_url: false,
                    mobiles: to.replace('+', ''),
                    VAR1: code
                })
            });

            if (res.ok) {
                return { sent: true, provider: 'msg91' };
            }

            const text = await res.text();
            console.error('MSG91 send failed:', res.status, text);
        } catch (err) {
            console.error('MSG91 send error:', err.message);
        }
    }

    // Fallback to Twilio if available
    if (hasTwilio) {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
        const body = new URLSearchParams({
            To: to,
            From: process.env.TWILIO_FROM,
            Body: `Your KheloFit OTP is ${code}. It expires in 5 minutes.`
        }).toString();

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body
            });

            if (!res.ok) {
                const text = await res.text();
                console.error('Twilio send failed:', res.status, text);
                return { sent: false, provider: 'twilio', status: res.status };
            }

            return { sent: true, provider: 'twilio' };
        } catch (err) {
            console.error('Twilio send error:', err.message);
            return { sent: false, provider: 'twilio' };
        }
    }

    console.log(`(DEV) OTP ${code} not sent — configure MSG91 or Twilio env vars to enable SMS.`);
    return { sent: false, provider: 'none' };
}

async function sendEmailOtp(to, code) {
    if (!hasSendgrid) {
        return { sent: false, provider: 'sendgrid' };
    }

    const payload = {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: process.env.SENDGRID_FROM },
        subject: 'Your KheloFit OTP',
        content: [{ type: 'text/plain', value: `Your KheloFit OTP is ${code}. It expires in 5 minutes.` }]
    };

    try {
        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const text = await res.text();
            console.error('SendGrid send failed:', res.status, text);
            return { sent: false, provider: 'sendgrid', status: res.status };
        }

        return { sent: true, provider: 'sendgrid' };
    } catch (err) {
        console.error('SendGrid send error:', err.message);
        return { sent: false, provider: 'sendgrid' };
    }
}

// POST /api/auth/send-otp
router.post('/send-otp', async (req, res) => {
    try {
        const { phone, name, language, city, sportsPrefs, email } = req.body || {};
        const normalizedPhone = normalizePhone(phone);

        if (!validatePhone(normalizedPhone)) {
            return res.status(400).json({ success: false, message: 'Invalid phone number' });
        }

        if (email && !validateEmail(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email' });
        }

        const code = generateOtp();
        const expiresAt = new Date(Date.now() + OTP_TTL_MS);

        const otpDoc = await Otp.findOneAndUpdate(
            { phone: normalizedPhone },
            { code, expiresAt, attempts: 0 },
            { upsert: true, new: true }
        );

        const results = await Promise.all([
            sendSmsOtp(normalizedPhone, code),
            email ? sendEmailOtp(email, code) : Promise.resolve({ sent: false })
        ]);
        const smsSent = results[0].sent;
        const emailSent = results[1].sent;
        if (!smsSent && !emailSent && !hasTwilio && !hasSendgrid) {
            console.log(`(DEV) OTP ${code} not delivered (no provider configured).`);
        }

        // Optionally pre-create/update user profile shell
        await User.findOneAndUpdate(
            { phone: normalizedPhone },
            {
                name: name || '',
                language: language || 'en',
                city: city || '',
                sportsPrefs: Array.isArray(sportsPrefs) ? sportsPrefs : [],
                email: email || ''
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.json({ success: true, message: 'OTP sent', smsSent, emailSent, ttlMs: OTP_TTL_MS, otpId: otpDoc?._id });
    } catch (err) {
        console.error('Send OTP Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/auth/register-email
router.post('/register-email', async (req, res) => {
    try {
        const { email, password, name } = req.body || {};
        const normalizedEmail = (email || '').trim().toLowerCase();

        if (!validateEmail(normalizedEmail)) {
            return res.status(400).json({ success: false, message: 'Invalid email' });
        }
        if (!password || password.length < 8) {
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
        }

        const existing = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
        if (existing && existing.passwordHash) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }

        const passwordHash = await hashPassword(password);

        const user = await User.findOneAndUpdate(
            { email: normalizedEmail },
            {
                email: normalizedEmail,
                name: name || '',
                passwordHash
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        const token = signJwt(user._id, user.phone || undefined);
        res.json({ success: true, user: { id: user._id, email: user.email, name: user.name }, token });
    } catch (err) {
        console.error('Register Email Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/auth/login-email
router.post('/login-email', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        const normalizedEmail = (email || '').trim().toLowerCase();

        if (!validateEmail(normalizedEmail) || !password) {
            return res.status(400).json({ success: false, message: 'Invalid email or password' });
        }

        const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
        if (!user || !user.passwordHash) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }

        const token = signJwt(user._id, user.phone || undefined);
        res.json({ success: true, user: { id: user._id, email: user.email, name: user.name }, token });
    } catch (err) {
        console.error('Login Email Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
    try {
        const { phone, code, name, language, city, sportsPrefs, email } = req.body || {};
        const normalizedPhone = normalizePhone(phone);

        if (!validatePhone(normalizedPhone) || !code) {
            return res.status(400).json({ success: false, message: 'Invalid phone or code' });
        }

        if (email && !validateEmail(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email' });
        }

        const record = await Otp.findOne({ phone: normalizedPhone });

        if (!record) {
            return res.status(400).json({ success: false, message: 'OTP not found, please request again' });
        }

        if (record.expiresAt < new Date()) {
            return res.status(400).json({ success: false, message: 'OTP expired, please request again' });
        }

        if (record.code !== String(code).trim()) {
            await Otp.updateOne({ phone: normalizedPhone }, { $inc: { attempts: 1 } });
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        // OTP valid — create/update user
        const user = await User.findOneAndUpdate(
            { phone: normalizedPhone },
            {
                name: name || undefined,
                language: language || undefined,
                city: city || undefined,
                sportsPrefs: Array.isArray(sportsPrefs) ? sportsPrefs : undefined,
                email: email || undefined
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();

        // Clean up OTP
        await Otp.deleteOne({ phone: normalizedPhone });

        const token = signJwt(user._id, user.phone);

        res.json({ success: true, user, token });
    } catch (err) {
        console.error('Verify OTP Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/auth/me — Get current user from JWT
router.get('/me', authRequired, async (req, res) => {
    try {
        const user = await User.findById(req.userId).lean();
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.json({ success: true, user });
    } catch (err) {
        console.error('Auth Me Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;