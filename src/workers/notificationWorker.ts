import { Worker, Queue } from 'bullmq';

const connection = { host: '127.0.0.1', port: 6379 };

// DLQ ensures zero event loss. Ops can inspect 'failed-notifications' queue,
// fix the underlying issue (email provider down), and requeue jobs manually.
const dlqQueue = new Queue('failed-notifications', { connection });

const worker = new Worker(
  'transaction-notifications',
  async (job) => {
    console.log('Processing notification for transaction:', job.data.transactionId);

    // Simulate email API call (replace with Resend/SendGrid in production)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    console.log('Email sent to:', job.data.senderEmail, 'and', job.data.receiverEmail);

    return { success: true, processedAt: new Date().toISOString() };
  },
  { connection }
);

worker.on('completed', (job, result) => {
  console.log('Job completed:', job.id, result);
});

worker.on('failed', async (job, error) => {
  console.log('Job failed:', job?.id, error.message, 'attempts made:', job?.attemptsMade);

  if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
    await dlqQueue.add('failed-job', {
      originalJobId: job.id,
      originalData: job.data,
      failureReason: error.message,
      failedAt: new Date().toISOString(),
      attemptsMade: job.attemptsMade,
    });
    console.log('Job ' + job.id + ' moved to Dead Letter Queue after ' + job.attemptsMade + ' attempts');
  }
});

worker.on('error', (error) => {
  console.log('Worker error:', error);
});

console.log('Notification worker started, waiting for jobs...');
