import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

// 1. Set up the pg connection pool using your environment variable
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

// 2. Instantiate the Prisma driver adapter for PostgreSQL
const adapter = new PrismaPg(pool);

// 3. Pass the adapter directly into the PrismaClient constructor
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Upsert Alice
  const alice = await prisma.user.upsert({
    where: { email: 'alice@test.com' },
    update: {}, 
    create: {
      name: 'Alice',
      email: 'alice@test.com',
      wallet: {
        create: {
          balance: 1000,
        },
      },
    },
    include: {
      wallet: true,
    },
  });

  // 2. Upsert Bob
  const bob = await prisma.user.upsert({
    where: { email: 'bob@test.com' },
    update: {}, 
    create: {
      name: 'Bob',
      email: 'bob@test.com',
      wallet: {
        create: {
          balance: 1000,
        },
      },
    },
    include: {
      wallet: true,
    },
  });

  console.log('✅ Seeding completed successfully!\n');
  console.log('--- TEST DATA ---');
  console.log(`🧍 Alice ID: ${alice.id}`);
  console.log(`👛 Alice Wallet ID: ${alice.wallet?.id} (Balance: ${alice.wallet?.balance})`);
  console.log('-----------------');
  console.log(`🧍 Bob ID: ${bob.id}`);
  console.log(`👛 Bob Wallet ID: ${bob.wallet?.id} (Balance: ${bob.wallet?.balance})`);
  console.log('-----------------\n');
  console.log('⚠️ SAVE THESE WALLET IDs FOR POSTMAN TESTING ⚠️');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    // 4. Clean up both connections gracefully
    await prisma.$disconnect();
    await pool.end();
  });