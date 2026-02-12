require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const db = require('./database');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api')(io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the root and public directory
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/static', express.static(path.join(__dirname, '..'))); // Just in case

// Routes
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

// Socket.io for Chat & Realtime Updates
io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('sendMessage', async (data) => {
    const { sender_id, message, type } = data;
    const timestamp = new Date().toISOString();

    try {
      const result = await db.run(`INSERT INTO chat (sender_id, message, timestamp, type) VALUES (?, ?, ?, ?)`,
        [sender_id, message, timestamp, type]);

      // Fetch sender info to include in the broadcast
      const sender = await db.get(`SELECT name, avatar, color FROM users WHERE id = ?`, [sender_id]);

      const newMessage = {
        id: result.lastID,
        sender_id,
        message,
        timestamp,
        type,
        sender_name: sender ? sender.name : 'Unknown',
        sender_avatar: sender ? sender.avatar : '',
        sender_color: sender ? sender.color : '#999'
      };
      io.emit('newMessage', newMessage);
    } catch (err) {
      console.error("Error saving message:", err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Fallback for SPA - Serve index.html from public
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'public', 'index.html'));
});

// Serve login and register pages
app.get('/login.html', (req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'public', 'login.html'));
});

app.get('/register.html', (req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'public', 'register.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});