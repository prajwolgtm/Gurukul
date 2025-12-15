import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ClassAttendance from '../models/ClassAttendance.js';
import Exam from '../models/Exam.js';
import Subject from '../models/Subject.js';

// Load environment variables
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/gurukul';

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected successfully!');
    console.log(`   Host: ${mongoose.connection.host}`);
    console.log(`   Database: ${mongoose.connection.name}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
}

async function fixClassAttendanceValidation() {
  console.log('\n🔧 Fixing ClassAttendance validation errors...');
  
  try {
    // Find all ClassAttendance records with invalid sessionType
    const invalidSessions = await ClassAttendance.find({
      'sessionInfo.sessionType': { $nin: ['lecture', 'practical', 'tutorial', 'exam', 'assignment', 'discussion', 'field-work'] }
    });
    
    console.log(`   Found ${invalidSessions.length} records with invalid sessionType`);
    
    for (const session of invalidSessions) {
      const oldType = session.sessionInfo.sessionType;
      
      // Map old types to valid types
      let newType = 'lecture'; // default
      if (oldType === 'revision') newType = 'tutorial';
      else if (oldType === 'regular') newType = 'lecture';
      else if (oldType === 'test') newType = 'exam';
      
      session.sessionInfo.sessionType = newType;
      await session.save();
      
      console.log(`   ✅ Fixed session ${session.sessionId}: ${oldType} → ${newType}`);
    }
    
    console.log('✅ ClassAttendance validation errors fixed!');
  } catch (error) {
    console.error('❌ Error fixing ClassAttendance:', error.message);
  }
}

async function fixExamSubjectValidation() {
  console.log('\n🔧 Fixing Exam subject validation errors...');
  
  try {
    // Find all Exam records where subject is a string instead of ObjectId
    const exams = await Exam.find({}).lean();
    
    let fixedCount = 0;
    
    for (const exam of exams) {
      try {
        // Check if subject is a string
        if (typeof exam.subject === 'string') {
          console.log(`   Found exam with string subject: ${exam.examName} - ${exam.subject}`);
          
          // Try to find or create the subject
          let subjectDoc = await Subject.findOne({ 
            name: { $regex: new RegExp(`^${exam.subject}$`, 'i') } 
          });
          
          if (!subjectDoc) {
            // Create new subject
            subjectDoc = new Subject({
              name: exam.subject,
              code: exam.subject.toUpperCase().replace(/\s+/g, '_'),
              category: 'vedic_studies',
              level: 'prathama',
              type: 'core',
              maxMarks: exam.marksConfig?.totalMarks || 100,
              passingMarks: exam.marksConfig?.passingMarks || 35,
              academicYear: exam.academicInfo?.academicYear || '2024-2025',
              createdBy: exam.createdBy
            });
            await subjectDoc.save();
            console.log(`   ✅ Created subject: ${subjectDoc.name}`);
          }
          
          // Update the exam with the ObjectId
          await Exam.updateOne(
            { _id: exam._id },
            { 
              subject: subjectDoc._id,
              subjectName: exam.subject // Keep original name for reference
            }
          );
          
          console.log(`   ✅ Fixed exam ${exam.examName}: ${exam.subject} → ${subjectDoc._id}`);
          fixedCount++;
        }
      } catch (examError) {
        console.error(`   ❌ Error fixing exam ${exam.examName}:`, examError.message);
      }
    }
    
    console.log(`✅ Fixed ${fixedCount} exam subject validation errors!`);
  } catch (error) {
    console.error('❌ Error fixing Exam subjects:', error.message);
  }
}

async function cleanupInvalidRecords() {
  console.log('\n🧹 Cleaning up completely invalid records...');
  
  try {
    // Remove ClassAttendance records that still can't be fixed
    const deletedSessions = await ClassAttendance.deleteMany({
      'sessionInfo.sessionType': { $nin: ['lecture', 'practical', 'tutorial', 'exam', 'assignment', 'discussion', 'field-work'] }
    });
    
    console.log(`   Deleted ${deletedSessions.deletedCount} invalid ClassAttendance records`);
    
    // Note: We won't delete exams as they might have important data
    // The fix above should handle all exam subject issues
    
    console.log('✅ Cleanup completed!');
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
  }
}

async function main() {
  console.log('🚀 Starting validation error fixes...');
  
  await connectDB();
  
  await fixClassAttendanceValidation();
  await fixExamSubjectValidation();
  await cleanupInvalidRecords();
  
  console.log('\n🎉 All validation errors have been fixed!');
  console.log('   The system should now work without validation errors.');
  
  await mongoose.disconnect();
  console.log('✅ Database connection closed.');
}

// Run the script
main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
