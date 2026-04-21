import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool } from '../../shared/db.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-me';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: JWT_SECRET must be set in production');
}

// Simple registration (should be restricted in production)
router.post('/register', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  try {
    // Check if any users exist
    const countRes = await pool.query('SELECT COUNT(*) FROM users');
    const userCount = parseInt(countRes.rows[0].count);
    
    if (userCount > 0) {
      return res.status(400).json({ error: 'Setup already completed' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    // We use 'admin' as the hardcoded username for the single user
    await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2)',
      ['admin', hashedPassword]
    );
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/setup-status', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM users');
    const count = parseInt(result.rows[0].count);
    res.json({ needsSetup: count === 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  const { password } = req.body;
  
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', ['admin']);
    const user = result.rows[0];

    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ token });
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
