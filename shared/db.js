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
        import_method TEXT,
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
        type TEXT DEFAULT 'validation',
        category TEXT,
        name TEXT NOT NULL,
        pattern TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        is_proposed BOOLEAN DEFAULT false,
        expected_amount DECIMAL(12, 2),
        amount_margin DECIMAL(12, 2),
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
        worker_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

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

    await client.query(`
      CREATE TABLE IF NOT EXISTS ponto_tokens (
        id SERIAL PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ponto_accounts (
        ponto_id UUID PRIMARY KEY,
        account_id TEXT UNIQUE NOT NULL, -- This is our local account identifier (e.g. IBAN)
        name TEXT,
        currency TEXT,
        institution_name TEXT,
        synchronized_at TIMESTAMP,
        is_active BOOLEAN DEFAULT false
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS web_push_subscriptions (
        id SERIAL PRIMARY KEY,
        endpoint TEXT UNIQUE NOT NULL,
        keys JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure refresh_token is nullable for Client Credentials flow
    await client.query(`
      ALTER TABLE ponto_tokens ALTER COLUMN refresh_token DROP NOT NULL;
    `).catch(() => {}); // Ignore error if it's already nullable
    
    // Initialize default categories if they don't exist
    const defaultCategories = [
      { name: 'Income', description: 'Salary, bonuses, and employer reimbursements' },
      { name: 'Housing', description: 'Rent, mortgage, HOA fees, and property taxes' },
      { name: 'Groceries', description: 'Supermarkets, food markets, everyday household consumables' },
      { name: 'Dining & Drinks', description: 'Restaurants, bars, coffee shops, and takeout' },
      { name: 'Transportation', description: 'Public transit, rideshares, gas, parking, and tolls' },
      { name: 'Shopping', description: 'Clothing, electronics, and non-essential physical goods' },
      { name: 'Health & Wellness', description: 'Medical, dental, pharmacy, gym, and personal care' },
      { name: 'Insurance', description: 'Health, car, home, and life insurance premiums' },
      { name: 'Subscriptions', description: 'Streaming services, software, magazines, and memberships' },
      { name: 'Education', description: 'Tuition, books, courses, and student loans' },
      { name: 'Travel & Leisure', description: 'Flights, hotels, vacations, movies, and events' },
      { name: 'Gifts & Donations', description: 'Charity, presents, and contributions' },
      { name: 'Finance & Taxes', description: 'Bank fees, tax payments, and professional services' },
      { name: 'Savings & Investments', description: 'Transfers to savings, brokerage, and crypto accounts' },
      { name: 'Payment requests', description: 'Tikkie, Venmo, or other peer-to-peer payment requests' },
      { name: 'Other', description: 'Miscellaneous transactions that do not fit anywhere else' }
    ];

    await client.query(
      'INSERT INTO settings (key, value) VALUES (\$1, \$2) ON CONFLICT (key) DO NOTHING',
      ['categories', JSON.stringify(defaultCategories)]
    );

    console.log('Database schema initialized');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
};

export const getTransactions = async (filters = {}) => {
  try {
    const { 
      page = 1, 
      pageSize = 50, 
      account = 'all', 
      search = '', 
      startDate = '', 
      endDate = '', 
      sortField = 'date', 
      sortOrder = 'desc', 
      deviationsOnly = false,
      category = 'all'
    } = filters;
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
      query += ` AND (
        (t.metadata->>'is_anomalous' = 'true'
        OR (
          jsonb_typeof(t.metadata->'rule_violations') = 'array'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(t.metadata->'rule_violations') AS v
            WHERE v::text != '"none"' AND v::text != '"None"'
          )
        ))
        AND (t.metadata->>'review_status' IS NULL OR (t.metadata->>'review_status' != 'accepted' AND t.metadata->>'review_status' != 'negated'))
      )`;
    }

    if (account !== 'all') {
      query += ` AND t.account = $${paramIdx++}`;
      params.push(account);
    }

    if (category !== 'all') {
      const categoryArray = Array.isArray(category) ? category : [category];
      query += ` AND t.metadata->>'ai_category' = ANY($${paramIdx++})`;
      params.push(categoryArray);
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
    const res = await pool.query('SELECT * FROM transactions WHERE id = ANY(\$1)', [ids]);
    return res.rows;
  } catch (err) {
    console.error('Error fetching transactions by ids:', err);
    throw err;
  }
};

export const getPontoToken = async () => {
  try {
    const res = await pool.query('SELECT * FROM ponto_tokens ORDER BY expires_at DESC LIMIT 1');
    return res.rows[0];
  } catch (err) {
    console.error('Error fetching Ponto token:', err);
    throw err;
  }
};

export const savePontoToken = async (accessToken, refreshToken, expiresIn) => {
  try {
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const res = await pool.query(
      'INSERT INTO ponto_tokens (access_token, refresh_token, expires_at) VALUES (\$1, \$2, \$3) RETURNING *',
      [accessToken, refreshToken, expiresAt]
    );
    return res.rows[0];
  } catch (err) {
    console.error('Error saving Ponto token:', err);
    throw err;
  }
};

export const getPontoAccounts = async (onlyActive = false) => {
  try {
    let query = 'SELECT * FROM ponto_accounts';
    if (onlyActive) query += ' WHERE is_active = true';
    const res = await pool.query(query);
    return res.rows;
  } catch (err) {
    console.error('Error fetching Ponto accounts:', err);
    throw err;
  }
};

export const upsertPontoAccount = async (account) => {
  const { ponto_id, account_id, name, currency, institution_name } = account;
  try {
    const res = await pool.query(
      `INSERT INTO ponto_accounts (ponto_id, account_id, name, currency, institution_name)
       VALUES (\$1, \$2, \$3, \$4, \$5)
       ON CONFLICT (ponto_id) DO UPDATE SET
         account_id = EXCLUDED.account_id,
         name = EXCLUDED.name,
         currency = EXCLUDED.currency,
         institution_name = EXCLUDED.institution_name
       RETURNING *`,
      [ponto_id, account_id, name, currency, institution_name]
    );
    return res.rows[0];
  } catch (err) {
    console.error('Error upserting Ponto account:', err);
    throw err;
  }
};

export const setPontoAccountStatus = async (pontoId, isActive) => {
  try {
    const res = await pool.query(
      'UPDATE ponto_accounts SET is_active = \$2 WHERE ponto_id = \$1 RETURNING *',
      [pontoId, isActive]
    );
    return res.rows[0];
  } catch (err) {
    console.error('Error setting Ponto account status:', err);
    throw err;
  }
};

export const getLatestTransactionDate = async (account) => {
  try {
    const res = await pool.query(
      'SELECT MAX(date) as latest FROM transactions WHERE account = \$1',
      [account]
    );
    return res.rows[0].latest;
  } catch (err) {
    console.error('Error fetching latest transaction date:', err);
    throw err;
  }
};

export const saveTransaction = async (tx) => {
  try {
    const { date, time, account, name_description, counterparty, amount, currency, type, source, import_method, external_id, metadata } = tx;
    const res = await pool.query(
      `INSERT INTO transactions (
        date, time, account, name_description, counterparty, amount, currency, type, source, import_method, external_id, metadata
      ) VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11, \$12)
      ON CONFLICT (external_id) DO UPDATE SET
        date = EXCLUDED.date,
        time = EXCLUDED.time,
        amount = EXCLUDED.amount,
        import_method = EXCLUDED.import_method,
        metadata = EXCLUDED.metadata
      RETURNING *`,
      [
        date, 
        time || null,
        account, 
        name_description, 
        counterparty, 
        amount, 
        currency, 
        type || null,
        source, 
        import_method || null,
        external_id,
        metadata || {}
      ]
    );
    return res.rows[0];
  } catch (err) {
    console.error('Error saving transaction:', err);
    throw err;
  }
};

export const updateDailyBalance = async (date, account, balance) => {
  try {
    await pool.query(
      `INSERT INTO daily_balances (date, account, balance)
       VALUES (\$1, \$2, \$3)
       ON CONFLICT (date, account) DO UPDATE SET balance = EXCLUDED.balance`,
      [date, account, balance]
    );
  } catch (err) {
    console.error('Error updating daily balance:', err);
    throw err;
  }
};

export const getTransactionsForBalanceCalc = async (account, fromDate) => {
  try {
    const res = await pool.query(
      'SELECT date, amount FROM transactions WHERE account = \$1 AND date >= \$2 ORDER BY date DESC',
      [account, fromDate]
    );
    return res.rows;
  } catch (err) {
    console.error('Error fetching transactions for balance calc:', err);
    throw err;
  }
};

export const insertTransaction = async (client, data) => {
  try {
    const { date, time, account, name_description, counterparty, amount, currency, type, source, import_method, external_id, metadata } = data;
    const res = await client.query(
      `INSERT INTO transactions (date, time, account, name_description, counterparty, amount, currency, type, source, import_method, external_id, metadata)
       VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11, \$12)
       ON CONFLICT (external_id) DO UPDATE SET
         date = EXCLUDED.date,
         time = EXCLUDED.time,
         amount = EXCLUDED.amount,
         import_method = EXCLUDED.import_method,
         metadata = EXCLUDED.metadata
       RETURNING id`,
      [date, time, account, name_description, counterparty, amount, currency, type, source, import_method || null, external_id, metadata || {}]
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
       VALUES (\$1, \$2, \$3)
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
    const res = await pool.query('SELECT value FROM settings WHERE key = \$1', [key]);
    return res.rows[0]?.value;
  } catch (err) {
    console.error(`Error fetching setting \${key}:`, err);
    return null;
  }
};

export const updateSettings = async (key, value) => {
  try {
    await pool.query(
      'INSERT INTO settings (key, value) VALUES (\$1, \$2) ON CONFLICT (key) DO UPDATE SET value = \$2',
      [key, JSON.stringify(value)]
    );
  } catch (err) {
    console.error(`Error updating setting \${key}:`, err);
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

export const addRule = async (name, pattern, isProposed = false, expectedAmount = null, amountMargin = null, type = 'validation', category = null) => {
  try {
    const res = await pool.query(
      'INSERT INTO rules (name, pattern, is_proposed, expected_amount, amount_margin, type, category) VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7) RETURNING *',
      [name, pattern, isProposed, expectedAmount, amountMargin, type, category]
    );
    return res.rows[0];
  } catch (err) {
    console.error('Error adding rule:', err);
    throw err;
  }
};

export const updateRule = async (id, updates) => {
  try {
    const { name, pattern, is_active, is_proposed, expected_amount, amount_margin, type, category } = updates;
    
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
    if (type !== undefined) {
      setClauses.push(`type = $${idx++}`);
      params.push(type);
    }
    if (category !== undefined) {
      setClauses.push(`category = $${idx++}`);
      params.push(category);
    }

    if (setClauses.length === 0) return null;

    query += setClauses.join(', ') + ` WHERE id = $${idx} RETURNING *`;
    params.push(id);

    const res = await pool.query(query, params);
    return res.rows[0];
  } catch (err) {
    console.error(`Error updating rule \${id}:`, err);
    throw err;
  }
};

export const deleteRule = async (id) => {
  try {
    await pool.query('DELETE FROM rules WHERE id = \$1', [id]);
  } catch (err) {
    console.error(`Error deleting rule \${id}:`, err);
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

export const setAccountName = async (account, displayName, aiEnabled) => {
  try {
    const res = await pool.query(
      'INSERT INTO account_names (account, display_name, ai_enabled) VALUES (\$1, \$2, \$3) ON CONFLICT (account) DO UPDATE SET display_name = \$2, ai_enabled = \$3 RETURNING *',
      [account, displayName, aiEnabled]
    );
    return res.rows[0];
  } catch (err) {
    console.error(`Error updating account name \${account}:`, err);
    throw err;
  }
};

export const deleteAccount = async (account) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM transactions WHERE account = \$1', [account]);
    await client.query('DELETE FROM daily_balances WHERE account = \$1', [account]);
    await client.query('DELETE FROM account_names WHERE account = \$1', [account]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Error deleting account \${account}:`, err);
    throw err;
  } finally {
    client.release();
  }
};

export const createJob = async (type, payload) => {
  try {
    const res = await pool.query(
      'INSERT INTO background_jobs (type, payload) VALUES (\$1, \$2) RETURNING id',
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
    console.error(`Error updating job \${id}:`, err);
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
    const res = await pool.query('SELECT * FROM background_jobs WHERE id = \$1', [id]);
    return res.rows[0];
  } catch (err) {
    console.error(`Error fetching job \${id}:`, err);
    throw err;
  }
};

export const deleteJob = async (id) => {
  try {
    await pool.query('DELETE FROM background_jobs WHERE id = \$1', [id]);
  } catch (err) {
    console.error(`Error deleting job \${id}:`, err);
    throw err;
  }
};

export const saveWebPushSubscription = async (subscription) => {
  try {
    const { endpoint, keys } = subscription;
    await pool.query(
      `INSERT INTO web_push_subscriptions (endpoint, keys)
       VALUES (\$1, \$2)
       ON CONFLICT (endpoint) DO UPDATE SET keys = EXCLUDED.keys`,
      [endpoint, JSON.stringify(keys)]
    );
  } catch (err) {
    console.error('Error saving web push subscription:', err);
    throw err;
  }
};

export const getWebPushSubscriptions = async () => {
  try {
    const res = await pool.query('SELECT endpoint, keys FROM web_push_subscriptions');
    return res.rows;
  } catch (err) {
    console.error('Error fetching web push subscriptions:', err);
    return [];
  }
};

export const deleteWebPushSubscription = async (endpoint) => {
  try {
    await pool.query('DELETE FROM web_push_subscriptions WHERE endpoint = \$1', [endpoint]);
  } catch (err) {
    console.error('Error deleting web push subscription:', err);
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
          t.metadata->>'ai_category' as category
        FROM transactions t
        JOIN account_names an ON t.account = an.account
        WHERE t.type IS NULL OR t.type != 'INITIAL_BALANCE'
        
        UNION ALL
        
        SELECT
          db.date,
          db.account,
          0 as amount,
          NULL as time,
          -1 as id,
          NULL as category
        FROM daily_balances db
        JOIN account_names an ON db.account = an.account
        WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE account = db.account AND date = db.date AND (type IS NULL OR type != 'INITIAL_BALANCE'))
      )
      SELECT
        date,
        account,
        COALESCE(
          (SELECT balance FROM daily_balances WHERE account = trend_data.account AND date = trend_data.date),
          SUM(amount) OVER (PARTITION BY account ORDER BY date, time NULLS FIRST, id)
        ) as balance,
        amount,
        category
      FROM trend_data
      ORDER BY date ASC, time ASC NULLS FIRST, id ASC
    `);
    return res.rows;
  } catch (err) {
    console.error('Error fetching trend:', err);
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

export const upsertAIModel = async (name, displayName, description) => {
  try {
    await pool.query(
      'INSERT INTO ai_models (name, display_name, description, updated_at) VALUES (\$1, \$2, \$3, CURRENT_TIMESTAMP) ON CONFLICT (name) DO UPDATE SET display_name = \$2, description = \$3, updated_at = CURRENT_TIMESTAMP',
      [name, displayName, description]
    );
  } catch (err) {
    console.error('Error upserting AI model:', err);
    throw err;
  }
};

export const getAIModels = async () => {
  try {
    const res = await pool.query('SELECT * FROM ai_models ORDER BY display_name ASC');
    return res.rows;
  } catch (err) {
    console.error('Error fetching AI models:', err);
    return [];
  }
};

export const updateTransactionRuleViolations = async (id, violations) => {
  try {
    const res = await pool.query(
      `UPDATE transactions
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{rule_violations}',
         $2::jsonb
       )
       WHERE id = $1 RETURNING *`,
      [id, JSON.stringify(violations)]
    );
    return res.rows[0];
  } catch (err) {
    console.error('Error updating transaction rule violations:', err);
    throw err;
  }
};

export const updateTransactionAnomaly = async (id, isAnomalous, reason) => {
  try {
    const res = await pool.query(
      `UPDATE transactions
       SET metadata = jsonb_set(
         jsonb_set(
           COALESCE(metadata, '{}'::jsonb),
           '{is_anomalous}',
           to_jsonb($2::boolean)
         ),
         '{anomaly_reason}',
         to_jsonb($3::text)
       )
       WHERE id = $1 RETURNING *`,
      [id, isAnomalous, reason || '']
    );
    return res.rows[0];
  } catch (err) {
    console.error('Error updating transaction anomaly:', err);
    throw err;
  }
};

export const resolveTransactionDeviation = async (id, status) => {
  try {
    const res = await pool.query(
      `UPDATE transactions
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{review_status}',
         to_jsonb($2::text)
       )
       WHERE id = $1 RETURNING *`,
      [id, status]
    );
    return res.rows[0];
  } catch (err) {
    console.error('Error resolving transaction deviation:', err);
    throw err;
  }
};

export const updateTransactionCategory = async (id, category) => {
  try {
    const res = await pool.query(
      `UPDATE transactions 
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb), 
         '{ai_category}', 
         to_jsonb($2::text)
       ) 
       WHERE id = $1 RETURNING *`,
      [id, category]
    );
    return res.rows[0];
  } catch (err) {
    console.error('Error updating transaction category:', err);
    throw err;
  }
};
