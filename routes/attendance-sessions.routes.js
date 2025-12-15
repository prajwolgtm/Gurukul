import express from 'express';
import AttendanceSession from '../models/AttendanceSession.js';
import { auth } from '../middleware/auth.js';
import { permit } from '../middleware/rbac.js';
import { ROLES } from '../utils/roles.js';

const router = express.Router();

// ==================== ATTENDANCE SESSION MANAGEMENT ====================

// @route   GET /api/attendance-sessions
// @desc    Get all attendance sessions
// @access  Private (All authenticated users)
router.get('/', auth, async (req, res) => {
  try {
    const { 
      category, 
      active = true, 
      language = 'hindi',
      sortBy = 'displayOrder' 
    } = req.query;

    let query = {};
    if (category) query.category = category;
    if (active !== 'all') query.isActive = active === 'true';

    const sortOptions = {
      displayOrder: { displayOrder: 1 },
      time: { defaultTime: 1 },
      name: { [`displayNames.${language}`]: 1 },
      priority: { priority: -1 }
    };

    const sessions = await AttendanceSession.find(query)
      .populate('createdBy', 'fullName')
      .populate('lastModifiedBy', 'fullName')
      .sort(sortOptions[sortBy] || sortOptions.displayOrder);

    const formattedSessions = sessions.map(session => ({
      id: session._id,
      sessionKey: session.sessionKey,
      displayName: session.getDisplayName(language),
      displayNames: session.displayNames,
      defaultTime: session.defaultTime,
      formattedTime: session.formattedTime,
      category: session.category,
      priority: session.priority,
      duration: session.duration,
      description: session.description,
      isMandatory: session.isMandatory,
      allowExcused: session.allowExcused,
      rules: session.rules,
      icon: session.icon,
      color: session.color,
      isActive: session.isActive,
      displayOrder: session.displayOrder,
      usage: session.usage,
      createdBy: session.createdBy,
      lastModifiedBy: session.lastModifiedBy,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    }));

    res.json({
      success: true,
      sessions: formattedSessions,
      total: formattedSessions.length
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/attendance-sessions
// @desc    Create new attendance session
// @access  Private (Admin/Principal only)
router.post('/', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const {
      sessionKey,
      displayNames,
      defaultTime,
      category,
      priority = 5,
      duration = 30,
      description,
      isMandatory = true,
      allowExcused = true,
      rules,
      icon = '🕐',
      color = '#007bff',
      displayOrder
    } = req.body;

    // Validate required fields
    if (!sessionKey || !displayNames?.hindi || !displayNames?.english || !defaultTime || !category) {
      return res.status(400).json({
        success: false,
        message: 'Session key, Hindi name, English name, time, and category are required'
      });
    }

    // Check if session key already exists
    const existingSession = await AttendanceSession.findOne({ sessionKey });
    if (existingSession) {
      return res.status(400).json({
        success: false,
        message: 'Session with this key already exists'
      });
    }

    // If no display order provided, set it to last
    let finalDisplayOrder = displayOrder;
    if (!finalDisplayOrder) {
      const lastSession = await AttendanceSession.findOne()
        .sort({ displayOrder: -1 })
        .select('displayOrder');
      finalDisplayOrder = (lastSession?.displayOrder || 0) + 1;
    }

    const newSession = await AttendanceSession.create({
      sessionKey,
      displayNames,
      defaultTime,
      category,
      priority,
      duration,
      description,
      isMandatory,
      allowExcused,
      rules: {
        allowLateMarking: true,
        lateMarkingWindowMinutes: 30,
        requiresNote: false,
        autoMarkAbsent: false,
        ...rules
      },
      icon,
      color,
      displayOrder: finalDisplayOrder,
      createdBy: req.user.id,
      lastModifiedBy: req.user.id
    });

    await newSession.populate('createdBy', 'fullName');

    res.status(201).json({
      success: true,
      message: 'Attendance session created successfully',
      session: {
        id: newSession._id,
        sessionKey: newSession.sessionKey,
        displayNames: newSession.displayNames,
        defaultTime: newSession.defaultTime,
        formattedTime: newSession.formattedTime,
        category: newSession.category,
        priority: newSession.priority,
        duration: newSession.duration,
        icon: newSession.icon,
        color: newSession.color,
        displayOrder: newSession.displayOrder,
        createdBy: newSession.createdBy
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

// @route   PUT /api/attendance-sessions/:id
// @desc    Update attendance session
// @access  Private (Admin/Principal only)
router.put('/:id', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    
    // Add last modified info
    updateData.lastModifiedBy = req.user.id;

    const session = await AttendanceSession.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('lastModifiedBy', 'fullName');

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Attendance session not found'
      });
    }

    res.json({
      success: true,
      message: 'Attendance session updated successfully',
      session: {
        id: session._id,
        sessionKey: session.sessionKey,
        displayNames: session.displayNames,
        defaultTime: session.defaultTime,
        formattedTime: session.formattedTime,
        category: session.category,
        priority: session.priority,
        duration: session.duration,
        description: session.description,
        rules: session.rules,
        icon: session.icon,
        color: session.color,
        displayOrder: session.displayOrder,
        isActive: session.isActive,
        lastModifiedBy: session.lastModifiedBy,
        updatedAt: session.updatedAt
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

// @route   DELETE /api/attendance-sessions/:id
// @desc    Delete attendance session (soft delete)
// @access  Private (Admin only)
router.delete('/:id', auth, permit(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;

    const session = await AttendanceSession.findByIdAndUpdate(
      id,
      { 
        isActive: false,
        lastModifiedBy: req.user.id
      },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Attendance session not found'
      });
    }

    res.json({
      success: true,
      message: 'Attendance session deactivated successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/attendance-sessions/reorder
// @desc    Reorder attendance sessions
// @access  Private (Admin/Principal only)
router.post('/reorder', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const { sessionOrders } = req.body; // Array of { sessionId, displayOrder }

    if (!Array.isArray(sessionOrders)) {
      return res.status(400).json({
        success: false,
        message: 'Session orders must be an array'
      });
    }

    // Update display orders
    const updatePromises = sessionOrders.map(({ sessionId, displayOrder }) =>
      AttendanceSession.findByIdAndUpdate(
        sessionId,
        { 
          displayOrder,
          lastModifiedBy: req.user.id 
        }
      )
    );

    await Promise.all(updatePromises);

    res.json({
      success: true,
      message: 'Session order updated successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/attendance-sessions/initialize-defaults
// @desc    Initialize default Sanskrit/Hindi sessions
// @access  Private (Admin only)
router.post('/initialize-defaults', auth, permit(ROLES.ADMIN), async (req, res) => {
  try {
    // Check if sessions already exist
    const existingCount = await AttendanceSession.countDocuments();
    
    if (existingCount > 0) {
      return res.status(400).json({
        success: false,
        message: `${existingCount} sessions already exist. Clear existing sessions first if you want to reinitialize.`
      });
    }

    const defaultSessions = await AttendanceSession.createDefaultSessions(req.user.id);

    res.status(201).json({
      success: true,
      message: `${defaultSessions.length} default sessions created successfully`,
      sessions: defaultSessions.map(session => ({
        sessionKey: session.sessionKey,
        hindi: session.displayNames.hindi,
        english: session.displayNames.english,
        time: session.defaultTime,
        category: session.category
      }))
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/attendance-sessions/categories
// @desc    Get all session categories
// @access  Private
router.get('/categories', auth, async (req, res) => {
  try {
    const categories = await AttendanceSession.distinct('category', { isActive: true });
    
    const categoryDetails = {
      morning: { name: 'Morning', icon: '🌅', color: '#ffa726' },
      afternoon: { name: 'Afternoon', icon: '☀️', color: '#ff7043' },
      evening: { name: 'Evening', icon: '🌇', color: '#ab47bc' },
      night: { name: 'Night', icon: '🌙', color: '#5c6bc0' },
      meals: { name: 'Meals', icon: '🍽️', color: '#66bb6a' },
      prayer: { name: 'Prayer', icon: '🙏', color: '#ef5350' },
      study: { name: 'Study', icon: '📚', color: '#42a5f5' },
      recreation: { name: 'Recreation', icon: '🎯', color: '#26a69a' },
      service: { name: 'Service', icon: '🤝', color: '#ab47bc' }
    };

    const result = categories.map(category => ({
      key: category,
      ...categoryDetails[category]
    }));

    res.json({
      success: true,
      categories: result
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/attendance-sessions/by-time
// @desc    Get sessions organized by time of day
// @access  Private
router.get('/by-time', auth, async (req, res) => {
  try {
    const { language = 'hindi' } = req.query;
    
    const sessions = await AttendanceSession.getActiveSessionsInOrder();
    
    const timeGroups = {
      morning: [],    // 05:00 - 11:59
      afternoon: [],  // 12:00 - 17:59  
      evening: [],    // 18:00 - 21:59
      night: []       // 22:00 - 04:59
    };

    sessions.forEach(session => {
      const [hours] = session.defaultTime.split(':').map(Number);
      
      let timeGroup;
      if (hours >= 5 && hours < 12) timeGroup = 'morning';
      else if (hours >= 12 && hours < 18) timeGroup = 'afternoon';
      else if (hours >= 18 && hours < 22) timeGroup = 'evening';
      else timeGroup = 'night';

      timeGroups[timeGroup].push({
        id: session._id,
        sessionKey: session.sessionKey,
        displayName: session.displayNames[language] || session.displayNames.hindi,
        time: session.defaultTime,
        icon: session.icon,
        color: session.color,
        category: session.category,
        duration: session.duration,
        isMandatory: session.isMandatory
      });
    });

    res.json({
      success: true,
      timeGroups: timeGroups,
      totalSessions: sessions.length
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