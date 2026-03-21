// debug_json.js
require('dotenv').config();
const Bot = require('./models/Bot');
const mongoose = require('mongoose');
const fs = require('fs');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    const bot = await Bot.findOne().sort({ _id: -1 });
    
    // We don't save the full JSON in Bot model. So we need the original botData.
    // The user uploaded it to the server. We don't have the original payload stored in the DB.
    console.log("Since we don't store the raw JSON, I will review the user's prompt text.");
    await mongoose.disconnect();
}
main();
