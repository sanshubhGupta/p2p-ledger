import dotenv from 'dotenv';
dotenv.config();

const requiredVars = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'PORT', 'NODE_ENV'];

for (const var_ of requiredVars) {
  if (!process.env[var_]) {
    throw new Error(`Missing required environment variable: ${var_}`);
  }
}

const nodeEnv = process.env.NODE_ENV as string;
if (!['development', 'production', 'test'].includes(nodeEnv)) {
  throw new Error(`Invalid NODE_ENV: "${nodeEnv}". Must be one of: development, production, test`);
}

export const config = {
  databaseUrl: process.env.DATABASE_URL as string,
  redisUrl: process.env.REDIS_URL as string,
  jwtSecret: process.env.JWT_SECRET as string,
  port: parseInt(process.env.PORT as string, 10),
  nodeEnv: nodeEnv as 'development' | 'production' | 'test',
};