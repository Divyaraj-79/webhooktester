const express = require('express');
const router = express.Router();
const { uploadBot, getMyBots, deleteBot, getUniversalBot } = require('../controllers/botController');
const authMiddleware = require('../middleware/auth');

router.post('/upload', authMiddleware, uploadBot);
router.get('/my-bots', authMiddleware, getMyBots);
router.get('/universal', authMiddleware, getUniversalBot);
router.delete('/:apiKey', authMiddleware, deleteBot);

module.exports = router;