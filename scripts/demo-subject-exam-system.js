import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Subject from '../models/Subject.js';
import Exam from '../models/Exam.js';
import ExamMarks from '../models/ExamMarks.js';
import User from '../models/User.js';
import Department from '../models/Department.js';
import Batch from '../models/Batch.js';
import StudentSimple from '../models/StudentSimple.js';
import StudentAssignment from '../models/StudentAssignment.js';
import { ROLES } from '../utils/roles.js';

const demoSubjectExamSystem = async () => {
  try {
    console.log('🚀 Starting Subject & Exam Management System Demo...');
    
    // Connect to MongoDB
    await connectDB();
    
    // Get or create demo users
    let coordinator = await User.findOne({ role: ROLES.COORDINATOR });
    if (!coordinator) {
      coordinator = await User.create({
        fullName: 'Demo Coordinator',
        email: 'coordinator@demo.gurukul.edu',
        password: 'demo123',
        role: ROLES.COORDINATOR,
        isVerified: true,
        accountStatus: 'verified',
        employeeId: 'COORD001'
      });
      console.log('✅ Created demo coordinator');
    }
    
    let teacher = await User.findOne({ role: ROLES.TEACHER, isVerified: true });
    if (!teacher) {
      teacher = await User.create({
        fullName: 'Demo Teacher',
        email: 'teacher@demo.gurukul.edu',
        password: 'demo123',
        role: ROLES.TEACHER,
        isVerified: true,
        accountStatus: 'verified',
        employeeId: 'TEACH001'
      });
      console.log('✅ Created demo teacher');
    }
    
    // Get departments and batches
    const departments = await Department.find({}).limit(3);
    const batches = await Batch.find({}).limit(5);
    
    if (departments.length === 0 || batches.length === 0) {
      console.log('❌ No departments or batches found. Please run the Vedic departments setup script first.');
      process.exit(1);
    }
    
    console.log(`📚 Found ${departments.length} departments and ${batches.length} batches`);
    
    // 1. CREATE SUBJECTS
    console.log('\n📖 Creating demo subjects...');
    
    const subjectsData = [
      {
        name: 'Rigveda Samhita',
        code: 'RV101',
        description: 'Study of Rigveda hymns and mantras',
        category: 'vedic_studies',
        level: 'prathama',
        type: 'core',
        credits: 4,
        maxMarks: 100,
        passingMarks: 35,
        academicYear: '2024-2025',
        semester: 1,
        weeklyHours: 5
      },
      {
        name: 'Sanskrit Grammar',
        code: 'SK101',
        description: 'Basic Sanskrit grammar and composition',
        category: 'sanskrit',
        level: 'prathama',
        type: 'core',
        credits: 3,
        maxMarks: 100,
        passingMarks: 35,
        academicYear: '2024-2025',
        semester: 1,
        weeklyHours: 4
      },
      {
        name: 'Vedic Mathematics',
        code: 'VM101',
        description: 'Traditional Indian mathematical concepts',
        category: 'mathematics',
        level: 'prathama',
        type: 'elective',
        credits: 2,
        maxMarks: 50,
        passingMarks: 20,
        academicYear: '2024-2025',
        semester: 1,
        weeklyHours: 3
      }
    ];
    
    const createdSubjects = [];
    
    for (const subjectData of subjectsData) {
      // Check if subject already exists
      let subject = await Subject.findOne({ code: subjectData.code });
      
      if (!subject) {
        subject = await Subject.create({
          ...subjectData,
          departments: departments.slice(0, 2).map(d => d._id),
          batches: batches.slice(0, 3).map(b => b._id),
          createdBy: coordinator._id
        });
        
        // Assign teacher to subject
        await subject.assignTeacher(teacher._id, true, '2024-2025', 1);
        
        console.log(`   ✅ Created subject: ${subject.name} (${subject.code})`);
      } else {
        console.log(`   ⚠️  Subject already exists: ${subject.name} (${subject.code})`);
      }
      
      createdSubjects.push(subject);
    }
    
    // 2. CREATE EXAMS
    console.log('\n📝 Creating demo exams...');
    
    for (const subject of createdSubjects) {
      const examData = {
        examName: `${subject.name} - Midterm Exam`,
        examType: 'midterm',
        subject: subject._id,
        description: `Midterm examination for ${subject.name}`,
        academicInfo: {
          academicYear: '2024-2025',
          term: 'fall',
          semester: 1
        },
        studentSelection: {
          selectionType: 'batch',
          batches: subject.batches,
          departments: subject.departments,
          filters: {
            includeInactive: false
          }
        },
        schedule: {
          startDate: new Date('2024-12-15'),
          endDate: new Date('2024-12-15'),
          startTime: '10:00',
          endTime: '12:00',
          duration: 120
        },
        marksConfig: {
          totalMarks: subject.maxMarks,
          passingMarks: subject.passingMarks,
          gradeScale: 'percentage',
          components: [
            {
              name: 'Theory',
              maxMarks: subject.maxMarks * 0.8,
              weightage: 80,
              isRequired: true
            },
            {
              name: 'Practical',
              maxMarks: subject.maxMarks * 0.2,
              weightage: 20,
              isRequired: true
            }
          ]
        },
        instructions: {
          generalInstructions: [
            'Read all questions carefully',
            'Answer all questions',
            'Write clearly and legibly'
          ],
          allowedMaterials: ['Pen', 'Pencil', 'Eraser'],
          prohibitedItems: ['Mobile phone', 'Calculator', 'Books']
        },
        settings: {
          allowLateSubmission: false,
          allowMakeupExam: true,
          autoPublishResults: false
        }
      };
      
      // Check if exam already exists
      const existingExam = await Exam.findOne({
        examName: examData.examName,
        'academicInfo.academicYear': examData.academicInfo.academicYear
      });
      
      if (!existingExam) {
        const examId = Exam.generateExamId('EX');
        const exam = await Exam.create({
          ...examData,
          examId,
          createdBy: teacher._id
        });
        
        console.log(`   ✅ Created exam: ${exam.examName} (${exam.examId})`);
        
        // 3. CREATE MARKS ENTRIES FOR STUDENTS
        console.log(`   📊 Creating marks entries for exam: ${exam.examName}`);
        
        // Get students from the selected batches
        const studentAssignments = await StudentAssignment.find({
          batch: { $in: exam.studentSelection.batches },
          status: 'active'
        }).populate('student').limit(10); // Limit to 10 students for demo
        
        if (studentAssignments.length > 0) {
          const marksEntries = [];
          
          for (const assignment of studentAssignments) {
            const marksEntry = new ExamMarks({
              exam: exam._id,
              subject: subject._id,
              student: assignment.student._id,
              studentAssignment: assignment._id,
              attendance: {
                status: Math.random() > 0.1 ? 'present' : 'absent', // 90% attendance
                markedBy: teacher._id,
                markedAt: new Date()
              },
              marksComponents: exam.marksConfig.components.map(component => ({
                componentName: component.name,
                maxMarks: component.maxMarks,
                marksObtained: Math.floor(Math.random() * component.maxMarks * 0.9) + (component.maxMarks * 0.1), // Random marks between 10-100%
                weightage: component.weightage,
                enteredBy: teacher._id,
                enteredAt: new Date()
              })),
              totalMarks: {
                maxMarks: exam.marksConfig.totalMarks,
                marksObtained: 0, // Will be calculated by pre-save middleware
                percentage: 0
              },
              result: {
                status: 'pending',
                passingMarks: exam.marksConfig.passingMarks,
                isPassed: false
              },
              academicInfo: {
                academicYear: exam.academicInfo.academicYear,
                semester: exam.academicInfo.semester,
                term: exam.academicInfo.term,
                department: assignment.department,
                batch: assignment.batch
              },
              workflow: {
                isMarksEntered: true,
                marksEnteredBy: teacher._id,
                marksEnteredAt: new Date(),
                isVerified: true,
                verifiedBy: coordinator._id,
                verifiedAt: new Date()
              }
            });
            
            marksEntries.push(marksEntry);
          }
          
          const savedMarks = await ExamMarks.insertMany(marksEntries);
          console.log(`   ✅ Created marks entries for ${savedMarks.length} students`);
          
          // Calculate and display statistics
          const statistics = await ExamMarks.calculateClassStatistics(exam._id);
          if (statistics) {
            console.log(`   📈 Exam Statistics:`);
            console.log(`      • Total Students: ${statistics.totalStudents}`);
            console.log(`      • Average Marks: ${statistics.averageMarks.toFixed(2)}`);
            console.log(`      • Pass Percentage: ${statistics.passPercentage.toFixed(2)}%`);
            console.log(`      • Highest Marks: ${statistics.highestMarks}`);
            console.log(`      • Lowest Marks: ${statistics.lowestMarks}`);
          }
        } else {
          console.log(`   ⚠️  No students found for exam: ${exam.examName}`);
        }
      } else {
        console.log(`   ⚠️  Exam already exists: ${examData.examName}`);
      }
    }
    
    // 4. DISPLAY SYSTEM SUMMARY
    console.log('\n🎉 Demo completed successfully!');
    console.log('\n📊 System Summary:');
    
    const subjectCount = await Subject.countDocuments({ isActive: true });
    const examCount = await Exam.countDocuments({ isDeleted: false });
    const marksCount = await ExamMarks.countDocuments({ isDeleted: false });
    const teacherCount = await User.countDocuments({ role: ROLES.TEACHER, isVerified: true });
    
    console.log(`   • Active Subjects: ${subjectCount}`);
    console.log(`   • Total Exams: ${examCount}`);
    console.log(`   • Marks Entries: ${marksCount}`);
    console.log(`   • Verified Teachers: ${teacherCount}`);
    
    console.log('\n🔗 API Endpoints to test:');
    console.log('   📚 Subjects:');
    console.log('      GET /api/subjects - List all subjects');
    console.log('      POST /api/subjects - Create new subject');
    console.log('      POST /api/subjects/:id/assign-teacher - Assign teacher to subject');
    
    console.log('   📝 Exams:');
    console.log('      POST /api/enhanced-exams - Create new exam');
    console.log('      GET /api/enhanced-exams/:id/eligible-students - Get eligible students');
    console.log('      GET /api/enhanced-exams/subject/:subjectId - Get exams by subject');
    
    console.log('   📊 Marks:');
    console.log('      POST /api/marks-management/bulk-create - Create marks entries');
    console.log('      GET /api/marks-management/exam/:examId - Get exam marks');
    console.log('      PUT /api/marks-management/:id/marks - Update student marks');
    console.log('      GET /api/marks-management/exam/:examId/statistics - Get exam statistics');
    
    console.log('\n👥 Demo Login Credentials:');
    console.log('   🏠 Coordinator: coordinator@demo.gurukul.edu / demo123');
    console.log('   👨‍🏫 Teacher: teacher@demo.gurukul.edu / demo123');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error in demo:', error);
    process.exit(1);
  }
};

demoSubjectExamSystem();
