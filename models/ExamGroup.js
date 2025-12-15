import mongoose from 'mongoose';
import { withTimestamps, oid } from './_base.js';

const ExamGroupSchema = withTimestamps(new mongoose.Schema({
  groupId: {
    type: String,
    required: true,
    unique: true
  },
  
  // Reference to the main exam
  exam: {
    type: oid,
    ref: 'Exam',
    required: true
  },
  
  groupName: {
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
  
  // Student selection criteria and members
  studentSelection: {
    // Selection method
    selectionType: {
      type: String,
      enum: ['manual', 'by-department', 'by-subdepartment', 'by-batch', 'mixed', 'all'],
      required: true
    },
    
    // Academic entity filters (for automatic selection)
    academicFilters: {
      departments: [{ type: oid, ref: 'Department' }],
      subDepartments: [{ type: oid, ref: 'SubDepartment' }],
      batches: [{ type: oid, ref: 'Batch' }],
      academicYear: String,
      semester: Number
    },
    
    // Additional filters
    filters: {
      minAttendancePercentage: Number,
      onlyActiveStudents: { type: Boolean, default: true },
      excludeStudents: [{ type: oid, ref: 'Student' }], // Students to exclude
      includeStudents: [{ type: oid, ref: 'Student' }]  // Students to force include
    }
  },
  
  // Actual student members in this group
  students: [{
    student: { type: oid, ref: 'Student', required: true },
    rollNumber: String, // Exam-specific roll number
    seatNumber: String, // Exam hall seat number
    
    status: {
      type: String,
      enum: ['active', 'inactive', 'transferred', 'exempted'],
      default: 'active'
    },
    
    // Student-specific exam details
    examDetails: {
      isEligible: { type: Boolean, default: true },
      eligibilityReason: String,
      accommodations: [String], // Special accommodations needed
      previousAttempts: { type: Number, default: 0 },
      isRetake: { type: Boolean, default: false }
    },
    
    addedAt: { type: Date, default: Date.now },
    addedBy: { type: oid, ref: 'User' },
    
    // Academic source (where student came from)
    academicSource: {
      department: { type: oid, ref: 'Department' },
      subDepartment: { type: oid, ref: 'SubDepartment' },
      batch: { type: oid, ref: 'Batch' }
    }
  }],
  
  // Teacher assignments for this group
  assignedTeachers: [{
    teacher: { type: oid, ref: 'User', required: true },
    
    role: {
      type: String,
      enum: ['primary-examiner', 'co-examiner', 'moderator', 'external-examiner', 'practical-examiner'],
      default: 'primary-examiner'
    },
    
    // Marking responsibilities
    markingResponsibility: {
      canEnterMarks: { type: Boolean, default: true },
      canModifyMarks: { type: Boolean, default: true },
      canFinalizeMarks: { type: Boolean, default: false },
      
      // Component-wise marking assignment
      assignedComponents: [String], // Which exam components this teacher marks
      markingPercentage: Number,     // Percentage of total marks this teacher is responsible for
      
      // Marking constraints
      maxMarksPerComponent: Number,
      requiresModeration: { type: Boolean, default: false },
      moderatedBy: { type: oid, ref: 'User' }
    },
    
    assignment: {
      assignedBy: { type: oid, ref: 'User', required: true },
      assignedAt: { type: Date, default: Date.now },
      
      effectiveFrom: Date,
      effectiveTo: Date,
      
      isActive: { type: Boolean, default: true },
      deactivatedAt: Date,
      deactivatedBy: { type: oid, ref: 'User' },
      deactivationReason: String
    },
    
    // Teacher-specific settings
    settings: {
      allowBulkMarking: { type: Boolean, default: true },
      requiresDoubleEntry: { type: Boolean, default: false },
      autoSaveEnabled: { type: Boolean, default: true },
      markingDeadline: Date
    }
  }],
  
  // Group-specific exam settings
  groupSettings: {
    // Venue and timing (can override exam defaults)
    venue: {
      room: String,
      building: String,
      hall: String,
      capacity: Number,
      seatingArrangement: String
    },
    
    schedule: {
      startDate: Date,
      endDate: Date,
      startTime: String,
      endTime: String,
      
      // Different sessions for this group
      sessions: [{
        sessionName: String,
        date: Date,
        startTime: String,
        endTime: String,
        venue: String,
        invigilators: [{ type: oid, ref: 'User' }]
      }]
    },
    
    // Marks configuration (can override exam defaults)
    marksOverride: {
      customTotalMarks: Number,
      customPassingMarks: Number,
      customGradeBoundaries: [{
        grade: String,
        minMarks: Number,
        maxMarks: Number
      }],
      
      // Component-wise marks for this group
      components: [{
        name: String,
        maxMarks: Number,
        assignedTeacher: { type: oid, ref: 'User' }
      }]
    },
    
    // Special rules for this group
    specialRules: {
      allowLateSubmission: Boolean,
      lateSubmissionPenalty: Number,
      allowMakeupExam: Boolean,
      requiresSpecialSupervision: Boolean,
      additionalTime: Number, // Extra minutes allowed
      specialInstructions: [String]
    }
  },
  
  // Group statistics
  statistics: {
    totalStudents: { type: Number, default: 0 },
    activeStudents: { type: Number, default: 0 },
    eligibleStudents: { type: Number, default: 0 },
    
    assignedTeachers: { type: Number, default: 0 },
    marksEntryProgress: { type: Number, default: 0 }, // Percentage
    
    // Results statistics
    studentsAppeared: { type: Number, default: 0 },
    studentsAbsent: { type: Number, default: 0 },
    averageMarks: { type: Number, default: 0 },
    passPercentage: { type: Number, default: 0 }
  },
  
  // Group status
  status: {
    type: String,
    enum: ['draft', 'finalized', 'active', 'completed', 'cancelled'],
    default: 'draft'
  },
  
  // Workflow tracking
  workflow: {
    isStudentListFinalized: { type: Boolean, default: false },
    finalizedBy: { type: oid, ref: 'User' },
    finalizedAt: Date,
    
    isTeacherAssignmentComplete: { type: Boolean, default: false },
    assignmentCompletedBy: { type: oid, ref: 'User' },
    assignmentCompletedAt: Date,
    
    isMarksEntryStarted: { type: Boolean, default: false },
    marksEntryStartedAt: Date,
    
    isMarksEntryCompleted: { type: Boolean, default: false },
    marksEntryCompletedAt: Date,
    marksEntryCompletedBy: { type: oid, ref: 'User' }
  },
  
  // Administrative fields
  createdBy: { type: oid, ref: 'User', required: true },
  lastModifiedBy: { type: oid, ref: 'User' },
  
  // Archive/soft delete
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedBy: { type: oid, ref: 'User' }
}));

// Indexes for performance
// Note: groupId index is automatically created by unique: true in schema
ExamGroupSchema.index({ exam: 1, status: 1 });
ExamGroupSchema.index({ 'students.student': 1 });
ExamGroupSchema.index({ 'assignedTeachers.teacher': 1 });
ExamGroupSchema.index({ groupName: 'text', description: 'text' });

// Compound index for exam and status
ExamGroupSchema.index({ exam: 1, status: 1, isDeleted: 1 });

// Virtual fields
ExamGroupSchema.virtual('activeStudentsList').get(function() {
  return this.students.filter(s => s.status === 'active');
});

ExamGroupSchema.virtual('eligibleStudentsList').get(function() {
  return this.students.filter(s => s.status === 'active' && s.examDetails.isEligible);
});

ExamGroupSchema.virtual('activeTeachersList').get(function() {
  return this.assignedTeachers.filter(t => t.assignment.isActive);
});

ExamGroupSchema.virtual('primaryExaminer').get(function() {
  return this.assignedTeachers.find(t => 
    t.role === 'primary-examiner' && t.assignment.isActive
  );
});

ExamGroupSchema.virtual('studentCount').get(function() {
  return this.students.filter(s => s.status === 'active').length;
});

ExamGroupSchema.virtual('teacherCount').get(function() {
  return this.assignedTeachers.filter(t => t.assignment.isActive).length;
});

// Pre-save middleware to update statistics
ExamGroupSchema.pre('save', function(next) {
  // Update student counts
  this.statistics.totalStudents = this.students.length;
  this.statistics.activeStudents = this.students.filter(s => s.status === 'active').length;
  this.statistics.eligibleStudents = this.students.filter(s => 
    s.status === 'active' && s.examDetails.isEligible
  ).length;
  
  // Update teacher count
  this.statistics.assignedTeachers = this.assignedTeachers.filter(t => 
    t.assignment.isActive
  ).length;
  
  next();
});

// Instance methods
ExamGroupSchema.methods.addStudent = function(studentId, examDetails = {}, academicSource = {}, addedBy) {
  // Check if student already exists
  const existingStudent = this.students.find(s => 
    s.student.toString() === studentId.toString() && s.status === 'active'
  );
  
  if (existingStudent) {
    throw new Error('Student is already in this exam group');
  }
  
  // Generate roll number if not provided
  const rollNumber = examDetails.rollNumber || this.generateRollNumber();
  
  this.students.push({
    student: studentId,
    rollNumber,
    seatNumber: examDetails.seatNumber,
    status: 'active',
    examDetails: {
      isEligible: true,
      previousAttempts: 0,
      isRetake: false,
      ...examDetails
    },
    academicSource,
    addedBy,
    addedAt: new Date()
  });
  
  return this.save();
};

ExamGroupSchema.methods.removeStudent = function(studentId, reason = 'transferred') {
  const studentIndex = this.students.findIndex(s => 
    s.student.toString() === studentId.toString() && s.status === 'active'
  );
  
  if (studentIndex === -1) {
    throw new Error('Student not found in this exam group');
  }
  
  this.students[studentIndex].status = reason;
  
  return this.save();
};

ExamGroupSchema.methods.assignTeacher = function(teacherId, role = 'primary-examiner', markingResponsibility = {}, assignedBy) {
  // Check if teacher already exists with this role
  const existingTeacher = this.assignedTeachers.find(t => 
    t.teacher.toString() === teacherId.toString() && 
    t.role === role && 
    t.assignment.isActive
  );
  
  if (existingTeacher) {
    throw new Error(`Teacher is already assigned as ${role} for this exam group`);
  }
  
  const defaultMarkingResponsibility = {
    canEnterMarks: true,
    canModifyMarks: true,
    canFinalizeMarks: role === 'primary-examiner',
    requiresModeration: role === 'external-examiner',
    ...markingResponsibility
  };
  
  this.assignedTeachers.push({
    teacher: teacherId,
    role,
    markingResponsibility: defaultMarkingResponsibility,
    assignment: {
      assignedBy,
      assignedAt: new Date(),
      isActive: true
    },
    settings: {
      allowBulkMarking: true,
      requiresDoubleEntry: false,
      autoSaveEnabled: true
    }
  });
  
  return this.save();
};

ExamGroupSchema.methods.unassignTeacher = function(teacherId, role, unassignedBy, reason = 'Reassigned') {
  const teacherIndex = this.assignedTeachers.findIndex(t => 
    t.teacher.toString() === teacherId.toString() && 
    t.role === role && 
    t.assignment.isActive
  );
  
  if (teacherIndex === -1) {
    throw new Error('Teacher assignment not found');
  }
  
  this.assignedTeachers[teacherIndex].assignment.isActive = false;
  this.assignedTeachers[teacherIndex].assignment.deactivatedAt = new Date();
  this.assignedTeachers[teacherIndex].assignment.deactivatedBy = unassignedBy;
  this.assignedTeachers[teacherIndex].assignment.deactivationReason = reason;
  
  return this.save();
};

ExamGroupSchema.methods.canTeacherEnterMarks = function(teacherId) {
  const teacher = this.assignedTeachers.find(t => 
    t.teacher.toString() === teacherId.toString() && 
    t.assignment.isActive
  );
  
  return teacher && teacher.markingResponsibility.canEnterMarks;
};

ExamGroupSchema.methods.canTeacherModifyMarks = function(teacherId) {
  const teacher = this.assignedTeachers.find(t => 
    t.teacher.toString() === teacherId.toString() && 
    t.assignment.isActive
  );
  
  return teacher && teacher.markingResponsibility.canModifyMarks;
};

ExamGroupSchema.methods.generateRollNumber = function() {
  const nextNumber = this.students.length + 1;
  return `${this.groupId}-${nextNumber.toString().padStart(3, '0')}`;
};

ExamGroupSchema.methods.finalizeStudentList = function(finalizedBy) {
  this.workflow.isStudentListFinalized = true;
  this.workflow.finalizedBy = finalizedBy;
  this.workflow.finalizedAt = new Date();
  this.status = 'finalized';
  
  return this.save();
};

ExamGroupSchema.methods.completeTeacherAssignment = function(completedBy) {
  this.workflow.isTeacherAssignmentComplete = true;
  this.workflow.assignmentCompletedBy = completedBy;
  this.workflow.assignmentCompletedAt = new Date();
  
  if (this.workflow.isStudentListFinalized) {
    this.status = 'active';
  }
  
  return this.save();
};

ExamGroupSchema.methods.startMarksEntry = function() {
  this.workflow.isMarksEntryStarted = true;
  this.workflow.marksEntryStartedAt = new Date();
  
  return this.save();
};

ExamGroupSchema.methods.completeMarksEntry = function(completedBy) {
  this.workflow.isMarksEntryCompleted = true;
  this.workflow.marksEntryCompletedAt = new Date();
  this.workflow.marksEntryCompletedBy = completedBy;
  this.status = 'completed';
  
  return this.save();
};

ExamGroupSchema.methods.getStudentsBySource = function() {
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
ExamGroupSchema.statics.generateGroupId = function(examId, groupName) {
  const cleanName = groupName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const timestamp = Date.now().toString(36);
  return `${examId}_${cleanName}_${timestamp}`.toUpperCase();
};

ExamGroupSchema.statics.findByExam = function(examId, status = null) {
  const query = { exam: examId, isDeleted: false };
  if (status) query.status = status;
  
  return this.find(query)
    .populate('students.student', 'personalInfo.fullName studentId')
    .populate('assignedTeachers.teacher', 'personalInfo.fullName role')
    .sort({ createdAt: 1 });
};

ExamGroupSchema.statics.findByTeacher = function(teacherId, status = 'active') {
  return this.find({
    'assignedTeachers.teacher': teacherId,
    'assignedTeachers.assignment.isActive': true,
    status,
    isDeleted: false
  }).populate('exam', 'examName subject schedule.startDate status');
};

ExamGroupSchema.statics.findByStudent = function(studentId) {
  return this.find({
    'students.student': studentId,
    'students.status': 'active',
    isDeleted: false
  }).populate('exam', 'examName subject schedule.startDate status');
};

// Transform for JSON output
ExamGroupSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('ExamGroup', ExamGroupSchema); 