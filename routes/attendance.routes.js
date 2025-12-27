import express from 'express';
import DailyAttendance from '../models/DailyAttendance.js';
import Student from '../models/Student.js';
import AttendanceSession from '../models/AttendanceSession.js';
import { auth } from '../middleware/auth.js';
import { permit } from '../middleware/rbac.js';
import { ROLES } from '../utils/roles.js';
import { generateDailyAttendanceReport } from '../utils/pdfGenerator.js';
import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// @route   POST /api/attendance/bulk-initialize
// @desc    Initialize daily attendance for all students (Hostel Coordinator/Admin/Principal)
// @access  Private (Hostel Coordinator/Admin/Principal only)
router.post('/bulk-initialize', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.CARETAKER), async (req, res) => {
  try {
    const { date } = req.body;
    const attendanceDate = date ? new Date(date) : new Date();
    
    // Set to start of day
    attendanceDate.setHours(0, 0, 0, 0);
    
    // Check if attendance already exists for this date
    const existingAttendance = await DailyAttendance.findOne({
      attendanceDate: {
        $gte: attendanceDate,
        $lt: new Date(attendanceDate.getTime() + 24 * 60 * 60 * 1000)
      }
    });
    
    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: 'Attendance for this date already exists'
      });
    }
    
    // Get all active students (only status: 'active')
    const students = await Student.find({ 
      isActive: true,
      status: 'active'
    });
    
    if (students.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active students found'
      });
    }
    
    // Create attendance records for all students
    const attendanceRecords = students.map(student => ({
      attendanceDate,
      student: student._id,
      sessions: {
        prayer_morning: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
        sandhya: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
        yoga: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
        service: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
        breakfast: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
        morning_class: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
        midday_prayer: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
        lunch: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
        afternoon_class: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
        evening_prayer: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
        evening_study: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
        dinner: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
        night_prayer: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
        bedtime: { status: 'Present', timeMarked: null, markedBy: null, notes: '' }
      }
    }));
    
    const createdAttendance = await DailyAttendance.insertMany(attendanceRecords);
    
    res.json({
      success: true,
      message: `Daily attendance initialized for ${createdAttendance.length} students`,
      data: {
        date: attendanceDate,
        totalStudents: createdAttendance.length,
        attendanceRecords: createdAttendance.map(record => ({
          id: record._id,
          student: record.student
        }))
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to initialize daily attendance',
      error: error.message
    });
  }
});

// @route   POST /api/attendance/bulk-mark-session
// @desc    Mark attendance for a specific session for all students (Hostel Coordinator/Admin/Principal)
// @access  Private (Hostel Coordinator/Admin/Principal only)
router.post('/bulk-mark-session', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.CARETAKER), async (req, res) => {
  try {
    const { date, sessionKey, status, studentIds, notes } = req.body;
    
    console.log('📋 Bulk mark session request:', { date, sessionKey, status, notes, studentIds });
    
    if (!date || !sessionKey || !status) {
      return res.status(400).json({
        success: false,
        message: 'Date, session key, and status are required',
        received: { date: !!date, sessionKey: !!sessionKey, status: !!status }
      });
    }
    
    if (!['Present', 'Absent', 'Sick', 'Leave'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be Present, Absent, Sick, or Leave'
      });
    }
    
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);
    
    // Find attendance records for the specified date
    const query = {
      attendanceDate: {
        $gte: attendanceDate,
        $lt: new Date(attendanceDate.getTime() + 24 * 60 * 60 * 1000)
      }
    };
    
    // If specific students are specified, filter by them
    if (studentIds && studentIds.length > 0) {
      query.student = { $in: studentIds };
    }
    
    let attendanceRecords = await DailyAttendance.find(query);
    
    // If no records exist, automatically initialize them
    if (attendanceRecords.length === 0) {
      // Get all active students (or specific students if provided)
      let students;
      if (studentIds && studentIds.length > 0) {
        students = await Student.find({ 
          _id: { $in: studentIds },
          isActive: true,
          status: 'active'
        });
      } else {
        students = await Student.find({ 
          isActive: true,
          status: 'active'
        });
      }
      
      if (students.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No active students found to mark attendance'
        });
      }
      
      // Create attendance records for all students
      const newAttendanceRecords = students.map(student => ({
        attendanceDate,
        student: student._id,
        sessions: {
          prayer_morning: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          sandhya: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          yoga: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          service: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          breakfast: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          morning_class: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          midday_prayer: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          lunch: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          afternoon_class: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          evening_prayer: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          evening_study: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          dinner: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          night_prayer: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          bedtime: { status: 'Present', timeMarked: null, markedBy: null, notes: '' }
        }
      }));
      
      const createdRecords = await DailyAttendance.insertMany(newAttendanceRecords);
      attendanceRecords = createdRecords;
    }
    
    // Validate session key exists in the sessions schema
    const validSessionKeys = [
      'prayer_morning', 'sandhya', 'yoga', 'service', 'breakfast',
      'morning_class', 'midday_prayer', 'lunch', 'afternoon_class',
      'evening_prayer', 'evening_study', 'dinner', 'night_prayer', 'bedtime'
    ];
    
    if (!validSessionKeys.includes(sessionKey)) {
      return res.status(400).json({
        success: false,
        message: `Invalid session key: ${sessionKey}. Valid keys are: ${validSessionKeys.join(', ')}`
      });
    }
    
    // Update all records for the specified session
    const updatePromises = attendanceRecords.map(record => {
      // Ensure the session exists in the record
      if (!record.sessions || !record.sessions[sessionKey]) {
        // Initialize the session if it doesn't exist
        if (!record.sessions) {
          record.sessions = {};
        }
        record.sessions[sessionKey] = {
          status: 'Present',
          timeMarked: null,
          markedBy: null,
          notes: ''
        };
      }
      
      record.sessions[sessionKey].status = status;
      record.sessions[sessionKey].timeMarked = new Date();
      record.sessions[sessionKey].markedBy = req.user.id;
      record.sessions[sessionKey].notes = notes || '';
      return record.save();
    });
    
    await Promise.all(updatePromises);
    
    console.log(`✅ Successfully marked ${status} for ${attendanceRecords.length} students in session ${sessionKey}`);
    
    res.json({
      success: true,
      message: `Marked ${status} for ${attendanceRecords.length} students in session ${sessionKey}`,
      data: {
        date: attendanceDate,
        sessionKey,
        status,
        totalUpdated: attendanceRecords.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error in bulk-mark-session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark bulk session attendance',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @route   POST /api/attendance/mark-session
// @desc    Mark attendance for a specific student and session (Hostel Coordinator/Admin/Principal)
// @access  Private (Hostel Coordinator/Admin/Principal only)
router.post('/mark-session', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.CARETAKER), async (req, res) => {
  try {
    const { studentId, date, sessionKey, status, notes } = req.body;
    
    if (!studentId || !date || !sessionKey || !status) {
      return res.status(400).json({
        success: false,
        message: 'Student ID, date, session key, and status are required'
      });
    }
    
    if (!['Present', 'Absent', 'Sick', 'Leave'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be Present, Absent, Sick, or Leave'
      });
    }
    
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);
    
    // Find or create attendance record
    let attendanceRecord = await DailyAttendance.findOne({
      student: studentId,
      attendanceDate: {
        $gte: attendanceDate,
        $lt: new Date(attendanceDate.getTime() + 24 * 60 * 60 * 1000)
      }
    });
    
    if (!attendanceRecord) {
      // Create new attendance record if it doesn't exist
      attendanceRecord = new DailyAttendance({
        student: studentId,
        attendanceDate,
        sessions: {
          prayer_morning: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          sandhya: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          yoga: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          service: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          breakfast: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          morning_class: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          midday_prayer: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          lunch: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          afternoon_class: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          evening_prayer: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          evening_study: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          dinner: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          night_prayer: { status: 'Present', timeMarked: null, markedBy: null, notes: '' },
          bedtime: { status: 'Present', timeMarked: null, markedBy: null, notes: '' }
        }
      });
    }
    
    // Mark the specific session
    attendanceRecord.sessions[sessionKey].status = status;
    attendanceRecord.sessions[sessionKey].timeMarked = new Date();
    attendanceRecord.sessions[sessionKey].markedBy = req.user.id;
    attendanceRecord.sessions[sessionKey].notes = notes || '';
    
    await attendanceRecord.save();
    
    res.json({
      success: true,
      message: `Marked ${status} for student in session ${sessionKey}`,
      data: {
        studentId,
        date: attendanceDate,
        sessionKey,
        status,
        notes,
        markedBy: req.user.id,
        timeMarked: attendanceRecord.sessions[sessionKey].timeMarked
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to mark session attendance',
      error: error.message
    });
  }
});

// @route   GET /api/attendance/dashboard
// @desc    Get attendance dashboard summary (Hostel Coordinator/Admin/Principal)
// @access  Private (Hostel Coordinator/Admin/Principal only)
router.get('/dashboard', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.CARETAKER), async (req, res) => {
  try {
    const { date } = req.query;
    const attendanceDate = date ? new Date(date) : new Date();
    attendanceDate.setHours(0, 0, 0, 0);
    
    // Get attendance records for the date
    const attendanceRecords = await DailyAttendance.find({
      attendanceDate: {
        $gte: attendanceDate,
        $lt: new Date(attendanceDate.getTime() + 24 * 60 * 60 * 1000)
      }
    }).populate('student', 'fullName admissionNo');
    
    // Get session information
    const sessions = await AttendanceSession.getInOrder();
    
    // Calculate summary statistics
    const summary = {
      date: attendanceDate,
      totalStudents: attendanceRecords.length,
      sessions: sessions.map(session => {
        const sessionStats = {
          sessionKey: session.sessionKey,
          sessionName: session.displayNames.english,
          present: 0,
          absent: 0,
          sick: 0,
          leave: 0,
          percentage: 0
        };
        
        attendanceRecords.forEach(record => {
          const status = record.sessions[session.sessionKey]?.status || 'Present';
          sessionStats[status.toLowerCase()]++;
        });
        
        sessionStats.percentage = Math.round((sessionStats.present / attendanceRecords.length) * 100) || 0;
        
        return sessionStats;
      }),
      overallStats: {
        excellent: 0,
        good: 0,
        average: 0,
        poor: 0,
        critical: 0
      }
    };
    
    // Calculate overall student performance
    attendanceRecords.forEach(record => {
      summary.overallStats[record.overallStatus.toLowerCase()]++;
    });
    
    res.json({
      success: true,
      data: summary
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get attendance dashboard',
      error: error.message
    });
  }
});

// @route   GET /api/attendance/student/:studentId
// @desc    Get attendance for a specific student (Hostel Coordinator/Admin/Principal/Parent)
// @access  Private (Hostel Coordinator/Admin/Principal/Parent)
router.get('/student/:studentId', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.CARETAKER, ROLES.PARENT), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate, limit = 30 } = req.query;
    
    // Build query
    const query = { student: studentId, isActive: true };
    
    if (startDate && endDate) {
      query.attendanceDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const attendanceRecords = await DailyAttendance.find(query)
      .sort({ attendanceDate: -1 })
      .limit(parseInt(limit))
      .populate('student', 'fullName admissionNo');
    
    // Get session information
    const sessions = await AttendanceSession.getInOrder();
    
    res.json({
      success: true,
      data: {
        student: attendanceRecords[0]?.student || null,
        attendanceRecords,
        sessions: sessions.map(session => ({
          key: session.sessionKey,
          name: session.displayNames.english,
          time: session.defaultTime,
          category: session.category
        }))
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get student attendance',
      error: error.message
    });
  }
});

// @route   GET /api/attendance/daily/:date
// @desc    Get daily attendance for all students (Hostel Coordinator/Admin/Principal)
// @access  Private (Hostel Coordinator/Admin/Principal only)
router.get('/daily/:date', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.CARETAKER), async (req, res) => {
  try {
    const { date } = req.params;
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);
    
    // First, get all active students (only status: 'active', excluding leftout, graduated, transferred, Completed Moola, Post Graduated)
    // Must match exactly what student list shows: isActive: true AND status: 'active'
    const activeStudents = await Student.find({
      isActive: true,
      status: { $eq: 'active' }  // Explicitly check for exact match, excluding null/undefined
    }).select('_id fullName admissionNo status').lean();
    
    // Double-check: filter out any that don't have status exactly 'active'
    const verifiedActiveStudents = activeStudents.filter(s => s.status === 'active');
    
    console.log(`📚 Found ${activeStudents.length} students with isActive:true, ${verifiedActiveStudents.length} with status:'active'`);
    
    // Use only verified active students
    const finalActiveStudents = verifiedActiveStudents;
    
    // Get attendance records for the date
    const attendanceRecords = await DailyAttendance.find({
      attendanceDate: {
        $gte: attendanceDate,
        $lt: new Date(attendanceDate.getTime() + 24 * 60 * 60 * 1000)
      },
      // Only get attendance for active students
      student: { $in: finalActiveStudents.map(s => s._id) }
    }).populate({
      path: 'student',
      select: 'fullName admissionNo',
      match: { isActive: true, status: 'active' }
    }).lean();
    
    // Filter out attendance records with null/undefined student (orphaned records)
    const validAttendanceRecords = attendanceRecords.filter(record => record.student !== null && record.student !== undefined);
    
    console.log(`📋 Found ${validAttendanceRecords.length} valid attendance records (filtered out ${attendanceRecords.length - validAttendanceRecords.length} invalid records)`);
    
    // Create a map of student IDs to attendance records
    const attendanceMap = new Map();
    validAttendanceRecords.forEach(record => {
      if (record.student && record.student._id) {
        attendanceMap.set(record.student._id.toString(), record);
      }
    });
    
    // Merge: Create attendance records for all active students
    // If a student has attendance, use it; otherwise create an empty record structure
    const mergedAttendanceRecords = finalActiveStudents.map(student => {
      const existingAttendance = attendanceMap.get(student._id.toString());
      if (existingAttendance) {
        return {
          ...existingAttendance,
          student: {
            _id: student._id,
            fullName: student.fullName,
            admissionNo: student.admissionNo
          }
        };
      } else {
        // Student doesn't have attendance record yet - return structure for frontend
        return {
          _id: null,
          attendanceDate: attendanceDate,
          student: {
            _id: student._id,
            fullName: student.fullName,
            admissionNo: student.admissionNo
          },
          sessions: {},
          statistics: {
            totalSessions: 14,
            presentCount: 14,
            absentCount: 0,
            sickCount: 0,
            leaveCount: 0,
            attendancePercentage: 100
          },
          overallStatus: 'Excellent'
        };
      }
    });
    
    // Get session information - initialize if empty
    let sessions = await AttendanceSession.getInOrder();
    
    // If no sessions exist, initialize defaults
    if (sessions.length === 0) {
      console.log('⚠️ No attendance sessions found. Initializing defaults...');
      try {
        sessions = await AttendanceSession.initializeDefaults();
        console.log(`✅ Initialized ${sessions.length} attendance sessions`);
      } catch (initError) {
        console.error('❌ Error initializing sessions:', initError);
        // Try to get sessions again after initialization
        sessions = await AttendanceSession.getInOrder();
      }
    }
    
    console.log(`📋 Found ${sessions.length} attendance sessions`);
    
    res.json({
      success: true,
      data: {
        date: attendanceDate,
        totalStudents: mergedAttendanceRecords.length,
        attendanceRecords: mergedAttendanceRecords,
        sessions: sessions.map(session => ({
          key: session.sessionKey,
          name: session.displayNames.english || session.displayNames.sanskrit || session.sessionKey,
          time: session.defaultTime,
          category: session.category
        }))
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting daily attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get daily attendance',
      error: error.message
    });
  }
});

// @route   GET /api/attendance/report
// @desc    Get attendance report (Hostel Coordinator/Admin/Principal)
// @access  Private (Hostel Coordinator/Admin/Principal only)
router.get('/report', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.CARETAKER), async (req, res) => {
  try {
    const { startDate, endDate, department, batch, studentId } = req.query;
    
    // Build query
    const query = { isActive: true };
    
    if (startDate && endDate) {
      query.attendanceDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    // Get students based on filters (only active status)
    let studentQuery = { 
      isActive: true,
      status: 'active'
    };
    
    if (department) {
      studentQuery['academicInfo.department'] = department;
    }
    
    if (batch) {
      studentQuery['academicInfo.batch'] = batch;
    }
    
    if (studentId) {
      studentQuery._id = studentId;
    }
    
    const students = await Student.find(studentQuery, '_id fullName admissionNo');
    const studentIds = students.map(s => s._id);
    
    query.student = { $in: studentIds };
    
    const attendanceRecords = await DailyAttendance.find(query)
      .populate('student', 'fullName admissionNo')
      .sort({ attendanceDate: -1 });
    
    // Calculate report statistics
    const report = {
      period: { startDate, endDate },
      totalStudents: students.length,
      totalDays: 0,
      averageAttendance: 0,
      studentStats: []
    };
    
    // Group by student
    const studentStats = {};
    students.forEach(student => {
      studentStats[student._id] = {
        student: student,
        totalDays: 0,
        presentDays: 0,
        absentDays: 0,
        sickDays: 0,
        leaveDays: 0,
        averagePercentage: 0
      };
    });
    
    // Calculate statistics
    attendanceRecords.forEach(record => {
      const studentId = record.student._id.toString();
      if (studentStats[studentId]) {
        studentStats[studentId].totalDays++;
        studentStats[studentId].presentDays += record.statistics.presentCount;
        studentStats[studentId].absentDays += record.statistics.absentCount;
        studentStats[studentId].sickDays += record.statistics.sickCount;
        studentStats[studentId].leaveDays += record.statistics.leaveCount;
      }
    });
    
    // Calculate averages
    Object.values(studentStats).forEach(stats => {
      if (stats.totalDays > 0) {
        stats.averagePercentage = Math.round((stats.presentDays / (stats.totalDays * 14)) * 100);
      }
    });
    
    report.studentStats = Object.values(studentStats);
    report.totalDays = Math.max(...Object.values(studentStats).map(s => s.totalDays), 0);
    
    if (report.totalDays > 0) {
      const totalPresent = Object.values(studentStats).reduce((sum, s) => sum + s.presentDays, 0);
      const totalPossible = report.totalDays * report.totalStudents * 14;
      report.averageAttendance = Math.round((totalPresent / totalPossible) * 100);
    }
    
    res.json({
      success: true,
      data: report
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get attendance report',
      error: error.message
    });
  }
});

// @route   GET /api/attendance/report/daily/:date/pdf
// @desc    Download daily attendance report as PDF (Admin/Principal/Caretaker)
// @access  Private
router.get('/report/daily/:date/pdf', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.CARETAKER), async (req, res) => {
  try {
    const { date } = req.params;
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);
    
    // Get all active students (only status: 'active')
    const activeStudents = await Student.find({
      isActive: true,
      status: 'active'
    }).select('_id fullName admissionNo').lean();
    
    // Get attendance records for the date
    const attendanceRecords = await DailyAttendance.find({
      attendanceDate: {
        $gte: attendanceDate,
        $lt: new Date(attendanceDate.getTime() + 24 * 60 * 60 * 1000)
      },
      student: { $in: activeStudents.map(s => s._id) }
    }).populate({
      path: 'student',
      select: 'fullName admissionNo',
      match: { isActive: true, status: 'active' }
    }).lean();
    
    // Filter valid records
    const validAttendanceRecords = attendanceRecords.filter(record => record.student !== null && record.student !== undefined);
    
    // Merge with all active students
    const attendanceMap = new Map();
    validAttendanceRecords.forEach(record => {
      if (record.student && record.student._id) {
        attendanceMap.set(record.student._id.toString(), record);
      }
    });
    
    const mergedAttendanceRecords = activeStudents.map(student => {
      const existingAttendance = attendanceMap.get(student._id.toString());
      if (existingAttendance) {
        return {
          ...existingAttendance,
          student: {
            _id: student._id,
            fullName: student.fullName,
            admissionNo: student.admissionNo
          }
        };
      } else {
        return {
          _id: null,
          attendanceDate: attendanceDate,
          student: {
            _id: student._id,
            fullName: student.fullName,
            admissionNo: student.admissionNo
          },
          sessions: {},
          statistics: {
            totalSessions: 14,
            presentCount: 14,
            absentCount: 0,
            sickCount: 0,
            leaveCount: 0,
            attendancePercentage: 100
          },
          overallStatus: 'Excellent'
        };
      }
    });
    
    // Get sessions
    let sessions = await AttendanceSession.getInOrder();
    if (sessions.length === 0) {
      sessions = await AttendanceSession.initializeDefaults();
    }
    
    const attendanceData = {
      date: attendanceDate,
      totalStudents: mergedAttendanceRecords.length,
      attendanceRecords: mergedAttendanceRecords,
      sessions: sessions.map(session => ({
        key: session.sessionKey,
        name: session.displayNames.english || session.displayNames.sanskrit || session.sessionKey,
        time: session.defaultTime,
        category: session.category
      }))
    };
    
    // Generate PDF
    const filename = `daily_attendance_${date}_${Date.now()}.pdf`;
    const outputPath = path.join(__dirname, '../temp', filename);
    
    // Ensure temp directory exists
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    await generateDailyAttendanceReport(attendanceData, outputPath);
    
    // Send PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);
    
    fileStream.on('end', () => {
      // Clean up temp file
      setTimeout(() => {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      }, 5000);
    });
    
  } catch (error) {
    console.error('Error generating daily attendance PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate PDF',
      error: error.message
    });
  }
});

// @route   GET /api/attendance/report/daily/:date/excel
// @desc    Download daily attendance report as Excel (Admin/Principal/Caretaker)
// @access  Private
router.get('/report/daily/:date/excel', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.CARETAKER), async (req, res) => {
  try {
    const { date } = req.params;
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);
    
    // Get all active students (only status: 'active')
    const activeStudents = await Student.find({
      isActive: true,
      status: 'active'
    }).select('_id fullName admissionNo').lean();
    
    // Get attendance records for the date
    const attendanceRecords = await DailyAttendance.find({
      attendanceDate: {
        $gte: attendanceDate,
        $lt: new Date(attendanceDate.getTime() + 24 * 60 * 60 * 1000)
      },
      student: { $in: activeStudents.map(s => s._id) }
    }).populate({
      path: 'student',
      select: 'fullName admissionNo',
      match: { isActive: true, status: 'active' }
    }).lean();
    
    // Filter valid records
    const validAttendanceRecords = attendanceRecords.filter(record => record.student !== null && record.student !== undefined);
    
    // Merge with all active students
    const attendanceMap = new Map();
    validAttendanceRecords.forEach(record => {
      if (record.student && record.student._id) {
        attendanceMap.set(record.student._id.toString(), record);
      }
    });
    
    const mergedAttendanceRecords = activeStudents.map(student => {
      const existingAttendance = attendanceMap.get(student._id.toString());
      if (existingAttendance) {
        return {
          ...existingAttendance,
          student: {
            _id: student._id,
            fullName: student.fullName,
            admissionNo: student.admissionNo
          }
        };
      } else {
        return {
          _id: null,
          attendanceDate: attendanceDate,
          student: {
            _id: student._id,
            fullName: student.fullName,
            admissionNo: student.admissionNo
          },
          sessions: {},
          statistics: {
            totalSessions: 14,
            presentCount: 14,
            absentCount: 0,
            sickCount: 0,
            leaveCount: 0,
            attendancePercentage: 100
          },
          overallStatus: 'Excellent'
        };
      }
    });
    
    // Get sessions
    let sessions = await AttendanceSession.getInOrder();
    if (sessions.length === 0) {
      sessions = await AttendanceSession.initializeDefaults();
    }
    
    // Prepare Excel data
    const excelData = [];
    
    // Header row
    const headerRow = ['S.No', 'Admission No', 'Student Name', ...sessions.map(s => s.displayNames.english || s.sessionKey), 'Present', 'Absent', 'Sick', 'Leave', 'Attendance %', 'Overall Status'];
    excelData.push(headerRow);
    
    // Data rows
    mergedAttendanceRecords.forEach((record, index) => {
      const student = record.student || {};
      const row = [
        index + 1,
        student.admissionNo || 'N/A',
        student.fullName || 'Unknown',
        ...sessions.map(session => record.sessions?.[session.sessionKey]?.status || 'Present'),
        record.statistics?.presentCount || 0,
        record.statistics?.absentCount || 0,
        record.statistics?.sickCount || 0,
        record.statistics?.leaveCount || 0,
        (record.statistics?.attendancePercentage || 0).toFixed(1) + '%',
        record.overallStatus || 'N/A'
      ];
      excelData.push(row);
    });
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(excelData);
    
    // Set column widths
    const colWidths = [
      { wch: 8 }, // S.No
      { wch: 15 }, // Admission No
      { wch: 25 }, // Student Name
      ...sessions.map(() => ({ wch: 12 })), // Session columns
      { wch: 10 }, // Present
      { wch: 10 }, // Absent
      { wch: 10 }, // Sick
      { wch: 10 }, // Leave
      { wch: 12 }, // Attendance %
      { wch: 15 } // Overall Status
    ];
    ws['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Attendance');
    
    // Generate buffer
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    // Send Excel file
    const filename = `daily_attendance_${date}_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(excelBuffer);
    
  } catch (error) {
    console.error('Error generating daily attendance Excel:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate Excel',
      error: error.message
    });
  }
});

export default router; 