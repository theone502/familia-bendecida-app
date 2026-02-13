const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifyToken, requireAdmin } = require('./auth');

module.exports = (io) => {
  // Public route for login profile selection (no auth needed)
  router.get('/users/public', async (req, res) => {
    try {
      const rows = await db.all("SELECT id, name, role, color, avatar FROM users");
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // All other routes require authentication
  router.use(verifyToken);

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
      if (name || color) {
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

  // REWARDS
  router.get('/rewards', async (req, res) => {
    try {
      const rows = await db.all("SELECT * FROM rewards");
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/rewards', requireAdmin, async (req, res) => {
    const { name, description, icon, category, cost } = req.body;
    try {
      const result = await db.run(
        `INSERT INTO rewards (name, description, icon, category, cost) VALUES (?, ?, ?, ?, ?)`,
        [name, description, icon, category, cost]
      );
      res.json({ id: result.lastID, ...req.body });
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
      res.json(rows);
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

  // NOTES
  router.get('/notes', async (req, res) => {
    try {
      const rows = await db.all("SELECT * FROM notes ORDER BY pinned DESC, id DESC");
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/notes', requireAdmin, async (req, res) => {
    const { title, content, priority, author_id, date, pinned } = req.body;
    try {
      const result = await db.run(
        `INSERT INTO notes (title, content, priority, author_id, date, pinned) VALUES (?, ?, ?, ?, ?, ?)`,
        [title, content, priority, author_id, date, pinned ? 1 : 0]
      );
      io.emit('updateData');
      res.json({ id: result.lastID, ...req.body });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/notes/:id', requireAdmin, async (req, res) => {
    const { title, content, priority, pinned, completed } = req.body;
    try {
      await db.run(
        `UPDATE notes SET title=?, content=?, priority=?, pinned=?, completed=? WHERE id=?`,
        [title, content, priority, pinned ? 1 : 0, completed ? 1 : 0, req.params.id]
      );
      io.emit('updateData');
      res.json({ message: 'Note updated' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/notes/:id', requireAdmin, async (req, res) => {
    try {
      await db.run("DELETE FROM notes WHERE id = ?", [req.params.id]);
      io.emit('updateData');
      res.json({ message: 'Note deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};