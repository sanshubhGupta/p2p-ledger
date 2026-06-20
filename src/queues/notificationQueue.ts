import { Queue } from 'bullmq';

const connection = {
  host: '127.0.0.1',
  port: 6379,
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
