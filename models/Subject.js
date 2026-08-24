import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const subjectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: { type: String, trim: true },
  departments: [{ type: ObjectId, ref: 'Department' }],
  subDepartments: [{ type: ObjectId, ref: 'SubDepartment' }],
  batches: [{ type: ObjectId, ref: 'Batch' }],
  standards: [{ type: String, trim: true }],
  classes: [{ type: ObjectId, ref: 'SubjectClass' }],
  teachers: [{
    teacher: { type: ObjectId, ref: 'User', required: true },
    isPrimary: { type: Boolean, default: false },
    assignedAt: { type: Date, default: Date.now }
  }],
  isActive: { type: Boolean, default: true },
  createdBy: { type: ObjectId, ref: 'User' },
  updatedBy: { type: ObjectId, ref: 'User' }
}, { timestamps: true });

subjectSchema.index({ departments: 1, subDepartments: 1, batches: 1 });
subjectSchema.index({ classes: 1 });
subjectSchema.index({ 'teachers.teacher': 1 });

export default mongoose.model('Subject', subjectSchema);
