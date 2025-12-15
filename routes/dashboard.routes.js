import express from 'express';
import { auth } from '../middleware/auth.js';
import { permit } from '../middleware/rbac.js';
import { ROLES } from '../utils/roles.js';
import { getCurrentAcademicYear, getAcademicYearFromDate } from '../utils/academicYear.js';
import Exam from '../models/Exam.js';
import ExamResult from '../models/ExamResult.js';
import Student from '../models/Student.js';
import User from '../models/User.js';
import SubjectClass from '../models/SubjectClass.js';
import ClassAttendance from '../models/ClassAttendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import VisitRequest from '../models/VisitRequest.js';
import Department from '../models/Department.js';
import SubDepartment from '../models/SubDepartment.js';

const router = express.Router();

// @route   GET /api/dashboard/summary
// @desc    Get comprehensive dashboard summary filtered by academic year
// @access  Private
router.get('/summary', auth, async (req, res) => {
  try {
    const { academicYear } = req.query;
    const userRole = req.user.role;
    const userId = req.user.id;
    
    // Use provided academic year or default to current
    const selectedYear = academicYear && academicYear !== 'all' 
      ? academicYear 
      : getCurrentAcademicYear();

    // Build base query for exams
    // Exam model has academicYear as direct field (not in academicInfo)
    // Also check if examDate falls within the academic year if academicYear is missing
    let allExams = await Exam.find({ isDeleted: false });
    
    // Filter exams by academic year (either from academicYear field or derived from examDate)
    const exams = allExams.filter(exam => {
      if (exam.academicYear) {
        return exam.academicYear === selectedYear;
      }
      // If no academicYear field, derive from examDate
      if (exam.examDate) {
        const examYear = getAcademicYearFromDate(exam.examDate);
        return examYear === selectedYear;
      }
      return false;
    });
    const examIds = exams.map(e => e._id);

    // Exam Statistics
    const examStats = {
      total: exams.length,
      completed: exams.filter(e => e.status === 'completed' || e.status === 'results-published').length,
      ongoing: exams.filter(e => e.status === 'ongoing').length,
      scheduled: exams.filter(e => e.status === 'scheduled').length,
      draft: exams.filter(e => e.status === 'draft').length
    };

    // Student Statistics (filter by academic year if needed)
    const studentQuery = { isDeleted: false };
    const totalStudents = await Student.countDocuments(studentQuery);
    
    // Get students by department
    const studentsByDept = await Student.aggregate([
      { $match: studentQuery },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'deptInfo' } },
      { $unwind: { path: '$deptInfo', preserveNullAndEmptyArrays: true } },
      { $project: { department: '$deptInfo.name', count: 1 } }
    ]);

    // Class Statistics (filtered by academic year)
    const classQuery = {
      'academicInfo.academicYear': selectedYear,
      isDeleted: false
    };
    
    // Note: SubjectClass uses academicInfo.academicYear, Exam uses academicYear directly
    const totalClasses = await SubjectClass.countDocuments(classQuery);
    const activeClasses = await SubjectClass.countDocuments({
      ...classQuery,
      status: 'active'
    });

    // Attendance Statistics (for the academic year)
    const attendanceStats = await ClassAttendance.aggregate([
      {
        $match: {
          'academicInfo.academicYear': selectedYear,
          isDeleted: false
        }
      },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          totalPresent: { 
            $sum: { 
              $size: { 
                $filter: { 
                  input: '$attendance', 
                  as: 'att', 
                  cond: { $eq: ['$$att.status', 'present'] } 
                } 
              } 
            } 
          },
          totalAbsent: { 
            $sum: { 
              $size: { 
                $filter: { 
                  input: '$attendance', 
                  as: 'att', 
                  cond: { $eq: ['$$att.status', 'absent'] } 
                } 
              } 
            } 
          }
        }
      }
    ]);

    const attendance = attendanceStats[0] || {
      totalSessions: 0,
      totalPresent: 0,
      totalAbsent: 0
    };

    const attendanceRate = attendance.totalSessions > 0
      ? Math.round((attendance.totalPresent / (attendance.totalPresent + attendance.totalAbsent)) * 100)
      : 0;

    // Request Statistics (filtered by academic year based on request dates)
    let leaveQuery = {};
    let visitQuery = {};

    // Role-based filtering for requests
    if (userRole === ROLES.PARENT) {
      leaveQuery.requestedBy = userId;
      visitQuery.requestedBy = userId;
    } else if (userRole === ROLES.COORDINATOR) {
      // Coordinator can see requests for students in their sub-departments
      const subDepartments = await SubDepartment.find({ coordinator: userId }).select('_id');
      if (subDepartments.length > 0) {
        const subDeptIds = subDepartments.map(sd => sd._id);
        const students = await Student.find({ subDepartments: { $in: subDeptIds } }).select('_id');
        const studentIds = students.map(s => s._id);
        leaveQuery.student = { $in: studentIds };
        visitQuery.$or = [
          { student: { $in: studentIds } },
          { personToMeet: userId }
        ];
      } else {
        // No sub-departments assigned, only direct meetings
        leaveQuery.student = { $in: [] };
        visitQuery.personToMeet = userId;
      }
    } else if (userRole === ROLES.HOD) {
      const department = await Department.findOne({ hod: userId });
      if (department) {
        const students = await Student.find({ department: department._id }).select('_id');
        leaveQuery.student = { $in: students.map(s => s._id) };
        visitQuery.$or = [
          { student: { $in: students.map(s => s._id) } },
          { personToMeet: userId }
        ];
      }
    } else if (userRole === ROLES.TEACHER) {
      const teacher = await User.findById(userId);
      const teacherAssignments = teacher?.activeTeachingAssignments || [];
      if (teacherAssignments.length > 0) {
        const assignedBatchIds = teacher.assignedBatches;
        const assignedDepartmentIds = teacher.assignedDepartments;
        const assignedSubDepartmentIds = teacher.assignedSubDepartments;
        const students = await Student.find({
          $or: [
            { department: { $in: assignedDepartmentIds } },
            { subDepartments: { $in: assignedSubDepartmentIds } },
            { batches: { $in: assignedBatchIds } }
          ]
        }).select('_id');
        leaveQuery.student = { $in: students.map(s => s._id) };
        visitQuery.$or = [
          { student: { $in: students.map(s => s._id) } },
          { personToMeet: userId }
        ];
      }
    }

    // Get all requests first, then filter by academic year
    const allLeaveRequests = await LeaveRequest.find(leaveQuery);
    const allVisitRequests = await VisitRequest.find(visitQuery);

    // Filter by academic year based on dates
    const leaveRequests = allLeaveRequests.filter(req => {
      const reqYear = getAcademicYearFromDate(req.startDate);
      return reqYear === selectedYear;
    });

    const visitRequests = allVisitRequests.filter(req => {
      const reqYear = getAcademicYearFromDate(req.preferredDate);
      return reqYear === selectedYear;
    });

    const requestStats = {
      leave: {
        total: leaveRequests.length,
        pending: leaveRequests.filter(r => r.status === 'pending').length,
        approved: leaveRequests.filter(r => r.status === 'approved').length,
        rejected: leaveRequests.filter(r => r.status === 'rejected').length
      },
      visit: {
        total: visitRequests.length,
        pending: visitRequests.filter(r => r.status === 'pending').length,
        approved: visitRequests.filter(r => r.status === 'approved').length,
        rejected: visitRequests.filter(r => r.status === 'rejected').length
      }
    };

    // Teacher Statistics
    const teacherQuery = { 
      role: ROLES.TEACHER,
      accountStatus: 'verified',
      isActive: true
    };
    const totalTeachers = await User.countDocuments(teacherQuery);

    // Recent Activity
    const recentExams = await Exam.find(examQuery)
      .populate('subjects.subject', 'name code')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name examName subject subjects examType examDate status');

    const recentResults = await ExamResult.find({
      exam: { $in: examIds },
      'result.isPublished': true,
      isDeleted: false
    })
      .populate('exam', 'examName subject')
      .populate('student', 'personalInfo.fullName studentId')
      .sort({ 'result.publishedAt': -1 })
      .limit(5);

    // Subject Performance
    const subjectStats = await ExamResult.aggregate([
      { $match: { exam: { $in: examIds }, 'attendance.status': 'present', isDeleted: false } },
      { $lookup: { from: 'exams', localField: 'exam', foreignField: '_id', as: 'examInfo' } },
      { $unwind: '$examInfo' },
      {
        $group: {
          _id: '$examInfo.subject',
          totalStudents: { $sum: 1 },
          averagePercentage: { $avg: '$result.finalPercentage' },
          passedStudents: { $sum: { $cond: ['$result.isPass', 1, 0] } }
        }
      },
      {
        $addFields: {
          passPercentage: { $multiply: [{ $divide: ['$passedStudents', '$totalStudents'] }, 100] }
        }
      },
      { $sort: { averagePercentage: -1 } },
      { $limit: 5 }
    ]);

    const dashboard = {
      academicYear: selectedYear,
      statistics: {
        exams: examStats,
        students: {
          total: totalStudents,
          byDepartment: studentsByDept
        },
        classes: {
          total: totalClasses,
          active: activeClasses
        },
        attendance: {
          totalSessions: attendance.totalSessions,
          present: attendance.totalPresent,
          absent: attendance.totalAbsent,
          rate: attendanceRate
        },
        requests: requestStats,
        teachers: {
          total: totalTeachers
        }
      },
      recentActivity: {
        exams: recentExams.map(exam => ({
          id: exam._id,
          name: exam.name || exam.examName || 'Unnamed Exam',
          subject: exam.subjects && exam.subjects.length > 0 
            ? exam.subjects.map(s => s.subject?.name || s.subject || 'N/A').join(', ')
            : exam.subject || 'N/A',
          status: exam.status || 'draft',
          startDate: exam.examDate || exam.schedule?.startDate
        })),
        results: recentResults.map(result => ({
          id: result._id,
          studentName: result.student?.personalInfo?.fullName,
          examName: result.exam?.examName,
          subject: result.exam?.subject,
          percentage: result.result?.finalPercentage
        }))
      },
      subjectPerformance: subjectStats.map(stat => ({
        subject: stat._id,
        totalStudents: stat.totalStudents,
        averagePercentage: Math.round(stat.averagePercentage || 0),
        passPercentage: Math.round(stat.passPercentage || 0)
      }))
    };

    res.json({
      success: true,
      message: 'Dashboard data loaded successfully',
      data: dashboard
    });

  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load dashboard data',
      error: error.message
    });
  }
});

export default router;
