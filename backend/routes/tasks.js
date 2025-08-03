const express = require('express');
const multer = require('multer');
const csv = require('csv-parse');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const Task = require('../models/Task');
const Agent = require('../models/Agent');
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

// Upload and distribute tasks
router.post('/upload', auth, upload.single('file'), async (req, res) => {
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

    // Validate required fields
    const validTasks = tasks.filter(task => 
      task.FirstName && task.Phone && task.Notes
    );

    if (validTasks.length === 0) {
      return res.status(400).json({ 
        message: 'No valid tasks found. Please ensure your file has FirstName, Phone, and Notes columns.' 
      });
    }

    // Get all agents
    const agents = await Agent.find();
    if (agents.length === 0) {
      return res.status(400).json({ message: 'No agents available for task assignment' });
    }

    // Distribute tasks among agents
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
          });
          distributedTasks.push(newTask);
          taskIndex++;
        }
      }
    }

    // Save all tasks to database
    await Task.insertMany(distributedTasks);

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    // Get distribution summary
    const distribution = await Task.aggregate([
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
    // Clean up file if error occurs
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Server error during file upload' });
  }
});

// Get tasks for specific agent
router.get('/agent/:agentId', auth, async (req, res) => {
  try {
    const tasks = await Task.find({ assignedAgent: req.params.agentId })
      .populate('assignedAgent', 'name email');
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all tasks with agent info
router.get('/', auth, async (req, res) => {
  try {
    const tasks = await Task.find()
      .populate('assignedAgent', 'name email')
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
