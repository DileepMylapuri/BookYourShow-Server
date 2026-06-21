const express = require("express");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const cors = require("cors");
const { connectToDb, getDb } = require("./database");
const { Resend } = require("resend");

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
    console.log("📧 RESEND_API_KEY set:", !!process.env.RESEND_API_KEY);

    if (!email || !movie || !theater || !seats)
      return res.status(400).json({ error: "Incomplete required booking details" });

    if (!process.env.RESEND_API_KEY)
      return res.status(500).json({ error: "Email service not configured" });

    const seatList = Array.isArray(seats)
      ? seats.map((s) => s.seatId || s).join(", ")
      : "N/A";
    const seatCount = Array.isArray(seats) ? seats.length : 1;
    const formattedAmount = Number(totalAmount || 0).toFixed(2);
    const posterUrl = movie.poster_path
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : "https://via.placeholder.com/500x750?text=No+Poster";
    const bookingId = "BYS" + Date.now().toString().slice(-8).toUpperCase();
    const showDate = showDateTime?.split(" | ")?.[0] ?? "";
    const showTime = showDateTime?.split(" | ")?.[1] ?? "";

    const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" border="0" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
<tr><td align="center">
<table width="520" border="0" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

  <!-- HEADER -->
  <tr><td style="background:#E8212B;border-radius:12px 12px 0 0;padding:18px 24px;">
    <table width="100%" border="0" cellpadding="0" cellspacing="0"><tr>
      <td>
        <span style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;">book</span><span style="font-size:22px;font-weight:900;color:#FFD700;letter-spacing:-0.5px;">your</span><span style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;">show</span>
      </td>
      <td align="right">
        <span style="font-size:11px;color:rgba(255,255,255,0.85);font-weight:500;">BOOKING CONFIRMED</span><br>
        <span style="font-size:10px;color:rgba(255,255,255,0.65);">#${bookingId}</span>
      </td>
    </tr></table>
  </td></tr>

  <!-- YELLOW NOTICE -->
  <tr><td style="background:#FFF3CD;padding:10px 24px;border-left:4px solid #FFD700;">
    <p style="margin:0;font-size:12px;color:#6B4C00;font-weight:500;">&#128246; Your ticket has been shared on the contact details provided. Please keep it handy at the venue.</p>
  </td></tr>

  <!-- MOVIE SECTION -->
  <tr><td style="background:#fff;padding:20px 24px;">
    <table width="100%" border="0" cellpadding="0" cellspacing="0"><tr>
      <td width="90" style="vertical-align:top;">
        <img src="${posterUrl}" alt="${movie.title}" width="85" style="border-radius:8px;display:block;height:125px;object-fit:cover;box-shadow:0 2px 8px rgba(0,0,0,0.18);">
      </td>
      <td style="vertical-align:top;padding-left:16px;">
        <h2 style="margin:0 0 6px;font-size:18px;font-weight:800;color:#1a1a1a;line-height:1.2;">${movie.title}</h2>
        <p style="margin:0 0 10px;font-size:11px;color:#E8212B;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Hindi | UA</p>
        <table border="0" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:16px;">
              <p style="margin:0;font-size:10px;color:#888;text-transform:uppercase;font-weight:600;letter-spacing:0.4px;">Date</p>
              <p style="margin:3px 0 0;font-size:13px;font-weight:700;color:#1a1a1a;">${showDate}</p>
            </td>
            <td>
              <p style="margin:0;font-size:10px;color:#888;text-transform:uppercase;font-weight:600;letter-spacing:0.4px;">Time</p>
              <p style="margin:3px 0 0;font-size:13px;font-weight:700;color:#1a1a1a;">${showTime}</p>
            </td>
          </tr>
        </table>
        <p style="margin:10px 0 0;font-size:11px;color:#555;">&#128205; ${theater.name}</p>
      </td>
    </tr></table>
  </td></tr>

  <!-- DOTTED DIVIDER (perforated effect) -->
  <tr><td style="background:#fff;position:relative;">
    <table width="100%" border="0" cellpadding="0" cellspacing="0"><tr>
      <td width="22" style="background:#f4f4f4;border-radius:0 50% 50% 0;height:22px;"></td>
      <td style="border-top:2px dashed #ddd;height:1px;"></td>
      <td width="22" style="background:#f4f4f4;border-radius:50% 0 0 50%;height:22px;"></td>
    </tr></table>
  </td></tr>

  <!-- SEAT & TICKET DETAILS -->
  <tr><td style="background:#fff;padding:16px 24px;">
    <table width="100%" border="0" cellpadding="0" cellspacing="0">
      <tr>
        <td style="width:50%;padding-bottom:14px;vertical-align:top;">
          <p style="margin:0;font-size:10px;color:#888;text-transform:uppercase;font-weight:600;letter-spacing:0.4px;">Seats</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:800;color:#1a1a1a;">${seatList}</p>
        </td>
        <td style="width:50%;padding-bottom:14px;vertical-align:top;">
          <p style="margin:0;font-size:10px;color:#888;text-transform:uppercase;font-weight:600;letter-spacing:0.4px;">No. of Tickets</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:800;color:#1a1a1a;">${seatCount}</p>
        </td>
      </tr>
      <tr>
        <td style="vertical-align:top;">
          <p style="margin:0;font-size:10px;color:#888;text-transform:uppercase;font-weight:600;letter-spacing:0.4px;">Booked For</p>
          <p style="margin:4px 0 0;font-size:13px;font-weight:700;color:#1a1a1a;">${username || email}</p>
        </td>
        <td style="vertical-align:top;">
          <p style="margin:0;font-size:10px;color:#888;text-transform:uppercase;font-weight:600;letter-spacing:0.4px;">Booking ID</p>
          <p style="margin:4px 0 0;font-size:13px;font-weight:700;color:#E8212B;">${bookingId}</p>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- TOTAL AMOUNT -->
  <tr><td style="background:#1a1a1a;padding:14px 24px;border-radius:0 0 12px 12px;">
    <table width="100%" border="0" cellpadding="0" cellspacing="0"><tr>
      <td>
        <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.5px;">Total Amount Paid</p>
        <p style="margin:4px 0 0;font-size:22px;font-weight:900;color:#fff;">&#8377;${formattedAmount}</p>
      </td>
      <td align="right">
        <div style="background:#E8212B;border-radius:8px;padding:8px 14px;display:inline-block;">
          <p style="margin:0;font-size:11px;color:#fff;font-weight:700;">&#10003; CONFIRMED</p>
        </div>
      </td>
    </tr></table>
  </td></tr>

  <!-- FOOTER NOTE -->
  <tr><td style="padding:14px 0 4px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#aaa;">This is an automated booking confirmation from <strong>BookYourShow</strong>.</p>
    <p style="margin:4px 0 0;font-size:11px;color:#aaa;">Please carry a valid photo ID to the venue.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: sendError } = await resend.emails.send({
      from: "BookYourShow <onboarding@resend.dev>",
      replyTo: process.env.EMAIL_USER,
      to: email,
      subject: `🍿 Booking Confirmed: ${movie.title}`,
      html: htmlContent,
    });

    if (sendError) {
      console.error("❌ Resend error:", sendError);
      return res.status(500).json({ message: "Failed to send email", error: sendError.message });
    }

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
