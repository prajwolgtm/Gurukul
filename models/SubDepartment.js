import mongoose from 'mongoose';

const subDepartmentSchema = new mongoose.Schema({
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
  description: {
    type: String,
    trim: true
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  coordinator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound unique index for name within department
subDepartmentSchema.index({ name: 1, department: 1 }, { unique: true });
subDepartmentSchema.index({ code: 1, department: 1 }, { unique: true });

// Virtual for batches
subDepartmentSchema.virtual('batches', {
  ref: 'Batch',
  localField: '_id',
  foreignField: 'subDepartment'
});

subDepartmentSchema.set('toJSON', { virtuals: true });
subDepartmentSchema.set('toObject', { virtuals: true });

export default mongoose.model('SubDepartment', subDepartmentSchema);