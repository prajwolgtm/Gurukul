import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const TeacherAssignmentSchema = new mongoose.Schema({
  // Teacher Reference
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Assignment Type
  assignmentType: {
    type: String,
    enum: ['department', 'subDepartment', 'batch', 'subject'],
    required: true
  },

  // Multiple Departments (if applicable)
  departments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  }],

  // Multiple Sub-Departments (if applicable)
  subDepartments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubDepartment'
  }],

  // Multiple Batches (if applicable)
  batches: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch'
  }],

  // Subject (if subject-specific assignment)
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject'
  },

  // Assignment Details
  role: {
    type: String,
    enum: ['teacher', 'coordinator', 'hod', 'assistant'],
    default: 'teacher'
  },

  // Academic Year
  academicYear: {
    type: String,
    required: true,
    default: '2024-25'
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending', 'completed'],
    default: 'active'
  },

  // Assignment Period
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date
  },

  // Additional Information
  workload: {
    type: Number, // Hours per week
    default: 0
  },
  responsibilities: [{
    type: String,
    trim: true
  }],
  notes: {
    type: String,
    trim: true
  },

  // Created By
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
TeacherAssignmentSchema.index({ teacher: 1 });
TeacherAssignmentSchema.index({ assignmentType: 1 });
TeacherAssignmentSchema.index({ departments: 1 });
TeacherAssignmentSchema.index({ subDepartments: 1 });
TeacherAssignmentSchema.index({ batches: 1 });
TeacherAssignmentSchema.index({ status: 1 });
TeacherAssignmentSchema.index({ academicYear: 1 });

// Add pagination plugin
TeacherAssignmentSchema.plugin(mongoosePaginate);

// Pre-save middleware
TeacherAssignmentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const TeacherAssignment = mongoose.model('TeacherAssignment', TeacherAssignmentSchema);

export default TeacherAssignment;
