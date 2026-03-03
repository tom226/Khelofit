const express = require('express');
const router = express.Router();
const Match = require('../models/Match');
const { authRequired } = require('../middleware/auth');
const { safeNotify } = require('../utils/notifications');

router.use(authRequired);

router.post('/', async (req, res) => {
  try {
    const { sport, city, location, dateTime, skillLevel = 'any', maxPlayers = 2, notes = '' } = req.body || {};
    if (!sport || !city || !dateTime) {
      return res.status(400).json({ success: false, message: 'sport, city and dateTime are required' });
    }

    const match = await Match.create({
      createdBy: req.userId,
      sport,
      city,
      location: location || {},
      dateTime,
      skillLevel,
      maxPlayers: Math.max(2, Number(maxPlayers) || 2),
      players: [{ userId: req.userId }],
      notes,
    });

    await safeNotify({
      userId: req.userId,
      type: 'match',
      title: 'Match created',
      message: `${sport} match created in ${city}.`,
      data: { matchId: match._id, sport, city }
    });

    res.status(201).json({ success: true, data: match });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { city, sport, status = 'open', limit = 30 } = req.query;
    const filter = { status };
    if (city) filter.city = city;
    if (sport) filter.sport = sport;

    const matches = await Match.find(filter)
      .sort({ dateTime: 1 })
      .limit(Math.min(Number(limit) || 30, 100))
      .lean();

    res.json({ success: true, data: matches });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/join', async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ success: false, message: 'Match not found' });

    if (['cancelled', 'completed', 'started'].includes(match.status)) {
      return res.status(400).json({ success: false, message: `Cannot join a ${match.status} match` });
    }

    if (match.players.some((p) => String(p.userId) === String(req.userId))) {
      return res.json({ success: true, data: match, message: 'Already joined' });
    }

    if (match.players.length >= match.maxPlayers) {
      match.status = 'full';
      await match.save();
      return res.status(400).json({ success: false, message: 'Match is full' });
    }

    match.players.push({ userId: req.userId });
    if (match.players.length >= match.maxPlayers) match.status = 'full';
    await match.save();

    await safeNotify({
      userId: req.userId,
      type: 'match',
      title: 'Joined match',
      message: `You joined a ${match.sport} match in ${match.city}.`,
      data: { matchId: match._id }
    });

    res.json({ success: true, data: match });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/leave', async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ success: false, message: 'Match not found' });

    const before = match.players.length;
    match.players = match.players.filter((p) => String(p.userId) !== String(req.userId));

    if (before === match.players.length) {
      return res.status(400).json({ success: false, message: 'You are not part of this match' });
    }

    if (match.status === 'full' && match.players.length < match.maxPlayers) {
      match.status = 'open';
    }

    await match.save();
    await safeNotify({
      userId: req.userId,
      type: 'match',
      title: 'Left match',
      message: `You left a ${match.sport} match in ${match.city}.`,
      data: { matchId: match._id }
    });
    res.json({ success: true, data: match });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
