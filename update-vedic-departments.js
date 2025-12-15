import mongoose from 'mongoose';
import Department from './models/Department.js';
import Batch from './models/Batch.js';
import { connectDB } from './config/db.js';

const updateVedicDepartments = async () => {
  try {
    console.log('🚀 Updating departments to Vedic structure...');
    
    // Connect to MongoDB
    await connectDB();
    
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
    
    // Clear existing departments and batches
    await Batch.deleteMany({});
    console.log('🗑️ Cleared existing batches');
    
    await Department.deleteMany({});
    console.log('🗑️ Cleared existing departments');
    
    // Insert Vedic departments
    const departments = await Department.insertMany(vedicDepartments);
    console.log(`✅ Created ${departments.length} Vedic departments`);
    
    // Create default batches for each department
    const batchNames = ['Prathama', 'Dwitiya', 'Tritiya', 'Chaturtha', 'Panchama'];
    const allBatches = [];
    
    for (const dept of departments) {
      for (let i = 0; i < batchNames.length; i++) {
        const batch = {
          name: batchNames[i],
          code: `${dept.code}_${batchNames[i].toUpperCase()}`,
          department: dept._id,
          description: `${batchNames[i]} batch for ${dept.name}`,
          academicYear: '2025-2026',
          currentSemester: 1,
          capacity: dept.settings.maxStudentsPerBatch,
          isActive: true,
          settings: {
            allowLateEnrollment: true,
            requireApproval: false,
            maxAbsences: 10
          }
        };
        allBatches.push(batch);
      }
    }
    
    const createdBatches = await Batch.insertMany(allBatches);
    console.log(`✅ Created ${createdBatches.length} batches`);
    
    console.log('\n🎉 Vedic departments and batches created successfully!');
    console.log('\n🏛️ Departments:');
    departments.forEach(dept => {
      const deptBatches = createdBatches.filter(b => b.department.toString() === dept._id.toString());
      console.log(`   • ${dept.name} (${dept.code}) - ${deptBatches.length} batches`);
    });
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error updating departments:', error);
    process.exit(1);
  }
};

updateVedicDepartments();

