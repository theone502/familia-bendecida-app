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
const { sendPushToAll } = require('./pushService');

// Local calendar date as YYYY-MM-DD, based on the server's system timezone.
// toISOString() converts to UTC first, which rolls "today" over to tomorrow
// once local time passes 8pm in UTC-4 — always use this for day comparisons.
function localDateStr(d) {
  d = d || new Date();
  const offsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offsetMs).toISOString().split('T')[0];
}

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
    const { sender_id, message, type, image_url } = data;
    const timestamp = new Date().toISOString();

    try {
      const result = await db.run(`INSERT INTO chat (sender_id, message, timestamp, type, image_url) VALUES (?, ?, ?, ?, ?)`,
        [sender_id, message, timestamp, type, image_url || null]);

      // Fetch sender info to include in the broadcast
      const sender = await db.get(`SELECT name, avatar, color FROM users WHERE id = ?`, [sender_id]);

      const newMessage = {
        id: result.lastID,
        sender_id,
        message,
        timestamp,
        type,
        image_url: image_url || null,
        reactions: {},
        deleted: 0,
        sender_name: sender ? sender.name : 'Unknown',
        sender_avatar: sender ? sender.avatar : '',
        sender_color: sender ? sender.color : '#999'
      };
      io.emit('newMessage', newMessage);

      // Send push notification for chat messages
      const pushBody = image_url ? '📷 Envió una foto' : (message.length > 100 ? message.substring(0, 100) + '...' : message);
      sendPushToAll({
        title: `💬 ${sender ? sender.name : 'Alguien'}`,
        body: pushBody,
        tag: 'chat',
        url: '/'
      }, sender_id);
    } catch (err) {
      console.error("Error saving message:", err);
    }
  });

  socket.on('reactMessage', async ({ messageId, emoji, userId }) => {
    try {
      const row = await db.get(`SELECT reactions FROM chat WHERE id = ?`, [messageId]);
      if (!row) return;
      let reactions = {};
      try { reactions = JSON.parse(row.reactions || '{}'); } catch { reactions = {}; }

      if (!reactions[emoji]) reactions[emoji] = [];
      const idx = reactions[emoji].indexOf(userId);
      if (idx >= 0) {
        reactions[emoji].splice(idx, 1);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else {
        reactions[emoji].push(userId);
      }

      await db.run(`UPDATE chat SET reactions = ? WHERE id = ?`, [JSON.stringify(reactions), messageId]);
      io.emit('messageReacted', { messageId, reactions });
    } catch (err) {
      console.error('Error reacting to message:', err);
    }
  });

  socket.on('deleteMessage', async ({ messageId, userId }) => {
    try {
      const row = await db.get(`SELECT * FROM chat WHERE id = ?`, [messageId]);
      if (!row || row.sender_id !== userId) return;
      await db.run(`UPDATE chat SET message = '', image_url = NULL, deleted = 1 WHERE id = ?`, [messageId]);
      io.emit('messageDeleted', { messageId });
    } catch (err) {
      console.error('Error deleting message:', err);
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

// Reminder scheduler — checks every minute for due reminders, and once a day
// broadcasts birthday + cleaning-turn notifications to every family member.
let lastDailyCheck = null;

setInterval(async () => {
  try {
    const now = new Date();
    const reminders = await db.all(
      `SELECT * FROM reminders WHERE active = 1 AND sent = 0 AND remind_at <= ?`,
      [now.toISOString()]
    );
    for (const r of reminders) {
      sendPushToAll({ title: `⏰ ${r.title}`, body: r.description || 'Recordatorio familiar', tag: 'reminder-' + r.id, url: '/' }, null);
      if (r.repeat === 'monthly') {
        const next = new Date(r.remind_at);
        next.setMonth(next.getMonth() + 1);
        await db.run(`UPDATE reminders SET remind_at = ?, sent = 0 WHERE id = ?`, [next.toISOString(), r.id]);
      } else if (r.repeat === 'weekly') {
        const next = new Date(r.remind_at);
        next.setDate(next.getDate() + 7);
        await db.run(`UPDATE reminders SET remind_at = ?, sent = 0 WHERE id = ?`, [next.toISOString(), r.id]);
      } else if (r.repeat === 'daily') {
        const next = new Date(r.remind_at);
        next.setDate(next.getDate() + 1);
        await db.run(`UPDATE reminders SET remind_at = ?, sent = 0 WHERE id = ?`, [next.toISOString(), r.id]);
      } else {
        await db.run(`UPDATE reminders SET sent = 1 WHERE id = ?`, [r.id]);
      }
    }

    // Daily check for birthdays and today's cleaning turn — runs once per
    // calendar day, on whichever tick first notices the date has changed
    // (including right after a server restart), rather than waiting for a
    // specific hour. That way it's also testable on demand.
    const todayStr = localDateStr(now);
    if (lastDailyCheck !== todayStr) {
      lastDailyCheck = todayStr;

      const todayMonthDay = todayStr.slice(5); // MM-DD
      const users = await db.all(`SELECT * FROM users WHERE birthday IS NOT NULL AND birthday != ''`);
      for (const u of users) {
        if (u.birthday.slice(5) === todayMonthDay) {
          sendPushToAll({
            title: '🎂 ¡Feliz Cumpleaños!',
            body: `Hoy es el cumpleaños de ${u.name}. ¡No olviden felicitarlo y celebrar en familia!`,
            tag: 'birthday-' + u.id + '-' + todayStr,
            url: '/'
          }, null);
        }
      }

      const cleaningToday = await db.all(
        `SELECT * FROM events WHERE date = ? AND type = 'limpieza' AND completed = 0`,
        [todayStr]
      );
      for (const ev of cleaningToday) {
        sendPushToAll({
          title: '🧹 Turno de Limpieza',
          body: `Hoy le toca limpiar a ${ev.assigned_to}. ¡A darle familia!`,
          tag: 'cleaning-' + ev.id + '-' + todayStr,
          url: '/'
        }, null);
      }

      // Cleaning penalty — if yesterday's turn wasn't marked done, apply a $40
      // penalty to that member's debt exactly once, and let everyone know.
      // Gated on "penalized = 0" (not just "completed = 0") so restarting the
      // server on the same day can never re-charge the same missed turn.
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = localDateStr(yesterday);
      const missedCleaning = await db.all(
        `SELECT * FROM events WHERE date = ? AND type = 'limpieza' AND completed = 0 AND penalized = 0`,
        [yesterdayStr]
      );
      for (const ev of missedCleaning) {
        const member = await db.get(`SELECT * FROM users WHERE name = ?`, [ev.assigned_to]);
        await db.run(`UPDATE events SET penalized = 1 WHERE id = ?`, [ev.id]);
        if (!member) continue;
        const newDebt = (member.debt || 0) + 40;
        await db.run(`UPDATE users SET debt = ? WHERE id = ?`, [newDebt, member.id]);
        io.emit('updateData');
        sendPushToAll({
          title: '⚠️ Penalización de Limpieza',
          body: `${member.name} no limpió su turno de ayer. Se aplicó una penalización de $40.`,
          tag: 'penalty-' + ev.id + '-' + yesterdayStr,
          url: '/'
        }, null);
      }
    }
  } catch (e) {
    console.error('Reminder scheduler error:', e);
  }
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});