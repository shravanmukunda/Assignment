const express = require('express');
const Agent = require('../models/Agent');
const auth = require('../middleware/auth');
const router = express.Router();

// Get all agents (admin only)
router.get('/', auth(['admin']), async (req, res) => {
  try {
    const agents = await Agent.find().select('-password');
    res.json(agents);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single agent by ID (admin only)
router.get('/:id', auth(['admin']), async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id).select('-password');
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    res.json(agent);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new agent (admin only)
router.post('/', auth(['admin']), async (req, res) => {
  try {
    const { name, email, mobile, password } = req.body;

    // Check if agent already exists
    const existingAgent = await Agent.findOne({ email });
    if (existingAgent) {
      return res.status(400).json({ message: 'Agent already exists' });
    }

    // Create new agent
    const agent = new Agent({
      name,
      email,
      mobile,
      password,
    });

    await agent.save();

    // Return agent without password
    const agentResponse = agent.toObject();
    delete agentResponse.password;

    res.status(201).json(agentResponse);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update agent (admin only)
router.put('/:id', auth(['admin']), async (req, res) => {
  try {
    const { name, email, mobile } = req.body;
    
    const agent = await Agent.findByIdAndUpdate(
      req.params.id,
      { name, email, mobile },
      { new: true }
    ).select('-password');

    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    res.json(agent);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete agent (admin only)
router.delete('/:id', auth(['admin']), async (req, res) => {
  try {
    const agent = await Agent.findByIdAndDelete(req.params.id);
    
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
