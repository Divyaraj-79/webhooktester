const express = require('express');
const router = express.Router();
const { receiveWebhook, getStructured, getEntriesByApiKey, deleteEntry } = require('../controllers/webhookController');
const authMiddleware = require('../middleware/auth');

// Webhook reception (PUBLIC)
router.post('/:apiKey', receiveWebhook);

// Data retrieval (PROTECTED)
router.get('/entries/:apiKey', authMiddleware, getEntriesByApiKey);
router.post('/fetch/:apiKey', authMiddleware, getStructured);
router.delete('/entry/:entryId', authMiddleware, deleteEntry);

module.exports = router;