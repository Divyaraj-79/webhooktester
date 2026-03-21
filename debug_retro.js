// debug_retro.js
require('dotenv').config();
const mongoose = require('mongoose');
const Bot = require('./models/Bot');
const ChatData = require('./models/ChatData');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Get the latest bot
    const bot = await Bot.findOne().sort({ _id: -1 });
    console.log(`\n🤖 Latest Bot: ${bot.name} (API Key: ${bot.apiKey})`);
    
    console.log('\n📌 Postbacks Extraction:');
    bot.postbacks.forEach(p => {
        console.log(`  [${p.sourceNodeName}] "${p.buttonText}" --> NEXT: "${p.nextQuestion}"`);
    });
    
    // Get chats for this bot
    const chat = await ChatData.findOne({ apiKey: bot.apiKey }).sort({ _id: -1 });
    if (chat) {
        console.log(`\n💬 Latest Session: ${chat.phone}`);
        console.log(`  currentStep: ${chat.currentStep}`);
        console.log(`  lastQuestion: "${chat.lastQuestion}"`);
        console.log(`  pendingRuntimePostbackId: "${chat.pendingRuntimePostbackId}"`);
        console.log(`  answers:`);
        Object.entries(chat.answers || {}).forEach(([k, v]) => {
            console.log(`    "${k.replace(/_DOT_/g, '.')}" = "${v}"`);
        });
        
        console.log(`\n🤖 Bot learnedPostbacks:`);
        bot.learnedPostbacks.forEach(lp => {
            console.log(`  ${lp.runtimePostbackId} -> [${lp.sourceNodeName}] "${lp.buttonText}"`);
        });
    }

    await mongoose.disconnect();
}
main().catch(console.error);
