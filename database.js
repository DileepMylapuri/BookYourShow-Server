// database.js
const { MongoClient } = require('mongodb');

let databaseConnection;

module.exports = {
  connectToDb: (cb) => {
    console.log("MONGO_URI:", process.env.MONGO_URI ? "✅ Found" : "❌ Missing");
    MongoClient.connect(process.env.MONGO_URI || "mongodb://localhost:27017")
      .then((client) => {
        databaseConnection = client.db('UserData');
        console.log('✅ MongoDB Connected to UserData...');
        return cb();
      })
      .catch((error) => {
        console.error('MongoDB connection error:', error);
        return cb(error);
      });
  },
  getDb: () => databaseConnection,
};