const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected) return mongoose.connection;
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('Neither MONGODB_URI nor MONGO_URI is set in environment variables');
  }
  const conn = await mongoose.connect(mongoUri, {
    maxPoolSize: 10,
  });
  isConnected = conn.connections[0].readyState === 1;
  console.log(`MongoDB connected: ${conn.connection.host}`);
  return conn;
}

module.exports = connectDB;
