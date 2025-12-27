import express from 'express';
import { auth } from '../middleware/auth.js';
import { permit } from '../middleware/rbac.js';
import { ROLES } from '../utils/roles.js';
import Student from '../models/Student.js';
import ExamMarks from '../models/ExamMarks.js';
import ExamResult from '../models/ExamResult.js';
import Exam from '../models/Exam.js';

const router = express.Router();

// ==================== PARENT DASHBOARD ROUTES ====================

// @route   GET /api/parent-dashboard/student-info
// @desc    Get student basic information
// @access  Private (Parent only)
router.get('/student-info', auth, permit(ROLES.PARENT), async (req, res) => {
  try {
    const parentId = req.user.id;
    const parentEmail = req.user.email.toLowerCase().trim();

    console.log('🔍 Parent dashboard - searching for student:', { parentId, parentEmail });

    // STRICT: Find student ONLY by linkedStudent or guardianEmail (NOT student's own email)
    let student = await Student.findOne({ 
      linkedStudent: parentId
    })
      .populate('department', 'name code')
      .populate('subDepartments', 'name code')
      .populate('batches', 'name code')
      .select('-__v');

    // If not found by linkedStudent, try guardianEmail ONLY
    if (!student) {
      console.log('⚠️ Student not found by linkedStudent, trying guardianEmail');
      student = await Student.findOne({ 
        guardianEmail: parentEmail
      })
        .populate('department', 'name code')
        .populate('subDepartments', 'name code')
        .populate('batches', 'name code')
        .select('-__v');
      
      // SECURITY: Verify this is NOT a student's own email
      if (student) {
        if (student.email && student.email.toLowerCase().trim() === parentEmail) {
          console.log('⚠️ SECURITY: Rejecting - parent email matches student email');
          student = null; // Reject if it's student's own email
        } else {
          // If found by guardianEmail but not linked, link them now
          if (!student.linkedStudent || student.linkedStudent.toString() !== parentId) {
            console.log('🔗 Linking student to parent user');
            student.linkedStudent = parentId;
            await student.save();
          }
        }
      }
    }

    if (!student) {
      console.log('❌ No student found for parent:', { parentId, parentEmail });
      return res.status(404).json({
        success: false,
        message: 'No student found linked to your account. Only parent emails (stored in "Parent Email" field) can access parent portal. Student emails cannot be used.'
      });
    }

    // SECURITY CHECK: Double verify the student is linked to this parent
    if (student.linkedStudent && student.linkedStudent.toString() !== parentId) {
      console.log('⚠️ SECURITY: Student linked to different parent - rejecting access');
      return res.status(403).json({
        success: false,
        message: 'Access denied. This student is linked to a different parent account.'
      });
    }

    // SECURITY CHECK: Verify guardianEmail matches (if not linked yet)
    if (!student.linkedStudent && student.guardianEmail?.toLowerCase().trim() !== parentEmail) {
      console.log('⚠️ SECURITY: Guardian email mismatch - rejecting access');
      return res.status(403).json({
        success: false,
        message: 'Access denied. Email does not match the parent email in student record.'
      });
    }

    console.log('✅ Student found and verified:', { 
      admissionNo: student.admissionNo, 
      fullName: student.fullName,
      linkedStudent: student.linkedStudent?.toString(),
      guardianEmail: student.guardianEmail
    });

    res.json({
      success: true,
      data: {
        admissionNo: student.admissionNo,
        fullName: student.fullName,
        dateOfBirth: student.dateOfBirth,
        age: student.age,
        gender: student.gender,
        bloodGroup: student.bloodGroup,
        phone: student.phone,
        email: student.email,
        address: student.address,
        fatherName: student.fatherName,
        motherName: student.motherName,
        guardianPhone: student.guardianPhone,
        guardianEmail: student.guardianEmail,
        department: student.department,
        subDepartments: student.subDepartments,
        batches: student.batches,
        admittedToStandard: student.admittedToStandard,
        currentStandard: student.currentStandard,
        dateOfAdmission: student.dateOfAdmission,
        shaakha: student.shaakha,
        gothra: student.gothra,
        status: student.status,
        remarks: student.remarks,
        latestHealth: student.latestHealth || null
      }
    });
  } catch (error) {
    console.error('Error fetching student info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student information',
      error: error.message
    });
  }
});

// @route   GET /api/parent-dashboard/exam-marks
// @desc    Get student exam marks
// @access  Private (Parent only)
router.get('/exam-marks', auth, permit(ROLES.PARENT), async (req, res) => {
  try {
    const parentId = req.user.id;
    const { academicYear, term, examType } = req.query;

    // STRICT: Find student ONLY by linkedStudent or guardianEmail (NOT student's own email)
    const parentEmail = req.user.email.toLowerCase().trim();
    let student = await Student.findOne({ linkedStudent: parentId });
    
    if (!student) {
      student = await Student.findOne({ guardianEmail: parentEmail });
      if (student) {
        // SECURITY: Verify this is NOT a student's own email
        if (student.email && student.email.toLowerCase().trim() === parentEmail) {
          student = null; // Reject if it's student's own email
        } else {
          // Link the student to parent
          if (!student.linkedStudent || student.linkedStudent.toString() !== parentId) {
            student.linkedStudent = parentId;
            await student.save();
          }
        }
      }
    }

    // SECURITY CHECK: Verify access
    if (student) {
      if (student.linkedStudent && student.linkedStudent.toString() !== parentId) {
        student = null; // Reject if linked to different parent
      } else if (!student.linkedStudent && student.guardianEmail?.toLowerCase().trim() !== parentEmail) {
        student = null; // Reject if guardianEmail doesn't match
      }
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'No student found linked to your account'
      });
    }

    // Build exam query
    let examQuery = { isDeleted: { $ne: true } };
    if (academicYear) examQuery.academicYear = academicYear;
    if (term) examQuery.semester = term;
    if (examType) examQuery.examType = examType;

    const exams = await Exam.find(examQuery).select('_id');
    const examIds = exams.map(e => e._id);

    // Get exam marks
    let marksQuery = { 
      student: student._id,
      isDeleted: { $ne: true }
    };
    if (examIds.length > 0) {
      marksQuery.exam = { $in: examIds };
    }

    const marksEntries = await ExamMarks.find(marksQuery)
      .populate('exam', 'name examName examType examDate academicYear semester')
      .populate('subjectMarks.subject', 'name code')
      .sort({ 'exam.examDate': -1 });

    // Also get ExamResult entries if available
    const resultEntries = await ExamResult.find({
      student: student._id,
      exam: examIds.length > 0 ? { $in: examIds } : { $exists: true }
    })
      .populate('exam', 'name examName examType examDate academicYear semester')
      .populate('subjectMarks.subject', 'name code')
      .sort({ 'exam.examDate': -1 });

    // Combine and format results
    const allResults = [];
    const examMap = new Map();

    // Process ExamMarks
    marksEntries.forEach(entry => {
      const examId = entry.exam?._id?.toString();
      if (!examMap.has(examId)) {
        examMap.set(examId, {
          exam: entry.exam,
          marks: entry,
          type: 'ExamMarks'
        });
      }
    });

    // Process ExamResult
    resultEntries.forEach(entry => {
      const examId = entry.exam?._id?.toString();
      if (!examMap.has(examId)) {
        examMap.set(examId, {
          exam: entry.exam,
          marks: entry,
          type: 'ExamResult'
        });
      }
    });

    examMap.forEach((value, examId) => {
      const entry = value.marks;
      allResults.push({
        examId: entry.exam?._id,
        examName: entry.exam?.name || entry.exam?.examName || 'N/A',
        examType: entry.exam?.examType || 'N/A',
        examDate: entry.exam?.examDate,
        academicYear: entry.exam?.academicYear || entry.exam?.semester || 'N/A',
        totalMarksObtained: entry.totalMarksObtained || entry.marks?.obtained || 0,
        totalMaxMarks: entry.totalMaxMarks || entry.marks?.total || 0,
        overallPercentage: entry.overallPercentage || entry.marks?.percentage || 0,
        overallGrade: entry.overallGrade || entry.result?.grade || 'N/A',
        isPassed: entry.isPassed || entry.result?.isPass || false,
        subjectMarks: entry.subjectMarks || entry.marks?.subjectMarks || [],
        attendance: entry.isPresent !== false ? 'present' : 'absent'
      });
    });

    res.json({
      success: true,
      data: allResults
    });
  } catch (error) {
    console.error('Error fetching exam marks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch exam marks',
      error: error.message
    });
  }
});

// @route   GET /api/parent-dashboard/transactions
// @desc    Get student transactions (fees, payments, etc.)
// @access  Private (Parent only)
router.get('/transactions', auth, permit(ROLES.PARENT), async (req, res) => {
  try {
    const parentId = req.user.id;

    // STRICT: Find student ONLY by linkedStudent or guardianEmail (NOT student's own email)
    const parentEmail = req.user.email.toLowerCase().trim();
    let student = await Student.findOne({ linkedStudent: parentId });
    
    if (!student) {
      student = await Student.findOne({ guardianEmail: parentEmail });
      if (student) {
        // SECURITY: Verify this is NOT a student's own email
        if (student.email && student.email.toLowerCase().trim() === parentEmail) {
          student = null; // Reject if it's student's own email
        } else {
          // Link the student to parent
          if (!student.linkedStudent || student.linkedStudent.toString() !== parentId) {
            student.linkedStudent = parentId;
            await student.save();
          }
        }
      }
    }

    // SECURITY CHECK: Verify access
    if (student) {
      if (student.linkedStudent && student.linkedStudent.toString() !== parentId) {
        student = null; // Reject if linked to different parent
      } else if (!student.linkedStudent && student.guardianEmail?.toLowerCase().trim() !== parentEmail) {
        student = null; // Reject if guardianEmail doesn't match
      }
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'No student found linked to your account'
      });
    }

    // Get wallet transactions from student
    const walletTransactions = student.walletTransactions || [];
    const wallet = student.wallet || {};
    
    // Format transactions for parent view
    const formattedTransactions = walletTransactions
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map(tx => ({
        id: tx._id,
        date: tx.date,
        type: tx.type,
        amount: tx.amount,
        source: tx.source,
        creditRemark: tx.creditRemark,
        debitRemark: tx.debitRemark,
        reference: tx.reference,
        balanceAfter: tx.balanceAfter
      }));

    res.json({
      success: true,
      data: formattedTransactions,
      wallet: {
        currentBalance: wallet.currentBalance ?? 0,
        totalCredit: wallet.totalCredit ?? 0,
        totalDebit: wallet.totalDebit ?? 0,
        currency: wallet.currency || 'INR'
      }
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message
    });
  }
});

// @route   GET /api/parent-dashboard/notes
// @desc    Get student notes/comments from teachers/admin
// @access  Private (Parent only)
router.get('/notes', auth, permit(ROLES.PARENT), async (req, res) => {
  try {
    const parentId = req.user.id;

    // STRICT: Find student ONLY by linkedStudent or guardianEmail (NOT student's own email)
    const parentEmail = req.user.email.toLowerCase().trim();
    let student = await Student.findOne({ linkedStudent: parentId })
      .populate('notes.createdBy', 'fullName email');
    
    if (!student) {
      student = await Student.findOne({ guardianEmail: parentEmail })
        .populate('notes.createdBy', 'fullName email');
      if (student) {
        // SECURITY: Verify this is NOT a student's own email
        if (student.email && student.email.toLowerCase().trim() === parentEmail) {
          student = null; // Reject if it's student's own email
        } else {
          // Link the student to parent
          if (!student.linkedStudent || student.linkedStudent.toString() !== parentId) {
            student.linkedStudent = parentId;
            await student.save();
          }
        }
      }
    }

    // SECURITY CHECK: Verify access
    if (student) {
      if (student.linkedStudent && student.linkedStudent.toString() !== parentId) {
        student = null; // Reject if linked to different parent
      } else if (!student.linkedStudent && student.guardianEmail?.toLowerCase().trim() !== parentEmail) {
        student = null; // Reject if guardianEmail doesn't match
      }
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'No student found linked to your account'
      });
    }

    // Get notes from student.notes array
    // Parents can see notes with visibility 'all' (notes visible to everyone including parents)
    const allNotes = student.notes || [];
    const parentVisibleNotes = allNotes.filter(note => {
      const visibility = note.visibility || 'staff';
      return visibility === 'all'; // Only show notes marked as visible to all
    });

    // Sort by creation date (newest first) and format
    const formattedNotes = parentVisibleNotes
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(note => ({
        id: note._id,
        title: note.title || 'Note',
        content: note.content,
        category: note.category || 'general',
        visibility: note.visibility || 'staff',
        createdAt: note.createdAt,
        createdBy: note.createdByName || note.createdBy?.fullName || note.createdBy?.email || 'System',
        updatedAt: note.updatedAt
      }));

    // Also include student remarks if available
    if (student.remarks && student.remarks.trim()) {
      formattedNotes.push({
        id: 'remarks',
        title: 'Student Remarks',
        content: student.remarks,
        category: 'general',
        visibility: 'all',
        createdAt: student.updatedAt || student.createdAt,
        createdBy: 'System',
        updatedAt: student.updatedAt || student.createdAt
      });
    }

    res.json({
      success: true,
      data: formattedNotes
    });
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notes',
      error: error.message
    });
  }
});

export default router;
