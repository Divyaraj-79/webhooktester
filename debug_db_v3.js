const mongoose = require('mongoose');
require('dotenv').config();
const Bot = require('./models/Bot');
const ChatData = require('./models/ChatData');

async function check() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");

    const entries = await ChatData.find({ apiKey: 'fd541ed9aaedd050bd1ea5fd4bc9b1f9' }).sort({ updatedAt: -1 }).limit(3);
    console.log("Found", entries.length, "recent entries for current bot");
    
    entries.forEach((e, idx) => {
        console.log(`\n--- Entry ${idx+1} (${e.sessionId}) ---`);
        console.log("Answers:", JSON.stringify(e.answers, null, 2));
    });

    process.exit();
}

check();
