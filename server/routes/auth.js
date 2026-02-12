const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database'); // This now has .get (async) and raw .db

const SECRET_KEY = process.env.JWT_SECRET || 'familia_bendecida_default_secret_key_change_me';

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await db.get(`SELECT * FROM users WHERE email = ?`, [email]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const passwordIsValid = bcrypt.compareSync(password, user.password);
    if (!passwordIsValid) return res.status(401).json({ error: 'Invalid password' });

    const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: 86400 }); // 24 hours

    // Don't send password hash to client
    const { password: _, ...safeUser } = user;
    res.status(200).json({ auth: true, token: token, user: safeUser });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Register
router.post('/register', async (req, res) => {
  const { name, email, password, role, color } = req.body;

  const hashedPassword = bcrypt.hashSync(password, 8);
  const avatarName = name.replace(/\s+/g, '+');
  const avatarColor = color ? color.replace('#', '') : '10B981';
  const avatar = `https://ui-avatars.com/api/?name=${avatarName}&background=${avatarColor}&color=fff&bold=true&size=400`;

  try {
    const result = await db.run(
      `INSERT INTO users (name, email, password, role, color, avatar) VALUES (?, ?, ?, ?, ?, ?)`,
      [name, email, hashedPassword, role, color || '#10B981', avatar]
    );

    const token = jwt.sign({ id: result.lastID }, SECRET_KEY, { expiresIn: 86400 });

    const newUser = {
      id: result.lastID,
      name,
      email,
      role,
      color: color || '#10B981',
      avatar,
      points: 0,
      tasks_completed: 0,
      streak: 0
    };
    res.status(200).json({ auth: true, token: token, user: newUser });
  } catch (err) {
    res.status(500).json({ error: 'There was a problem registering the user.' });
  }
});

module.exports = router;