const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database ' + dbPath + ': ' + err.message);
  } else {
    console.log('Connected to the SQLite database.');
    initDb();
  }
});

// Promise wrappers
const dbAsync = {
  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
};

function initDb() {
  db.serialize(() => {
    // Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT,
      color TEXT,
      avatar TEXT,
      points INTEGER DEFAULT 0,
      tasks_completed INTEGER DEFAULT 0,
      streak INTEGER DEFAULT 0,
      birthday TEXT,
      job TEXT,
      debt INTEGER DEFAULT 0
    )`, (err) => {
      if (!err) {
        // Migrations - check if columns exist before adding or just try (sqlite ignores if exists usually but ADD COLUMN fails if exists)
        // A simple way for migrations in dev is try/catch logic or checking Pragma, but here we just suppress errors
        db.run("ALTER TABLE users ADD COLUMN birthday TEXT", () => { });
        db.run("ALTER TABLE users ADD COLUMN job TEXT", () => { });
        db.run("ALTER TABLE users ADD COLUMN debt INTEGER DEFAULT 0", () => { });
        db.run("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0", () => { });
      }
    });

    // Shopping List Table
    db.run(`CREATE TABLE IF NOT EXISTS shopping_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item TEXT NOT NULL,
      added_by INTEGER,
      completed BOOLEAN DEFAULT 0,
      created_at TEXT
    )`);

    // Tasks Table
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      priority TEXT,
      due_date TEXT,
      points INTEGER,
      completed BOOLEAN DEFAULT 0,
      created_at TEXT
    )`);

    // Task Assignments Table (Many-to-Many)
    db.run(`CREATE TABLE IF NOT EXISTS task_assignments (
      task_id INTEGER,
      user_id INTEGER,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Goals Table
    db.run(`CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      target INTEGER,
      current INTEGER DEFAULT 0,
      due_date TEXT,
      points INTEGER,
      completed BOOLEAN DEFAULT 0
    )`);

    // Rewards Table
    db.run(`CREATE TABLE IF NOT EXISTS rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      category TEXT,
      cost INTEGER
    )`);

    // Calendar Events Table
    db.run(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      date TEXT,
      type TEXT,
      assigned_to INTEGER,
      completed BOOLEAN DEFAULT 0,
      points INTEGER
    )`);

    // Budget Table
    db.run(`CREATE TABLE IF NOT EXISTS budget_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      budget REAL,
      spent REAL DEFAULT 0,
      color TEXT
    )`);

    // Expenses Table
    db.run(`CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT,
      category_name TEXT,
      amount REAL,
      date TEXT,
      notes TEXT
    )`);

    // Meals Table
    db.run(`CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT,
      breakfast TEXT,
      lunch TEXT,
      dinner TEXT,
      notes TEXT
    )`);

    // Chat Table
    db.run(`CREATE TABLE IF NOT EXISTS chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER,
      message TEXT,
      timestamp TEXT,
      type TEXT
    )`);

    // Activities Table
    db.run(`CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      member_id INTEGER,
      text TEXT,
      points INTEGER,
      time TEXT
    )`);

    // Notes Table
    db.run(`CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      content TEXT,
      priority TEXT,
      author_id INTEGER,
      date TEXT,
      pinned BOOLEAN DEFAULT 0,
      completed BOOLEAN DEFAULT 0
    )`);

    // Initial Data Seeding (if empty)
    db.get("SELECT count(*) as count FROM users", (err, row) => {
      if (row && row.count === 0) {
        console.log("Seeding initial data...");
        seedData();
      }
    });
  });
}

function seedData() {
  console.log("Seeding data for 2026...");
  // Default Members
  const members = [
    { name: 'Andres', role: 'Padre', email: 'andres@familia.com', password: 'imthebest502@', color: '#10B981', points: 350, tasks_completed: 42, streak: 21, is_admin: 1 },
    { name: 'Magda', role: 'Madre', email: 'magda@familia.com', password: '123', color: '#8B5CF6', points: 420, tasks_completed: 56, streak: 18, is_admin: 0 },
    { name: 'Juan', role: 'Hijo Mayor', email: 'juan@familia.com', password: '123', color: '#3B82F6', points: 285, tasks_completed: 38, streak: 14, is_admin: 0 },
    { name: 'Ana', role: 'Hija', email: 'ana@familia.com', password: '123', color: '#EC4899', points: 320, tasks_completed: 45, streak: 25, is_admin: 0 },
    { name: 'Carlos', role: 'Hijo Menor', email: 'carlos@familia.com', password: '123', color: '#F59E0B', points: 190, tasks_completed: 28, streak: 7, is_admin: 0 }
  ];

  members.forEach(m => {
    const avatarName = m.name.replace(/\s+/g, '+');
    const avatarColor = m.color.replace('#', '');
    const avatar = `https://ui-avatars.com/api/?name=${avatarName}&background=${avatarColor}&color=fff&bold=true&size=400`;
    const hash = bcrypt.hashSync(m.password, 10);

    db.run(`INSERT INTO users (name, email, password, role, color, avatar, points, tasks_completed, streak, is_admin)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [m.name, m.email, hash, m.role, m.color, avatar, m.points, m.tasks_completed, m.streak, m.is_admin || 0]);
  });

  // Calendar for 2026 (Cleaning turns)
  const today = new Date();
  const year2026 = 2026;
  const referenceDate = new Date(year2026, 0, 1);

  for (let i = 0; i < 365; i++) {
    const currentDate = new Date(referenceDate);
    currentDate.setDate(referenceDate.getDate() + i);

    // Only even days to alternate turns
    if (i % 2 === 0) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const member = members[Math.floor(i / 2) % members.length];

      db.run(`INSERT INTO events (title, date, type, assigned_to, points, completed) VALUES (?, ?, ?, ?, ?, ?)`,
        ['Limpieza de Hogar', dateStr, 'limpieza', member.name, 20, currentDate < today ? 1 : 0]);
    }
  }

  // Default Tasks
  db.run(`INSERT INTO tasks (title, description, category, priority, due_date, points, completed, created_at) 
          VALUES ('Organizar estante', 'Revisar libros y juegos de mesa', 'organización', 'media', ?, 15, 0, ?)`,
    [new Date(Date.now() + 86400000).toISOString().split('T')[0], new Date().toISOString()], function (err) {
      if (!err) {
        db.run(`INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)`, [this.lastID, 1]);
      }
    });

  // Default Budget Categories
  const budgetCats = [
    { name: 'Comida', budget: 1200, spent: 980, color: '#10B981' },
    { name: 'Servicios', budget: 800, spent: 750, color: '#3B82F6' },
    { name: 'Transporte', budget: 600, spent: 450, color: '#F59E0B' },
    { name: 'Entretenimiento', budget: 400, spent: 320, color: '#8B5CF6' },
    { name: 'Ahorros', budget: 1000, spent: 1000, color: '#EC4899' },
    { name: 'Otros', budget: 500, spent: 310, color: '#6B7280' }
  ];
  budgetCats.forEach(c => {
    db.run(`INSERT INTO budget_categories (name, budget, spent, color) VALUES (?, ?, ?, ?)`,
      [c.name, c.budget, c.spent, c.color]);
  });

  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  days.forEach((day, index) => {
    db.run(`INSERT INTO meals (day, breakfast, lunch, dinner, notes) VALUES (?, ?, ?, ?, ?)`,
      [day,
        ['Huevos', 'Pan tostado', 'Jugo de naranja'][index % 3],
        ['Pollo asado', 'Arroz', 'Ensalada'][index % 3],
        ['Sopa', 'Sándwiches', 'Pasta'][index % 3],
        index === 6 ? 'Cena especial familiar' : ''
      ]);
  });
}

// Export raw db (for backward compatibility if needed) and async wrappers
module.exports = { db, ...dbAsync };
