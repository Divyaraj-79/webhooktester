// test_retro_logic.js
require('dotenv').config();
const mongoose = require('mongoose');
const Bot = require('./models/Bot');
const ChatData = require('./models/ChatData');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    
    const bot = await Bot.findOne().sort({ _id: -1 });
    const chat = await ChatData.findOne({ apiKey: bot.apiKey }).sort({ _id: -1 });

    const prevQ = chat.lastQuestion; // "आप *किस प्रकार के काम* के लिए *लेबर सप्ल"
    
    // Simulate what happens next: say the next question we get is some next step question
    console.log(`prevQ: "${prevQ}"`);
    
    const candidates = bot.postbacks.filter(p => p.sourceNodeName === prevQ);
    console.log(`Found ${candidates.length} candidates for prevQ.`);
    
    // Test the new matching logic against a hypothetical next question name
    // Looking at the console log, the NEXT question for buttons under "आप *किस प्रकार के काम* के लिए *लेबर सप्ल"
    // Let's print out what they have as nextQuestion:
    candidates.forEach(p => {
        console.log(`  Button "${p.buttonText}" ---> nextQuestion: "${p.nextQuestion}"`);
    });
    
    await mongoose.disconnect();
}
main().catch(console.error);
