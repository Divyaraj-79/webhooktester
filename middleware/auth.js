const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    try {
        const token = req.header('Authorization');
        if (!token) return res.status(401).json({ error: "Access Denied. Login Required." });

        const decoded = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
        req.user = decoded; // Contains { id: userId }
        next();
    } catch (err) {
        res.status(400).json({ error: "Invalid Token" });
    }
};
