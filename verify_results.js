require('dotenv').config();
const mongoose = require('mongoose');
const ChatData = require('./models/ChatData');

async function verify() {
    await mongoose.connect(process.env.MONGO_URI);
    const sessions = await ChatData.find({ phone: { $in: ["911111111111", "922222222222"] } });
    
    sessions.forEach(s => {
        console.log(`=== Session: ${s.phone} (${s.name || 'User'}) ===`);
        console.log(`Last Question: ${s.lastQuestion}`);
        console.log(`Answers:`, s.answers);
        console.log('------------------');
    });
    process.exit();
}
verify();
