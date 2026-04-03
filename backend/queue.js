import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.VALKEY_URL || 'valkey://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const aiQueue = new Queue('ai-processing', { connection });
