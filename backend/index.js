import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initDb, pool } from '../shared/db.js';
import { workerRegistry } from '../shared/workerRegistry.js';
import transactionRoutes from './routes/transactions.js';
import settingsRoutes from './routes/settings.js';
import uploadRoutes from './routes/upload.js';
import rulesRoutes from './routes/rules.js';
import jobRoutes from './routes/jobs.js';
import pontoRoutes from './routes/ponto.js';
import authRoutes from './routes/auth.js';
import notificationsRoutes from './routes/notifications.js';
import subscriptionRoutes from './routes/subscriptions.js';
import { authenticateToken } from './middleware/auth.js';
import { pontoQueue } from '../shared/queue.js';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
const port = 3000;

app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      message: 'Core Finance API is running',
      database_time: result.rows[0].now 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error connecting to database' });
  }
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Register Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Middleware for internal worker authentication
const authenticateWorker = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const internalApiKey = process.env.INTERNAL_API_KEY;
  
  if (!internalApiKey) {
    console.error('INTERNAL_API_KEY is not set. Worker authentication will fail.');
    return res.status(500).json({ error: 'Internal server configuration error' });
  }
  
  if (!apiKey || apiKey !== internalApiKey) {
    return res.status(401).json({ error: 'Unauthorized worker' });
  }
  next();
};

app.post('/api/workers/ping', authenticateWorker, (req, res) => {
  const { workerId, metadata } = req.body;
  if (!workerId) return res.status(400).json({ error: 'workerId required' });
  workerRegistry.ping(workerId, metadata);
  res.json({ success: true });
});

app.get('/api/workers', (req, res) => {
  res.json(workerRegistry.getWorkers());
});

app.use('/api/auth', authRoutes);
app.use('/api/transactions', authenticateToken, transactionRoutes);
app.use('/api/settings', authenticateToken, settingsRoutes);
app.use('/api/upload', authenticateToken, uploadRoutes);
app.use('/api/rules', authenticateToken, rulesRoutes);
app.use('/api/jobs', authenticateToken, jobRoutes);
app.use('/api/integrations/ponto', authenticateToken, pontoRoutes);
app.use('/api/notifications', authenticateToken, notificationsRoutes);
app.use('/api/subscriptions', authenticateToken, subscriptionRoutes);

const startServer = async () => {
  // Start listening immediately so healthchecks pass while we initialize
  app.listen(port, () => {
    console.log(`Backend listening at http://0.0.0.0:${port}`);
  });
  try {
    const dbUrl = process.env.DATABASE_URL || '';
    const maskedUrl = dbUrl.replace(/:([^@]+)@/, ':****@');
    console.log(`[Backend] Starting with DATABASE_URL: ${maskedUrl}`);
    
    await initDb();
    
    // Schedule Ponto Sync daily at 04:00 AM
    // We pass empty data because the worker will create a database job record when it actually triggers
    await pontoQueue.add('ponto-sync',
      {},
      {
        repeat: { pattern: '0 4 * * *' },
        jobId: 'ponto-daily-sync' // Fixed ID to prevent duplicates
      }
    );
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();
