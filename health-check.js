const db = require('./server/database');

async function check() {
    console.log('--- DB HEALTH CHECK ---');
    try {
        const users = await db.all('SELECT * FROM users');
        console.log(`Users: ${users.length}`);
        users.forEach(u => console.log(` - ${u.name} (ID: ${u.id})`));

        const events = await db.all('SELECT * FROM events LIMIT 5');
        console.log(`Events: ${events.length} (showing 5)`);

        const notes = await db.all('SELECT * FROM notes');
        console.log(`Notes: ${notes.length}`);

        const tasks = await db.all('SELECT * FROM tasks');
        console.log(`Tasks: ${tasks.length}`);

        console.log('--- CHECK COMPLETE ---');
    } catch (err) {
        console.error('Check failed:', err);
    }
}

check();
