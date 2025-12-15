import mongoose from 'mongoose';

const teacherSchema = new mongoose.Schema({
  // Reference to User account
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Professional Information
  employeeId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  qualification: {
    type: String,
    trim: true
  },
  specialization: {
    type: String,
    trim: true
  },
  experience: {
    type: Number, // in years
    min: 0
  },
  joiningDate: {
    type: Date,
    default: Date.now
  },
  
  // Assignment - Multiple Departments, Sub-Departments, and Batches
  departments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  }],
  subDepartments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubDepartment'
  }],
  batches: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch'
  }],
  
  // Subjects they can teach
  subjects: [{
    type: String,
    trim: true
  }],
  
  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'on_leave', 'terminated'],
    default: 'active'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verifiedAt: {
    type: Date
  },
  
  // Additional Information
  address: {
    type: String,
    trim: true
  },
  emergencyContact: {
    name: String,
    phone: String,
    relation: String
  },
  remarks: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes
teacherSchema.index({ departments: 1 });
teacherSchema.index({ subDepartments: 1 });
teacherSchema.index({ batches: 1 });
teacherSchema.index({ status: 1 });
teacherSchema.index({ isVerified: 1 });

export default mongoose.model('Teacher', teacherSchema);
