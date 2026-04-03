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

    query += ` ORDER BY ${sortField} ${sortOrder} LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(pageSize, offset);

    const res = await pool.query(query, params);
    return res.rows;
  } catch (err) {
    console.error('Error fetching transactions:', err);
    throw err;
  }
};

export const getTransactionsByIds = async (ids) => {
  try {
    const res = await pool.query('SELECT * FROM transactions WHERE id = ANY($1)', [ids]);
    return res.rows;
  } catch (err) {
    console.error('Error fetching transactions by ids:', err);
    throw err;
  }
};

export const insertTransaction = async (client, data) => {
  try {
    const { date, time, account, name_description, counterparty, amount, currency, type, source, external_id } = data;
    const res = await client.query(
      `INSERT INTO transactions (date, time, account, name_description, counterparty, amount, currency, type, source, external_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (external_id) DO NOTHING
       RETURNING id`,
      [date, time, account, name_description, counterparty, amount, currency, type, source, external_id]
    );
    return res.rows[0]?.id;
  } catch (err) {
    console.error('Error inserting transaction:', err);
    throw err;
  }
};

export const getSettings = async (key) => {
  try {
    const res = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    return res.rows[0]?.value;
  } catch (err) {
    console.error(`Error fetching setting ${key}:`, err);
    return null;
  }
};

export const updateSettings = async (key, value) => {
  try {
    await pool.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
      [key, JSON.stringify(value)]
    );
  } catch (err) {
    console.error(`Error updating setting ${key}:`, err);
    throw err;
  }
};

export const getRules = async () => {
  try {
    const res = await pool.query('SELECT * FROM rules ORDER BY created_at DESC');
    return res.rows;
  } catch (err) {
    console.error('Error fetching rules:', err);
    return [];
  }
};

export const addRule = async (name, pattern, isProposed = false) => {
  try {
    const res = await pool.query(
      'INSERT INTO rules (name, pattern, is_proposed) VALUES ($1, $2, $3) RETURNING *',
      [name, pattern, isProposed]
    );
    return res.rows[0];
  } catch (err) {
    console.error('Error adding rule:', err);
    throw err;
  }
};

export const updateRule = async (id, updates) => {
  try {
    const { name, pattern, is_active, is_proposed } = updates;
    const res = await pool.query(
      'UPDATE rules SET name = $1, pattern = $2, is_active = $3, is_proposed = $4 WHERE id = $5 RETURNING *',
      [name, pattern, is_active, is_proposed, id]
    );
    return res.rows[0];
  } catch (err) {
    console.error(`Error updating rule ${id}:`, err);
    throw err;
  }
};

export const deleteRule = async (id) => {
  try {
    await pool.query('DELETE FROM rules WHERE id = $1', [id]);
  } catch (err) {
    console.error(`Error deleting rule ${id}:`, err);
    throw err;
  }
};

export const getAccountNames = async () => {
  try {
    const res = await pool.query('SELECT * FROM account_names');
    return res.rows;
  } catch (err) {
    console.error('Error fetching account names:', err);
    return [];
  }
};

export const updateAccountName = async (account, displayName, aiEnabled) => {
  try {
    const res = await pool.query(
      'INSERT INTO account_names (account, display_name, ai_enabled) VALUES ($1, $2, $3) ON CONFLICT (account) DO UPDATE SET display_name = $2, ai_enabled = $3 RETURNING *',
      [account, displayName, aiEnabled]
    );
    return res.rows[0];
  } catch (err) {
    console.error(`Error updating account name ${account}:`, err);
    throw err;
  }
};

export const createJob = async (type, payload) => {
  try {
    const res = await pool.query(
      'INSERT INTO background_jobs (type, payload) VALUES ($1, $2) RETURNING id',
      [type, JSON.stringify(payload)]
    );
    return res.rows[0].id;
  } catch (err) {
    console.error('Error creating background job:', err);
    throw err;
  }
};

export const updateJob = async (id, updates) => {
  try {
    const { status, progress, log, error, clearError } = updates;
    let query = 'UPDATE background_jobs SET updated_at = CURRENT_TIMESTAMP';
    const params = [];
    let idx = 1;

    if (status) {
      query += `, status = $${idx++}`;
      params.push(status);
    }
    if (progress !== undefined) {
      query += `, progress = $${idx++}`;
      params.push(progress);
    }
    if (log) {
      query += `, logs = logs || $${idx++}::jsonb`;
      params.push(JSON.stringify([{ message: log, timestamp: new Date().toISOString() }]));
    }
    if (error) {
      query += `, error = $${idx++}`;
      params.push(error);
    } else if (clearError) {
      query += `, error = NULL`;
    }

    query += ` WHERE id = $${idx} RETURNING *`;
    params.push(id);

    const res = await pool.query(query, params);
    return res.rows[0];
  } catch (err) {
    console.error(`Error updating job ${id}:`, err);
    throw err;
  }
};

export const getJobs = async () => {
  try {
    const res = await pool.query('SELECT * FROM background_jobs ORDER BY created_at DESC');
    return res.rows;
  } catch (err) {
    console.error('Error fetching jobs:', err);
    return [];
  }
};

export const getJob = async (id) => {
  try {
    const res = await pool.query('SELECT * FROM background_jobs WHERE id = $1', [id]);
    return res.rows[0];
  } catch (err) {
    console.error(`Error fetching job ${id}:`, err);
    throw err;
  }
};

export const deleteJob = async (id) => {
  try {
    await pool.query('DELETE FROM background_jobs WHERE id = $1', [id]);
  } catch (err) {
    console.error(`Error deleting job ${id}:`, err);
    throw err;
  }
};
