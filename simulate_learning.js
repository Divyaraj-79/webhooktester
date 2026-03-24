const axios = require('axios');
const mongoose = require('mongoose');
const Bot = require('./models/Bot');
const ChatData = require('./models/ChatData');
const dotenv = require('dotenv');

dotenv.config();

async function runSim() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        // Find the bot for radadiajainish@gmail.com
        const bot = await Bot.findOne({ apiKey: '3f656e10db3cd67244b23f6177e9149b' });
        if (!bot) throw new Error("Bot not found");

        const API_KEY = bot.apiKey;
        const BASE_URL = `http://localhost:3000/api/webhook/${API_KEY}`;
        const phone = "919000000001";
        const sessionId = phone;

        // Cleanup prev test for this phone
        await ChatData.deleteOne({ phone });

        console.log("--- STEP 1: Sending 'Hi' ---");
        await axios.post(BASE_URL, {
            chat_id: phone,
            user_message: "Hi",
            first_name: "Test User"
        });

        console.log("--- STEP 2: Sending RANDOM ID for 'Contractor' branch ---");
        // Contractor branch button text is "कांट्रेक्टर/ ठेकेदार"
        const RANDOM_ID = "RAND_ID_" + Math.random().toString(36).substring(7);
        await axios.post(BASE_URL, {
            chat_id: phone,
            postbackid: RANDOM_ID
        });

        console.log("--- STEP 3: Sending a UNIQUE response for the NEXT question ---");
        // Contractor's next question is "आप किस तरह से *लेबर कॉन्ट्रैक्ट* रखते है?"
        // One unique button text there is "प्रति किलो या पीस"
        // Let's use its known ID or text
        const NEXT_KNOWN_ID = "69be7b6caa8c7"; // From botMappings.js for "प्रति किलो या पीस"
        await axios.post(BASE_URL, {
            chat_id: phone,
            postbackid: NEXT_KNOWN_ID
        });

        console.log("--- VERIFICATION ---");
        const session = await ChatData.findOne({ phone });
        console.log("Question 1 Answer:", session.answers["आप नीचे दिए गए विकल्पों में से किस प्रकार का काम करते हैं ?"]);
        console.log("Question 2 Answer:", session.answers["आप किस तरह से *लेबर कॉन्ट्रैक्ट* रखते है?"]);
        
        if (session.answers["आप नीचे दिए गए विकल्पों में से किस प्रकार का काम करते हैं ?"] === "कांट्रेक्टर/ ठेकेदार") {
            console.log("✅ SUCCESS: Random ID was back-filled correctly!");
        } else {
            console.log("❌ FAILED: Random ID was NOT resolved.");
        }

        process.exit();
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }
}

runSim();
