import express from 'express';
import { auth } from '../middleware/auth.js';
import { permit, requireAccessLevel } from '../middleware/rbac.js';
import { ROLES } from '../utils/roles.js';
import { getCurrentAcademicYear } from '../utils/academicYear.js';
import Exam from '../models/Exam.js';
import ExamGroup from '../models/ExamGroup.js';
import ExamResult from '../models/ExamResult.js';
import Student from '../models/Student.js';
import Department from '../models/Department.js';
import SubDepartment from '../models/SubDepartment.js';
import Subject from '../models/Subject.js';
import Batch from '../models/Batch.js';
import User from '../models/User.js';

const router = express.Router();

// ==================== EXAM MANAGEMENT APIS ====================

// 📝 GET /api/exams - Get all exams with filtering
router.get('/', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      examType,
      subject,
      academicYear,
      myExams = 'false',
      showAllYears = 'false' // New parameter to show all years or just current
    } = req.query;

    let query = { isDeleted: false };
    
    // Default to current academic year if not specified and showAllYears is false
    if (!academicYear && showAllYears !== 'true') {
      const currentYear = getCurrentAcademicYear();
      query.academicYear = currentYear;
    } else if (academicYear) {
      query.academicYear = academicYear;
    }
    
    // Filter to only exams user created or is assigned to
    if (myExams === 'true' || req.user.role === ROLES.TEACHER) {
      // For teachers, show exams they created or are assigned to mark
      if (req.user.role === ROLES.TEACHER) {
        const assignedGroups = await ExamGroup.find({
          'assignedTeachers.teacher': req.user.id,
          'assignedTeachers.assignment.isActive': true,
          isDeleted: false
        }).select('exam');
        
        const assignedExamIds = assignedGroups.map(group => group.exam);
        
        query.$or = [
          { createdBy: req.user.id },
          { _id: { $in: assignedExamIds } }
        ];
      } else {
        query.createdBy = req.user.id;
      }
    }
    
    if (status) query.status = status;
    if (examType) query.examType = examType;
    if (subject) query.subject = new RegExp(subject, 'i');
    if (academicYear) query['academicInfo.academicYear'] = academicYear;
    
    if (search) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { examName: new RegExp(search, 'i') },
          { subject: new RegExp(search, 'i') },
          { description: new RegExp(search, 'i') }
        ]
      });
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { 'schedule.startDate': -1 },
      populate: [
        { path: 'createdBy', select: 'personalInfo.fullName role' },
        { path: 'workflow.approvedBy', select: 'personalInfo.fullName' }
      ]
    };

    const exams = await Exam.paginate(query, options);

    res.json({
      success: true,
      message: 'Exams retrieved successfully',
      data: {
        exams: exams.docs,
        pagination: {
          currentPage: exams.page,
          totalPages: exams.totalPages,
          totalRecords: exams.totalDocs,
          hasNext: exams.hasNextPage,
          hasPrev: exams.hasPrevPage
        }
      }
    });
  } catch (error) {
    console.error('Error fetching exams:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch exams',
      error: error.message
    });
  }
});

// 📝 POST /api/exams - Create new exam
router.post('/', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD), async (req, res) => {
  try {
    const {
      examName,
      examType,
      subject,
      description,
      schedule,
      marksConfig,
      academicInfo,
      instructions,
      settings,
      useDivisions,
      divisions
    } = req.body;

    // Validate required fields
    if (!examName || !examType || !subject || !schedule?.startDate || !schedule?.endDate || !marksConfig?.totalMarks) {
      return res.status(400).json({
        success: false,
        message: 'Exam name, type, subject, schedule, and marks configuration are required'
      });
    }

    // Validate dates
    const startDate = new Date(schedule.startDate);
    const endDate = new Date(schedule.endDate);
    
    if (startDate >= endDate) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date'
      });
    }

    // Handle subject - if it's a string, find or create Subject document
    let subjectId = subject;
    if (typeof subject === 'string') {
      // Try to find existing subject by name
      let subjectDoc = await Subject.findOne({ 
        name: { $regex: new RegExp(`^${subject}$`, 'i') } 
      });
      
      if (!subjectDoc) {
        // Create new subject if it doesn't exist
        subjectDoc = new Subject({
          name: subject,
          code: subject.toUpperCase().replace(/\s+/g, '_'),
          category: 'vedic_studies', // Default category
          level: 'prathama', // Default level
          type: 'core',
          maxMarks: marksConfig?.totalMarks || 100,
          passingMarks: marksConfig?.passingMarks || 35,
          academicYear: academicInfo?.academicYear || getCurrentAcademicYear(),
          createdBy: req.user.id
        });
        await subjectDoc.save();
      }
      subjectId = subjectDoc._id;
    }

    // Generate unique exam ID
    const examId = Exam.generateExamId();

    // Set default grade boundaries if not provided
    const defaultGradeBoundaries = marksConfig.gradeBoundaries || [
      { grade: 'A+', minMarks: 90, maxMarks: 100, gpaValue: 4.0, description: 'Excellent' },
      { grade: 'A', minMarks: 80, maxMarks: 89, gpaValue: 3.5, description: 'Very Good' },
      { grade: 'B+', minMarks: 70, maxMarks: 79, gpaValue: 3.0, description: 'Good' },
      { grade: 'B', minMarks: 60, maxMarks: 69, gpaValue: 2.5, description: 'Satisfactory' },
      { grade: 'C', minMarks: 50, maxMarks: 59, gpaValue: 2.0, description: 'Pass' },
      { grade: 'F', minMarks: 0, maxMarks: 49, gpaValue: 0.0, description: 'Fail' }
    ];

    // Prepare subjects array with division support
    const subjectsArray = [{
      subject: subjectId,
      maxMarks: marksConfig.totalMarks,
      passingMarks: marksConfig.passingMarks || Math.ceil(marksConfig.totalMarks * 0.4),
      weightage: 1,
      useDivisions: useDivisions || false,
      divisions: (useDivisions && divisions && divisions.length > 0) 
        ? divisions.map((div, index) => ({
            name: div.name || `Division ${index + 1}`,
            maxMarks: div.maxMarks || 10,
            order: div.order || index + 1
          }))
        : []
    }];

    // Create new exam
    const newExam = new Exam({
      examId,
      examName,
      examType,
      subject: subjectId,
      subjectName: typeof subject === 'string' ? subject : undefined,
      subjects: subjectsArray,
      description,
      academicInfo: {
        academicYear: academicInfo?.academicYear || getCurrentAcademicYear(),
        term: academicInfo?.term || 'annual',
        semester: academicInfo?.semester,
        month: academicInfo?.month,
        week: academicInfo?.week
      },
      schedule: {
        startDate,
        endDate,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        duration: schedule.duration,
        sessions: schedule.sessions || []
      },
      marksConfig: {
        totalMarks: marksConfig.totalMarks,
        passingMarks: marksConfig.passingMarks || Math.ceil(marksConfig.totalMarks * 0.4),
        gradeScale: marksConfig.gradeScale || 'percentage',
        gradeBoundaries: defaultGradeBoundaries,
        components: marksConfig.components || [
          { name: 'Theory', maxMarks: marksConfig.totalMarks, weightage: 100, isRequired: true }
        ]
      },
      instructions: instructions || {},
      settings: {
        allowLateSubmission: false,
        allowMakeupExam: true,
        autoPublishResults: false,
        allowRetakes: false,
        maxRetakeAttempts: 1,
        ...settings
      },
      status: 'draft',
      createdBy: req.user.id
    });

    await newExam.save();

    // Add audit entry
    await newExam.addAuditEntry('created', req.user.id, 'Exam created');

    // Populate the response
    await newExam.populate('createdBy', 'personalInfo.fullName role');

    res.status(201).json({
      success: true,
      message: 'Exam created successfully',
      data: { exam: newExam }
    });
  } catch (error) {
    console.error('Error creating exam:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create exam',
      error: error.message
    });
  }
});

// 📝 GET /api/exams/:id - Get specific exam details
router.get('/:id', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const exam = await Exam.findOne({
      _id: req.params.id,
      isDeleted: false
    }).populate([
      { path: 'createdBy', select: 'personalInfo.fullName role' },
      { path: 'workflow.approvedBy', select: 'personalInfo.fullName' },
      { path: 'workflow.marksEntryStartedBy', select: 'personalInfo.fullName' },
      { path: 'workflow.marksEntryCompletedBy', select: 'personalInfo.fullName' },
      { path: 'workflow.resultsPublishedBy', select: 'personalInfo.fullName' }
    ]);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    // Check if user can access this exam
    if (req.user.role === ROLES.TEACHER) {
      // Check if teacher is assigned to any group in this exam
      const assignedGroup = await ExamGroup.findOne({
        exam: req.params.id,
        'assignedTeachers.teacher': req.user.id,
        'assignedTeachers.assignment.isActive': true,
        isDeleted: false
      });

      if (!assignedGroup && exam.createdBy._id.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this exam'
        });
      }
    }

    // Get exam groups
    const examGroups = await ExamGroup.find({
      exam: req.params.id,
      isDeleted: false
    }).populate([
      { path: 'assignedTeachers.teacher', select: 'personalInfo.fullName role' },
      { path: 'createdBy', select: 'personalInfo.fullName' }
    ]).select('groupId groupName statistics status workflow assignedTeachers');

    // Calculate updated statistics
    await exam.calculateStatistics();

    res.json({
      success: true,
      message: 'Exam details retrieved successfully',
      data: {
        exam,
        groups: examGroups,
        summary: exam.getExamSummary()
      }
    });
  } catch (error) {
    console.error('Error fetching exam details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch exam details',
      error: error.message
    });
  }
});

// 📝 PUT /api/exams/:id - Update exam
router.put('/:id', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD), async (req, res) => {
  try {
    const exam = await Exam.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    // Check if exam can be modified
    if (exam.status === 'completed' || exam.status === 'results-published') {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify exam after completion or results publication'
      });
    }

    // Check permissions
    if (req.user.role === ROLES.HOD && exam.createdBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'HOD can only modify exams they created'
      });
    }

    const updates = req.body;
    delete updates._id;
    delete updates.examId;
    delete updates.createdBy;
    delete updates.createdAt;
    delete updates.statistics; // Statistics are auto-calculated

    // Store previous data for audit
    const previousData = {
      examName: exam.examName,
      schedule: exam.schedule,
      marksConfig: exam.marksConfig
    };

    updates.modifiedBy = req.user.id; // This will be used in pre-save middleware
    Object.assign(exam, updates);
    await exam.save();

    // Add audit entry for significant changes
    await exam.addAuditEntry(
      'updated',
      req.user.id,
      'Exam configuration updated',
      previousData,
      {
        examName: exam.examName,
        schedule: exam.schedule,
        marksConfig: exam.marksConfig
      }
    );

    await exam.populate('createdBy', 'personalInfo.fullName role');

    res.json({
      success: true,
      message: 'Exam updated successfully',
      data: { exam }
    });
  } catch (error) {
    console.error('Error updating exam:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update exam',
      error: error.message
    });
  }
});

// 📝 PUT /api/exams/:id/approve - Approve exam for conduct
router.put('/:id/approve', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const { comments } = req.body;

    const exam = await Exam.findOne({
      _id: req.params.id,
      isDeleted: false
    });

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

    if (exam.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Only draft exams can be approved'
      });
    }

    await exam.approveExam(req.user.id);

    res.json({
      success: true,
      message: 'Exam approved successfully',
      data: {
        examId: exam.examId,
        approvedBy: req.user.id,
        approvedAt: exam.workflow.approvedAt,
        status: exam.status
      }
    });
  } catch (error) {
    console.error('Error approving exam:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve exam',
      error: error.message
    });
  }
});

// 📝 DELETE /api/exams/:id - Delete exam (soft delete)
router.delete('/:id', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const exam = await Exam.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    // Check if exam can be deleted
    if (exam.status === 'ongoing' || exam.status === 'completed' || exam.status === 'results-published') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete exam that is ongoing, completed, or has published results'
      });
    }

    exam.isDeleted = true;
    exam.deletedAt = new Date();
    exam.deletedBy = req.user.id;
    exam.status = 'cancelled';

    await exam.save();

    // Also soft delete all associated groups and results
    await ExamGroup.updateMany(
      { exam: req.params.id },
      { 
        isDeleted: true, 
        deletedAt: new Date(), 
        deletedBy: req.user.id 
      }
    );

    await ExamResult.updateMany(
      { exam: req.params.id },
      { 
        isDeleted: true, 
        deletedAt: new Date(), 
        deletedBy: req.user.id 
      }
    );

    await exam.addAuditEntry('cancelled', req.user.id, 'Exam cancelled and deleted');

    res.json({
      success: true,
      message: 'Exam deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting exam:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete exam',
      error: error.message
    });
  }
});

// ==================== EXAM GROUPS MANAGEMENT ====================

// 👥 GET /api/exams/:id/groups - Get all groups for an exam
router.get('/:id/groups', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const exam = await Exam.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    const groups = await ExamGroup.findByExam(req.params.id);

    res.json({
      success: true,
      message: 'Exam groups retrieved successfully',
      data: {
        examId: exam.examId,
        examName: exam.examName,
        groups
      }
    });
  } catch (error) {
    console.error('Error fetching exam groups:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch exam groups',
      error: error.message
    });
  }
});

// 👥 POST /api/exams/:id/groups - Create new group in exam
router.post('/:id/groups', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD), async (req, res) => {
  try {
    const {
      groupName,
      description,
      studentSelection,
      students = [],
      groupSettings
    } = req.body;

    if (!groupName || !studentSelection?.selectionType) {
      return res.status(400).json({
        success: false,
        message: 'Group name and selection type are required'
      });
    }

    const exam = await Exam.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    // Generate unique group ID
    const groupId = ExamGroup.generateGroupId(exam.examId, groupName);

    // Process student selection based on type
    let selectedStudents = [];

    if (studentSelection.selectionType === 'manual') {
      // Manual selection - use provided students
      selectedStudents = students;
    } else if (studentSelection.selectionType === 'by-department') {
      // Auto-select students from departments
      const query = {
        'academicInfo.department': { $in: studentSelection.academicFilters.departments },
        isActive: true,
        isDeleted: false
      };
      
      if (studentSelection.academicFilters.academicYear) {
        query['academicInfo.academicYear'] = studentSelection.academicFilters.academicYear;
      }
      
      const autoStudents = await Student.find(query).select('_id fullName admissionNo academicInfo');
      
      selectedStudents = autoStudents.map(student => ({
        studentId: student._id,
        academicSource: {
          department: student.academicInfo.department,
          subDepartment: student.academicInfo.subDepartment,
          batch: student.academicInfo.batches?.[0]?.batch || student.academicInfo.batch
        }
      }));
    } else if (studentSelection.selectionType === 'by-subdepartment') {
      // Auto-select students from sub-departments
      const query = {
        'academicInfo.subDepartment': { $in: studentSelection.academicFilters.subDepartments },
        isActive: true,
        isDeleted: false
      };
      
      if (studentSelection.academicFilters.academicYear) {
        query['academicInfo.academicYear'] = studentSelection.academicFilters.academicYear;
      }
      
      const autoStudents = await Student.find(query).select('_id fullName admissionNo academicInfo');
      
      selectedStudents = autoStudents.map(student => ({
        studentId: student._id,
        academicSource: {
          department: student.academicInfo.department,
          subDepartment: student.academicInfo.subDepartment,
          batch: student.academicInfo.batches?.[0]?.batch || student.academicInfo.batch
        }
      }));
    } else if (studentSelection.selectionType === 'by-batch') {
      // Auto-select students from batches (handle both array and legacy single field)
      const query = {
        $or: [
          { 'academicInfo.batches.batch': { $in: studentSelection.academicFilters.batches } },
          { 'academicInfo.batch': { $in: studentSelection.academicFilters.batches } }
        ],
        'academicInfo.batches.status': 'active',
        isActive: true,
        isDeleted: false
      };
      
      if (studentSelection.academicFilters.academicYear) {
        query['academicInfo.academicYear'] = studentSelection.academicFilters.academicYear;
      }
      
      const autoStudents = await Student.find(query).select('_id fullName admissionNo academicInfo');
      
      selectedStudents = autoStudents.map(student => ({
        studentId: student._id,
        academicSource: {
          department: student.academicInfo.department,
          subDepartment: student.academicInfo.subDepartment,
          batch: student.academicInfo.batches?.[0]?.batch || student.academicInfo.batch
        }
      }));
    } else if (studentSelection.selectionType === 'mixed') {
      // Mixed selection - combine multiple filters
      const query = {
        $or: [],
        isActive: true,
        isDeleted: false
      };
      
      if (studentSelection.academicFilters.departments?.length > 0) {
        query.$or.push({ 'academicInfo.department': { $in: studentSelection.academicFilters.departments } });
      }
      
      if (studentSelection.academicFilters.subDepartments?.length > 0) {
        query.$or.push({ 'academicInfo.subDepartment': { $in: studentSelection.academicFilters.subDepartments } });
      }
      
      if (studentSelection.academicFilters.batches?.length > 0) {
        query.$or.push(
          { 'academicInfo.batches.batch': { $in: studentSelection.academicFilters.batches } },
          { 'academicInfo.batch': { $in: studentSelection.academicFilters.batches } }
        );
      }
      
      if (query.$or.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one academic filter is required for mixed selection'
        });
      }
      
      if (studentSelection.academicFilters.academicYear) {
        query['academicInfo.academicYear'] = studentSelection.academicFilters.academicYear;
      }
      
      const autoStudents = await Student.find(query).select('_id fullName admissionNo academicInfo');
      
      selectedStudents = autoStudents.map(student => ({
        studentId: student._id,
        academicSource: {
          department: student.academicInfo.department,
          subDepartment: student.academicInfo.subDepartment,
          batch: student.academicInfo.batches?.[0]?.batch || student.academicInfo.batch
        }
      }));
    }

    // Create new exam group
    const newGroup = new ExamGroup({
      groupId,
      exam: req.params.id,
      groupName,
      description,
      studentSelection,
      students: selectedStudents.map((s, index) => ({
        student: s.studentId,
        rollNumber: s.rollNumber || `${groupId}-${(index + 1).toString().padStart(3, '0')}`,
        seatNumber: s.seatNumber,
        status: 'active',
        examDetails: {
          isEligible: true,
          previousAttempts: 0,
          isRetake: false,
          ...s.examDetails
        },
        academicSource: s.academicSource || {},
        addedBy: req.user.id
      })),
      groupSettings: groupSettings || {},
      status: 'draft',
      createdBy: req.user.id
    });

    await newGroup.save();

    // Update exam statistics
    await exam.calculateStatistics();

    await newGroup.populate([
      { path: 'students.student', select: 'fullName admissionNo' },
      { path: 'createdBy', select: 'fullName email' }
    ]);

    res.status(201).json({
      success: true,
      message: `Exam group created successfully with ${selectedStudents.length} students`,
      data: { group: newGroup }
    });
  } catch (error) {
    console.error('Error creating exam group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create exam group',
      error: error.message
    });
  }
});

// 👥 PUT /api/exams/:examId/groups/:groupId/students - Manage students in group
router.put('/:examId/groups/:groupId/students', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD), async (req, res) => {
  try {
    const { action, students } = req.body; // action: 'add' | 'remove'

    if (!action || !students || !Array.isArray(students)) {
      return res.status(400).json({
        success: false,
        message: 'Action and students array are required'
      });
    }

    const group = await ExamGroup.findOne({
      groupId: req.params.groupId,
      exam: req.params.examId,
      isDeleted: false
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Exam group not found'
      });
    }

    if (group.workflow.isStudentListFinalized) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify student list after finalization'
      });
    }

    const results = [];
    const errors = [];

    if (action === 'add') {
      for (const studentData of students) {
        try {
          await group.addStudent(
            studentData.studentId,
            studentData.examDetails || {},
            studentData.academicSource || {},
            req.user.id
          );
          results.push({ studentId: studentData.studentId, status: 'added' });
        } catch (error) {
          errors.push({ studentId: studentData.studentId, error: error.message });
        }
      }
    } else if (action === 'remove') {
      for (const studentData of students) {
        try {
          await group.removeStudent(studentData.studentId, studentData.reason || 'removed');
          results.push({ studentId: studentData.studentId, status: 'removed' });
        } catch (error) {
          errors.push({ studentId: studentData.studentId, error: error.message });
        }
      }
    }

    // Update exam statistics
    const exam = await Exam.findById(req.params.examId);
    await exam.calculateStatistics();

    res.json({
      success: true,
      message: `${action} operation completed`,
      data: {
        successful: results,
        errors: errors.length > 0 ? errors : undefined,
        groupStatistics: group.statistics
      }
    });
  } catch (error) {
    console.error('Error managing group students:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to manage group students',
      error: error.message
    });
  }
});

// 👩‍🏫 PUT /api/exams/:examId/groups/:groupId/teachers - Assign teachers to group
router.put('/:examId/groups/:groupId/teachers', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD), async (req, res) => {
  try {
    const { action, teachers } = req.body; // action: 'assign' | 'unassign'

    if (!action || !teachers || !Array.isArray(teachers)) {
      return res.status(400).json({
        success: false,
        message: 'Action and teachers array are required'
      });
    }

    const group = await ExamGroup.findOne({
      groupId: req.params.groupId,
      exam: req.params.examId,
      isDeleted: false
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Exam group not found'
      });
    }

    const results = [];
    const errors = [];

    if (action === 'assign') {
      for (const teacherData of teachers) {
        try {
          await group.assignTeacher(
            teacherData.teacherId,
            teacherData.role || 'primary-examiner',
            teacherData.markingResponsibility || {},
            req.user.id
          );
          results.push({ teacherId: teacherData.teacherId, status: 'assigned' });
        } catch (error) {
          errors.push({ teacherId: teacherData.teacherId, error: error.message });
        }
      }
    } else if (action === 'unassign') {
      for (const teacherData of teachers) {
        try {
          await group.unassignTeacher(
            teacherData.teacherId,
            teacherData.role,
            req.user.id,
            teacherData.reason || 'Unassigned'
          );
          results.push({ teacherId: teacherData.teacherId, status: 'unassigned' });
        } catch (error) {
          errors.push({ teacherId: teacherData.teacherId, error: error.message });
        }
      }
    }

    res.json({
      success: true,
      message: `Teacher ${action} operation completed`,
      data: {
        successful: results,
        errors: errors.length > 0 ? errors : undefined,
        groupStatistics: group.statistics
      }
    });
  } catch (error) {
    console.error('Error managing group teachers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to manage group teachers',
      error: error.message
    });
  }
});

// ==================== HELPER ROUTES ====================

// 🔍 GET /api/exams/helpers/upcoming - Get upcoming exams
router.get('/helpers/upcoming', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const { daysAhead = 30 } = req.query;
    
    const upcomingExams = await Exam.findUpcomingExams(parseInt(daysAhead));
    
    res.json({
      success: true,
      message: 'Upcoming exams retrieved successfully',
      data: { exams: upcomingExams }
    });
  } catch (error) {
    console.error('Error fetching upcoming exams:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch upcoming exams',
      error: error.message
    });
  }
});

// 🎓 GET /api/exams/helpers/academic-entities - Get academic entities for group creation
router.get('/helpers/academic-entities', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD), async (req, res) => {
  try {
    const [departments, subDepartments, batches] = await Promise.all([
      Department.find({ isDeleted: false }).select('name code description'),
      SubDepartment.find({ isDeleted: false }).select('name code description department').populate('department', 'name'),
      Batch.find({ isDeleted: false }).select('name code description department subDepartment').populate([
        { path: 'department', select: 'name' },
        { path: 'subDepartment', select: 'name' }
      ])
    ]);

    res.json({
      success: true,
      message: 'Academic entities retrieved successfully',
      data: {
        departments,
        subDepartments,
        batches
      }
    });
  } catch (error) {
    console.error('Error fetching academic entities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch academic entities',
      error: error.message
    });
  }
});

// 👩‍🏫 GET /api/exams/helpers/teachers - Get available teachers
router.get('/helpers/teachers', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD), async (req, res) => {
  try {
    const { department, subject, role = ROLES.TEACHER } = req.query;
    
    let query = { 
      role: role,
      isDeleted: false 
    };
    
    // Add filters if provided
    if (department) {
      // Find teachers assigned to specific department
      query['teachingAssignments.department'] = department;
      query['teachingAssignments.isActive'] = true;
    }

    const teachers = await User.find(query)
      .select('personalInfo.fullName email role teachingAssignments')
      .populate('teachingAssignments.department', 'name')
      .sort({ 'personalInfo.fullName': 1 });

    res.json({
      success: true,
      message: 'Teachers retrieved successfully',
      data: { teachers }
    });
  } catch (error) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch teachers',
      error: error.message
    });
  }
});

export default router; 