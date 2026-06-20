// ioredis client singleton — one Redis connection for the whole app
import Redis from 'ioredis';
import { config } from './env';

const redis = new Redis(config.redisUrl);

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => console.error('Redis error:', err));
redis.on('reconnecting', () => console.log('Redis reconnecting...'));

export default redis;