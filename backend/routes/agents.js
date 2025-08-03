const express = require('express');
const Agent = require('../models/Agent');
const auth = require('../middleware/auth');
const router = express.Router();

// Get all agents
router.get('/', auth, async (req, res) => {
  try {
    const agents = await Agent.find().select('-password');
    res.json(agents);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add new agent
router.post('/', auth, async (req, res) => {
  try {
    const { name, email, mobile, password } = req.body;

    // Check if agent already exists
    const existingAgent = await Agent.findOne({ email });
    if (existingAgent) {
      return res.status(400).json({ message: 'Agent already exists' });
    }

    const agent = new Agent({
      name,
      email,
      mobile,
      password,
    });

    await agent.save();

    // Remove password from response
    const agentResponse = agent.toObject();
    delete agentResponse.password;

    res.status(201).json(agentResponse);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
