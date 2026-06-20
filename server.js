// server.js
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
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
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

// 1. Popular Movies
app.get("/api/movies", async (req, res) => {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/movie/popular`, {
      headers: TMDB_HEADERS,
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Search Movies
app.get("/api/search", async (req, res) => {
  try {
    const query = req.query.q;
    if (!query)
      return res.status(400).json({ error: "Query parameter is required" });

    const response = await axios.get(
      `${TMDB_BASE_URL}/search/movie?query=${encodeURIComponent(query)}`,
      { headers: TMDB_HEADERS }
    );

    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Movie Details
app.get("/api/movie/:id", async (req, res) => {
  try {
    const movieId = req.params.id;
    const response = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, {
      headers: TMDB_HEADERS,
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Recommended Movies
app.get("/api/movie/:id/recommendations", async (req, res) => {
  try {
    const movieId = req.params.id;
    const response = await axios.get(
      `${TMDB_BASE_URL}/movie/${movieId}/recommendations`,
      { headers: TMDB_HEADERS }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Movie Credits (cast & crew)
app.get("/api/movie/:id/credits", async (req, res) => {
  try {
    const movieId = req.params.id;
    const response = await axios.get(
      `${TMDB_BASE_URL}/movie/${movieId}/credits`,
      { headers: TMDB_HEADERS }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Movie Reviews
app.get("/api/movie/:id/reviews", async (req, res) => {
  try {
    const movieId = req.params.id;
    const response = await axios.get(
      `${TMDB_BASE_URL}/movie/${movieId}/reviews`,
      { headers: TMDB_HEADERS }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

connectToDb(async (err) => {
  if (err) {
    console.error("❌ Database connection failed:", err);
    process.exit(1);
  }

  const db = getDb();
  const usersCollection = db.collection("UserData");

  // Signup
  app.post("/api/signup", async (req, res) => {
    try {
      const { email, username, password } = req.body;
      if (!email || !username || !password) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const existingUser = await usersCollection.findOne({
        $or: [{ email }, { username }],
      });
      if (existingUser) {
        return res
          .status(409)
          .json({ message: "Email or username already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await usersCollection.insertOne({
        email,
        username,
        password: hashedPassword,
      });

      res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Login
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
        return res
          .status(401)
          .json({ message: "User not found. Please register." });
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

// Mail to payment details person of the movie details

app.post("/api/send-booking-email", async (req, res) => {
  try {
    const { email, username, movie, theater, showDateTime, seats, totalAmount } = req.body;
    console.log("📧 Sending booking email to:", email, "| Movie:", movie?.title);

    if (!email || !movie || !theater || !seats)
      return res.status(400).json({ error: "Incomplete required booking details" });

    const seatList = Array.isArray(seats) 
      ? seats.map((s) => s.seatId || s).join(", ") 
      : "N/A";
    const formattedAmount = Number(totalAmount || 0).toFixed(2);

    const posterUrl = movie.poster_path
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : "https://via.placeholder.com/500x750?text=No+Poster";

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: { rejectUnauthorized: false },
    });

const htmlContent = `
  <div style="background-color: #f0f0f0; padding: 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; min-height: 100vh;">

    <!-- Yellow Alert Banner -->
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 480px; margin-bottom: 12px;">
      <tr>
        <td style="background-color: #FFD740; border-radius: 10px; padding: 14px 16px;">
          <table width="100%" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td width="48" style="vertical-align: middle; padding-right: 12px;">
                <!-- QR Phone Icon SVG -->
                <div style="background:#fff; border-radius:8px; width:42px; height:42px; display:inline-flex; align-items:center; justify-content:center; text-align:center;">
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="3" width="9" height="9" rx="1.5" stroke="#333" stroke-width="1.5"/>
                    <rect x="5" y="5" width="5" height="5" fill="#333" rx="0.5"/>
                    <rect x="16" y="3" width="9" height="9" rx="1.5" stroke="#333" stroke-width="1.5"/>
                    <rect x="18" y="5" width="5" height="5" fill="#333" rx="0.5"/>
                    <rect x="3" y="16" width="9" height="9" rx="1.5" stroke="#333" stroke-width="1.5"/>
                    <rect x="5" y="18" width="5" height="5" fill="#333" rx="0.5"/>
                    <rect x="16" y="16" width="3" height="3" fill="#333" rx="0.5"/>
                    <rect x="22" y="16" width="3" height="3" fill="#333" rx="0.5"/>
                    <rect x="19" y="19" width="3" height="3" fill="#333" rx="0.5"/>
                    <rect x="22" y="22" width="3" height="3" fill="#333" rx="0.5"/>
                  </svg>
                </div>
              </td>
              <td style="vertical-align: middle;">
                <p style="margin: 0; font-size: 13.5px; font-weight: 500; color: #1a1a1a; line-height: 1.5;">
                  Ticket shared on the contact details provided,<br>
                  have it handy on your phone while entering the venue
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Main Ticket Card -->
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 480px; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.10);">

      <!-- Movie Info Row -->
      <tr>
        <td style="padding: 20px 20px 16px 20px;">
          <table width="100%" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <!-- Poster -->
              <td width="90" style="vertical-align: top; padding-right: 16px;">
                <img src="${posterUrl}" alt="Movie Poster" width="90"
                  style="border-radius: 8px; display: block; height: 120px; object-fit: cover; width: 90px;">
              </td>
              <!-- Details -->
              <td style="vertical-align: top;">
                <h2 style="margin: 0 0 8px 0; font-size: 17px; font-weight: 700; color: #1a1a1a; line-height: 1.3;">${movie.title}</h2>
                <p style="margin: 0 0 5px 0; font-size: 13px; color: #888888;">Telugu, 2D</p>
                <p style="margin: 0 0 5px 0; font-size: 13px; color: #555555;">${showDateTime}</p>
                <p style="margin: 0; font-size: 13px; color: #555555;">${theater.name}</p>
              </td>
              <td width="22" style="vertical-align: middle; text-align: right; padding-left: 8px;">
                <div style="writing-mode: vertical-rl; text-orientation: mixed; transform: rotate(180deg); font-size: 10px; color: #aaaaaa; letter-spacing: 0.5px; white-space: nowrap;">Box Office Pickup</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="position: relative; padding: 0 16px;">
          <table width="100%" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td width="16" style="padding: 0;">
                <div style="width: 16px; height: 16px; background: #f0f0f0; border-radius: 50%; margin-left: -16px;"></div>
              </td>
              <td style="padding: 0 4px;">
                <div style="border-top: 2px dashed #e0e0e0; height: 1px; width: 100%;"></div>
              </td>
              <td width="16" style="padding: 0;">
                <div style="width: 16px; height: 16px; background: #f0f0f0; border-radius: 50%; margin-right: -16px;"></div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding: 14px 20px 4px 20px;">
          <table width="100%" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color: #f5f5f5; border-radius: 8px; padding: 12px; text-align: center;">
                <p style="margin: 0; font-size: 13.5px; color: #555555;">Tap for support, details &amp; more actions</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding: 18px 20px 4px 20px; text-align: center;">
          <p style="margin: 0; font-size: 13.5px; color: #777777;">${seatList.split(',').length} Ticket(s)</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 6px 20px 4px 20px; text-align: center;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #1a1a1a; letter-spacing: 0.5px;">${theater.name}</h2>
        </td>
      </tr>
      <tr>
        <td style="padding: 4px 20px 4px 20px; text-align: center;">
          <p style="margin: 0; font-size: 14px; font-weight: 700; color: #1a1a1a; letter-spacing: 0.3px;">BOOKING ID: ${seatList}</p>
        </td>
      </tr>

      <!-- Booking ID -->
      <tr>
        <td style="padding: 8px 20px 16px 20px; text-align: center;">
        </td>
      </tr>

      <!-- Cancellation Note + Total -->
      <tr>
        <td style="border-top: 1px solid #eeeeee; padding: 12px 20px 0 20px; text-align: center;">
          <p style="margin: 0; font-size: 12.5px; color: #aaaaaa;">Cancellation not available for this venue</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 20px 20px 20px;">
          <table width="100%" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size: 15px; font-weight: 600; color: #1a1a1a;">Total Amount</td>
              <td style="text-align: right; font-size: 15px; font-weight: 600; color: #1a1a1a;">&#8377;${formattedAmount}</td>
            </tr>
          </table>
        </td>
      </tr>

    </table>
  </div>
`;
    // Send email to the user email passed from frontend login session
    await transporter.sendMail({
      from: `"BookYourShow" <${process.env.EMAIL_USER}>`,
      to: email,  // <-- important: send to user's login email
      subject: `🍿 Confirmation: ${movie.title}`,
      html: htmlContent,
      attachments: [  
        {
          filename: "bookyourshow.png",
          path: "https://i.pinimg.com/1200x/77/dc/a3/77dca3af5af13d116d75be3b2e7896b0.jpg",
          cid: "bookyourshowimage",
        },
      ],
    });

    return res.status(200).json({ message: "Booking email sent successfully!" });
  } catch (error) {
    console.error("Email sending failed:", error);
    res.status(500).json({ message: "Failed to send booking email", error: error.message });
  }
});



  // GET booked seats for a specific show
  app.get("/api/bookings", async (req, res) => {
    try {
      const { movieId, theater, date, time } = req.query;
      if (!movieId || !theater || !date || !time) {
        return res.status(400).json({ error: "Missing query params" });
      }
      const bookingsCollection = db.collection("Bookings");
      const docs = await bookingsCollection
        .find({ movieId, theater, date, time })
        .toArray();
      const bookedSeats = docs.flatMap((d) => d.seats);
      res.json({ bookedSeats });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST save booked seats after payment
  app.post("/api/bookings", async (req, res) => {
    try {
      const { movieId, movieTitle, posterPath, theater, date, time, seats, email, totalAmount } = req.body;
      if (!movieId || !theater || !date || !time || !seats?.length) {
        return res.status(400).json({ error: "Missing booking data" });
      }
      const bookingsCollection = db.collection("Bookings");
      await bookingsCollection.insertOne({
        movieId,
        movieTitle: movieTitle || "",
        posterPath: posterPath || "",
        theater,
        date,
        time,
        seats,
        email: email || "",
        totalAmount: totalAmount || 0,
        bookedAt: new Date(),
      });
      res.status(201).json({ message: "Seats booked successfully" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET booking history for a user
  app.get("/api/my-bookings", async (req, res) => {
    try {
      const { email } = req.query;
      if (!email) return res.status(400).json({ error: "Email is required" });
      const bookingsCollection = db.collection("Bookings");
      const bookings = await bookingsCollection
        .find({ email })
        .sort({ bookedAt: -1 })
        .toArray();
      res.json({ bookings });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Start server only after DB connects
  app.listen(PORT, () =>
    console.log(`🚀 Backend running on http://localhost:${PORT}`)
  );
});
 