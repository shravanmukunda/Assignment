const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Agent = require('../models/Agent');
const SubAgent = require('../models/SubAgent');
const router = express.Router();

// Login route - handles admin, agent, and sub-agent login
// Add role-based login restrictions
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body; // Add role to login request

    // Validate that role is provided
    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }

    let user = null;
    let userType = null;

    // Check based on requested role
    if (role === 'admin') {
      user = await User.findOne({ email });
      if (user) userType = 'admin';
    } else if (role === 'agent') {
      user = await Agent.findOne({ email });
      if (user) userType = 'agent';
    } else if (role === 'sub-agent') {
      user = await SubAgent.findOne({ email }).populate('parentAgent');
      if (user) userType = 'sub-agent';
    } else {
      return res.status(400).json({ message: 'Invalid role specified' });
    }

    // Ensure user exists and role matches
    if (!user || userType !== role) {
      return res.status(400).json({ message: 'Invalid credentials or unauthorized role access' });
    }

    // Rest of your login logic...
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: userType },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: userType,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router;
