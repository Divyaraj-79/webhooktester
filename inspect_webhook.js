const mongoose = require('mongoose');
const dotenv = require('dotenv');
const ChatData = require('./models/ChatData');

dotenv.config();

async function inspect() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const session = await ChatData.findOne({ phone: '916353239919' });
        if (!session) {
            console.log("Phone 916353239919 not found");
            process.exit();
        }
        console.log("Session Keys:", Object.keys(session._doc));
        console.log("Answers:", session.answers);
        console.log("History Length:", session.webhookHistory ? session.webhookHistory.length : 'N/A');
        if (session.webhookHistory && session.webhookHistory.length > 0) {
            console.log("Latest Payload:", JSON.stringify(session.webhookHistory[session.webhookHistory.length - 1], null, 2));
        } else {
            // Check recent global payloads if session history is empty
            const recent = await ChatData.find({}).sort({updatedAt: -1}).limit(5);
            console.log("Looking for any recent payload with history...");
            recent.forEach(r => {
                if (r.webhookHistory && r.webhookHistory.length > 0) {
                   console.log(`Found history for phone: ${r.phone}`);
                   console.log(JSON.stringify(r.webhookHistory[r.webhookHistory.length-1], null, 2));
                }
            });
        }
        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
inspect();
