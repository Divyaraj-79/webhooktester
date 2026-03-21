const mongoose = require('mongoose');
require('dotenv').config();
const ChatData = require('./models/ChatData');
const Bot = require('./models/Bot');
const webhookController = require('./controllers/webhookController');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    // Use the latest bot that has history
    const botApiKey = '2b90b2655be6a1a44f6ec0784c6cdc82';
    const bot = await Bot.findOne({ apiKey: botApiKey });
    console.log('Bot postbacks (Inline Button):', JSON.stringify(
        (bot.postbacks || []).filter(p => p.sourceNodeName === 'Inline Button'), null, 2
    ));
    console.log('Existing learnedPostbacks:', JSON.stringify(bot.learnedPostbacks, null, 2));

    // Re-play the exact button click calls from webhookHistory (call 2 and call 5)
    const entry = await ChatData.findOne({ apiKey: botApiKey });
    const buttonCalls = (entry.webhookHistory || []).filter(h => {
        const p = h.payload;
        const postbackid = (p.postbackid || '').trim();
        const hasEmptyUserInputData = Array.isArray(p.user_input_data) && p.user_input_data.length === 0;
        const hasNoUserMessage = !p.user_message;
        return postbackid.length > 0 && hasEmptyUserInputData && hasNoUserMessage;
    });
    console.log('\\nButton click calls identified from history:', buttonCalls.length);
    buttonCalls.forEach((h,i) => console.log(`  Call ${i+1}: postbackid="${h.payload.postbackid}"`));

    // Simulate replay of those calls to see mapping
    for (const h of buttonCalls) {
        const req = {
            params: { apiKey: botApiKey },
            body: h.payload
        };
        const res = {
            sendStatus: (s) => console.log(`Webhook response: ${s}`),
            status: (s) => ({ json: (d) => console.log('Error:', d) })
        };
        await webhookController.receiveWebhook(req, res);
    }

    // Check what learnedPostbacks now looks like
    const updatedBot = await Bot.findOne({ apiKey: botApiKey });
    console.log('\\nLearnedPostbacks after simulation:', JSON.stringify(updatedBot.learnedPostbacks, null, 2));

    // Check updated answers
    const updatedEntry = await ChatData.findOne({ apiKey: botApiKey });
    console.log('\\nUpdated answers:', JSON.stringify(updatedEntry.answers, null, 2));

    process.exit();
});
