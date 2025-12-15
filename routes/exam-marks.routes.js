import express from 'express';
import mongoose from 'mongoose';
import ExamMarks from '../models/ExamMarks.js';
import Exam from '../models/Exam.js';
import Student from '../models/Student.js';
import Subject from '../models/Subject.js';
import { auth } from '../middleware/auth.js';
import { ROLES } from '../utils/roles.js';

const router = express.Router();

// @route   GET /api/exam-marks/exam/:examId
// @desc    Get all marks for an exam
// @access  Private
router.get('/exam/:examId', auth, async (req, res) => {
  try {
    const { examId } = req.params;
    const { page = 1, limit = 50, search = '' } = req.query;

    // Verify exam exists
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    // Build query
    let query = { exam: examId };

    // Add search functionality
    if (search) {
      const students = await Student.find({
        $or: [
          { fullName: { $regex: search, $options: 'i' } },
          { admissionNo: { $regex: search, $options: 'i' } }
        ],
        status: { $ne: 'leftout' },
        isActive: true
      }).select('_id');
      
      query.student = { $in: students.map(s => s._id) };
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { 'student.fullName': 1 },
      populate: [
        {
          path: 'student',
          select: 'admissionNo fullName department subDepartments batches',
          populate: [
            { path: 'department', select: 'name code' },
            { path: 'subDepartments', select: 'name code' },
            { path: 'batches', select: 'name code academicYear' }
          ]
        },
        { path: 'subjectMarks.subject', select: 'name code' },
        { path: 'enteredBy', select: 'fullName' },
        { path: 'verifiedBy', select: 'fullName' }
      ]
    };

    const result = await ExamMarks.paginate(query, options);

    res.json({
      success: true,
      examMarks: result.docs,
      pagination: {
        currentPage: result.page,
        totalPages: result.totalPages,
        totalMarks: result.totalDocs,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage
      },
      exam: {
        _id: exam._id,
        name: exam.name,
        examDate: exam.examDate,
        subjects: exam.subjects
      }
    });

  } catch (error) {
    console.error('❌ Error fetching exam marks:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching exam marks',
      error: error.message
    });
  }
});

// @route   GET /api/exam-marks/student/:studentId
// @desc    Get all marks for a student
// @access  Private
router.get('/student/:studentId', auth, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { academicYear = '2024-25' } = req.query;

    // Verify student exists
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Get all exam marks for the student
    const examMarks = await ExamMarks.find({ student: studentId })
      .populate({
        path: 'exam',
        match: academicYear ? { academicYear } : {},
        select: 'name examDate examType academicYear status',
        populate: { path: 'subjects.subject', select: 'name code' }
      })
      .populate('subjectMarks.subject', 'name code')
      .sort({ 'exam.examDate': -1 });

    // Filter out marks where exam is null (due to academicYear filter)
    const filteredMarks = examMarks.filter(mark => mark.exam !== null);

    res.json({
      success: true,
      examMarks: filteredMarks,
      student: {
        _id: student._id,
        admissionNo: student.admissionNo,
        fullName: student.fullName
      }
    });

  } catch (error) {
    console.error('❌ Error fetching student marks:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching student marks',
      error: error.message
    });
  }
});

// @route   GET /api/exam-marks/:examId/:studentId
// @desc    Get marks for a specific exam and student
// @access  Private
router.get('/:examId/:studentId', auth, async (req, res) => {
  try {
    const { examId, studentId } = req.params;

    const examMarks = await ExamMarks.findOne({
      exam: examId,
      student: studentId
    })
      .populate('exam', 'name examDate subjects')
      .populate('student', 'admissionNo fullName')
      .populate('subjectMarks.subject', 'name code')
      .populate('enteredBy', 'fullName')
      .populate('verifiedBy', 'fullName');

    if (!examMarks) {
      return res.status(404).json({
        success: false,
        message: 'Exam marks not found'
      });
    }

    res.json({
      success: true,
      examMarks
    });

  } catch (error) {
    console.error('❌ Error fetching exam marks:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching exam marks',
      error: error.message
    });
  }
});

// @route   POST /api/exam-marks
// @desc    Create/Update exam marks for a student
// @access  Private (All except Parents)
router.post('/', auth, async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    // Check permissions - all except parents
    if (userRole === ROLES.PARENT) {
      return res.status(403).json({
        success: false,
        message: 'Parents cannot enter exam marks'
      });
    }

    const {
      exam,
      student,
      subjectMarks,
      isPresent = true,
      absentReason,
      remarks,
      teacherRemarks
    } = req.body;

    // Validate required fields
    if (!exam || !student || !subjectMarks || subjectMarks.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Exam, student, and subject marks are required'
      });
    }

    // Verify exam and student exist
    const [examDoc, studentDoc] = await Promise.all([
      Exam.findById(exam),
      Student.findById(student)
    ]);

    if (!examDoc) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    if (!studentDoc) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Validate subject marks
    const examSubjects = examDoc.subjects.map(s => s.subject.toString());
    const providedSubjects = subjectMarks.map(sm => sm.subject.toString());

    // Check if all exam subjects have marks
    const missingSubjects = examSubjects.filter(es => !providedSubjects.includes(es));
    if (missingSubjects.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Marks missing for some exam subjects'
      });
    }

    // Calculate totals
    const totalMarksObtained = subjectMarks.reduce((sum, sm) => sum + sm.marksObtained, 0);
    const totalMaxMarks = subjectMarks.reduce((sum, sm) => sum + sm.maxMarks, 0);

    // Check if marks already exist
    let examMarks = await ExamMarks.findOne({ exam, student });

    if (examMarks) {
      // Update existing marks
      examMarks.subjectMarks = subjectMarks;
      examMarks.totalMarksObtained = totalMarksObtained;
      examMarks.totalMaxMarks = totalMaxMarks;
      examMarks.isPresent = isPresent;
      examMarks.absentReason = absentReason;
      examMarks.remarks = remarks;
      examMarks.teacherRemarks = teacherRemarks;
      examMarks.enteredBy = userId;
      examMarks.status = 'submitted';

      await examMarks.save();
    } else {
      // Create new marks
      examMarks = new ExamMarks({
        exam,
        student,
        subjectMarks,
        totalMarksObtained,
        totalMaxMarks,
        isPresent,
        absentReason,
        remarks,
        teacherRemarks,
        enteredBy: userId,
        status: 'submitted'
      });

      await examMarks.save();
    }

    // Populate references before sending response
    await examMarks.populate([
      { path: 'exam', select: 'name examDate' },
      { path: 'student', select: 'admissionNo fullName' },
      { path: 'subjectMarks.subject', select: 'name code' },
      { path: 'enteredBy', select: 'fullName' }
    ]);

    res.json({
      success: true,
      message: examMarks.isNew ? 'Exam marks created successfully' : 'Exam marks updated successfully',
      examMarks
    });

  } catch (error) {
    console.error('❌ Error saving exam marks:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving exam marks',
      error: error.message
    });
  }
});

// @route   POST /api/exam-marks/bulk
// @desc    Bulk create/update exam marks
// @access  Private (All except Parents)
router.post('/bulk', auth, async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    // Check permissions - all except parents
    if (userRole === ROLES.PARENT) {
      return res.status(403).json({
        success: false,
        message: 'Parents cannot enter exam marks'
      });
    }

    const { examId, marksData } = req.body;

    if (!examId || !marksData || !Array.isArray(marksData) || marksData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Exam ID and marks data array are required'
      });
    }

    // Verify exam exists
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    const results = {
      success: [],
      errors: [],
      total: marksData.length
    };

    for (let i = 0; i < marksData.length; i++) {
      const markData = marksData[i];
      
      try {
        const {
          student,
          subjectMarks,
          isPresent = true,
          absentReason,
          remarks,
          teacherRemarks
        } = markData;

        // Validate required fields
        if (!student || !subjectMarks || subjectMarks.length === 0) {
          results.errors.push({
            row: i + 1,
            error: 'Student and subject marks are required'
          });
          continue;
        }

        // Calculate totals
        const totalMarksObtained = subjectMarks.reduce((sum, sm) => sum + sm.marksObtained, 0);
        const totalMaxMarks = subjectMarks.reduce((sum, sm) => sum + sm.maxMarks, 0);

        // Check if marks already exist
        let examMarks = await ExamMarks.findOne({ exam: examId, student });

        if (examMarks) {
          // Update existing marks
          examMarks.subjectMarks = subjectMarks;
          examMarks.totalMarksObtained = totalMarksObtained;
          examMarks.totalMaxMarks = totalMaxMarks;
          examMarks.isPresent = isPresent;
          examMarks.absentReason = absentReason;
          examMarks.remarks = remarks;
          examMarks.teacherRemarks = teacherRemarks;
          examMarks.enteredBy = userId;
          examMarks.status = 'submitted';

          await examMarks.save();
        } else {
          // Create new marks
          examMarks = new ExamMarks({
            exam: examId,
            student,
            subjectMarks,
            totalMarksObtained,
            totalMaxMarks,
            isPresent,
            absentReason,
            remarks,
            teacherRemarks,
            enteredBy: userId,
            status: 'submitted'
          });

          await examMarks.save();
        }

        results.success.push({
          row: i + 1,
          student: student,
          action: examMarks.isNew ? 'created' : 'updated'
        });

      } catch (error) {
        results.errors.push({
          row: i + 1,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Bulk marks entry completed. ${results.success.length} entries processed, ${results.errors.length} errors.`,
      results
    });

  } catch (error) {
    console.error('❌ Error in bulk marks entry:', error);
    res.status(500).json({
      success: false,
      message: 'Error in bulk marks entry',
      error: error.message
    });
  }
});

// @route   PUT /api/exam-marks/:id/verify
// @desc    Verify exam marks
// @access  Private (Admin/Coordinator/Principal)
router.put('/:id/verify', auth, async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    // Check permissions
    const allowedRoles = [ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL];
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to verify exam marks'
      });
    }

    const examMarks = await ExamMarks.findById(req.params.id);
    if (!examMarks) {
      return res.status(404).json({
        success: false,
        message: 'Exam marks not found'
      });
    }

    examMarks.status = 'verified';
    examMarks.verifiedBy = userId;
    examMarks.verificationDate = new Date();

    await examMarks.save();

    await examMarks.populate([
      { path: 'exam', select: 'name examDate' },
      { path: 'student', select: 'admissionNo fullName' },
      { path: 'verifiedBy', select: 'fullName' }
    ]);

    res.json({
      success: true,
      message: 'Exam marks verified successfully',
      examMarks
    });

  } catch (error) {
    console.error('❌ Error verifying exam marks:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying exam marks',
      error: error.message
    });
  }
});

// @route   PUT /api/exam-marks/:id/publish
// @desc    Publish exam marks
// @access  Private (Admin/Coordinator/Principal)
router.put('/:id/publish', auth, async (req, res) => {
  try {
    const userRole = req.user.role;

    // Check permissions
    const allowedRoles = [ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL];
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to publish exam marks'
      });
    }

    const examMarks = await ExamMarks.findById(req.params.id);
    if (!examMarks) {
      return res.status(404).json({
        success: false,
        message: 'Exam marks not found'
      });
    }

    examMarks.status = 'published';
    examMarks.isPublished = true;
    examMarks.publishedAt = new Date();

    await examMarks.save();

    res.json({
      success: true,
      message: 'Exam marks published successfully'
    });

  } catch (error) {
    console.error('❌ Error publishing exam marks:', error);
    res.status(500).json({
      success: false,
      message: 'Error publishing exam marks',
      error: error.message
    });
  }
});

// @route   DELETE /api/exam-marks/:id
// @desc    Delete exam marks
// @access  Private (Admin/Coordinator)
router.delete('/:id', auth, async (req, res) => {
  try {
    const userRole = req.user.role;

    // Check permissions
    const allowedRoles = [ROLES.ADMIN, ROLES.COORDINATOR];
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete exam marks'
      });
    }

    const examMarks = await ExamMarks.findById(req.params.id);
    if (!examMarks) {
      return res.status(404).json({
        success: false,
        message: 'Exam marks not found'
      });
    }

    // Cannot delete published marks
    if (examMarks.status === 'published') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete published exam marks'
      });
    }

    await ExamMarks.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Exam marks deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting exam marks:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting exam marks',
      error: error.message
    });
  }
});

// @route   GET /api/exam-marks/stats/:examId
// @desc    Get exam statistics
// @access  Private
router.get('/stats/:examId', auth, async (req, res) => {
  try {
    const { examId } = req.params;

    const stats = await ExamMarks.aggregate([
      { $match: { exam: mongoose.Types.ObjectId(examId) } },
      {
        $group: {
          _id: null,
          totalStudents: { $sum: 1 },
          averagePercentage: { $avg: '$overallPercentage' },
          highestPercentage: { $max: '$overallPercentage' },
          lowestPercentage: { $min: '$overallPercentage' },
          passedStudents: {
            $sum: { $cond: [{ $eq: ['$isPassed', true] }, 1, 0] }
          },
          failedStudents: {
            $sum: { $cond: [{ $eq: ['$isPassed', false] }, 1, 0] }
          },
          absentStudents: {
            $sum: { $cond: [{ $eq: ['$isPresent', false] }, 1, 0] }
          }
        }
      }
    ]);

    const gradeDistribution = await ExamMarks.aggregate([
      { $match: { exam: mongoose.Types.ObjectId(examId) } },
      { $group: { _id: '$overallGrade', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      stats: stats[0] || {},
      gradeDistribution
    });

  } catch (error) {
    console.error('❌ Error fetching exam stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching exam statistics',
      error: error.message
    });
  }
});

export default router;