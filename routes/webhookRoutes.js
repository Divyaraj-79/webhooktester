const express = require('express');
const router = express.Router();
const { receiveWebhook, getStructured, getEntriesByApiKey } = require('../controllers/webhookController');
const authMiddleware = require('../middleware/auth');

// Webhook reception (PUBLIC)
router.post('/:apiKey', receiveWebhook);

// Data retrieval (PROTECTED)
router.get('/entries/:apiKey', authMiddleware, getEntriesByApiKey);
router.post('/fetch/:apiKey', authMiddleware, getStructured);

module.exports = router;