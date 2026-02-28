// Health Check Routes for KheloFit API
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Import models
const Food = require('../models/Food');
const Meal = require('../models/Meal');

/**
 * @route   GET /health
 * @desc    Health check endpoint
 * @access  Public
 */
router.get('/health', (req, res) => {
  try {
    const uptime = process.uptime();
    const timestamp = new Date().toISOString();
    const version = "1.0.0";
    
    res.status(200).json({
      status: "ok",
      uptime,
      timestamp,
      version
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Health check failed",
      error: error.message
    });
  }
});

/**
 * @route   GET /health/db
 * @desc    Database connection status check
 * @access  Public
 */
router.get('/health/db', (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const dbName = mongoose.connection.name || 'unknown';
    
    // Mongoose connection states: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    const status = dbState === 1 ? "connected" : "disconnected";
    
    res.status(200).json({
      status,
      dbName
    });
  } catch (error) {
    res.status(500).json({
      status: "disconnected",
      dbName: 'unknown',
      message: "Database check failed",
      error: error.message
    });
  }
});

/**
 * @route   GET /health/stats
 * @desc    Application statistics including model counts and memory usage
 * @access  Public
 */
router.get('/health/stats', async (req, res) => {
  try {
    // Get counts for Food and Meal models
    const foodCount = await Food.countDocuments();
    const mealCount = await Meal.countDocuments();
    
    // Get memory usage
    const memoryUsage = process.memoryUsage();
    
    res.status(200).json({
      models: {
        foods: foodCount,
        meals: mealCount
      },
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external
      }
    });
  } catch (error) {
    res.status(500).json({
      models: {
        foods: 0,
        meals: 0
      },
      memory: {},
      message: "Stats retrieval failed",
      error: error.message
    });
  }
});

module.exports = router;