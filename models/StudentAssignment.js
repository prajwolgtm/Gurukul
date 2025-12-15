import mongoose from 'mongoose';
import { withTimestamps, oid } from './_base.js';

const StudentAssignmentSchema = withTimestamps(new mongoose.Schema({
  // Student reference
  student: {
    type: oid,
    ref: 'StudentSimple',
    required: true
  },
  
  // Department assignment
  department: {
    type: oid,
    ref: 'Department',
    required: true
  },
  
  // Optional sub-department assignment
  subDepartment: {
    type: oid,
    ref: 'SubDepartment'
  },
  
  // Batch assignment
  batch: {
    type: oid,
    ref: 'Batch',
    required: true
  },
  
  // Role in this batch
  role: {
    type: String,
    enum: ['student', 'monitor', 'assistant', 'leader'],
    default: 'student'
  },
  
  // Enrollment date
  enrollmentDate: {
    type: Date,
    default: Date.now
  },
  
  // Current status
  status: {
    type: String,
    enum: ['active', 'inactive', 'transferred', 'graduated'],
    default: 'active'
  },
  
  // Academic performance tracking
  performance: {
    attendance: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    grade: {
      type: String,
      enum: ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'],
      default: 'C'
    }
  },
  
  // Notes
  notes: String,
  
  // Assigned by
  assignedBy: {
    type: oid,
    ref: 'User',
    required: true
  },
  
  isActive: {
    type: Boolean,
    default: true
  }
}));

// Compound indexes for efficient queries
StudentAssignmentSchema.index({ student: 1, department: 1, batch: 1 }, { unique: true });
StudentAssignmentSchema.index({ department: 1, status: 1 });
StudentAssignmentSchema.index({ batch: 1, status: 1 });
StudentAssignmentSchema.index({ student: 1, status: 1 });

// Virtual for full assignment path
StudentAssignmentSchema.virtual('assignmentPath').get(function() {
  let path = this.department?.name || 'Unknown Department';
  if (this.subDepartment) {
    path += ` > ${this.subDepartment.name}`;
  }
  path += ` > ${this.batch?.name || 'Unknown Batch'}`;
  return path;
});

// Method to check if assignment is active
StudentAssignmentSchema.methods.isActiveAssignment = function() {
  return this.status === 'active' && this.isActive;
};

export default mongoose.model('StudentAssignment', StudentAssignmentSchema);
