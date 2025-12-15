import mongoose from 'mongoose';
import { withTimestamps, oid } from './_base.js';

const LeaveRequestSchema = withTimestamps(new mongoose.Schema({
  // Request Information
  requestId: {
    type: String,
    unique: true,
    required: true
  },
  
  // Student for whom leave is requested
  student: {
    type: oid,
    ref: 'Student',
    required: [true, 'Student is required']
  },
  
  // Parent who is making the request
  requestedBy: {
    type: oid,
    ref: 'User',
    required: [true, 'Requesting parent is required']
  },
  
  // Leave Details
  leaveType: {
    type: String,
    enum: ['sick_leave', 'family_emergency', 'personal', 'medical_appointment', 'family_function', 'other'],
    required: [true, 'Leave type is required']
  },
  
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  
  // Full day or partial day leave
  isFullDay: {
    type: Boolean,
    default: true
  },
  
  // If partial day, specify times
  startTime: String, // "09:00"
  endTime: String,   // "15:00"
  
  // Reason for leave
  reason: {
    type: String,
    required: [true, 'Reason for leave is required'],
    trim: true,
    maxlength: [500, 'Reason cannot exceed 500 characters']
  },
  
  // Emergency contact during leave
  emergencyContact: {
    name: String,
    phone: String,
    relationship: String
  },
  
  // Documents/attachments (medical certificates, etc.)
  attachments: [{
    filename: String,
    originalName: String,
    fileUrl: String,
    uploadDate: { type: Date, default: Date.now }
  }],
  
  // Request Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
    required: true
  },
  
  // Approval workflow
  reviewedBy: {
    type: oid,
    ref: 'User' // HOD, Principal, Admin, or Coordinator who reviewed
  },
  
  reviewDate: Date,
  
  reviewComments: {
    type: String,
    trim: true,
    maxlength: [300, 'Review comments cannot exceed 300 characters']
  },
  
  // Priority level
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  // Total leave days (calculated)
  totalDays: {
    type: Number,
    min: 0.5
  },
  
  // Academic impact
  missedSubjects: [{
    subject: String,
    period: String,
    teacher: {
      type: oid,
      ref: 'User'
    }
  }],
  
  // Auto-cancellation if not reviewed within time
  expiresAt: Date,
  
  // Additional notes from parent
  parentNotes: String,
  
  // System flags
  isUrgent: {
    type: Boolean,
    default: false
  },
  
  isRecurring: {
    type: Boolean,
    default: false
  }
}));

// Indexes for efficient queries
LeaveRequestSchema.index({ student: 1, status: 1 });
LeaveRequestSchema.index({ requestedBy: 1, status: 1 });
LeaveRequestSchema.index({ startDate: 1, endDate: 1 });
LeaveRequestSchema.index({ status: 1, createdAt: -1 });
LeaveRequestSchema.index({ reviewedBy: 1 });
LeaveRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for calculating leave duration
LeaveRequestSchema.virtual('duration').get(function() {
  if (!this.startDate || !this.endDate) return 0;
  
  const diffTime = Math.abs(this.endDate - this.startDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  
  if (!this.isFullDay) {
    return 0.5; // Half day
  }
  
  return diffDays;
});

// Virtual for checking if request is overdue
LeaveRequestSchema.virtual('isOverdue').get(function() {
  return this.status === 'pending' && this.startDate < new Date();
});

// Virtual for checking if leave is current/active
LeaveRequestSchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.status === 'approved' && 
         this.startDate <= now && 
         this.endDate >= now;
});

// Pre-save middleware to calculate total days and set expiry
LeaveRequestSchema.pre('save', function(next) {
  // Calculate total days
  if (this.startDate && this.endDate) {
    this.totalDays = this.duration;
  }
  
  // Set expiry date (requests expire after 7 days if not reviewed)
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
  
  // Set review date when status changes
  if (this.isModified('status') && this.status !== 'pending') {
    this.reviewDate = new Date();
  }
  
  next();
});

// Method to approve leave request
LeaveRequestSchema.methods.approve = function(reviewerId, comments) {
  this.status = 'approved';
  this.reviewedBy = reviewerId;
  this.reviewComments = comments;
  this.reviewDate = new Date();
  return this.save();
};

// Method to reject leave request
LeaveRequestSchema.methods.reject = function(reviewerId, comments) {
  this.status = 'rejected';
  this.reviewedBy = reviewerId;
  this.reviewComments = comments;
  this.reviewDate = new Date();
  return this.save();
};

// Method to cancel leave request
LeaveRequestSchema.methods.cancel = function() {
  this.status = 'cancelled';
  return this.save();
};

// Static method to generate unique request ID
LeaveRequestSchema.statics.generateRequestId = async function() {
  const count = await this.countDocuments();
  const year = new Date().getFullYear();
  return `LEAVE-${year}-${String(count + 1).padStart(4, '0')}`;
};

// Static method to get pending requests for a reviewer
LeaveRequestSchema.statics.getPendingRequests = function(reviewerDepartment) {
  return this.find({ status: 'pending' })
    .populate('student', 'personalInfo.fullName studentId department batch')
    .populate('requestedBy', 'fullName email phone')
    .sort({ priority: 1, createdAt: 1 });
};

export default mongoose.model('LeaveRequest', LeaveRequestSchema); 