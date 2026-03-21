const mongoose = require('mongoose');
require('dotenv').config();
const botController = require('./controllers/botController');
const Bot = require('./models/Bot');
const ChatData = require('./models/ChatData');

const sampleJson = {
    "nodes": {
        "5": { "name": "Interactive", "data": { "textMessage": "Hi" } },
        "6": { "name": "Inline Button", "data": { "postbackId": "69be2d1a2c76d", "buttonText": "Yes " } },
        "7": { "name": "Inline Button", "data": { "postbackId": "69be2d1a2c780", "buttonText": "Just exploring" } }
    }
};

async function test() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");

    const reqMock = {
        body: sampleJson,
        user: { id: "69bda3fcb6e1de20a1be743c" } // Any user id
    };
    
    let uploadedApiKey = null;
    const resMock = {
        json: (data) => { console.log('Upload Response:', data); uploadedApiKey = data.apiKey; },
        status: (code) => { console.log('Status', code); return { json: console.log }; }
    };

    console.log("Uploading simulated Bot...");
    await botController.uploadBot(reqMock, resMock);

    console.log("Uploaded API Key:", uploadedApiKey);
    const savedBot = await Bot.findOne({ apiKey: uploadedApiKey });
    console.log("Postbacks strictly extracted:", savedBot.postbacks);

    console.log("Simulating webhook data arrival...");
    const webhookController = require('./controllers/webhookController');
    const reqWebhook = {
        params: { apiKey: uploadedApiKey },
        body: { postbackid: "69be2d1a2c76d", first_name: "Tester" }
    };
    const resWebhook = { sendStatus: (s) => console.log('Webhook Response:', s), status: (s) => ({ json: console.log }) };
    await webhookController.receiveWebhook(reqWebhook, resWebhook);

    console.log("Fetching simulated entries...");
    const reqGet = {
        params: { apiKey: uploadedApiKey },
        user: { id: "69bda3fcb6e1de20a1be743c" }
    };
    const resGet = {
        json: (data) => console.log('Fetched structure:', JSON.stringify(data.entries, null, 2)),
        status: (s) => ({ json: console.log })
    };
    await webhookController.getEntriesByApiKey(reqGet, resGet);

    console.log("Cleaning up test data...");
    await Bot.deleteOne({ apiKey: uploadedApiKey });
    await ChatData.deleteMany({ apiKey: uploadedApiKey });

    process.exit();
}

test();
