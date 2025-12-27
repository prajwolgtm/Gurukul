import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const ExamSchema = new mongoose.Schema({
  // Unique Exam ID - auto-generated if not provided
  examId: {
    type: String,
    unique: true,
    trim: true,
    index: true
  },
  
  // Basic Information
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  examType: {
    type: String,
    enum: ['unit', 'midterm', 'final', 'assignment', 'project', 'practical'],
    required: true
  },

  // Exam Schedule
  examDate: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  duration: {
    type: Number, // in minutes
    required: true
  },

  // Student Selection Criteria
  selectionType: {
    type: String,
    enum: ['department', 'subDepartment', 'batch', 'standard', 'custom'],
    required: true
  },

  // Target Students (based on selection type)
  targetDepartment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  targetDepartments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  }],
  targetSubDepartments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubDepartment'
  }],
  targetBatches: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch'
  }],
  targetStandards: [{
    type: String,
    enum: ['Pratham 1st Year', 'Pratham 2nd Year', 'Pratham 3rd Year', 'Pravesh 1st Year', 'Pravesh 2nd Year', 'Moola 1st Year', 'Moola 2nd Year', 'B.A. 1st Year', 'B.A. 2nd Year', 'B.A. 3rd Year', 'M.A. 1st Year', 'M.A. 2nd Year']
  }],
  customStudents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student'
  }],

  // Subjects in this exam
  subjects: [{
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true
    },
    maxMarks: {
      type: Number,
      required: true,
      min: 1
    },
    passingMarks: {
      type: Number,
      required: true,
      min: 0
    },
    weightage: {
      type: Number,
      default: 1,
      min: 0
    },
    // Division-based marking (10 divisions × 10 marks = 100)
    divisions: [{
      name: {
        type: String,
        required: true,
        trim: true
      },
      maxMarks: {
        type: Number,
        required: true,
        default: 10,
        min: 1
      },
      order: {
        type: Number,
        default: 0
      }
    }],
    useDivisions: {
      type: Boolean,
      default: false
    }
  }],

  // Exam Settings
  // Calculated automatically from subjects; not required on input
  totalMarks: {
    type: Number,
    default: 0,
    min: 0
  },
  passingPercentage: {
    type: Number,
    default: 40,
    min: 0,
    max: 100
  },

  // Status
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'ongoing', 'completed', 'cancelled'],
    default: 'draft'
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  resultsPublished: {
    type: Boolean,
    default: false
  },

  // Academic Information
  academicYear: {
    type: String,
    required: true,
    default: '2024-2025',
    match: /^\d{4}-\d{4}$/ // Format: YYYY-YYYY (e.g., 2024-2025)
  },
  semester: {
    type: String,
    enum: ['1', '2', 'annual'],
    default: '1'
  },

  // Created By
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  invigilators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Additional Settings
  instructions: {
    type: String,
    trim: true
  },
  venue: {
    type: String,
    trim: true
  },
  maxStudentsPerRoom: {
    type: Number,
    default: 30
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

// Virtual for eligible students count
ExamSchema.virtual('eligibleStudentsCount', {
  ref: 'Student',
  localField: '_id',
  foreignField: 'exams',
  count: true
});

// Indexes for better performance
// examId already has unique index from schema definition
ExamSchema.index({ examDate: 1 });
ExamSchema.index({ status: 1 });
ExamSchema.index({ targetDepartment: 1 });
ExamSchema.index({ targetSubDepartments: 1 });
ExamSchema.index({ targetBatches: 1 });
ExamSchema.index({ academicYear: 1 });
ExamSchema.index({ createdBy: 1 });
ExamSchema.index({ name: 'text', description: 'text' });

// Add pagination plugin
ExamSchema.plugin(mongoosePaginate);

// Static method to generate unique exam ID
ExamSchema.statics.generateExamId = function(prefix = 'EX') {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
  return `${prefix}-${timestamp}-${random}`;
};

// Pre-save middleware
ExamSchema.pre('save', async function(next) {
  this.updatedAt = new Date();
  
  // Auto-generate examId if not provided
  if (!this.examId) {
    // Generate unique examId and ensure it doesn't already exist
    const Exam = this.constructor;
    let newExamId;
    let exists = true;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (exists && attempts < maxAttempts) {
      newExamId = Exam.generateExamId();
      const existingExam = await Exam.findOne({ examId: newExamId });
      exists = !!existingExam;
      attempts++;
    }
    
    if (exists) {
      // Fallback: use timestamp + random if all attempts failed
      newExamId = `EX-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    }
    
    this.examId = newExamId;
  }
  
  // Calculate total marks from subjects
  if (this.subjects && this.subjects.length > 0) {
    this.totalMarks = this.subjects.reduce((total, subject) => total + subject.maxMarks, 0);
  }
  
  next();
});

// Static helper to fetch upcoming exams within given days
ExamSchema.statics.findUpcomingExams = function(days = 30) {
  const now = new Date();
  const future = new Date();
  future.setDate(now.getDate() + days);

  return this.find({
    examDate: { $gte: now, $lte: future },
    status: { $in: ['scheduled', 'ongoing'] }
  }).sort({ examDate: 1 });
};

const Exam = mongoose.model('Exam', ExamSchema);

export default Exam;