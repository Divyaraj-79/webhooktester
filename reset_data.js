require('dotenv').config();
const mongoose = require('mongoose');
const Bot = require('./models/Bot');
const ChatData = require('./models/ChatData');

async function reset() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB...");

    // Clear global learnings
    await Bot.updateMany({}, { $set: { learnedPostbacks: [] } });
    console.log("✅ Cleared all global learned postbacks.");

    // Delete test sessions
    await ChatData.deleteMany({ phone: { $in: ["911111111111", "922222222222"] } });
    console.log("✅ Deleted test user sessions.");

    process.exit();
}

reset();
