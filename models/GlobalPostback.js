const mongoose = require('mongoose');

const GlobalPostbackSchema = new mongoose.Schema({
    botName: { type: String, required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    runtimePostbackId: { type: String, required: true },
    buttonText: { type: String, required: true },
    sourceNodeName: { type: String, required: true }
}, { timestamps: true });

// Ensure unique mapping per bot name/owner
GlobalPostbackSchema.index({ botName: 1, owner: 1, runtimePostbackId: 1 }, { unique: true });

module.exports = mongoose.model('GlobalPostback', GlobalPostbackSchema);
