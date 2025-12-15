import express from 'express';
import StaffAttendance from '../models/StaffAttendance.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/staff-attendance
// @desc    Mark staff/teacher self-attendance
// @access  Private (All staff except students/parents)
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { date, status, remarks } = req.body;

    // Validate required fields
    if (!date || !status) {
      return res.status(400).json({
        success: false,
        message: 'Date and status are required'
      });
    }

    // Validate status
    const validStatuses = ['Present', 'Absent', 'Leave'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be Present, Absent, or Leave'
      });
    }

    // Parse date and ensure it's not in the future
    const attendanceDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (attendanceDate > today) {
      return res.status(400).json({
        success: false,
        message: 'Cannot mark attendance for future dates'
      });
    }

    // Check if attendance already exists for this date
    const existingAttendance = await StaffAttendance.findOne({
      user: userId,
      date: attendanceDate
    });

    if (existingAttendance) {
      // Update existing attendance
      existingAttendance.status = status;
      existingAttendance.remarks = remarks || undefined;
      existingAttendance.markedAt = new Date();
      existingAttendance.markedBy = userId;

      await existingAttendance.save();

      return res.json({
        success: true,
        message: 'Attendance updated successfully',
        attendance: existingAttendance
      });
    } else {
      // Create new attendance
      const attendance = new StaffAttendance({
        user: userId,
        date: attendanceDate,
        status,
        remarks: remarks || undefined,
        markedBy: userId
      });

      await attendance.save();
      await attendance.populate('user', 'fullName email role');

      return res.status(201).json({
        success: true,
        message: 'Attendance marked successfully',
        attendance
      });
    }
  } catch (error) {
    console.error('Error marking staff attendance:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Attendance already exists for this date'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error marking attendance',
      error: error.message
    });
  }
});

// @route   GET /api/staff-attendance/:date
// @desc    Get staff attendance for a specific date
// @access  Private
router.get('/:date', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.params;

    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    const attendance = await StaffAttendance.findOne({
      user: userId,
      date: attendanceDate
    }).populate('user', 'fullName email role');

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'No attendance found for this date'
      });
    }

    res.json({
      success: true,
      attendance
    });
  } catch (error) {
    console.error('Error fetching staff attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attendance',
      error: error.message
    });
  }
});

// @route   GET /api/staff-attendance
// @desc    Get all staff attendance records for the logged-in user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate, page = 1, limit = 30 } = req.query;

    let query = { user: userId };

    // Add date range filter if provided
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        query.date.$lte = new Date(endDate);
      }
    }

    const attendances = await StaffAttendance.find(query)
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('user', 'fullName email role');

    const total = await StaffAttendance.countDocuments(query);

    res.json({
      success: true,
      attendances,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching staff attendance list:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attendance records',
      error: error.message
    });
  }
});

export default router;
