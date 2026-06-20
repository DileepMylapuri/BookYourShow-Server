// const express = require('express');
// const axios = require('axios');
// const dotenv = require('dotenv');
// const cors = require('cors');

// dotenv.config();

// const app = express();
// app.use(cors());

// const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
// const TMDB_HEADERS = {
//   accept: 'application/json',
//   Authorization: `Bearer ${process.env.API_READ_ACCESS_TOKEN}`,
// };

// // 1. Popular Movies
// app.get('/api/movies', async (req, res) => {
//   try {
//     const response = await axios.get(`${TMDB_BASE_URL}/movie/popular`, { headers: TMDB_HEADERS });
//     res.json(response.data);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // 2. Search Movies
// app.get('/api/search', async (req, res) => {
//   try {
//     const query = req.query.q;
//     if (!query) return res.status(400).json({ error: 'Query parameter is required' });

//     const response = await axios.get(`${TMDB_BASE_URL}/search/movie?query=${encodeURIComponent(query)}`, {
//       headers: TMDB_HEADERS,
//     });

//     res.json(response.data);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // 3. Movie Details
// app.get('/api/movie/:id', async (req, res) => {
//   try {
//     const movieId = req.params.id;
//     const response = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, { headers: TMDB_HEADERS });
//     res.json(response.data);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // 4. Recommended Movies
// app.get('/api/movie/:id/recommendations', async (req, res) => {
//   try {
//     const movieId = req.params.id;
//     const response = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}/recommendations`, { headers: TMDB_HEADERS });
//     res.json(response.data);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });



// // 5. Movie Credits (cast & crew)
// app.get('/api/movie/:id/credits', async (req, res) => {
//   try {
//     const movieId = req.params.id;
//     const response = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}/credits`, {
//       headers: TMDB_HEADERS,
//     });
//     res.json(response.data); // returns { cast: [...], crew: [...] }
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // 6. Movie Reviews
// app.get('/api/movie/:id/reviews', async (req, res) => {
//   try {
//     const movieId = req.params.id;
//     const response = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}/reviews`, {
//       headers: TMDB_HEADERS,
//     });
//     res.json(response.data); // returns { results: [...] }
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // Use dynamic port for deployment (preferred)
// const PORT = process.env.PORT || 4000;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
