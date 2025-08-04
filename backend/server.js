// backend/server.js
//------------------------------------------------------------
// Core imports
//------------------------------------------------------------
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');
require('dotenv').config();          // Loads variables from .env

//------------------------------------------------------------
// Initialise the app
//------------------------------------------------------------
const app = express();

//------------------------------------------------------------
// Global middleware
//------------------------------------------------------------
app.use(cors());                     // Allow requests from all origins during development
app.use(express.json());             // Parse incoming JSON bodies
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'))
);                                   // Serve uploaded files if you ever need direct access

//------------------------------------------------------------
// Connect to MongoDB
//------------------------------------------------------------
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✅  Connected to MongoDB'))
  .catch((err) => {
    console.error('❌  MongoDB connection error:', err.message);
    process.exit(1);
  });

//------------------------------------------------------------
// Basic health-check route
//------------------------------------------------------------
app.get('/', (_req, res) => res.send('API running'));

//------------------------------------------------------------
// Mount REST API routes
//------------------------------------------------------------
app.use('/api/auth',   require('./routes/auth'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/tasks',  require('./routes/tasks'));

//------------------------------------------------------------
// Start the server
//------------------------------------------------------------
const PORT = process.env.PORT || 4000;  // default to 4000 if .env missing
app.listen(PORT, () => {
  console.log(`🚀  Server listening on http://localhost:${PORT}`);
});
