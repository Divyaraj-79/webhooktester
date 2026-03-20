const express = require('express');
const router = express.Router();
const { uploadBot, getMyBots } = require('../controllers/botController');
const authMiddleware = require('../middleware/auth');

router.post('/upload', authMiddleware, uploadBot);
router.get('/my-bots', authMiddleware, getMyBots);

module.exports = router;