import mongoose from 'mongoose';

const StaffAttendanceSchema = new mongoose.Schema({
  // User who marked attendance
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Date of attendance
  date: {
    type: Date,
    required: true
  },
  
  // Attendance status
  status: {
    type: String,
    enum: ['Present', 'Absent', 'Leave'],
    required: true
  },
  
  // Optional remarks/work summary
  remarks: {
    type: String,
    trim: true,
    maxlength: 500
  },
  
  // When attendance was marked
  markedAt: {
    type: Date,
    default: Date.now
  },
  
  // Who marked it (usually the user themselves)
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index to ensure one attendance record per user per date
StaffAttendanceSchema.index({ user: 1, date: 1 }, { unique: true });

// Index for querying by date
StaffAttendanceSchema.index({ date: -1 });

const StaffAttendance = mongoose.model('StaffAttendance', StaffAttendanceSchema);

export default StaffAttendance;
