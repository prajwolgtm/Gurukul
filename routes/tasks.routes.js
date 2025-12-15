import express from 'express';
import Task from '../models/Task.js';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';
import { permit, requireAccessLevel } from '../middleware/rbac.js';
import { ROLES, TASK_ASSIGNERS, TASK_ASSIGNEES, ACCESS_LEVELS } from '../utils/roles.js';

const router = express.Router();

// @route   POST /api/tasks
// @desc    Create and assign a new task (Principal/HOD/Admin only)
// @access  Private
router.post('/', auth, permit(...TASK_ASSIGNERS), async (req, res) => {
  try {
    const {
      title,
      description,
      assigned_to,
      stage = 1,
      priority = 3,
      due_date,
      category = 'other'
    } = req.body;

    // Validate required fields
    if (!title || !description || !assigned_to || !due_date) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title, description, assigned_to, and due_date'
      });
    }

    // Verify that assigned_to user exists and is a valid assignee (teacher/caretaker)
    const assigneeUser = await User.findById(assigned_to);
    if (!assigneeUser) {
      return res.status(404).json({
        success: false,
        message: 'Assigned user not found'
      });
    }

    if (!TASK_ASSIGNEES.has(assigneeUser.role)) {
      return res.status(400).json({
        success: false,
        message: `Tasks can only be assigned to: ${Array.from(TASK_ASSIGNEES).join(', ')}`
      });
    }

    // Create the task
    const task = await Task.create({
      title,
      description,
      created_by: req.user.id,
      assigned_to,
      stage,
      priority,
      due_date: new Date(due_date),
      category,
      status: 'open'
    });

    // Populate creator and assignee info
    await task.populate([
      { path: 'created_by', select: 'fullName email role' },
      { path: 'assigned_to', select: 'fullName email role' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Task created and assigned successfully',
      task: {
        id: task._id,
        title: task.title,
        description: task.description,
        stage: task.stage,
        stageLabel: Task.getStageLabel(task.stage),
        priority: task.priority,
        priorityLabel: Task.getPriorityLabel(task.priority),
        due_date: task.due_date,
        status: task.status,
        category: task.category,
        progress_percentage: task.progress_percentage,
        created_by: task.created_by,
        assigned_to: task.assigned_to,
        createdAt: task.createdAt
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/tasks
// @desc    Get tasks (different views based on role)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { 
      status, 
      priority, 
      page = 1, 
      limit = 10, 
      sortBy = 'due_date',
      order = 'asc',
      category 
    } = req.query;

    let query = {};
    
    // Role-based filtering
    if (TASK_ASSIGNERS.has(req.user.role)) {
      // Principals/HODs see tasks they created
      if (req.query.view === 'assigned') {
        query.assigned_to = req.user.id;
      } else {
        query.created_by = req.user.id;
      }
    } else if (TASK_ASSIGNEES.has(req.user.role)) {
      // Teachers see tasks assigned to them
      query.assigned_to = req.user.id;
    } else {
      // Others see nothing or can be customized
      query._id = null; // No results
    }

    // Apply filters
    if (status) query.status = status;
    if (priority) query.priority = parseInt(priority);
    if (category) query.category = category;

    // Sorting
    const sortOrder = order === 'desc' ? -1 : 1;
    const sortOptions = { [sortBy]: sortOrder };

    const tasks = await Task.find(query)
      .populate('created_by', 'fullName email role')
      .populate('assigned_to', 'fullName email role')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Task.countDocuments(query);

    // Transform tasks with additional info
    const transformedTasks = tasks.map(task => ({
      id: task._id,
      title: task.title,
      description: task.description,
      stage: task.stage,
      stageLabel: Task.getStageLabel(task.stage),
      priority: task.priority,
      priorityLabel: Task.getPriorityLabel(task.priority),
      due_date: task.due_date,
      actual_closure_date: task.actual_closure_date,
      status: task.status,
      category: task.category,
      progress_percentage: task.progress_percentage,
      isOverdue: task.isOverdue,
      created_by: task.created_by,
      assigned_to: task.assigned_to,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    }));

    res.json({
      success: true,
      data: {
        tasks: transformedTasks,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalTasks: total,
          hasNext: page * limit < total,
          hasPrev: page > 1
        },
        summary: {
          total,
          open: await Task.countDocuments({ ...query, status: 'open' }),
          ongoing: await Task.countDocuments({ ...query, status: 'ongoing' }),
          completed: await Task.countDocuments({ ...query, status: 'completed' }),
          overdue: await Task.countDocuments({ 
            ...query, 
            due_date: { $lt: new Date() }, 
            status: { $ne: 'completed' } 
          })
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/tasks/:id
// @desc    Get single task details
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('created_by', 'fullName email role')
      .populate('assigned_to', 'fullName email role')
      .populate('comments.user', 'fullName role');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Check if user has access to this task
    const canView = (
      task.created_by._id.toString() === req.user.id ||
      task.assigned_to._id.toString() === req.user.id ||
      ACCESS_LEVELS[req.user.role] >= ACCESS_LEVELS.PRINCIPAL
    );

    if (!canView) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this task'
      });
    }

    res.json({
      success: true,
      task: {
        id: task._id,
        title: task.title,
        description: task.description,
        stage: task.stage,
        stageLabel: Task.getStageLabel(task.stage),
        priority: task.priority,
        priorityLabel: Task.getPriorityLabel(task.priority),
        due_date: task.due_date,
        actual_closure_date: task.actual_closure_date,
        status: task.status,
        category: task.category,
        progress_percentage: task.progress_percentage,
        isOverdue: task.isOverdue,
        attachments: task.attachments,
        comments: task.comments,
        created_by: task.created_by,
        assigned_to: task.assigned_to,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/tasks/:id/progress
// @desc    Update task progress (Assignee only)
// @access  Private
router.put('/:id/progress', auth, async (req, res) => {
  try {
    const { progress_percentage, status } = req.body;

    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Only assigned user can update progress
    if (task.assigned_to.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only assigned user can update task progress'
      });
    }

    // Update progress
    if (progress_percentage !== undefined) {
      await task.updateProgress(progress_percentage);
    }

    // Update status if provided
    if (status && ['open', 'ongoing', 'hold', 'completed'].includes(status)) {
      task.status = status;
      if (status === 'completed') {
        task.actual_closure_date = new Date();
        task.progress_percentage = 100;
      }
      await task.save();
    }

    res.json({
      success: true,
      message: 'Task progress updated successfully',
      task: {
        id: task._id,
        progress_percentage: task.progress_percentage,
        status: task.status,
        actual_closure_date: task.actual_closure_date
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/tasks/:id/comments
// @desc    Add comment to task
// @access  Private
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const { comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Comment cannot be empty'
      });
    }

    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Check if user has access to this task
    const canComment = (
      task.created_by.toString() === req.user.id ||
      task.assigned_to.toString() === req.user.id ||
      ACCESS_LEVELS[req.user.role] >= ACCESS_LEVELS.PRINCIPAL
    );

    if (!canComment) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to comment on this task'
      });
    }

    await task.addComment(req.user.id, comment.trim());
    
    // Populate the new comment
    await task.populate('comments.user', 'fullName role');

    const newComment = task.comments[task.comments.length - 1];

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      comment: newComment
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/tasks/dashboard/summary
// @desc    Get task dashboard summary
// @access  Private
router.get('/dashboard/summary', auth, async (req, res) => {
  try {
    let query = {};
    
    // Role-based filtering
    if (TASK_ASSIGNERS.has(req.user.role)) {
      query.created_by = req.user.id;
    } else if (TASK_ASSIGNEES.has(req.user.role)) {
      query.assigned_to = req.user.id;
    } else {
      query._id = null; // No results
    }

    const [
      totalTasks,
      openTasks,
      ongoingTasks,
      completedTasks,
      overdueTasks,
      dueTodayTasks,
      criticalTasks
    ] = await Promise.all([
      Task.countDocuments(query),
      Task.countDocuments({ ...query, status: 'open' }),
      Task.countDocuments({ ...query, status: 'ongoing' }),
      Task.countDocuments({ ...query, status: 'completed' }),
      Task.countDocuments({ 
        ...query, 
        due_date: { $lt: new Date() }, 
        status: { $ne: 'completed' } 
      }),
      Task.countDocuments({ 
        ...query, 
        due_date: { 
          $gte: new Date(new Date().setHours(0,0,0,0)), 
          $lt: new Date(new Date().setHours(23,59,59,999)) 
        },
        status: { $ne: 'completed' }
      }),
      Task.countDocuments({ ...query, priority: 1, status: { $ne: 'completed' } })
    ]);

    res.json({
      success: true,
      summary: {
        total: totalTasks,
        byStatus: {
          open: openTasks,
          ongoing: ongoingTasks,
          completed: completedTasks
        },
        alerts: {
          overdue: overdueTasks,
          dueToday: dueTodayTasks,
          critical: criticalTasks
        },
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

export default router; 