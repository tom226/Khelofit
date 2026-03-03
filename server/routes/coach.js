const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const { chatCompletion } = require('../utils/ai');
const Meal = require('../models/Meal');

function extractJson(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    // keep trying below
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch (_) {
      // continue
    }
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch (_) {
      return null;
    }
  }
  return null;
}

function fallbackWorkoutPlan({ goals = 'general fitness', fitnessLevel = 'beginner', durationMinutes = 45 }) {
  const level = String(fitnessLevel || 'beginner').toLowerCase();
  const baseReps = level === 'advanced' ? '12-15 reps' : level === 'intermediate' ? '10-12 reps' : '8-10 reps';
  return {
    warmup: [
      '5 min brisk walk or march in place',
      'Joint mobility: neck, shoulders, hips, knees (3 min)',
      'Dynamic stretches: leg swings, arm circles (2 min)'
    ],
    workout: [
      `Bodyweight squats - 3 sets x ${baseReps}`,
      `Push-ups (or incline push-ups) - 3 sets x ${baseReps}`,
      'Lunges - 3 sets x 10 each side',
      'Plank - 3 sets x 30-60 sec',
      'Glute bridge - 3 sets x 12-15 reps',
      'Burpees or high knees - 3 rounds x 30 sec'
    ],
    cooldown: [
      'Slow walk and deep breathing (3 min)',
      'Hamstring, quad, calf stretch (3 min)',
      'Shoulder and chest stretch (2 min)'
    ],
    tips: [
      `Goal focus: ${goals}`,
      `Fitness level: ${fitnessLevel}`,
      `Target session: ~${durationMinutes} minutes`,
      'Hydrate before and after workout',
      'Maintain proper form over speed'
    ]
  };
}

function fallbackDietPlan({ calorieGoal = 2000, dietType = 'vegetarian', meals = 4 }) {
  const veg = String(dietType).toLowerCase().includes('veg');
  const planMeals = [
    {
      name: 'Breakfast',
      time: '08:00',
      items: veg
        ? [
          { dish: 'Oats upma', portion: '1 bowl', calories: 320, protein: 12, carbs: 48, fat: 8 },
          { dish: 'Curd', portion: '100 g', calories: 70, protein: 4, carbs: 5, fat: 4 }
        ]
        : [
          { dish: 'Masala omelette', portion: '2 eggs', calories: 220, protein: 16, carbs: 4, fat: 14 },
          { dish: 'Whole wheat toast', portion: '2 slices', calories: 160, protein: 6, carbs: 28, fat: 2 }
        ]
    },
    {
      name: 'Lunch',
      time: '13:00',
      items: veg
        ? [
          { dish: 'Dal + brown rice', portion: '1.5 bowls', calories: 460, protein: 18, carbs: 70, fat: 10 },
          { dish: 'Salad', portion: '1 plate', calories: 80, protein: 3, carbs: 10, fat: 3 }
        ]
        : [
          { dish: 'Grilled chicken + rice', portion: '1 plate', calories: 520, protein: 35, carbs: 55, fat: 14 },
          { dish: 'Salad', portion: '1 plate', calories: 80, protein: 3, carbs: 10, fat: 3 }
        ]
    },
    {
      name: 'Snack',
      time: '17:00',
      items: [
        { dish: 'Roasted chana', portion: '40 g', calories: 150, protein: 8, carbs: 22, fat: 3 },
        { dish: 'Fruit (banana/apple)', portion: '1 medium', calories: 90, protein: 1, carbs: 23, fat: 0 }
      ]
    },
    {
      name: 'Dinner',
      time: '20:00',
      items: veg
        ? [
          { dish: 'Paneer bhurji + roti', portion: '1 plate', calories: 510, protein: 28, carbs: 40, fat: 24 },
          { dish: 'Sauteed vegetables', portion: '1 bowl', calories: 110, protein: 4, carbs: 12, fat: 5 }
        ]
        : [
          { dish: 'Fish curry + roti', portion: '1 plate', calories: 500, protein: 32, carbs: 38, fat: 20 },
          { dish: 'Sauteed vegetables', portion: '1 bowl', calories: 110, protein: 4, carbs: 12, fat: 5 }
        ]
    }
  ].slice(0, Number(meals) || 4);

  const allItems = planMeals.flatMap((m) => m.items || []);
  const totals = allItems.reduce((acc, item) => {
    acc.calories += Number(item.calories || 0);
    acc.protein += Number(item.protein || 0);
    acc.carbs += Number(item.carbs || 0);
    acc.fat += Number(item.fat || 0);
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

  return {
    meals: planMeals,
    totalCalories: totals.calories,
    calorieTarget: Number(calorieGoal) || 2000,
    macros: {
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat
    }
  };
}

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

    let plan = null;
    let source = 'fallback';
    try {
      const result = await chatCompletion([
        { role: 'system', content: 'You are an expert Indian fitness coach. Always respond with valid JSON.' },
        { role: 'user', content: prompt }
      ]);
      plan = extractJson(result);
      if (plan) source = 'ai';
    } catch (aiErr) {
      console.warn('AI workout generation failed, using fallback:', aiErr.message);
    }
    if (!plan) {
      plan = fallbackWorkoutPlan({ goals, fitnessLevel, durationMinutes });
    }
    res.json({ plan, source });
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

    let plan = null;
    let source = 'fallback';
    try {
      const result = await chatCompletion([
        { role: 'system', content: 'You are an expert Indian nutritionist. Always respond with valid JSON.' },
        { role: 'user', content: prompt }
      ]);
      plan = extractJson(result);
      if (plan) source = 'ai';
    } catch (aiErr) {
      console.warn('AI diet generation failed, using fallback:', aiErr.message);
    }
    if (!plan) {
      plan = fallbackDietPlan({ calorieGoal, dietType, meals });
    }
    res.json({ plan, source });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate diet plan', details: err.message });
  }
});

// POST /api/coach/analyze-meal
router.post('/analyze-meal', authRequired, async (req, res) => {
  try {
    const { mealId } = req.body;
    const meal = await Meal.findById(mealId);
    if (!meal) return res.status(404).json({ error: 'Meal not found' });

    const foodList = (meal.items || [])
      .map(i => `${i.name} (${i.quantity || 1} ${i.unit || 'serving'})`)
      .join(', ');
    const prompt = `Analyze this Indian meal: ${foodList}
Meal type: ${meal.mealType}
Provide: nutritional balance assessment, what's missing, healthier alternatives, and a score out of 10. Return as JSON: { score, assessment, missing: [], suggestions: [], alternatives: [] }`;

    let analysis = null;
    let source = 'fallback';
    try {
      const result = await chatCompletion([
        { role: 'system', content: 'You are an expert Indian nutritionist. Always respond with valid JSON.' },
        { role: 'user', content: prompt }
      ]);
      analysis = extractJson(result);
      if (analysis) source = 'ai';
    } catch (aiErr) {
      console.warn('AI meal analysis failed, using fallback:', aiErr.message);
    }

    if (!analysis) {
      const calories = Number(meal.totalCalories || 0);
      analysis = {
        score: calories > 0 && calories < 900 ? 7 : 6,
        assessment: 'Meal logged successfully. Add more vegetables and lean protein for better balance.',
        missing: ['Fiber', 'Hydration reminder'],
        suggestions: ['Add salad or fruit', 'Prefer grilled/steamed options', 'Limit deep fried items'],
        alternatives: ['Poha instead of fried snacks', 'Dal + brown rice instead of refined carbs']
      };
    }

    res.json({ analysis, meal, source });
  } catch (err) {
    res.status(500).json({ error: 'Failed to analyze meal', details: err.message });
  }
});

module.exports = router;
