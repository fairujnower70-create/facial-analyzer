const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('./auth');

// স্ক্যান হিস্ট্রি ডাটাবেজে সেভ করার রুট
router.post('/', requireAuth, async (req, res) => {
    const { age, gender, expression, face_shape, symmetry_score, beauty_score } = req.body;
    const userId = req.user.id;

    try {
        await db.query(
            `INSERT INTO scans (user_id, age, gender, expression, face_shape, symmetry_score, beauty_score) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [userId, age, gender, expression, face_shape, symmetry_score, beauty_score]
        );
        res.status(201).json({ message: 'Scan history saved successfully' });
    } catch (error) {
        console.error("Scan Save Error: ", error);
        res.status(500).json({ error: 'Failed to save scan history' });
    }
});

// ইউজার ড্যাশবোর্ডের জন্য স্ক্যান হিস্ট্রি তুলে আনার রুট
router.get('/', requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await db.query('SELECT * FROM scans WHERE user_id = \$1 ORDER BY created_at DESC', [userId]);
        res.json(result.rows);
    } catch (error) {
        console.error("Fetch Scans Error: ", error);
        res.status(500).json({ error: 'Failed to fetch scan history' });
    }
});

module.exports = router;

