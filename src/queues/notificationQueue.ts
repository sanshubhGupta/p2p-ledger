import { Queue } from 'bullmq';
import 'dotenv/config';

const connection = {
  host: new URL(process.env.REDIS_URL || 'redis://127.0.0.1:6379').hostname,
  port: Number(new URL(process.env.REDIS_URL || 'redis://127.0.0.1:6379').port) || 6379,
};

const notificationQueue = new Queue('transaction-notifications', {
  connection,
});

export interface NotificationJobData {
  transactionId: string;
  senderEmail: string;
  receiverEmail: string;
  amount: string;
  timestamp: string;
}

export async function addNotificationJob(data: NotificationJobData): Promise<void> {
  await notificationQueue.add('send-notification', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  });
  console.log('Notification job enqueued for transaction: ' + data.transactionId);
}

export default notificationQueue;