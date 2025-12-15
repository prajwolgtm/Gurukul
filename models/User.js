import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { withTimestamps, validators } from './_base.js';
import { ROLES } from '../utils/roles.js';

const UserSchema = withTimestamps(new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Please add a full name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: validators.email
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  role: {
    type: String,
    enum: Object.values(ROLES),
    default: ROLES.PARENT
  },
  phone: {
    type: String,
    validate: validators.phone
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Account verification status (especially for teachers)
  isVerified: {
    type: Boolean,
    default: function() {
      // Auto-verify Admin, Coordinator, Principal, and Teacher accounts
      return [ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL, ROLES.TEACHER].includes(this.role);
    }
  },
  
  // Who verified this account
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // When the account was verified
  verifiedAt: {
    type: Date
  },
  
  // Account status for workflow management
  accountStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected', 'suspended'],
    default: function() {
      // Auto-verify high-level roles and teachers
      if ([ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL, ROLES.TEACHER].includes(this.role)) {
        return 'verified';
      }
      // Others are auto-verified
      return 'verified';
    }
  },
  
  // Rejection reason (if account was rejected)
  rejectionReason: {
    type: String
  },
  
  lastLogin: {
    type: Date
  },
  profileImage: {
    type: String
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: { type: String, default: 'India' }
  },
  // Additional role-specific data can be referenced from other collections
  employeeId: String, // For staff
  studentId: String,  // For students
  
  // Teaching Assignments (for Teachers)
  teachingAssignments: [{
    // Department assignment
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department'
    },
    
    // Sub-department assignment (optional)
    subDepartment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubDepartment'
    },
    
    // Batch assignments within the department/sub-department
    batches: [{
      batch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Batch',
        required: true
      },
      subjects: [String], // Subjects taught in this batch
      isClassTeacher: {
        type: Boolean,
        default: false
      },
      academicYear: String,
      semester: Number
    }],
    
    // Assignment details
    assignmentDate: {
      type: Date,
      default: Date.now
    },
    
    isActive: {
      type: Boolean,
      default: true
    },
    
    // Role in this assignment
    role: {
      type: String,
      enum: ['teacher', 'coordinator', 'assistant', 'substitute'],
      default: 'teacher'
    },
    
    // Workload (optional)
    weeklyHours: Number,
    subjects: [String] // Overall subjects for this department/sub-department
  }]
}));

// Encrypt password using bcrypt
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Update last login
UserSchema.methods.updateLastLogin = async function () {
  this.lastLogin = new Date();
  await this.save();
};

// Indexes for performance
// Note: email index is automatically created by unique: true in schema
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ employeeId: 1 });
UserSchema.index({ studentId: 1 });
UserSchema.index({ 'teachingAssignments.department': 1 });
UserSchema.index({ 'teachingAssignments.subDepartment': 1 });
UserSchema.index({ 'teachingAssignments.batches.batch': 1 });
UserSchema.index({ role: 1, isActive: 1 });

// Virtual for active teaching assignments
UserSchema.virtual('activeTeachingAssignments').get(function() {
  return this.teachingAssignments?.filter(assignment => assignment.isActive) || [];
});

// Virtual for all assigned departments
UserSchema.virtual('assignedDepartments').get(function() {
  const activeAssignments = this.activeTeachingAssignments;
  const departmentIds = [...new Set(activeAssignments.map(a => a.department?.toString()).filter(Boolean))];
  return departmentIds;
});

// Virtual for all assigned sub-departments
UserSchema.virtual('assignedSubDepartments').get(function() {
  const activeAssignments = this.activeTeachingAssignments;
  const subDepartmentIds = [...new Set(activeAssignments.map(a => a.subDepartment?.toString()).filter(Boolean))];
  return subDepartmentIds;
});

// Virtual for all assigned batches
UserSchema.virtual('assignedBatches').get(function() {
  const activeAssignments = this.activeTeachingAssignments;
  const batchIds = [];
  activeAssignments.forEach(assignment => {
    assignment.batches?.forEach(batchAssignment => {
      if (batchAssignment.batch) {
        batchIds.push(batchAssignment.batch.toString());
      }
    });
  });
  return [...new Set(batchIds)];
});

// Method to assign teacher to department/sub-department/batch
UserSchema.methods.assignToTeaching = function(departmentId, subDepartmentId, batchId, subjects, isClassTeacher = false, academicYear, semester) {
  if (this.role !== 'Teacher') {
    throw new Error('Only teachers can be assigned to teaching');
  }

  // Find existing assignment for this department/sub-department
  let assignment = this.teachingAssignments.find(a => 
    a.department?.toString() === departmentId?.toString() && 
    a.subDepartment?.toString() === subDepartmentId?.toString()
  );

  if (!assignment) {
    // Create new assignment
    assignment = {
      department: departmentId,
      subDepartment: subDepartmentId,
      batches: [],
      isActive: true,
      role: 'teacher'
    };
    this.teachingAssignments.push(assignment);
  }

  // Add or update batch assignment
  const existingBatchIndex = assignment.batches.findIndex(b => b.batch?.toString() === batchId?.toString());
  
  if (existingBatchIndex >= 0) {
    // Update existing batch assignment
    assignment.batches[existingBatchIndex].subjects = subjects;
    assignment.batches[existingBatchIndex].isClassTeacher = isClassTeacher;
    assignment.batches[existingBatchIndex].academicYear = academicYear;
    assignment.batches[existingBatchIndex].semester = semester;
  } else {
    // Add new batch assignment
    assignment.batches.push({
      batch: batchId,
      subjects: subjects || [],
      isClassTeacher: isClassTeacher,
      academicYear: academicYear,
      semester: semester
    });
  }

  return this.save();
};

// Method to remove teacher from teaching assignment
UserSchema.methods.removeFromTeaching = function(departmentId, subDepartmentId, batchId) {
  const assignmentIndex = this.teachingAssignments.findIndex(a => 
    a.department?.toString() === departmentId?.toString() && 
    a.subDepartment?.toString() === subDepartmentId?.toString()
  );

  if (assignmentIndex >= 0) {
    const assignment = this.teachingAssignments[assignmentIndex];
    
    if (batchId) {
      // Remove specific batch
      assignment.batches = assignment.batches.filter(b => b.batch?.toString() !== batchId?.toString());
      
      // If no batches left, remove the entire assignment
      if (assignment.batches.length === 0) {
        this.teachingAssignments.splice(assignmentIndex, 1);
      }
    } else {
      // Remove entire assignment
      this.teachingAssignments.splice(assignmentIndex, 1);
    }
  }

  return this.save();
};

// Method to check if teacher is assigned to a specific batch
UserSchema.methods.isAssignedToBatch = function(batchId) {
  return this.assignedBatches.includes(batchId?.toString());
};

// Method to check if teacher is assigned to a specific department
UserSchema.methods.isAssignedToDepartment = function(departmentId) {
  return this.assignedDepartments.includes(departmentId?.toString());
};

// Method to check if teacher is assigned to a specific sub-department
UserSchema.methods.isAssignedToSubDepartment = function(subDepartmentId) {
  return this.assignedSubDepartments.includes(subDepartmentId?.toString());
};

// Method to verify account
UserSchema.methods.verifyAccount = function(verifierId) {
  this.isVerified = true;
  this.accountStatus = 'verified';
  this.verifiedBy = verifierId;
  this.verifiedAt = new Date();
  this.rejectionReason = undefined;
  return this.save();
};

// Method to reject account
UserSchema.methods.rejectAccount = function(verifierId, reason) {
  this.isVerified = false;
  this.accountStatus = 'rejected';
  this.verifiedBy = verifierId;
  this.verifiedAt = new Date();
  this.rejectionReason = reason;
  return this.save();
};

// Method to suspend account
UserSchema.methods.suspendAccount = function(verifierId, reason) {
  this.isActive = false;
  this.accountStatus = 'suspended';
  this.verifiedBy = verifierId;
  this.verifiedAt = new Date();
  this.rejectionReason = reason;
  return this.save();
};

// Method to reactivate account
UserSchema.methods.reactivateAccount = function(verifierId) {
  this.isActive = true;
  this.accountStatus = 'verified';
  this.verifiedBy = verifierId;
  this.verifiedAt = new Date();
  this.rejectionReason = undefined;
  return this.save();
};

// Method to check if user can access system (active and verified)
UserSchema.methods.canAccessSystem = function() {
  return this.isActive && this.isVerified && this.accountStatus === 'verified';
};

export default mongoose.model('User', UserSchema); 