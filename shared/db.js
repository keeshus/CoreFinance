import pkg from 'pg';

const { Pool } = pkg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
  console.log('PostgreSQL connected successfully');
});

pool.on('error', (err) => {
  console.error('PostgreSQL unexpected error on idle client:', err);
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
        ai_enriched BOOLEAN DEFAULT false,
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
        expected_amount DECIMAL(12, 2),
        amount_margin DECIMAL(12, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Check if expected_amount column exists
    const checkExpectedAmount = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'rules' AND column_name = 'expected_amount'
    `);
    
    if (checkExpectedAmount.rows.length === 0) {
      console.log('Adding "expected_amount" and "amount_margin" columns to "rules" table');
      await client.query('ALTER TABLE rules ADD COLUMN expected_amount DECIMAL(12, 2)');
      await client.query('ALTER TABLE rules ADD COLUMN amount_margin DECIMAL(12, 2)');
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS background_jobs (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        logs JSONB DEFAULT '[]',
        payload JSONB DEFAULT '{}',
        error TEXT,
        worker_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Check if worker_id column exists
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'background_jobs' AND column_name = 'worker_id'
    `);
    
    if (checkColumn.rows.length === 0) {
      console.warn('CRITICAL: column "worker_id" is MISSING from table "background_jobs"');
    } else {
      console.log('SUCCESS: column "worker_id" exists in table "background_jobs"');
    }

    // Check and add ai_enriched column to transactions if it doesn't exist
    const checkAiEnriched = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'transactions' AND column_name = 'ai_enriched'
    `);
    
    if (checkAiEnriched.rows.length === 0) {
      console.log('Adding "ai_enriched" column to "transactions" table');
      await client.query('ALTER TABLE transactions ADD COLUMN ai_enriched BOOLEAN DEFAULT false');
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_models (
        name TEXT PRIMARY KEY,
        display_name TEXT,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_balances (
        date DATE NOT NULL,
        account TEXT NOT NULL,
        balance DECIMAL(12, 2) NOT NULL,
        PRIMARY KEY (date, account)
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
    const { page = 1, pageSize = 50, account = 'all', search = '', startDate = '', endDate = '', sortField = 'date', sortOrder = 'desc', deviationsOnly = false } = filters;
    const offset = (page - 1) * pageSize;
    
    let query = `
      SELECT t.*, COALESCE(an.display_name, t.account) as account_display_name, COUNT(*) OVER() as total_count
      FROM transactions t
      LEFT JOIN account_names an ON t.account = an.account
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (deviationsOnly) {
      query += ` AND (t.metadata->>'is_anomalous' = 'true' OR jsonb_array_length(t.metadata->'rule_violations') > 0)`;
    }

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

    const allowedSortFields = ['date', 'amount', 'account', 'name_description', 'counterparty'];
    const finalSortField = allowedSortFields.includes(sortField) ? `t.${sortField}` : 't.date';
    const finalSortOrder = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    query += ` ORDER BY ${finalSortField} ${finalSortOrder} LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
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
    const { date, time, account, name_description, counterparty, amount, currency, type, source, external_id, metadata } = data;
    const res = await client.query(
      `INSERT INTO transactions (date, time, account, name_description, counterparty, amount, currency, type, source, external_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (external_id) DO UPDATE SET
         date = EXCLUDED.date,
         time = EXCLUDED.time,
         amount = EXCLUDED.amount,
         metadata = EXCLUDED.metadata
       RETURNING id`,
      [date, time, account, name_description, counterparty, amount, currency, type, source, external_id, metadata || {}]
    );
    return res.rows[0]?.id;
  } catch (err) {
    console.error('Error inserting transaction:', err);
    throw err;
  }
};

export const upsertDailyBalance = async (client, data) => {
  try {
    const { date, account, balance } = data;
    await client.query(
      `INSERT INTO daily_balances (date, account, balance)
       VALUES ($1, $2, $3)
       ON CONFLICT (date, account) DO UPDATE SET balance = EXCLUDED.balance`,
      [date, account, balance]
    );
  } catch (err) {
    console.error('Error upserting daily balance:', err);
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

export const addRule = async (name, pattern, isProposed = false, expectedAmount = null, amountMargin = null) => {
  try {
    const res = await pool.query(
      'INSERT INTO rules (name, pattern, is_proposed, expected_amount, amount_margin) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, pattern, isProposed, expectedAmount, amountMargin]
    );
    return res.rows[0];
  } catch (err) {
    console.error('Error adding rule:', err);
    throw err;
  }
};

export const updateRule = async (id, updates) => {
  try {
    const { name, pattern, is_active, is_proposed, expected_amount, amount_margin } = updates;
    
    // If name or pattern are not provided, we should fetch current ones or only update provided fields
    // But based on current usage, we are calling it with { is_active, is_proposed }
    // Let's make it more robust by only updating what is provided
    
    let query = 'UPDATE rules SET ';
    const params = [];
    const setClauses = [];
    let idx = 1;

    if (name !== undefined) {
      setClauses.push(`name = $${idx++}`);
      params.push(name);
    }
    if (pattern !== undefined) {
      setClauses.push(`pattern = $${idx++}`);
      params.push(pattern);
    }
    if (is_active !== undefined) {
      setClauses.push(`is_active = $${idx++}`);
      params.push(is_active);
    }
    if (is_proposed !== undefined) {
      setClauses.push(`is_proposed = $${idx++}`);
      params.push(is_proposed);
    }
    if (expected_amount !== undefined) {
      setClauses.push(`expected_amount = $${idx++}`);
      params.push(expected_amount);
    }
    if (amount_margin !== undefined) {
      setClauses.push(`amount_margin = $${idx++}`);
      params.push(amount_margin);
    }

    if (setClauses.length === 0) return null;

    query += setClauses.join(', ') + ` WHERE id = $${idx} RETURNING *`;
    params.push(id);

    const res = await pool.query(query, params);
    return res.rows[0];
  } catch (err) {
    console.error(`Error updating rule ${id}:`, err);
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

const updateAccountName = async (account, displayName, aiEnabled) => {
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
    const { status, progress, log, error, clearError, workerId } = updates;
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
    if (workerId) {
      query += `, worker_id = $${idx++}`;
      params.push(workerId);
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

export const getSummary = async () => {
  try {
    const res = await pool.query(`
      SELECT
        an.account,
        an.display_name as account_display_name,
        COALESCE(
          (SELECT balance FROM daily_balances db WHERE db.account = an.account ORDER BY db.date DESC LIMIT 1),
          (SELECT SUM(amount) FROM transactions WHERE account = an.account),
          0
        ) as balance,
        'EUR' as currency,
        (SELECT MAX(date) FROM transactions WHERE account = an.account) as last_transaction,
        an.ai_enabled
      FROM account_names an
    `);
    return res.rows;
  } catch (err) {
    console.error('Error fetching summary:', err);
    throw err;
  }
};

export const getTrend = async () => {
  try {
    const res = await pool.query(`
      WITH trend_data AS (
        SELECT
          t.date,
          t.account,
          t.amount,
          t.time,
          t.id,
          t.metadata->'ai_categories' as categories
        FROM transactions t
        JOIN account_names an ON t.account = an.account
        
        UNION ALL
        
        SELECT
          db.date,
          db.account,
          0 as amount,
          NULL as time,
          -1 as id,
          NULL as categories
        FROM daily_balances db
        JOIN account_names an ON db.account = an.account
        WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE account = db.account AND date = db.date)
      )
      SELECT
        date,
        account,
        COALESCE(
          (SELECT balance FROM daily_balances WHERE account = trend_data.account AND date = trend_data.date),
          SUM(amount) OVER (PARTITION BY account ORDER BY date, time NULLS FIRST, id)
        ) as balance,
        amount,
        categories
      FROM trend_data
      ORDER BY date ASC, time ASC NULLS FIRST, id ASC
    `);
    return res.rows;
  } catch (err) {
    console.error('Error fetching trend:', err);
    throw err;
  }
};

export const getAIModels = async () => {
  try {
    const res = await pool.query('SELECT * FROM ai_models ORDER BY updated_at DESC');
    return res.rows;
  } catch (err) {
    console.error('Error fetching AI models:', err);
    return [];
  }
};

export const upsertAIModel = async (name, displayName, description) => {
  try {
    await pool.query(
      'INSERT INTO ai_models (name, display_name, description, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) ON CONFLICT (name) DO UPDATE SET display_name = $2, description = $3, updated_at = CURRENT_TIMESTAMP',
      [name, displayName, description]
    );
  } catch (err) {
    console.error(`Error upserting AI model ${name}:`, err);
    throw err;
  }
};

export const setAccountName = async (account, displayName, aiEnabled) => {
  return updateAccountName(account, displayName, aiEnabled);
};

export const deleteRule = async (id) => {
  try {
    await pool.query('DELETE FROM rules WHERE id = $1', [id]);
  } catch (err) {
    console.error(`Error deleting rule ${id}:`, err);
    throw err;
  }
};

export const updateRuleStatus = async (id, isActive, isProposed, name, pattern) => {
  return updateRule(id, { 
    is_active: isActive, 
    is_proposed: isProposed,
    name: name,
    pattern: pattern
  });
};

export const deleteAccount = async (account) => {
  try {
    await pool.query('DELETE FROM account_names WHERE account = $1', [account]);
  } catch (err) {
    console.error(`Error deleting account ${account}:`, err);
    throw err;
  }
};

export const getUnenrichedTransactions = async () => {
  try {
    const res = await pool.query(`
      SELECT t.* 
      FROM transactions t
      JOIN account_names an ON t.account = an.account
      WHERE t.ai_enriched = false AND an.ai_enabled = true
    `);
    return res.rows;
  } catch (err) {
    console.error('Error fetching unenriched transactions:', err);
    throw err;
  }
};
