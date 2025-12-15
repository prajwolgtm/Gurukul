import express from 'express';
import ExamMarks from '../models/ExamMarks.js';
import Exam from '../models/Exam.js';
import Subject from '../models/Subject.js';
import StudentSimple from '../models/StudentSimple.js';
import StudentAssignment from '../models/StudentAssignment.js';
import { auth } from '../middleware/auth.js';
import { permit } from '../middleware/rbac.js';
import { ROLES, CLASS_MANAGERS, EXAM_MANAGERS } from '../utils/roles.js';

const router = express.Router();

// ==================== MARKS MANAGEMENT ROUTES ====================

// @route   POST /api/marks-management/bulk-create
// @desc    Create marks entries for all eligible students in an exam
// @access  Private (Teachers, Coordinators, Principals, Admins)
router.post('/bulk-create', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const { examId } = req.body;
    
    if (!examId) {
      return res.status(400).json({
        success: false,
        message: 'Exam ID is required'
      });
    }
    
    // Get exam details
    const exam = await Exam.findById(examId)
      .populate('subject', 'name code maxMarks passingMarks')
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
    
    // Check if marks entries already exist
    const existingMarks = await ExamMarks.countDocuments({ exam: examId });
    if (existingMarks > 0) {
      return res.status(400).json({
        success: false,
        message: 'Marks entries already exist for this exam'
      });
    }
    
    // Get eligible students based on exam's student selection criteria
    let students = [];
    const { selectionType, departments, subDepartments, batches, customStudents, excludeStudents } = exam.studentSelection;
    
    let query = {};
    
    switch (selectionType) {
      case 'all':
        query = {};
        break;
        
      case 'department':
        if (departments && departments.length > 0) {
          const assignments = await StudentAssignment.find({
            department: { $in: departments.map(d => d._id) },
            status: 'active'
          }).select('student department batch');
          query._id = { $in: assignments.map(a => a.student) };
        }
        break;
        
      case 'sub_department':
        if (subDepartments && subDepartments.length > 0) {
          const assignments = await StudentAssignment.find({
            subDepartment: { $in: subDepartments.map(sd => sd._id) },
            status: 'active'
          }).select('student department batch subDepartment');
          query._id = { $in: assignments.map(a => a.student) };
        }
        break;
        
      case 'batch':
        if (batches && batches.length > 0) {
          const assignments = await StudentAssignment.find({
            batch: { $in: batches.map(b => b._id) },
            status: 'active'
          }).select('student department batch');
          query._id = { $in: assignments.map(a => a.student) };
        }
        break;
        
      case 'custom':
        if (customStudents && customStudents.length > 0) {
          query._id = { $in: customStudents };
        }
        break;
    }
    
    // Apply exclusions
    if (excludeStudents && excludeStudents.length > 0) {
      query._id = query._id ? 
        { $in: query._id.$in, $nin: excludeStudents } : 
        { $nin: excludeStudents };
    }
    
    // Fetch students
    students = await StudentSimple.find(query);
    
    // Get student assignments for context
    const studentIds = students.map(s => s._id);
    const assignments = await StudentAssignment.find({
      student: { $in: studentIds },
      status: 'active'
    });
    
    // Create marks entries
    const marksEntries = [];
    
    for (const student of students) {
      const studentAssignment = assignments.find(a => a.student.toString() === student._id.toString());
      
      const marksEntry = new ExamMarks({
        exam: examId,
        subject: exam.subject._id,
        student: student._id,
        studentAssignment: studentAssignment?._id,
        attendance: {
          status: 'present', // Default to present, can be changed later
          markedBy: req.user.id,
          markedAt: new Date()
        },
        marksComponents: exam.marksConfig.components.map(component => ({
          componentName: component.name,
          maxMarks: component.maxMarks,
          marksObtained: 0, // Default to 0, to be filled by teacher
          weightage: component.weightage,
          enteredBy: req.user.id,
          enteredAt: new Date()
        })),
        totalMarks: {
          maxMarks: exam.marksConfig.totalMarks,
          marksObtained: 0,
          percentage: 0
        },
        result: {
          status: 'pending',
          passingMarks: exam.marksConfig.passingMarks,
          isPassed: false
        },
        academicInfo: {
          academicYear: exam.academicInfo.academicYear,
          semester: exam.academicInfo.semester,
          term: exam.academicInfo.term,
          department: studentAssignment?.department,
          batch: studentAssignment?.batch
        },
        workflow: {
          isMarksEntered: false,
          marksEnteredBy: req.user.id,
          marksEnteredAt: new Date()
        }
      });
      
      marksEntries.push(marksEntry);
    }
    
    // Bulk insert marks entries
    const savedMarks = await ExamMarks.insertMany(marksEntries);
    
    // Update exam workflow
    if (!exam.workflow.isMarksEntryStarted) {
      await exam.startMarksEntry(req.user.id);
    }
    
    res.status(201).json({
      success: true,
      message: `Created marks entries for ${savedMarks.length} students`,
      count: savedMarks.length,
      examId: examId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating bulk marks entries',
      error: error.message
    });
  }
});

// @route   GET /api/marks-management/exam/:examId
// @desc    Get all marks entries for an exam
// @access  Private (Teachers, Coordinators, Principals, Admins)
router.get('/exam/:examId', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const { status, attendance, page = 1, limit = 50 } = req.query;
    
    // Verify exam exists and user has access
    const exam = await Exam.findById(req.params.examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
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
    
    // Build filter
    const filter = { exam: req.params.examId, isDeleted: false };
    if (status) filter['result.status'] = status;
    if (attendance) filter['attendance.status'] = attendance;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const marks = await ExamMarks.find(filter)
      .populate('student', 'admissionNo fullName dateOfBirth currentStandard')
      .populate('studentAssignment', 'department batch')
      .populate({
        path: 'studentAssignment',
        populate: [
          { path: 'department', select: 'name code' },
          { path: 'batch', select: 'name code academicYear' }
        ]
      })
      .populate('workflow.marksEnteredBy', 'fullName')
      .populate('workflow.verifiedBy', 'fullName')
      .sort({ 'student.fullName': 1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const totalCount = await ExamMarks.countDocuments(filter);
    
    res.json({
      success: true,
      message: `Found ${marks.length} marks entries`,
      marks,
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
      message: 'Error fetching marks',
      error: error.message
    });
  }
});

// @route   PUT /api/marks-management/:id/marks
// @desc    Update marks for a student
// @access  Private (Teachers, Coordinators, Principals, Admins)
router.put('/:id/marks', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const { marksComponents, attendance, feedback, additionalAssessments } = req.body;
    
    const examMarks = await ExamMarks.findById(req.params.id)
      .populate('exam', 'subject')
      .populate('student', 'fullName admissionNo');
    
    if (!examMarks) {
      return res.status(404).json({
        success: false,
        message: 'Marks entry not found'
      });
    }
    
    // Check if marks are already published
    if (examMarks.workflow.isPublished) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify published marks'
      });
    }
    
    // Check teacher access
    if (req.user.role === ROLES.TEACHER) {
      const subject = await Subject.findById(examMarks.exam.subject);
      const hasAccess = subject.teachers.some(t => t.teacher.toString() === req.user.id);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to modify marks for this subject'
        });
      }
    }
    
    // Update marks components
    if (marksComponents && Array.isArray(marksComponents)) {
      marksComponents.forEach(component => {
        const existingComponent = examMarks.marksComponents.find(c => c.componentName === component.componentName);
        if (existingComponent) {
          const previousMarks = existingComponent.marksObtained;
          existingComponent.marksObtained = component.marksObtained;
          existingComponent.remarks = component.remarks;
          existingComponent.enteredBy = req.user.id;
          existingComponent.enteredAt = new Date();
          
          // Add audit entry if marks changed
          if (previousMarks !== component.marksObtained) {
            examMarks.auditLog.push({
              action: 'marks-updated',
              performedBy: req.user.id,
              performedAt: new Date(),
              previousMarks,
              newMarks: component.marksObtained,
              details: `Updated marks for component: ${component.componentName}`
            });
          }
        }
      });
    }
    
    // Update attendance
    if (attendance) {
      examMarks.attendance.status = attendance.status;
      examMarks.attendance.remarks = attendance.remarks;
      examMarks.attendance.markedBy = req.user.id;
      examMarks.attendance.markedAt = new Date();
    }
    
    // Update feedback
    if (feedback) {
      examMarks.feedback = { ...examMarks.feedback, ...feedback };
    }
    
    // Update additional assessments
    if (additionalAssessments) {
      examMarks.additionalAssessments = additionalAssessments.map(assessment => ({
        ...assessment,
        assessedBy: req.user.id,
        assessedAt: new Date()
      }));
    }
    
    // Mark as marks entered
    examMarks.workflow.isMarksEntered = true;
    examMarks.workflow.marksEnteredBy = req.user.id;
    examMarks.workflow.marksEnteredAt = new Date();
    
    // Update revision tracking
    examMarks.workflow.revisionCount++;
    examMarks.workflow.lastRevisedBy = req.user.id;
    examMarks.workflow.lastRevisedAt = new Date();
    
    await examMarks.save();
    
    res.json({
      success: true,
      message: 'Marks updated successfully',
      marks: {
        id: examMarks._id,
        student: examMarks.student,
        totalMarks: examMarks.totalMarks,
        grade: examMarks.grade,
        result: examMarks.result,
        workflow: examMarks.workflow
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating marks',
      error: error.message
    });
  }
});

// @route   PUT /api/marks-management/:id/attendance
// @desc    Update attendance for a student
// @access  Private (Teachers, Coordinators, Principals, Admins)
router.put('/:id/attendance', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const { status, remarks } = req.body;
    
    if (!status || !['present', 'absent', 'late', 'excused'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid attendance status is required (present, absent, late, excused)'
      });
    }
    
    const examMarks = await ExamMarks.findById(req.params.id)
      .populate('student', 'fullName admissionNo');
    
    if (!examMarks) {
      return res.status(404).json({
        success: false,
        message: 'Marks entry not found'
      });
    }
    
    await examMarks.markAttendance(status, req.user.id, remarks);
    
    res.json({
      success: true,
      message: 'Attendance updated successfully',
      attendance: examMarks.attendance
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating attendance',
      error: error.message
    });
  }
});

// @route   POST /api/marks-management/exam/:examId/verify
// @desc    Verify all marks for an exam
// @access  Private (Coordinators, Principals, Admins)
router.post('/exam/:examId/verify', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }
    
    // Get all marks entries for this exam
    const marksEntries = await ExamMarks.find({
      exam: req.params.examId,
      isDeleted: false
    });
    
    if (marksEntries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No marks entries found for this exam'
      });
    }
    
    // Verify all marks entries
    const verificationPromises = marksEntries.map(marks => marks.verifyMarks(req.user.id));
    await Promise.all(verificationPromises);
    
    res.json({
      success: true,
      message: `Verified marks for ${marksEntries.length} students`,
      count: marksEntries.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error verifying marks',
      error: error.message
    });
  }
});

// @route   POST /api/marks-management/exam/:examId/publish
// @desc    Publish all marks for an exam
// @access  Private (Coordinators, Principals, Admins)
router.post('/exam/:examId/publish', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }
    
    // Get all verified marks entries for this exam
    const marksEntries = await ExamMarks.find({
      exam: req.params.examId,
      'workflow.isVerified': true,
      isDeleted: false
    });
    
    if (marksEntries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No verified marks entries found for this exam'
      });
    }
    
    // Publish all marks entries
    const publishPromises = marksEntries.map(marks => marks.publishMarks(req.user.id));
    await Promise.all(publishPromises);
    
    // Update exam status
    await exam.publishResults(req.user.id);
    
    res.json({
      success: true,
      message: `Published marks for ${marksEntries.length} students`,
      count: marksEntries.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error publishing marks',
      error: error.message
    });
  }
});

// @route   GET /api/marks-management/exam/:examId/statistics
// @desc    Get statistics for an exam
// @access  Private (Teachers, Coordinators, Principals, Admins)
router.get('/exam/:examId/statistics', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    // Verify exam exists and user has access
    const exam = await Exam.findById(req.params.examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
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
    
    const statistics = await ExamMarks.calculateClassStatistics(req.params.examId);
    
    if (!statistics) {
      return res.status(404).json({
        success: false,
        message: 'No marks data available for statistics'
      });
    }
    
    res.json({
      success: true,
      statistics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error calculating statistics',
      error: error.message
    });
  }
});

// @route   GET /api/marks-management/student/:studentId
// @desc    Get all marks for a student
// @access  Private (Students can see their own, others need permissions)
router.get('/student/:studentId', auth, async (req, res) => {
  try {
    const { academicYear, published } = req.query;
    
    // Students can only see their own marks, others need appropriate permissions
    if (req.user.role === ROLES.STUDENT && req.user.studentId !== req.params.studentId) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own marks'
      });
    }
    
    // Parents can only see their linked student's marks
    if (req.user.role === ROLES.PARENT) {
      // This would require additional logic to check parent-student relationship
    }
    
    const filter = { student: req.params.studentId, isDeleted: false };
    if (academicYear) filter['academicInfo.academicYear'] = academicYear;
    if (published === 'true') filter['workflow.isPublished'] = true;
    
    const marks = await ExamMarks.getMarksByStudent(req.params.studentId, academicYear, filter);
    
    res.json({
      success: true,
      message: `Found ${marks.length} marks entries`,
      marks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching student marks',
      error: error.message
    });
  }
});

export default router;
