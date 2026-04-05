import express from 'express';
import { getJob, getJobs, deleteJob, getTransactionsByIds, updateJob } from '../db.js';
import { aiQueue } from '../queue.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const jobs = await getJobs();
    res.json(jobs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const job = await getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteJob(req.params.id);
    res.json({ message: 'Job deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

router.post('/:id/retry', async (req, res) => {
  try {
    const job = await getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Optional: Log if we're retrying a job that was already processing
    if (job.status === 'processing') {
      console.warn(`[Jobs] Retrying a job that is already in processing state: ${job.id}`);
    }

    const transactionIds = job.payload?.transactionIds;
    if (!transactionIds || transactionIds.length === 0) {
      return res.status(400).json({ error: 'Job has no transaction payload for retry' });
    }

    const transactions = await getTransactionsByIds(transactionIds);
    if (transactions.length === 0) {
      return res.status(400).json({ error: 'No transactions found for this job' });
    }

    const disableAnomalyDetection = job.payload?.disableAnomalyDetection || false;

    // Reset job state
    await updateJob(job.id, { 
      status: 'pending', 
      progress: 0, 
      log: 'Retrying job...',
      clearError: true 
    });

    // Start background process via BullMQ
    await aiQueue.add('analyze', {
      transactions: transactions,
      jobId: job.id,
      disableAnomalyDetection
    });

    res.json({ message: 'Job retry started', job_id: job.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retry job' });
  }
});

export default router;
