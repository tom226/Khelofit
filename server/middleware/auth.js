const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'khelofit-dev-secret-change-me';

function authRequired(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const token = header.slice(7);
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        req.userPhone = decoded.phone;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
}

module.exports = { authRequired };
