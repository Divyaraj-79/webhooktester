const mongoose = require('mongoose');

const BotSchema = new mongoose.Schema({
    apiKey: String,
    name: { type: String, default: 'My Bot' },
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
    ],
    // Runtime postbackId mappings learned from live webhook calls
    // BizzRiser sends a dynamic postbackId per button per contact,
    // but the same button always sends the same ID for the same contact.
    // We build this mapping progressively across sessions.
    learnedPostbacks: [
        {
            runtimePostbackId: String,   // e.g. '7DQ67zC4dqvRYHV'
            buttonText: String,          // e.g. 'Yes'
            sourceNodeName: String       // e.g. 'Inline Button'
        }
    ]
});

module.exports = mongoose.model('Bot', BotSchema);  