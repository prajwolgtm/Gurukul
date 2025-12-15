import mongoose from 'mongoose';
import { withTimestamps, oid } from './_base.js';

const StudentSimpleSchema = withTimestamps(new mongoose.Schema({
  // Admission Information
  admissionNo: {
    type: String,
    required: [true, 'Admission number is required'],
    unique: true
  },
  
  // Personal Information
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },
  
  dateOfBirth: {
    type: Date,
    required: [true, 'Date of birth is required']
  },
  
  // Calculated fields
  age: {
    type: Number,
    get: function() {
      if (!this.dateOfBirth) return null;
      const today = new Date();
      const birthDate = new Date(this.dateOfBirth);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return parseFloat(age.toFixed(1));
    }
  },
  
  bloodGroup: {
    type: String,
    required: [true, 'Blood group is required']
  },
  
  // Vedic Information
  shaakha: {
    type: String,
    required: [true, 'Shaakha is required'],
    enum: ['Rig Veda', 'Yajur Veda', 'Sama Veda', 'Atharva Veda']
  },
  
  gothra: {
    type: String,
    required: [true, 'Gothra is required']
  },
  
  // Contact Information
  telephone: {
    type: String,
    required: [true, 'Telephone/Mobile number is required']
  },
  
  // Family Information
  fatherName: {
    type: String,
    required: [true, 'Father name is required']
  },
  
  motherName: {
    type: String
  },
  
  occupation: {
    type: String,
    required: [true, 'Occupation is required']
  },
  
  // Demographics
  nationality: {
    type: String,
    default: 'Indian'
  },
  
  religion: {
    type: String,
    default: 'Hindu'
  },
  
  caste: {
    type: String
  },
  
  motherTongue: {
    type: String
  },
  
  // Address Information
  presentAddress: {
    type: String,
    required: [true, 'Present address is required']
  },
  
  permanentAddress: {
    type: String,
    default: function() {
      return this.presentAddress; // Default to present address if not specified
    }
  },
  
  // Academic History
  lastSchoolAttended: {
    type: String
  },
  
  lastStandardStudied: {
    type: String
  },
  
  tcDetails: {
    type: String
  },
  
  // Current Academic Information
  admittedToStandard: {
    type: String,
    required: [true, 'Admitted to standard is required']
  },
  
  dateOfAdmission: {
    type: Date,
    required: [true, 'Date of admission is required']
  },
  
  // Calculated stay duration
  stayDuration: {
    type: Number,
    get: function() {
      if (!this.dateOfAdmission) return null;
      const today = new Date();
      const admissionDate = new Date(this.dateOfAdmission);
      const diffTime = Math.abs(today - admissionDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const years = diffDays / 365.25;
      return parseFloat(years.toFixed(1));
    }
  },
  
  currentStandard: {
    type: String
  },
  
  remarks: {
    type: String
  },
  
  // Guardian Information (for parent registration)
  guardianInfo: {
    guardianPhone: {
      type: String,
      required: true
    },
    guardianEmail: String,
    parentUserId: {
      type: oid,
      ref: 'User'
    }
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  }
}));

// Set getters to true so calculated fields are included in JSON
StudentSimpleSchema.set('toJSON', { getters: true });
StudentSimpleSchema.set('toObject', { getters: true });

// Indexes for performance
// Note: admissionNo index is automatically created by unique: true in schema
StudentSimpleSchema.index({ fullName: 1 });
StudentSimpleSchema.index({ dateOfAdmission: 1 });
StudentSimpleSchema.index({ isActive: 1 });
StudentSimpleSchema.index({ 'guardianInfo.guardianPhone': 1 });

// Virtual for full academic path
StudentSimpleSchema.virtual('academicPath').get(function() {
  return `${this.shaakha} > ${this.admittedToStandard}`;
});

// Method to get full student info with populated references
StudentSimpleSchema.methods.getFullInfo = function() {
  return this.populate([
    { path: 'guardianInfo.parentUserId', select: 'fullName email phone' }
  ]);
};

export default mongoose.model('StudentSimple', StudentSimpleSchema);
