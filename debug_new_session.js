// debug_new_session.js
require('dotenv').config();
const mongoose = require('mongoose');
const ChatData = require('./models/ChatData');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Get the latest session
    const chat = await ChatData.findOne().sort({ _id: -1 });
    if (chat) {
        console.log(`\n💬 Latest Session: ${chat.phone}`);
        console.log(`  currentStep: ${chat.currentStep}`);
        console.log(`  lastQuestion: "${chat.lastQuestion}"`);
        console.log(`  pendingRuntimePostbackId: "${chat.pendingRuntimePostbackId}"`);
        console.log(`  answers:`);
        Object.entries(chat.answers || {}).forEach(([k, v]) => {
            console.log(`    "${k.replace(/_DOT_/g, '.')}" = "${v}"`);
        });
        
        console.log(`\n📥 Webhook History (last 5):`);
        const history = chat.webhookHistory.slice(-5);
        history.forEach((h, i) => {
            const p = h.payload;
            console.log(`  [${i+1}] time: ${h.receivedAt.toISOString()}`);
            console.log(`       postbackid: "${p.postbackid || p.postBackId || ''}"`);
            console.log(`       user_message: "${p.user_message || ''}"`);
            console.log(`       user_input_data: ${JSON.stringify(p.user_input_data || [])}`);
        });
    }

    await mongoose.disconnect();
}
main().catch(console.error);
