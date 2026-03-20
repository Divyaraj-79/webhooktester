const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        console.log("❌ [authMiddleware] No token provided");
        return res.status(401).json({ error: "Access denied. No token provided." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        console.log(`🔑 [authMiddleware] User verified: ${decoded.id}`);
        next();
    } catch (err) {
        console.log("❌ [authMiddleware] Invalid token:", err.message);
        res.status(400).json({ error: "Invalid token." });
    }
};

module.exports = authMiddleware;
