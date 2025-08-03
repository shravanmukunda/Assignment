const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// Register admin (for initial setup)
router.post('/register', async (req, res) => {
  console.log('=== REGISTER ROUTE START ===');
  console.log('Request body:', req.body);
  
  try {
    const { email, password } = req.body;
    console.log('Extracted email:', email);
    console.log('Extracted password:', password ? 'PROVIDED' : 'MISSING');

    if (!email || !password) {
      console.log('Missing email or password');
      return res.status(400).json({ message: 'Email and password required' });
    }

    console.log('Checking for existing user...');
    const existingUser = await User.findOne({ email });
    console.log('Existing user found:', !!existingUser);
    
    if (existingUser) {
      console.log('User already exists, returning 400');
      return res.status(400).json({ message: 'User already exists' });
    }

    console.log('Creating new user object...');
    const user = new User({
      email,
      password,
      role: 'admin',
    });
    console.log('User object created');

    console.log('Attempting to save user...');
    await user.save();
    console.log('User saved successfully!');

    console.log('Creating JWT token...');
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );
    console.log('Token created');

    console.log('Sending success response...');
    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
    console.log('=== REGISTER ROUTE SUCCESS ===');

  } catch (error) {
    console.error('=== REGISTER ROUTE ERROR ===');
    console.error('Error details:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Create JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
