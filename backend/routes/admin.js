const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('./auth');

// এডমিন ড্যাশবোর্ডের জন্য সব স্ট্যাটাস তুলে আনার রুট
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const totalUsers = await db.query('SELECT COUNT(*) as count FROM users');
        const totalScans = await db.query('SELECT COUNT(*) as count FROM scans');
        
        res.json({
            users: parseInt(totalUsers.rows[0].count),
            scans: parseInt(totalScans.rows[0].count)
        });
    } catch (error) {
        console.error("Admin Stats Error: ", error);
        res.status(500).json({ error: 'Failed to fetch admin stats' });
    }
});

module.exports = router;

