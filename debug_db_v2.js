const mongoose = require('mongoose');
require('dotenv').config();
const Bot = require('./models/Bot');
const ChatData = require('./models/ChatData');

async function check() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");

    const entries = await ChatData.find();
    console.log("ChatEntries count:", entries.length);
    entries.forEach(e => {
        const sId = e.sessionId || "N/A";
        const owner = e.owner || "UNOWNED";
        console.log(`- Entry: ${sId} | BotKey: ${e.apiKey} | Owner: ${owner}`);
    });

    process.exit();
}

check();
