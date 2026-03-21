// simulate_6th_webhook.js
require('dotenv').config();
const mongoose = require('mongoose');
const Bot = require('./models/Bot');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    const bot = await Bot.findOne().sort({ _id: -1 });

    const payload = {
        "first_name": "Divya Raj Makwana",
        "chat_id": "916353239919",
        "postbackid": "xyz_FakeYesNoButtonID_abc",
        "user_message": "",
        "whatsapp_bot_username": "+91 84333 18333",
        "user_input_data": []
    };

    console.log(`Sending simulated 6th webhook to API Key: ${bot.apiKey}`);
    
    try {
        const response = await fetch(`https://webhooktester.onrender.com/api/webhook/${bot.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const text = await response.text();
        console.log('Response Status:', response.status);
        console.log('Response Body:', text);
    } catch (e) {
        console.error('Error:', e.message);
    }
    await mongoose.disconnect();
}
main();
