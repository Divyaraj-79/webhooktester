const User = require('../models/User');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

exports.register = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log("👤 [authController] Register attempt for:", email);

        if (mongoose.connection.readyState !== 1) {
            console.error("❌ [authController] DB not connected!");
            return res.status(500).json({ error: "Database not connected. Please check your MONGO_URI." });
        }
        
        let user = await User.findOne({ email });
        if (user) {
            console.log("⚠️ [authController] User already exists:", email);
            return res.status(400).json({ error: "User already exists" });
        }

        user = await User.create({ email, password });
        console.log("✅ [authController] User created successfully:", email);
        
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, user: { id: user._id, email: user.email } });
    } catch (err) {
        console.error("❌ [authController] Registration error:", err);
        res.status(500).json({ error: "Registration failed: " + err.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log("👤 [authController] Login attempt for:", email);

        if (mongoose.connection.readyState !== 1) {
            console.error("❌ [authController] DB not connected!");
            return res.status(500).json({ error: "Database not connected. Please check your MONGO_URI." });
        }
        
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: "Invalid credentials" });

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, email: user.email } });
    } catch (err) {
        res.status(500).json({ error: "Login failed" });
    }
};

exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: "Fetch profile failed" });
    }
};
