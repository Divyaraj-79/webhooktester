// debug_postbacks.js
// Run with: node debug_postbacks.js
require('dotenv').config();
const mongoose = require('mongoose');
const Bot = require('./models/Bot');
const ChatData = require('./models/ChatData');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all bots
    const bots = await Bot.find({}).sort({ _id: -1 });
    console.log(`Found ${bots.length} bots:\n`);
    
    for (const bot of bots) {
        console.log('─'.repeat(60));
        console.log(`Bot API Key: ${bot.apiKey}`);
        console.log(`Fields count: ${bot.fields.length}`);
        console.log(`Postbacks count: ${bot.postbacks.length}`);
        
        if (bot.postbacks.length > 0) {
            console.log('\nFirst 10 postbacks:');
            bot.postbacks.slice(0, 10).forEach(p => {
                console.log(`  [${p.sourceNodeName}] "${p.buttonText}" (ID: ${p.postbackId})`);
            });
        }
        
        // Show chat data for this bot
        const chats = await ChatData.find({ apiKey: bot.apiKey });
        console.log(`\nChat entries: ${chats.length}`);
        
        for (const chat of chats.slice(0, 3)) {
            console.log(`\n  Session: ${chat.sessionId}`);
            console.log(`  Phone: ${chat.phone}, Name: ${chat.name}`);
            const answers = Object.entries(chat.answers || {});
            if (answers.length > 0) {
                console.log('  Answers:');
                answers.forEach(([k, v]) => {
                    console.log(`    "${k.replace(/_DOT_/g,'.')}" = "${JSON.stringify(v)}"`);
                });
            } else {
                console.log('  No answers saved.');
            }
            console.log(`  Webhook history count: ${(chat.webhookHistory || []).length}`);
            if ((chat.webhookHistory || []).length > 0) {
                console.log('  Most recent webhook payload:');
                const latest = chat.webhookHistory[chat.webhookHistory.length - 1];
                const keys = Object.keys(latest.payload || {}).filter(k => 
                    !['user_input_data', 'messages'].includes(k)
                );
                keys.forEach(k => console.log(`    ${k}: ${JSON.stringify(latest.payload[k])}`));
            }
        }
        console.log('');
    }
    
    await mongoose.disconnect();
}

main().catch(console.error);
