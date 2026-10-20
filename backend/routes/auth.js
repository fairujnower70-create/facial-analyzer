const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db'); 
const { JWT_SECRET } = require('../middleware/auth'); // মিডলওয়্যার থেকে সিক্রেট আনা

// --- সাইনআপ (Signup) রুট ---
router.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const userExists = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const allUsers = await db.query('SELECT id FROM users LIMIT 1');
        const role = allUsers.rows.length === 0 ? 'admin' : 'user';

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.query(
            'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
            [name, email, hashedPassword, role]
        );

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error("Signup Error: ", error);
        res.status(500).json({ error: 'Something went wrong on the server' });
    }
});

// --- লগইন (Login) রুট ---
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }
        
        const user = result.rows[0];

        if (!(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
        
        res.cookie('token', token, {
            httpOnly: true,
            secure: true, 
            sameSite: 'none',
            maxAge: 24 * 60 * 60 * 1000 
        });

        res.json({ message: 'Login successful', user: { name: user.name, email: user.email, role: user.role } });
    } catch (error) {
        console.error("Login Error: ", error);
        res.status(500).json({ error: 'Something went wrong on the server' });
    }
});

module.exports = router;


