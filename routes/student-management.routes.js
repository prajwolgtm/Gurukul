import express from 'express';
import Student from '../models/Student.js';
import Department from '../models/Department.js';
import SubDepartment from '../models/SubDepartment.js';
import Batch from '../models/Batch.js';
import { auth } from '../middleware/auth.js';
import { ROLES } from '../utils/roles.js';

const router = express.Router();

// @route   GET /api/students
// @desc    Get all students with filtering and pagination
// @access  Private
const listStudents = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      department,
      subDepartment,
      batch,
      status = 'active',
      search
    } = req.query;

    // Build query
    let query = { isActive: true };

    if (department) query.department = department;
    if (subDepartment) query.subDepartments = subDepartment;
    if (batch) query.batches = batch;
    if (status) query.status = status;

    // Add search functionality
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { admissionNo: { $regex: search, $options: 'i' } },
        { fatherName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      populate: [
        { path: 'department', select: 'name code' },
        { path: 'subDepartments', select: 'name code' },
        { path: 'batches', select: 'name code academicYear' }
      ],
      sort: { fullName: 1 }
    };

    const students = await Student.find(query)
      .populate(options.populate)
      .sort(options.sort)
      .limit(options.limit * 1)
      .skip((options.page - 1) * options.limit);

    const total = await Student.countDocuments(query);

    return res.json({
      success: true,
      count: students.length,
      total,
      page: options.page,
      pages: Math.ceil(total / options.limit),
      students
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching students',
      error: error.message
    });
  }
};

// @route   GET /api/student-management
router.get('/', auth, listStudents);

// @route   GET /api/student-management/students
router.get('/students', auth, listStudents);

// @route   GET /api/student-management/departments
router.get('/departments', auth, async (req, res) => {
  try {
    const departments = await Department.find({}).select('name code description status');
    res.json({
      success: true,
      departments
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching departments',
      error: error.message
    });
  }
});

// @route   POST /api/student-management/reference-import
// @desc    Dry-run or apply reference workbook updates for existing students
// @access  Private (Admin/Coordinator only)
router.post('/reference-import', auth, async (req, res) => {
  try {
    const userRole = req.user.role;

    if (![ROLES.ADMIN, ROLES.COORDINATOR].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only Admin or Coordinator can import reference student data'
      });
    }

    const {
      records = [],
      dryRun = true,
      onlyFillMissing = true,
      updateStatusFromQuitRecords = false
    } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide records array'
      });
    }

    const normalizeAdmissionNo = (value = '') => String(value)
      .trim()
      .replace(/\s+/g, '')
      .replace(/^0+(\d+\/)/, '$1')
      .toLowerCase();

    const cleanString = (value) => {
      if (value === undefined || value === null) return '';
      const text = String(value).replace(/\r\n/g, '\n').trim();
      return ['-', '—', 'n/a', 'na', 'none', '#value!', '#ref!', '#n/a'].includes(text.toLowerCase()) ? '' : text;
    };

    const normalizeBloodGroup = (value) => {
      const text = cleanString(value).toUpperCase().replace(/\s+/g, '');
      const normalized = text
        .replace('POSITIVE', '+')
        .replace('NEGATIVE', '-')
        .replace('+VE', '+')
        .replace('-VE', '-');
      const allowed = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
      return allowed.includes(normalized) ? normalized : '';
    };

    const parseDate = (value) => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    const phoneDigits = (value) => cleanString(value).replace(/\D/g, '');

    const buildUpdate = (student, source) => {
      const fieldMap = {
        fullName: cleanString(source.fullName),
        dateOfBirth: parseDate(source.dateOfBirth),
        bloodGroup: normalizeBloodGroup(source.bloodGroup),
        phone: cleanString(source.phone),
        address: cleanString(source.address || source.presentAddress || source.permanentAddress),
        presentAddress: cleanString(source.presentAddress),
        permanentAddress: cleanString(source.permanentAddress),
        fatherName: cleanString(source.fatherName || source.parentsName),
        motherName: cleanString(source.motherName),
        occupation: cleanString(source.occupation),
        guardianPhone: cleanString(source.guardianPhone || source.phone),
        nationality: cleanString(source.nationality),
        religion: cleanString(source.religion),
        caste: cleanString(source.caste),
        motherTongue: cleanString(source.motherTongue),
        lastSchoolAttended: cleanString(source.lastSchoolAttended),
        lastStandardStudied: cleanString(source.lastStandardStudied),
        tcDetails: cleanString(source.tcDetails),
        admittedToStandard: cleanString(source.admittedToStandard),
        currentStandard: cleanString(source.currentStandard),
        dateOfAdmission: parseDate(source.dateOfAdmission),
        shaakha: cleanString(source.shaakha),
        gothra: cleanString(source.gothra),
        remarks: cleanString(source.remarks)
      };

      if (updateStatusFromQuitRecords && source.sourceStatus === 'quit') {
        fieldMap.status = 'leftout';
        fieldMap.isActive = true;
      }

      const update = {};
      const conflicts = [];

      Object.entries(fieldMap).forEach(([field, sourceValue]) => {
        if (sourceValue === '' || sourceValue === null || sourceValue === undefined) return;
        const currentValue = student[field];
        const currentText = currentValue instanceof Date
          ? currentValue.toISOString().slice(0, 10)
          : cleanString(currentValue);
        const sourceText = sourceValue instanceof Date
          ? sourceValue.toISOString().slice(0, 10)
          : cleanString(sourceValue);
        const currentDigits = phoneDigits(currentText);
        const sourceDigits = phoneDigits(sourceText);
        const sourceAddsKnownPhone = ['phone', 'guardianPhone'].includes(field) &&
          currentDigits.length >= 6 &&
          sourceDigits.includes(currentDigits) &&
          sourceText.length > currentText.length;
        const defaultNationalityNeedsCorrection = field === 'nationality' &&
          currentText.toLowerCase() === 'indian' &&
          ['nepal', 'nepali'].includes(sourceText.toLowerCase());
        const missing = currentText === '' ||
          (['dateOfBirth', 'dateOfAdmission'].includes(field) && currentText === '2025-12-22') ||
          sourceAddsKnownPhone ||
          defaultNationalityNeedsCorrection;

        if (missing || !onlyFillMissing) {
          if (!missing && currentText !== sourceText) {
            conflicts.push({ field, current: currentText, source: sourceText });
          }
          update[field] = sourceValue;
        } else if (currentText !== sourceText) {
          conflicts.push({ field, current: currentText, source: sourceText });
        }
      });

      return { update, conflicts };
    };

    const students = await Student.find({}).select('+admissionNo');
    const byExactAdmission = new Map(students.map(student => [student.admissionNo, student]));
    const byNormalizedAdmission = new Map(students.map(student => [normalizeAdmissionNo(student.admissionNo), student]));

    const summary = {
      received: records.length,
      matched: 0,
      unmatched: 0,
      wouldUpdate: 0,
      updated: 0,
      unchanged: 0,
      conflicts: 0,
      errors: 0
    };

    const details = [];

    for (const record of records) {
      const admissionNo = cleanString(record.admissionNo);
      if (!admissionNo) {
        summary.unmatched += 1;
        details.push({ admissionNo, fullName: record.fullName, status: 'skipped', reason: 'Missing admission number' });
        continue;
      }

      const student = byExactAdmission.get(admissionNo) || byNormalizedAdmission.get(normalizeAdmissionNo(admissionNo));
      if (!student) {
        summary.unmatched += 1;
        details.push({ admissionNo, fullName: record.fullName, status: 'unmatched', sourceSheet: record.sourceSheet });
        continue;
      }

      summary.matched += 1;
      const { update, conflicts } = buildUpdate(student, record);
      const updateKeys = Object.keys(update);
      summary.conflicts += conflicts.length;

      if (updateKeys.length === 0) {
        summary.unchanged += 1;
        details.push({
          admissionNo,
          studentId: student._id,
          fullName: student.fullName,
          status: 'unchanged',
          conflicts,
          sourceSheet: record.sourceSheet
        });
        continue;
      }

      summary.wouldUpdate += 1;

      if (!dryRun) {
        try {
          await Student.findByIdAndUpdate(student._id, update, { runValidators: true });
          summary.updated += 1;
        } catch (error) {
          summary.errors += 1;
          details.push({
            admissionNo,
            studentId: student._id,
            fullName: student.fullName,
            status: 'error',
            error: error.message,
            fields: updateKeys,
            conflicts,
            sourceSheet: record.sourceSheet
          });
          continue;
        }
      }

      details.push({
        admissionNo,
        studentId: student._id,
        fullName: student.fullName,
        status: dryRun ? 'would-update' : 'updated',
        fields: updateKeys,
        conflicts,
        sourceSheet: record.sourceSheet
      });
    }

    return res.json({
      success: true,
      dryRun,
      onlyFillMissing,
      updateStatusFromQuitRecords,
      summary,
      details: details.slice(0, 250),
      truncatedDetails: details.length > 250
    });
  } catch (error) {
    console.error('Error importing student reference data:', error);
    return res.status(500).json({
      success: false,
      message: 'Error importing student reference data',
      error: error.message
    });
  }
});

// @route   GET /api/students/:id
// @desc    Get single student
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('department', 'name code')
      .populate('subDepartments', 'name code')
      .populate('batches', 'name code academicYear');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    res.json({
      success: true,
      student
    });
  } catch (error) {
    console.error('Error fetching student:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching student',
      error: error.message
    });
  }
});

// @route   POST /api/students
// @desc    Create new student
// @access  Private (Admin/Coordinator/HOD)
router.post('/', auth, async (req, res) => {
  try {
    const userRole = req.user.role;

    // Check permissions
    if (![ROLES.ADMIN, ROLES.COORDINATOR, ROLES.HOD].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to create students'
      });
    }

    const {
      admissionNo, fullName, dateOfBirth, bloodGroup,
      phone, email, address, fatherName, motherName, guardianPhone,
      shaakha, gothra, department, subDepartments, batches,
      admittedToStandard, currentStandard, dateOfAdmission, remarks
    } = req.body;

    // Validate required fields
    if (!admissionNo || !fullName || !dateOfBirth || !fatherName || !motherName || !guardianPhone || !department) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: admissionNo, fullName, dateOfBirth, fatherName, motherName, guardianPhone, department'
      });
    }

    // Validate department exists
    const departmentExists = await Department.findById(department);
    if (!departmentExists) {
      return res.status(400).json({
        success: false,
        message: 'Invalid department'
      });
    }

    // Validate sub-departments belong to the department
    if (subDepartments && subDepartments.length > 0) {
      const validSubDepartments = await SubDepartment.find({
        _id: { $in: subDepartments },
        department: department
      });
      if (validSubDepartments.length !== subDepartments.length) {
        return res.status(400).json({
          success: false,
          message: 'Some sub-departments do not belong to the selected department'
        });
      }
    }

    // Validate batches belong to the department or sub-departments
    if (batches && batches.length > 0) {
      const validBatches = await Batch.find({
        _id: { $in: batches },
        $or: [
          { department: department },
          { subDepartment: { $in: subDepartments || [] } }
        ]
      });
      if (validBatches.length !== batches.length) {
        return res.status(400).json({
          success: false,
          message: 'Some batches do not belong to the selected department or sub-departments'
        });
      }
    }

    const student = new Student({
      admissionNo, fullName, dateOfBirth, bloodGroup,
      phone, email, address, fatherName, motherName, guardianPhone,
      shaakha, gothra, department, subDepartments, batches,
      admittedToStandard, currentStandard, dateOfAdmission, remarks
    });

    await student.save();
    await student.populate([
      { path: 'department', select: 'name code' },
      { path: 'subDepartments', select: 'name code' },
      { path: 'batches', select: 'name code academicYear' }
    ]);

    // Update batch student counts
    if (batches && batches.length > 0) {
      await Promise.all(batches.map(async (batchId) => {
        await Batch.findByIdAndUpdate(batchId, {
          $inc: { currentStudents: 1 }
        });
      }));
    }

    res.status(201).json({
      success: true,
      message: 'Student created successfully',
      student
    });
  } catch (error) {
    console.error('Error creating student:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Admission number already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating student',
      error: error.message
    });
  }
});

// @route   PUT /api/students/:id
// @desc    Update student
// @access  Private (Admin/Coordinator/HOD)
router.put('/:id', auth, async (req, res) => {
  try {
    const userRole = req.user.role;

    // Check permissions
    if (![ROLES.ADMIN, ROLES.COORDINATOR, ROLES.HOD].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to update students'
      });
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const {
      fullName, dateOfBirth, bloodGroup, phone, email, address,
      fatherName, motherName, guardianPhone, shaakha, gothra,
      department, subDepartments, batches, admittedToStandard,
      currentStandard, dateOfAdmission, status, remarks
    } = req.body;

    // If department is being changed, validate it
    if (department && department !== student.department.toString()) {
      const departmentExists = await Department.findById(department);
      if (!departmentExists) {
        return res.status(400).json({
          success: false,
          message: 'Invalid department'
        });
      }
    }

    // Update batch counts if batches are changing
    const oldBatches = student.batches.map(b => b.toString());
    const newBatches = batches || [];

    // Remove from old batches
    const batchesToRemove = oldBatches.filter(b => !newBatches.includes(b));
    if (batchesToRemove.length > 0) {
      await Promise.all(batchesToRemove.map(async (batchId) => {
        await Batch.findByIdAndUpdate(batchId, {
          $inc: { currentStudents: -1 }
        });
      }));
    }

    // Add to new batches
    const batchesToAdd = newBatches.filter(b => !oldBatches.includes(b));
    if (batchesToAdd.length > 0) {
      await Promise.all(batchesToAdd.map(async (batchId) => {
        await Batch.findByIdAndUpdate(batchId, {
          $inc: { currentStudents: 1 }
        });
      }));
    }

    // Update student
    const updatedStudent = await Student.findByIdAndUpdate(
      req.params.id,
      {
        fullName, dateOfBirth, bloodGroup, phone, email, address,
        fatherName, motherName, guardianPhone, shaakha, gothra,
        department, subDepartments, batches, admittedToStandard,
        currentStandard, dateOfAdmission, status, remarks
      },
      { new: true, runValidators: true }
    ).populate([
      { path: 'department', select: 'name code' },
      { path: 'subDepartments', select: 'name code' },
      { path: 'batches', select: 'name code academicYear' }
    ]);

    res.json({
      success: true,
      message: 'Student updated successfully',
      student: updatedStudent
    });
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating student',
      error: error.message
    });
  }
});

// @route   DELETE /api/students/:id
// @desc    Delete student (soft delete)
// @access  Private (Admin/Coordinator only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const userRole = req.user.role;

    // Check permissions
    if (![ROLES.ADMIN, ROLES.COORDINATOR].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only Admin or Coordinator can delete students'
      });
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Update batch counts
    if (student.batches && student.batches.length > 0) {
      await Promise.all(student.batches.map(async (batchId) => {
        await Batch.findByIdAndUpdate(batchId, {
          $inc: { currentStudents: -1 }
        });
      }));
    }

    // Soft delete
    await Student.findByIdAndUpdate(req.params.id, {
      isActive: false,
      status: 'leftout'
    });

    res.json({
      success: true,
      message: 'Student deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting student',
      error: error.message
    });
  }
});

// @route   POST /api/students/bulk-upload
// @desc    Bulk upload students
// @access  Private (Admin/Coordinator only)
router.post('/bulk-upload', auth, async (req, res) => {
  try {
    const userRole = req.user.role;

    // Check permissions
    if (![ROLES.ADMIN, ROLES.COORDINATOR].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only Admin or Coordinator can bulk upload students'
      });
    }

    const { students } = req.body;

    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Students array is required'
      });
    }

    const results = {
      success: [],
      errors: []
    };

    for (let i = 0; i < students.length; i++) {
      try {
        const studentData = students[i];
        
        // Validate required fields
        if (!studentData.admissionNo || !studentData.fullName || !studentData.department) {
          results.errors.push({
            row: i + 1,
            error: 'Missing required fields: admissionNo, fullName, department'
          });
          continue;
        }

        const student = new Student(studentData);
        await student.save();
        
        results.success.push({
          row: i + 1,
          admissionNo: studentData.admissionNo,
          fullName: studentData.fullName
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
      message: `Bulk upload completed. ${results.success.length} students created, ${results.errors.length} errors`,
      results
    });
  } catch (error) {
    console.error('Error in bulk upload:', error);
    res.status(500).json({
      success: false,
      message: 'Error in bulk upload',
      error: error.message
    });
  }
});

export default router;
