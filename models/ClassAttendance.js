import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
import { withTimestamps, oid } from './_base.js';

const ClassAttendanceSchema = withTimestamps(new mongoose.Schema({
  // Session identification
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  
  // Reference to the subject class
  subjectClass: {
    type: oid,
    ref: 'SubjectClass',
    required: true
  },
  
  // Session details
  sessionDate: {
    type: Date,
    required: true
  },
  
  sessionStartTime: {
    type: String, // Format: "HH:mm"
    required: true
  },
  
  sessionEndTime: {
    type: String, // Format: "HH:mm"
    required: true
  },
  
  // Session information
  sessionInfo: {
    topic: {
      type: String,
      trim: true,
      maxlength: 200
    },
    sessionType: {
      type: String,
      enum: ['lecture', 'practical', 'tutorial', 'exam', 'assignment', 'discussion', 'field-work'],
      default: 'lecture'
    },
    duration: { // in minutes
      type: Number,
      required: true
    },
    venue: {
      room: String,
      building: String,
      type: {
        type: String,
        enum: ['classroom', 'laboratory', 'library', 'auditorium', 'online', 'outdoor']
      }
    }
  },
  
  // Teacher conducting the session
  conductedBy: {
    type: oid,
    ref: 'User',
    required: true
  },
  
  // Additional staff present
  additionalStaff: [{
    staff: { type: oid, ref: 'User' },
    role: {
      type: String,
      enum: ['co-teacher', 'assistant', 'observer', 'substitute']
    }
  }],
  
  // Student attendance records
  attendance: [{
    student: {
      type: oid,
      ref: 'Student',
      required: true
    },
    
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'excused', 'left-early'],
      required: true
    },
    
    // Timing details
    arrivalTime: String, // "HH:mm" - when student arrived
    departureTime: String, // "HH:mm" - when student left (for left-early)
    
    // Late arrival details
    lateBy: Number, // minutes late
    lateReason: String,
    
    // Absence details
    absenceReason: {
      type: String,
      enum: ['sick', 'personal', 'family-emergency', 'medical-appointment', 'sports', 'cultural-activity', 'excused', 'unauthorized']
    },
    absenceNote: String,
    
    // Excuse/Leave details
    excuseApprovedBy: { type: oid, ref: 'User' },
    excuseNote: String,
    
    // Participation and behavior
    participation: {
      type: String,
      enum: ['excellent', 'good', 'average', 'poor', 'disruptive'],
      default: 'average'
    },
    
    behaviorNotes: String,
    
    // Marking details
    markedAt: {
      type: Date,
      default: Date.now
    },
    markedBy: {
      type: oid,
      ref: 'User',
      required: true
    },
    
    // Revision history
    revisions: [{
      previousStatus: String,
      newStatus: String,
      reason: String,
      changedBy: { type: oid, ref: 'User' },
      changedAt: { type: Date, default: Date.now }
    }]
  }],
  
  // Session statistics
  statistics: {
    totalStudents: { type: Number, default: 0 },
    presentCount: { type: Number, default: 0 },
    absentCount: { type: Number, default: 0 },
    lateCount: { type: Number, default: 0 },
    excusedCount: { type: Number, default: 0 },
    leftEarlyCount: { type: Number, default: 0 },
    attendancePercentage: { type: Number, default: 0 }
  },
  
  // Session notes and observations
  sessionNotes: {
    teacherNotes: String,
    administrativeNotes: String,
    technicalIssues: String,
    studentFeedback: String
  },
  
  // Session status
  sessionStatus: {
    type: String,
    enum: ['scheduled', 'ongoing', 'completed', 'cancelled', 'postponed', 'holiday', 'teacher-leave'],
    default: 'scheduled'
  },
  
  // Leave/Holiday information
  leaveInfo: {
    isHoliday: { type: Boolean, default: false },
    isTeacherLeave: { type: Boolean, default: false },
    leaveType: {
      type: String,
      enum: ['holiday', 'teacher-leave', 'institutional-holiday', 'emergency-closure'],
      default: 'holiday'
    },
    leaveReason: String,
    holidayName: String,
    substituteTeacher: { type: oid, ref: 'User' }
  },
  
  // Attendance marking details
  attendanceMarking: {
    startedAt: Date,
    completedAt: Date,
    markedBy: { type: oid, ref: 'User' },
    method: {
      type: String,
      enum: ['manual', 'rfid', 'mobile-app', 'biometric', 'qr-code'],
      default: 'manual'
    },
    isFinalized: { type: Boolean, default: false },
    finalizedAt: Date,
    finalizedBy: { type: oid, ref: 'User' }
  },
  
  // Academic context
  academicInfo: {
    academicYear: {
      type: String,
      required: true,
      match: /^\d{4}-\d{4}$/
    },
    term: String,
    week: Number,
    sessionNumber: Number // Sequential number for this class
  },
  
  // Weather and external factors (optional)
  externalFactors: {
    weather: String,
    specialEvents: [String],
    holidays: [String],
    disruptions: String
  },
  
  // Audit trail
  createdBy: { type: oid, ref: 'User', required: true },
  lastModifiedBy: { type: oid, ref: 'User' },
  
  // Soft delete
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedBy: { type: oid, ref: 'User' }
}));

// Indexes for performance
ClassAttendanceSchema.index({ subjectClass: 1, sessionDate: -1 });
ClassAttendanceSchema.index({ sessionDate: 1, conductedBy: 1 });
ClassAttendanceSchema.index({ 'attendance.student': 1, sessionDate: -1 });
// Note: sessionId index is automatically created by unique: true in schema
ClassAttendanceSchema.index({ 'academicInfo.academicYear': 1, sessionDate: -1 });

// Compound index for efficient queries
ClassAttendanceSchema.index({ 
  subjectClass: 1, 
  'academicInfo.academicYear': 1, 
  sessionDate: -1 
});

// Virtual fields
ClassAttendanceSchema.virtual('sessionDuration').get(function() {
  if (!this.sessionStartTime || !this.sessionEndTime) return 0;
  
  const start = this.sessionStartTime.split(':');
  const end = this.sessionEndTime.split(':');
  
  const startMinutes = parseInt(start[0]) * 60 + parseInt(start[1]);
  const endMinutes = parseInt(end[0]) * 60 + parseInt(end[1]);
  
  return endMinutes - startMinutes;
});

ClassAttendanceSchema.virtual('isOngoing').get(function() {
  const now = new Date();
  const sessionDate = new Date(this.sessionDate);
  
  // Check if it's the same date and within session time
  if (sessionDate.toDateString() !== now.toDateString()) {
    return false;
  }
  
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  return currentTime >= this.sessionStartTime && currentTime <= this.sessionEndTime;
});

ClassAttendanceSchema.virtual('hasStarted').get(function() {
  const now = new Date();
  const sessionDate = new Date(this.sessionDate);
  
  if (sessionDate.toDateString() !== now.toDateString()) {
    return sessionDate < now;
  }
  
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  return currentTime >= this.sessionStartTime;
});

// Pre-save middleware to calculate statistics
ClassAttendanceSchema.pre('save', function(next) {
  if (this.isModified('attendance')) {
    this.statistics.totalStudents = this.attendance.length;
    this.statistics.presentCount = this.attendance.filter(a => a.status === 'present').length;
    this.statistics.absentCount = this.attendance.filter(a => a.status === 'absent').length;
    this.statistics.lateCount = this.attendance.filter(a => a.status === 'late').length;
    this.statistics.excusedCount = this.attendance.filter(a => a.status === 'excused').length;
    this.statistics.leftEarlyCount = this.attendance.filter(a => a.status === 'left-early').length;
    
    if (this.statistics.totalStudents > 0) {
      this.statistics.attendancePercentage = Math.round(
        ((this.statistics.presentCount + this.statistics.lateCount) / this.statistics.totalStudents) * 100
      );
    }
  }
  
  next();
});

// Instance methods
ClassAttendanceSchema.methods.markStudentAttendance = function(studentId, status, details = {}) {
  const attendanceIndex = this.attendance.findIndex(a => 
    a.student.toString() === studentId.toString()
  );
  
  if (attendanceIndex === -1) {
    throw new Error('Student not found in this session');
  }
  
  const currentRecord = this.attendance[attendanceIndex];
  
  // Add to revision history if status is changing
  if (currentRecord.status !== status) {
    currentRecord.revisions.push({
      previousStatus: currentRecord.status,
      newStatus: status,
      reason: details.reason || 'Status updated',
      changedBy: details.markedBy,
      changedAt: new Date()
    });
  }
  
  // Update attendance record
  Object.assign(currentRecord, {
    status,
    markedAt: new Date(),
    markedBy: details.markedBy,
    ...details
  });
  
  return this.save();
};

ClassAttendanceSchema.methods.markBulkAttendance = function(attendanceData, markedBy) {
  attendanceData.forEach(({ studentId, status, details = {} }) => {
    const attendanceIndex = this.attendance.findIndex(a => 
      a.student.toString() === studentId.toString()
    );
    
    if (attendanceIndex !== -1) {
      const currentRecord = this.attendance[attendanceIndex];
      
      // Add to revision history if status is changing
      if (currentRecord.status !== status) {
        currentRecord.revisions.push({
          previousStatus: currentRecord.status,
          newStatus: status,
          reason: details.reason || 'Bulk attendance update',
          changedBy: markedBy,
          changedAt: new Date()
        });
      }
      
      Object.assign(currentRecord, {
        status,
        markedAt: new Date(),
        markedBy,
        ...details
      });
    }
  });
  
  return this.save();
};

ClassAttendanceSchema.methods.finalizeAttendance = function(finalizedBy) {
  this.attendanceMarking.isFinalized = true;
  this.attendanceMarking.finalizedAt = new Date();
  this.attendanceMarking.finalizedBy = finalizedBy;
  this.sessionStatus = 'completed';
  
  return this.save();
};

ClassAttendanceSchema.methods.getAttendanceSummary = function() {
  return {
    sessionInfo: {
      id: this.sessionId,
      date: this.sessionDate,
      startTime: this.sessionStartTime,
      endTime: this.sessionEndTime,
      topic: this.sessionInfo.topic,
      type: this.sessionInfo.sessionType
    },
    statistics: this.statistics,
    isFinalized: this.attendanceMarking.isFinalized,
    sessionStatus: this.sessionStatus
  };
};

// Static methods
ClassAttendanceSchema.statics.generateSessionId = function(subjectClassId, sessionDate) {
  const date = new Date(sessionDate);
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  return `${subjectClassId}_${dateStr}_${Date.now()}`;
};

ClassAttendanceSchema.statics.findByClass = function(subjectClassId, options = {}) {
  const query = { subjectClass: subjectClassId, isDeleted: false };
  
  if (options.startDate && options.endDate) {
    query.sessionDate = {
      $gte: new Date(options.startDate),
      $lte: new Date(options.endDate)
    };
  }
  
  if (options.academicYear) {
    query['academicInfo.academicYear'] = options.academicYear;
  }
  
  return this.find(query)
    .sort({ sessionDate: -1 })
    .populate('conductedBy additionalStaff.staff attendance.student')
    .limit(options.limit || 50);
};

ClassAttendanceSchema.statics.findByStudent = function(studentId, options = {}) {
  const query = { 
    'attendance.student': studentId,
    isDeleted: false 
  };
  
  if (options.startDate && options.endDate) {
    query.sessionDate = {
      $gte: new Date(options.startDate),
      $lte: new Date(options.endDate)
    };
  }
  
  if (options.subjectClass) {
    query.subjectClass = options.subjectClass;
  }
  
  return this.find(query)
    .sort({ sessionDate: -1 })
    .populate('subjectClass conductedBy')
    .limit(options.limit || 100);
};

ClassAttendanceSchema.statics.getAttendanceReport = function(filters = {}) {
  const pipeline = [
    { $match: { isDeleted: false, ...filters } },
    {
      $group: {
        _id: {
          subjectClass: '$subjectClass',
          student: '$attendance.student'
        },
        totalSessions: { $sum: 1 },
        presentSessions: {
          $sum: {
            $cond: [
              { $in: ['$attendance.status', ['present', 'late']] },
              1, 0
            ]
          }
        },
        absentSessions: {
          $sum: {
            $cond: [{ $eq: ['$attendance.status', 'absent'] }, 1, 0]
          }
        }
      }
    },
    {
      $addFields: {
        attendancePercentage: {
          $round: [
            { $multiply: [{ $divide: ['$presentSessions', '$totalSessions'] }, 100] },
            2
          ]
        }
      }
    }
  ];
  
  return this.aggregate(pipeline);
};

// Transform for JSON output
ClassAttendanceSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

// Add pagination plugin
ClassAttendanceSchema.plugin(mongoosePaginate);

export default mongoose.model('ClassAttendance', ClassAttendanceSchema); 