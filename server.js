const express = require("express");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const cors = require("cors");
const { connectToDb, getDb } = require("./database");
const nodemailer = require("nodemailer");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      // Allow localhost and any onrender.com subdomain
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith(".onrender.com") ||
        origin.endsWith(".vercel.app") ||
        origin.endsWith(".netlify.app")
      ) {
        return callback(null, true);
      }
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    credentials: true,
  })
);

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_HEADERS = {
  accept: "application/json",
  Authorization: `Bearer ${process.env.API_READ_ACCESS_TOKEN}`,
};

function getCollection(name) {
  const db = getDb();
  if (!db) throw new Error("Database not connected yet. Please try again.");
  return db.collection(name);
}

// ── TMDB routes (no DB needed) ──────────────────────────────────────

app.get("/api/movies", async (req, res) => {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/movie/popular`, { headers: TMDB_HEADERS });
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/search", async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Query parameter is required" });
    const response = await axios.get(
      `${TMDB_BASE_URL}/search/movie?query=${encodeURIComponent(query)}`,
      { headers: TMDB_HEADERS }
    );
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/movie/:id", async (req, res) => {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/movie/${req.params.id}`, { headers: TMDB_HEADERS });
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/movie/:id/recommendations", async (req, res) => {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/movie/${req.params.id}/recommendations`, { headers: TMDB_HEADERS });
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/movie/:id/credits", async (req, res) => {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/movie/${req.params.id}/credits`, { headers: TMDB_HEADERS });
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/movie/:id/reviews", async (req, res) => {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/movie/${req.params.id}/reviews`, { headers: TMDB_HEADERS });
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/movie/:id/videos", async (req, res) => {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/movie/${req.params.id}/videos`, { headers: TMDB_HEADERS });
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/movies/recent", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const response = await axios.get(
      `${TMDB_BASE_URL}/discover/movie?region=IN&sort_by=release_date.desc&release_date.lte=${today}`,
      { headers: TMDB_HEADERS }
    );
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Auth routes ──────────────────────────────────────────────────────

app.post("/api/signup", async (req, res) => {
  try {
    const usersCollection = getCollection("UserData");
    const { email, username, password } = req.body;
    if (!email || !username || !password)
      return res.status(400).json({ message: "Missing required fields" });

    const existingUser = await usersCollection.findOne({ $or: [{ email }, { username }] });
    if (existingUser)
      return res.status(409).json({ message: "Email or username already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    await usersCollection.insertOne({ email, username, password: hashedPassword });
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const usersCollection = getCollection("UserData");
    const { emailOrUsername, password } = req.body;
    if (!emailOrUsername || !password)
      return res.status(400).json({ message: "Missing credentials" });

    const user = await usersCollection.findOne({
      $or: [{ email: emailOrUsername }, { username: emailOrUsername }],
    });
    if (!user)
      return res.status(401).json({ message: "User not found. Please register." });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword)
      return res.status(401).json({ message: "Invalid password" });

    res.status(200).json({
      message: "Login successful",
      user: { email: user.email, username: user.username },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
});

// ── Email route ──────────────────────────────────────────────────────

app.post("/api/send-booking-email", async (req, res) => {
  try {
    const { email, username, movie, theater, showDateTime, seats, totalAmount } = req.body;
    console.log("📧 Sending booking email to:", email, "| Movie:", movie?.title);
    console.log("📧 EMAIL_USER:", process.env.EMAIL_USER);
    console.log("📧 EMAIL_PASS set:", !!process.env.EMAIL_PASS);

    if (!email || !movie || !theater || !seats)
      return res.status(400).json({ error: "Incomplete required booking details" });

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS)
      return res.status(500).json({ error: "Email service not configured" });

    const seatList = Array.isArray(seats)
      ? seats.map((s) => s.seatId || s).join(", ")
      : "N/A";
    const formattedAmount = Number(totalAmount || 0).toFixed(2);
    const posterUrl = movie.poster_path
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : "https://via.placeholder.com/500x750?text=No+Poster";

    const htmlContent = `
  <div style="background-color:#f0f0f0;padding:20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:480px;margin-bottom:12px;">
      <tr><td style="background-color:#FFD740;border-radius:10px;padding:14px 16px;">
        <p style="margin:0;font-size:13.5px;font-weight:500;color:#1a1a1a;">
          Ticket shared on the contact details provided, have it handy on your phone while entering the venue
        </p>
      </td></tr>
    </table>
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:480px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">
      <tr><td style="padding:20px;">
        <table width="100%" border="0" cellpadding="0" cellspacing="0"><tr>
          <td width="90" style="vertical-align:top;padding-right:16px;">
            <img src="${posterUrl}" alt="Poster" width="90" style="border-radius:8px;height:120px;object-fit:cover;">
          </td>
          <td style="vertical-align:top;">
            <h2 style="margin:0 0 8px;font-size:17px;font-weight:700;color:#1a1a1a;">${movie.title}</h2>
            <p style="margin:0 0 5px;font-size:13px;color:#555;">${showDateTime}</p>
            <p style="margin:0;font-size:13px;color:#555;">${theater.name}</p>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:12px 20px;text-align:center;">
        <p style="margin:0;font-size:14px;font-weight:700;color:#1a1a1a;">Seats: ${seatList}</p>
      </td></tr>
      <tr><td style="border-top:1px solid #eee;padding:12px 20px;">
        <table width="100%" border="0" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:15px;font-weight:600;color:#1a1a1a;">Total Amount</td>
          <td style="text-align:right;font-size:15px;font-weight:600;color:#1a1a1a;">&#8377;${formattedAmount}</td>
        </tr></table>
      </td></tr>
    </table>
  </div>`;

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"BookYourShow" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `🍿 Booking Confirmed: ${movie.title}`,
      html: htmlContent,
    });

    console.log("✅ Email sent successfully to:", email);
    return res.status(200).json({ message: "Booking email sent successfully!" });
  } catch (error) {
    console.error("❌ Email sending failed:", error.message);
    res.status(500).json({ message: "Failed to send booking email", error: error.message });
  }
});

// ── Booking routes ───────────────────────────────────────────────────

app.get("/api/bookings", async (req, res) => {
  try {
    const { movieId, theater, date, time } = req.query;
    if (!movieId || !theater || !date || !time)
      return res.status(400).json({ error: "Missing query params" });
    const bookingsCollection = getCollection("Bookings");
    const docs = await bookingsCollection.find({ movieId, theater, date, time }).toArray();
    res.json({ bookedSeats: docs.flatMap((d) => d.seats) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/bookings", async (req, res) => {
  try {
    const { movieId, movieTitle, posterPath, theater, date, time, seats, email, totalAmount } = req.body;
    if (!movieId || !theater || !date || !time || !seats?.length)
      return res.status(400).json({ error: "Missing booking data" });
    const bookingsCollection = getCollection("Bookings");
    await bookingsCollection.insertOne({
      movieId, movieTitle: movieTitle || "", posterPath: posterPath || "",
      theater, date, time, seats, email: email || "",
      totalAmount: totalAmount || 0, bookedAt: new Date(),
    });
    res.status(201).json({ message: "Seats booked successfully" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/my-bookings", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email is required" });
    const bookingsCollection = getCollection("Bookings");
    const bookings = await bookingsCollection.find({ email }).sort({ bookedAt: -1 }).toArray();
    res.json({ bookings });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Start server & connect DB ────────────────────────────────────────

app.listen(PORT, () =>
  console.log(`🚀 Backend running on http://localhost:${PORT}`)
);

connectToDb((err) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
    return;
  }
  console.log("✅ Database connected");
});
