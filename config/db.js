import mongoose from 'mongoose';

export const connectDB = async (retries = 5) => {
  const uri = process.env.MONGO_URI;
  
  if (!uri) {
    console.error('❌ MONGO_URI environment variable is missing');
    throw new Error('MONGO_URI environment variable is missing');
  }

  // Validate MongoDB URI format
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    console.error('❌ Invalid MongoDB URI format. Must start with mongodb:// or mongodb+srv://');
    throw new Error('Invalid MongoDB URI format');
  }
  
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await mongoose.connect(uri, { 
        autoIndex: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      
      console.log('🗄️  MongoDB connected successfully!');
      console.log(`   Host: ${conn.connection.host}`);
      console.log(`   Database: ${conn.connection.name}`);
      return conn;
    } catch (error) {
      console.error(`❌ MongoDB connection attempt ${i + 1}/${retries} failed:`, error.message);
      
      if (i === retries - 1) {
        console.error('❌ Failed to connect to MongoDB after multiple attempts. Exiting...');
        console.error('   Please check:');
        console.error('   1. MongoDB connection string in .env file');
        console.error('   2. Network connectivity');
        console.error('   3. MongoDB Atlas IP whitelist (if using Atlas)');
        process.exit(1);
      }
      
      // Wait before retrying (exponential backoff)
      const waitTime = Math.min(1000 * Math.pow(2, i), 10000);
      console.log(`   Retrying in ${waitTime / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}; 