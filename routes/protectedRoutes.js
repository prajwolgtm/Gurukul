const express = require('express');
const router = express.Router();
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Admin data route - accessible to admin and principal
router.get('/admin/data', protect, authorizeRoles('admin', 'principal'), (req, res) => {
  res.json({
    success: true,
    data: {
      message: 'Admin-only data accessed successfully',
      user: {
        id: req.user._id,
        fullName: req.user.fullName,
        role: req.user.role
      },
      adminData: {
        totalUsers: 150,
        activeSessions: 45,
        systemStatus: 'healthy',
        lastBackup: '2024-01-15T10:30:00Z'
      }
    }
  });
});

// Teacher data route - accessible only to teachers
router.get('/teacher/data', protect, authorizeRoles('teacher'), (req, res) => {
  res.json({
    success: true,
    data: {
      message: 'Teacher data accessed successfully',
      user: {
        id: req.user._id,
        fullName: req.user.fullName,
        role: req.user.role
      },
      teacherData: {
        assignedClasses: ['Class 10A', 'Class 9B'],
        totalStudents: 65,
        upcomingExams: 3,
        attendanceRate: 94.5
      }
    }
  });
});

//coordinator

// Parent data route - accessible only to parents
router.get('/parent/data', protect, authorizeRoles('parent'), (req, res) => {
  res.json({
    success: true,
    data: {
      message: 'Parent data accessed successfully',
      user: {
        id: req.user._id,
        fullName: req.user.fullName,
        role: req.user.role
      },
      parentData: {
        children: ['Rahul Kumar', 'Priya Kumar'],
        feeStatus: 'paid',
        attendance: 92,
        upcomingEvents: ['Annual Day', 'Sports Meet']
      }
    }
  });
});

//students

module.exports = router; 