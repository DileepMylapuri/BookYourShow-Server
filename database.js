// database.js
const { MongoClient, ServerApiVersion } = require('mongodb');

let databaseConnection;

module.exports = {
  connectToDb: (cb) => {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
    const client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      tls: true,
    });

    client.connect()
      .then(() => {
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