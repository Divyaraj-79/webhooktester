const mongoose = require('mongoose');
require('dotenv').config();
const Bot = require('./models/Bot');
const ChatData = require('./models/ChatData');

async function check() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");

    const botId = 'ef95beef25a3551295a1a1349bc35ba7';
    const entries = await ChatData.find({ apiKey: botId }).sort({ updatedAt: -1 });
    console.log("Found", entries.length, "entries for bot:", botId);
    
    entries.forEach((e, idx) => {
        console.log(`\n--- Entry ${idx+1} (${e.sessionId}) ---`);
        console.log("Answers:", JSON.stringify(e.answers, null, 2));
    });

    process.exit();
}

check();
