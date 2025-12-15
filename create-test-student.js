import mongoose from 'mongoose';
import StudentSimple from './models/StudentSimple.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/gurukul';

async function createTestStudent() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Check if test student already exists
    const existingStudent = await StudentSimple.findOne({ admissionNo: 'TEST001' });
    if (existingStudent) {
      console.log('✅ Test student already exists:', existingStudent.fullName);
      return;
    }

    // Create test student
    const testStudent = new StudentSimple({
      admissionNo: 'TEST001',
      fullName: 'Test Student for Assignment',
      dateOfBirth: new Date('2005-06-15'),
      bloodGroup: 'B+',
      shaakha: 'Rigveda – Shaakal',
      gothra: 'Test Gothra',
      telephone: '+919876543210',
      fatherName: 'Test Father',
      occupation: 'Engineer',
      presentAddress: 'Test Address, Test City',
      admittedToStandard: 'Class 11',
      dateOfAdmission: new Date('2024-06-15'),
      guardianInfo: {
        guardianPhone: '+919876543210',
        guardianEmail: 'test@parent.com'
      }
    });

    await testStudent.save();
    console.log('✅ Test student created successfully!');
    console.log('📝 Student Details:');
    console.log(`   - Admission No: ${testStudent.admissionNo}`);
    console.log(`   - Name: ${testStudent.fullName}`);
    console.log(`   - ID: ${testStudent._id}`);
    
  } catch (error) {
    console.error('❌ Error creating test student:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

createTestStudent();
