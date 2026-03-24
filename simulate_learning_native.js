const http = require('http');
const mongoose = require('mongoose');
const Bot = require('./models/Bot');
const ChatData = require('./models/ChatData');
const dotenv = require('dotenv');

dotenv.config();

function post(url, data) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const options = {
            hostname: u.hostname,
            port: u.port || 80,
            path: u.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(JSON.stringify(data))
            }
        };
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve(body));
        });
        req.on('error', (e) => reject(e));
        req.write(JSON.stringify(data));
        req.end();
    });
}

async function runSim() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        const bot = await Bot.findOne({ apiKey: '3f656e10db3cd67244b23f6177e9149b' });
        if (!bot) throw new Error("Bot not found");

        const API_KEY = bot.apiKey;
        const BASE_URL = `http://localhost:3000/api/webhook/${API_KEY}`;
        const phone = "919000000002";

        await ChatData.deleteOne({ phone });

        console.log("--- STEP 1: Sending 'Hi' ---");
        await post(BASE_URL, { chat_id: phone, user_message: "Hi" });

        console.log("--- STEP 2: Sending RANDOM ID for 'Contractor' branch ---");
        const RANDOM_ID = "RAND_CONTRACTOR_" + Math.random().toString(36).substring(7);
        await post(BASE_URL, { chat_id: phone, postbackid: RANDOM_ID });

        console.log("--- STEP 3: Sending NEXT response (which identifies the branch) ---");
        const NEXT_ID = "69be7b6caa8c7"; // "प्रति किलो या पीस" -> unique to Contractor
        await post(BASE_URL, { chat_id: phone, postbackid: NEXT_ID });

        console.log("--- VERIFICATION ---");
        const session = await ChatData.findOne({ phone });
        const q1Answer = session.answers["आप नीचे दिए गए विकल्पों में से किस प्रकार का काम करते हैं ?"];
        console.log("Question 1 Answer:", q1Answer);

        if (q1Answer === "कांट्रेक्टर/ ठेकेदार") {
            console.log("✅ SUCCESS: Random ID was back-filled correctly!");
            // Check global learning
            const updatedBot = await Bot.findById(bot._id);
            const learned = updatedBot.learnedPostbacks.find(l => l.runtimePostbackId === RANDOM_ID);
            if (learned) {
                console.log("✅ SUCCESS: Random ID learned globally!");
            }
        } else {
            console.log("❌ FAILED: Random ID was NOT resolved. Result: " + q1Answer);
        }

        process.exit();
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }
}

runSim();
