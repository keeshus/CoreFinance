import express from 'express';
import cors from 'cors';
import { initDb, pool } from './db.js';
import transactionRoutes from './routes/transactions.js';
import settingsRoutes from './routes/settings.js';
import uploadRoutes from './routes/upload.js';
import rulesRoutes from './routes/rules.js';
import jobRoutes from './routes/jobs.js';

const app = express();
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
app.use('/api/transactions', transactionRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/rules', rulesRoutes);
app.use('/api/jobs', jobRoutes);

const startServer = async () => {
  try {
    await initDb();
    app.listen(port, () => {
      console.log(`Backend listening at http://0.0.0.0:${port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();
