require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const ChatData = require('./models/ChatData');

const botRoutes = require('./routes/botRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const authRoutes = require('./routes/authRoutes');

const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure JWT_SECRET exists
if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'supersecretkey_change_me_in_production';
}

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/webhook', webhookRoutes);

// 👇 ADD THIS TEMP DEBUG ROUTE
// app.post('/api/webhook/:apiKey', async (req, res) => {
//     console.log("🔥 FULL PAYLOAD:", JSON.stringify(req.body, null, 2));
//     res.sendStatus(200);
// });

// Root & Health
app.get('/', (req, res) => {
    res.send('Server running 🚀');
});

app.get('/api/health', (req, res) => {
    const status = {
        server: 'running',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        dbState: mongoose.connection.readyState
    };
    res.json(status);
});

// 👇 ADD HERE
app.get('/clean-chats', async (req, res) => {
    try {
        const chats = await ChatData.find();

        const result = chats.map(chat => ({
            name: chat.name,
            phone: chat.phone,
            ...chat.answers
        }));

        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch chats" });
    }
});

// DB
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        const conn = mongoose.connection;
        console.log(`✅ MongoDB Connected!`);
        console.log(`📂 Database: ${conn.name}`);
        console.log(`🌐 Host: ${conn.host}`);
    })
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});