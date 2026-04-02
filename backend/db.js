import pkg from 'pg';

const { Pool } = pkg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const initDb = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        time TIME,
        account TEXT NOT NULL,
        name_description TEXT,
        counterparty TEXT,
        amount DECIMAL(12, 2) NOT NULL,
        currency TEXT NOT NULL,
        type TEXT,
        source TEXT NOT NULL,
        external_id TEXT UNIQUE,
        metadata JSONB DEFAULT '{}'
      );
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS account_names (
        account TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        ai_enabled BOOLEAN DEFAULT false
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rules (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        pattern TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        is_proposed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS background_jobs (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        logs JSONB DEFAULT '[]',
        payload JSONB DEFAULT '{}',
        error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Database schema initialized');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
};

export const getTransactions = async (filters = {}) => {
  try {
    const { page = 1, pageSize = 50, account = 'all', search = '', startDate = '', endDate = '', sortField = 'date', sortOrder = 'desc' } = filters;
    const offset = (page - 1) * pageSize;
    
    let query = `
      SELECT t.*, COALESCE(an.display_name, t.account) as account_display_name, COUNT(*) OVER() as total_count
      FROM transactions t
      LEFT JOIN account_names an ON t.account = an.account
      WHERE 1=1
    `;
  const params = [];
  let paramIdx = 1;

  if (account !== 'all') {
    query += ` AND t.account = $${paramIdx++}`;
    params.push(account);
  }

  if (search) {
    query += ` AND (t.name_description ILIKE $${paramIdx} OR t.counterparty ILIKE $${paramIdx} OR COALESCE(an.display_name, t.account) ILIKE $${paramIdx})`;
    params.push(`%${search}%`);
    paramIdx++;
  }

  if (startDate) {
    query += ` AND t.date >= $${paramIdx++}`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND t.date <= $${paramIdx++}`;
    params.push(endDate);
  }

  const allowedSortFields = ['date', 'amount', 'name_description'];
  const field = allowedSortFields.includes(sortField) ? sortField : 'date';
  const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  
  if (field === 'date') {
    query += ` ORDER BY t.date ${order}, t.time ${order} NULLS LAST, t.id ${order}`;
  } else {
    query += ` ORDER BY ${field} ${order}, t.date DESC, t.time DESC NULLS LAST, t.id DESC`;
  }

  query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
  params.push(pageSize, offset);

    const result = await pool.query(query, params);
    return result.rows;
  } catch (err) {
    console.error('Error fetching transactions:', err);
    throw err;
  }
};

export const getSummary = async () => {
  const result = await pool.query(`
    SELECT 
      an.account, 
      an.display_name as account_display_name,
      an.ai_enabled,
      COALESCE(SUM(t.amount), 0) as balance 
    FROM account_names an
    LEFT JOIN transactions t ON t.account = an.account
    GROUP BY an.account, an.display_name, an.ai_enabled
  `);
  return result.rows;
};

export const getTrend = async () => {
  const result = await pool.query(`
    WITH DateSeries AS (
      SELECT generate_series(
        (SELECT MIN(date) FROM transactions),
        CURRENT_DATE,
        '1 day'::interval
      )::date AS date
    ),
    DistinctAccounts AS (
      SELECT DISTINCT account FROM transactions
    ),
    DailySum AS (
      SELECT 
        date,
        account,
        SUM(amount) as daily_amount
      FROM transactions
      GROUP BY date, account
    ),
    AccountDateGrid AS (
      SELECT ds.date, da.account
      FROM DateSeries ds
      CROSS JOIN DistinctAccounts da
    ),
    CumulativeSum AS (
      SELECT 
        grid.date,
        grid.account,
        SUM(COALESCE(ds.daily_amount, 0)) OVER (PARTITION BY grid.account ORDER BY grid.date) as balance
      FROM AccountDateGrid grid
      LEFT JOIN DailySum ds ON grid.date = ds.date AND grid.account = ds.account
    ),
    AccountTrend AS (
      SELECT 
        TO_CHAR(date, 'YYYY-MM-DD') as date,
        account,
        balance
      FROM CumulativeSum
    )
    SELECT * FROM AccountTrend ORDER BY date ASC
  `);

  // Group by date to make it easier for frontend if needed, but we can also just return all
  return result.rows;
};

export const setAccountName = async (account, display_name, ai_enabled = false) => {
  await pool.query(`
    INSERT INTO account_names (account, display_name, ai_enabled)
    VALUES ($1, $2, $3)
    ON CONFLICT (account) DO UPDATE SET display_name = $2, ai_enabled = $3
  `, [account, display_name, ai_enabled]);
};

export const deleteAccount = async (account) => {
  await pool.query("DELETE FROM account_names WHERE account = $1", [account]);
};

export const getSettings = async (key) => {
  const result = await pool.query("SELECT value FROM settings WHERE key = $1", [key]);
  return result.rows[0]?.value;
};

export const updateSettings = async (key, value) => {
  await pool.query(`
    INSERT INTO settings (key, value)
    VALUES ($1, $2)
    ON CONFLICT (key) DO UPDATE SET value = $2
  `, [key, JSON.stringify(value)]);
};

export const getAccountNames = async () => {
  const result = await pool.query("SELECT * FROM account_names");
  return result.rows;
};

export const getRules = async () => {
  const result = await pool.query("SELECT * FROM rules ORDER BY created_at DESC");
  return result.rows;
};

export const addRule = async (name, pattern, is_proposed = false) => {
  await pool.query(
    "INSERT INTO rules (name, pattern, is_proposed) VALUES ($1, $2, $3)",
    [name, pattern, is_proposed]
  );
};

export const updateRuleStatus = async (id, is_active, is_proposed) => {
  await pool.query(
    "UPDATE rules SET is_active = $2, is_proposed = $3 WHERE id = $1",
    [id, is_active, is_proposed]
  );
};

export const insertTransaction = async (client, normalized) => {
  const result = await client.query(`
    INSERT INTO transactions (date, time, account, name_description, counterparty, amount, currency, type, source, external_id, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (external_id) DO UPDATE SET metadata = $11
    RETURNING id
  `, [
    normalized.date,
    normalized.time || null,
    normalized.account,
    normalized.name_description,
    normalized.counterparty,
    normalized.amount,
    normalized.currency,
    normalized.type,
    normalized.source,
    normalized.external_id,
    normalized.metadata || {}
  ]);
  return result.rows[0]?.id;
};

export const createJob = async (type, payload = {}) => {
  const result = await pool.query(
    "INSERT INTO background_jobs (type, payload) VALUES ($1, $2) RETURNING id",
    [type, JSON.stringify(payload)]
  );
  return result.rows[0].id;
};

export const deleteJob = async (id) => {
  await pool.query("DELETE FROM background_jobs WHERE id = $1", [id]);
};

export const updateJob = async (id, { status, progress, log, error, clearError }) => {
  let query = "UPDATE background_jobs SET updated_at = CURRENT_TIMESTAMP";
  const params = [id];
  let paramIdx = 2;

  if (status) {
    query += `, status = $${paramIdx++}`;
    params.push(status);
  }
  if (progress !== undefined) {
    query += `, progress = $${paramIdx++}`;
    params.push(progress);
  }
  if (log) {
    query += `, logs = logs || $${paramIdx++}::jsonb`;
    params.push(JSON.stringify([{ message: log, timestamp: new Date().toISOString() }]));
  }
  if (error) {
    query += `, error = $${paramIdx++}`;
    params.push(error);
  } else if (clearError) {
    query += `, error = NULL`;
  }

  query += ` WHERE id = $1`;
  await pool.query(query, params);
};

export const getJob = async (id) => {
  const result = await pool.query("SELECT * FROM background_jobs WHERE id = $1", [id]);
  return result.rows[0];
};

export const getTransactionsByIds = async (ids) => {
  if (!ids || ids.length === 0) return [];
  const result = await pool.query("SELECT * FROM transactions WHERE id = ANY($1)", [ids]);
  return result.rows;
};

export const getJobs = async () => {
  const result = await pool.query("SELECT * FROM background_jobs ORDER BY created_at DESC");
  return result.rows;
};
