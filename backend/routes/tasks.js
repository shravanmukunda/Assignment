const express = require('express');
const multer = require('multer');
const csv = require('csv-parse');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const Task = require('../models/Task');
const Agent = require('../models/Agent');
const SubAgent = require('../models/SubAgent');
const auth = require('../middleware/auth');
const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    const allowedTypes = /csv|xlsx|xls/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only CSV, XLSX, and XLS files are allowed'));
    }
  }
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Admin upload and distribute tasks to agents (admin only)
router.post('/upload', auth(['admin']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    let tasks = [];
    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();

    // Parse file based on extension
    if (fileExtension === '.csv') {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const records = await new Promise((resolve, reject) => {
        csv.parse(fileContent, {
          columns: true,
          skip_empty_lines: true
        }, (err, records) => {
          if (err) reject(err);
          else resolve(records);
        });
      });
      tasks = records;
    } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      tasks = xlsx.utils.sheet_to_json(worksheet);
    }

    const validTasks = tasks.filter(task => 
      task.FirstName && task.Phone && task.Notes
    );

    if (validTasks.length === 0) {
      return res.status(400).json({ 
        message: 'No valid tasks found. Please ensure your file has FirstName, Phone, and Notes columns.' 
      });
    }

    const agents = await Agent.find();
    if (agents.length === 0) {
      return res.status(400).json({ message: 'No agents available for task assignment' });
    }

    const distributedTasks = [];
    const tasksPerAgent = Math.floor(validTasks.length / agents.length);
    const remainder = validTasks.length % agents.length;

    let taskIndex = 0;
    for (let i = 0; i < agents.length; i++) {
      const numberOfTasks = tasksPerAgent + (i < remainder ? 1 : 0);
      
      for (let j = 0; j < numberOfTasks; j++) {
        if (taskIndex < validTasks.length) {
          const task = validTasks[taskIndex];
          const newTask = new Task({
            firstName: task.FirstName,
            phone: task.Phone.toString(),
            notes: task.Notes,
            assignedAgent: agents[i]._id,
            createdBy: req.user.id,
            createdByModel: 'User',
          });
          distributedTasks.push(newTask);
          taskIndex++;
        }
      }
    }

    await Task.insertMany(distributedTasks);
    fs.unlinkSync(filePath);

    const distribution = await Task.aggregate([
      { $match: { createdBy: req.user.id, assignedAgent: { $ne: null } } },
      {
        $group: {
          _id: '$assignedAgent',
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'agents',
          localField: '_id',
          foreignField: '_id',
          as: 'agent'
        }
      },
      {
        $unwind: '$agent'
      },
      {
        $project: {
          agentName: '$agent.name',
          taskCount: '$count'
        }
      }
    ]);

    res.json({
      message: 'Tasks uploaded and distributed successfully',
      totalTasks: validTasks.length,
      distribution: distribution
    });

  } catch (error) {
    console.error(error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Server error during file upload' });
  }
});

// Agent upload and distribute tasks to sub-agents (agent only)
router.post('/upload-subagent', auth(['agent']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    let tasks = [];
    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();

    // Parse file (same logic as admin upload)
    if (fileExtension === '.csv') {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const records = await new Promise((resolve, reject) => {
        csv.parse(fileContent, {
          columns: true,
          skip_empty_lines: true
        }, (err, records) => {
          if (err) reject(err);
          else resolve(records);
        });
      });
      tasks = records;
    } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      tasks = xlsx.utils.sheet_to_json(worksheet);
    }

    const validTasks = tasks.filter(task => 
      task.FirstName && task.Phone && task.Notes
    );

    if (validTasks.length === 0) {
      return res.status(400).json({ 
        message: 'No valid tasks found.' 
      });
    }

    const subAgents = await SubAgent.find({ parentAgent: req.user.id });
    if (subAgents.length === 0) {
      return res.status(400).json({ message: 'No sub-agents available for task assignment' });
    }

    const distributedTasks = [];
    const tasksPerSubAgent = Math.floor(validTasks.length / subAgents.length);
    const remainder = validTasks.length % subAgents.length;

    let taskIndex = 0;
    for (let i = 0; i < subAgents.length; i++) {
      const numberOfTasks = tasksPerSubAgent + (i < remainder ? 1 : 0);
      
      for (let j = 0; j < numberOfTasks; j++) {
        if (taskIndex < validTasks.length) {
          const task = validTasks[taskIndex];
          const newTask = new Task({
            firstName: task.FirstName,
            phone: task.Phone.toString(),
            notes: task.Notes,
            assignedSubAgent: subAgents[i]._id,
            createdBy: req.user.id,
            createdByModel: 'Agent',
          });
          distributedTasks.push(newTask);
          taskIndex++;
        }
      }
    }

    await Task.insertMany(distributedTasks);
    fs.unlinkSync(filePath);

    const distribution = await Task.aggregate([
      { $match: { createdBy: req.user.id, assignedSubAgent: { $ne: null } } },
      {
        $group: {
          _id: '$assignedSubAgent',
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'subagents',
          localField: '_id',
          foreignField: '_id',
          as: 'subAgent'
        }
      },
      {
        $unwind: '$subAgent'
      },
      {
        $project: {
          subAgentName: '$subAgent.name',
          taskCount: '$count'
        }
      }
    ]);

    res.json({
      message: 'Tasks uploaded and distributed to sub-agents successfully',
      totalTasks: validTasks.length,
      distribution: distribution
    });

  } catch (error) {
    console.error(error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Server error during file upload' });
  }
});

// Get tasks created by admin (admin only)
router.get('/admin', auth(['admin']), async (req, res) => {
  try {
    const tasks = await Task.find({ 
      createdBy: req.user.id,
      createdByModel: 'User'
    })
      .populate('assignedAgent', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get tasks assigned to agent (agent only)
router.get('/agent', auth(['agent']), async (req, res) => {
  try {
    const tasks = await Task.find({ assignedAgent: req.user.id })
      .sort({ createdAt: -1 });
    
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get tasks created by agent for sub-agents (agent only)
router.get('/agent-created', auth(['agent']), async (req, res) => {
  try {
    const tasks = await Task.find({ 
      createdBy: req.user.id,
      createdByModel: 'Agent'
    })
      .populate('assignedSubAgent', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get tasks assigned to sub-agent (sub-agent only)
router.get('/subagent', auth(['sub-agent']), async (req, res) => {
  try {
    const tasks = await Task.find({ assignedSubAgent: req.user.id })
      .sort({ createdAt: -1 });
    
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all tasks - comprehensive view for admin
router.get('/', auth(['admin']), async (req, res) => {
  try {
    const tasks = await Task.find()
      .populate('assignedAgent', 'name email')
      .populate('assignedSubAgent', 'name email')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update task status (accessible by task assignee or creator)
router.patch('/:id/status', auth(['admin', 'agent', 'sub-agent']), async (req, res) => {
  try {
    const { status } = req.body;
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Check authorization
    const isAuthorized = 
      req.user.id === task.createdBy.toString() ||
      req.user.id === task.assignedAgent?.toString() ||
      req.user.id === task.assignedSubAgent?.toString();

    if (!isAuthorized) {
      return res.status(403).json({ message: 'Not authorized to update this task' });
    }

    task.status = status;
    await task.save();

    res.json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete task (admin or creator only)
router.delete('/:id', auth(['admin', 'agent']), async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Only admin or task creator can delete
    if (req.user.role !== 'admin' && req.user.id !== task.createdBy.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this task' });
    }

    await Task.findByIdAndDelete(req.params.id);
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
