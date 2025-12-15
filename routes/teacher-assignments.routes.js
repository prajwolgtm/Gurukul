import express from 'express';
import TeacherAssignment from '../models/TeacherAssignment.js';
import User from '../models/User.js';
import Department from '../models/Department.js';
import SubDepartment from '../models/SubDepartment.js';
import Batch from '../models/Batch.js';
import Subject from '../models/Subject.js';
import { auth } from '../middleware/auth.js';
import { ROLES } from '../utils/roles.js';

const router = express.Router();

// @route   GET /api/teacher-assignments
// @desc    Get all teacher assignments with filtering
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      teacher = '',
      assignmentType = '',
      department = '',
      status = 'active',
      academicYear = '2024-25'
    } = req.query;

    // Build query
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (academicYear) {
      query.academicYear = academicYear;
    }
    
    if (teacher) {
      query.teacher = teacher;
    }
    
    if (assignmentType) {
      query.assignmentType = assignmentType;
    }
    
    if (department) {
      query.departments = { $in: [department] };
    }

    // Pagination options
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: [
        { path: 'teacher', select: 'fullName email role' },
        { path: 'departments', select: 'name code' },
        { path: 'subDepartments', select: 'name code' },
        { path: 'batches', select: 'name code academicYear' },
        { path: 'subject', select: 'name code' },
        { path: 'createdBy', select: 'fullName' }
      ]
    };

    const result = await TeacherAssignment.paginate(query, options);

    res.json({
      success: true,
      assignments: result.docs,
      pagination: {
        currentPage: result.page,
        totalPages: result.totalPages,
        totalAssignments: result.totalDocs,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage
      }
    });

  } catch (error) {
    console.error('❌ Error fetching teacher assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching teacher assignments',
      error: error.message
    });
  }
});

// @route   GET /api/teacher-assignments/:id
// @desc    Get single teacher assignment
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const assignment = await TeacherAssignment.findById(req.params.id)
      .populate('teacher', 'fullName email role')
      .populate('departments', 'name code')
      .populate('subDepartments', 'name code')
      .populate('batches', 'name code academicYear')
      .populate('subject', 'name code')
      .populate('createdBy', 'fullName');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Teacher assignment not found'
      });
    }

    res.json({
      success: true,
      assignment
    });

  } catch (error) {
    console.error('❌ Error fetching teacher assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching teacher assignment',
      error: error.message
    });
  }
});

// @route   POST /api/teacher-assignments
// @desc    Create new teacher assignment
// @access  Private (Admin, Coordinator, Principal)
router.post('/', auth, async (req, res) => {
  try {
    // Check permissions
    const allowedRoles = [ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create teacher assignments'
      });
    }

    const {
      teacher,
      assignmentType,
      departments = [],
      subDepartments = [],
      batches = [],
      subject,
      role = 'teacher',
      academicYear = '2024-25',
      startDate,
      endDate,
      workload = 0,
      responsibilities = [],
      notes
    } = req.body;

    // Validate required fields
    if (!teacher || !assignmentType) {
      return res.status(400).json({
        success: false,
        message: 'Teacher and assignment type are required'
      });
    }

    // Validate teacher exists and has appropriate role
    const teacherDoc = await User.findById(teacher);
    if (!teacherDoc) {
      return res.status(400).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    const teacherRoles = [ROLES.TEACHER, ROLES.HOD, ROLES.PRINCIPAL, ROLES.COORDINATOR];
    if (!teacherRoles.includes(teacherDoc.role)) {
      return res.status(400).json({
        success: false,
        message: 'User is not a teacher or academic staff'
      });
    }

    // Validate assignment type specific requirements
    if (assignmentType === 'department' && departments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one department is required for department assignment'
      });
    }

    if (assignmentType === 'subDepartment' && subDepartments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one sub-department is required for sub-department assignment'
      });
    }

    if (assignmentType === 'batch' && batches.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one batch is required for batch assignment'
      });
    }

    if (assignmentType === 'subject' && !subject) {
      return res.status(400).json({
        success: false,
        message: 'Subject is required for subject assignment'
      });
    }

    // Create assignment
    const assignment = new TeacherAssignment({
      teacher,
      assignmentType,
      departments,
      subDepartments,
      batches,
      subject,
      role,
      academicYear,
      startDate: startDate || new Date(),
      endDate,
      workload,
      responsibilities,
      notes,
      createdBy: req.user.id
    });

    await assignment.save();

    // Populate references before sending response
    await assignment.populate([
      { path: 'teacher', select: 'fullName email role' },
      { path: 'departments', select: 'name code' },
      { path: 'subDepartments', select: 'name code' },
      { path: 'batches', select: 'name code academicYear' },
      { path: 'subject', select: 'name code' },
      { path: 'createdBy', select: 'fullName' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Teacher assignment created successfully',
      assignment
    });

  } catch (error) {
    console.error('❌ Error creating teacher assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating teacher assignment',
      error: error.message
    });
  }
});

// @route   PUT /api/teacher-assignments/:id
// @desc    Update teacher assignment
// @access  Private (Admin, Coordinator, Principal)
router.put('/:id', auth, async (req, res) => {
  try {
    // Check permissions
    const allowedRoles = [ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update teacher assignments'
      });
    }

    const assignment = await TeacherAssignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Teacher assignment not found'
      });
    }

    const {
      teacher,
      assignmentType,
      departments,
      subDepartments,
      batches,
      subject,
      role,
      academicYear,
      status,
      startDate,
      endDate,
      workload,
      responsibilities,
      notes
    } = req.body;

    // Update assignment fields
    const updateFields = {
      teacher: teacher || assignment.teacher,
      assignmentType: assignmentType || assignment.assignmentType,
      departments: departments !== undefined ? departments : assignment.departments,
      subDepartments: subDepartments !== undefined ? subDepartments : assignment.subDepartments,
      batches: batches !== undefined ? batches : assignment.batches,
      subject: subject || assignment.subject,
      role: role || assignment.role,
      academicYear: academicYear || assignment.academicYear,
      status: status || assignment.status,
      startDate: startDate || assignment.startDate,
      endDate: endDate !== undefined ? endDate : assignment.endDate,
      workload: workload !== undefined ? workload : assignment.workload,
      responsibilities: responsibilities !== undefined ? responsibilities : assignment.responsibilities,
      notes: notes !== undefined ? notes : assignment.notes
    };

    const updatedAssignment = await TeacherAssignment.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    ).populate([
      { path: 'teacher', select: 'fullName email role' },
      { path: 'departments', select: 'name code' },
      { path: 'subDepartments', select: 'name code' },
      { path: 'batches', select: 'name code academicYear' },
      { path: 'subject', select: 'name code' },
      { path: 'createdBy', select: 'fullName' }
    ]);

    res.json({
      success: true,
      message: 'Teacher assignment updated successfully',
      assignment: updatedAssignment
    });

  } catch (error) {
    console.error('❌ Error updating teacher assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating teacher assignment',
      error: error.message
    });
  }
});

// @route   DELETE /api/teacher-assignments/:id
// @desc    Delete teacher assignment
// @access  Private (Admin, Coordinator)
router.delete('/:id', auth, async (req, res) => {
  try {
    // Check permissions
    const allowedRoles = [ROLES.ADMIN, ROLES.COORDINATOR];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete teacher assignments'
      });
    }

    const assignment = await TeacherAssignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Teacher assignment not found'
      });
    }

    // Soft delete - mark as inactive
    assignment.status = 'inactive';
    await assignment.save();

    res.json({
      success: true,
      message: 'Teacher assignment deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting teacher assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting teacher assignment',
      error: error.message
    });
  }
});

// @route   GET /api/teacher-assignments/teacher/:teacherId
// @desc    Get all assignments for a specific teacher
// @access  Private
router.get('/teacher/:teacherId', auth, async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { academicYear = '2024-25', status = 'active' } = req.query;

    let query = { teacher: teacherId };
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (academicYear) {
      query.academicYear = academicYear;
    }

    const assignments = await TeacherAssignment.find(query)
      .populate('departments', 'name code')
      .populate('subDepartments', 'name code')
      .populate('batches', 'name code academicYear')
      .populate('subject', 'name code')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      assignments
    });

  } catch (error) {
    console.error('❌ Error fetching teacher assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching teacher assignments',
      error: error.message
    });
  }
});

// @route   GET /api/teacher-assignments/stats
// @desc    Get teacher assignment statistics
// @access  Private
router.get('/stats/overview', auth, async (req, res) => {
  try {
    const stats = await Promise.all([
      TeacherAssignment.countDocuments({ status: 'active' }),
      TeacherAssignment.countDocuments({ status: 'inactive' }),
      TeacherAssignment.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: '$assignmentType', count: { $sum: 1 } } }
      ]),
      TeacherAssignment.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        active: stats[0],
        inactive: stats[1],
        total: stats[0] + stats[1],
        byAssignmentType: stats[2],
        byRole: stats[3]
      }
    });

  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
});

export default router;