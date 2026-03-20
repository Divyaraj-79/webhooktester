const mongoose = require('mongoose');
require('dotenv').config();
const Bot = require('./models/Bot');
const ChatData = require('./models/ChatData');
const User = require('./models/User');

async function check() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");

    const users = await User.find();
    console.log("Users count:", users.length);
    users.forEach(u => console.log(`- ${u.email} (${u._id})`));

    const bots = await Bot.find();
    console.log("Bots count:", bots.length);
    bots.forEach(b => console.log(`- Bot: ${b.apiKey.slice(0, 8)} | Owner: ${b.owner}`));

    const entries = await ChatData.find();
    console.log("ChatEntries count:", entries.length);
    entries.forEach(e => console.log(`- Entry: ${e.sessionId.slice(0, 8)} | Bot: ${e.apiKey.slice(0, 8)} | Owner: ${e.owner}`));

    process.exit();
}

check();
