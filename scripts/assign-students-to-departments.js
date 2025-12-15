#!/usr/bin/env node

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Department from '../models/Department.js';
import Batch from '../models/Batch.js';
import Student from '../models/Student.js';
import { connectDB } from '../config/db.js';

// Load environment variables
dotenv.config();

// Mapping of shaakha to department codes
const shaakhaToDepartment = {
  'Rig Veda': 'RIGVEDA_SHAKAL',
  'Atharvana Veda': 'ATHARVAVEDA_S',
  'Krishna Yajur Veda': 'KRISHNA_YAJUR_T',
  'Shukla Yajur Veda': 'SHUKLA_YAJUR_K',
  'Shukla Yajur Veda M': 'SHUKLA_YAJUR_M',
  'Shuklayajurveda': 'SHUKLA_YAJUR_K',
  'Shuklayajurveda M': 'SHUKLA_YAJUR_M',
  'Shuklayajurveda Kanva': 'SHUKLA_YAJUR_K',
  'Shuklayajurveda Madhyandina': 'SHUKLA_YAJUR_M',
  'Sama Veda': 'SAMAVEDA_R',
  'Samaveda': 'SAMAVEDA_R',
  'Samaveda Ranayaneeya': 'SAMAVEDA_R',
  'Samaveda Kauthuma': 'SAMAVEDA_K',
  'Sama Veda Ranayaneeya': 'SAMAVEDA_R',
  'Sama Veda Kauthuma': 'SAMAVEDA_K',
  'Atharva Veda': 'ATHARVAVEDA_S',
  'Atharvaveda': 'ATHARVAVEDA_S',
  'Atharvaveda Shaunaka': 'ATHARVAVEDA_S'
};

async function assignStudentsToDepartments() {
  try {
    console.log('🔄 Connecting to database...');
    await connectDB();
    
    console.log('📚 Fetching departments...');
    const departments = await Department.find({ isActive: true });
    
    if (departments.length === 0) {
      console.log('❌ No departments found. Please run initialize-vedic-departments.js first.');
      process.exit(1);
    }
    
    console.log(`📚 Found ${departments.length} departments`);
    
    // Create a map of department codes to department objects
    const departmentMap = {};
    departments.forEach(dept => {
      departmentMap[dept.code] = dept;
    });
    
    console.log('👥 Fetching students...');
    const students = await Student.find({ isActive: true });
    console.log(`👥 Found ${students.length} students`);
    
    let assignedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const student of students) {
      try {
        const shaakha = student.shaakha;
        const departmentCode = shaakhaToDepartment[shaakha];
        
        if (!departmentCode) {
          console.log(`⚠️  No department mapping found for shaakha: ${shaakha} (Student: ${student.fullName})`);
          skippedCount++;
          continue;
        }
        
        const department = departmentMap[departmentCode];
        if (!department) {
          console.log(`❌ Department not found for code: ${departmentCode}`);
          errorCount++;
          continue;
        }
        
        // Find a suitable batch (Prathama/First Year)
        const batch = await Batch.findOne({
          department: department._id,
          code: { $regex: /PRATHAMA/ },
          isActive: true,
          status: 'active'
        });
        
        if (!batch) {
          console.log(`⚠️  No Prathama batch found for department: ${department.name}`);
          // Still assign to department but without batch
          student.academicInfo = {
            department: department._id,
            batches: []
          };
        } else {
          // Assign to department and batch
          student.academicInfo = {
            department: department._id,
            batches: [{
              batch: batch._id,
              role: 'student',
              joinedDate: new Date(),
              status: 'active'
            }]
          };
          
          // Update batch student count
          await Batch.findByIdAndUpdate(batch._id, {
            $inc: { currentStudentCount: 1 }
          });
        }
        
        await student.save();
        console.log(`✅ Assigned ${student.fullName} to ${department.name}${batch ? ` (Batch: ${batch.name})` : ''}`);
        assignedCount++;
        
      } catch (error) {
        console.error(`❌ Error assigning student ${student.fullName}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`\n🎉 Assignment completed!`);
    console.log(`   ✅ Successfully assigned: ${assignedCount}`);
    console.log(`   ⚠️  Skipped (no mapping): ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    
    if (skippedCount > 0) {
      console.log('\n📝 Shaakha mappings that need attention:');
      const uniqueShaakhas = [...new Set(students.map(s => s.shaakha))];
      uniqueShaakhas.forEach(shaakha => {
        if (!shaakhaToDepartment[shaakha]) {
          console.log(`   - "${shaakha}"`);
        }
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the assignment
assignStudentsToDepartments();
