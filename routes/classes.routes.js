import express from 'express';
import mongoose from 'mongoose';
import { auth } from '../middleware/auth.js';
import { permit, requireAccessLevel } from '../middleware/rbac.js';
import { ROLES } from '../utils/roles.js';
import { getCurrentAcademicYear } from '../utils/academicYear.js';
import SubjectClass from '../models/SubjectClass.js';
import ClassAttendance from '../models/ClassAttendance.js';
import Student from '../models/Student.js';
import Department from '../models/Department.js';
import SubDepartment from '../models/SubDepartment.js';
import Batch from '../models/Batch.js';
import User from '../models/User.js';

const router = express.Router();

// ==================== CLASS MANAGEMENT APIS ====================

// 🎓 GET /api/classes - Get classes accessible to current user
router.get('/', auth, permit(ROLES.TEACHER, ROLES.HOD, ROLES.PRINCIPAL, ROLES.ADMIN), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      subject,
      academicYear,
      status = 'active',
      myClasses = 'false',
      showAllYears = 'false' // New parameter to show all years or just current
    } = req.query;

    let query = { isDeleted: false, status };
    
    // Default to current academic year if not specified and showAllYears is false
    if (!academicYear && showAllYears !== 'true') {
      const currentYear = getCurrentAcademicYear();
      query['academicInfo.academicYear'] = currentYear;
    } else if (academicYear) {
      query['academicInfo.academicYear'] = academicYear;
    }
    
    // Filter to only classes user can access
    if (myClasses === 'true' || req.user.role === ROLES.TEACHER) {
      query.$or = [
        { classTeacher: req.user.id },
        { 'additionalTeachers.teacher': req.user.id }
      ];
    }
    
    if (academicYear) {
      query['academicInfo.academicYear'] = academicYear;
    }
    
    if (subject) {
      query.subject = new RegExp(subject, 'i');
    }
    
    if (search) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { className: new RegExp(search, 'i') },
          { subject: new RegExp(search, 'i') },
          { description: new RegExp(search, 'i') }
        ]
      });
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: [
        { path: 'classTeacher', select: 'personalInfo.fullName email role fullName' },
        { path: 'additionalTeachers.teacher', select: 'personalInfo.fullName email role fullName' },
        { path: 'students.student', select: 'personalInfo.fullName studentId fullName admissionNo' },
        { path: 'students.academicSource.department', select: 'name code' },
        { path: 'students.academicSource.subDepartment', select: 'name code' },
        { path: 'students.academicSource.batch', select: 'name code' }
      ]
    };

    const classes = await SubjectClass.paginate(query, options);

    res.json({
      success: true,
      message: 'Classes retrieved successfully',
      data: {
        classes: classes.docs,
        pagination: {
          currentPage: classes.page,
          totalPages: classes.totalPages,
          totalRecords: classes.totalDocs,
          hasNext: classes.hasNextPage,
          hasPrev: classes.hasPrevPage
        }
      }
    });
  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch classes',
      error: error.message
    });
  }
});

// 🎓 POST /api/classes - Create new class
// Restrict creation to Admin/Principal/Coordinator/HOD
router.post('/', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.COORDINATOR, ROLES.HOD), async (req, res) => {
  try {
    console.log('📥 Received class creation request:', JSON.stringify({
      className: req.body.className,
      selectionType: req.body.selectionType,
      department: req.body.department,
      subDepartments: req.body.subDepartments,
      batches: req.body.batches,
      hasStudents: !!req.body.students
    }, null, 2));
    
    const {
      className,
      subject,
      description,
      students = [], // Array of { studentId, academicSource: { department, subDepartment, batch } }
      // Student selection criteria (like exam creation)
      selectionType,
      department, // targetDepartment
      subDepartments, // targetSubDepartments
      batches, // targetBatches
      customStudents,
      schedule,
      academicInfo,
      settings,
      additionalTeachers = [],
      classTeacher
    } = req.body;

    // Validate required fields and set default academic year
    const academicYear = academicInfo?.academicYear || getCurrentAcademicYear();
    
    if (!className || !subject) {
      return res.status(400).json({
        success: false,
        message: 'Class name and subject are required'
      });
    }

    // Check if class already exists for this teacher
    const teacherId = classTeacher || req.user.id;
    const existingClass = await SubjectClass.findOne({
      classTeacher: teacherId,
      className,
      subject,
      'academicInfo.academicYear': academicYear,
      isDeleted: false
    });

    if (existingClass) {
      return res.status(400).json({
        success: false,
        message: 'A class with this name and subject already exists for the current academic year'
      });
    }

    // Fetch students based on selection criteria (like exam creation)
    let studentsToAdd = [];
    
    console.log('🔍 Processing student selection:', {
      hasSelectionType: !!selectionType,
      selectionType,
      hasDepartment: !!department,
      department,
      hasSubDepartments: !!subDepartments,
      subDepartmentsCount: subDepartments?.length || 0,
      hasBatches: !!batches,
      batchesCount: batches?.length || 0,
      hasCustomStudents: !!customStudents,
      customStudentsCount: customStudents?.length || 0,
      hasStudentsArray: students.length > 0
    });
    
    if (selectionType) {
      // Build student query based on selection type
      // Don't filter by isDeleted or isActive in query - we'll filter after fetching
      // This handles cases where students might be incorrectly marked
      let studentQuery = {};
      
      console.log('📋 Class Creation - Student Selection:', {
        selectionType,
        department,
        subDepartments,
        batches,
        customStudents: customStudents?.length || 0
      });
      
      if (selectionType === 'department' && department) {
        // Mongoose handles ObjectId conversion automatically, but ensure it's valid
        if (mongoose.Types.ObjectId.isValid(department)) {
          studentQuery.department = new mongoose.Types.ObjectId(department);
        } else {
          studentQuery.department = department;
        }
        console.log('🔍 Querying students for department:', department);
      } else if (selectionType === 'subDepartment' && subDepartments && subDepartments.length > 0) {
        // Students can have multiple sub-departments, so use $in
        studentQuery.subDepartments = { $in: subDepartments };
        // Also filter by department if provided
        if (department) {
          studentQuery.department = department;
        }
        console.log('🔍 Querying students for sub-departments:', subDepartments);
      } else if (selectionType === 'batch' && batches && batches.length > 0) {
        // Students can have multiple batches, so use $in
        studentQuery.batches = { $in: batches };
        // Also filter by department if provided
        if (department) {
          studentQuery.department = department;
        }
        console.log('🔍 Querying students for batches:', batches);
      } else if (selectionType === 'custom' && customStudents && customStudents.length > 0) {
        studentQuery._id = { $in: customStudents };
        console.log('🔍 Querying custom students:', customStudents);
      } else {
        console.warn('⚠️ No valid selection criteria provided');
      }
      
      // Ensure isDeleted is NOT in the query
      delete studentQuery.isDeleted;
      delete studentQuery.isActive;
      
      console.log('📊 Student Query (final):', JSON.stringify(studentQuery, null, 2));
      
      // Fetch students based on query - don't filter by isDeleted in the query
      let fetchedStudents = await Student.find(studentQuery)
        .select('_id department subDepartments batches fullName admissionNo isActive isDeleted')
        .lean();
      
      console.log(`✅ Found ${fetchedStudents.length} students matching criteria (before filtering)`);
      
      // Show what we found
      if (fetchedStudents.length > 0) {
        console.log('Sample found students:', fetchedStudents.slice(0, 3).map(s => ({ 
          id: s._id, 
          name: s.fullName,
          admissionNo: s.admissionNo,
          dept: s.department?.toString(),
          isDeleted: s.isDeleted,
          isActive: s.isActive
        })));
      }
      
      // Filter out deleted students (but be lenient - only exclude if explicitly set to true)
      fetchedStudents = fetchedStudents.filter(s => s.isDeleted !== true);
      console.log(`✅ After filtering deleted: ${fetchedStudents.length} students`);
      
      // Filter to only active students (if isActive field exists, otherwise include all)
      const activeStudents = fetchedStudents.filter(s => s.isActive !== false);
      
      console.log(`✅ Final: ${fetchedStudents.length} total students, ${activeStudents.length} active for selection type: ${selectionType}`);
      
      // Debug: Show sample students if found
      if (activeStudents.length > 0) {
        console.log('✅ Students to add:', activeStudents.slice(0, 5).map(s => ({ 
          id: s._id, 
          name: s.fullName,
          admissionNo: s.admissionNo,
          dept: s.department?.toString()
        })));
      }
      
      studentsToAdd = activeStudents.map(student => ({
        studentId: student._id,
        academicSource: {
          department: student.department || null,
          subDepartment: Array.isArray(student.subDepartments) && student.subDepartments.length > 0 
            ? student.subDepartments[0] 
            : null,
          batch: Array.isArray(student.batches) && student.batches.length > 0 
            ? student.batches[0] 
            : null
        }
      }));
    } else if (students.length > 0) {
      // Use provided students array (backward compatibility)
      studentsToAdd = students;
    }
    
    console.log(`📝 Total students to add: ${studentsToAdd.length}`);
    
    // Warn if no students but don't fail - class can be created without students
    if (studentsToAdd.length === 0 && selectionType) {
      console.warn('⚠️ WARNING: No students found based on selection criteria. Class will be created without students.');
      console.warn('Selection criteria:', {
        selectionType,
        department,
        subDepartments,
        batches
      });
    }

    // Validate students exist (only if students were supposed to be added)
    if (studentsToAdd.length > 0) {
      const studentIds = studentsToAdd.map(s => s.studentId).filter(id => id);
      
      if (studentIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid student IDs found based on selection criteria'
        });
      }
      
      // Validate ObjectIds
      const validObjectIds = studentIds.filter(id => mongoose.Types.ObjectId.isValid(id));
      
      if (validObjectIds.length !== studentIds.length) {
        return res.status(400).json({
          success: false,
          message: 'Some student IDs are invalid'
        });
      }
      
      // Don't filter by isDeleted here - we already filtered in the selection phase
      const validStudents = await Student.find({ 
        _id: { $in: validObjectIds }
      });
      
      if (validStudents.length === 0) {
        // Don't fail - allow class creation without students (they can be added later)
        console.warn('⚠️ No valid students found after validation, but allowing class creation');
        studentsToAdd = [];
      } else {
        // Update studentsToAdd with only valid students
        const validStudentIds = validStudents.map(s => s._id.toString());
        studentsToAdd = studentsToAdd.filter(s => validStudentIds.includes(s.studentId.toString()));
        console.log(`✅ Validated ${studentsToAdd.length} students to add to class`);
      }
    } else {
      console.warn('⚠️ No students to add - class will be created empty');
    }

    // Create new class
    const newClass = new SubjectClass({
      className,
      subject,
      description,
      classTeacher: teacherId,
      students: studentsToAdd.map(s => ({
        student: s.studentId,
        academicSource: s.academicSource || {},
        rollNumber: s.rollNumber,
        seatNumber: s.seatNumber,
        notes: s.notes,
        status: 'active'
      })),
      schedule: schedule || {},
      academicInfo: {
        academicYear: academicYear,
        term: academicInfo?.term || 'annual',
        semester: academicInfo?.semester,
        credits: academicInfo?.credits || 1
      },
      settings: {
        attendanceRequired: true,
        minimumAttendancePercentage: 75,
        allowLateEntry: false,
        lateEntryGracePeriod: 10,
        autoMarkAbsent: false,
        autoMarkAbsentAfter: 30,
        enableNotifications: true,
        ...settings
      },
      additionalTeachers,
      status: 'active',
      createdBy: req.user.id
    });

    await newClass.save();

    // Populate the response
    await newClass.populate([
      { path: 'classTeacher', select: 'personalInfo.fullName email role fullName' },
      { path: 'students.student', select: 'personalInfo.fullName studentId admissionNo fullName' }
    ]);

    res.status(201).json({
      success: true,
      message: `Class created successfully with ${studentsToAdd.length} student(s)`,
      data: { class: newClass }
    });
  } catch (error) {
    console.error('Error creating class:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create class',
      error: error.message
    });
  }
});

// 🎓 GET /api/classes/:id - Get specific class details
router.get('/:id', auth, permit(ROLES.TEACHER, ROLES.HOD, ROLES.PRINCIPAL, ROLES.ADMIN), async (req, res) => {
  try {
    const classData = await SubjectClass.findOne({
      _id: req.params.id,
      isDeleted: false
    }).populate([
      { path: 'classTeacher', select: 'personalInfo.fullName email role fullName' },
      { path: 'additionalTeachers.teacher', select: 'personalInfo.fullName email role fullName' },
      { path: 'students.student', select: 'personalInfo.fullName studentId personalInfo.contact fullName admissionNo' },
      { path: 'students.academicSource.department', select: 'name code' },
      { path: 'students.academicSource.subDepartment', select: 'name code' },
      { path: 'students.academicSource.batch', select: 'name code' }
    ]);

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Check if user can access this class
    if (req.user.role === ROLES.TEACHER) {
      // Get classTeacher ID (handle both populated and unpopulated cases)
      const classTeacherId = classData.classTeacher?._id?.toString() || 
                            classData.classTeacher?.toString() || 
                            classData.classTeacher;
      
      // Check if user is the class teacher
      const isClassTeacher = classTeacherId?.toString() === req.user.id.toString();
      
      // Check if user is an additional teacher
      const isAdditionalTeacher = classData.additionalTeachers?.some(t => {
        const teacherId = t.teacher?._id?.toString() || t.teacher?.toString() || t.teacher;
        return teacherId?.toString() === req.user.id.toString();
      });
      
      if (!isClassTeacher && !isAdditionalTeacher) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this class'
      });
      }
    }

    // Get recent attendance sessions
    const recentSessions = await ClassAttendance.find({
      subjectClass: req.params.id,
      isDeleted: false
    })
    .sort({ sessionDate: -1 })
    .limit(5)
    .select('sessionId sessionDate sessionStartTime sessionEndTime statistics sessionStatus');

    res.json({
      success: true,
      message: 'Class details retrieved successfully',
      data: {
        class: classData,
        recentSessions
      }
    });
  } catch (error) {
    console.error('Error fetching class details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch class details',
      error: error.message
    });
  }
});

// 🎓 PUT /api/classes/:id - Update class
router.put('/:id', auth, permit(ROLES.TEACHER, ROLES.HOD, ROLES.PRINCIPAL, ROLES.ADMIN), async (req, res) => {
  try {
    const classData = await SubjectClass.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Check if user can edit this class
    if (req.user.role === ROLES.TEACHER && !classData.canAccessClass(req.user.id, 'edit')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to edit this class'
      });
    }

    const updates = req.body;
    delete updates._id;
    delete updates.createdBy;
    delete updates.createdAt;

    updates.lastModifiedBy = req.user.id;

    Object.assign(classData, updates);
    await classData.save();

    await classData.populate([
      { path: 'classTeacher', select: 'personalInfo.fullName email role fullName' },
      { path: 'students.student', select: 'personalInfo.fullName studentId fullName admissionNo' }
    ]);

    res.json({
      success: true,
      message: 'Class updated successfully',
      data: { class: classData }
    });
  } catch (error) {
    console.error('Error updating class:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update class',
      error: error.message
    });
  }
});

// 🎓 DELETE /api/classes/:id - Delete class (soft delete)
router.delete('/:id', auth, permit(ROLES.TEACHER, ROLES.HOD, ROLES.PRINCIPAL, ROLES.ADMIN), async (req, res) => {
  try {
    const classData = await SubjectClass.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Check if user can delete this class
    if (req.user.role === ROLES.TEACHER && classData.classTeacher.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the class teacher can delete this class'
      });
    }

    classData.isDeleted = true;
    classData.deletedAt = new Date();
    classData.deletedBy = req.user.id;
    classData.status = 'cancelled';

    await classData.save();

    res.json({
      success: true,
      message: 'Class deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting class:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete class',
      error: error.message
    });
  }
});

// ==================== STUDENT MANAGEMENT IN CLASSES ====================

// 👥 POST /api/classes/:id/students - Add students to class
router.post('/:id/students', auth, permit(ROLES.TEACHER, ROLES.HOD, ROLES.PRINCIPAL, ROLES.ADMIN), async (req, res) => {
  try {
    const { students } = req.body; // Array of { studentId, academicSource, rollNumber, notes }

    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Students array is required'
      });
    }

    const classData = await SubjectClass.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Check permissions
    if (req.user.role === ROLES.TEACHER && !classData.canAccessClass(req.user.id, 'edit')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to modify this class'
      });
    }

    // Validate students exist
    const studentIds = students.map(s => s.studentId).filter(id => id); // Filter out null/undefined
    
    if (studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid student IDs provided'
      });
    }
    
    // Validate ObjectIds
    const validObjectIds = studentIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    
    if (validObjectIds.length !== studentIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some student IDs are invalid'
      });
    }
    
    const validStudents = await Student.find({ 
      _id: { $in: validObjectIds },
      isDeleted: false 
    });

    if (validStudents.length !== validObjectIds.length) {
      const missingCount = validObjectIds.length - validStudents.length;
      return res.status(400).json({
        success: false,
        message: `${missingCount} student(s) do not exist or have been deleted`
      });
    }

    // Add students to class
    const addedStudents = [];
    const errors = [];

    for (const studentData of students) {
      try {
        await classData.addStudent(
          studentData.studentId,
          studentData.academicSource || {},
          {
            rollNumber: studentData.rollNumber,
            seatNumber: studentData.seatNumber,
            notes: studentData.notes
          }
        );
        addedStudents.push(studentData.studentId);
      } catch (error) {
        errors.push({
          studentId: studentData.studentId,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `${addedStudents.length} students added successfully`,
      data: {
        addedStudents,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    console.error('Error adding students to class:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add students to class',
      error: error.message
    });
  }
});

// 👥 DELETE /api/classes/:id/students/:studentId - Remove student from class
router.delete('/:id/students/:studentId', auth, permit(ROLES.TEACHER, ROLES.HOD, ROLES.PRINCIPAL, ROLES.ADMIN), async (req, res) => {
  try {
    const { reason = 'dropped' } = req.body;

    const classData = await SubjectClass.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Check permissions
    if (req.user.role === ROLES.TEACHER && !classData.canAccessClass(req.user.id, 'edit')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to modify this class'
      });
    }

    await classData.removeStudent(req.params.studentId, reason);

    res.json({
      success: true,
      message: 'Student removed from class successfully'
    });
  } catch (error) {
    console.error('Error removing student from class:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove student from class',
      error: error.message
    });
  }
});

// ==================== HELPER ROUTES FOR CLASS CREATION ====================

// 🏢 GET /api/classes/helpers/academic-entities - Get departments, sub-departments, and batches for class creation
router.get('/helpers/academic-entities', auth, permit(ROLES.TEACHER, ROLES.HOD, ROLES.PRINCIPAL, ROLES.ADMIN), async (req, res) => {
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

// 👥 GET /api/classes/helpers/students-by-entity - Get students filtered by academic entity
router.get('/helpers/students-by-entity', auth, permit(ROLES.TEACHER, ROLES.HOD, ROLES.PRINCIPAL, ROLES.ADMIN), async (req, res) => {
  try {
    const { 
      departmentId, 
      subDepartmentId, 
      batchId, 
      standard,
      academicYear,
      search,
      limit = 1000  // Increased limit to allow loading all students
    } = req.query;

    // Allow loading all students if no filters provided (for initial load)
    let query = { isDeleted: false, isActive: true };
    
    // Build query with correct Student schema fields
    if (departmentId) {
      query.department = departmentId;
    }
    
    if (subDepartmentId) {
      query.subDepartments = subDepartmentId;
    }
    
    if (batchId) {
      query.batches = batchId;
    }
    
    if (standard) {
      // Support both single standard and array of standards
      if (Array.isArray(standard)) {
        query.currentStandard = { $in: standard };
      } else {
        query.currentStandard = standard;
      }
    }
    
    // Search functionality
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { fullName: searchRegex },
          { admissionNo: searchRegex },
          { studentId: searchRegex }
        ]
      });
    }

    const students = await Student.find(query)
      .select('fullName admissionNo studentId department subDepartments batches')
      .populate([
        { path: 'department', select: 'name code' },
        { path: 'subDepartments', select: 'name code' },
        { path: 'batches', select: 'name code' }
      ])
      .limit(parseInt(limit))
      .sort({ fullName: 1 });

    res.json({
      success: true,
      message: 'Students retrieved successfully',
      data: { 
        students: students.map(student => ({
          _id: student._id,
          id: student._id,
          fullName: student.fullName,
          admissionNo: student.admissionNo || student.studentId,
          studentId: student.admissionNo || student.studentId,
          department: student.department,
          subDepartments: student.subDepartments,
          batches: student.batches
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching students by entity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch students',
      error: error.message
    });
  }
});

export default router; 