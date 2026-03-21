require('dotenv').config();
const mongoose = require('mongoose');
const ChatData = require('./models/ChatData');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    
    const chats = await ChatData.find().sort({ _id: -1 }).limit(10);
    for (const chat of chats) {
        if (chat.webhookHistory && chat.webhookHistory.length > 0) {
            const firstPayload = chat.webhookHistory[0].payload;
            const realPhone = firstPayload.chat_id || firstPayload.wa_id || firstPayload.phone;
            if (realPhone && realPhone !== chat.phone) {
                chat.phone = realPhone;
                if (chat.answers) {
                    chat.answers['WhatsApp Number'] = realPhone;
                }
                await chat.save();
                console.log(`Updated chat ${chat._id} phone to ${realPhone}`);
            }
        }
    }
    
    console.log("Done.");
    await mongoose.disconnect();
}
main();
