import { Queue, FlowProducer } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.VALKEY_URL || 'valkey://localhost:6379', {
  maxRetriesPerRequest: null,
});

connection.on('connect', () => {
  console.log('Valkey (Redis) connected successfully in Backend');
});

connection.on('error', (err) => {
  console.error('Valkey (Redis) connection error in Backend:', err.message);
});

export const aiQueue = new Queue('ai-processing', { connection });
export const localCategorizationQueue = new Queue('local-categorization', { connection });
export const aiCategorizationQueue = new Queue('ai-categorization', { connection });
export const anomalyDetectionQueue = new Queue('anomaly-detection', { connection });
export const detectSubscriptionsQueue = new Queue('detect-subscriptions', { connection });
export const pontoQueue = new Queue('ponto-sync', { connection });
export const flowProducer = new FlowProducer({ connection });
