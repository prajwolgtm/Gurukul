import express from 'express';
import Subject from '../models/Subject.js';
import Department from '../models/Department.js';
import SubDepartment from '../models/SubDepartment.js';
import Batch from '../models/Batch.js';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';
import { permit } from '../middleware/rbac.js';
import { ROLES, FULL_ACCESS_ROLES, CLASS_MANAGERS } from '../utils/roles.js';

const router = express.Router();

// ==================== SUBJECT MANAGEMENT ROUTES ====================

// @route   GET /api/subjects
// @desc    Get all subjects with filtering options
// @access  Private (Teachers, Coordinators, Principals, Admins)
router.get('/', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const { 
      category, 
      level, 
      academicYear, 
      semester, 
      departmentId, 
      batchId, 
      teacherId,
      active,
      page = 1, 
      limit = 20 
    } = req.query;
    
    // Build filter query
    const filter = { isActive: active !== 'false' };
    
    if (category) filter.category = category;
    if (level) filter.level = level;
    if (academicYear) filter.academicYear = academicYear;
    if (semester) filter.semester = parseInt(semester);
    if (departmentId) filter.departments = departmentId;
    if (batchId) filter.batches = batchId;
    
    // Handle teacher filtering
    if (teacherId) {
      // If teacherId is provided, filter by that teacher
      filter['teachers.teacher'] = teacherId;
    } else if (req.user.role === ROLES.TEACHER) {
      // For teachers, only show subjects they're assigned to
      filter['teachers.teacher'] = req.user.id;
    }
    // For admins/coordinators/principals/hod, show all subjects (no teacher filter)
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const subjects = await Subject.find(filter)
      .populate('departments', 'name code')
      .populate('subDepartments', 'name code')
      .populate('batches', 'name code academicYear')
      .populate('teachers.teacher', 'fullName email')
      .populate('createdBy', 'fullName email')
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const totalCount = await Subject.countDocuments(filter);
    
    res.json({
      success: true,
      message: `Found ${subjects.length} subjects`,
      subjects,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching subjects',
      error: error.message
    });
  }
});

// @route   GET /api/subjects/:id
// @desc    Get subject by ID
// @access  Private (Teachers, Coordinators, Principals, Admins)
router.get('/:id', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id)
      .populate('departments', 'name code description')
      .populate('subDepartments', 'name code description')
      .populate('batches', 'name code academicYear currentSemester')
      .populate('teachers.teacher', 'fullName email phone employeeId')
      .populate('prerequisites', 'name code')
      .populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email');
    
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }
    
    // Check if teacher has access to this subject
    if (req.user.role === ROLES.TEACHER) {
      const hasAccess = subject.teachers.some(t => t.teacher._id.toString() === req.user.id);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this subject'
        });
      }
    }
    
    res.json({
      success: true,
      subject
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching subject',
      error: error.message
    });
  }
});

// @route   POST /api/subjects
// @desc    Create a new subject
// @access  Private (Coordinators, Principals, Admins)
router.post('/', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const {
      name,
      code,
      description,
      category,
      level,
      type,
      credits,
      maxMarks,
      passingMarks,
      departments,
      subDepartments,
      batches,
      academicYear,
      semester,
      weeklyHours,
      prerequisites
    } = req.body;
    
    // Validate required fields
    if (!name || !code || !academicYear) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, code, and academic year'
      });
    }
    
    // Check if subject code already exists
    const existingSubject = await Subject.findOne({ code: code.toUpperCase() });
    if (existingSubject) {
      return res.status(400).json({
        success: false,
        message: 'Subject with this code already exists'
      });
    }
    
    // Validate departments, batches exist
    if (departments && departments.length > 0) {
      const deptCount = await Department.countDocuments({ _id: { $in: departments } });
      if (deptCount !== departments.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more departments not found'
        });
      }
    }
    
    if (batches && batches.length > 0) {
      const batchCount = await Batch.countDocuments({ _id: { $in: batches } });
      if (batchCount !== batches.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more batches not found'
        });
      }
    }
    
    // Create subject
    const subject = new Subject({
      name: name.trim(),
      code: code.toUpperCase().trim(),
      description,
      category: category || 'vedic_studies',
      level: level || 'all',
      type: type || 'core',
      credits: credits || 1,
      maxMarks: maxMarks || 100,
      passingMarks: passingMarks || 35,
      departments: departments || [],
      subDepartments: subDepartments || [],
      batches: batches || [],
      academicYear,
      semester: semester || 1,
      weeklyHours: weeklyHours || 3,
      prerequisites: prerequisites || [],
      createdBy: req.user.id
    });
    
    await subject.save();
    
    // Populate the created subject
    const populatedSubject = await Subject.findById(subject._id)
      .populate('departments', 'name code')
      .populate('batches', 'name code')
      .populate('createdBy', 'fullName email');
    
    res.status(201).json({
      success: true,
      message: 'Subject created successfully',
      subject: populatedSubject
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating subject',
      error: error.message
    });
  }
});

// @route   PUT /api/subjects/:id
// @desc    Update subject
// @access  Private (Coordinators, Principals, Admins)
router.put('/:id', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id);
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }
    
    const {
      name,
      description,
      category,
      level,
      type,
      credits,
      maxMarks,
      passingMarks,
      departments,
      subDepartments,
      batches,
      weeklyHours,
      prerequisites,
      isActive
    } = req.body;
    
    // Update fields
    if (name) subject.name = name.trim();
    if (description !== undefined) subject.description = description;
    if (category) subject.category = category;
    if (level) subject.level = level;
    if (type) subject.type = type;
    if (credits) subject.credits = credits;
    if (maxMarks) subject.maxMarks = maxMarks;
    if (passingMarks) subject.passingMarks = passingMarks;
    if (departments) subject.departments = departments;
    if (subDepartments) subject.subDepartments = subDepartments;
    if (batches) subject.batches = batches;
    if (weeklyHours) subject.weeklyHours = weeklyHours;
    if (prerequisites) subject.prerequisites = prerequisites;
    if (isActive !== undefined) subject.isActive = isActive;
    
    subject.updatedBy = req.user.id;
    
    await subject.save();
    
    // Populate the updated subject
    const populatedSubject = await Subject.findById(subject._id)
      .populate('departments', 'name code')
      .populate('batches', 'name code')
      .populate('updatedBy', 'fullName email');
    
    res.json({
      success: true,
      message: 'Subject updated successfully',
      subject: populatedSubject
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating subject',
      error: error.message
    });
  }
});

// @route   DELETE /api/subjects/:id
// @desc    Delete subject (soft delete)
// @access  Private (Coordinators, Principals, Admins)
router.delete('/:id', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id);
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }
    
    // Soft delete by setting isActive to false
    subject.isActive = false;
    subject.updatedBy = req.user.id;
    await subject.save();
    
    res.json({
      success: true,
      message: 'Subject deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting subject',
      error: error.message
    });
  }
});

// @route   POST /api/subjects/:id/assign-teacher
// @desc    Assign teacher to subject
// @access  Private (Coordinators, Principals, Admins)
router.post('/:id/assign-teacher', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const { teacherId, isPrimary, academicYear, semester } = req.body;
    
    if (!teacherId) {
      return res.status(400).json({
        success: false,
        message: 'Teacher ID is required'
      });
    }
    
    const subject = await Subject.findById(req.params.id);
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }
    
    // Verify teacher exists and has teacher role
    const teacher = await User.findById(teacherId);
    if (!teacher || teacher.role !== ROLES.TEACHER) {
      return res.status(400).json({
        success: false,
        message: 'Invalid teacher ID'
      });
    }
    
    // Assign teacher
    await subject.assignTeacher(teacherId, isPrimary, academicYear, semester);
    
    // Populate and return updated subject
    const updatedSubject = await Subject.findById(subject._id)
      .populate('teachers.teacher', 'fullName email employeeId');
    
    res.json({
      success: true,
      message: `Teacher ${isPrimary ? '(primary) ' : ''}assigned to subject successfully`,
      subject: updatedSubject
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error assigning teacher',
      error: error.message
    });
  }
});

// @route   DELETE /api/subjects/:id/remove-teacher/:teacherId
// @desc    Remove teacher from subject
// @access  Private (Coordinators, Principals, Admins)
router.delete('/:id/remove-teacher/:teacherId', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id);
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }
    
    // Remove teacher
    await subject.removeTeacher(req.params.teacherId);
    
    res.json({
      success: true,
      message: 'Teacher removed from subject successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error removing teacher',
      error: error.message
    });
  }
});

// @route   GET /api/subjects/batch/:batchId
// @desc    Get subjects for a specific batch
// @access  Private (Teachers, Coordinators, Principals, Admins)
router.get('/batch/:batchId', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const { academicYear, semester } = req.query;
    
    const subjects = await Subject.getSubjectsForBatch(
      req.params.batchId,
      academicYear,
      semester ? parseInt(semester) : undefined
    );
    
    res.json({
      success: true,
      message: `Found ${subjects.length} subjects for batch`,
      subjects
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching subjects for batch',
      error: error.message
    });
  }
});

// @route   GET /api/subjects/teacher/:teacherId
// @desc    Get subjects taught by a specific teacher
// @access  Private (Teachers can see their own, others need higher permissions)
router.get('/teacher/:teacherId', auth, async (req, res) => {
  try {
    // Teachers can only see their own subjects unless they have higher permissions
    if (req.user.role === ROLES.TEACHER && req.user.id !== req.params.teacherId) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own subjects'
      });
    }
    
    const { academicYear, semester } = req.query;
    
    const subjects = await Subject.getSubjectsByTeacher(
      req.params.teacherId,
      academicYear,
      semester ? parseInt(semester) : undefined
    );
    
    res.json({
      success: true,
      message: `Found ${subjects.length} subjects for teacher`,
      subjects
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching subjects for teacher',
      error: error.message
    });
  }
});

// @route   GET /api/subjects/categories
// @desc    Get all subject categories
// @access  Private (All authenticated users)
router.get('/meta/categories', auth, async (req, res) => {
  try {
    const categories = [
      { value: 'vedic_studies', label: 'Vedic Studies', description: 'Traditional Vedic subjects' },
      { value: 'sanskrit', label: 'Sanskrit Language', description: 'Sanskrit language and literature' },
      { value: 'philosophy', label: 'Philosophy', description: 'Philosophical studies' },
      { value: 'mathematics', label: 'Mathematics', description: 'Mathematical subjects' },
      { value: 'science', label: 'Science', description: 'Scientific subjects' },
      { value: 'social_studies', label: 'Social Studies', description: 'History, geography, civics' },
      { value: 'language', label: 'Modern Languages', description: 'Modern language studies' },
      { value: 'arts', label: 'Arts & Crafts', description: 'Creative and artistic subjects' },
      { value: 'physical_education', label: 'Physical Education', description: 'Sports and physical activities' },
      { value: 'music', label: 'Music', description: 'Musical studies' },
      { value: 'other', label: 'Other', description: 'Other subjects' }
    ];
    
    res.json({
      success: true,
      categories
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching categories',
      error: error.message
    });
  }
});

export default router;
