import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const StudentSchema = new mongoose.Schema({
  // Basic Information
  admissionNo: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    trim: true
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: true
  },

  // Contact Information
  phone: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  address: {
    type: String,
    trim: true
  },
  presentAddress: {
    type: String,
    trim: true
  },
  permanentAddress: {
    type: String,
    trim: true
  },

  // Family Information
  fatherName: {
    type: String,
    required: true,
    trim: true
  },
  motherName: {
    type: String,
    required: true,
    trim: true
  },
  occupation: {
    type: String,
    trim: true
  },
  guardianPhone: {
    type: String,
    required: true,
    trim: true
  },
  guardianEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  linkedStudent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Demographics
  nationality: {
    type: String,
    trim: true,
    default: 'Indian'
  },
  religion: {
    type: String,
    trim: true,
    default: 'Hindu'
  },
  caste: {
    type: String,
    trim: true
  },
  motherTongue: {
    type: String,
    trim: true
  },

  // Academic History
  lastSchoolAttended: {
    type: String,
    trim: true
  },
  lastStandardStudied: {
    type: String,
    trim: true
  },
  tcDetails: {
    type: String,
    trim: true
  },

  // Academic Assignment - SINGLE DEPARTMENT, MULTIPLE SUB-DEPARTMENTS & BATCHES
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  
  // Multiple Sub-Departments allowed
  subDepartments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubDepartment'
  }],
  
  // Multiple Batches allowed
  batches: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch'
  }],

  // Academic Details
  admittedToStandard: {
    type: String,
    trim: true
  },
  currentStandard: {
    type: String,
    trim: true
  },
  dateOfAdmission: {
    type: Date,
    default: Date.now
  },

  // Vedic Information
  shaakha: {
    type: String,
    trim: true
  },
  gothra: {
    type: String,
    trim: true
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'graduated', 'transferred', 'leftout'],
    default: 'active'
  },
  isActive: {
    type: Boolean,
    default: true
  },

  // Additional Information
  remarks: {
    type: String,
    trim: true
  },

  // Simple wallet / account statement
  wallet: {
    openingBalance: {
      type: Number,
      default: 0
    },
    totalCredit: {
      type: Number,
      default: 0
    },
    totalDebit: {
      type: Number,
      default: 0
    },
    currentBalance: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'INR'
    }
  },

  walletTransactions: [{
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId()
    },
    date: {
      type: Date,
      default: Date.now
    },
    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    balanceAfter: {
      type: Number,
      required: true
    },
    source: {
      type: String,
      trim: true,
      maxlength: 120
    }, // e.g. "Puja collection", "Hostel deposit"
    creditRemark: {
      type: String,
      trim: true,
      maxlength: 500
    },
    debitRemark: {
      type: String,
      trim: true,
      maxlength: 500
    },
    reference: {
      type: String,
      trim: true,
      maxlength: 100
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdByName: {
      type: String,
      trim: true
    },
    createdByRole: {
      type: String,
      trim: true
    }
  }],

  // Notes & updates timeline
  notes: [{
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId()
    },
    title: {
      type: String,
      trim: true,
      maxlength: 120
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    category: {
      type: String,
      enum: ['general', 'academic', 'attendance', 'behaviour', 'health', 'hostel'],
      default: 'general'
    },
    visibility: {
      type: String,
      enum: ['staff', 'management', 'all'],
      default: 'staff'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdByName: {
      type: String,
      trim: true
    },
    createdByRole: {
      type: String,
      trim: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],

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

// Virtual for age calculation
StudentSchema.virtual('age').get(function() {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

// Virtual for stay duration
StudentSchema.virtual('stayDuration').get(function() {
  if (!this.dateOfAdmission) return null;
  const today = new Date();
  const admissionDate = new Date(this.dateOfAdmission);
  const diffTime = Math.abs(today - admissionDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  return `${years}y ${months}m`;
});

// Indexes for better performance
StudentSchema.index({ admissionNo: 1 });
StudentSchema.index({ department: 1 });
StudentSchema.index({ subDepartments: 1 });
StudentSchema.index({ batches: 1 });
StudentSchema.index({ status: 1 });
StudentSchema.index({ isActive: 1 });
StudentSchema.index({ fullName: 'text', admissionNo: 'text' });

// Add pagination plugin
StudentSchema.plugin(mongoosePaginate);

// Pre-save middleware to update timestamps
StudentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Student = mongoose.model('Student', StudentSchema);

export default Student;