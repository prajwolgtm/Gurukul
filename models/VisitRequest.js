import mongoose from 'mongoose';
import { withTimestamps, oid } from './_base.js';

const VisitRequestSchema = withTimestamps(new mongoose.Schema({
  // Request Information
  requestId: {
    type: String,
    unique: true,
    required: true
  },
  
  // Parent making the visit request
  requestedBy: {
    type: oid,
    ref: 'User',
    required: [true, 'Requesting parent is required']
  },
  
  // Student they want to visit (if applicable)
  student: {
    type: oid,
    ref: 'Student'
  },
  
  // Visit Details
  visitType: {
    type: String,
    enum: [
      'meet_student',      // General meeting with student
      'meet_teacher',      // Meeting with specific teacher
      'meet_principal',    // Meeting with principal
      'meet_hod',         // Meeting with HOD
      'academic_discussion', // Academic performance discussion
      'medical_emergency', // Emergency medical visit
      'other'
    ],
    required: [true, 'Visit type is required']
  },
  
  // Preferred visit date and time
  preferredDate: {
    type: Date,
    required: [true, 'Preferred visit date is required']
  },
  
  preferredStartTime: {
    type: String,
    required: [true, 'Preferred start time is required']
  },
  
  preferredEndTime: {
    type: String,
    required: [true, 'Preferred end time is required']
  
  },
  
  // Alternative dates (optional)
  alternativeDates: [{
    date: Date,
    startTime: String,
    endTime: String
  }],
  
  // Purpose and details
  purpose: {
    type: String,
    required: [true, 'Purpose of visit is required'],
    trim: true,
    maxlength: [500, 'Purpose cannot exceed 500 characters']
  },
  
  // Specific person to meet (if applicable)
  personToMeet: {
    type: oid,
    ref: 'User' // Teacher, Principal, HOD, etc.
  },
  
  // Number of visitors
  numberOfVisitors: {
    type: Number,
    default: 1,
    min: 1,
    max: 5
  },
  
  // Visitor details
  visitors: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    relationship: {
      type: String,
      required: true,
      enum: ['parent', 'guardian', 'relative', 'friend', 'other']
    },
    idType: {
      type: String,
      enum: ['aadhar', 'passport', 'driving_license', 'voter_id', 'other']
    },
    idNumber: String,
    phone: String
  }],
  
  // Request Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed', 'cancelled'],
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

  //foloowup routine
  // followupRoutine: {
  //   type: String,
  //   enum: ['daily', 'weekly', 'monthly', 'yearly'],
  //   default: 'daily'
  // },
  // followupDate: Date,
  // followupComments: String, 

  
  // Final approved schedule (may differ from preferred)
  approvedDate: Date,
  approvedStartTime: String,
  approvedEndTime: String,
  approvedVenue: {
    type: String,
    trim: true
  },
  
  // Priority level
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  // Visit completion
  checkInTime: Date,
  checkOutTime: Date,
  actualDuration: Number, // in minutes
  
  // Security and compliance
  securityApproval: {
    required: {
      type: Boolean,
      default: false
    },
    approvedBy: {
      type: oid,
      ref: 'User'
    },
    approvedAt: Date,
    notes: String
  },
  
  // Entry pass information
  entryPass: {
    passNumber: String,
    issueDate: Date,
    validUntil: Date,
    issuedBy: {
      type: oid,
      ref: 'User'
    }
  },
  
  // Auto-cancellation if not reviewed within time
  expiresAt: Date,
  
  // Additional requirements
  specialRequirements: {
    type: String,
    trim: true,
    maxlength: [200, 'Special requirements cannot exceed 200 characters']
  },
  
  // Is this a recurring visit pattern?
  isRecurring: {
    type: Boolean,
    default: false
  },
  
  recurringPattern: {
    frequency: {
      type: String,
      enum: ['weekly', 'biweekly', 'monthly']
    },
    endDate: Date
  },
  
  // COVID/Health protocols (if needed)
  healthDeclaration: {
    hasSymptoms: Boolean,
    vaccinationStatus: String,
    recentTravel: Boolean,
    contactWithPatient: Boolean,
    declarationDate: Date
  },
  
  // Visit outcome/notes (filled after visit)
  visitOutcome: {
    summary: String,
    actionItems: [String],
    followUpRequired: Boolean,
    nextVisitRecommended: Date
  },
  
  // QR Code Pass for Security
  qrPass: {
    qrCode: {
      type: String, // Base64 encoded QR code image
      default: null
    },
    qrData: {
      type: String, // Encrypted/encoded data for QR verification
      default: null
    },
    passToken: {
      type: String, // Unique token for verification
      default: null
    },
    generatedAt: {
      type: Date,
      default: null
    },
    validUntil: {
      type: Date,
      default: null
    },
    isUsed: {
      type: Boolean,
      default: false
    },
    usedAt: {
      type: Date,
      default: null
    },
    usedBy: {
      type: oid,
      ref: 'User' // Security guard who scanned
    },
    entryTime: {
      type: Date,
      default: null
    },
    exitTime: {
      type: Date,
      default: null
    }
  }
}));

// Indexes for efficient queries
VisitRequestSchema.index({ requestedBy: 1, status: 1 });
VisitRequestSchema.index({ student: 1, status: 1 });
VisitRequestSchema.index({ preferredDate: 1, status: 1 });
VisitRequestSchema.index({ status: 1, createdAt: -1 });
VisitRequestSchema.index({ reviewedBy: 1 });
VisitRequestSchema.index({ personToMeet: 1, status: 1 });
VisitRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for checking if visit is today
VisitRequestSchema.virtual('isToday').get(function() {
  if (!this.approvedDate) return false;
  const today = new Date();
  const visitDate = new Date(this.approvedDate);
  return visitDate.toDateString() === today.toDateString();
});

// Virtual for checking if visit is overdue for review
VisitRequestSchema.virtual('isOverdue').get(function() {
  return this.status === 'pending' && this.preferredDate < new Date();
});

// Virtual for checking if visit is in progress
VisitRequestSchema.virtual('isInProgress').get(function() {
  return this.checkInTime && !this.checkOutTime;
});

// Pre-save middleware
VisitRequestSchema.pre('save', function(next) {
  // Set expiry date (requests expire after 5 days if not reviewed)
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  }
  
  // Set review date when status changes
  if (this.isModified('status') && this.status !== 'pending') {
    this.reviewDate = new Date();
  }
  
  // Calculate actual duration on checkout
  if (this.checkInTime && this.checkOutTime && !this.actualDuration) {
    this.actualDuration = Math.round((this.checkOutTime - this.checkInTime) / (1000 * 60));
  }
  
  next();
});

// Method to approve visit request
VisitRequestSchema.methods.approve = function(reviewerId, approvedDateTime, venue, comments) {
  this.status = 'approved';
  this.reviewedBy = reviewerId;
  this.reviewComments = comments;
  this.reviewDate = new Date();
  
  if (approvedDateTime) {
    this.approvedDate = approvedDateTime.date;
    this.approvedStartTime = approvedDateTime.startTime;
    this.approvedEndTime = approvedDateTime.endTime;
  }
  
  if (venue) {
    this.approvedVenue = venue;
  }
  
  return this.save();
};

// Method to reject visit request
VisitRequestSchema.methods.reject = function(reviewerId, comments) {
  this.status = 'rejected';
  this.reviewedBy = reviewerId;
  this.reviewComments = comments;
  this.reviewDate = new Date();
  return this.save();
};

// Method to check in visitor
VisitRequestSchema.methods.checkIn = function() {
  this.checkInTime = new Date();
  this.status = 'completed'; // Visit is now active
  return this.save();
};

// Method to check out visitor
VisitRequestSchema.methods.checkOut = function(outcome) {
  this.checkOutTime = new Date();
  if (outcome) {
    this.visitOutcome = outcome;
  }
  return this.save();
};

// Static method to generate unique request ID
VisitRequestSchema.statics.generateRequestId = async function() {
  const count = await this.countDocuments();
  const year = new Date().getFullYear();
  return `VISIT-${year}-${String(count + 1).padStart(4, '0')}`;
};

// Static method to get today's approved visits
VisitRequestSchema.statics.getTodaysVisits = function() {
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));
  
  return this.find({
    status: 'approved',
    approvedDate: {
      $gte: startOfDay,
      $lte: endOfDay
    }
  })
    .populate('requestedBy', 'fullName email phone')
    .populate('student', 'personalInfo.fullName studentId')
    .populate('personToMeet', 'fullName role')
    .sort({ approvedStartTime: 1 });
};

// Static method to get pending visits for approval
VisitRequestSchema.statics.getPendingVisits = function(filters = {}) {
  return this.find({ status: 'pending', ...filters })
    .populate('requestedBy', 'fullName email phone')
    .populate('student', 'personalInfo.fullName studentId department batch')
    .populate('personToMeet', 'fullName role')
    .sort({ priority: 1, createdAt: 1 });
};

export default mongoose.model('VisitRequest', VisitRequestSchema); 