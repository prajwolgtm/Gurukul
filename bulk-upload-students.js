import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import StudentSimple from './models/StudentSimple.js';
import StudentAssignment from './models/StudentAssignment.js';
import Department from './models/Department.js';
import Batch from './models/Batch.js';
import fs from 'fs';

const bulkUploadStudents = async () => {
  try {
    console.log('🚀 Starting bulk student upload...');
    
    // Connect to MongoDB
    await connectDB();
    
    // Read student data
    const studentsData = JSON.parse(fs.readFileSync('./sample-students.json', 'utf8'));
    console.log(`📊 Found ${studentsData.length} students to upload`);
    
    // Get all departments and batches
    const departments = await Department.find({}).lean();
    const batches = await Batch.find({}).populate('department').lean();
    
    console.log(`🏛️ Found ${departments.length} departments and ${batches.length} batches`);
    
    // Create a mapping for Vedic shaakha to department
    const shaakaMapping = {
      'Rigveda – Shaakal': 'RIGVEDA_SHAKAL',
      'Rig Veda': 'RIGVEDA_SHAKAL',
      'Krishna Yajurveda – Taittiriya': 'KRISHNA_YAJUR_T',
      'Krishna Yajur Veda': 'KRISHNA_YAJUR_T',
      'Krishnayajur Veda': 'KRISHNA_YAJUR_T',
      'Krishnayajurveda': 'KRISHNA_YAJUR_T',
      'Shukla Yajurveda – Kanva': 'SHUKLA_YAJUR_K',
      'Shukla Yajur Veda K': 'SHUKLA_YAJUR_K',
      'Shukla Yajurveda Kanva': 'SHUKLA_YAJUR_K',
      'Shukla Yajurveda – Madhyandina': 'SHUKLA_YAJUR_M',
      'Shukla Yajur Veda M': 'SHUKLA_YAJUR_M',
      'Shukla Yajur Veda': 'SHUKLA_YAJUR_M',
      'Shuklayajur Veda': 'SHUKLA_YAJUR_M',
      'Shuklayajurveda': 'SHUKLA_YAJUR_M',
      'Shuklayajurveda Madhyandina': 'SHUKLA_YAJUR_M',
      'Samaveda – Ranayaneeya': 'SAMAVEDA_R',
      'Sama Veda Ranayaneeya': 'SAMAVEDA_R',
      'Samaveda – Kauthuma': 'SAMAVEDA_K',
      'Sama Veda Kauthuma': 'SAMAVEDA_K',
      'Sama Veda': 'SAMAVEDA_K',
      'Atharvaveda – Shaunaka': 'ATHARVAVEDA_S',
      'Atharva Veda': 'ATHARVAVEDA_S',
      'Atharvana Veda': 'ATHARVAVEDA_S'
    };
    
    const results = {
      successful: [],
      failed: [],
      totalProcessed: studentsData.length
    };
    
    // Clear existing data
    console.log('🗑️ Clearing existing student data...');
    await StudentAssignment.deleteMany({});
    await StudentSimple.deleteMany({});
    
    for (let i = 0; i < studentsData.length; i++) {
      const studentData = studentsData[i];
      
      try {
        // Map shaakha to department
        const departmentCode = shaakaMapping[studentData.shaakha];
        if (!departmentCode) {
          results.failed.push({
            index: i,
            data: studentData,
            error: `Unknown shaakha: ${studentData.shaakha}`
          });
          continue;
        }
        
        const department = departments.find(d => d.code === departmentCode);
        if (!department) {
          results.failed.push({
            index: i,
            data: studentData,
            error: `Department not found for code: ${departmentCode}`
          });
          continue;
        }
        
        // Find a suitable batch (Prathama by default)
        const suitableBatch = batches.find(b => 
          b.department._id.toString() === department._id.toString() && 
          b.name === 'Prathama'
        ) || batches.find(b => b.department._id.toString() === department._id.toString());
        
        if (!suitableBatch) {
          results.failed.push({
            index: i,
            data: studentData,
            error: `No batch found for department: ${department.name}`
          });
          continue;
        }
        
        // Process dates
        const dateOfBirth = studentData.dateOfBirth ? new Date(studentData.dateOfBirth) : null;
        const dateOfAdmission = studentData.dateOfAdmission ? new Date(studentData.dateOfAdmission) : new Date();
        
        // Create student record
        const student = new StudentSimple({
          admissionNo: studentData.admissionNo,
          fullName: studentData.fullName,
          dateOfBirth: dateOfBirth,
          bloodGroup: studentData.bloodGroup || 'O+',
          shaakha: studentData.shaakha,
          gothra: studentData.gothra,
          telephone: studentData.telephone,
          fatherName: studentData.fatherName,
          motherName: studentData.motherName || '',
          occupation: studentData.occupation,
          nationality: studentData.nationality || 'Indian',
          religion: studentData.religion || 'Hindu',
          caste: studentData.caste || 'Brahmin',
          motherTongue: studentData.motherTongue || 'Hindi',
          presentAddress: studentData.presentAddress,
          permanentAddress: studentData.permanentAddress === 'Same' ? studentData.presentAddress : studentData.permanentAddress,
          lastSchoolAttended: studentData.lastSchoolAttended,
          lastStandardStudied: studentData.lastStandardStudied,
          tcDetails: studentData.tcDetails,
          admittedToStandard: studentData.admittedToStandard || 'Prathama',
          dateOfAdmission: dateOfAdmission,
          currentStandard: studentData.currentStandard || studentData.admittedToStandard || 'Prathama',
          remarks: studentData.remarks || '',
          guardianInfo: {
            guardianPhone: studentData.telephone,
            guardianEmail: studentData.guardianEmail || ''
          }
        });
        
        const savedStudent = await student.save();
        
        // Create student assignment
        const assignment = new StudentAssignment({
          student: savedStudent._id,
          department: department._id,
          batch: suitableBatch._id,
          role: 'student',
          enrollmentDate: dateOfAdmission,
          status: 'active',
          assignedBy: null, // System assignment
          notes: `Bulk upload from sample data - ${studentData.shaakha}`
        });
        
        await assignment.save();
        
        results.successful.push({
          index: i,
          admissionNo: studentData.admissionNo,
          fullName: studentData.fullName,
          department: department.name,
          batch: suitableBatch.name,
          studentId: savedStudent._id,
          assignmentId: assignment._id
        });
        
        if ((i + 1) % 10 === 0) {
          console.log(`✅ Processed ${i + 1}/${studentsData.length} students`);
        }
        
      } catch (error) {
        results.failed.push({
          index: i,
          data: studentData,
          error: error.message
        });
      }
    }
    
    console.log('\n🎉 Bulk upload completed!');
    console.log(`✅ Successful: ${results.successful.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log(`📊 Total Processed: ${results.totalProcessed}`);
    
    if (results.failed.length > 0) {
      console.log('\n❌ Failed uploads:');
      results.failed.forEach(failure => {
        console.log(`   ${failure.index + 1}. ${failure.data.admissionNo} - ${failure.error}`);
      });
    }
    
    // Show summary by department
    const departmentSummary = {};
    results.successful.forEach(student => {
      if (!departmentSummary[student.department]) {
        departmentSummary[student.department] = 0;
      }
      departmentSummary[student.department]++;
    });
    
    console.log('\n📈 Students by Department:');
    Object.entries(departmentSummary).forEach(([dept, count]) => {
      console.log(`   • ${dept}: ${count} students`);
    });
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error during bulk upload:', error);
    process.exit(1);
  }
};

bulkUploadStudents();


