const mongoose = require('mongoose');
require('dotenv').config();
const Bot = require('./models/Bot');
const ChatData = require('./models/ChatData');
const botController = require('./controllers/botController');

async function testDelete() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    const testApiKey = 'test-delete-api-key-' + Date.now();
    const testOwner = new mongoose.Types.ObjectId();

    // 1. Create a dummy bot
    const bot = await Bot.create({
        apiKey: testApiKey,
        owner: testOwner,
        fields: [{ fieldId: 'test', fieldName: 'Test', questionText: 'Test?' }]
    });
    console.log('Created test bot:', bot.apiKey);

    // 2. Create some dummy ChatData
    await ChatData.create({
        apiKey: testApiKey,
        owner: testOwner,
        sessionId: 'test-session',
        answers: { 'test': 'answer' }
    });
    console.log('Created test chat data');

    // 3. Delete the bot using the controller
    const req = {
        params: { apiKey: testApiKey },
        user: { id: testOwner.toString() }
    };
    const res = {
        json: (data) => console.log('Response:', data),
        status: (code) => ({ json: (data) => console.log('Error', code, data) })
    };

    await botController.deleteBot(req, res);

    // 4. Verify deletion
    const botExists = await Bot.findOne({ apiKey: testApiKey });
    const chatExists = await ChatData.findOne({ apiKey: testApiKey });

    if (!botExists && !chatExists) {
        console.log('✅ SUCCESS: Bot and ChatData deleted successfully');
    } else {
        console.log('❌ FAILURE: Bot or ChatData still exists');
        if (botExists) console.log('Bot still exists');
        if (chatExists) console.log('ChatData still exists');
    }

    process.exit();
}

testDelete();
