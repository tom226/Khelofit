require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Food = require('../server/models/Food');
const foods = require('../data/indian-foods.json');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/khelofit';

async function seed() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');
    
    const existing = await Food.countDocuments();
    if (existing > 0) {
        console.log(`Already ${existing} foods in DB. Drop collection first if you want to re-seed.`);
        console.log('Run: db.foods.drop() in mongo shell, then re-run this script.');
    } else {
        const result = await Food.insertMany(foods);
        console.log(`Seeded ${result.length} Indian foods`);
    }
    
    await mongoose.disconnect();
    console.log('Done');
}

seed().catch(err => { console.error(err); process.exit(1); });