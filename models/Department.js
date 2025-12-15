import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  hod: {
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

// Virtual for sub-departments
departmentSchema.virtual('subDepartments', {
  ref: 'SubDepartment',
  localField: '_id',
  foreignField: 'department'
});

// Virtual for batches
departmentSchema.virtual('batches', {
  ref: 'Batch',
  localField: '_id',
  foreignField: 'department'
});

departmentSchema.set('toJSON', { virtuals: true });
departmentSchema.set('toObject', { virtuals: true });

export default mongoose.model('Department', departmentSchema);