const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const { authRequired } = require('../middleware/auth');
const { safeNotify } = require('../utils/notifications');

router.get('/', async (req, res) => {
  try {
    const { city, category, status = 'upcoming', limit = 50 } = req.query;
    const filter = { status };
    if (city) filter.city = city;
    if (category) filter.category = category;

    const events = await Event.find(filter)
      .sort({ date: 1 })
      .limit(Math.min(Number(limit) || 50, 200))
      .lean();

    res.json({ success: true, data: events });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).lean();
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, data: event });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', authRequired, async (req, res) => {
  try {
    const { title, description, category, city, venue, date, endDate, maxParticipants, price, imageUrl, organizer, contactPhone, contactEmail, tags } = req.body || {};
    if (!title || !category || !city || !date) {
      return res.status(400).json({ success: false, message: 'title, category, city and date are required' });
    }

    const event = await Event.create({
      title,
      description: description || '',
      category,
      city,
      venue: venue || {},
      date,
      endDate,
      maxParticipants: Number(maxParticipants) || 0,
      price: Number(price) || 0,
      imageUrl: imageUrl || '',
      organizer: organizer || '',
      contactPhone: contactPhone || '',
      contactEmail: contactEmail || '',
      tags: Array.isArray(tags) ? tags : [],
    });

    res.status(201).json({ success: true, data: event });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/book', authRequired, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

    if (event.status !== 'upcoming' && event.status !== 'ongoing') {
      return res.status(400).json({ success: false, message: `Cannot book ${event.status} event` });
    }

    if (event.maxParticipants > 0 && event.registeredCount >= event.maxParticipants) {
      return res.status(400).json({ success: false, message: 'Event is sold out' });
    }

    const existing = await Booking.findOne({ userId: req.userId, eventId: event._id });
    if (existing) return res.json({ success: true, data: existing, message: 'Already booked' });

    const booking = await Booking.create({
      userId: req.userId,
      eventId: event._id,
      amount: event.price,
      paymentStatus: event.price > 0 ? 'pending' : 'free',
      status: event.price > 0 ? 'pending' : 'confirmed',
    });

    event.registeredCount += 1;
    await event.save();

    await safeNotify({
      userId: req.userId,
      type: event.price > 0 ? 'payment' : 'event',
      title: event.price > 0 ? 'Booking created: payment pending' : 'Event booking confirmed',
      message: event.price > 0
        ? `Your booking for ${event.title} is reserved. Complete payment to confirm your seat.`
        : `Your seat for ${event.title} is confirmed.`,
      data: { bookingId: booking._id, eventId: event._id }
    });

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/bookings/:bookingId/pay', authRequired, async (req, res) => {
  try {
    const { paymentId } = req.body || {};
    const booking = await Booking.findOne({ _id: req.params.bookingId, userId: req.userId }).populate('eventId');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (booking.paymentStatus === 'paid' && booking.status === 'confirmed') {
      return res.json({ success: true, data: booking, message: 'Booking already paid and confirmed' });
    }

    if (!booking.eventId) {
      return res.status(400).json({ success: false, message: 'Associated event not found' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Cancelled booking cannot be paid' });
    }

    booking.paymentStatus = booking.amount > 0 ? 'paid' : 'free';
    booking.status = 'confirmed';
    booking.paymentId = paymentId || booking.paymentId;
    await booking.save();

    await safeNotify({
      userId: req.userId,
      type: booking.amount > 0 ? 'payment' : 'event',
      title: booking.amount > 0 ? 'Payment successful' : 'Event booking confirmed',
      message: booking.amount > 0
        ? `Payment received for ${booking.eventId.title}. Your ticket is confirmed.`
        : `Your booking for ${booking.eventId.title} is confirmed.`,
      data: { bookingId: booking._id, eventId: booking.eventId._id, paymentId: booking.paymentId || '' }
    });

    res.json({ success: true, data: booking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/bookings/:bookingId/cancel', authRequired, async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.bookingId, userId: req.userId }).populate('eventId');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (booking.status === 'cancelled') {
      return res.json({ success: true, data: booking, message: 'Booking already cancelled' });
    }

    booking.status = 'cancelled';
    if (booking.paymentStatus === 'paid') booking.paymentStatus = 'refunded';
    await booking.save();

    if (booking.eventId) {
      await Event.findByIdAndUpdate(booking.eventId._id, {
        $inc: { registeredCount: -1 }
      });
    }

    await safeNotify({
      userId: req.userId,
      type: booking.paymentStatus === 'refunded' ? 'payment' : 'event',
      title: booking.paymentStatus === 'refunded' ? 'Booking cancelled and refund initiated' : 'Booking cancelled',
      message: booking.eventId?.title
        ? `Your booking for ${booking.eventId.title} has been cancelled.`
        : 'Your booking has been cancelled.',
      data: { bookingId: booking._id, eventId: booking.eventId?._id || null }
    });

    res.json({ success: true, data: booking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/my/bookings', authRequired, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.userId })
      .populate('eventId')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: bookings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
