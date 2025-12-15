import mongoose from 'mongoose';

const batchSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  subDepartment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubDepartment'
  },
  academicYear: {
    type: String,
    required: true,
    default: '2024-25'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date
  },
  maxStudents: {
    type: Number,
    default: null // No limit - unlimited students allowed
  },
  currentStudents: {
    type: Number,
    default: 0
  },
  classTeacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'completed'],
    default: 'active'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound unique index
batchSchema.index({ code: 1, department: 1, academicYear: 1 }, { unique: true });

// Instance method to calculate available seats
batchSchema.methods.getAvailableSeats = function() {
  const max = this.maxStudents || 0;
  const current = this.currentStudents || 0;
  return Math.max(0, max - current);
};

// Instance method to check if batch is full
batchSchema.methods.isFull = function() {
  const max = this.maxStudents || 0;
  const current = this.currentStudents || 0;
  return current >= max;
};

export default mongoose.model('Batch', batchSchema);