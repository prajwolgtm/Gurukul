import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const ExamMarksSchema = new mongoose.Schema({
  // References
  exam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },

  // Subject-wise marks
  subjectMarks: [{
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true
    },
    marksObtained: {
      type: Number,
      required: true,
      min: 0
    },
    maxMarks: {
      type: Number,
      required: true,
      min: 1
    },
    passingMarks: {
      type: Number,
      default: 40
    },
    // Division-wise marks (if exam uses divisions)
    divisionMarks: [{
      divisionName: {
        type: String,
        required: true,
        trim: true
      },
      marksObtained: {
        type: Number,
        required: true,
        min: 0
      },
      maxMarks: {
        type: Number,
        required: true,
        default: 10
      }
    }],
    useDivisions: {
      type: Boolean,
      default: false
    },
    percentage: {
      type: Number,
      min: 0,
      max: 100
    },
    grade: {
      type: String,
      enum: ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'],
      trim: true
    },
    isPassed: {
      type: Boolean,
      default: false
    },
    remarks: {
      type: String,
      trim: true
    }
  }],

  // Overall Results
  totalMarksObtained: {
    type: Number,
    required: true,
    min: 0
  },
  totalMaxMarks: {
    type: Number,
    required: true,
    min: 1
  },
  overallPercentage: {
    type: Number,
    min: 0,
    max: 100
  },
  overallGrade: {
    type: String,
    enum: ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'],
    trim: true
  },
  isPassed: {
    type: Boolean,
    default: false
  },
  rank: {
    type: Number,
    min: 1
  },

  // Attendance
  isPresent: {
    type: Boolean,
    default: true
  },
  absentReason: {
    type: String,
    trim: true
  },

  // Status
  status: {
    type: String,
    enum: ['draft', 'submitted', 'verified', 'published'],
    default: 'draft'
  },

  // Additional Information
  remarks: {
    type: String,
    trim: true
  },
  teacherRemarks: {
    type: String,
    trim: true
  },

  // Entry Information
  enteredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  entryDate: {
    type: Date,
    default: Date.now
  },
  verificationDate: {
    type: Date
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

// Compound indexes for better performance
ExamMarksSchema.index({ exam: 1, student: 1 }, { unique: true });
ExamMarksSchema.index({ exam: 1 });
ExamMarksSchema.index({ student: 1 });
ExamMarksSchema.index({ status: 1 });
ExamMarksSchema.index({ overallPercentage: -1 });
ExamMarksSchema.index({ rank: 1 });

// Add pagination plugin
ExamMarksSchema.plugin(mongoosePaginate);

// Pre-save middleware to calculate percentages and grades
ExamMarksSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Calculate subject-wise percentages and grades
  this.subjectMarks.forEach(subjectMark => {
    // If using divisions, calculate marksObtained from division marks
    if (subjectMark.useDivisions && subjectMark.divisionMarks && subjectMark.divisionMarks.length > 0) {
      subjectMark.marksObtained = subjectMark.divisionMarks.reduce((sum, div) => sum + (div.marksObtained || 0), 0);
    }
    
    const passingMarks = subjectMark.passingMarks || 40;
    subjectMark.percentage = (subjectMark.marksObtained / subjectMark.maxMarks) * 100;
    subjectMark.grade = calculateGrade(subjectMark.percentage);
    subjectMark.isPassed = subjectMark.marksObtained >= passingMarks;
  });
  
  // Recalculate totals from subject marks (in case divisions were used)
  this.totalMarksObtained = this.subjectMarks.reduce((sum, sm) => sum + sm.marksObtained, 0);
  this.totalMaxMarks = this.subjectMarks.reduce((sum, sm) => sum + sm.maxMarks, 0);
  
  // Calculate overall percentage and grade
  this.overallPercentage = (this.totalMarksObtained / this.totalMaxMarks) * 100;
  this.overallGrade = calculateGrade(this.overallPercentage);
  this.isPassed = this.overallPercentage >= 40; // Assuming 40% is passing
  
  next();
});

// Helper function to calculate grade
function calculateGrade(percentage) {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C+';
  if (percentage >= 40) return 'C';
  if (percentage >= 30) return 'D';
  return 'F';
}

const ExamMarks = mongoose.model('ExamMarks', ExamMarksSchema);

export default ExamMarks;