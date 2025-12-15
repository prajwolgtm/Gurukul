import mongoose from 'mongoose';

const examResultSchema = new mongoose.Schema({
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
      required: true
    },
    passingMarks: {
      type: Number,
      required: true
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
    isPassed: {
      type: Boolean,
      default: false
    },
    grade: {
      type: String,
      enum: ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'],
      trim: true
    },
    remarks: {
      type: String,
      trim: true
    }
  }],
  
  // Overall Result
  totalMarksObtained: {
    type: Number,
    default: 0
  },
  totalMaxMarks: {
    type: Number,
    default: 0
  },
  percentage: {
    type: Number,
    default: 0
  },
  overallGrade: {
    type: String,
    enum: ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'],
    trim: true
  },
  result: {
    type: String,
    enum: ['pass', 'fail', 'absent'],
    default: 'fail'
  },
  
  // Status
  isPublished: {
    type: Boolean,
    default: false
  },
  publishedAt: {
    type: Date
  },
  
  // Entry Information
  enteredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  enteredAt: {
    type: Date,
    default: Date.now
  },
  
  // Additional Information
  attendance: {
    type: String,
    enum: ['present', 'absent', 'late'],
    default: 'present'
  },
  remarks: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Compound unique index
examResultSchema.index({ exam: 1, student: 1 }, { unique: true });

// Aggregate exam-level statistics
examResultSchema.statics.getExamStatistics = async function(examId) {
  const results = await this.find({ exam: examId });
  const totalStudents = results.length;
  const studentsPresent = results.filter(r => r.attendance !== 'absent').length;
  const studentsAbsent = totalStudents - studentsPresent;
  const studentsPassed = results.filter(r => r.result === 'pass').length;
  const passPercentage = totalStudents ? (studentsPassed / totalStudents) * 100 : 0;

  return [{
    totalStudents,
    studentsPresent,
    studentsAbsent,
    studentsPassed,
    passPercentage
  }];
};

// Calculate grades and totals before saving
examResultSchema.pre('save', function(next) {
  // Calculate totals
  this.totalMarksObtained = this.subjectMarks.reduce((sum, mark) => sum + mark.marksObtained, 0);
  this.totalMaxMarks = this.subjectMarks.reduce((sum, mark) => sum + mark.maxMarks, 0);
  
  // Calculate percentage
  if (this.totalMaxMarks > 0) {
    this.percentage = Math.round((this.totalMarksObtained / this.totalMaxMarks) * 100 * 100) / 100;
  }
  
  // Calculate individual subject grades and pass status
  this.subjectMarks.forEach(mark => {
    // If using divisions, calculate marksObtained from division marks
    if (mark.useDivisions && mark.divisionMarks && mark.divisionMarks.length > 0) {
      mark.marksObtained = mark.divisionMarks.reduce((sum, div) => sum + (div.marksObtained || 0), 0);
    }
    
    mark.isPassed = mark.marksObtained >= mark.passingMarks;
    
    // Calculate grade based on percentage
    const subjectPercentage = (mark.marksObtained / mark.maxMarks) * 100;
    if (subjectPercentage >= 90) mark.grade = 'A+';
    else if (subjectPercentage >= 80) mark.grade = 'A';
    else if (subjectPercentage >= 70) mark.grade = 'B+';
    else if (subjectPercentage >= 60) mark.grade = 'B';
    else if (subjectPercentage >= 50) mark.grade = 'C+';
    else if (subjectPercentage >= 40) mark.grade = 'C';
    else if (subjectPercentage >= 30) mark.grade = 'D';
    else mark.grade = 'F';
  });
  
  // Calculate overall grade
  if (this.percentage >= 90) this.overallGrade = 'A+';
  else if (this.percentage >= 80) this.overallGrade = 'A';
  else if (this.percentage >= 70) this.overallGrade = 'B+';
  else if (this.percentage >= 60) this.overallGrade = 'B';
  else if (this.percentage >= 50) this.overallGrade = 'C+';
  else if (this.percentage >= 40) this.overallGrade = 'C';
  else if (this.percentage >= 30) this.overallGrade = 'D';
  else this.overallGrade = 'F';
  
  // Determine overall result
  const allPassed = this.subjectMarks.every(mark => mark.isPassed);
  this.result = allPassed ? 'pass' : 'fail';
  
  next();
});

export default mongoose.model('ExamResult', examResultSchema);