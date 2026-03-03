require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const User = require('./models/User');
const { startReminderScheduler } = require('./utils/reminders');

// === SECURITY MIDDLEWARE ===
app.use(helmet({
    contentSecurityPolicy: false // Allow inline styles for landing page
}));

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
}));

const isProd = process.env.NODE_ENV === 'production';

// Rate limit (disabled in dev)
const noopLimiter = (req, res, next) => next();
const apiLimiter = isProd ? rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200, // relaxed but present in prod
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many requests. Please try again later.'
    }
}) : noopLimiter;

// === BODY PARSING ===
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

// === STATIC FILES ===
app.use(express.static(path.join(__dirname, '..', 'public')));

// === API ROUTES ===
const waitlistRoutes = require('./routes/waitlist');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
app.use('/api/waitlist', apiLimiter, waitlistRoutes);
app.use('/api/auth', apiLimiter, authRoutes);
app.use('/api/users', userRoutes);

const foodsRoutes = require('./routes/foods');
const mealsRoutes = require('./routes/meals');
app.use('/api/foods', apiLimiter, foodsRoutes);
app.use('/api/meals', apiLimiter, mealsRoutes);

const activitiesRoutes = require('./routes/activities');
const coachRoutes = require('./routes/coach');
const matchesRoutes = require('./routes/matches');
const eventsRoutes = require('./routes/events');
const referralsRoutes = require('./routes/referrals');
const notificationsRoutes = require('./routes/notifications');
const insightsRoutes = require('./routes/insights');
const pushRoutes = require('./routes/push');
const healthRoutes = require('./routes/health');
app.use('/api/activities', apiLimiter, activitiesRoutes);
app.use('/api/coach', apiLimiter, coachRoutes);
app.use('/api/matches', apiLimiter, matchesRoutes);
app.use('/api/events', apiLimiter, eventsRoutes);
app.use('/api/referrals', apiLimiter, referralsRoutes);
app.use('/api/notifications', apiLimiter, notificationsRoutes);
app.use('/api/insights', apiLimiter, insightsRoutes);
app.use('/api/push', apiLimiter, pushRoutes);
app.use('/api', healthRoutes);

// === HEALTH CHECK ===
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        app: 'KheloFit Waitlist',
        timestamp: new Date().toISOString()
    });
});

// === USER APP ROUTE ===
app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'app.html'));
});

// === SPA FALLBACK ===
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// === MONGODB CONNECTION ===
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/khelofit';

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('✅ MongoDB connected successfully');
        try {
            await User.syncIndexes();
            console.log('✅ User indexes synced');
        } catch (indexErr) {
            console.warn('⚠️ User index sync warning:', indexErr.message);
        }
        app.listen(PORT, () => {
            console.log(`🚀 KheloFit server running at http://localhost:${PORT}`);
            console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
            startReminderScheduler();
        });
    })
    .catch(err => {
        console.error('❌ MongoDB connection failed:', err.message);
        console.log('\n💡 Make sure to set MONGODB_URI in your .env file');
        console.log('   Example: MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/khelofit');
        process.exit(1);
    });
