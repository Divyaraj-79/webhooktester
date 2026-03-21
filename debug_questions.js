// debug_questions.js
require('dotenv').config();
const Bot = require('./models/Bot');
const mongoose = require('mongoose');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    const bot = await Bot.findOne().sort({ _id: -1 });
    const seen = new Set();
    bot.postbacks.forEach(p => {
        if (!seen.has(p.sourceNodeName)) {
            seen.add(p.sourceNodeName);
            console.log(`Question: ${p.sourceNodeName}`);
        }
    });

    console.log('\nButtons connected to 4th question (`आप *किस प्रकार के काम* के लिए *लेबर सप्ल`):');
    bot.postbacks.filter(p => p.sourceNodeName.includes('आप *किस प्रकार के काम')).forEach(p => {
        console.log(`  Button: "${p.buttonText}" ---> nextQuestion: "${p.nextQuestion}"`);
    });
    
    await mongoose.disconnect();
}
main();
