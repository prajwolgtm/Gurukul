import express from 'express';
import { auth } from '../middleware/auth.js';
import { permit, requireAccessLevel } from '../middleware/rbac.js';
import { ROLES } from '../utils/roles.js';
import SubjectClass from '../models/SubjectClass.js';
import ClassAttendance from '../models/ClassAttendance.js';
import Student from '../models/Student.js';
import mongoose from 'mongoose';

const router = express.Router();

// ==================== SIMPLIFIED CLASS ATTENDANCE APIS ====================

// 📋 POST /api/class-attendance/mark - Mark attendance for a class (simplified)
router.post('/mark', auth, permit(ROLES.TEACHER, ROLES.HOD, ROLES.PRINCIPAL, ROLES.ADMIN, ROLES.COORDINATOR), async (req, res) => {
  try {
    const {
      classId,
      date,
      attendanceType, // 'normal', 'teacher-leave', 'school-holiday'
      teacherNotes,
      attendanceData // [{ studentId, status: 'present' | 'absent' | 'late' }] - only for normal type
    } = req.body;

    // Validate required fields
    if (!classId || !date || !attendanceType) {
      return res.status(400).json({
        success: false,
        message: 'Class ID, date, and attendance type are required'
      });
    }

    // Validate attendance type
    const validTypes = ['normal', 'teacher-leave', 'school-holiday'];
    if (!validTypes.includes(attendanceType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid attendance type. Must be: normal, teacher-leave, or school-holiday'
      });
    }

    // For normal attendance, require attendance data
    if (attendanceType === 'normal' && (!attendanceData || !Array.isArray(attendanceData) || attendanceData.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Attendance data is required for normal attendance'
      });
    }

    // Verify class exists and user has access
    const subjectClass = await SubjectClass.findOne({
      _id: classId,
      isDeleted: false
    }).populate([
      { path: 'classTeacher', select: '_id fullName email' },
      { path: 'additionalTeachers.teacher', select: '_id fullName email' },
      { path: 'students.student', select: 'fullName admissionNo' }
    ]);

    if (!subjectClass) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Check if user can take attendance for this class
    const classTeacherId = subjectClass.classTeacher?._id?.toString() || 
                          subjectClass.classTeacher?.toString() || 
                          subjectClass.classTeacher;
    
    if (req.user.role === ROLES.TEACHER) {
      // Check if user is the class teacher
      const isClassTeacher = classTeacherId?.toString() === req.user.id.toString();
      
      // Check if user is an additional teacher with attendance permission
      const isAdditionalTeacher = subjectClass.additionalTeachers?.some(t => {
        const teacherId = t.teacher?._id?.toString() || t.teacher?.toString() || t.teacher;
        const hasPermission = teacherId?.toString() === req.user.id.toString() && 
                             (t.permissions?.canTakeAttendance !== false);
        return hasPermission;
      });
      
      if (!isClassTeacher && !isAdditionalTeacher) {
      return res.status(403).json({
        success: false,
          message: 'Access denied. Only the assigned class teacher or additional teachers with attendance permission can mark attendance.'
      });
      }
    }

    // Check if attendance already exists for this date
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);
    
    console.log(`🔍 Checking for existing attendance on date: ${date} -> ${attendanceDate.toISOString()}`);
    console.log(`🔍 Query range: ${new Date(attendanceDate).toISOString()} to ${new Date(attendanceDate.getTime() + 24 * 60 * 60 * 1000).toISOString()}`);
    
    const existingAttendance = await ClassAttendance.findOne({
      subjectClass: classId,
      sessionDate: {
        $gte: new Date(attendanceDate),
        $lt: new Date(attendanceDate.getTime() + 24 * 60 * 60 * 1000)
      },
      isDeleted: false
    });
    
    console.log(`${existingAttendance ? '✅ Found existing attendance' : '❌ No existing attendance found'}`);
    if (existingAttendance) {
      console.log(`📄 Existing sessionId: ${existingAttendance.sessionId}, sessionDate: ${existingAttendance.sessionDate.toISOString()}`);
    }

    // If attendance exists, update it instead of creating new one
    if (existingAttendance) {
      // Update existing attendance record
      existingAttendance.sessionStatus = attendanceType === 'normal' ? 'completed' :
                                         attendanceType === 'teacher-leave' ? 'teacher-leave' : 'holiday';
      
      existingAttendance.leaveInfo = {
        isHoliday: attendanceType === 'school-holiday',
        isTeacherLeave: attendanceType === 'teacher-leave',
        leaveType: attendanceType === 'teacher-leave' ? 'teacher-leave' : 
                   attendanceType === 'school-holiday' ? 'institutional-holiday' : null,
        leaveReason: attendanceType === 'teacher-leave' ? 'Teacher on leave' : 
                     attendanceType === 'school-holiday' ? 'School holiday' : null
      };
      
      existingAttendance.sessionNotes = {
        teacherNotes: teacherNotes || existingAttendance.sessionNotes?.teacherNotes || ''
      };
      
      existingAttendance.lastModifiedBy = req.user.id;
      
      // Update attendance records if normal type
      if (attendanceType === 'normal' && attendanceData && Array.isArray(attendanceData)) {
        // Get all active students from class
        const activeStudents = subjectClass.students.filter(s => s.status === 'active' || !s.status);
        console.log(`👥 Active students in class: ${activeStudents.length}`);
        
        // Build new attendance array - completely replace it
        const updatedAttendance = [];
        
        activeStudents.forEach(classStudent => {
          const studentId = classStudent.student?._id || classStudent.student;
          // Find matching attendance data from request
          const studentAttendance = attendanceData.find(a => 
            (a.studentId || a._id)?.toString() === studentId?.toString()
          );
          
          // Check if record already exists in the document
          const existingRecord = existingAttendance.attendance.find(a => {
            const attStudentId = a.student?._id?.toString() || a.student?.toString() || a.student;
            return attStudentId === studentId?.toString();
          });
          
          const finalStatus = studentAttendance?.status || existingRecord?.status || 'absent';
          
          if (existingRecord) {
            // Update existing record - create new object to ensure Mongoose detects change
            updatedAttendance.push({
              student: studentId,
              status: finalStatus,
              markedAt: new Date(),
              markedBy: req.user.id,
              participation: existingRecord.participation || 'average',
              _id: existingRecord._id // Preserve the _id
            });
          } else {
            // Create new record
            updatedAttendance.push({
              student: studentId,
              status: finalStatus,
              markedAt: new Date(),
              markedBy: req.user.id,
              participation: 'average'
            });
          }
        });
        
        console.log(`📊 Updated attendance records: ${updatedAttendance.length}`);
        console.log(`📊 Status breakdown:`, {
          present: updatedAttendance.filter(a => a.status === 'present').length,
          absent: updatedAttendance.filter(a => a.status === 'absent').length,
          late: updatedAttendance.filter(a => a.status === 'late').length
        });
        
        // Replace the entire attendance array - this ensures Mongoose detects the change
        existingAttendance.attendance = updatedAttendance;
        existingAttendance.markModified('attendance');
      } else if (attendanceType !== 'normal') {
        // Clear attendance records for leave/holiday
        existingAttendance.attendance = [];
        existingAttendance.markModified('attendance');
      }
      
      // Save - the pre-save hook will recalculate statistics
      await existingAttendance.save();
      
      console.log('✅ Attendance updated:', {
        attendanceId: existingAttendance._id,
        date: attendanceDate,
        type: attendanceType,
        studentCount: existingAttendance.attendance.length,
        statistics: existingAttendance.statistics
      });
      
      // Reload the document to ensure we have the latest data with recalculated statistics
      const updatedAttendanceDoc = await ClassAttendance.findById(existingAttendance._id)
        .populate([
          { path: 'conductedBy', select: 'fullName email role' },
          { path: 'attendance.student', select: 'fullName admissionNo' }
        ]);
      
      if (!updatedAttendanceDoc) {
        return res.status(500).json({
        success: false,
          message: 'Failed to reload updated attendance'
        });
      }
      
      return res.json({
        success: true,
        message: `Attendance updated successfully as ${attendanceType}`,
        data: {
          attendance: updatedAttendanceDoc,
          classConducted: attendanceType === 'normal',
          isUpdate: true
        }
      });
    }

    // Get class schedule for time
    const classSchedule = subjectClass.schedule || {};
    const startTime = classSchedule.startTime || '09:00';
    const endTime = classSchedule.endTime || '10:00';
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const duration = (endHour * 60 + endMin) - (startHour * 60 + startMin);

    // Generate session ID
    const dateStr = attendanceDate.toISOString().split('T')[0].replace(/-/g, '');
    const sessionId = `${classId}_${dateStr}_${Date.now()}`;

    // Prepare attendance records (only for normal attendance)
    let attendanceRecords = [];
    if (attendanceType === 'normal') {
      // Get all active students from class
      const activeStudents = subjectClass.students.filter(s => s.status === 'active' || !s.status);
      
      // Create attendance records
      attendanceRecords = activeStudents.map(classStudent => {
        const studentId = classStudent.student?._id || classStudent.student;
        // Find matching attendance data
        const studentAttendance = attendanceData.find(a => 
          (a.studentId || a._id)?.toString() === studentId?.toString()
        );
        
        return {
          student: studentId,
          status: studentAttendance?.status || 'absent',
          markedAt: new Date(),
          markedBy: req.user.id
        };
      });
    }

    // Determine session status
    let sessionStatus = 'completed';
    if (attendanceType === 'teacher-leave') {
      sessionStatus = 'teacher-leave';
    } else if (attendanceType === 'school-holiday') {
      sessionStatus = 'holiday';
    }

    // Create attendance record
    const attendanceSession = new ClassAttendance({
      sessionId,
      subjectClass: classId,
      sessionDate: attendanceDate,
      sessionStartTime: startTime,
      sessionEndTime: endTime,
      sessionInfo: {
        topic: attendanceType === 'normal' ? 'Regular Class' : 
               attendanceType === 'teacher-leave' ? 'Teacher on Leave' : 'School Holiday',
        sessionType: 'lecture',
        duration,
        venue: {
          room: classSchedule.room || '',
          building: classSchedule.building || ''
        }
      },
      conductedBy: req.user.id,
      attendance: attendanceRecords,
      sessionStatus,
      leaveInfo: {
        isHoliday: attendanceType === 'school-holiday',
        isTeacherLeave: attendanceType === 'teacher-leave',
        leaveType: attendanceType === 'teacher-leave' ? 'teacher-leave' : 
                   attendanceType === 'school-holiday' ? 'institutional-holiday' : null,
        leaveReason: attendanceType === 'teacher-leave' ? 'Teacher on leave' : 
                     attendanceType === 'school-holiday' ? 'School holiday' : null
      },
      sessionNotes: {
        teacherNotes: teacherNotes || ''
      },
      attendanceMarking: {
        startedAt: new Date(),
        completedAt: new Date(),
        markedBy: req.user.id,
        method: 'manual',
        isFinalized: true,
        finalizedAt: new Date(),
        finalizedBy: req.user.id
      },
      academicInfo: {
        academicYear: subjectClass.academicInfo?.academicYear || '2024-2025',
        term: subjectClass.academicInfo?.term || 'annual'
      },
      createdBy: req.user.id
    });

    await attendanceSession.save();

    // Update class statistics - only count normal classes as "conducted"
    if (attendanceType === 'normal') {
      subjectClass.statistics = subjectClass.statistics || {};
    subjectClass.statistics.totalSessions = (subjectClass.statistics.totalSessions || 0) + 1;
      subjectClass.statistics.lastSessionDate = attendanceDate;

      // Calculate average attendance
      const allNormalSessions = await ClassAttendance.find({
        subjectClass: classId,
        sessionStatus: 'completed',
        isDeleted: false
      });

      if (allNormalSessions.length > 0) {
        const totalPercentage = allNormalSessions.reduce((sum, s) => 
          sum + (s.statistics?.attendancePercentage || 0), 0
        );
        subjectClass.statistics.averageAttendance = Math.round(totalPercentage / allNormalSessions.length);
      }
      
      await subjectClass.save();
    }

    // Populate response
    await attendanceSession.populate([
      { path: 'conductedBy', select: 'fullName email role' },
      { path: 'attendance.student', select: 'fullName admissionNo' }
    ]);

    res.status(201).json({
      success: true,
      message: `Attendance marked successfully as ${attendanceType}`,
      data: {
        attendance: attendanceSession,
        classConducted: attendanceType === 'normal'
      }
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark attendance',
      error: error.message
    });
  }
});

// 📊 GET /api/class-attendance/class/:classId - Get attendance records for a class
router.get('/class/:classId', auth, permit(ROLES.TEACHER, ROLES.HOD, ROLES.PRINCIPAL, ROLES.ADMIN, ROLES.COORDINATOR), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 30,
      startDate,
      endDate
    } = req.query;

    // Verify class exists
    const subjectClass = await SubjectClass.findOne({
      _id: req.params.classId,
      isDeleted: false
    }).populate([
      { path: 'classTeacher', select: '_id fullName email' },
      { path: 'additionalTeachers.teacher', select: '_id fullName email' }
    ]);

    if (!subjectClass) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Check access
    if (req.user.role === ROLES.TEACHER) {
      const classTeacherId = subjectClass.classTeacher?._id?.toString() || 
                            subjectClass.classTeacher?.toString() || 
                            subjectClass.classTeacher;
      
      const isClassTeacher = classTeacherId?.toString() === req.user.id.toString();
      const isAdditionalTeacher = subjectClass.additionalTeachers?.some(t => {
        const teacherId = t.teacher?._id?.toString() || t.teacher?.toString() || t.teacher;
        return teacherId?.toString() === req.user.id.toString();
      });
      
      if (!isClassTeacher && !isAdditionalTeacher) {
      return res.status(403).json({
        success: false,
          message: 'Access denied'
      });
      }
    }

    // Build query
    let query = {
      subjectClass: req.params.classId,
      isDeleted: false
    };

    if (startDate || endDate) {
      query.sessionDate = {};
      if (startDate) {
        // Start of the day - append T00:00:00 to treat as local time, then convert to Date
        // This ensures we match dates regardless of time component in stored sessionDate
        const start = new Date(startDate + 'T00:00:00');
        query.sessionDate.$gte = start;
        console.log(`📅 Query startDate: ${startDate} -> ${start.toISOString()}`);
      }
      if (endDate) {
        // End of the day - append T23:59:59.999 to cover entire day
        const end = new Date(endDate + 'T23:59:59.999');
        query.sessionDate.$lte = end;
        console.log(`📅 Query endDate: ${endDate} -> ${end.toISOString()}`);
      }
    }

    // Get attendance records
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { sessionDate: -1 },
      populate: [
        { path: 'conductedBy', select: 'fullName email' },
        { path: 'attendance.student', select: 'fullName admissionNo' }
      ]
    };

    console.log(`\n🔍 ===== FETCHING ATTENDANCE =====`);
    console.log(`📊 Class ID: ${req.params.classId}`);
    console.log(`📅 Date range: ${startDate || 'none'} to ${endDate || 'none'}`);
    console.log(`📊 Query:`, JSON.stringify(query, null, 2));
    
    const attendanceRecords = await ClassAttendance.paginate(query, options);
    
    console.log(`📊 Found ${attendanceRecords.docs?.length || 0} attendance records`);
    if (attendanceRecords.docs && attendanceRecords.docs.length > 0) {
      attendanceRecords.docs.forEach(record => {
        console.log(`  📄 Record: ${record.sessionDate.toISOString()} | Status: ${record.sessionStatus} | Students: ${record.attendance?.length || 0}`);
        if (record.attendance && record.attendance.length > 0) {
          const statusBreakdown = {
            present: record.attendance.filter(a => a.status === 'present').length,
            absent: record.attendance.filter(a => a.status === 'absent').length,
            late: record.attendance.filter(a => a.status === 'late').length
          };
          console.log(`    📊 Breakdown:`, statusBreakdown);
        }
      });
    }

    // Calculate statistics
    const allRecords = await ClassAttendance.find({
      subjectClass: req.params.classId,
      isDeleted: false
    });

    const stats = {
      totalClasses: allRecords.filter(r => r.sessionStatus === 'completed').length,
      teacherLeaveDays: allRecords.filter(r => r.sessionStatus === 'teacher-leave').length,
      holidayDays: allRecords.filter(r => r.sessionStatus === 'holiday').length,
      totalDays: allRecords.length
    };

    res.json({
      success: true,
      data: {
        attendance: attendanceRecords.docs,
        pagination: {
          currentPage: attendanceRecords.page,
          totalPages: attendanceRecords.totalPages,
          totalRecords: attendanceRecords.totalDocs,
          hasNext: attendanceRecords.hasNextPage,
          hasPrev: attendanceRecords.hasPrevPage
        },
        statistics: stats
      }
    });
  } catch (error) {
    console.error('Error fetching class attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance',
      error: error.message
    });
  }
});

// 📊 GET /api/class-attendance/student/:studentId - Get student's class attendance
router.get('/student/:studentId', auth, permit(ROLES.TEACHER, ROLES.HOD, ROLES.PRINCIPAL, ROLES.ADMIN, ROLES.COORDINATOR), async (req, res) => {
  try {
    const {
      classId,
      startDate,
      endDate,
      limit = 100
    } = req.query;

    // Build query
    let query = {
      'attendance.student': req.params.studentId,
      isDeleted: false
    };

    if (classId) {
      query.subjectClass = classId;
    }

    if (startDate || endDate) {
      query.sessionDate = {};
      if (startDate) {
        // Start of the day - append T00:00:00 to treat as local time
        const start = new Date(startDate + 'T00:00:00');
        query.sessionDate.$gte = start;
        console.log(`📅 Student query startDate: ${startDate} -> ${start.toISOString()}`);
      }
      if (endDate) {
        // End of the day - append T23:59:59.999 to cover entire day
        const end = new Date(endDate + 'T23:59:59.999');
        query.sessionDate.$lte = end;
        console.log(`📅 Student query endDate: ${endDate} -> ${end.toISOString()}`);
      }
    }

    // Get attendance records
    const attendanceRecords = await ClassAttendance.find(query)
      .sort({ sessionDate: -1 })
      .limit(parseInt(limit))
      .populate([
        { path: 'subjectClass', select: 'className subject' },
        { path: 'conductedBy', select: 'fullName' }
      ]);

    // Calculate statistics (only for normal classes)
    const normalClasses = attendanceRecords.filter(r => r.sessionStatus === 'completed');
    let presentCount = 0;
    let absentCount = 0;

    normalClasses.forEach(session => {
      const studentAttendance = session.attendance.find(a => 
        a.student?.toString() === req.params.studentId
      );
      if (studentAttendance) {
        if (studentAttendance.status === 'present' || studentAttendance.status === 'late') {
          presentCount++;
        } else if (studentAttendance.status === 'absent') {
          absentCount++;
    }
      }
    });

    const totalNormalClasses = normalClasses.length;
    const attendancePercentage = totalNormalClasses > 0 
      ? Math.round((presentCount / totalNormalClasses) * 100) 
      : 0;

    res.json({
      success: true,
      data: {
        attendance: attendanceRecords,
        statistics: {
          totalClasses: totalNormalClasses,
          present: presentCount,
          absent: absentCount,
          attendancePercentage
        }
      }
    });
  } catch (error) {
    console.error('Error fetching student attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student attendance',
      error: error.message
    });
  }
});

// 🔄 PUT /api/class-attendance/:attendanceId - Update attendance record
router.put('/:attendanceId', auth, permit(ROLES.TEACHER, ROLES.HOD, ROLES.PRINCIPAL, ROLES.ADMIN, ROLES.COORDINATOR), async (req, res) => {
  try {
    const {
      attendanceType,
      teacherNotes,
      attendanceData
    } = req.body;

    const attendanceRecord = await ClassAttendance.findById(req.params.attendanceId);

    if (!attendanceRecord) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    // Check access
    const subjectClass = await SubjectClass.findById(attendanceRecord.subjectClass)
      .populate([
        { path: 'classTeacher', select: '_id fullName email' },
        { path: 'additionalTeachers.teacher', select: '_id fullName email' }
      ]);
    
    if (!subjectClass) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }
    
    if (req.user.role === ROLES.TEACHER) {
      const classTeacherId = subjectClass.classTeacher?._id?.toString() || 
                            subjectClass.classTeacher?.toString() || 
                            subjectClass.classTeacher;
      
      const isClassTeacher = classTeacherId?.toString() === req.user.id.toString();
      const isAdditionalTeacher = subjectClass.additionalTeachers?.some(t => {
        const teacherId = t.teacher?._id?.toString() || t.teacher?.toString() || t.teacher;
        return teacherId?.toString() === req.user.id.toString();
      });
      
      if (!isClassTeacher && !isAdditionalTeacher) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    // Update fields
    if (attendanceType) {
      attendanceRecord.sessionStatus = attendanceType === 'normal' ? 'completed' :
                                        attendanceType === 'teacher-leave' ? 'teacher-leave' : 'holiday';
      attendanceRecord.leaveInfo = {
        isHoliday: attendanceType === 'school-holiday',
        isTeacherLeave: attendanceType === 'teacher-leave',
        leaveType: attendanceType === 'teacher-leave' ? 'teacher-leave' : 
                   attendanceType === 'school-holiday' ? 'institutional-holiday' : null
      };
    }

    if (teacherNotes !== undefined) {
      attendanceRecord.sessionNotes = attendanceRecord.sessionNotes || {};
      attendanceRecord.sessionNotes.teacherNotes = teacherNotes;
    }

    if (attendanceData && Array.isArray(attendanceData) && attendanceType === 'normal') {
      // Update attendance records
      attendanceData.forEach(({ studentId, status }) => {
        const attendanceIndex = attendanceRecord.attendance.findIndex(a => 
          a.student?.toString() === studentId?.toString()
        );
        if (attendanceIndex !== -1) {
          attendanceRecord.attendance[attendanceIndex].status = status;
          attendanceRecord.attendance[attendanceIndex].markedAt = new Date();
          attendanceRecord.attendance[attendanceIndex].markedBy = req.user.id;
      }
    });
    }

    attendanceRecord.lastModifiedBy = req.user.id;
    await attendanceRecord.save();

    await attendanceRecord.populate([
      { path: 'conductedBy', select: 'fullName email' },
      { path: 'attendance.student', select: 'fullName admissionNo' }
    ]);

    res.json({
      success: true,
      message: 'Attendance updated successfully',
      data: { attendance: attendanceRecord }
    });
  } catch (error) {
    console.error('Error updating attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update attendance',
      error: error.message
    });
  }
});

export default router; 