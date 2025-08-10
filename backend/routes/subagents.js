const express = require('express');
const SubAgent = require('../models/SubAgent');
const auth = require('../middleware/auth');
const router = express.Router();

// Get all sub-agents for the logged-in agent
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const subAgents = await SubAgent.find({ parentAgent: req.user.id }).select('-password');
    res.json(subAgents);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new sub-agent
router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { name, email, mobile, password } = req.body;

    // Check if sub-agent already exists
    const existingSubAgent = await SubAgent.findOne({ email });
    if (existingSubAgent) {
      return res.status(400).json({ message: 'Sub-agent already exists' });
    }

    const subAgent = new SubAgent({
      name,
      email,
      mobile,
      password,
      parentAgent: req.user.id,
    });

    await subAgent.save();

    const subAgentResponse = subAgent.toObject();
    delete subAgentResponse.password;

    res.status(201).json(subAgentResponse);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update sub-agent
router.put('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { name, email, mobile } = req.body;
    
    const subAgent = await SubAgent.findOneAndUpdate(
      { _id: req.params.id, parentAgent: req.user.id },
      { name, email, mobile },
      { new: true }
    ).select('-password');

    if (!subAgent) {
      return res.status(404).json({ message: 'Sub-agent not found' });
    }

    res.json(subAgent);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete sub-agent
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const subAgent = await SubAgent.findOneAndDelete({
      _id: req.params.id,
      parentAgent: req.user.id
    });

    if (!subAgent) {
      return res.status(404).json({ message: 'Sub-agent not found' });
    }

    res.json({ message: 'Sub-agent deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
