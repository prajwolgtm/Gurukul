import { spawn } from 'child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { ROLES } from '../utils/roles.js';

const PORT = process.env.PORT || '3001';
const JWT_SECRET = process.env.JWT_SECRET || 'local_dev_jwt_secret_change_me';

const seedAccounts = async (mongoUri) => {
  await mongoose.connect(mongoUri, {
    autoIndex: true,
    serverSelectionTimeoutMS: 5000
  });

  const accounts = [
    {
      fullName: 'System Administrator',
      email: 'admin@demo.com',
      password: 'admin123',
      role: ROLES.ADMIN,
      employeeId: 'ADM-DEMO'
    },
    {
      fullName: 'System Administrator',
      email: 'admin@gurukul.edu',
      password: 'admin123',
      role: ROLES.ADMIN,
      employeeId: 'ADM001'
    },
    {
      fullName: 'Hostel Coordinator',
      email: 'coordinator@gurukul.edu',
      password: 'coord123',
      role: ROLES.COORDINATOR,
      employeeId: 'COORD001'
    }
  ];

  for (const account of accounts) {
    const exists = await User.findOne({ email: account.email });
    if (!exists) {
      await User.create({
        ...account,
        isVerified: true,
        accountStatus: 'verified',
        verifiedAt: new Date()
      });
      console.log(`Seeded account: ${account.email}`);
    }
  }

  await mongoose.disconnect();
};

const main = async () => {
  const mongod = await MongoMemoryServer.create({
    instance: {
      dbName: 'gurukul-local'
    }
  });
  const mongoUri = mongod.getUri();

  await seedAccounts(mongoUri);

  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MONGO_URI: mongoUri,
      PORT,
      NODE_ENV: 'development',
      JWT_SECRET,
      CORS_ORIGIN: 'http://localhost:3000'
    },
    stdio: 'inherit'
  });

  const shutdown = async () => {
    child.kill('SIGTERM');
    await mongod.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  child.on('exit', async (code) => {
    await mongod.stop();
    process.exit(code ?? 0);
  });
};

main().catch((error) => {
  console.error('Failed to start local dev server:', error);
  process.exit(1);
});
