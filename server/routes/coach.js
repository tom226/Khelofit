const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const { chatCompletion } = require('../utils/ai');
const Meal = require('../models/Meal');

// POST /api/coach/workout-plan
router.post('/workout-plan', authRequired, async (req, res) => {
  try {
    const { goals, fitnessLevel, equipment, durationMinutes } = req.body;
    const prompt = `Create a detailed workout plan for an Indian user.
Goals: ${goals || 'general fitness'}
Fitness level: ${fitnessLevel || 'beginner'}
Available equipment: ${equipment ? equipment.join(', ') : 'none (bodyweight only)'}
Duration: ${durationMinutes || 45} minutes
Include warm-up, main workout, and cool-down. Use exercises common in Indian gyms. Return as JSON with structure: { warmup: [], workout: [], cooldown: [], tips: [] }`;

    const result = await chatCompletion([
      { role: 'system', content: 'You are an expert Indian fitness coach. Always respond with valid JSON.' },
      { role: 'user', content: prompt }
    ]);
    res.json({ plan: JSON.parse(result) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate workout plan', details: err.message });
  }
});

// POST /api/coach/diet-plan
router.post('/diet-plan', authRequired, async (req, res) => {
  try {
    const { calorieGoal, dietType, allergies, meals } = req.body;
    const prompt = `Create a daily Indian diet plan.
Calorie goal: ${calorieGoal || 2000} kcal
Diet type: ${dietType || 'vegetarian'}
Allergies/restrictions: ${allergies ? allergies.join(', ') : 'none'}
Number of meals: ${meals || 4}
Include breakfast, lunch, dinner, and snacks with Indian dishes. Return as JSON: { meals: [{ name, time, items: [{ dish, portion, calories, protein, carbs, fat }] }], totalCalories, macros: { protein, carbs, fat } }`;

    const result = await chatCompletion([
      { role: 'system', content: 'You are an expert Indian nutritionist. Always respond with valid JSON.' },
      { role: 'user', content: prompt }
    ]);
    res.json({ plan: JSON.parse(result) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate diet plan', details: err.message });
  }
});

// POST /api/coach/analyze-meal
router.post('/analyze-meal', authRequired, async (req, res) => {
  try {
    const { mealId } = req.body;
    const meal = await Meal.findById(mealId).populate('foods.food');
    if (!meal) return res.status(404).json({ error: 'Meal not found' });

    const foodList = meal.foods.map(f => `${f.food.name} (${f.quantity}${f.food.servingUnit})`).join(', ');
    const prompt = `Analyze this Indian meal: ${foodList}
Meal type: ${meal.mealType}
Provide: nutritional balance assessment, what's missing, healthier alternatives, and a score out of 10. Return as JSON: { score, assessment, missing: [], suggestions: [], alternatives: [] }`;

    const result = await chatCompletion([
      { role: 'system', content: 'You are an expert Indian nutritionist. Always respond with valid JSON.' },
      { role: 'user', content: prompt }
    ]);
    res.json({ analysis: JSON.parse(result), meal });
  } catch (err) {
    res.status(500).json({ error: 'Failed to analyze meal', details: err.message });
  }
});

module.exports = router;
