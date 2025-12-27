import express from 'express';
import mongoose from 'mongoose';
import { auth } from '../middleware/auth.js';
import { permit, requireAccessLevel } from '../middleware/rbac.js';
import { ROLES } from '../utils/roles.js';
import Exam from '../models/Exam.js';
import ExamGroup from '../models/ExamGroup.js';
import ExamResult from '../models/ExamResult.js';
import ExamMarks from '../models/ExamMarks.js';
import Student from '../models/Student.js';
import Subject from '../models/Subject.js';
import { generateSubjectMarksheet, generateStudentMarksheet, generateCompleteExamReport } from '../utils/pdfGenerator.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// ==================== EXAM REPORTING APIS ====================

// 📊 GET /api/exam-reports/exam/:examId - Complete exam report
router.get('/exam/:examId', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const { format = 'summary', includeUnpublished = 'false' } = req.query;
    const { examId: examIdParam } = req.params;

    // Try finding by Mongo _id first, then by custom examId field
    let exam = null;
    if (mongoose.Types.ObjectId.isValid(examIdParam)) {
      exam = await Exam.findById(examIdParam)
        .populate('createdBy', 'personalInfo.fullName role');
    }

    if (!exam) {
      exam = await Exam.findOne({
        examId: examIdParam
    }).populate('createdBy', 'personalInfo.fullName role');
    }

    // Fallback: if exam document is missing but marks exist, allow report generation
    if (!exam) {
      const marksForExam = await ExamMarks.findOne({ exam: examIdParam });
      if (!marksForExam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }
      // Build a minimal exam placeholder so report can still be generated from marks
      exam = {
        _id: examIdParam,
        examId: examIdParam,
        examName: 'Exam',
        name: 'Exam',
        examType: 'N/A',
        status: 'completed',
        subject: null,
        subjects: [],
        academicYear: 'N/A',
        semester: 'N/A',
        createdBy: null
      };
    }

    const examObjectId = exam._id;

    // Get all groups for this exam
    const groups = await ExamGroup.find({
      exam: examObjectId,
      isDeleted: { $ne: true }
    }).populate('assignedTeachers.teacher', 'personalInfo.fullName role');

    // Build results query
    let resultsQuery = { exam: examObjectId, isDeleted: { $ne: true } };
    
    // For teachers, only show published results unless they're assigned to the exam
    if (req.user.role === ROLES.TEACHER) {
      const assignedGroup = groups.find(group => 
        group.assignedTeachers.some(t => 
          t.teacher._id.toString() === req.user.id && t.assignment.isActive
        )
      );
      
      if (!assignedGroup && includeUnpublished !== 'true') {
        resultsQuery['result.isPublished'] = true;
      }
    }

    let derivedFromMarks = false;

    let results = await ExamResult.find(resultsQuery)
      .populate('student', 'personalInfo.fullName studentId academicInfo')
      .populate('examGroup', 'groupName')
      .sort({ 'studentExamInfo.rollNumber': 1 });

    // Fallback: if no ExamResult docs, derive from ExamMarks
    if (!results || results.length === 0) {
      derivedFromMarks = true;
      const marksEntries = await ExamMarks.find({ exam: examObjectId })
        .populate('student', 'fullName admissionNo studentId personalInfo.fullName academicInfo')
        .populate('subjectMarks.subject', 'name code');

      results = marksEntries.map(m => ({
        _id: m._id,
        student: {
          _id: m.student?._id || m.student?.id || null,
          id: m.student?._id || m.student?.id || null,
          fullName: m.student?.fullName || m.student?.personalInfo?.fullName || 'N/A',
          name: m.student?.fullName || m.student?.personalInfo?.fullName || m.student?.name || 'N/A',
          studentId: m.student?.studentId || m.student?.admissionNo || 'N/A',
          admissionNo: m.student?.admissionNo || m.student?.studentId || 'N/A',
          personalInfo: m.student?.personalInfo || {}
        },
        examGroup: { _id: null, groupName: 'N/A' },
        attendance: m.isPresent ? 'present' : 'absent',
        result: {
          finalMarks: m.totalMarksObtained ?? 0,
          isPass: m.isPassed ?? false,
          grade: m.overallGrade ?? null,
          status: m.isPassed ? 'pass' : 'fail'
        },
        marks: {
          obtained: m.totalMarksObtained ?? 0,
          total: m.totalMaxMarks ?? 0,
          percentage: m.overallPercentage ?? 0
        },
        subjectMarks: m.subjectMarks || []
      }));
    }

    // Generate statistics
    let statistics = [];
    if (!derivedFromMarks && results && results.length > 0 && typeof ExamResult.getExamStatistics === 'function') {
      statistics = await ExamResult.getExamStatistics(req.params.examId);
    } else {
      // Compute basic stats from derived results when using ExamMarks fallback
      const totalStudents = results.length;
      const studentsPresent = results.filter(r => r.attendance === 'present').length;
      const studentsAbsent = totalStudents - studentsPresent;
      const studentsPassed = results.filter(r => r.result?.isPass).length;
      const passPercentage = totalStudents ? (studentsPassed / totalStudents) * 100 : 0;
      const highestMarks = results.reduce((max, r) => Math.max(max, r.marks?.obtained ?? 0), 0);
      const lowestMarks = results.reduce((min, r) => Math.min(min, r.marks?.obtained ?? 0), totalStudents ? (results[0].marks?.obtained ?? 0) : 0);
      const averagePercentage = totalStudents ? (results.reduce((sum, r) => sum + (r.marks?.percentage ?? 0), 0) / totalStudents) : 0;
      statistics = [{
        totalStudents,
        studentsPresent,
        studentsAbsent,
        studentsPassed,
        passPercentage,
        highestMarks,
        lowestMarks,
        averagePercentage
      }];
    }
    const examStats = statistics[0] || {};

    // Grade distribution
    const gradeDistribution = results.reduce((acc, result) => {
      if (result.result.grade) {
        acc[result.result.grade] = (acc[result.result.grade] || 0) + 1;
      }
      return acc;
    }, {});

    // Group-wise performance
    // Groups not needed for single-exam view; keep empty
    const groupPerformance = [];

    const report = {
      exam: {
        examId: exam.examId,
        examName: exam.examName || exam.name || 'Exam',
        subject: exam.subject || null,
        examType: exam.examType || 'N/A',
        totalMarks: (exam.marksConfig && exam.marksConfig.totalMarks) ? exam.marksConfig.totalMarks : (exam.totalMarks || 0),
        passingMarks: (exam.marksConfig && exam.marksConfig.passingMarks) ? exam.marksConfig.passingMarks : (exam.passingMarks || 0),
        schedule: exam.schedule || {},
        status: exam.status || 'completed',
        createdBy: exam.createdBy || null
      },
      statistics: {
        totalStudents: examStats.totalStudents || 0,
        studentsPresent: examStats.studentsPresent || 0,
        studentsAbsent: examStats.studentsAbsent || 0,
        studentsPassed: examStats.studentsPassed || 0,
        studentsFailed: examStats.studentsPresent - examStats.studentsPassed || 0,
        averagePercentage: Math.round(examStats.averagePercentage || 0),
        highestMarks: examStats.highestMarks || 0,
        lowestMarks: examStats.lowestMarks || 0,
        passPercentage: Math.round(examStats.passPercentage || 0),
        gradeDistribution
      },
      groups: groupPerformance
    };

    // Include detailed results if requested
    if (format === 'detailed') {
      report.results = results.map(result => {
        const student = result.student || {};
        const examGroup = result.examGroup || {};
        const attendanceVal = result.attendance?.status || result.attendance || 'present';

        // Components from marks (ExamResult) or subjectMarks (ExamMarks fallback)
        const components = (result.marks && Array.isArray(result.marks.components))
          ? result.marks.components.map(comp => ({
            name: comp.name,
            maxMarks: comp.maxMarks,
            obtainedMarks: comp.obtainedMarks,
            percentage: comp.percentage
            }))
          : (Array.isArray(result.subjectMarks)
              ? result.subjectMarks.map(sm => ({
                  name: sm.subject?.name || sm.subjectName || sm.subject || 'Subject',
                  maxMarks: sm.maxMarks,
                  obtainedMarks: sm.marksObtained,
                  percentage: sm.maxMarks ? (sm.marksObtained / sm.maxMarks) * 100 : 0
                }))
              : []);

        const obtained = (result.result && result.result.finalMarks !== undefined)
          ? result.result.finalMarks
          : (result.totalMarksObtained ?? 0);

        const total = (result.marks && result.marks.totalMaxMarks !== undefined)
          ? result.marks.totalMaxMarks
          : (result.totalMaxMarks ?? exam.totalMarks ?? 0);

        const percentage = (result.result && result.result.finalPercentage !== undefined)
          ? result.result.finalPercentage
          : (result.overallPercentage ?? (total ? (obtained / total) * 100 : 0));

        const grade = result.result?.grade ?? result.overallGrade ?? '';
        const isPass = (result.result?.isPass !== undefined)
          ? result.result.isPass
          : (result.isPassed ?? (grade ? grade !== 'F' : false));
        const statusVal = result.result?.status ?? (isPass ? 'pass' : 'fail');
        const isPublished = result.result?.isPublished ?? false;

        return {
          resultId: result.resultId || result._id,
          student: {
            id: student._id?.toString() || student.id?.toString() || student._id || student.id,
            _id: student._id?.toString() || student.id?.toString() || student._id || student.id,
            name: student.fullName || student.personalInfo?.fullName || student.name || 'N/A',
            studentId: student.studentId || student.admissionNo || 'N/A',
            rollNumber: result.studentExamInfo?.rollNumber || ''
          },
          group: 'N/A',
          attendance: attendanceVal,
          marks: {
            components,
            obtained,
            total,
            percentage,
            subjectMarks: Array.isArray(result.subjectMarks) && result.subjectMarks.length > 0
              ? result.subjectMarks.map(sm => ({
                  subject: sm.subject?._id || sm.subject,
                  subjectName: sm.subject?.name || sm.name || 'Subject',
                  name: sm.subject?.name || sm.name || sm.subjectName || 'Subject',
                  marksObtained: sm.marksObtained || sm.obtainedMarks || 0,
                  obtainedMarks: sm.marksObtained || sm.obtainedMarks || 0,
                  maxMarks: sm.maxMarks || 0,
                  percentage: sm.percentage || (sm.maxMarks ? (sm.marksObtained || 0) / sm.maxMarks * 100 : 0)
                }))
              : (Array.isArray(result.marks?.subjectMarks) ? result.marks.subjectMarks : [])
        },
        result: {
            grade,
            status: statusVal,
            isPass,
            isPublished
        }
        };
      });
    }

    res.json({
      success: true,
      message: 'Exam report generated successfully',
      data: report
    });
  } catch (error) {
    console.error('Error generating exam report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate exam report',
      error: error.message
    });
  }
});

// 👤 GET /api/exam-reports/student/:studentId - Student performance report
router.get('/student/:studentId', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER, ROLES.STUDENT, ROLES.PARENT), async (req, res) => {
  try {
    const { academicYear, subject, examType, includeUnpublished = 'false' } = req.query;

    // Access control
    if (req.user.role === ROLES.STUDENT && req.user.linkedStudent?.toString() !== req.params.studentId) {
      return res.status(403).json({
        success: false,
        message: 'Students can only view their own reports'
      });
    }

    if (req.user.role === ROLES.PARENT && req.user.linkedStudent?.toString() !== req.params.studentId) {
      return res.status(403).json({
        success: false,
        message: 'Parents can only view their child\'s reports'
      });
    }

    // Get student details
    const student = await Student.findOne({
      _id: req.params.studentId,
      isDeleted: false
    }).populate('academicInfo.department academicInfo.subDepartments.subDepartment academicInfo.batches.batch');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Build results query
    let resultsQuery = { student: req.params.studentId, isDeleted: false };
    
    // Filter by published results for students and parents
    if (req.user.role === ROLES.STUDENT || req.user.role === ROLES.PARENT) {
      resultsQuery['result.isPublished'] = true;
    } else if (includeUnpublished !== 'true') {
      resultsQuery['result.isPublished'] = true;
    }

    // Add additional filters
    if (academicYear || subject || examType) {
      const examFilters = {};
      if (academicYear) examFilters['academicInfo.academicYear'] = academicYear;
      if (subject) examFilters.subject = new RegExp(subject, 'i');
      if (examType) examFilters.examType = examType;

      const matchingExams = await Exam.find(examFilters).select('_id');
      resultsQuery.exam = { $in: matchingExams.map(e => e._id) };
    }

    const results = await ExamResult.find(resultsQuery)
      .populate('exam', 'examName subject examType schedule academicInfo totalMarks')
      .populate('examGroup', 'groupName')
      .sort({ 'exam.schedule.startDate': -1 });

    // Calculate overall statistics
    const presentResults = results.filter(r => r.attendance.status === 'present');
    const totalExams = presentResults.length;
    const passedExams = presentResults.filter(r => r.result.isPass).length;
    const failedExams = totalExams - passedExams;

    const averagePercentage = totalExams > 0 ? 
      presentResults.reduce((sum, r) => sum + r.result.finalPercentage, 0) / totalExams : 0;

    const highestPercentage = totalExams > 0 ? 
      Math.max(...presentResults.map(r => r.result.finalPercentage)) : 0;

    const lowestPercentage = totalExams > 0 ? 
      Math.min(...presentResults.map(r => r.result.finalPercentage)) : 0;

    // Subject-wise performance
    const subjectPerformance = presentResults.reduce((acc, result) => {
      const subject = result.exam.subject;
      if (!acc[subject]) {
        acc[subject] = {
          subject,
          totalExams: 0,
          passedExams: 0,
          averagePercentage: 0,
          totalMarks: 0
        };
      }
      
      acc[subject].totalExams++;
      if (result.result.isPass) acc[subject].passedExams++;
      acc[subject].totalMarks += result.result.finalPercentage;
      
      return acc;
    }, {});

    // Calculate averages for each subject
    Object.values(subjectPerformance).forEach(subject => {
      subject.averagePercentage = Math.round(subject.totalMarks / subject.totalExams);
      subject.passPercentage = Math.round((subject.passedExams / subject.totalExams) * 100);
      delete subject.totalMarks;
    });

    // Grade distribution
    const gradeDistribution = presentResults.reduce((acc, result) => {
      if (result.result.grade) {
        acc[result.result.grade] = (acc[result.result.grade] || 0) + 1;
      }
      return acc;
    }, {});

    // Performance trend (last 10 exams)
    const recentResults = presentResults.slice(0, 10);
    const trend = recentResults.map(result => ({
      examName: result.exam.examName,
      subject: result.exam.subject,
      date: result.exam.schedule.startDate,
      percentage: result.result.finalPercentage,
      grade: result.result.grade,
      status: result.result.status
    }));

    const report = {
      student: {
        id: student._id,
        name: student.personalInfo.fullName,
        studentId: student.studentId,
        department: student.academicInfo.department?.name,
        academicYear: student.academicInfo.academicYear
      },
      overview: {
        totalExams,
        passedExams,
        failedExams,
        passPercentage: totalExams > 0 ? Math.round((passedExams / totalExams) * 100) : 0,
        averagePercentage: Math.round(averagePercentage),
        highestPercentage: Math.round(highestPercentage),
        lowestPercentage: Math.round(lowestPercentage),
        gradeDistribution
      },
      subjectPerformance: Object.values(subjectPerformance),
      trend,
      examResults: results.map(result => ({
        examId: result.exam._id,
        examName: result.exam.examName,
        subject: result.exam.subject,
        examType: result.exam.examType,
        date: result.exam.schedule.startDate,
        group: result.examGroup.groupName,
        attendance: result.attendance.status,
        marks: {
          obtained: result.result.finalMarks,
          total: result.marks.totalMaxMarks,
          percentage: result.result.finalPercentage
        },
        grade: result.result.grade,
        status: result.result.status,
        isPass: result.result.isPass,
        rank: result.result.position
      }))
    };

    res.json({
      success: true,
      message: 'Student report generated successfully',
      data: report
    });
  } catch (error) {
    console.error('Error generating student report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate student report',
      error: error.message
    });
  }
});

// 📈 GET /api/exam-reports/comparative - Comparative analysis report
router.get('/comparative', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD), async (req, res) => {
  try {
    const { 
      academicYear, 
      subject, 
      examType,
      compareBy = 'department', // 'department', 'subdepartment', 'batch', 'group'
      limit = 50 
    } = req.query;

    // Build exam query
    let examQuery = { isDeleted: false, status: { $in: ['completed', 'results-published'] } };
    if (academicYear) examQuery['academicInfo.academicYear'] = academicYear;
    if (subject) examQuery.subject = new RegExp(subject, 'i');
    if (examType) examQuery.examType = examType;

    const exams = await Exam.find(examQuery).select('_id examName subject');

    if (exams.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No exams found matching the criteria'
      });
    }

    const examIds = exams.map(e => e._id);

    // Get all results for these exams
    const results = await ExamResult.find({
      exam: { $in: examIds },
      'attendance.status': 'present',
      isDeleted: false
    })
    .populate('student', 'personalInfo.fullName studentId academicInfo')
    .populate('examGroup', 'groupName')
    .populate('exam', 'examName subject')
    .limit(parseInt(limit));

    // Group results by comparison criteria
    const groupedResults = results.reduce((acc, result) => {
      let groupKey;
      
      switch (compareBy) {
        case 'department':
          groupKey = result.student.academicInfo.department?.toString() || 'Unknown';
          break;
        case 'subdepartment':
          groupKey = result.student.academicInfo.subDepartments?.[0]?.subDepartment?.toString() || 'Unknown';
          break;
        case 'batch':
          groupKey = result.student.academicInfo.batches?.[0]?.batch?.toString() || 'Unknown';
          break;
        case 'group':
          groupKey = result.examGroup._id.toString();
          break;
        default:
          groupKey = 'All';
      }
      
      if (!acc[groupKey]) {
        acc[groupKey] = [];
      }
      acc[groupKey].push(result);
      
      return acc;
    }, {});

    // Calculate statistics for each group
    const comparativeData = await Promise.all(
      Object.entries(groupedResults).map(async ([groupKey, groupResults]) => {
        const totalStudents = groupResults.length;
        const passedStudents = groupResults.filter(r => r.result.isPass).length;
        const averagePercentage = groupResults.reduce((sum, r) => sum + r.result.finalPercentage, 0) / totalStudents;
        const highestMarks = Math.max(...groupResults.map(r => r.result.finalMarks));
        const lowestMarks = Math.min(...groupResults.map(r => r.result.finalMarks));

        // Get group name based on comparison type
        let groupName = 'Unknown';
        if (compareBy === 'department' && groupKey !== 'Unknown') {
          const dept = await mongoose.model('Department').findById(groupKey);
          groupName = dept?.name || 'Unknown Department';
        } else if (compareBy === 'subdepartment' && groupKey !== 'Unknown') {
          const subDept = await mongoose.model('SubDepartment').findById(groupKey);
          groupName = subDept?.name || 'Unknown Sub-Department';
        } else if (compareBy === 'batch' && groupKey !== 'Unknown') {
          const batch = await mongoose.model('Batch').findById(groupKey);
          groupName = batch?.name || 'Unknown Batch';
        } else if (compareBy === 'group') {
          const group = groupResults[0]?.examGroup;
          groupName = group?.groupName || 'Unknown Group';
        }

        return {
          groupId: groupKey,
          groupName,
          statistics: {
            totalStudents,
            passedStudents,
            failedStudents: totalStudents - passedStudents,
            passPercentage: Math.round((passedStudents / totalStudents) * 100),
            averagePercentage: Math.round(averagePercentage),
            highestMarks: Math.round(highestMarks),
            lowestMarks: Math.round(lowestMarks)
          }
        };
      })
    );

    // Sort by average percentage (highest first)
    comparativeData.sort((a, b) => b.statistics.averagePercentage - a.statistics.averagePercentage);

    const report = {
      criteria: {
        compareBy,
        academicYear,
        subject,
        examType,
        totalExams: exams.length,
        totalResults: results.length
      },
      comparativeAnalysis: comparativeData,
      summary: {
        overallAverage: Math.round(
          comparativeData.reduce((sum, group) => sum + group.statistics.averagePercentage, 0) / comparativeData.length
        ),
        bestPerforming: comparativeData[0],
        totalGroups: comparativeData.length
      }
    };

    res.json({
      success: true,
      message: 'Comparative analysis report generated successfully',
      data: report
    });
  } catch (error) {
    console.error('Error generating comparative report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate comparative report',
      error: error.message
    });
  }
});

// 🏆 GET /api/exam-reports/top-performers - Top performers report
router.get('/top-performers', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const { 
      examId, 
      academicYear, 
      subject,
      limit = 20,
      groupBy = 'overall' // 'overall', 'department', 'subject'
    } = req.query;

    let query = { 
      'attendance.status': 'present',
      'result.isPublished': true,
      isDeleted: false
    };

    // Add filters
    if (examId) {
      query.exam = examId;
    } else {
      // If no specific exam, filter by academic year and subject
      let examQuery = { isDeleted: false };
      if (academicYear) examQuery['academicInfo.academicYear'] = academicYear;
      if (subject) examQuery.subject = new RegExp(subject, 'i');

      const matchingExams = await Exam.find(examQuery).select('_id');
      query.exam = { $in: matchingExams.map(e => e._id) };
    }

    const topResults = await ExamResult.find(query)
      .populate('student', 'personalInfo.fullName studentId academicInfo')
      .populate('exam', 'examName subject examType academicInfo')
      .populate('examGroup', 'groupName')
      .sort({ 'result.finalPercentage': -1 })
      .limit(parseInt(limit));

    const topPerformers = topResults.map((result, index) => ({
      rank: index + 1,
      student: {
        id: result.student._id,
        name: result.student.personalInfo.fullName,
        studentId: result.student.studentId,
        department: result.student.academicInfo.department
      },
      exam: {
        id: result.exam._id,
        name: result.exam.examName,
        subject: result.exam.subject,
        type: result.exam.examType
      },
      group: result.examGroup.groupName,
      performance: {
        marks: result.result.finalMarks,
        totalMarks: result.marks.totalMaxMarks,
        percentage: result.result.finalPercentage,
        grade: result.result.grade
      }
    }));

    // Group by criteria if requested
    let groupedPerformers = { 'Overall': topPerformers };
    
    if (groupBy === 'department') {
      groupedPerformers = topPerformers.reduce((acc, performer) => {
        const dept = performer.student.department?.toString() || 'Unknown';
        if (!acc[dept]) acc[dept] = [];
        acc[dept].push(performer);
        return acc;
      }, {});
    } else if (groupBy === 'subject') {
      groupedPerformers = topPerformers.reduce((acc, performer) => {
        const subject = performer.exam.subject;
        if (!acc[subject]) acc[subject] = [];
        acc[subject].push(performer);
        return acc;
      }, {});
    }

    const report = {
      criteria: {
        examId,
        academicYear,
        subject,
        groupBy,
        limit: parseInt(limit)
      },
      topPerformers: groupedPerformers,
      summary: {
        totalStudents: topResults.length,
        averageOfTop: topResults.length > 0 ? 
          Math.round(topResults.reduce((sum, r) => sum + r.result.finalPercentage, 0) / topResults.length) : 0,
        highestPercentage: topResults.length > 0 ? topResults[0].result.finalPercentage : 0
      }
    };

    res.json({
      success: true,
      message: 'Top performers report generated successfully',
      data: report
    });
  } catch (error) {
    console.error('Error generating top performers report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate top performers report',
      error: error.message
    });
  }
});

// 📉 GET /api/exam-reports/defaulters - Poor performers/defaulters report
router.get('/defaulters', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const { 
      examId, 
      academicYear, 
      subject,
      threshold = 40, // Percentage threshold for defaulters
      includeAbsent = 'true',
      limit = 50
    } = req.query;

    let query = { 
      isDeleted: false
    };

    // Add attendance filter
    if (includeAbsent === 'true') {
      query['attendance.status'] = { $in: ['present', 'absent'] };
    } else {
      query['attendance.status'] = 'present';
    }

    // Add exam filters
    if (examId) {
      query.exam = examId;
    } else {
      let examQuery = { isDeleted: false };
      if (academicYear) examQuery['academicInfo.academicYear'] = academicYear;
      if (subject) examQuery.subject = new RegExp(subject, 'i');

      const matchingExams = await Exam.find(examQuery).select('_id');
      query.exam = { $in: matchingExams.map(e => e._id) };
    }

    // Add performance filter
    query.$or = [
      { 'result.finalPercentage': { $lt: parseFloat(threshold) } },
      { 'attendance.status': 'absent' }
    ];

    const defaulterResults = await ExamResult.find(query)
      .populate('student', 'personalInfo.fullName studentId academicInfo personalInfo.contact')
      .populate('exam', 'examName subject examType')
      .populate('examGroup', 'groupName')
      .sort({ 'result.finalPercentage': 1 })
      .limit(parseInt(limit));

    const defaulters = defaulterResults.map(result => ({
      student: {
        id: result.student._id,
        name: result.student.personalInfo.fullName,
        studentId: result.student.studentId,
        department: result.student.academicInfo.department,
        contact: {
          phone: result.student.personalInfo.contact?.phone,
          email: result.student.personalInfo.contact?.email,
          parentPhone: result.student.personalInfo.contact?.emergencyContact?.phone
        }
      },
      exam: {
        id: result.exam._id,
        name: result.exam.examName,
        subject: result.exam.subject,
        type: result.exam.examType
      },
      group: result.examGroup.groupName,
      performance: {
        attendance: result.attendance.status,
        marks: result.result.finalMarks,
        totalMarks: result.marks.totalMaxMarks,
        percentage: result.result.finalPercentage,
        grade: result.result.grade,
        status: result.result.status
      },
      issues: {
        isAbsent: result.attendance.status === 'absent',
        isBelowThreshold: result.result.finalPercentage < parseFloat(threshold),
        marginOfPass: result.result.marginOfPass
      }
    }));

    // Group by categories
    const categorized = {
      absent: defaulters.filter(d => d.performance.attendance === 'absent'),
      belowThreshold: defaulters.filter(d => d.performance.attendance === 'present' && d.performance.percentage < parseFloat(threshold)),
      failed: defaulters.filter(d => d.performance.status === 'fail'),
      needsAttention: defaulters.filter(d => d.performance.percentage >= parseFloat(threshold) && d.performance.percentage < 60)
    };

    const report = {
      criteria: {
        examId,
        academicYear,
        subject,
        threshold: parseFloat(threshold),
        includeAbsent: includeAbsent === 'true'
      },
      summary: {
        totalDefaulters: defaulters.length,
        absentStudents: categorized.absent.length,
        belowThreshold: categorized.belowThreshold.length,
        failedStudents: categorized.failed.length,
        needsAttention: categorized.needsAttention.length
      },
      categorized,
      allDefaulters: defaulters
    };

    res.json({
      success: true,
      message: 'Defaulters report generated successfully',
      data: report
    });
  } catch (error) {
    console.error('Error generating defaulters report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate defaulters report',
      error: error.message
    });
  }
});

// 📊 GET /api/exam-reports/dashboard - Exam dashboard summary
router.get('/dashboard', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const { academicYear } = req.query;
    const currentYear = academicYear || new Date().getFullYear() + '-' + (new Date().getFullYear() + 1);

    // Get exams for the academic year
    const exams = await Exam.find({
      'academicInfo.academicYear': currentYear,
      isDeleted: false
    });

    const examIds = exams.map(e => e._id);

    // Get upcoming exams with populated subjects
    const upcomingExamsQuery = Exam.findUpcomingExams(30);
    const upcomingExams = await upcomingExamsQuery.populate({
      path: 'subjects.subject',
      select: 'name code'
    });

    // Get recent results
    const recentResults = await ExamResult.find({
      exam: { $in: examIds },
      'result.isPublished': true,
      isDeleted: false
    })
    .populate('exam', 'examName subject')
    .populate('student', 'personalInfo.fullName studentId')
    .sort({ 'result.publishedAt': -1 })
    .limit(10);

    // Calculate overall statistics
    const totalExams = exams.length;
    const completedExams = exams.filter(e => e.status === 'completed' || e.status === 'results-published').length;
    const ongoingExams = exams.filter(e => e.status === 'ongoing').length;
    const scheduledExams = exams.filter(e => e.status === 'scheduled').length;

    // Get total students and results
    const totalResults = await ExamResult.countDocuments({
      exam: { $in: examIds },
      isDeleted: false
    });

    const publishedResults = await ExamResult.countDocuments({
      exam: { $in: examIds },
      'result.isPublished': true,
      isDeleted: false
    });

    // Subject-wise performance
    const subjectStats = await ExamResult.aggregate([
      { $match: { exam: { $in: examIds }, 'attendance.status': 'present', isDeleted: false } },
      { $lookup: { from: 'exams', localField: 'exam', foreignField: '_id', as: 'examInfo' } },
      { $unwind: '$examInfo' },
      {
        $group: {
          _id: '$examInfo.subject',
          totalStudents: { $sum: 1 },
          averagePercentage: { $avg: '$result.finalPercentage' },
          passedStudents: { $sum: { $cond: ['$result.isPass', 1, 0] } }
        }
      },
      {
        $addFields: {
          passPercentage: { $multiply: [{ $divide: ['$passedStudents', '$totalStudents'] }, 100] }
        }
      },
      { $sort: { averagePercentage: -1 } }
    ]);

    const dashboard = {
      academicYear: currentYear,
      examStatistics: {
        totalExams,
        completedExams,
        ongoingExams,
        scheduledExams,
        draftExams: exams.filter(e => e.status === 'draft').length,
        upcomingExams: upcomingExams.length
      },
      resultStatistics: {
        totalResults,
        publishedResults,
        pendingResults: totalResults - publishedResults,
        publicationRate: totalResults > 0 ? Math.round((publishedResults / totalResults) * 100) : 0
      },
      upcomingExams: upcomingExams.slice(0, 5).map(exam => {
        const examDate = new Date(exam.examDate);
        const now = new Date();
        const daysUntil = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));
        
        // Get first subject name if subjects exist
        let subjectName = 'N/A';
        if (exam.subjects && exam.subjects.length > 0) {
          // If subjects are populated, get the name, otherwise it's just an ID
          const firstSubject = exam.subjects[0];
          if (firstSubject.subject && typeof firstSubject.subject === 'object') {
            subjectName = firstSubject.subject.name || 'N/A';
          } else if (firstSubject.subjectName) {
            subjectName = firstSubject.subjectName;
          }
        }
        
        return {
          examId: exam.examId || exam._id.toString(),
          examName: exam.name || exam.examName || 'Unnamed Exam',
          subject: subjectName,
          startDate: exam.examDate,
          daysUntil: daysUntil >= 0 ? daysUntil : 0,
          status: exam.status || 'scheduled'
        };
      }),
      recentResults: recentResults.map(result => ({
        studentName: result.student.personalInfo.fullName,
        studentId: result.student.studentId,
        examName: result.exam.examName,
        subject: result.exam.subject,
        percentage: result.result.finalPercentage,
        grade: result.result.grade,
        publishedAt: result.result.publishedAt
      })),
      subjectPerformance: subjectStats.map(stat => ({
        subject: stat._id,
        totalStudents: stat.totalStudents,
        averagePercentage: Math.round(stat.averagePercentage),
        passPercentage: Math.round(stat.passPercentage),
        passedStudents: stat.passedStudents
      }))
    };

    res.json({
      success: true,
      message: 'Exam dashboard generated successfully',
      data: dashboard
    });
  } catch (error) {
    console.error('Error generating exam dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate exam dashboard',
      error: error.message
    });
  }
});

// 📄 GET /api/exam-reports/pdf/subject/:examId/:subjectId - Generate subject-wise marksheet PDF
router.get('/pdf/subject/:examId/:subjectId', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const { examId, subjectId } = req.params;

    // Get exam details - try enhanced exam structure first
    let exam = await Exam.findById(examId)
      .populate('subjects.subject', 'name code');
    
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    // Get subject details
    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }

    // Get all marks entries for this exam
    // Enhanced exams store subject in exam.subject, basic exams may have multiple subjects
    const marksEntries = await ExamMarks.find({ exam: examId })
      .populate('student', 'fullName admissionNo studentId rollNo department subDepartments batches personalInfo')
      .populate('subjectMarks.subject', 'name code')
      .sort({ 'student.fullName': 1 });

    if (marksEntries.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No marks entries found for this exam'
      });
    }

    // Filter entries for the specific subject if exam has multiple subjects
    let filteredEntries = marksEntries;
    if (exam.subjects && exam.subjects.length > 0) {
      // Enhanced exam with multiple subjects - filter by subjectId
      filteredEntries = marksEntries.filter(entry => {
        if (entry.subject) {
          return entry.subject._id?.toString() === subjectId || entry.subject.toString() === subjectId;
        }
        // Check if subject matches in subjectMarks array
        if (entry.subjectMarks && entry.subjectMarks.length > 0) {
          return entry.subjectMarks.some(sm => 
            sm.subject?.toString() === subjectId || sm.subject?._id?.toString() === subjectId
          );
        }
        // If exam has single subject, include all entries
        return exam.subject?._id?.toString() === subjectId || exam.subject?.toString() === subjectId;
      });
    }

    // If no entries after filtering, return not found
    if (!filteredEntries || filteredEntries.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No marks found for this subject in the selected exam'
      });
    }

    // Generate PDF
    const filename = `marksheet_subject_${examId}_${subjectId}_${Date.now()}.pdf`;
    const outputPath = path.join(__dirname, '../../temp', filename);
    
    // Ensure temp directory exists
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    await generateSubjectMarksheet(exam, subject, filteredEntries, outputPath);

    // Send PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);
    
    fileStream.on('end', () => {
      // Clean up temp file
      setTimeout(() => {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      }, 5000);
    });

  } catch (error) {
    console.error('Error generating subject marksheet PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate PDF',
      error: error.message
    });
  }
});

// 📄 GET /api/exam-reports/pdf/student/:studentId - Generate student-wise marksheet PDF for a term
router.get('/pdf/student/:studentId', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER, ROLES.STUDENT, ROLES.PARENT), async (req, res) => {
  try {
    const { studentId } = req.params;
    let { academicYear, term, examType } = req.query;

    // Filter out "undefined" string values
    if (academicYear === 'undefined' || academicYear === 'null') academicYear = undefined;
    if (term === 'undefined' || term === 'null') term = undefined;
    if (examType === 'undefined' || examType === 'null') examType = undefined;

    // Access control
    if (req.user.role === ROLES.STUDENT && req.user.linkedStudent?.toString() !== studentId) {
      return res.status(403).json({
        success: false,
        message: 'Students can only view their own reports'
      });
    }

    if (req.user.role === ROLES.PARENT && req.user.linkedStudent?.toString() !== studentId) {
      return res.status(403).json({
        success: false,
        message: 'Parents can only view their child\'s reports'
      });
    }

    // Get student details
    const student = await Student.findById(studentId)
      .populate('department', 'name code')
      .populate('subDepartments', 'name code')
      .populate('batches', 'name code');
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Build query for marks entries - make it flexible
    let examQuery = {};
    
    // Only add filters if they're provided and not empty
    if (academicYear && academicYear.trim() !== '') {
      examQuery.$or = [
        { academicYear },
        { 'academicInfo.academicYear': academicYear }
      ];
    }
    if (term && term.trim() !== '') {
      if (examQuery.$or) {
        examQuery.$or = [
          ...examQuery.$or,
          { semester: term },
          { 'academicInfo.term': term }
        ];
      } else {
        examQuery.$or = [
          { semester: term },
          { 'academicInfo.term': term }
        ];
      }
    }
    if (examType && examType.trim() !== '') {
      examQuery.examType = examType;
    }

    // If no filters provided, get all exams for this student
    const exams = Object.keys(examQuery).length > 0 
      ? await Exam.find(examQuery).select('_id')
      : await Exam.find({}).select('_id');
    
    const examIds = exams.map(e => e._id);

    // If still no exams found, try to get exams from the student's marks entries
    if (examIds.length === 0) {
      const marksForStudent = await ExamMarks.find({ student: studentId }).select('exam').distinct('exam');
      if (marksForStudent.length > 0) {
        examIds.push(...marksForStudent);
      } else {
        return res.status(404).json({
          success: false,
          message: 'No exams found for this student'
        });
      }
    }

    // Get all marks entries for this student in the specified exams
    const marksEntries = await ExamMarks.find({
      student: studentId,
      exam: { $in: examIds }
    })
      .populate('exam', 'name examName examType examDate academicYear semester subject')
      .populate('subjectMarks.subject', 'name code')
      .populate('student', 'fullName admissionNo studentId department batch personalInfo')
      .sort({ 'exam.examDate': 1 });

    if (marksEntries.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No marks entries found for this student'
      });
    }

    // Prepare exam data for PDF
    const examData = {
      academicYear: academicYear || marksEntries[0]?.exam?.academicYear || 'N/A',
      term: term || marksEntries[0]?.exam?.semester || 'N/A'
    };

    // Generate PDF
    const filename = `marksheet_student_${studentId}_${Date.now()}.pdf`;
    const outputPath = path.join(__dirname, '../../temp', filename);
    
    // Ensure temp directory exists
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    await generateStudentMarksheet(student, examData, marksEntries, outputPath);

    // Send PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);
    
    fileStream.on('end', () => {
      // Clean up temp file
      setTimeout(() => {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      }, 5000);
    });

  } catch (error) {
    console.error('Error generating student marksheet PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate PDF',
      error: error.message
    });
  }
});

// 📄 GET /api/exam-reports/pdf/exam/:examId - Generate complete exam report PDF (all students, all subjects)
router.get('/pdf/exam/:examId', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER), async (req, res) => {
  try {
    const { examId } = req.params;

    // Get exam details
    let exam = await Exam.findById(examId)
      .populate('subjects.subject', 'name code');
    
    if (!exam) {
      // Try finding by examId field
      exam = await Exam.findOne({ examId, isDeleted: { $ne: true } })
        .populate('subjects.subject', 'name code');
    }

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    // Get all results for this exam
    let results = await ExamResult.find({ exam: exam._id, isDeleted: { $ne: true } })
      .populate('student', 'fullName admissionNo studentId personalInfo')
      .populate('subjectMarks.subject', 'name code')
      .sort({ 'student.fullName': 1 });

    // If no ExamResult entries, try ExamMarks
    if (results.length === 0) {
      const marksEntries = await ExamMarks.find({ exam: exam._id, isDeleted: { $ne: true } })
        .populate('student', 'fullName admissionNo studentId personalInfo')
        .populate('subjectMarks.subject', 'name code')
        .sort({ 'student.fullName': 1 });

      // Transform ExamMarks to results format
      results = marksEntries.map(entry => ({
        student: entry.student,
        marks: {
          subjectMarks: entry.subjectMarks || [],
          obtained: entry.totalMarksObtained || 0,
          total: entry.totalMaxMarks || 0
        },
        attendance: entry.isPresent ? 'present' : 'absent',
        result: {
          status: entry.isPassed ? 'pass' : 'fail'
        }
      }));
    }

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No results found for this exam'
      });
    }

    // Generate PDF
    const filename = `complete_exam_report_${examId}_${Date.now()}.pdf`;
    const outputPath = path.join(__dirname, '../../temp', filename);
    
    // Ensure temp directory exists
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    await generateCompleteExamReport(exam, results, outputPath);

    // Send PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);
    
    fileStream.on('end', () => {
      // Clean up temp file
      setTimeout(() => {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      }, 5000);
    });

  } catch (error) {
    console.error('Error generating complete exam report PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate PDF',
      error: error.message
    });
  }
});

export default router; 