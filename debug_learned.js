require('dotenv').config();
const mongoose = require('mongoose');
const Bot = require('./models/Bot');
const ChatData = require('./models/ChatData');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    
    const bot = await Bot.findOne().sort({ _id: -1 });
    console.log(`Bot: ${bot.apiKey}`);
    console.log(`Learned Postbacks count: ${bot.learnedPostbacks.length}`);
    bot.learnedPostbacks.forEach(lp => {
        console.log(`  ${lp.runtimePostbackId} -> ${lp.buttonText} (${lp.sourceNodeName})`);
    });

    const sessions = await ChatData.find({ apiKey: bot.apiKey }).sort({ _id: -1 });
    for (const s of sessions) {
        console.log(`Session: ${s.phone}, currentStep: ${s.currentStep}, pending: ${s.pendingRuntimePostbackId}`);
        console.log(`  answers:`);
        Object.entries(s.answers || {}).forEach(([k, v]) => console.log(`    ${k.substring(0,20)} = ${v}`));
    }

    await mongoose.disconnect();
}
main();
