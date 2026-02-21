require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// === SECURITY MIDDLEWARE ===
app.use(helmet({
    contentSecurityPolicy: false // Allow inline styles for landing page
}));

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
}));

// Rate limit: 10 signups per IP per 15 minutes
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
        success: false,
        message: 'Too many requests. Please try again later.'
    }
});

// === BODY PARSING ===
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

// === STATIC FILES ===
app.use(express.static(path.join(__dirname, '..', 'public')));

// === API ROUTES ===
const waitlistRoutes = require('./routes/waitlist');
app.use('/api/waitlist', apiLimiter, waitlistRoutes);

// === HEALTH CHECK ===
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        app: 'KheloFit Waitlist',
        timestamp: new Date().toISOString()
    });
});

// === SPA FALLBACK ===
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// === MONGODB CONNECTION ===
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/khelofit';

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ MongoDB connected successfully');
        app.listen(PORT, () => {
            console.log(`🚀 KheloFit server running at http://localhost:${PORT}`);
            console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
        });
    })
    .catch(err => {
        console.error('❌ MongoDB connection failed:', err.message);
        console.log('\n💡 Make sure to set MONGODB_URI in your .env file');
        console.log('   Example: MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/khelofit');
        process.exit(1);
    });
