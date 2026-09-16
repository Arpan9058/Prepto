const admin = require('firebase-admin');

// async function ensureAuthenticated(req, res, next) {
//     const token = req.headers.authorization?.split('Bearer ')[1] || req.cookies['session_token'];
//     if (!token) return res.redirect('/login');

//     try {
//         const decodedToken = await admin.auth().verifyIdToken(token);
//         req.session.uid = decodedToken.uid;
//         req.session.email = decodedToken.email;
//         next();
//     } catch (error) {
//         console.error('Auth error:', error);
//         return res.redirect('/login');
//     }
// }

async function ensureAuthenticated(req, res, next) {
    const token = req.headers.authorization?.split('Bearer ')[1] || req.cookies['session_token'];
    if (!token) {
        // API requests return 401
        if (req.path.startsWith('/api')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        // normal web page redirect
        return res.redirect('/login');
    }
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        if (req.path.startsWith('/api')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.redirect('/login');
    }
}

module.exports = { ensureAuthenticated };
