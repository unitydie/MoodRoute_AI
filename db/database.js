const fs = require("fs/promises");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const DB_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DB_DIR, "moodroute.db");
const INIT_SQL_PATH = path.join(__dirname, "init.sql");

let dbPromise;

async function initializeDatabase(db) {
  const initSql = await fs.readFile(INIT_SQL_PATH, "utf8");
  await db.exec("PRAGMA foreign_keys = ON;");
  await db.exec(initSql);
  await applyMigrations(db);
}

async function tableHasColumn(db, tableName, columnName) {
  const rows = await db.all(`PRAGMA table_info(${tableName})`);
  return rows.some((row) => row.name === columnName);
}

async function applyMigrations(db) {
  const conversationsHasUserId = await tableHasColumn(
    db,
    "conversations",
    "user_id"
  );
  if (!conversationsHasUserId) {
    await db.exec("ALTER TABLE conversations ADD COLUMN user_id INTEGER;");
  }

  const usersHasGithubAvatar = await tableHasColumn(
    db,
    "users",
    "github_avatar_url"
  );
  if (!usersHasGithubAvatar) {
    await db.exec("ALTER TABLE users ADD COLUMN github_avatar_url TEXT;");
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id INTEGER PRIMARY KEY,
      default_city TEXT NOT NULL DEFAULT '',
      default_vibe TEXT NOT NULL DEFAULT '',
      default_budget TEXT NOT NULL DEFAULT '',
      crowd_tolerance TEXT NOT NULL DEFAULT '',
      weather_preference TEXT NOT NULL DEFAULT '',
      default_duration TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      visited_places_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await db.exec(
    "CREATE INDEX IF NOT EXISTS idx_conversations_user_updated_at ON conversations(user_id, updated_at DESC);"
  );
  await db.exec(
    "CREATE INDEX IF NOT EXISTS idx_user_profiles_updated_at ON user_profiles(updated_at DESC);"
  );
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      await fs.mkdir(DB_DIR, { recursive: true });
      const db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
      });
      await initializeDatabase(db);
      return db;
    })();
  }
  return dbPromise;
}

module.exports = {
  getDb,
  DB_PATH
};
