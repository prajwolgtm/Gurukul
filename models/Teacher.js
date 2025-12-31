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
  
  // Personal Information
  motherName: {
    type: String,
    trim: true
  },
  spouseName: {
    type: String,
    trim: true
  },
  dateOfBirth: {
    type: Date
  },
  religion: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['General', 'OBC', 'SC', 'ST', 'EWS', ''],
    default: ''
  },
  nationality: {
    type: String,
    default: 'Indian',
    trim: true
  },
  languages: [{
    type: String,
    trim: true
  }],
  
  // Academic Information
  qualification: {
    type: String,
    trim: true
  },
  specialization: {
    type: String,
    trim: true
  },
  veda: {
    type: String,
    trim: true
  },
  shakha: {
    type: String,
    trim: true
  },
  educationalBackground: {
    moolanta: String,
    kramanta: String,
    ghananta: String
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
  
  // Address Information
  permanentAddress: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  
  // Emergency Contact
  emergencyContact: {
    name: String,
    phone: String,
    relation: String
  },
  
  // Bank & Government IDs
  aadhaarNumber: {
    type: String,
    trim: true,
    sparse: true // Allows null/undefined values while maintaining uniqueness for non-null values
  },
  panNumber: {
    type: String,
    trim: true,
    uppercase: true,
    sparse: true
  },
  bankDetails: {
    bankName: String,
    bankAddress: String,
    accountNumber: String,
    ifscCode: String
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
