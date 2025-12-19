import express from 'express';
import Exam from '../models/Exam.js';
import Subject from '../models/Subject.js';
import Student from '../models/Student.js';
import ExamResult from '../models/ExamResult.js';
import Department from '../models/Department.js';
import SubDepartment from '../models/SubDepartment.js';
import Batch from '../models/Batch.js';
import { auth } from '../middleware/auth.js';
import { ROLES } from '../utils/roles.js';
import { getCurrentAcademicYear, getAcademicYearFromDate } from '../utils/academicYear.js';

const router = express.Router();

// ==================== SUBJECTS ====================

// @route   GET /api/exams/subjects
// @desc    Get all subjects
// @access  Private
router.get('/subjects', auth, async (req, res) => {
  try {
    const subjects = await Subject.find({ isActive: true }).sort({ name: 1 });

    res.json({
      success: true,
      count: subjects.length,
      subjects
    });
  } catch (error) {
    console.error('Error fetching subjects:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching subjects',
      error: error.message
    });
  }
});

// @route   POST /api/exams/subjects
// @desc    Create new subject
// @access  Private (All except Parents)
router.post('/subjects', auth, async (req, res) => {
  try {
    const userRole = req.user.role;

    // Check permissions - all except parents
    if (userRole === ROLES.PARENT) {
      return res.status(403).json({
        success: false,
        message: 'Parents cannot create subjects'
      });
    }

    const { name, code, description, category, credits } = req.body;

    // Validate required fields
    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Name and code are required'
      });
    }

    const subject = new Subject({
      name,
      code,
      description,
      category,
      credits
    });

    await subject.save();

    res.status(201).json({
      success: true,
      message: 'Subject created successfully',
      subject
    });
  } catch (error) {
    console.error('Error creating subject:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Subject code already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating subject',
      error: error.message
    });
  }
});

// ==================== EXAMS ====================

// @route   GET /api/exams
// @desc    Get all exams with filtering
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    let {
      page = 1,
      limit = 20,
      department,
      subDepartment,
      batch,
      status,
      examType,
      createdBy,
      search,
      academicYear,
      showAllYears = 'false'
    } = req.query;

    // Normalize academicYear from query: treat "null"/"undefined"/empty as not provided
    if (academicYear === 'null' || academicYear === 'undefined' || academicYear === '') {
      academicYear = undefined;
    }

    // Build query
    let query = {};

    if (department) query.targetDepartment = department;
    if (subDepartment) query.targetSubDepartments = subDepartment;
    if (batch) query.targetBatches = batch;
    if (status) query.status = status;
    if (examType) query.examType = examType;
    if (createdBy) query.createdBy = createdBy;

    // Add search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Fetch all exams that match non-year filters
    console.log('📋 Exam query:', JSON.stringify(query));
    const examsRaw = await Exam.find(query)
      .populate('targetDepartment', 'name code')
      .populate('targetDepartments', 'name code')
      .populate('targetSubDepartments', 'name code')
      .populate('targetBatches', 'name code academicYear')
      .populate('subjects.subject', 'name code')
      .populate('customStudents', 'admissionNo fullName')
      .populate('createdBy', 'fullName email')
      .sort({ examDate: -1 });
    console.log('📋 Raw exams found:', examsRaw.length);

    // Apply academic year filtering
    const { getCurrentAcademicYear, getAcademicYearFromDate } = await import('../utils/academicYear.js');
    
    // Helper to normalize academic year format (handles both 2024-25 and 2024-2025)
    const normalizeYear = (year) => {
      if (!year) return null;
      const parts = year.split('-');
      if (parts.length !== 2) return year;
      const start = parts[0];
      let end = parts[1];
      if (end.length === 2) {
        end = start.substring(0, 2) + end;
      }
      return `${start}-${end}`;
    };

    let exams = examsRaw;
    if (showAllYears !== 'true') {
      const selectedYear = academicYear && academicYear !== 'all' 
        ? academicYear 
        : getCurrentAcademicYear();
      const normalizedSelectedYear = normalizeYear(selectedYear);
      
      exams = examsRaw.filter(exam => {
        const examYear = exam.academicYear || (exam.examDate ? getAcademicYearFromDate(exam.examDate) : null);
        return normalizeYear(examYear) === normalizedSelectedYear;
      });
      console.log('📋 After academic year filter:', exams.length, '(year:', selectedYear, ')');
    }

    // Manual pagination after filtering
    const total = exams.length;
    const start = (page - 1) * limit;
    const pagedExams = exams.slice(start, start + parseInt(limit));
    
    // Calculate eligible students count for each exam
    const examsWithCounts = await Promise.all(pagedExams.map(async (exam) => {
      let count = 0;
      try {
        if (exam.selectionType === 'custom') {
          count = exam.customStudents?.length || 0;
        } else {
          let studentQuery = { 
            isActive: true, 
            status: { $ne: 'leftout' }
          };
          
          if (exam.selectionType === 'department') {
            if (exam.targetDepartments && exam.targetDepartments.length > 0) {
              if (exam.targetDepartments.includes('__all__')) {
                // All departments - count all active students
                count = await Student.countDocuments(studentQuery);
              } else {
                studentQuery.department = { $in: exam.targetDepartments.map(d => d._id || d) };
                count = await Student.countDocuments(studentQuery);
              }
            } else if (exam.targetDepartment) {
              studentQuery.department = exam.targetDepartment._id || exam.targetDepartment;
              count = await Student.countDocuments(studentQuery);
            }
          } else if (exam.selectionType === 'subDepartment' && exam.targetSubDepartments.length > 0) {
            studentQuery.subDepartments = { $in: exam.targetSubDepartments.map(sd => sd._id || sd) };
            count = await Student.countDocuments(studentQuery);
          } else if (exam.selectionType === 'batch' && exam.targetBatches.length > 0) {
            studentQuery.batches = { $in: exam.targetBatches.map(b => b._id || b) };
            count = await Student.countDocuments(studentQuery);
          }
        }
      } catch (error) {
        console.error(`Error counting students for exam ${exam._id}:`, error);
        count = 0;
      }
      
      return {
        ...exam.toObject(),
        eligibleStudentsCount: count
      };
    }));

    res.json({
      success: true,
      count: examsWithCounts.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      exams: examsWithCounts
    });
  } catch (error) {
    console.error('Error fetching exams:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching exams',
      error: error.message
    });
  }
});

// @route   GET /api/exams/:id
// @desc    Get single exam with eligible students
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('targetDepartment', 'name code')
      .populate('targetDepartments', 'name code')
      .populate('targetSubDepartments', 'name code')
      .populate('targetBatches', 'name code academicYear')
      .populate('subjects.subject', 'name code category')
      .populate('customStudents', 'admissionNo fullName')
      .populate('createdBy', 'fullName email');

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    // Get eligible students based on exam scope
    let eligibleStudents = [];

    if (exam.selectionType === 'custom') {
      eligibleStudents = exam.customStudents;
    } else {
      let studentQuery = { 
        isActive: true, 
        status: { $ne: 'leftout' } // Exclude leftout students from exams
      };

      if (exam.selectionType === 'department') {
        // Handle multiple departments or "All Departments"
        if (exam.targetDepartments && exam.targetDepartments.length > 0) {
          if (exam.targetDepartments.includes('__all__')) {
            // All departments - no filter needed
          } else {
            // Multiple specific departments
            studentQuery.department = { $in: exam.targetDepartments.map(d => d._id || d) };
          }
        } else if (exam.targetDepartment) {
          // Single department (backward compatibility)
          studentQuery.department = exam.targetDepartment._id || exam.targetDepartment;
        }
      } else if (exam.selectionType === 'subDepartment' && exam.targetSubDepartments.length > 0) {
        studentQuery.subDepartments = { $in: exam.targetSubDepartments.map(sd => sd._id || sd) };
      } else if (exam.selectionType === 'batch' && exam.targetBatches.length > 0) {
        studentQuery.batches = { $in: exam.targetBatches.map(b => b._id || b) };
      }

      eligibleStudents = await Student.find(studentQuery)
        .select('admissionNo fullName department subDepartments batches')
        .populate('department', 'name code')
        .populate('subDepartments', 'name code')
        .populate('batches', 'name code academicYear')
        .sort({ fullName: 1 });
    }

    res.json({
      success: true,
      exam,
      eligibleStudents,
      eligibleStudentsCount: eligibleStudents.length
    });
  } catch (error) {
    console.error('Error fetching exam:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching exam',
      error: error.message
    });
  }
});

// @route   POST /api/exams
// @desc    Create new exam
// @access  Private (All except Parents)
router.post('/', auth, async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    // Check permissions - all except parents
    if (userRole === ROLES.PARENT) {
      return res.status(403).json({
        success: false,
        message: 'Parents cannot create exams'
      });
    }

    console.log('📝 Creating exam with data:', JSON.stringify(req.body, null, 2));

    const {
      title, name, description, examScope, selectionType, department, departments, targetDepartments, subDepartments, batches,
      customStudents, subjects, examDate, startTime, endTime, duration, examType,
      instructions, remarks, venue, useDivisions, divisions
    } = req.body;
    
    // Support both single department and multiple departments
    // If "__all__" is present, we treat it as "all departments" but DO NOT store it in Mongo
    let departmentsListRaw = targetDepartments || departments || (department ? [department] : []);
    let hasAllDepartmentsSentinel = false;
    if (Array.isArray(departmentsListRaw)) {
      if (departmentsListRaw.includes('__all__')) {
        hasAllDepartmentsSentinel = true;
      }
    }
    // Remove "__all__" from the stored list (we'll infer "all" when arrays are empty)
    let departmentsList = Array.isArray(departmentsListRaw)
      ? departmentsListRaw.filter(d => d && d !== '__all__')
      : [];

    // Use name if provided, otherwise use title (for backward compatibility)
    const examName = name || title;
    const examScopeValue = examScope || selectionType;

    // Validate required fields
    if (!examName || !examScopeValue || !examDate || !subjects || subjects.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: name (or title), examScope (or selectionType), examDate, subjects'
      });
    }

    // Validate exam scope requirements
    if (examScopeValue === 'department') {
      const hasDepartments = departmentsList.length > 0;
      // Valid if:
      // - At least one specific department is selected, OR
      // - The "__all__" sentinel was present (meaning "all departments")
      if (!hasDepartments && !hasAllDepartmentsSentinel) {
        return res.status(400).json({
          success: false,
          message: 'At least one department or \"All Departments\" is required for department scope'
        });
      }
    }

    if (examScopeValue === 'subDepartment' && (!subDepartments || subDepartments.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Sub-departments are required for sub-department scope'
      });
    }

    if (examScopeValue === 'batch' && (!batches || batches.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Batches are required for batch scope'
      });
    }

    if (examScopeValue === 'custom' && (!customStudents || customStudents.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Custom students are required for custom scope'
      });
    }

    // Validate subjects
    if (!Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Subjects must be a non-empty array'
      });
    }

    // Extract subject IDs
    const subjectIds = subjects.map(s => {
      if (typeof s === 'string') {
        return s; // If subject is just an ID string
      }
      return s.subject || s._id; // If subject is an object
    });

    const validSubjects = await Subject.find({ _id: { $in: subjectIds } });
    if (validSubjects.length !== subjectIds.length) {
      return res.status(400).json({
        success: false,
        message: `Some subjects are invalid. Found ${validSubjects.length} valid out of ${subjectIds.length} requested.`,
        requested: subjectIds,
        found: validSubjects.map(s => s._id.toString())
      });
    }

    // Ensure all subjects have required fields
    const formattedSubjects = subjects.map((s, index) => {
      const baseSubject = typeof s === 'string' 
        ? {
            subject: s,
            maxMarks: 100,
            passingMarks: 40,
            weightage: 1
          }
        : {
            subject: s.subject || s._id,
            maxMarks: s.maxMarks || 100,
            passingMarks: s.passingMarks || 40,
            weightage: s.weightage || 1
          };
      
      // Add division support if enabled (fixed 10 divisions)
      if (useDivisions) {
        baseSubject.useDivisions = true;
        baseSubject.divisions = Array.from({ length: 10 }, (_, i) => ({
          name: `Division ${i + 1}`,
          maxMarks: 10,
          order: i + 1
        }));
      } else {
        baseSubject.useDivisions = false;
        baseSubject.divisions = [];
      }
      
      return baseSubject;
    });

    // Map to model fields
    // examId will be auto-generated by the model's pre-save hook if not provided
    const examData = {
      name: examName,
      description,
      selectionType: examScopeValue,
      // Support both single and multiple departments
      // If no departments are stored (and sentinel was used), it means "all departments"
      targetDepartment: examScopeValue === 'department' && departmentsList.length === 1
        ? departmentsList[0]
        : undefined,
      targetDepartments: examScopeValue === 'department' && departmentsList.length > 1
        ? departmentsList
        : undefined,
      targetSubDepartments: subDepartments,
      targetBatches: batches,
      customStudents,
      subjects: formattedSubjects,
      examDate,
      startTime: startTime || '09:00',
      endTime: endTime || '12:00',
      duration: duration || 180,
      examType,
      instructions,
      venue,
      remarks,
      academicYear: examDate ? getAcademicYearFromDate(new Date(examDate)) : getCurrentAcademicYear(),
      createdBy: userId
      // examId will be auto-generated by pre-save hook
    };

    const exam = new Exam(examData);
    
    console.log('📅 Exam academicYear:', examData.academicYear);
    console.log('📅 Exam examDate:', examDate);

    await exam.save();
    console.log('✅ Exam saved with ID:', exam._id, 'academicYear:', exam.academicYear);
    await exam.populate([
      { path: 'targetDepartment', select: 'name code' },
      { path: 'targetDepartments', select: 'name code' },
      { path: 'targetSubDepartments', select: 'name code' },
      { path: 'targetBatches', select: 'name code academicYear' },
      { path: 'subjects.subject', select: 'name code' },
      { path: 'createdBy', select: 'fullName email' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Exam created successfully',
      exam
    });
  } catch (error) {
    console.error('Error creating exam:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating exam',
      error: error.message
    });
  }
});

// @route   PUT /api/exams/:id
// @desc    Update exam
// @access  Private (Creator/Admin/Coordinator)
router.put('/:id', auth, async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    const existingExam = await Exam.findById(req.params.id);
    if (!existingExam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    // Check permissions
    const canUpdate = [ROLES.ADMIN, ROLES.COORDINATOR].includes(userRole) || 
                     existingExam.createdBy.toString() === userId;

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    // Cannot update if exam is completed
    if (existingExam.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update completed exam'
      });
    }

    console.log('📝 Updating exam with data:', JSON.stringify(req.body, null, 2));

    const {
      title, name, description, examScope, selectionType, department, subDepartments, batches,
      customStudents, subjects, examDate, startTime, endTime, duration, examType,
      instructions, remarks, venue, status
    } = req.body;

    const examName = name || title || existingExam.name;
    const examScopeValue = examScope || selectionType || existingExam.selectionType;

    // Validate subjects if provided (allow partial update without subjects)
    let formattedSubjects = existingExam.subjects;
    if (subjects) {
      if (!Array.isArray(subjects) || subjects.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Subjects must be a non-empty array'
        });
      }

      const subjectIds = subjects.map(s => {
        if (typeof s === 'string') return s;
        return s.subject || s._id;
      });

      const validSubjects = await Subject.find({ _id: { $in: subjectIds } });
      if (validSubjects.length !== subjectIds.length) {
        return res.status(400).json({
          success: false,
          message: `Some subjects are invalid. Found ${validSubjects.length} valid out of ${subjectIds.length} requested.`,
          requested: subjectIds,
          found: validSubjects.map(s => s._id.toString())
        });
      }

      formattedSubjects = subjects.map(s => {
        if (typeof s === 'string') {
          return {
            subject: s,
            maxMarks: 100,
            passingMarks: 40,
            weightage: 1
          };
        }
        return {
          subject: s.subject || s._id,
          maxMarks: s.maxMarks || 100,
          passingMarks: s.passingMarks || 40,
          weightage: s.weightage || 1
        };
      });
    }

    const updateData = {
      name: examName,
      description,
      selectionType: examScopeValue,
      targetDepartment: department,
      targetSubDepartments: subDepartments,
      targetBatches: batches,
      customStudents,
      examDate,
      startTime,
      endTime,
      duration,
      examType,
      instructions,
      venue,
      remarks,
      status
    };
    
    // Update academicYear if examDate is provided
    if (examDate) {
      updateData.academicYear = getAcademicYearFromDate(new Date(examDate));
    }

    // Only set subjects if they were provided in the request
    if (subjects) {
      updateData.subjects = formattedSubjects;
    }

    const updatedExam = await Exam.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate([
      { path: 'targetDepartment', select: 'name code' },
      { path: 'targetSubDepartments', select: 'name code' },
      { path: 'targetBatches', select: 'name code academicYear' },
      { path: 'subjects.subject', select: 'name code' },
      { path: 'createdBy', select: 'fullName email' }
    ]);

    res.json({
      success: true,
      message: 'Exam updated successfully',
      exam: updatedExam
    });
  } catch (error) {
    console.error('Error updating exam:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating exam',
      error: error.message
    });
  }
});

// @route   DELETE /api/exams/:id
// @desc    Delete exam
// @access  Private (Creator/Admin/Coordinator)
router.delete('/:id', auth, async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    // Check permissions
    const canDelete = [ROLES.ADMIN, ROLES.COORDINATOR].includes(userRole) || 
                     exam.createdBy.toString() === userId;

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    // Cannot delete if exam has results
    const resultsCount = await ExamResult.countDocuments({ exam: req.params.id });
    if (resultsCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete exam with existing results'
      });
    }

    await Exam.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Exam deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting exam:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting exam',
      error: error.message
    });
  }
});

export default router;
