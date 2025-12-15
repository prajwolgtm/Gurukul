#!/usr/bin/env node

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Department from '../models/Department.js';
import { connectDB } from '../config/db.js';

// Load environment variables
dotenv.config();

const vedicDepartments = [
  {
    name: "Rigveda – Shaakal",
    code: "RIGVEDA_SHAKAL",
    description: "Rigveda Shaakal - First Veda with Shaakal recension",
    isActive: true,
    settings: {
      maxStudentsPerBatch: 60,
      minStudentsPerBatch: 20,
      allowSubDepartments: true,
      allowMultipleBatches: true
    }
  },
  {
    name: "Krishna Yajurveda – Taittiriya",
    code: "KRISHNA_YAJUR_T",
    description: "Krishna Yajurveda Taittiriya - Black Yajurveda with Taittiriya recension",
    isActive: true,
    settings: {
      maxStudentsPerBatch: 60,
      minStudentsPerBatch: 20,
      allowSubDepartments: true,
      allowMultipleBatches: true
    }
  },
  {
    name: "Shukla Yajurveda – Kanva",
    code: "SHUKLA_YAJUR_K",
    description: "Shukla Yajurveda Kanva - White Yajurveda with Kanva recension",
    isActive: true,
    settings: {
      maxStudentsPerBatch: 60,
      minStudentsPerBatch: 20,
      allowSubDepartments: true,
      allowMultipleBatches: true
    }
  },
  {
    name: "Shukla Yajurveda – Madhyandina",
    code: "SHUKLA_YAJUR_M",
    description: "Shukla Yajurveda Madhyandina - White Yajurveda with Madhyandina recension",
    isActive: true,
    settings: {
      maxStudentsPerBatch: 60,
      minStudentsPerBatch: 20,
      allowSubDepartments: true,
      allowMultipleBatches: true
    }
  },
  {
    name: "Samaveda – Ranayaneeya",
    code: "SAMAVEDA_R",
    description: "Samaveda Ranayaneeya - Third Veda with Ranayaneeya recension",
    isActive: true,
    settings: {
      maxStudentsPerBatch: 60,
      minStudentsPerBatch: 20,
      allowSubDepartments: true,
      allowMultipleBatches: true
    }
  },
  {
    name: "Samaveda – Kauthuma",
    code: "SAMAVEDA_K",
    description: "Samaveda Kauthuma - Third Veda with Kauthuma recension",
    isActive: true,
    settings: {
      maxStudentsPerBatch: 60,
      minStudentsPerBatch: 20,
      allowSubDepartments: true,
      allowMultipleBatches: true
    }
  },
  {
    name: "Atharvaveda – Shaunaka",
    code: "ATHARVAVEDA_S",
    description: "Atharvaveda Shaunaka - Fourth Veda with Shaunaka recension",
    isActive: true,
    settings: {
      maxStudentsPerBatch: 60,
      minStudentsPerBatch: 20,
      allowSubDepartments: true,
      allowMultipleBatches: true
    }
  }
];

async function initializeVedicDepartments() {
  try {
    console.log('🔄 Connecting to database...');
    await connectDB();
    
    console.log('🗑️  Clearing existing departments...');
    await Department.deleteMany({});
    
    console.log('📚 Creating Vedic departments...');
    const departments = await Department.insertMany(vedicDepartments);
    
    console.log(`✅ Successfully created ${departments.length} Vedic departments:`);
    departments.forEach(dept => {
      console.log(`   - ${dept.name} (${dept.code})`);
    });
    
    console.log('\n🎯 Next steps:');
    console.log('   1. Create batches for each department');
    console.log('   2. Assign students to departments and batches');
    console.log('   3. Update frontend to show department/batch selection');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the initialization
initializeVedicDepartments();
