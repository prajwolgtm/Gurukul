#!/usr/bin/env node

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Department from '../models/Department.js';
import Batch from '../models/Batch.js';
import { connectDB } from '../config/db.js';

// Load environment variables
dotenv.config();

const batchTemplates = [
  {
    name: "Prathama (First Year)",
    code: "PRATHAMA",
    academicYear: "2024-25",
    currentSemester: 1,
    maxStudents: 60
  },
  {
    name: "Dwitiya (Second Year)",
    code: "DWITIYA", 
    academicYear: "2024-25",
    currentSemester: 2,
    maxStudents: 60
  },
  {
    name: "Tritiya (Third Year)",
    code: "TRITIYA",
    academicYear: "2024-25", 
    currentSemester: 3,
    maxStudents: 60
  },
  {
    name: "Chaturtha (Fourth Year)",
    code: "CHATURTHA",
    academicYear: "2024-25",
    currentSemester: 4,
    maxStudents: 60
  },
  {
    name: "Panchama (Fifth Year)",
    code: "PANCHAMA",
    academicYear: "2024-25",
    currentSemester: 5,
    maxStudents: 60
  }
];

async function createSampleBatches() {
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
    
    let totalBatches = 0;
    
    for (const department of departments) {
      console.log(`\n🏛️  Creating batches for ${department.name}...`);
      
      for (const template of batchTemplates) {
        const batchData = {
          ...template,
          department: department._id,
          code: `${department.code}_${template.code}`,
          name: `${template.name} - ${department.name.split('–')[0].trim()}`,
          status: 'active',
          isActive: true
        };
        
        // Check if batch already exists
        const existingBatch = await Batch.findOne({
          department: department._id,
          code: batchData.code
        });
        
        if (existingBatch) {
          console.log(`   ⚠️  Batch ${batchData.code} already exists, skipping...`);
          continue;
        }
        
        const batch = await Batch.create(batchData);
        console.log(`   ✅ Created: ${batch.name} (${batch.code})`);
        totalBatches++;
      }
    }
    
    console.log(`\n🎉 Successfully created ${totalBatches} batches across ${departments.length} departments`);
    console.log('\n🎯 Next steps:');
    console.log('   1. Assign students to departments and batches');
    console.log('   2. Update frontend to show department/batch selection');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the batch creation
createSampleBatches();
