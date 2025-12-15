import mongoose from 'mongoose';
import { withTimestamps, oid } from './_base.js';

/**
 * ✅ BEST DATABASE DESIGN FOR DAILY ATTENDANCE
 * 
 * ONE document per student per day
 * Inside it, store 14 attendance points (sessions)
 * 
 * Benefits:
 * - 1 student = 1 row per day (not 14 rows)
 * - For 500 students: 500 rows/day (not 7000 rows/day)
 * - Easy to update individual sessions
 * - Fast queries for reports and filtering
 * - Perfect for mobile UI
 * - Simple "missing attendance" queries
 */
const DailyAttendanceSchema = withTimestamps(new mongoose.Schema({
  attendanceDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  student: {
    type: oid,
    ref: 'Student',
    required: true
  },
  
  // ✅ 14 daily sessions stored INSIDE one document (not separate rows)
  // This is the optimal design: ONE document per student per day
  sessions: {
    prayer_morning: {
      status: {
        type: String,
        enum: ['Present', 'Absent', 'Sick', 'Leave'],
        default: 'Present'
      },
      timeMarked: Date,
      markedBy: {
        type: oid,
        ref: 'User'
      },
      notes: String
    },
    sandhya: {
      status: {
        type: String,
        enum: ['Present', 'Absent', 'Sick', 'Leave'],
        default: 'Present'
      },
      timeMarked: Date,
      markedBy: {
        type: oid,
        ref: 'User'
      },
      notes: String
    },
    yoga: {
      status: {
        type: String,
        enum: ['Present', 'Absent', 'Sick', 'Leave'],
        default: 'Present'
      },
      timeMarked: Date,
      markedBy: {
        type: oid,
        ref: 'User'
      },
      notes: String
    },
    service: {
      status: {
        type: String,
        enum: ['Present', 'Absent', 'Sick', 'Leave'],
        default: 'Present'
      },
      timeMarked: Date,
      markedBy: {
        type: oid,
        ref: 'User'
      },
      notes: String
    },
    breakfast: {
      status: {
        type: String,
        enum: ['Present', 'Absent', 'Sick', 'Leave'],
        default: 'Present'
      },
      timeMarked: Date,
      markedBy: {
        type: oid,
        ref: 'User'
      },
      notes: String
    },
    morning_class: {
      status: {
        type: String,
        enum: ['Present', 'Absent', 'Sick', 'Leave'],
        default: 'Present'
      },
      timeMarked: Date,
      markedBy: {
        type: oid,
        ref: 'User'
      },
      notes: String
    },
    midday_prayer: {
      status: {
        type: String,
        enum: ['Present', 'Absent', 'Sick', 'Leave'],
        default: 'Present'
      },
      timeMarked: Date,
      markedBy: {
        type: oid,
        ref: 'User'
      },
      notes: String
    },
    lunch: {
      status: {
        type: String,
        enum: ['Present', 'Absent', 'Sick', 'Leave'],
        default: 'Present'
      },
      timeMarked: Date,
      markedBy: {
        type: oid,
        ref: 'User'
      },
      notes: String
    },
    afternoon_class: {
      status: {
        type: String,
        enum: ['Present', 'Absent', 'Sick', 'Leave'],
        default: 'Present'
      },
      timeMarked: Date,
      markedBy: {
        type: oid,
        ref: 'User'
      },
      notes: String
    },
    evening_prayer: {
      status: {
        type: String,
        enum: ['Present', 'Absent', 'Sick', 'Leave'],
        default: 'Present'
      },
      timeMarked: Date,
      markedBy: {
        type: oid,
        ref: 'User'
      },
      notes: String
    },
    evening_study: {
      status: {
        type: String,
        enum: ['Present', 'Absent', 'Sick', 'Leave'],
        default: 'Present'
      },
      timeMarked: Date,
      markedBy: {
        type: oid,
        ref: 'User'
      },
      notes: String
    },
    dinner: {
      status: {
        type: String,
        enum: ['Present', 'Absent', 'Sick', 'Leave'],
        default: 'Present'
      },
      timeMarked: Date,
      markedBy: {
        type: oid,
        ref: 'User'
      },
      notes: String
    },
    night_prayer: {
      status: {
        type: String,
        enum: ['Present', 'Absent', 'Sick', 'Leave'],
        default: 'Present'
      },
      timeMarked: Date,
      markedBy: {
        type: oid,
        ref: 'User'
      },
      notes: String
    },
    bedtime: {
      status: {
        type: String,
        enum: ['Present', 'Absent', 'Sick', 'Leave'],
        default: 'Present'
      },
      timeMarked: Date,
      markedBy: {
        type: oid,
        ref: 'User'
      },
      notes: String
    }
  },
  
  // Overall attendance statistics
  overallStatus: {
    type: String,
    enum: ['Excellent', 'Good', 'Average', 'Poor', 'Critical'],
    default: 'Excellent'
  },
  
  // Calculated statistics
  statistics: {
    totalSessions: { type: Number, default: 14 },
    presentCount: { type: Number, default: 14 },
    absentCount: { type: Number, default: 0 },
    sickCount: { type: Number, default: 0 },
    leaveCount: { type: Number, default: 0 },
    attendancePercentage: { type: Number, default: 100 }
  },
  
  // Hostel-specific information
  hostelInfo: {
    roomNumber: String,
    floor: String,
    building: String,
    checkInTime: Date,
    checkOutTime: Date
  },
  
  // Special circumstances
  specialCircumstances: {
    type: String,
    enum: ['None', 'Medical', 'Family Emergency', 'Official Leave', 'Other'],
    default: 'None'
  },
  
  // Disciplinary notes
  disciplinaryNotes: String,
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  }
}));

// ✅ CRITICAL INDEXES FOR OPTIMAL PERFORMANCE
// Unique index ensures ONE document per student per day (prevents duplicates)
DailyAttendanceSchema.index({ 'student': 1, 'attendanceDate': 1 }, { unique: true });
DailyAttendanceSchema.index({ attendanceDate: 1 }); // Fast date queries
DailyAttendanceSchema.index({ student: 1 }); // Fast student queries
DailyAttendanceSchema.index({ isActive: 1 }); // Fast active records filter

// Pre-save middleware to calculate statistics
DailyAttendanceSchema.pre('save', function(next) {
  const sessionStatuses = Object.values(this.sessions).map(session => session.status);
  
  this.statistics.presentCount = sessionStatuses.filter(status => status === 'Present').length;
  this.statistics.absentCount = sessionStatuses.filter(status => status === 'Absent').length;
  this.statistics.sickCount = sessionStatuses.filter(status => status === 'Sick').length;
  this.statistics.leaveCount = sessionStatuses.filter(status => status === 'Leave').length;
  
  // Calculate attendance percentage
  this.statistics.attendancePercentage = Math.round((this.statistics.presentCount / this.statistics.totalSessions) * 100);
  
  // Determine overall status
  if (this.statistics.attendancePercentage >= 90) {
    this.overallStatus = 'Excellent';
  } else if (this.statistics.attendancePercentage >= 75) {
    this.overallStatus = 'Good';
  } else if (this.statistics.attendancePercentage >= 60) {
    this.overallStatus = 'Average';
  } else if (this.statistics.attendancePercentage >= 40) {
    this.overallStatus = 'Poor';
  } else {
    this.overallStatus = 'Critical';
  }
  
  next();
});

// Virtual for formatted date
DailyAttendanceSchema.virtual('formattedDate').get(function() {
  return this.attendanceDate.toLocaleDateString('en-IN');
});

// Virtual for day of week
DailyAttendanceSchema.virtual('dayOfWeek').get(function() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[this.attendanceDate.getDay()];
});

// Method to mark a specific session
DailyAttendanceSchema.methods.markSession = function(sessionKey, status, markedBy, notes = '') {
  if (this.sessions[sessionKey]) {
    this.sessions[sessionKey].status = status;
    this.sessions[sessionKey].timeMarked = new Date();
    this.sessions[sessionKey].markedBy = markedBy;
    this.sessions[sessionKey].notes = notes;
  }
  return this.save();
};

// Method to get session status
DailyAttendanceSchema.methods.getSessionStatus = function(sessionKey) {
  return this.sessions[sessionKey]?.status || 'Present';
};

// Method to get attendance summary
DailyAttendanceSchema.methods.getSummary = function() {
  return {
    date: this.attendanceDate,
    student: this.student,
    totalSessions: this.statistics.totalSessions,
    present: this.statistics.presentCount,
    absent: this.statistics.absentCount,
    sick: this.statistics.sickCount,
    leave: this.statistics.leaveCount,
    percentage: this.statistics.attendancePercentage,
    overallStatus: this.overallStatus
  };
};

// Static method to get attendance for a specific date
DailyAttendanceSchema.statics.getByDate = function(date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  return this.find({
    attendanceDate: { $gte: startOfDay, $lte: endOfDay },
    isActive: true
  }).populate('student', 'fullName admissionNo');
};

// Static method to get attendance for a student
DailyAttendanceSchema.statics.getByStudent = function(studentId, startDate, endDate) {
  const query = { student: studentId, isActive: true };
  
  if (startDate && endDate) {
    query.attendanceDate = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  
  return this.find(query).sort({ attendanceDate: -1 });
};

/**
 * ✅ BEST METHOD: Get missing attendance for today
 * Super easy query - just find students who don't have a record for today
 * This is why ONE document per student per day is the BEST design!
 */
DailyAttendanceSchema.statics.getMissingAttendanceForToday = async function(studentIds, today) {
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);
  
  // Find all students who HAVE attendance for today
  const studentsWithAttendance = await this.find({
    attendanceDate: { $gte: startOfDay, $lte: endOfDay },
    isActive: true
  }).distinct('student');
  
  // Return student IDs that DON'T have attendance (missing)
  return studentIds.filter(id => !studentsWithAttendance.some(attId => attId.toString() === id.toString()));
};

/**
 * ✅ Get attendance summary for a date (perfect for principal dashboard)
 * Returns: total students, present count, absent count, missing count
 */
DailyAttendanceSchema.statics.getAttendanceSummary = async function(date, totalStudents) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const attendanceRecords = await this.find({
    attendanceDate: { $gte: startOfDay, $lte: endOfDay },
    isActive: true
  });
  
  const presentCount = attendanceRecords.filter(record => 
    record.statistics.presentCount > 0
  ).length;
  
  const absentCount = attendanceRecords.filter(record => 
    record.statistics.presentCount === 0 && record.statistics.absentCount > 0
  ).length;
  
  const missingCount = totalStudents - attendanceRecords.length;
  
  return {
    totalStudents,
    presentCount,
    absentCount,
    missingCount,
    attendanceRecords: attendanceRecords.length,
    attendancePercentage: totalStudents > 0 ? Math.round((attendanceRecords.length / totalStudents) * 100) : 0
  };
};

export default mongoose.model('DailyAttendance', DailyAttendanceSchema); 