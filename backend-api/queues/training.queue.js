// queues/training.queue.js

const { Queue } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
};

// Singleton — uma instância para toda a aplicação
let trainingQueue = null;

function getTrainingQueue() {
  if (!trainingQueue) {
    trainingQueue = new Queue('training', {
      connection,
      prefix: '{tchelab}',
      defaultJobOptions: {
        attempts:    3,
        backoff:     { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },  // mantém os últimos 100 jobs concluídos
        removeOnFail:     { count: 200 },
      },
    });
  }
  return trainingQueue;
}

/**
 * Enfileira um job de treino.
 * @param {object} payload  — o payload completo com model_id, dataset_id, etc.
 * @returns {Promise<Job>}  — o Job do BullMQ com .id
 */
async function addTrainJob(payload) {
  const queue = getTrainingQueue();
  return queue.add('train_model', payload, {
    jobId: `train:${payload.model_id}:${Date.now()}`,
  });
}

async function closeQueue() {
  if (trainingQueue) await trainingQueue.close();
}

module.exports = { getTrainingQueue, addTrainJob, closeQueue };