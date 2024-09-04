const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./recruitment.db', (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Connected to the recruitment database.');
    }
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name TEXT NOT NULL,
        pre_placement_talk DATE,
        pre_placement_time TEXT,
        assessment_date DATE,
        assessment_time TEXT,
        assessment_website TEXT,
        interview_date DATE,
        interview_time TEXT,
        status TEXT NOT NULL,
        user_id INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
});

module.exports = db;