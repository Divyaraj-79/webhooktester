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
    rawWebhookPayload: {
        type: Object,
        default: {}
    },
    webhookHistory: [
        {
            payload: Object,
            receivedAt: { type: Date, default: Date.now }
        }
    ],
    messages: [
        {
            answer: String,
            timestamp: Date
        }
    ],
    currentStep: { type: Number, default: 0 },  // tracks position in bot question sequence
    lastQuestion: { type: String, default: '' },  // last question that was answered (for retroactive resolution)
    pendingRuntimePostbackId: { type: String, default: '' } // runtime ID of last unresolved button click
}, { timestamps: true });

module.exports = mongoose.model('ChatData', ChatSchema);