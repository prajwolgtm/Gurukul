import express from 'express';
import LeaveRequest from '../models/LeaveRequest.js';
import VisitRequest from '../models/VisitRequest.js';
import Student from '../models/Student.js';
import User from '../models/User.js';
import Department from '../models/Department.js';
import SubDepartment from '../models/SubDepartment.js';
import { auth } from '../middleware/auth.js';
import { permit } from '../middleware/rbac.js';
import { ROLES } from '../utils/roles.js';
import { getAcademicYearFromDate, getAcademicYearDates } from '../utils/academicYear.js';

const router = express.Router();

// ==================== LEAVE REQUESTS ====================

// @route   POST /api/requests/leave
// @desc    Create leave request (Parents only)
// @access  Private
router.post('/leave', auth, permit(ROLES.PARENT), async (req, res) => {
  try {
    const {
      leaveType,
      startDate,
      endDate,
      isFullDay = true,
      startTime,
      endTime,
      reason,
      emergencyContact,
      priority = 'medium',
      parentNotes
    } = req.body;

    const parentId = req.user.id;
    const parentEmail = req.user.email?.toLowerCase();
    const linkedStudentId = req.user.linkedStudent; // From JWT token

    // STRICT: Find student ONLY by linkedStudent or guardianEmail (NOT student's own email)
    const normalizedParentEmail = parentEmail?.trim();
    let student = null;
    
    // First try using the linkedStudent from JWT token if available
    if (linkedStudentId) {
      student = await Student.findOne({
        _id: linkedStudentId,
        $or: [
          { linkedStudent: parentId },
          { guardianEmail: normalizedParentEmail }
        ]
      })
        .populate('department', 'name code')
        .populate('subDepartments', 'name code')
        .populate('batches', 'name code');
      
      // SECURITY: Verify this is NOT a student's own email
      if (student && student.email && student.email.toLowerCase().trim() === normalizedParentEmail) {
        student = null; // Reject if it's student's own email
      }
    }
    
    // If not found, try by linkedStudent or guardianEmail ONLY
    if (!student) {
      student = await Student.findOne({ 
        linkedStudent: parentId
      })
        .populate('department', 'name code')
        .populate('subDepartments', 'name code')
        .populate('batches', 'name code');
    }
    
    if (!student && normalizedParentEmail) {
      student = await Student.findOne({ 
        guardianEmail: normalizedParentEmail
      })
        .populate('department', 'name code')
        .populate('subDepartments', 'name code')
        .populate('batches', 'name code');
      
      // SECURITY: Verify this is NOT a student's own email
      if (student && student.email && student.email.toLowerCase().trim() === normalizedParentEmail) {
        student = null; // Reject if it's student's own email
      }
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'No student found linked to your account. Only parent emails (stored in "Parent Email" field) can access parent portal. Student emails cannot be used.'
      });
    }
    
    // SECURITY CHECK: Verify the student is linked to this parent
    if (student.linkedStudent && student.linkedStudent.toString() !== parentId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This student is linked to a different parent account.'
      });
    }

    // Validate dates
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (startDateObj < today) {
      return res.status(400).json({
        success: false,
        message: 'Leave start date cannot be in the past'
      });
    }

    if (endDateObj < startDateObj) {
      return res.status(400).json({
        success: false,
        message: 'Leave end date cannot be before start date'
      });
    }

    // Generate unique request ID
    const requestId = await LeaveRequest.generateRequestId();

    // Create leave request
    const leaveRequest = await LeaveRequest.create({
      requestId,
      student: student._id,
      requestedBy: parentId,
      leaveType,
      startDate: startDateObj,
      endDate: endDateObj,
      isFullDay,
      startTime: isFullDay ? null : startTime,
      endTime: isFullDay ? null : endTime,
      reason,
      emergencyContact,
      priority,
      parentNotes,
      isUrgent: priority === 'urgent'
    });

    // Populate the response
    await leaveRequest.populate([
      { 
        path: 'student', 
        select: 'fullName admissionNo department subDepartments batches',
        populate: [
          { path: 'department', select: 'name code' },
          { path: 'subDepartments', select: 'name code' },
          { path: 'batches', select: 'name code' }
        ]
      },
      { path: 'requestedBy', select: 'fullName email phone' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Leave request submitted successfully',
      leaveRequest: {
        id: leaveRequest._id,
        requestId: leaveRequest.requestId,
        student: {
          name: leaveRequest.student.fullName,
          studentId: leaveRequest.student.admissionNo
        },
        leaveType: leaveRequest.leaveType,
        startDate: leaveRequest.startDate,
        endDate: leaveRequest.endDate,
        isFullDay: leaveRequest.isFullDay,
        totalDays: leaveRequest.totalDays,
        reason: leaveRequest.reason,
        priority: leaveRequest.priority,
        status: leaveRequest.status,
        createdAt: leaveRequest.createdAt
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

// @route   GET /api/requests/leave
// @desc    Get leave requests (Parents see their own, others see based on authority)
// @access  Private
router.get('/leave', auth, async (req, res) => {
  try {
    const { status, startDate, endDate, academicYear, page = 1, limit = 10 } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    let query = {};
    let populateFields = [
      { 
        path: 'student', 
        select: 'fullName admissionNo department subDepartments batches', 
        populate: [
          { path: 'department', select: 'name code' },
          { path: 'subDepartments', select: 'name code' },
          { path: 'batches', select: 'name code' }
        ]
      },
      { path: 'requestedBy', select: 'fullName email phone' },
      { path: 'reviewedBy', select: 'fullName role' }
    ];

    // Filter based on user role
    if (userRole === ROLES.PARENT) {
      query.requestedBy = userId;
    } else if (userRole === ROLES.ADMIN || userRole === ROLES.PRINCIPAL) {
      // Can see all requests
    } else if (userRole === ROLES.COORDINATOR) {
      // Can see requests for students in their sub-departments
      const subDepartments = await SubDepartment.find({ coordinator: userId }).select('_id');
      if (subDepartments.length > 0) {
        const subDeptIds = subDepartments.map(sd => sd._id);
        const students = await Student.find({ 
          subDepartments: { $in: subDeptIds }
        }).select('_id');
        query.student = { $in: students.map(s => s._id) };
      } else {
        query.student = { $in: [] }; // Empty result if not coordinator of any sub-department
      }
    } else if (userRole === ROLES.HOD) {
      // Can see requests for students in their department
      const department = await Department.findOne({ hod: userId });
      if (department) {
        const students = await Student.find({ department: department._id }).select('_id');
        query.student = { $in: students.map(s => s._id) };
      } else {
        query.student = { $in: [] }; // Empty result if not HOD of any department
      }
    } else if (userRole === ROLES.TEACHER) {
      // Check if they're assigned to any departments/sub-departments/batches
      const teacher = await User.findById(userId);
      const teacherAssignments = teacher?.activeTeachingAssignments || [];
      
      if (teacherAssignments.length > 0) {
        const assignedBatchIds = teacher.assignedBatches;
        const assignedDepartmentIds = teacher.assignedDepartments;
        const assignedSubDepartmentIds = teacher.assignedSubDepartments;
        
        // Find students in assigned batches, departments, or sub-departments
        const students = await Student.find({
          $or: [
            { department: { $in: assignedDepartmentIds } },
            { subDepartments: { $in: assignedSubDepartmentIds } },
            { batches: { $in: assignedBatchIds } }
          ]
        }).select('_id');
        
        query.student = { $in: students.map(s => s._id) };
      } else {
        // Check if they're a coordinator of any sub-department (legacy)
        const subDepartment = await SubDepartment.findOne({ coordinator: userId });
        if (subDepartment) {
          const students = await Student.find({ 
            subDepartments: subDepartment._id
          }).select('_id');
          query.student = { $in: students.map(s => s._id) };
        } else {
          query.student = { $in: [] }; // Empty result if not assigned anywhere
        }
      }
    }

    // Apply additional filters
    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) query.startDate.$gte = new Date(startDate);
      if (endDate) query.startDate.$lte = new Date(endDate);
    }

    // Filter by academic year if provided
    let leaveRequests;
    if (academicYear && academicYear !== 'all') {
      // Get all requests first, then filter by academic year
      const allRequests = await LeaveRequest.find(query)
        .populate(populateFields)
        .sort({ createdAt: -1 });
      
      // Filter by academic year based on startDate
      leaveRequests = allRequests.filter(req => {
        const reqAcademicYear = getAcademicYearFromDate(req.startDate);
        return reqAcademicYear === academicYear;
      });
      
      // Apply pagination manually
      const totalRequests = leaveRequests.length;
      const startIndex = (page - 1) * limit;
      leaveRequests = leaveRequests.slice(startIndex, startIndex + parseInt(limit));
      
      return res.json({
        success: true,
        data: leaveRequests.map(req => ({
          id: req._id,
          requestId: req.requestId,
          student: {
            name: req.student?.fullName,
            studentId: req.student?.admissionNo,
            department: req.student?.department?._id || req.student?.department,
            activeBatches: Array.isArray(req.student?.batches) ? req.student.batches : [],
            activeSubDepartments: Array.isArray(req.student?.subDepartments) ? req.student.subDepartments : []
          },
          requestedBy: req.requestedBy,
          leaveType: req.leaveType,
          startDate: req.startDate,
          endDate: req.endDate,
          isFullDay: req.isFullDay,
          totalDays: req.totalDays,
          reason: req.reason,
          priority: req.priority,
          status: req.status,
          reviewedBy: req.reviewedBy,
          reviewDate: req.reviewDate,
          reviewComments: req.reviewComments,
          isOverdue: req.isOverdue,
          isActive: req.isActive,
          createdAt: req.createdAt
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalRequests / limit),
          totalRequests,
          hasMore: page < Math.ceil(totalRequests / limit)
        }
      });
    }

    const totalRequests = await LeaveRequest.countDocuments(query);
    leaveRequests = await LeaveRequest.find(query)
      .populate(populateFields)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    res.json({
      success: true,
      data: leaveRequests.map(req => ({
        id: req._id,
        requestId: req.requestId,
        student: {
          name: req.student?.fullName,
          studentId: req.student?.admissionNo,
          department: req.student?.department?._id || req.student?.department,
          activeBatches: Array.isArray(req.student?.batches) ? req.student.batches : [],
          activeSubDepartments: Array.isArray(req.student?.subDepartments) ? req.student.subDepartments : []
        },
        requestedBy: req.requestedBy,
        leaveType: req.leaveType,
        startDate: req.startDate,
        endDate: req.endDate,
        isFullDay: req.isFullDay,
        totalDays: req.totalDays,
        reason: req.reason,
        priority: req.priority,
        status: req.status,
        reviewedBy: req.reviewedBy,
        reviewDate: req.reviewDate,
        reviewComments: req.reviewComments,
        isOverdue: req.isOverdue,
        isActive: req.isActive,
        createdAt: req.createdAt
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalRequests / limit),
        totalRequests,
        hasMore: page < Math.ceil(totalRequests / limit)
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

// @route   PUT /api/requests/leave/:id/review
// @desc    Review leave request (Approve/Reject/Edit) - HOD/Principal/Admin/Coordinator
// @access  Private
// @route   PUT /api/requests/leave/:id/reschedule
// @desc    Reschedule leave request (Admin/Principal/Coordinator can reschedule approved requests)
// @access  Private
router.put('/leave/:id/reschedule', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.COORDINATOR), async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, isFullDay, startTime, endTime, comments } = req.body;
    const reviewerId = req.user.id;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required for rescheduling'
      });
    }

    const leaveRequest = await LeaveRequest.findById(id)
      .populate('student', 'department');

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }

    // Validate dates
    const newStartDate = new Date(startDate);
    const newEndDate = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (newStartDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Rescheduled start date cannot be in the past'
      });
    }

    if (newEndDate < newStartDate) {
      return res.status(400).json({
        success: false,
        message: 'Rescheduled end date cannot be before start date'
      });
    }

    // Update leave request
    leaveRequest.startDate = newStartDate;
    leaveRequest.endDate = newEndDate;
    leaveRequest.isFullDay = isFullDay !== undefined ? isFullDay : leaveRequest.isFullDay;
    if (!isFullDay) {
      leaveRequest.startTime = startTime || leaveRequest.startTime;
      leaveRequest.endTime = endTime || leaveRequest.endTime;
    }
    leaveRequest.reviewComments = comments || leaveRequest.reviewComments;
    leaveRequest.reviewedBy = reviewerId;
    leaveRequest.reviewDate = new Date();

    // Recalculate total days
    const timeDiff = newEndDate.getTime() - newStartDate.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24)) + 1;
    leaveRequest.totalDays = isFullDay ? daysDiff : 0.5;

    await leaveRequest.save();

    res.json({
      success: true,
      message: 'Leave request rescheduled successfully',
      data: leaveRequest
    });
  } catch (error) {
    console.error('Error rescheduling leave request:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

router.put('/leave/:id/review', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, comments, startDate, endDate, isFullDay, priority } = req.body;
    const reviewerId = req.user.id;
    const reviewerRole = req.user.role;

    if (!['approve', 'reject', 'edit'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be approve, reject, or edit'
      });
    }

    // Find the leave request
    const leaveRequest = await LeaveRequest.findById(id)
      .populate('student', 'department subDepartments batches')
      .populate('student.department', 'name code')
      .populate('student.subDepartments', 'name code')
      .populate('student.batches', 'name code');

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }

    if (leaveRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending requests can be reviewed'
      });
    }

    // Check if user has authority to review this request
    let hasAuthority = false;

    if (reviewerRole === ROLES.ADMIN || reviewerRole === ROLES.PRINCIPAL) {
      hasAuthority = true;
    } else if (reviewerRole === ROLES.HOD) {
      const department = await Department.findOne({ 
        _id: leaveRequest.student.department?._id || leaveRequest.student.department,
        hod: reviewerId 
      });
      hasAuthority = !!department;
    } else if (reviewerRole === ROLES.TEACHER) {
      // Check if teacher has authority over this student through assignments
      const teacher = await User.findById(reviewerId);
      const teacherAssignments = teacher?.activeTeachingAssignments || [];
      
      if (teacherAssignments.length > 0) {
        const studentDepartment = leaveRequest.student.department?._id || leaveRequest.student.department;
        const studentSubDepartments = Array.isArray(leaveRequest.student.subDepartments)
          ? leaveRequest.student.subDepartments.map(sd => sd._id || sd)
          : [];
        const studentBatches = Array.isArray(leaveRequest.student.batches)
          ? leaveRequest.student.batches.map(b => b._id || b)
          : [];
        
        // Check if teacher is assigned to any of student's academic entities
        hasAuthority = teacher.isAssignedToDepartment(studentDepartment) ||
                      studentSubDepartments?.some(sdId => teacher.isAssignedToSubDepartment(sdId)) ||
                      studentBatches?.some(bId => teacher.isAssignedToBatch(bId));
      }
      
      // Fallback: Check if they're coordinator of any of the student's sub-departments
      if (!hasAuthority) {
        const studentSubDeptIds = Array.isArray(leaveRequest.student.subDepartments)
          ? leaveRequest.student.subDepartments.map(sd => sd._id || sd)
          : [];
        
        if (studentSubDeptIds.length > 0) {
          const subDepartment = await SubDepartment.findOne({
            _id: { $in: studentSubDeptIds },
            coordinator: reviewerId
          });
          hasAuthority = !!subDepartment;
        }
      }
    }

    if (!hasAuthority) {
      return res.status(403).json({
        success: false,
        message: 'You do not have authority to review this request'
      });
    }

    // Perform the action
    let updatedRequest;
    
    if (action === 'approve') {
      updatedRequest = await leaveRequest.approve(reviewerId, comments);
    } else if (action === 'reject') {
      updatedRequest = await leaveRequest.reject(reviewerId, comments);
    } else if (action === 'edit') {
      // Edit and approve the request
      if (startDate) leaveRequest.startDate = new Date(startDate);
      if (endDate) leaveRequest.endDate = new Date(endDate);
      if (isFullDay !== undefined) leaveRequest.isFullDay = isFullDay;
      if (priority) leaveRequest.priority = priority;
      
      updatedRequest = await leaveRequest.approve(reviewerId, comments || 'Request edited and approved');
    }

    await updatedRequest.populate([
      { path: 'student', select: 'fullName admissionNo' },
      { path: 'requestedBy', select: 'fullName email' },
      { path: 'reviewedBy', select: 'fullName role' }
    ]);

    res.json({
      success: true,
      message: `Leave request ${action}d successfully`,
      leaveRequest: {
        id: updatedRequest._id,
        requestId: updatedRequest.requestId,
        status: updatedRequest.status,
        reviewedBy: updatedRequest.reviewedBy,
        reviewDate: updatedRequest.reviewDate,
        reviewComments: updatedRequest.reviewComments,
        totalDays: updatedRequest.totalDays
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

// ==================== VISIT REQUESTS ====================

// @route   POST /api/requests/visit
// @desc    Create visit request (Parents only)
// @access  Private
router.post('/visit', auth, permit(ROLES.PARENT), async (req, res) => {
  try {
    const {
      visitType,
      preferredDate,
      preferredStartTime,
      preferredEndTime,
      purpose,
      personToMeetId,
      numberOfVisitors = 1,
      visitors,
      specialRequirements,
      priority = 'medium'
    } = req.body;

    const parentId = req.user.id;
    const parentEmail = req.user.email?.toLowerCase();
    const linkedStudentId = req.user.linkedStudent; // From JWT token

    // Find the student linked to this parent (if visit is student-related)
    let student = null;
    if (['meet_student', 'academic_discussion'].includes(visitType)) {
      // STRICT: Find student ONLY by linkedStudent or guardianEmail (NOT student's own email)
      const normalizedParentEmail = parentEmail?.trim();
      
      // First try using the linkedStudent from JWT token if available
      if (linkedStudentId) {
        student = await Student.findOne({
          _id: linkedStudentId,
          $or: [
            { linkedStudent: parentId },
            { guardianEmail: normalizedParentEmail }
          ]
        })
          .populate('department', 'name code')
          .populate('subDepartments', 'name code')
          .populate('batches', 'name code');
        
        // SECURITY: Verify this is NOT a student's own email
        if (student && student.email && student.email.toLowerCase().trim() === normalizedParentEmail) {
          student = null; // Reject if it's student's own email
        }
      }
      
      // If not found, try by linkedStudent or guardianEmail ONLY
      if (!student) {
        student = await Student.findOne({ 
          linkedStudent: parentId
        })
          .populate('department', 'name code')
          .populate('subDepartments', 'name code')
          .populate('batches', 'name code');
      }
      
      if (!student && normalizedParentEmail) {
        student = await Student.findOne({ 
          guardianEmail: normalizedParentEmail
        })
          .populate('department', 'name code')
          .populate('subDepartments', 'name code')
          .populate('batches', 'name code');
        
        // SECURITY: Verify this is NOT a student's own email
        if (student && student.email && student.email.toLowerCase().trim() === normalizedParentEmail) {
          student = null; // Reject if it's student's own email
        }
      }

      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'No student found linked to your account for this type of visit. Only parent emails (stored in "Parent Email" field) can access parent portal.'
        });
      }
      
      // SECURITY CHECK: Verify the student is linked to this parent
      if (student.linkedStudent && student.linkedStudent.toString() !== parentId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This student is linked to a different parent account.'
        });
      }
    }

    // Validate preferred date
    const visitDate = new Date(preferredDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (visitDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Visit date cannot be in the past'
      });
    }

    // Validate person to meet exists
    if (personToMeetId) {
      const personToMeet = await User.findById(personToMeetId);
      if (!personToMeet) {
        return res.status(400).json({
          success: false,
          message: 'Person to meet not found'
        });
      }
    }

    // Generate unique request ID
    const requestId = await VisitRequest.generateRequestId();

    // Create visit request
    const visitRequest = await VisitRequest.create({
      requestId,
      requestedBy: parentId,
      student: student?._id,
      visitType,
      preferredDate: visitDate,
      preferredStartTime,
      preferredEndTime,
      purpose,
      personToMeet: personToMeetId,
      numberOfVisitors,
      visitors: visitors || [{ 
        name: req.user.fullName, 
        relationship: 'parent',
        phone: req.user.phone 
      }],
      specialRequirements,
      priority
    });

    // Populate the response
    await visitRequest.populate([
      { path: 'student', select: 'fullName admissionNo' },
      { path: 'requestedBy', select: 'fullName email phone' },
      { path: 'personToMeet', select: 'fullName role' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Visit request submitted successfully',
      visitRequest: {
        id: visitRequest._id,
        requestId: visitRequest.requestId,
        student: visitRequest.student ? {
          name: visitRequest.student.fullName,
          studentId: visitRequest.student.admissionNo
        } : null,
        visitType: visitRequest.visitType,
        preferredDate: visitRequest.preferredDate,
        preferredStartTime: visitRequest.preferredStartTime,
        preferredEndTime: visitRequest.preferredEndTime,
        purpose: visitRequest.purpose,
        personToMeet: visitRequest.personToMeet,
        numberOfVisitors: visitRequest.numberOfVisitors,
        priority: visitRequest.priority,
        status: visitRequest.status,
        createdAt: visitRequest.createdAt
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

// @route   GET /api/requests/visit
// @desc    Get visit requests (Parents see their own, others see based on authority)
// @access  Private
router.get('/visit', auth, async (req, res) => {
  try {
    const { status, date, academicYear, page = 1, limit = 10 } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    let query = {};

    // Filter based on user role
    if (userRole === ROLES.PARENT) {
      query.requestedBy = userId;
    } else if (userRole === ROLES.ADMIN || userRole === ROLES.PRINCIPAL) {
      // Can see all requests
    } else if (userRole === ROLES.COORDINATOR) {
      // Can see requests for students in their sub-departments or direct meetings
      const subDepartments = await SubDepartment.find({ coordinator: userId }).select('_id');
      if (subDepartments.length > 0) {
        const subDeptIds = subDepartments.map(sd => sd._id);
        const students = await Student.find({ 
          subDepartments: { $in: subDeptIds }
        }).select('_id');
        query.$or = [
          { student: { $in: students.map(s => s._id) } },
          { personToMeet: userId }
        ];
      } else {
        query.personToMeet = userId;
      }
    } else if (userRole === ROLES.HOD) {
      // Can see requests for students in their department or direct meetings
      const department = await Department.findOne({ hod: userId });
      if (department) {
        const students = await Student.find({ department: department._id }).select('_id');
        query.$or = [
          { student: { $in: students.map(s => s._id) } },
          { personToMeet: userId }
        ];
      } else {
        query.personToMeet = userId;
      }
    } else if (userRole === ROLES.TEACHER) {
      // Can see their own meetings or students they're assigned to
      const teacher = await User.findById(userId);
      const teacherAssignments = teacher?.activeTeachingAssignments || [];
      
      if (teacherAssignments.length > 0) {
        const assignedBatchIds = teacher.assignedBatches;
        const assignedDepartmentIds = teacher.assignedDepartments;
        const assignedSubDepartmentIds = teacher.assignedSubDepartments;
        
        // Find students in assigned batches, departments, or sub-departments
        const students = await Student.find({
          $or: [
            { department: { $in: assignedDepartmentIds } },
            { subDepartments: { $in: assignedSubDepartmentIds } },
            { batches: { $in: assignedBatchIds } }
          ]
        }).select('_id');
        
        query.$or = [
          { student: { $in: students.map(s => s._id) } },
          { personToMeet: userId }
        ];
      } else {
        // Fallback: Check if they're a coordinator of any sub-department (legacy)
        const subDepartment = await SubDepartment.findOne({ coordinator: userId });
        if (subDepartment) {
          const students = await Student.find({ 
            subDepartments: subDepartment._id
          }).select('_id');
          query.$or = [
            { student: { $in: students.map(s => s._id) } },
            { personToMeet: userId }
          ];
        } else {
          query.personToMeet = userId;
        }
      }
    }

    // Apply additional filters
    if (status) {
      query.status = status;
    }

    if (date) {
      const filterDate = new Date(date);
      const startOfDay = new Date(filterDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(filterDate.setHours(23, 59, 59, 999));
      query.preferredDate = { $gte: startOfDay, $lte: endOfDay };
    }

    // Filter by academic year if provided
    let visitRequests;
    if (academicYear && academicYear !== 'all') {
      // Get all requests first, then filter by academic year
      const allRequests = await VisitRequest.find(query)
        .populate([
          { 
            path: 'student', 
            select: 'fullName admissionNo department subDepartments batches', 
            populate: [
              { path: 'department', select: 'name code' },
              { path: 'subDepartments', select: 'name code' },
              { path: 'batches', select: 'name code' }
            ]
          },
          { path: 'requestedBy', select: 'fullName email phone' },
          { path: 'personToMeet', select: 'fullName role' },
          { path: 'reviewedBy', select: 'fullName role' }
        ])
        .sort({ createdAt: -1 });
      
      // Filter by academic year based on preferredDate
      visitRequests = allRequests.filter(req => {
        const reqAcademicYear = getAcademicYearFromDate(req.preferredDate);
        return reqAcademicYear === academicYear;
      });
      
      // Apply pagination manually
      const totalRequests = visitRequests.length;
      const startIndex = (page - 1) * limit;
      visitRequests = visitRequests.slice(startIndex, startIndex + parseInt(limit));
      
      return res.json({
        success: true,
        data: visitRequests.map(req => ({
          id: req._id,
          requestId: req.requestId,
          student: req.student ? {
            name: req.student.fullName,
            studentId: req.student.admissionNo,
            department: req.student.department?._id || req.student.department,
            activeBatches: Array.isArray(req.student.batches) ? req.student.batches : [],
            activeSubDepartments: Array.isArray(req.student.subDepartments) ? req.student.subDepartments : []
          } : null,
          requestedBy: req.requestedBy,
          visitType: req.visitType,
          preferredDate: req.preferredDate,
          preferredStartTime: req.preferredStartTime,
          preferredEndTime: req.preferredEndTime,
          approvedDate: req.approvedDate,
          approvedStartTime: req.approvedStartTime,
          approvedEndTime: req.approvedEndTime,
          approvedVenue: req.approvedVenue,
          purpose: req.purpose,
          personToMeet: req.personToMeet,
          numberOfVisitors: req.numberOfVisitors,
          visitors: req.visitors,
          priority: req.priority,
          status: req.status,
          reviewedBy: req.reviewedBy,
          reviewDate: req.reviewDate,
          reviewComments: req.reviewComments,
          isToday: req.isToday,
          isOverdue: req.isOverdue,
          createdAt: req.createdAt
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalRequests / limit),
          totalRequests,
          hasMore: page < Math.ceil(totalRequests / limit)
        }
      });
    }

    const totalRequests = await VisitRequest.countDocuments(query);
    visitRequests = await VisitRequest.find(query)
      .populate([
        { 
          path: 'student', 
          select: 'fullName admissionNo department subDepartments batches', 
          populate: [
            { path: 'department', select: 'name code' },
            { path: 'subDepartments', select: 'name code' },
            { path: 'batches', select: 'name code' }
          ]
        },
        { path: 'requestedBy', select: 'fullName email phone' },
        { path: 'personToMeet', select: 'fullName role' },
        { path: 'reviewedBy', select: 'fullName role' }
      ])
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    res.json({
      success: true,
      data: visitRequests.map(req => ({
        id: req._id,
        requestId: req.requestId,
        student: req.student ? {
          name: req.student.fullName,
          studentId: req.student.admissionNo,
          department: req.student.department?._id || req.student.department,
          activeBatches: Array.isArray(req.student.batches) ? req.student.batches : [],
          activeSubDepartments: Array.isArray(req.student.subDepartments) ? req.student.subDepartments : []
        } : null,
        requestedBy: req.requestedBy,
        visitType: req.visitType,
        preferredDate: req.preferredDate,
        preferredStartTime: req.preferredStartTime,
        preferredEndTime: req.preferredEndTime,
        approvedDate: req.approvedDate,
        approvedStartTime: req.approvedStartTime,
        approvedEndTime: req.approvedEndTime,
        approvedVenue: req.approvedVenue,
        purpose: req.purpose,
        personToMeet: req.personToMeet,
        numberOfVisitors: req.numberOfVisitors,
        visitors: req.visitors,
        priority: req.priority,
        status: req.status,
        reviewedBy: req.reviewedBy,
        reviewDate: req.reviewDate,
        reviewComments: req.reviewComments,
        isToday: req.isToday,
        isOverdue: req.isOverdue,
        createdAt: req.createdAt
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalRequests / limit),
        totalRequests,
        hasMore: page < Math.ceil(totalRequests / limit)
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

// @route   PUT /api/requests/visit/:id/review
// @desc    Review visit request (Approve/Reject/Edit) - HOD/Principal/Admin/Coordinator
// @access  Private
router.put('/visit/:id/review', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      action, 
      comments, 
      approvedDate, 
      approvedStartTime, 
      approvedEndTime, 
      approvedVenue,
      priority 
    } = req.body;
    const reviewerId = req.user.id;
    const reviewerRole = req.user.role;

    if (!['approve', 'reject', 'edit'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be approve, reject, or edit'
      });
    }

    // Find the visit request
    const visitRequest = await VisitRequest.findById(id)
      .populate('student', 'department subDepartments batches')
      .populate('student.department', 'name code')
      .populate('student.subDepartments', 'name code')
      .populate('student.batches', 'name code');

    if (!visitRequest) {
      return res.status(404).json({
        success: false,
        message: 'Visit request not found'
      });
    }

    if (visitRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending requests can be reviewed'
      });
    }

    // Check if user has authority to review this request
    let hasAuthority = false;

    if (reviewerRole === ROLES.ADMIN || reviewerRole === ROLES.PRINCIPAL) {
      hasAuthority = true;
    } else if (reviewerRole === ROLES.HOD) {
      // Can approve if it's their department or if they're the person to meet
      if (visitRequest.personToMeet?.toString() === reviewerId) {
        hasAuthority = true;
      } else if (visitRequest.student) {
        const department = await Department.findOne({ 
          _id: visitRequest.student.department?._id || visitRequest.student.department,
          hod: reviewerId 
        });
        hasAuthority = !!department;
      }
    } else if (reviewerRole === ROLES.TEACHER) {
      // Can approve if they're the person to meet or coordinator of student's sub-department
      if (visitRequest.personToMeet?.toString() === reviewerId) {
        hasAuthority = true;
      } else if (visitRequest.student) {
        // Check if teacher has authority over this student through assignments
        const teacher = await User.findById(reviewerId);
        const teacherAssignments = teacher?.activeTeachingAssignments || [];
        
        if (teacherAssignments.length > 0) {
          const studentDepartment = visitRequest.student.department?._id || visitRequest.student.department;
          const studentSubDepartments = Array.isArray(visitRequest.student.subDepartments)
            ? visitRequest.student.subDepartments.map(sd => sd._id || sd)
            : [];
          const studentBatches = Array.isArray(visitRequest.student.batches)
            ? visitRequest.student.batches.map(b => b._id || b)
            : [];
          
          // Check if teacher is assigned to any of student's academic entities
          hasAuthority = teacher.isAssignedToDepartment(studentDepartment) ||
                        studentSubDepartments?.some(sdId => teacher.isAssignedToSubDepartment(sdId)) ||
                        studentBatches?.some(bId => teacher.isAssignedToBatch(bId));
        }
        
        // Fallback: Check if they're coordinator of any of the student's sub-departments
        if (!hasAuthority) {
          const studentSubDeptIds = Array.isArray(visitRequest.student.subDepartments)
            ? visitRequest.student.subDepartments.map(sd => sd._id || sd)
            : [];
          
          if (activeSubDepartments?.length > 0) {
            const subDepartment = await SubDepartment.findOne({
              _id: { $in: activeSubDepartments },
              coordinator: reviewerId
            });
            hasAuthority = !!subDepartment;
          }
        }
      }
    }

    if (!hasAuthority) {
      return res.status(403).json({
        success: false,
        message: 'You do not have authority to review this request'
      });
    }

    // Perform the action
    let updatedRequest;
    
    if (action === 'approve') {
      const approvedDateTime = {
        date: approvedDate ? new Date(approvedDate) : visitRequest.preferredDate,
        startTime: approvedStartTime || visitRequest.preferredStartTime,
        endTime: approvedEndTime || visitRequest.preferredEndTime
      };
      
      updatedRequest = await visitRequest.approve(
        reviewerId, 
        approvedDateTime, 
        approvedVenue, 
        comments
      );
    } else if (action === 'reject') {
      updatedRequest = await visitRequest.reject(reviewerId, comments);
    } else if (action === 'edit') {
      // Edit and approve the request
      if (priority) visitRequest.priority = priority;
      
      const approvedDateTime = {
        date: approvedDate ? new Date(approvedDate) : visitRequest.preferredDate,
        startTime: approvedStartTime || visitRequest.preferredStartTime,
        endTime: approvedEndTime || visitRequest.preferredEndTime
      };
      
      updatedRequest = await visitRequest.approve(
        reviewerId, 
        approvedDateTime, 
        approvedVenue, 
        comments || 'Request edited and approved'
      );
    }

    await updatedRequest.populate([
      { path: 'student', select: 'fullName admissionNo' },
      { path: 'requestedBy', select: 'fullName email' },
      { path: 'reviewedBy', select: 'fullName role' }
    ]);

    res.json({
      success: true,
      message: `Visit request ${action}d successfully`,
      visitRequest: {
        id: updatedRequest._id,
        requestId: updatedRequest.requestId,
        status: updatedRequest.status,
        reviewedBy: updatedRequest.reviewedBy,
        reviewDate: updatedRequest.reviewDate,
        reviewComments: updatedRequest.reviewComments,
        approvedDate: updatedRequest.approvedDate,
        approvedStartTime: updatedRequest.approvedStartTime,
        approvedEndTime: updatedRequest.approvedEndTime,
        approvedVenue: updatedRequest.approvedVenue
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

// @route   GET /api/requests/dashboard
// @desc    Get dashboard summary for requests
// @access  Private
router.get('/dashboard', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let leaveQuery = {};
    let visitQuery = {};

    // Filter based on user role (same logic as individual routes)
    if (userRole === ROLES.PARENT) {
      leaveQuery.requestedBy = userId;
      visitQuery.requestedBy = userId;
    } else if (userRole === ROLES.ADMIN || userRole === ROLES.PRINCIPAL) {
      // Can see all requests
    } else if (userRole === ROLES.COORDINATOR) {
      // Can see requests for students in their sub-departments or direct meetings
      const subDepartments = await SubDepartment.find({ coordinator: userId }).select('_id');
      if (subDepartments.length > 0) {
        const subDeptIds = subDepartments.map(sd => sd._id);
        const students = await Student.find({ 
          subDepartments: { $in: subDeptIds }
        }).select('_id');
        const studentIds = students.map(s => s._id);
        leaveQuery.student = { $in: studentIds };
        visitQuery.$or = [
          { student: { $in: studentIds } },
          { personToMeet: userId }
        ];
      } else {
        leaveQuery.student = { $in: [] };
        visitQuery.personToMeet = userId;
      }
    } else if (userRole === ROLES.HOD) {
      const department = await Department.findOne({ hod: userId });
      if (department) {
        const students = await Student.find({ department: department._id }).select('_id');
        const studentIds = students.map(s => s._id);
        leaveQuery.student = { $in: studentIds };
        visitQuery.$or = [
          { student: { $in: studentIds } },
          { personToMeet: userId }
        ];
      } else {
        visitQuery.personToMeet = userId;
      }
    } else if (userRole === ROLES.TEACHER) {
      const teacher = await User.findById(userId);
      const teacherAssignments = teacher?.activeTeachingAssignments || [];
      
      if (teacherAssignments.length > 0) {
        const assignedBatchIds = teacher.assignedBatches;
        const assignedDepartmentIds = teacher.assignedDepartments;
        const assignedSubDepartmentIds = teacher.assignedSubDepartments;
        
        // Find students in assigned batches, departments, or sub-departments
        const students = await Student.find({
          $or: [
            { department: { $in: assignedDepartmentIds } },
            { subDepartments: { $in: assignedSubDepartmentIds } },
            { batches: { $in: assignedBatchIds } }
          ]
        }).select('_id');
        
        const studentIds = students.map(s => s._id);
        leaveQuery.student = { $in: studentIds };
        visitQuery.$or = [
          { student: { $in: studentIds } },
          { personToMeet: userId }
        ];
      } else {
        // Fallback: Check if they're a coordinator of any sub-department (legacy)
        const subDepartment = await SubDepartment.findOne({ coordinator: userId });
        if (subDepartment) {
          const students = await Student.find({ 
            subDepartments: subDepartment._id
          }).select('_id');
          const studentIds = students.map(s => s._id);
          leaveQuery.student = { $in: studentIds };
          visitQuery.$or = [
            { student: { $in: studentIds } },
            { personToMeet: userId }
          ];
        } else {
          visitQuery.personToMeet = userId;
        }
      }
    }

    // Get counts for different statuses
    const [
      pendingLeaveRequests,
      approvedLeaveRequests,
      rejectedLeaveRequests,
      pendingVisitRequests,
      approvedVisitRequests,
      rejectedVisitRequests,
      todaysVisits,
      overdueLeaveRequests,
      overdueVisitRequests
    ] = await Promise.all([
      LeaveRequest.countDocuments({ ...leaveQuery, status: 'pending' }),
      LeaveRequest.countDocuments({ ...leaveQuery, status: 'approved' }),
      LeaveRequest.countDocuments({ ...leaveQuery, status: 'rejected' }),
      VisitRequest.countDocuments({ ...visitQuery, status: 'pending' }),
      VisitRequest.countDocuments({ ...visitQuery, status: 'approved' }),
      VisitRequest.countDocuments({ ...visitQuery, status: 'rejected' }),
      VisitRequest.getTodaysVisits(),
      LeaveRequest.find({ ...leaveQuery, status: 'pending' })
        .where('startDate').lt(new Date())
        .countDocuments(),
      VisitRequest.find({ ...visitQuery, status: 'pending' })
        .where('preferredDate').lt(new Date())
        .countDocuments()
    ]);

    // Recent requests (last 5 of each type)
    const [recentLeaveRequests, recentVisitRequests] = await Promise.all([
      LeaveRequest.find(leaveQuery)
        .populate('student', 'fullName admissionNo')
        .populate('requestedBy', 'fullName')
        .sort({ createdAt: -1 })
        .limit(5),
      VisitRequest.find(visitQuery)
        .populate('student', 'fullName admissionNo')
        .populate('requestedBy', 'fullName')
        .sort({ createdAt: -1 })
        .limit(5)
    ]);

    res.json({
      success: true,
      dashboard: {
        summary: {
          leaveRequests: {
            pending: pendingLeaveRequests,
            approved: approvedLeaveRequests,
            rejected: rejectedLeaveRequests,
            overdue: overdueLeaveRequests
          },
          visitRequests: {
            pending: pendingVisitRequests,
            approved: approvedVisitRequests,
            rejected: rejectedVisitRequests,
            overdue: overdueVisitRequests,
            todaysCount: todaysVisits.length
          }
        },
        todaysVisits: todaysVisits.slice(0, 10), // Limit to 10 for dashboard
        recentActivity: {
          leaveRequests: recentLeaveRequests.map(req => ({
            id: req._id,
            requestId: req.requestId,
            student: req.student?.fullName,
            requestedBy: req.requestedBy?.fullName,
            type: req.leaveType,
            status: req.status,
            createdAt: req.createdAt
          })),
          visitRequests: recentVisitRequests.map(req => ({
            id: req._id,
            requestId: req.requestId,
            student: req.student?.fullName,
            requestedBy: req.requestedBy?.fullName,
            type: req.visitType,
            status: req.status,
            createdAt: req.createdAt
          }))
        }
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

// @route   PUT /api/requests/leave/:id/cancel
// @desc    Cancel leave request (Parent only, only pending requests)
// @access  Private
router.put('/leave/:id/cancel', auth, permit(ROLES.PARENT), async (req, res) => {
  try {
    const { id } = req.params;
    const parentId = req.user.id;

    const leaveRequest = await LeaveRequest.findOne({
      _id: id,
      requestedBy: parentId,
      status: 'pending'
    });

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found or cannot be cancelled'
      });
    }

    await leaveRequest.cancel();

    res.json({
      success: true,
      message: 'Leave request cancelled successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/requests/visit/:id/reschedule
// @desc    Reschedule visit request (Admin/Principal/Coordinator can reschedule approved requests)
// @access  Private
router.put('/visit/:id/reschedule', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.COORDINATOR), async (req, res) => {
  try {
    const { id } = req.params;
    const { preferredDate, preferredStartTime, preferredEndTime, comments } = req.body;
    const reviewerId = req.user.id;

    if (!preferredDate) {
      return res.status(400).json({
        success: false,
        message: 'Preferred date is required for rescheduling'
      });
    }

    const visitRequest = await VisitRequest.findById(id);

    if (!visitRequest) {
      return res.status(404).json({
        success: false,
        message: 'Visit request not found'
      });
    }

    // Validate date
    const newDate = new Date(preferredDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (newDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Rescheduled visit date cannot be in the past'
      });
    }

    // Update visit request
    visitRequest.preferredDate = newDate;
    if (preferredStartTime) visitRequest.preferredStartTime = preferredStartTime;
    if (preferredEndTime) visitRequest.preferredEndTime = preferredEndTime;
    visitRequest.reviewComments = comments || visitRequest.reviewComments;
    visitRequest.reviewedBy = reviewerId;
    visitRequest.reviewDate = new Date();
    visitRequest.status = 'pending'; // Reset to pending after reschedule

    await visitRequest.save();

    res.json({
      success: true,
      message: 'Visit request rescheduled successfully',
      data: visitRequest
    });
  } catch (error) {
    console.error('Error rescheduling visit request:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/requests/visit/:id/cancel
// @desc    Cancel visit request (Parent only, only pending requests)
// @access  Private
router.put('/visit/:id/cancel', auth, permit(ROLES.PARENT), async (req, res) => {
  try {
    const { id } = req.params;
    const parentId = req.user.id;

    const visitRequest = await VisitRequest.findOne({
      _id: id,
      requestedBy: parentId,
      status: 'pending'
    });

    if (!visitRequest) {
      return res.status(404).json({
        success: false,
        message: 'Visit request not found or cannot be cancelled'
      });
    }

    visitRequest.status = 'cancelled';
    await visitRequest.save();

    res.json({
      success: true,
      message: 'Visit request cancelled successfully'
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