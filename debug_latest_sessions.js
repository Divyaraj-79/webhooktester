require('dotenv').config();
const mongoose = require('mongoose');
const ChatData = require('./models/ChatData');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Get ALL sessions sorted by ID
    const sessions = await ChatData.find().sort({ _id: -1 }).limit(3);
    for (const session of sessions) {
        console.log(`\n💬 Session: ${session.phone}`);
        console.log(`  currentStep: ${session.currentStep}`);
        console.log(`  lastQuestion: "${session.lastQuestion}"`);
        console.log(`  pendingRuntimePostbackId: "${session.pendingRuntimePostbackId}"`);
        console.log(`  answers:`);
        Object.entries(session.answers || {}).forEach(([k, v]) => {
            console.log(`    "${k.replace(/_DOT_/g, '.')}" = "${v}"`);
        });
        
        console.log(`\n📥 Webhook History (last 3):`);
        const history = (session.webhookHistory || []).slice(-3);
        history.forEach((h, i) => {
            const p = h.payload;
            console.log(`  [${i+1}] time: ${h.receivedAt.toISOString()}`);
            console.log(`       postbackid: "${p.postbackid || p.postBackId || ''}"`);
        });
    }

    await mongoose.disconnect();
}
main().catch(console.error);
