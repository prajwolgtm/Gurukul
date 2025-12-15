import mongoose from 'mongoose';
import { withTimestamps } from './_base.js';

const RoleSchema = withTimestamps(new mongoose.Schema({
  name: { 
    type: String, 
    unique: true, 
    required: true,
    enum: ['admin', 'principal', 'hod', 'teacher', 'parent', 'caretaker', 'student']
  },
  access_level: { 
    type: Number, 
    default: 1 
  },
  description: {
    type: String,
    default: ''
  },
  permissions: [{
    type: String
  }]
}));

export default mongoose.model('Role', RoleSchema); 