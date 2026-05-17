// api.js
const express = require("express");
const bcrypt = require("bcryptjs");
const { connectToDb, getDb } = require("./database");

const app = express();
const port = 4000;

app.use(express.json());

const cors = require("cors");

app.use(cors({
  origin: "http://localhost:5173", // your React app's URL
  methods: ["GET", "POST"],         // Methods you allow
  credentials: true                 // If you need cookies/auth headers
}));

connectToDb(async (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  const db = getDb();
  const usersCollection = db.collection("UserData"); // Recommended collection name

  app.post("/api/signup", async (req, res) => {
    try {
      const { email, username, password } = req.body;
      if (!email || !username || !password) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Check if user exists
      const existingUser = await usersCollection.findOne({
        $or: [{ email }, { username }],
      });

      if (existingUser) {
        return res.status(409).json({
          message: "Email or username already registered. Please login.",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = { email, username, password: hashedPassword };
      await usersCollection.insertOne(newUser);
      res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/login", async (req, res) => {
    try {
      const { emailOrUsername, password } = req.body;
      if (!emailOrUsername || !password) {
        return res.status(400).json({ message: "Missing credentials" });
      }

      const user = await usersCollection.findOne({
        $or: [{ email: emailOrUsername }, { username: emailOrUsername }],
      });

      if (!user) {
        return res.status(401).json({ message: "User not found. Please register." });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid password" });
      }

      res.status(200).json({
        message: "Login successful",
        user: { email: user.email, username: user.username },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.listen(port, () => {
    console.log(`User auth server running on port ${port}`);
  });
});
