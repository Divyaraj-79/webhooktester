const mongoose = require('mongoose');
require('dotenv').config();
const ChatData = require('./models/ChatData');
const Bot = require('./models/Bot');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    // Find the most recent 5 bots 
    const bots = await Bot.find({}).sort({ _id: -1 }).limit(5);
    bots.forEach(b => console.log('Bot:', b.apiKey, '| postbacks count:', b.postbacks ? b.postbacks.length : 0));

    // Find entries from these bots
    const apiKeys = bots.map(b => b.apiKey);
    const entries = await ChatData.find({ apiKey: { $in: apiKeys } }).sort({ updatedAt: -1 }).limit(5);
    entries.forEach(e => {
        console.log('\nEntry apiKey:', e.apiKey.substring(0,12)+'...', 'session:', e.sessionId);
        console.log('  webhookHistory calls:', e.webhookHistory ? e.webhookHistory.length : 'NO HISTORY FIELD');
        if(e.webhookHistory && e.webhookHistory.length > 0) {
            e.webhookHistory.forEach((h, j) => {
                console.log(`  -- Call ${j+1} at ${h.receivedAt}:`);
                console.log('     PAYLOAD:', JSON.stringify(h.payload, null, 2));
            });
        }
        console.log('  ANSWERS:', JSON.stringify(e.answers, null, 2));
    });
    process.exit();
});
