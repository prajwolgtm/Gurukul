import express from 'express';
import mongoose from 'mongoose';
import { auth } from '../middleware/auth.js';
import { permit } from '../middleware/rbac.js';
import { ROLES } from '../utils/roles.js';
import Student from '../models/Student.js';
import DailyAttendance from '../models/DailyAttendance.js';
import AttendanceSession from '../models/AttendanceSession.js';
import ExamMarks from '../models/ExamMarks.js';
import ClassAttendance from '../models/ClassAttendance.js';

const router = express.Router();

const STAFF_VIEW_ROLES = [
  ROLES.ADMIN,
  ROLES.COORDINATOR,
  ROLES.PRINCIPAL,
  ROLES.HOD,
  ROLES.TEACHER,
  ROLES.PARENT
];

const NOTE_MANAGER_ROLES = [
  ROLES.ADMIN,
  ROLES.COORDINATOR,
  ROLES.PRINCIPAL,
  ROLES.HOD,
  ROLES.TEACHER
];

const NOTE_DELETE_ROLES = [
  ROLES.ADMIN,
  ROLES.COORDINATOR,
  ROLES.PRINCIPAL
];

const NOTE_CATEGORIES = new Set(['general', 'academic', 'attendance', 'behaviour', 'health', 'hostel']);
const NOTE_VISIBILITY = new Set(['staff', 'management', 'all']);
const WALLET_EDIT_ROLES = [
  ROLES.ADMIN,
  ROLES.COORDINATOR,
  ROLES.PRINCIPAL
];

const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Sick', 'Leave'];

const toStartOfDay = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const getDefaultDateRange = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Academic year starting April 1st
  const startYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  const start = new Date(startYear, 3, 1);
  start.setHours(0, 0, 0, 0);
  return { start, end: today };
};

const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const formatStudentInfo = (student) => ({
  id: student._id,
  admissionNo: student.admissionNo,
  fullName: student.fullName,
  dateOfBirth: student.dateOfBirth,
  age: student.age,
  gender: student.gender,
  bloodGroup: student.bloodGroup,
  contact: {
    phone: student.phone,
    email: student.email,
    address: student.address,
    guardianPhone: student.guardianPhone
  },
  family: {
    fatherName: student.fatherName,
    motherName: student.motherName
  },
  academic: {
    department: student.department,
    subDepartments: student.subDepartments,
    batches: student.batches,
    admittedToStandard: student.admittedToStandard,
    currentStandard: student.currentStandard,
    dateOfAdmission: student.dateOfAdmission
  },
  vedic: {
    shaakha: student.shaakha,
    gothra: student.gothra
  },
  status: student.status,
  remarks: student.remarks,
  createdAt: student.createdAt,
  updatedAt: student.updatedAt
});

const buildAttendanceSummary = (records = [], sessions = []) => {
  if (!records.length) {
    return {
      totalRecords: 0,
      totalSessions: 0,
      presentSessions: 0,
      absentSessions: 0,
      attendancePercentage: 0,
      recent: []
    };
  }

  const sessionOrder = sessions.map(session => session.sessionKey);
  const sessionLabelMap = sessions.reduce((acc, session) => {
    acc[session.sessionKey] = session.displayNames?.english || session.displayNames?.sanskrit || session.sessionKey;
    return acc;
  }, {});

  const totals = records.reduce((acc, record) => {
    const stats = record.statistics || {};
    acc.totalSessions += stats.totalSessions ?? 14;
    acc.presentSessions += stats.presentCount ?? 0;
    acc.absentSessions += stats.absentCount ?? ((stats.totalSessions ?? 14) - (stats.presentCount ?? 0));
    return acc;
  }, { totalSessions: 0, presentSessions: 0, absentSessions: 0 });

  const recent = records.map(record => {
    const stats = record.statistics || {};
    const total = stats.totalSessions ?? 14;
    const present = stats.presentCount ?? 0;
    const percentage = total ? Math.round((present / total) * 100) : 0;

    const sessionKeys = sessionOrder.length ? sessionOrder : Object.keys(record.sessions || {});
    const sessionDetails = sessionKeys.map(key => ({
      key,
      name: sessionLabelMap[key] || key,
      status: record.sessions?.[key]?.status || 'Present',
      notes: record.sessions?.[key]?.notes || ''
    }));

    return {
      id: record._id,
      date: record.attendanceDate,
      presentCount: present,
      totalSessions: total,
      percentage,
      sessions: sessionDetails
    };
  });

  return {
    totalRecords: records.length,
    totalSessions: totals.totalSessions,
    presentSessions: totals.presentSessions,
    absentSessions: totals.absentSessions,
    attendancePercentage: totals.totalSessions ? Math.round((totals.presentSessions / totals.totalSessions) * 100) : 0,
    recent
  };
};

const buildExamSummary = (examMarks = []) => {
  if (!examMarks.length) {
    return {
      totalExams: 0,
      publishedExams: 0,
      averagePercentage: 0,
      passCount: 0,
      failCount: 0,
      recent: []
    };
  }

  const published = examMarks.filter(mark => mark.status === 'published');
  const presentExams = examMarks.filter(mark => mark.isPresent);
  const passCount = presentExams.filter(mark => mark.isPassed).length;
  const averagePercentage = presentExams.length
    ? Math.round(presentExams.reduce((sum, mark) => sum + (mark.overallPercentage || 0), 0) / presentExams.length)
    : 0;

  const recent = examMarks.map(mark => ({
    id: mark._id,
    examId: mark.exam?._id,
    examName: mark.exam?.name || 'Exam',
    examType: mark.exam?.examType,
    examDate: mark.exam?.examDate,
    status: mark.status,
    isPresent: mark.isPresent,
    percentage: mark.overallPercentage,
    grade: mark.overallGrade,
    totalMarks: mark.totalMaxMarks,
    obtainedMarks: mark.totalMarksObtained,
    isPassed: mark.isPassed,
    remarks: mark.remarks
  }));

  return {
    totalExams: examMarks.length,
    publishedExams: published.length,
    averagePercentage,
    passCount,
    failCount: presentExams.length - passCount,
    recent
  };
};

const sanitizeNotes = (notes = []) => {
  const sorted = [...notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return sorted.map(note => ({
    id: note._id,
    title: note.title || 'Update',
    content: note.content,
    category: note.category || 'general',
    visibility: note.visibility || 'staff',
    createdBy: {
      id: note.createdBy,
      name: note.createdByName,
      role: note.createdByRole
    },
    createdAt: note.createdAt,
    updatedAt: note.updatedAt
  }));
};

const buildWalletSummary = (student) => {
  const wallet = student.wallet || {};
  const tx = student.walletTransactions || [];
  const sorted = [...tx].sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    openingBalance: wallet.openingBalance ?? 0,
    totalCredit: wallet.totalCredit ?? 0,
    totalDebit: wallet.totalDebit ?? 0,
    currentBalance: wallet.currentBalance ?? (wallet.openingBalance ?? 0),
    currency: wallet.currency || 'INR',
    recentTransactions: sorted.slice(0, 10).map(t => ({
      id: t._id,
      date: t.date,
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      source: t.source,
      creditRemark: t.creditRemark,
      debitRemark: t.debitRemark,
      reference: t.reference,
      createdBy: {
        id: t.createdBy,
        name: t.createdByName,
        role: t.createdByRole
      }
    }))
  };
};

// GET /api/student-profile/:studentId
router.get('/:studentId', auth, permit(...STAFF_VIEW_ROLES), async (req, res) => {
  try {
    const { studentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const parentEmail = req.user.email?.toLowerCase().trim();

    // STRICT: For parents, verify they can ONLY access their linked student's profile
    if (userRole === ROLES.PARENT) {
      const parentEmail = req.user.email?.toLowerCase().trim();
      
      // Try to find student ONLY by linkedStudent or guardianEmail (NOT student's own email)
      let student = await Student.findOne({
        _id: studentId,
        linkedStudent: userId
      });

      if (!student && parentEmail) {
        student = await Student.findOne({
          _id: studentId,
          guardianEmail: parentEmail
        });
        
        // SECURITY: Verify this is NOT a student's own email
        if (student && student.email && student.email.toLowerCase().trim() === parentEmail) {
          student = null; // Reject if it's student's own email
        }
      }

      if (!student) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own child\'s profile. Only parent emails can access parent portal.'
        });
      }

      // SECURITY CHECK: Double verify the student is linked to this parent
      if (student.linkedStudent && student.linkedStudent.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This student is linked to a different parent account.'
        });
      }

      // SECURITY CHECK: Verify guardianEmail matches (if not linked yet)
      if (!student.linkedStudent && parentEmail && student.guardianEmail?.toLowerCase().trim() !== parentEmail) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Email does not match the parent email in student record.'
        });
      }

      // Ensure student is linked to this parent
      if (!student.linkedStudent || student.linkedStudent.toString() !== userId) {
        student.linkedStudent = userId;
        await student.save();
      }
    }

    // Now fetch the full student data with all relationships
    const student = await Student.findById(studentId)
      .populate('department', 'name code')
      .populate('subDepartments', 'name code')
      .populate('batches', 'name code academicYear');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const [attendanceRecords, sessions, examMarks, classAttendance] = await Promise.all([
      DailyAttendance.find({ student: studentId })
        .sort({ attendanceDate: -1 })
        .limit(30)
        .lean(),
      AttendanceSession.getInOrder(),
      ExamMarks.find({ student: studentId })
        .populate('exam', 'name examDate examType status academicYear')
        .sort({ 'exam.examDate': -1 })
        .limit(10)
        .lean(),
      // Get class attendance for this student
      ClassAttendance.find({
        'attendance.student': studentId,
        isDeleted: false
      })
        .sort({ sessionDate: -1 })
        .limit(30)
        .populate('subjectClass', 'className subject')
        .populate('conductedBy', 'fullName')
        .lean()
    ]);

    const attendance = buildAttendanceSummary(attendanceRecords, sessions);
    const exams = buildExamSummary(examMarks);
    const notes = sanitizeNotes(student.notes || []);
    const wallet = buildWalletSummary(student);

    // Process class attendance
    const classAttendanceData = classAttendance.map(session => {
      const studentAttendance = session.attendance.find(a => 
        a.student?.toString() === studentId || a.student?._id?.toString() === studentId
      );
      return {
        _id: session._id,
        date: session.sessionDate,
        className: session.subjectClass?.className || 'Unknown',
        subject: session.subjectClass?.subject || 'Unknown',
        status: studentAttendance?.status || 'absent',
        sessionStatus: session.sessionStatus,
        teacherNotes: session.sessionNotes?.teacherNotes || '',
        conductedBy: session.conductedBy?.fullName || 'Unknown'
      };
    });

    // Calculate class attendance statistics (only for normal classes)
    const normalClasses = classAttendance.filter(s => s.sessionStatus === 'completed');
    let classPresentCount = 0;
    let classAbsentCount = 0;
    normalClasses.forEach(session => {
      const studentAttendance = session.attendance.find(a => 
        a.student?.toString() === studentId || a.student?._id?.toString() === studentId
      );
      if (studentAttendance) {
        if (studentAttendance.status === 'present' || studentAttendance.status === 'late') {
          classPresentCount++;
        } else if (studentAttendance.status === 'absent') {
          classAbsentCount++;
        }
      }
    });
    const classAttendancePercentage = normalClasses.length > 0 
      ? Math.round((classPresentCount / normalClasses.length) * 100) 
      : 0;

    res.json({
      success: true,
      data: {
        student: formatStudentInfo(student),
        attendance,
        classAttendance: {
          records: classAttendanceData,
          statistics: {
            totalClasses: normalClasses.length,
            present: classPresentCount,
            absent: classAbsentCount,
            attendancePercentage: classAttendancePercentage
          }
        },
        exams,
        wallet,
        notes: {
          items: notes,
          total: student.notes?.length || 0,
          latestUpdate: notes[0]?.createdAt || null
        },
        permissions: {
          canAddNotes: NOTE_MANAGER_ROLES.includes(req.user.role),
          canEditNotes: NOTE_MANAGER_ROLES.includes(req.user.role),
          canDeleteNotes: NOTE_DELETE_ROLES.includes(req.user.role)
        }
      }
    });
  } catch (error) {
    console.error('❌ Error loading student profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load student profile',
      error: error.message
    });
  }
});

// GET /api/student-profile/:studentId/attendance-report
router.get('/:studentId/attendance-report', auth, permit(...STAFF_VIEW_ROLES), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { from, to } = req.query;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student id'
      });
    }

    const { start: defaultStart, end: defaultEnd } = getDefaultDateRange();
    const fromDate = from ? toStartOfDay(from) : defaultStart;
    const toDate = to ? toStartOfDay(to) : defaultEnd;

    if (!fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date range'
      });
    }

    if (fromDate > toDate) {
      return res.status(400).json({
        success: false,
        message: 'From date cannot be after To date'
      });
    }

    const student = await Student.findById(studentId)
      .select('fullName admissionNo rollNo department batches subDepartments')
      .populate('department', 'name code')
      .populate('batches', 'name code academicYear')
      .populate('subDepartments', 'name code');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const [sessions, attendanceRecords] = await Promise.all([
      AttendanceSession.getInOrder(),
      DailyAttendance.find({
        student: studentId,
        attendanceDate: { $gte: fromDate, $lte: toDate },
        isActive: true
      }).sort({ attendanceDate: 1 }).lean()
    ]);

    const sessionMeta = sessions.map(session => ({
      key: session.sessionKey,
      name: session.displayNames?.english || session.sessionKey,
      category: session.category,
      order: session.displayOrder
    }));

    const sessionTotals = sessionMeta.reduce((acc, session) => {
      acc[session.key] = {
        totals: { Present: 0, Absent: 0, Sick: 0, Leave: 0, total: 0 },
        monthly: {}
      };
      return acc;
    }, {});

    const overallMonthly = {};
    const monthsSet = new Set();
    let totalDays = 0;

    for (const record of attendanceRecords) {
      const date = new Date(record.attendanceDate);
      const mKey = monthKey(date);
      monthsSet.add(mKey);
      totalDays += 1;

      sessionMeta.forEach(session => {
        const status = record.sessions?.[session.key]?.status || 'Present';
        const target = sessionTotals[session.key];
        if (!target.monthly[mKey]) {
          target.monthly[mKey] = { Present: 0, Absent: 0, Sick: 0, Leave: 0, total: 0 };
        }
        if (!overallMonthly[mKey]) {
          overallMonthly[mKey] = { Present: 0, Absent: 0, Sick: 0, Leave: 0, total: 0 };
        }

        const incrementStatus = ATTENDANCE_STATUSES.includes(status) ? status : 'Present';
        target.monthly[mKey][incrementStatus] += 1;
        target.monthly[mKey].total += 1;
        target.totals[incrementStatus] += 1;
        target.totals.total += 1;

        overallMonthly[mKey][incrementStatus] += 1;
        overallMonthly[mKey].total += 1;
      });
    }

    const months = Array.from(monthsSet).sort();

    res.json({
      success: true,
      data: {
        student: {
          id: student._id,
          name: student.fullName,
          admissionNo: student.admissionNo,
          rollNo: student.rollNo,
          department: student.department,
          batches: student.batches,
          subDepartments: student.subDepartments
        },
        dateRange: {
          from: fromDate,
          to: toDate,
          totalDays
        },
        sessions: sessionMeta,
        months: months.map(key => ({ key, label: monthLabel(key) })),
        perSession: sessionTotals,
        overallMonthly
      }
    });
  } catch (error) {
    console.error('❌ Error building attendance report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to build attendance report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/student-profile/:studentId/notes
router.post('/:studentId/notes', auth, permit(...NOTE_MANAGER_ROLES), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { title, content, category = 'general', visibility = 'staff' } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Note content is required'
      });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const note = {
      _id: new mongoose.Types.ObjectId(),
      title: title?.trim() || 'Update',
      content: content.trim(),
      category: NOTE_CATEGORIES.has(category) ? category : 'general',
      visibility: NOTE_VISIBILITY.has(visibility) ? visibility : 'staff',
      createdBy: req.user.id,
      createdByName: req.user.fullName,
      createdByRole: req.user.role,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    student.notes.unshift(note);
    await student.save();

    res.status(201).json({
      success: true,
      message: 'Note added successfully',
      note: sanitizeNotes([note])[0]
    });
  } catch (error) {
    console.error('❌ Error adding student note:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add note',
      error: error.message
    });
  }
});

// POST /api/student-profile/:studentId/wallet/transactions
router.post('/:studentId/wallet/transactions', auth, permit(...NOTE_MANAGER_ROLES), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { type, amount, source, creditRemark, debitRemark, reference } = req.body;

    if (!type || !['credit', 'debit'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Transaction type must be credit or debit'
      });
    }

    if (amount === undefined || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a positive number'
      });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    if (!student.wallet) {
      student.wallet = {
        openingBalance: 0,
        totalCredit: 0,
        totalDebit: 0,
        currentBalance: 0,
        currency: 'INR'
      };
    }

    const currentBalance = student.wallet.currentBalance ?? 0;
    const numericAmount = Number(amount);
    let newBalance = currentBalance;

    if (type === 'credit') {
      newBalance += numericAmount;
      student.wallet.totalCredit = (student.wallet.totalCredit ?? 0) + numericAmount;
    } else {
      newBalance -= numericAmount;
      student.wallet.totalDebit = (student.wallet.totalDebit ?? 0) + numericAmount;
    }

    student.wallet.currentBalance = newBalance;

    const tx = {
      _id: new mongoose.Types.ObjectId(),
      date: new Date(),
      type,
      amount: numericAmount,
      balanceAfter: newBalance,
      source: source?.trim() || undefined,
      creditRemark: type === 'credit' ? (creditRemark || debitRemark || '').trim() || undefined : undefined,
      debitRemark: type === 'debit' ? (debitRemark || creditRemark || '').trim() || undefined : undefined,
      reference: reference?.trim() || undefined,
      createdBy: req.user.id,
      createdByName: req.user.fullName,
      createdByRole: req.user.role
    };

    student.walletTransactions.push(tx);
    await student.save();

    res.status(201).json({
      success: true,
      message: 'Transaction recorded successfully',
      wallet: buildWalletSummary(student)
    });
  } catch (error) {
    console.error('❌ Error adding wallet transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add transaction',
      error: error.message
    });
  }
});

// PUT /api/student-profile/:studentId/wallet/transactions/:txId
// Edit wallet transaction remarks/source/reference (admin-level only)
router.put('/:studentId/wallet/transactions/:txId', auth, permit(...WALLET_EDIT_ROLES), async (req, res) => {
  try {
    const { studentId, txId } = req.params;
    const { source, remark, reference } = req.body;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const tx = student.walletTransactions.id(txId);
    if (!tx) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    if (source !== undefined) {
      tx.source = source?.trim() || undefined;
    }

    if (remark !== undefined) {
      if (tx.type === 'credit') {
        tx.creditRemark = remark?.trim() || undefined;
      } else {
        tx.debitRemark = remark?.trim() || undefined;
      }
    }

    if (reference !== undefined) {
      tx.reference = reference?.trim() || undefined;
    }

    await student.save();

    res.json({
      success: true,
      message: 'Transaction updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating wallet transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update transaction',
      error: error.message
    });
  }
});

// PUT /api/student-profile/:studentId/notes/:noteId
router.put('/:studentId/notes/:noteId', auth, permit(...NOTE_MANAGER_ROLES), async (req, res) => {
  try {
    const { studentId, noteId } = req.params;
    const { title, content, category, visibility } = req.body;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const note = student.notes.id(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    if (title !== undefined) note.title = title.trim();
    if (content !== undefined) note.content = content.trim();
    if (category !== undefined && NOTE_CATEGORIES.has(category)) note.category = category;
    if (visibility !== undefined && NOTE_VISIBILITY.has(visibility)) note.visibility = visibility;
    note.updatedAt = new Date();

    await student.save();

    res.json({
      success: true,
      message: 'Note updated successfully',
      note: sanitizeNotes([note])[0]
    });
  } catch (error) {
    console.error('❌ Error updating student note:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update note',
      error: error.message
    });
  }
});

// DELETE /api/student-profile/:studentId/notes/:noteId
router.delete('/:studentId/notes/:noteId', auth, permit(...NOTE_DELETE_ROLES), async (req, res) => {
  try {
    const { studentId, noteId } = req.params;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const note = student.notes.id(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    note.remove();
    await student.save();

    res.json({
      success: true,
      message: 'Note deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting student note:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete note',
      error: error.message
    });
  }
});

export default router;

