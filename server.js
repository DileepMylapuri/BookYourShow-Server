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
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://bookyourshow-client.onrender.com",
    ],
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
  const bookingsCollection = db.collection("Bookings");

  // Get booked seats for a specific movie + theater + showtime slot
  app.get("/api/seats", async (req, res) => {
    try {
      const { movieId, theaterId, showDateTime } = req.query;
      if (!movieId || !theaterId || !showDateTime) {
        return res.status(400).json({ message: "movieId, theaterId and showDateTime are required" });
      }
      const bookings = await bookingsCollection
        .find({ movieId, theaterId, showDateTime })
        .toArray();
      const bookedSeats = bookings.flatMap((b) => b.seats.map((s) => s.seatId || s));
      res.json({ bookedSeats });
    } catch (error) {
      console.error("Get seats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Save a booking after payment
  app.post("/api/book-seats", async (req, res) => {
    try {
      const { movieId, theaterId, showDateTime, seats, email, username } = req.body;
      if (!movieId || !theaterId || !showDateTime || !seats || !seats.length) {
        return res.status(400).json({ message: "Missing required booking fields" });
      }
      await bookingsCollection.insertOne({
        movieId,
        theaterId,
        showDateTime,
        seats,
        email,
        username,
        bookedAt: new Date(),
      });
      res.status(201).json({ message: "Seats booked successfully" });
    } catch (error) {
      console.error("Book seats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

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
      <div style="background-color: #f4f4f4; padding: 20px; font-family: Helvetica, Arial, sans-serif;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color: #f32005; padding: 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Booking Confirmed!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="150" style="vertical-align: top; padding-right: 20px;">
                    <img src="${posterUrl}" alt="Poster" width="150" style="border-radius: 8px; display: block;">
                  </td>
                  <td style="vertical-align: top;">
                    <h2 style="margin: 0 0 10px 0; font-size: 20px; color: #333;">${movie.title}</h2>
                    <p style="margin: 5px 0; font-size: 14px; color: #666;"><strong>Theater:</strong> ${theater.name}</p>
                    <p style="margin: 5px 0; font-size: 14px; color: #666;"><strong>Time:</strong> ${showDateTime}</p>
                    <p style="margin: 5px 0; font-size: 14px; color: #666;"><strong>Seats:</strong> ${seatList}</p>
                    <p style="margin: 15px 0 0 0; font-size: 18px; color: #f32005; font-weight: bold;">Total: ₹${formattedAmount}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <img src="cid:bookyourshowimage" alt="Logo" width="120">
              <p style="font-size: 12px; color: #999; margin-top: 15px;">Address: ${theater.address}</p>
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



  // Start server only after DB connects
  app.listen(PORT, () =>
    console.log(`🚀 Backend running on http://localhost:${PORT}`)
  );
});
 