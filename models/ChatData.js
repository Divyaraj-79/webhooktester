const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
    sessionId: String,
    apiKey: String,
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    phone: String,
    name: String,
    answers: {
        type: Object,
        default: {}
    },
    messages: [
        {
            answer: String,
            timestamp: Date
        }
    ]
}, { timestamps: true });

module.exports = mongoose.model('ChatData', ChatSchema);