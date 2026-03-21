const mongoose = require('mongoose');

const BotSchema = new mongoose.Schema({
    apiKey: String,
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fields: [
        {
            fieldId: String,
            fieldName: String,
            questionText: String
        }
    ],
    postbacks: [
        {
            postbackId: String,
            buttonText: String,
            sourceNodeName: String
        }
    ]
});

module.exports = mongoose.model('Bot', BotSchema);  