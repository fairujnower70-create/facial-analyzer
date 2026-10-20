const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db'); 

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';


function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}


router.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;
    try {
      
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
        console.error(error);
        res.status(500).json({ error: 'Something went wrong on the server' });
    }
});


router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0]; 

        if (!user || !(await bcrypt.compare(password, user.password))) {
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
        console.error(error);
        res.status(500).json({ error: 'Something went wrong on the server' });
    }
});


module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.requireAdmin = requireAdmin;
module.exports.JWT_SECRET = JWT_SECRET;

