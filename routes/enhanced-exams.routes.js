import express from 'express';
import Exam from '../models/Exam.js';
import Subject from '../models/Subject.js';
import StudentSimple from '../models/StudentSimple.js';
import StudentAssignment from '../models/StudentAssignment.js';
import Department from '../models/Department.js';
import SubDepartment from '../models/SubDepartment.js';
import Batch from '../models/Batch.js';
import { auth } from '../middleware/auth.js';
import { permit } from '../middleware/rbac.js';
import { ROLES, EXAM_MANAGERS, CLASS_MANAGERS } from '../utils/roles.js';

const router = express.Router();

// ==================== ENHANCED EXAM MANAGEMENT ROUTES ====================

// @route   POST /api/enhanced-exams
// @desc    Create a new exam with subject integration and student selection
// @access  Private (Teachers, Coordinators, Principals, Admins)
router.post('/', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const {
      examName,
      examType,
      subjectId,
      description,
      academicInfo,
      studentSelection,
      schedule,
      marksConfig,
      instructions,
      settings
    } = req.body;
    
    // Validate required fields
    if (!examName || !examType || !subjectId || !academicInfo?.academicYear || !schedule?.startDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide examName, examType, subjectId, academicYear, and startDate'
      });
    }
    
    // Verify subject exists and user has access
    const subject = await Subject.findById(subjectId)
      .populate('teachers.teacher', '_id')
      .populate('departments')
      .populate('batches');
    
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }
    
    // Check if teacher has permission to create exam for this subject
    if (req.user.role === ROLES.TEACHER) {
      const hasAccess = subject.teachers.some(t => t.teacher._id.toString() === req.user.id);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'You are not assigned to teach this subject'
        });
      }
    }
    
    // Generate unique exam ID
    const examId = Exam.generateExamId('EX');
    
    // Set default student selection based on subject if not provided
    let finalStudentSelection = studentSelection;
    if (!finalStudentSelection || !finalStudentSelection.selectionType) {
      finalStudentSelection = {
        selectionType: 'batch',
        batches: subject.batches.map(b => b._id),
        departments: subject.departments.map(d => d._id),
        filters: {
          includeInactive: false
        }
      };
    }
    
    // Set default marks config based on subject
    let finalMarksConfig = marksConfig;
    if (!finalMarksConfig) {
      finalMarksConfig = {
        totalMarks: subject.maxMarks || 100,
        passingMarks: subject.passingMarks || 35,
        gradeScale: 'percentage',
        components: [
          {
            name: 'Theory',
            maxMarks: subject.maxMarks || 100,
            weightage: 100,
            isRequired: true
          }
        ]
      };
    }
    
    // Create exam
    const exam = new Exam({
      examId,
      examName: examName.trim(),
      examType,
      subject: subjectId,
      subjectName: subject.name, // For backward compatibility
      description,
      academicInfo: {
        academicYear: academicInfo.academicYear,
        term: academicInfo.term || 'annual',
        semester: academicInfo.semester || subject.semester,
        month: academicInfo.month,
        week: academicInfo.week
      },
      studentSelection: finalStudentSelection,
      schedule: {
        startDate: new Date(schedule.startDate),
        endDate: schedule.endDate ? new Date(schedule.endDate) : new Date(schedule.startDate),
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        duration: schedule.duration,
        sessions: schedule.sessions || []
      },
      marksConfig: finalMarksConfig,
      instructions: instructions || {
        generalInstructions: [],
        allowedMaterials: [],
        prohibitedItems: []
      },
      settings: settings || {
        allowLateSubmission: false,
        allowMakeupExam: true,
        autoPublishResults: false
      },
      status: 'draft',
      createdBy: req.user.id
    });
    
    await exam.save();
    
    // Populate the created exam
    const populatedExam = await Exam.findById(exam._id)
      .populate('subject', 'name code category maxMarks passingMarks')
      .populate('studentSelection.departments', 'name code')
      .populate('studentSelection.subDepartments', 'name code')
      .populate('studentSelection.batches', 'name code academicYear')
      .populate('createdBy', 'fullName email');
    
    res.status(201).json({
      success: true,
      message: 'Exam created successfully',
      exam: populatedExam
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating exam',
      error: error.message
    });
  }
});

// @route   GET /api/enhanced-exams/:id/eligible-students
// @desc    Get students eligible for an exam based on selection criteria
// @access  Private (Teachers, Coordinators, Principals, Admins)
router.get('/:id/eligible-students', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('subject', 'name code')
      .populate('studentSelection.departments')
      .populate('studentSelection.subDepartments')
      .populate('studentSelection.batches');
    
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }
    
    // Check teacher access
    if (req.user.role === ROLES.TEACHER) {
      const subject = await Subject.findById(exam.subject._id);
      const hasAccess = subject.teachers.some(t => t.teacher.toString() === req.user.id);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this exam'
        });
      }
    }
    
    let students = [];
    const { selectionType, departments, subDepartments, batches, customStudents, excludeStudents, filters } = exam.studentSelection;
    
    // Build query based on selection type
    let query = {};
    
    switch (selectionType) {
      case 'all':
        // Get all active students
        query = {};
        break;
        
      case 'department':
        if (departments && departments.length > 0) {
          const assignments = await StudentAssignment.find({
            department: { $in: departments.map(d => d._id) },
            status: 'active'
          }).select('student');
          query._id = { $in: assignments.map(a => a.student) };
        }
        break;
        
      case 'sub_department':
        if (subDepartments && subDepartments.length > 0) {
          const assignments = await StudentAssignment.find({
            subDepartment: { $in: subDepartments.map(sd => sd._id) },
            status: 'active'
          }).select('student');
          query._id = { $in: assignments.map(a => a.student) };
        }
        break;
        
      case 'batch':
        if (batches && batches.length > 0) {
          const assignments = await StudentAssignment.find({
            batch: { $in: batches.map(b => b._id) },
            status: 'active'
          }).select('student');
          query._id = { $in: assignments.map(a => a.student) };
        }
        break;
        
      case 'custom':
        if (customStudents && customStudents.length > 0) {
          query._id = { $in: customStudents };
        }
        break;
        
      default:
        query = {};
    }
    
    // Apply exclusions
    if (excludeStudents && excludeStudents.length > 0) {
      query._id = query._id ? 
        { $in: query._id.$in, $nin: excludeStudents } : 
        { $nin: excludeStudents };
    }
    
    // Apply additional filters
    if (filters && !filters.includeInactive) {
      // This would require additional logic to check student active status
    }
    
    // Fetch students
    students = await StudentSimple.find(query)
      .select('admissionNo fullName dateOfBirth bloodGroup shaakha gothra telephone fatherName currentStandard')
      .sort({ fullName: 1 });
    
    // Get student assignments for additional info
    const studentIds = students.map(s => s._id);
    const assignments = await StudentAssignment.find({
      student: { $in: studentIds },
      status: 'active'
    }).populate('department', 'name code')
      .populate('subDepartment', 'name code')
      .populate('batch', 'name code academicYear');
    
    // Combine student data with assignment info
    const studentsWithAssignments = students.map(student => {
      const studentAssignments = assignments.filter(a => a.student.toString() === student._id.toString());
      return {
        ...student.toObject(),
        assignments: studentAssignments
      };
    });
    
    res.json({
      success: true,
      message: `Found ${studentsWithAssignments.length} eligible students`,
      students: studentsWithAssignments,
      count: studentsWithAssignments.length,
      selectionCriteria: exam.studentSelection
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching eligible students',
      error: error.message
    });
  }
});

// @route   PUT /api/enhanced-exams/:id/student-selection
// @desc    Update student selection criteria for an exam
// @access  Private (Teachers, Coordinators, Principals, Admins)
router.put('/:id/student-selection', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }
    
    // Check if exam can be modified
    if (['ongoing', 'completed', 'results-published'].includes(exam.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify student selection for ongoing or completed exams'
      });
    }
    
    // Check teacher access
    if (req.user.role === ROLES.TEACHER) {
      const subject = await Subject.findById(exam.subject);
      const hasAccess = subject.teachers.some(t => t.teacher.toString() === req.user.id);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this exam'
        });
      }
    }
    
    const { selectionType, departments, subDepartments, batches, customStudents, excludeStudents, filters } = req.body;
    
    // Update student selection
    exam.studentSelection = {
      selectionType: selectionType || exam.studentSelection.selectionType,
      departments: departments || exam.studentSelection.departments,
      subDepartments: subDepartments || exam.studentSelection.subDepartments,
      batches: batches || exam.studentSelection.batches,
      customStudents: customStudents || exam.studentSelection.customStudents,
      excludeStudents: excludeStudents || exam.studentSelection.excludeStudents,
      filters: { ...exam.studentSelection.filters, ...filters }
    };
    
    exam.lastModifiedBy = req.user.id;
    await exam.save();
    
    // Add audit entry
    await exam.addAuditEntry('updated', req.user.id, 'Student selection criteria updated');
    
    res.json({
      success: true,
      message: 'Student selection updated successfully',
      studentSelection: exam.studentSelection
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating student selection',
      error: error.message
    });
  }
});

// @route   GET /api/enhanced-exams/subject/:subjectId
// @desc    Get all exams for a specific subject
// @access  Private (Teachers, Coordinators, Principals, Admins)
router.get('/subject/:subjectId', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const { academicYear, status, page = 1, limit = 20 } = req.query;
    
    // Verify subject exists and user has access
    const subject = await Subject.findById(req.params.subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }
    
    // Check teacher access
    if (req.user.role === ROLES.TEACHER) {
      const hasAccess = subject.teachers.some(t => t.teacher.toString() === req.user.id);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this subject'
        });
      }
    }
    
    // Build query
    const query = {
      subject: req.params.subjectId,
      isDeleted: false
    };
    
    if (academicYear) query['academicInfo.academicYear'] = academicYear;
    if (status) query.status = status;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const exams = await Exam.find(query)
      .populate('subject', 'name code category')
      .populate('createdBy', 'fullName email')
      .sort({ 'schedule.startDate': -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const totalCount = await Exam.countDocuments(query);
    
    res.json({
      success: true,
      message: `Found ${exams.length} exams for subject`,
      exams,
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
      message: 'Error fetching exams for subject',
      error: error.message
    });
  }
});

// @route   GET /api/enhanced-exams/teacher/:teacherId
// @desc    Get all exams created by or assigned to a specific teacher
// @access  Private (Teachers can see their own, others need higher permissions)
router.get('/teacher/:teacherId', auth, async (req, res) => {
  try {
    // Teachers can only see their own exams unless they have higher permissions
    if (req.user.role === ROLES.TEACHER && req.user.id !== req.params.teacherId) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own exams'
      });
    }
    
    const { academicYear, status, page = 1, limit = 20 } = req.query;
    
    // Get subjects taught by this teacher
    const subjects = await Subject.find({
      'teachers.teacher': req.params.teacherId,
      isActive: true
    }).select('_id');
    
    const subjectIds = subjects.map(s => s._id);
    
    // Build query
    const query = {
      $or: [
        { createdBy: req.params.teacherId },
        { subject: { $in: subjectIds } }
      ],
      isDeleted: false
    };
    
    if (academicYear) query['academicInfo.academicYear'] = academicYear;
    if (status) query.status = status;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const exams = await Exam.find(query)
      .populate('subject', 'name code category')
      .populate('createdBy', 'fullName email')
      .sort({ 'schedule.startDate': -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const totalCount = await Exam.countDocuments(query);
    
    res.json({
      success: true,
      message: `Found ${exams.length} exams for teacher`,
      exams,
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
      message: 'Error fetching exams for teacher',
      error: error.message
    });
  }
});

// @route   POST /api/enhanced-exams/:id/approve
// @desc    Approve an exam for conduct
// @access  Private (Coordinators, Principals, Admins)
router.post('/:id/approve', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }
    
    if (exam.workflow.isApproved) {
      return res.status(400).json({
        success: false,
        message: 'Exam is already approved'
      });
    }
    
    await exam.approveExam(req.user.id);
    
    res.json({
      success: true,
      message: 'Exam approved successfully',
      exam: {
        examId: exam.examId,
        examName: exam.examName,
        status: exam.status,
        workflow: exam.workflow
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error approving exam',
      error: error.message
    });
  }
});

export default router;
