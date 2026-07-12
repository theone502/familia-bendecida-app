const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const db = require('../database');
const { verifyToken, requireAdmin } = require('./auth');
const { sendPushToAll } = require('../pushService');

// Multer config for profile picture uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', '..', 'public', 'uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'avatar-' + req.params.id + '-' + Date.now() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
    const allowedMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowedExt.includes(ext) || allowedMime.includes(file.mimetype));
  }
});

// Multer config for logo uploads
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', '..', 'public', 'uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'logo-' + Date.now() + ext);
  }
});
const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  }
});

// Multer config for chat image uploads
const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', '..', 'public', 'uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'chat-' + Date.now() + '-' + Math.round(Math.random() * 1000) + ext);
  }
});
const chatUpload = multer({
  storage: chatStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

module.exports = (io) => {
  // Public route for login profile selection (no auth needed)
  router.get('/users/public', async (req, res) => {
    try {
      const rows = await db.all("SELECT id, name, role, color, avatar, email FROM users");
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public route — app logo (needed on the splash/login screen, before auth)
  router.get('/settings/logo', async (req, res) => {
    try {
      const row = await db.get("SELECT value FROM app_settings WHERE key = 'logo_url'");
      res.json({ logo_url: row ? row.value : null });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/settings/logo', verifyToken, requireAdmin, logoUpload.single('logo'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const logoUrl = '/uploads/' + req.file.filename;
      await db.run(
        `INSERT INTO app_settings (key, value) VALUES ('logo_url', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [logoUrl]
      );
      io.emit('logoUpdated', { logo_url: logoUrl });
      res.json({ logo_url: logoUrl });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/settings/logo', verifyToken, requireAdmin, async (req, res) => {
    try {
      await db.run("DELETE FROM app_settings WHERE key = 'logo_url'");
      io.emit('logoUpdated', { logo_url: null });
      res.json({ message: 'Logo reset to default' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUSH NOTIFICATION ROUTES
  router.get('/push/vapid-key', verifyToken, (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
  });

  router.post('/push/subscribe', verifyToken, async (req, res) => {
    const { subscription, userId } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    try {
      await db.run(
        `INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)`,
        [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, new Date().toISOString()]
      );
      res.json({ message: 'Subscribed' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/push/test', verifyToken, requireAdmin, async (req, res) => {
    try {
      const subCount = await db.get('SELECT COUNT(*) as count FROM push_subscriptions');
      await sendPushToAll({
        title: '🔔 Notificación de prueba',
        body: '¡Si ves esto, las notificaciones están funcionando correctamente!',
        tag: 'test-' + Date.now(),
        url: '/'
      }, null);
      res.json({ message: 'Test notification sent', subscriberCount: subCount.count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Chat image upload (requires auth)
  router.post('/chat/upload-image', verifyToken, chatUpload.single('image'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const imageUrl = '/uploads/' + req.file.filename;
      res.json({ imageUrl });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // All other routes require authentication
  router.use(verifyToken);

  // Cleaning penalty - any authenticated user can trigger this
  router.post('/users/:id/penalty', async (req, res) => {
    const { amount, reason } = req.body;
    const id = req.params.id;
    try {
      const user = await db.get("SELECT * FROM users WHERE id = ?", [id]);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const newDebt = (user.debt || 0) + (amount || 40);
      await db.run("UPDATE users SET debt = ? WHERE id = ?", [newDebt, id]);
      io.emit('updateData');
      res.json({ message: 'Penalty applied', debt: newDebt });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // USERS (full data, requires auth)
  router.get('/users', async (req, res) => {
    try {
      const rows = await db.all("SELECT id, name, role, color, avatar, points, tasks_completed, streak, email, birthday, job, debt, is_admin FROM users");
      const mapped = rows.map(r => ({
        ...r,
        tasksCompleted: r.tasks_completed,
        // Keep snake_case too for compatibility if needed, but primary is camelCase
      }));
      res.json(mapped);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/users/:id', requireAdmin, async (req, res) => {
    const { name, role, color, email, points, tasks_completed, streak, birthday, job, debt } = req.body;
    const id = req.params.id;

    try {
      const user = await db.get("SELECT * FROM users WHERE id = ?", [id]);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const newName = name || user.name;
      const newRole = role || user.role;
      const newColor = color || user.color;
      const newEmail = email !== undefined ? email : user.email;
      const newPoints = points !== undefined ? points : user.points;
      const newTasks = tasks_completed !== undefined ? tasks_completed : user.tasks_completed;
      const newStreak = streak !== undefined ? streak : user.streak;
      const newBirthday = birthday !== undefined ? birthday : user.birthday;
      const newJob = job !== undefined ? job : user.job;
      const newDebt = debt !== undefined ? debt : user.debt;

      let newAvatar = user.avatar;
      // Only regenerate avatar URL if user doesn't have a custom uploaded photo
      const hasCustomPhoto = user.avatar && user.avatar.startsWith('/uploads/');
      if ((name || color) && !hasCustomPhoto) {
        const avatarName = newName.replace(/\s+/g, '+');
        const avatarColor = newColor.replace('#', '');
        newAvatar = `https://ui-avatars.com/api/?name=${avatarName}&background=${avatarColor}&color=fff&bold=true&size=400`;
      }

      await db.run(
        `UPDATE users SET name=?, role=?, color=?, email=?, points=?, tasks_completed=?, streak=?, avatar=?, birthday=?, job=?, debt=? WHERE id=?`,
        [newName, newRole, newColor, newEmail, newPoints, newTasks, newStreak, newAvatar, newBirthday, newJob, newDebt, id]
      );

      io.emit('updateData'); // Notify clients
      res.json({ message: 'User updated' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Profile picture upload
  router.post('/users/:id/avatar', verifyToken, requireAdmin, upload.single('avatar'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const avatarUrl = '/uploads/' + req.file.filename;
      await db.run('UPDATE users SET avatar = ? WHERE id = ?', [avatarUrl, req.params.id]);
      io.emit('updateData');
      res.json({ avatar: avatarUrl });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/users/:id', requireAdmin, async (req, res) => {
    try {
      await db.run("DELETE FROM users WHERE id = ?", [req.params.id]);
      io.emit('updateData');
      res.json({ message: 'User deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // SHOPPING LIST
  router.get('/shopping', async (req, res) => {
    try {
      const rows = await db.all("SELECT * FROM shopping_list ORDER BY created_at DESC");
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/shopping', requireAdmin, async (req, res) => {
    const { item, added_by } = req.body;
    const created_at = new Date().toISOString();
    try {
      const result = await db.run("INSERT INTO shopping_list (item, added_by, created_at) VALUES (?, ?, ?)", [item, added_by, created_at]);
      const newItem = { id: result.lastID, item, added_by, created_at };
      io.emit('shoppingUpdated', { type: 'add', item: newItem });
      res.json(newItem);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/shopping/:id', requireAdmin, async (req, res) => {
    try {
      await db.run("DELETE FROM shopping_list WHERE id = ?", [req.params.id]);
      io.emit('shoppingUpdated', { type: 'delete', id: req.params.id });
      res.json({ message: 'Deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // TASKS
  router.get('/tasks', async (req, res) => {
    try {
      const tasks = await db.all("SELECT * FROM tasks");
      const tasksWithAssignments = await Promise.all(tasks.map(async (task) => {
        const rows = await db.all("SELECT u.name FROM task_assignments ta JOIN users u ON ta.user_id = u.id WHERE ta.task_id = ?", [task.id]);
        task.assignedTo = rows.map(r => r.name).join(', ');
        task.dueDate = task.due_date;
        task.completed = !!task.completed;
        return task;
      }));
      res.json(tasksWithAssignments);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/tasks', requireAdmin, async (req, res) => {
    const { title, description, category, priority, due_date, points, assignedTo } = req.body;
    const created_at = new Date().toISOString();

    try {
      const result = await db.run(
        `INSERT INTO tasks (title, description, category, priority, due_date, points, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        [title, description, category, priority, due_date, points, created_at]
      );
      const taskId = result.lastID;

      if (assignedTo && assignedTo.length > 0) {
        const placeholders = assignedTo.map(() => '(?, ?)').join(',');
        const values = [];
        assignedTo.forEach(userId => { values.push(taskId, userId); });
        await db.run(`INSERT INTO task_assignments (task_id, user_id) VALUES ${placeholders}`, values);
      }

      const newTask = { id: taskId, ...req.body, completed: false, created_at };
      io.emit('tasksUpdated', { type: 'add', task: newTask });
      res.json(newTask);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/tasks/:id', requireAdmin, async (req, res) => {
    const { title, description, category, priority, due_date, points, completed, assignedTo } = req.body;
    const id = req.params.id;

    try {
      await db.run(
        `UPDATE tasks SET title=?, description=?, category=?, priority=?, due_date=?, points=?, completed=? WHERE id=?`,
        [title, description, category, priority, due_date, points, completed ? 1 : 0, id]
      );

      // Update assignments
      await db.run("DELETE FROM task_assignments WHERE task_id = ?", [id]);
      if (assignedTo && assignedTo.length > 0) {
        const placeholders = assignedTo.map(() => '(?, ?)').join(',');
        const values = [];
        assignedTo.forEach(userId => { values.push(id, userId); });
        await db.run(`INSERT INTO task_assignments (task_id, user_id) VALUES ${placeholders}`, values);
      }

      io.emit('tasksUpdated', { type: 'update', id });
      res.json({ message: 'Task updated' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/tasks/:id', requireAdmin, async (req, res) => {
    try {
      await db.run("DELETE FROM tasks WHERE id = ?", [req.params.id]);
      io.emit('tasksUpdated', { type: 'delete', id: req.params.id });
      res.json({ message: 'Task deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GOALS
  router.get('/goals', async (req, res) => {
    try {
      const rows = await db.all("SELECT * FROM goals");
      rows.forEach(r => r.completed = !!r.completed);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/goals', requireAdmin, async (req, res) => {
    const { title, description, category, target, current, due_date, points } = req.body;
    try {
      const result = await db.run(
        `INSERT INTO goals (title, description, category, target, current, due_date, points) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [title, description, category, target, current, due_date, points]
      );
      res.json({ id: result.lastID, ...req.body });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/goals/:id', requireAdmin, async (req, res) => {
    const { title, description, category, target, current, due_date, points, completed } = req.body;
    try {
      await db.run(
        `UPDATE goals SET title=?, description=?, category=?, target=?, current=?, due_date=?, points=?, completed=? WHERE id=?`,
        [title, description, category, target, current, due_date, points, completed ? 1 : 0, req.params.id]
      );
      res.json({ message: 'Goal updated' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // BUDGET
  router.get('/budget', async (req, res) => {
    try {
      const categories = await db.all("SELECT * FROM budget_categories");
      const total = categories.reduce((sum, cat) => sum + cat.budget, 0);
      const monthlyGoal = categories.find(c => c.name === 'Ahorros')?.budget || 500;
      res.json({ total, categories, monthlyGoal });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/expenses', requireAdmin, async (req, res) => {
    const { description, category, amount, date, notes } = req.body;
    try {
      await db.run(`UPDATE budget_categories SET spent = spent + ? WHERE name = ?`, [amount, category]);
      await db.run(`INSERT INTO expenses (description, category_name, amount, date, notes) VALUES (?, ?, ?, ?, ?)`,
        [description, category, amount, date, notes]);
      res.json({ message: 'Expense added' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // MEALS
  router.get('/meals', async (req, res) => {
    try {
      const rows = await db.all("SELECT * FROM meals");
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/meals/update', requireAdmin, async (req, res) => {
    const meals = req.body;
    try {
      // For bulk update, we might still use serialize/prepare for efficiency, 
      // but let's stick to async calls or just wrap the whole thing.
      // Since dbAsync doesn't expose 'prepare', we can use the raw db object or loop.
      // Looping is fine for small datasets (7 days).
      await db.run("DELETE FROM meals");
      for (const meal of meals) {
        await db.run("INSERT INTO meals (id, day, breakfast, lunch, dinner, notes) VALUES (?, ?, ?, ?, ?, ?)",
          [meal.id, meal.day, meal.breakfast, meal.lunch, meal.dinner, meal.notes]);
      }
      res.json({ message: 'Meals updated' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // CHAT
  router.get('/chat', async (req, res) => {
    try {
      const rows = await db.all(`
        SELECT chat.*, users.name as sender_name, users.avatar as sender_avatar, users.color as sender_color
        FROM chat
        LEFT JOIN users ON chat.sender_id = users.id
        ORDER BY chat.timestamp ASC
      `);
      rows.forEach(r => {
        try { r.reactions = JSON.parse(r.reactions || '{}'); } catch { r.reactions = {}; }
      });
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Read receipts — last message id each user has seen
  router.get('/chat/reads', async (req, res) => {
    try {
      const rows = await db.all("SELECT * FROM chat_reads");
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/chat/reads', async (req, res) => {
    const { last_read_id } = req.body;
    try {
      await db.run(
        `INSERT INTO chat_reads (user_id, last_read_id) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET last_read_id = excluded.last_read_id`,
        [req.user.id, last_read_id]
      );
      io.emit('readReceiptUpdated', { userId: req.user.id, lastReadId: last_read_id });
      res.json({ message: 'Read receipt updated' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ACTIVITIES
  router.get('/activities', async (req, res) => {
    try {
      const rows = await db.all("SELECT * FROM activities ORDER BY id DESC LIMIT 50");
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/activities', requireAdmin, async (req, res) => {
    const { type, memberId, text, points, time } = req.body;
    try {
      const result = await db.run(`INSERT INTO activities (type, member_id, text, points, time) VALUES (?, ?, ?, ?, ?)`,
        [type, memberId, text, points, time]);
      const newActivity = { id: result.lastID, ...req.body };
      io.emit('activityUpdated', newActivity);
      res.json(newActivity);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // EVENTS
  router.get('/events', async (req, res) => {
    try {
      const rows = await db.all("SELECT * FROM events");
      const mapped = rows.map(r => ({
        ...r,
        assignedTo: r.assigned_to,
        completed: !!r.completed
      }));
      res.json(mapped);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/events', requireAdmin, async (req, res) => {
    const { title, date, type, assignedTo, points } = req.body;
    try {
      const result = await db.run(
        `INSERT INTO events (title, date, type, assigned_to, points, completed) VALUES (?, ?, ?, ?, ?, 0)`,
        [title, date, type || 'general', assignedTo, points || 0]
      );
      io.emit('updateData');
      res.json({ id: result.lastID, ...req.body });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/events/:id', requireAdmin, async (req, res) => {
    const { title, date, assignedTo, completed } = req.body;
    try {
      await db.run(
        `UPDATE events SET title=?, date=?, assigned_to=?, completed=? WHERE id=?`,
        [title, date, assignedTo, completed ? 1 : 0, req.params.id]
      );

      if (completed) {
        io.emit('cleaningDone', { member: assignedTo });
      }

      io.emit('updateData');
      res.json({ message: 'Event updated' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/events/:id', requireAdmin, async (req, res) => {
    try {
      await db.run("DELETE FROM events WHERE id = ?", [req.params.id]);
      io.emit('updateData');
      res.json({ message: 'Event deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POLLS
  router.get('/polls', async (req, res) => {
    try {
      const polls = await db.all("SELECT * FROM polls ORDER BY created_at DESC");
      for (const poll of polls) {
        poll.options = JSON.parse(poll.options);
        const votes = await db.all("SELECT option_index, COUNT(*) as count FROM poll_votes WHERE poll_id = ? GROUP BY option_index", [poll.id]);
        poll.votes = poll.options.map((_, i) => (votes.find(v => v.option_index === i) || { count: 0 }).count);
        const userVote = await db.get("SELECT option_index FROM poll_votes WHERE poll_id = ? AND user_id = ?", [poll.id, req.user.id]);
        poll.userVote = userVote ? userVote.option_index : null;
      }
      res.json(polls);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/polls', requireAdmin, async (req, res) => {
    const { question, options, expires_at } = req.body;
    try {
      const result = await db.run(
        `INSERT INTO polls (question, options, created_by, created_at, expires_at, active) VALUES (?, ?, ?, ?, ?, 1)`,
        [question, JSON.stringify(options), req.user.id, new Date().toISOString(), expires_at || null]
      );
      io.emit('updateData');
      res.json({ id: result.lastID, question, options, votes: options.map(() => 0) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/polls/:id', requireAdmin, async (req, res) => {
    const { question, options, expires_at } = req.body;
    const pollId = req.params.id;
    try {
      await db.run(
        `UPDATE polls SET question=?, options=?, expires_at=? WHERE id=?`,
        [question, JSON.stringify(options), expires_at || null, pollId]
      );
      // Options changed shape, so old votes no longer map cleanly — reset them.
      await db.run("DELETE FROM poll_votes WHERE poll_id = ?", [pollId]);
      io.emit('updateData');
      res.json({ message: 'Poll updated' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/polls/:id/vote', async (req, res) => {
    const { option_index } = req.body;
    const pollId = req.params.id;
    try {
      await db.run(
        `INSERT OR REPLACE INTO poll_votes (poll_id, user_id, option_index) VALUES (?, ?, ?)`,
        [pollId, req.user.id, option_index]
      );
      io.emit('pollUpdated', { pollId });
      res.json({ message: 'Vote registered' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/polls/:id', requireAdmin, async (req, res) => {
    try {
      await db.run("DELETE FROM polls WHERE id = ?", [req.params.id]);
      io.emit('updateData');
      res.json({ message: 'Poll deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GALLERY (Photos)
  const photoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '..', '..', 'public', 'uploads')),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, 'photo-' + Date.now() + '-' + Math.round(Math.random() * 1000) + ext);
    }
  });
  const photoUpload = multer({
    storage: photoStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
    }
  });

  router.get('/photos', async (req, res) => {
    try {
      const rows = await db.all(`
        SELECT photos.*, users.name as uploader_name, users.color as uploader_color
        FROM photos LEFT JOIN users ON photos.uploaded_by = users.id
        ORDER BY photos.created_at DESC
      `);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/photos', photoUpload.single('photo'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const url = '/uploads/' + req.file.filename;
      const { caption } = req.body;
      const result = await db.run(
        `INSERT INTO photos (url, caption, uploaded_by, created_at) VALUES (?, ?, ?, ?)`,
        [url, caption || '', req.user.id, new Date().toISOString()]
      );
      const newPhoto = { id: result.lastID, url, caption, uploaded_by: req.user.id, created_at: new Date().toISOString() };
      io.emit('photoAdded', newPhoto);
      res.json(newPhoto);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/photos/:id', async (req, res) => {
    try {
      const photo = await db.get("SELECT * FROM photos WHERE id = ?", [req.params.id]);
      if (!photo) return res.status(404).json({ error: 'Not found' });
      if (photo.uploaded_by !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Forbidden' });
      await db.run("DELETE FROM photos WHERE id = ?", [req.params.id]);
      io.emit('updateData');
      res.json({ message: 'Photo deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // REMINDERS
  router.get('/reminders', async (req, res) => {
    try {
      const rows = await db.all("SELECT * FROM reminders WHERE active = 1 ORDER BY remind_at ASC");
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/reminders', requireAdmin, async (req, res) => {
    const { title, description, remind_at, repeat } = req.body;
    try {
      const result = await db.run(
        `INSERT INTO reminders (title, description, remind_at, repeat, created_by, active, sent) VALUES (?, ?, ?, ?, ?, 1, 0)`,
        [title, description, remind_at, repeat || 'none', req.user.id]
      );
      io.emit('updateData');
      res.json({ id: result.lastID, title, description, remind_at, repeat, active: 1 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/reminders/:id', requireAdmin, async (req, res) => {
    const { title, description, remind_at, repeat, active } = req.body;
    try {
      await db.run(
        `UPDATE reminders SET title=?, description=?, remind_at=?, repeat=?, active=?, sent=0 WHERE id=?`,
        [title, description, remind_at, repeat, active ? 1 : 0, req.params.id]
      );
      io.emit('updateData');
      res.json({ message: 'Reminder updated' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/reminders/:id', requireAdmin, async (req, res) => {
    try {
      await db.run("DELETE FROM reminders WHERE id = ?", [req.params.id]);
      io.emit('updateData');
      res.json({ message: 'Reminder deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};