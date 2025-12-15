import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
import { withTimestamps, oid } from './_base.js';

const SubjectClassSchema = withTimestamps(new mongoose.Schema({
  className: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  
  subject: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  
  // Teacher who created/manages this class
  classTeacher: {
    type: oid,
    ref: 'User',
    required: true
  },
  
  // Additional teachers who can access this class
  additionalTeachers: [{
    teacher: { type: oid, ref: 'User' },
    role: {
      type: String,
      enum: ['co-teacher', 'assistant', 'substitute'],
      default: 'co-teacher'
    },
    permissions: {
      canTakeAttendance: { type: Boolean, default: true },
      canEditClass: { type: Boolean, default: false },
      canViewReports: { type: Boolean, default: true }
    },
    addedAt: { type: Date, default: Date.now }
  }],
  
  // Flexible student enrollment - can be from any department/batch combination
  students: [{
    student: { type: oid, ref: 'Student', required: true },
    enrollmentDate: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['active', 'inactive', 'dropped', 'transferred'],
      default: 'active'
    },
    // Track which academic entity this student belongs to in this class
    academicSource: {
      department: { type: oid, ref: 'Department' },
      subDepartment: { type: oid, ref: 'SubDepartment' },
      batch: { type: oid, ref: 'Batch' }
    },
    // Class-specific student information
    rollNumber: String,
    seatNumber: String,
    notes: String
  }],
  
  // Class schedule and timing
  schedule: {
    dayOfWeek: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }],
    startTime: String, // Format: "HH:mm"
    endTime: String,   // Format: "HH:mm"
    duration: Number,  // in minutes
    room: String,
    building: String
  },
  
  // Academic term information
  academicInfo: {
    academicYear: {
      type: String,
      required: true,
      match: /^\d{4}-\d{4}$/
    },
    term: {
      type: String,
      enum: ['spring', 'summer', 'fall', 'winter', 'annual'],
      default: 'annual'
    },
    semester: {
      type: Number,
      min: 1,
      max: 8
    },
    credits: {
      type: Number,
      min: 0,
      max: 10,
      default: 1
    }
  },
  
  // Class settings and rules
  settings: {
    attendanceRequired: { type: Boolean, default: true },
    minimumAttendancePercentage: { type: Number, min: 0, max: 100, default: 75 },
    allowLateEntry: { type: Boolean, default: false },
    lateEntryGracePeriod: { type: Number, default: 10 }, // minutes
    autoMarkAbsent: { type: Boolean, default: false },
    autoMarkAbsentAfter: { type: Number, default: 30 }, // minutes
    enableNotifications: { type: Boolean, default: true }
  },
  
  // Class statistics (computed)
  statistics: {
    totalStudents: { type: Number, default: 0 },
    activeStudents: { type: Number, default: 0 },
    totalSessions: { type: Number, default: 0 },
    averageAttendance: { type: Number, default: 0 },
    lastSessionDate: Date
  },
  
  // Administrative fields
  status: {
    type: String,
    enum: ['active', 'inactive', 'completed', 'cancelled'],
    default: 'active'
  },
  
  visibility: {
    type: String,
    enum: ['public', 'private', 'department-only'],
    default: 'public'
  },
  
  // Audit trail
  createdBy: { type: oid, ref: 'User', required: true },
  lastModifiedBy: { type: oid, ref: 'User' },
  
  // Archive/soft delete
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedBy: { type: oid, ref: 'User' }
}));

// Indexes for performance
SubjectClassSchema.index({ classTeacher: 1, status: 1 });
SubjectClassSchema.index({ subject: 1, 'academicInfo.academicYear': 1 });
SubjectClassSchema.index({ 'students.student': 1, status: 1 });
SubjectClassSchema.index({ createdAt: -1 });
SubjectClassSchema.index({ className: 'text', subject: 'text', description: 'text' });

// Compound index for unique class per teacher per academic year
SubjectClassSchema.index({ 
  classTeacher: 1, 
  className: 1, 
  subject: 1,
  'academicInfo.academicYear': 1 
}, { unique: true });

// Virtual fields
SubjectClassSchema.virtual('activeStudentsList').get(function() {
  const studentsArray = Array.isArray(this.students) ? this.students : [];
  return studentsArray.filter(s => s.status === 'active');
});

SubjectClassSchema.virtual('studentCount').get(function() {
  const studentsArray = Array.isArray(this.students) ? this.students : [];
  return studentsArray.filter(s => s.status === 'active').length;
});

SubjectClassSchema.virtual('allTeachers').get(function() {
  const teachers = [this.classTeacher];
  this.additionalTeachers.forEach(at => teachers.push(at.teacher));
  return teachers;
});

SubjectClassSchema.virtual('fullClassName').get(function() {
  return `${this.subject} - ${this.className}`;
});

// Pre-save middleware to update statistics
SubjectClassSchema.pre('save', function(next) {
  // Update student counts
  this.statistics.totalStudents = this.students.length;
  this.statistics.activeStudents = this.students.filter(s => s.status === 'active').length;
  
  next();
});

// Instance methods
SubjectClassSchema.methods.addStudent = function(studentId, academicSource = {}, additionalInfo = {}) {
  // Check if student already exists
  const existingStudent = this.students.find(s => 
    s.student.toString() === studentId.toString() && s.status === 'active'
  );
  
  if (existingStudent) {
    throw new Error('Student is already enrolled in this class');
  }
  
  this.students.push({
    student: studentId,
    academicSource,
    ...additionalInfo,
    status: 'active',
    enrollmentDate: new Date()
  });
  
  return this.save();
};

SubjectClassSchema.methods.removeStudent = function(studentId, reason = 'dropped') {
  const studentIndex = this.students.findIndex(s => 
    s.student.toString() === studentId.toString() && s.status === 'active'
  );
  
  if (studentIndex === -1) {
    throw new Error('Student not found in this class');
  }
  
  this.students[studentIndex].status = reason;
  this.students[studentIndex].droppedAt = new Date();
  
  return this.save();
};

SubjectClassSchema.methods.addTeacher = function(teacherId, role = 'co-teacher', permissions = {}) {
  // Check if teacher already exists
  const existingTeacher = this.additionalTeachers.find(t => 
    t.teacher.toString() === teacherId.toString()
  );
  
  if (existingTeacher) {
    throw new Error('Teacher is already assigned to this class');
  }
  
  const defaultPermissions = {
    canTakeAttendance: true,
    canEditClass: false,
    canViewReports: true
  };
  
  this.additionalTeachers.push({
    teacher: teacherId,
    role,
    permissions: { ...defaultPermissions, ...permissions },
    addedAt: new Date()
  });
  
  return this.save();
};

SubjectClassSchema.methods.canAccessClass = function(userId, permission = 'view') {
  // Check if user is the main class teacher
  if (this.classTeacher.toString() === userId.toString()) {
    return true;
  }
  
  // Check if user is an additional teacher with required permissions
  const additionalTeacher = this.additionalTeachers.find(t => 
    t.teacher.toString() === userId.toString()
  );
  
  if (additionalTeacher) {
    switch (permission) {
      case 'view':
        return true;
      case 'takeAttendance':
        return additionalTeacher.permissions.canTakeAttendance;
      case 'edit':
        return additionalTeacher.permissions.canEditClass;
      case 'viewReports':
        return additionalTeacher.permissions.canViewReports;
      default:
        return false;
    }
  }
  
  return false;
};

SubjectClassSchema.methods.getStudentsBySource = function() {
  const grouped = {
    departments: {},
    subDepartments: {},
    batches: {},
    mixed: []
  };
  
  this.students.filter(s => s.status === 'active').forEach(student => {
    const source = student.academicSource;
    
    if (source.department) {
      if (!grouped.departments[source.department]) {
        grouped.departments[source.department] = [];
      }
      grouped.departments[source.department].push(student);
    }
    
    if (source.subDepartment) {
      if (!grouped.subDepartments[source.subDepartment]) {
        grouped.subDepartments[source.subDepartment] = [];
      }
      grouped.subDepartments[source.subDepartment].push(student);
    }
    
    if (source.batch) {
      if (!grouped.batches[source.batch]) {
        grouped.batches[source.batch] = [];
      }
      grouped.batches[source.batch].push(student);
    }
    
    if (!source.department && !source.subDepartment && !source.batch) {
      grouped.mixed.push(student);
    }
  });
  
  return grouped;
};

// Static methods
SubjectClassSchema.statics.findByTeacher = function(teacherId, status = 'active') {
  return this.find({
    $or: [
      { classTeacher: teacherId },
      { 'additionalTeachers.teacher': teacherId }
    ],
    status,
    isDeleted: false
  }).populate('classTeacher additionalTeachers.teacher students.student');
};

SubjectClassSchema.statics.findByStudent = function(studentId, status = 'active') {
  return this.find({
    'students.student': studentId,
    'students.status': 'active',
    status,
    isDeleted: false
  }).populate('classTeacher additionalTeachers.teacher');
};

SubjectClassSchema.statics.findAvailableForEnrollment = function(academicYear) {
  return this.find({
    status: 'active',
    'academicInfo.academicYear': academicYear,
    isDeleted: false
  }).populate('classTeacher');
};

SubjectClassSchema.statics.searchClasses = function(query, filters = {}) {
  const searchQuery = {
    $text: { $search: query },
    status: filters.status || 'active',
    isDeleted: false
  };
  
  if (filters.academicYear) {
    searchQuery['academicInfo.academicYear'] = filters.academicYear;
  }
  
  if (filters.subject) {
    searchQuery.subject = new RegExp(filters.subject, 'i');
  }
  
  if (filters.teacher) {
    searchQuery.$or = [
      { classTeacher: filters.teacher },
      { 'additionalTeachers.teacher': filters.teacher }
    ];
  }
  
  return this.find(searchQuery)
    .sort({ score: { $meta: 'textScore' } })
    .populate('classTeacher additionalTeachers.teacher');
};

// Transform for JSON output
SubjectClassSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

// Add pagination plugin
SubjectClassSchema.plugin(mongoosePaginate);

export default mongoose.model('SubjectClass', SubjectClassSchema); 