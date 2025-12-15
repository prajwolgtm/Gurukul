import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Department from '../models/Department.js';
import AttendanceSession from '../models/AttendanceSession.js';
import { connectDB } from '../config/db.js';

// Load environment variables
dotenv.config();

const initializeDefaults = async () => {
  try {
    console.log('🚀 Starting initialization of default data...');
    
    // Connect to MongoDB
    await connectDB();
    console.log('✅ Connected to MongoDB');
    
    // Initialize default attendance sessions
    console.log('📝 Initializing default attendance sessions...');
    const sessions = await AttendanceSession.initializeDefaults();
    console.log(`✅ Initialized ${sessions.length} attendance sessions`);
    
    // Initialize default departments
    console.log('🏛️ Initializing default departments...');
    const departmentsData = [
      {
        name: "Dept 1",
        code: "DEPT001",
        description: "First Department - Vedic Studies",
        isActive: true,
        settings: {
          maxStudents: 50,
          allowSubDepartments: true,
          allowMultipleBatches: true
        }
      },
      {
        name: "Dept 2", 
        code: "DEPT002",
        description: "Second Department - Sanskrit Literature",
        isActive: true,
        settings: {
          maxStudents: 45,
          allowSubDepartments: true,
          allowMultipleBatches: true
        }
      },
      {
        name: "Dept 3",
        code: "DEPT003", 
        description: "Third Department - Philosophy & Logic",
        isActive: true,
        settings: {
          maxStudents: 40,
          allowSubDepartments: true,
          allowMultipleBatches: true
        }
      },
      {
        name: "Dept 4",
        code: "DEPT004",
        description: "Fourth Department - Mathematics & Astronomy",
        isActive: true,
        settings: {
          maxStudents: 35,
          allowSubDepartments: true,
          allowMultipleBatches: true
        }
      },
      {
        name: "Dept 5",
        code: "DEPT005",
        description: "Fifth Department - Medicine & Ayurveda",
        isActive: true,
        settings: {
          maxStudents: 30,
          allowSubDepartments: true,
          allowMultipleBatches: true
        }
      },
      {
        name: "Dept 6",
        code: "DEPT006",
        description: "Sixth Department - Arts & Culture",
        isActive: true,
        settings: {
          maxStudents: 40,
          allowSubDepartments: true,
          allowMultipleBatches: true
        }
      },
      {
        name: "Dept 7",
        code: "DEPT007",
        description: "Seventh Department - Modern Sciences",
        isActive: true,
        settings: {
          maxStudents: 35,
          allowSubDepartments: true,
          allowMultipleBatches: true
        }
      }
    ];
    
    // Clear existing departments
    await Department.deleteMany({});
    console.log('🗑️ Cleared existing departments');
    
    // Insert default departments
    const departments = await Department.insertMany(departmentsData);
    console.log(`✅ Initialized ${departments.length} departments`);
    
    console.log('\n🎉 Default data initialization completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   • Attendance Sessions: ${sessions.length}`);
    console.log(`   • Departments: ${departments.length}`);
    
    console.log('\n🏛️ Departments created:');
    departments.forEach(dept => {
      console.log(`   • ${dept.name} (${dept.code})`);
    });
    
    console.log('\n⏰ Attendance Sessions created:');
    sessions.forEach(session => {
      console.log(`   • ${session.displayNames.english} (${session.defaultTime})`);
    });
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error during initialization:', error);
    process.exit(1);
  }
};

// Run the initialization
initializeDefaults();
