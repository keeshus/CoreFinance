import express from 'express';
import { getJob, getJobs, deleteJob, getTransactionsByIds, updateJob } from '../../shared/db.js';
import { aiQueue, pontoQueue } from '../../shared/queue.js';

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
    const job = await getJob(req.params.id);
    
    // First remove from database
    await deleteJob(req.params.id);

    // Then try to remove from BullMQ if it exists there
    // We try both queues as we don't strictly know which one it belongs to without checking type
    // BullMQ jobs in these queues are added with the database jobId as a property in data, 
    // but BullMQ also has its own internal IDs. 
    // However, some of our code (like retry) relies on the DB job.
    
    if (job) {
      const removeBullJob = async (queue, id) => {
        const bullJobs = await queue.getJobs(['active', 'waiting', 'completed', 'failed', 'delayed', 'paused']);
        for (const bj of bullJobs) {
          if (bj.data && (bj.data.jobId === id || bj.data.jobId === parseInt(id))) {
            await bj.remove();
            console.log(`[Jobs] Removed BullMQ job ${bj.id} associated with DB job ${id}`);
          }
        }
      };

      await Promise.all([
        removeBullJob(aiQueue, req.params.id),
        removeBullJob(pontoQueue, req.params.id)
      ]).catch(err => console.error('[Jobs] Error cleaning up BullMQ jobs:', err));
    }

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
