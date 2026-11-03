PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 telegram_id TEXT PRIMARY KEY, username TEXT, first_name TEXT,
 balance REAL NOT NULL DEFAULT 0, referred_by TEXT, referral_paid INTEGER NOT NULL DEFAULT 0,
 mining_last_claim INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO settings(key,value) VALUES
 ('mining_daily','10'),('referral_reward','200'),('task_reward','15');
CREATE TABLE IF NOT EXISTS tasks (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '',
 url TEXT DEFAULT '', reward REAL NOT NULL DEFAULT 15, active INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS task_completions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id TEXT NOT NULL, task_id INTEGER NOT NULL,
 day_key TEXT NOT NULL, created_at INTEGER NOT NULL,
 UNIQUE(telegram_id,task_id,day_key),
 FOREIGN KEY(telegram_id) REFERENCES users(telegram_id),
 FOREIGN KEY(task_id) REFERENCES tasks(id)
);
CREATE TABLE IF NOT EXISTS transactions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id TEXT NOT NULL, kind TEXT NOT NULL,
 amount REAL NOT NULL, note TEXT NOT NULL, created_at INTEGER NOT NULL,
 FOREIGN KEY(telegram_id) REFERENCES users(telegram_id)
);
