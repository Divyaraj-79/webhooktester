// check_recent_payloads.js - show raw webhook payloads stored in DB
require('dotenv').config();
const mongoose = require('mongoose');
const ChatData = require('./models/ChatData');
const Bot = require('./models/Bot');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected\n');

    // Get the most recently-updated chat across all bots
    const recentChats = await ChatData.find({}).sort({ updatedAt: -1 }).limit(5);
    
    for (const chat of recentChats) {
        console.log('='.repeat(60));
        console.log(`Phone: ${chat.phone} | Session: ${chat.sessionId}`);
        console.log(`ApiKey: ${chat.apiKey}`);
        console.log(`Updated: ${chat.updatedAt}`);
        
        const history = chat.webhookHistory || [];
        console.log(`Webhook history entries: ${history.length}`);
        
        if (history.length > 0) {
            // Show all payloads
            history.forEach((h, i) => {
                console.log(`\n  --- Webhook #${i+1} ---`);
                const p = h.payload || {};
                const keys = Object.keys(p);
                keys.forEach(k => {
                    if (!['user_input_data','messages'].includes(k)) {
                        console.log(`    ${k}: ${JSON.stringify(p[k])}`);
                    }
                });
                if (Array.isArray(p.user_input_data)) {
                    console.log(`    user_input_data: ${JSON.stringify(p.user_input_data)}`);
                }
            });
        } else {
            // Show raw payload if stored directly
            if (chat.rawWebhookPayload) {
                const p = chat.rawWebhookPayload;
                const keys = Object.keys(p);
                keys.forEach(k => {
                    if (!['messages'].includes(k)) {
                        console.log(`  ${k}: ${JSON.stringify(p[k])}`);
                    }
                });
            }
        }
        console.log('');
    }

    await mongoose.disconnect();
}
main().catch(console.error);
