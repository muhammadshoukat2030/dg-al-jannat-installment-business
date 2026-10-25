const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected) return mongoose.connection;
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set in environment variables');
  }
  const conn = await mongoose.connect(process.env.MONGODB_URI, {
    maxPoolSize: 10,
  });
  isConnected = conn.connections[0].readyState === 1;
  console.log(`MongoDB connected: ${conn.connection.host}`);
  return conn;
}

module.exports = connectDB;
