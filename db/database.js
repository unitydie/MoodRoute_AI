const fs = require("fs/promises");
const path = require("path");
const { Pool } = require("pg");

const INIT_SQL_PATH = path.join(__dirname, "init.sql");
const DEFAULT_APP_NAME = "moodroute-ai";

let dbPromise;

function buildPoolConfig() {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.DATABASE_PUBLIC_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL;

  if (connectionString) {
    const requireSsl =
      /sslmode=require/i.test(connectionString) ||
      process.env.PGSSLMODE === "require";

    return {
      connectionString,
      ssl: requireSsl ? { rejectUnauthorized: false } : false,
      application_name: process.env.PGAPPNAME || DEFAULT_APP_NAME
    };
  }

  const host = process.env.PGHOST;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE;
  const port = Number(process.env.PGPORT || 5432);
  const requireSsl = process.env.PGSSLMODE === "require";

  if (!host || !user || !database) {
    throw new Error(
      "Postgres is not configured. Set DATABASE_URL (Railway) or PGHOST/PGUSER/PGDATABASE."
    );
  }

  return {
    host,
    user,
    password,
    database,
    port,
    ssl: requireSsl ? { rejectUnauthorized: false } : false,
    application_name: process.env.PGAPPNAME || DEFAULT_APP_NAME
  };
}

function toPgParams(sql, params = []) {
  let placeholderIndex = 0;
  let inSingleQuote = false;
  let text = "";

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];

    if (char === "'") {
      if (inSingleQuote && sql[i + 1] === "'") {
        text += "''";
        i += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      text += char;
      continue;
    }

    if (!inSingleQuote && char === "?") {
      placeholderIndex += 1;
      text += `$${placeholderIndex}`;
      continue;
    }

    text += char;
  }

  return { text, values: params };
}

function extractLastId(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const first = rows[0];
  if (!first || first.id === undefined || first.id === null) {
    return null;
  }

  const numeric = Number(first.id);
  return Number.isFinite(numeric) ? numeric : first.id;
}

class PgCompatDatabase {
  constructor(pool) {
    this.pool = pool;
  }

  async get(sql, params = []) {
    const { text, values } = toPgParams(sql, params);
    const result = await this.pool.query(text, values);
    return result.rows[0] || undefined;
  }

  async all(sql, params = []) {
    const { text, values } = toPgParams(sql, params);
    const result = await this.pool.query(text, values);
    return result.rows;
  }

  async run(sql, params = []) {
    const { text, values } = toPgParams(sql, params);
    const result = await this.pool.query(text, values);
    return {
      lastID: extractLastId(result.rows),
      changes: result.rowCount || 0
    };
  }

  async exec(sql) {
    await this.pool.query(sql);
  }
}

async function initializeDatabase(pool) {
  const initSql = await fs.readFile(INIT_SQL_PATH, "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(initSql);
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      // no-op
    }
    throw error;
  } finally {
    client.release();
  }
}

async function createDatabaseClient() {
  const pool = new Pool(buildPoolConfig());
  pool.on("error", (error) => {
    console.error("[db:pool]", error.message);
  });

  await pool.query("SELECT 1");
  await initializeDatabase(pool);
  return new PgCompatDatabase(pool);
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = createDatabaseClient().catch((error) => {
      dbPromise = undefined;
      throw error;
    });
  }
  return dbPromise;
}

module.exports = {
  getDb
};
