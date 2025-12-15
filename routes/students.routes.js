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
router.get('/', auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      department = '',
      subDepartment = '',
      batch = '',
      status = 'active',
      includeLeftout = 'false',
      sortBy = 'fullName',
      sortOrder = 'asc'
    } = req.query;

    // Build query - exclude leftout students by default
    let query = { isActive: true };
    
    // Apply status filter if specified
    if (status && status !== 'all') {
      // If status is explicitly set to 'leftout', show only leftout
      // Otherwise, show the specified status (and exclude leftout)
      query.status = status;
    } else {
      // If status is 'all' or not specified, exclude leftout by default
      // Only include leftout if explicitly requested via includeLeftout parameter
      if (includeLeftout !== 'true') {
        query.status = { $ne: 'leftout' };
      }
    }
    
    if (department) {
      query.department = department;
    }
    
    if (subDepartment) {
      query.subDepartments = { $in: [subDepartment] };
    }
    
    if (batch) {
      query.batches = { $in: [batch] };
    }
    
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { admissionNo: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination options
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
      populate: [
        { path: 'department', select: 'name code' },
        { path: 'subDepartments', select: 'name code' },
        { path: 'batches', select: 'name code academicYear' }
      ]
    };

    const result = await Student.paginate(query, options);

    res.json({
      success: true,
      students: result.docs,
      pagination: {
        currentPage: result.page,
        totalPages: result.totalPages,
        totalStudents: result.totalDocs,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage
      }
    });

  } catch (error) {
    console.error('❌ Error fetching students:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching students',
      error: error.message
    });
  }
});

// @route   GET /api/students/:id
// @desc    Get single student by ID
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
    console.error('❌ Error fetching student:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching student',
      error: error.message
    });
  }
});

// @route   POST /api/students
// @desc    Create new student
// @access  Private (Admin, Coordinator, Principal)
router.post('/', auth, async (req, res) => {
  try {
    // Check permissions
    const allowedRoles = [ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create students'
      });
    }

    const {
      admissionNo,
      fullName,
      dateOfBirth,
      bloodGroup,
      gender,
      phone,
      email,
      address,
      fatherName,
      motherName,
      guardianPhone,
      guardianEmail,
      department,
      subDepartments = [],
      batches = [],
      admittedToStandard,
      currentStandard,
      dateOfAdmission,
      shaakha,
      gothra,
      remarks
    } = req.body;

    // Validate required fields
    if (!admissionNo || !fullName || !dateOfBirth || !gender || !fatherName || !motherName || !guardianPhone || !department) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Check if admission number already exists
    const existingStudent = await Student.findOne({ admissionNo });
    if (existingStudent) {
      return res.status(400).json({
        success: false,
        message: 'Student with this admission number already exists'
      });
    }

    // Validate department exists
    const departmentDoc = await Department.findById(department);
    if (!departmentDoc) {
      return res.status(400).json({
        success: false,
        message: 'Invalid department'
      });
    }

    // Validate sub-departments belong to the department
    if (subDepartments.length > 0) {
      const subDeptDocs = await SubDepartment.find({
        _id: { $in: subDepartments },
        department: department
      });
      if (subDeptDocs.length !== subDepartments.length) {
        return res.status(400).json({
          success: false,
          message: 'Some sub-departments do not belong to the selected department'
        });
      }
    }

    // Validate batches
    if (batches.length > 0) {
      const batchDocs = await Batch.find({
        _id: { $in: batches },
        department: department
      });
      if (batchDocs.length !== batches.length) {
        return res.status(400).json({
          success: false,
          message: 'Some batches do not belong to the selected department'
        });
      }
    }

    // Create student
    const student = new Student({
      admissionNo,
      fullName,
      dateOfBirth,
      bloodGroup,
      gender,
      phone,
      email,
      address,
      fatherName,
      motherName,
      guardianPhone,
      guardianEmail: guardianEmail || '',
      department,
      subDepartments,
      batches,
      admittedToStandard,
      currentStandard,
      dateOfAdmission: dateOfAdmission || new Date(),
      shaakha,
      gothra,
      remarks,
      status: 'active',
      isActive: true
    });

    await student.save();

    // Populate references before sending response
    await student.populate([
      { path: 'department', select: 'name code' },
      { path: 'subDepartments', select: 'name code' },
      { path: 'batches', select: 'name code academicYear' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Student created successfully',
      student
    });

  } catch (error) {
    console.error('❌ Error creating student:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating student',
      error: error.message
    });
  }
});

// @route   PUT /api/students/:id
// @desc    Update student
// @access  Private (Admin, Coordinator, Principal)
router.put('/:id', auth, async (req, res) => {
  try {
    // Check permissions
    const allowedRoles = [ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update students'
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
      admissionNo,
      fullName,
      dateOfBirth,
      bloodGroup,
      gender,
      phone,
      email,
      address,
      fatherName,
      motherName,
      guardianPhone,
      guardianEmail,
      department,
      subDepartments,
      batches,
      admittedToStandard,
      currentStandard,
      dateOfAdmission,
      shaakha,
      gothra,
      status,
      remarks
    } = req.body;

    // Check if admission number is being changed and if it already exists
    if (admissionNo && admissionNo !== student.admissionNo) {
      const existingStudent = await Student.findOne({ admissionNo });
      if (existingStudent) {
        return res.status(400).json({
          success: false,
          message: 'Student with this admission number already exists'
        });
      }
    }

    // Validate department if being changed
    if (department && department !== student.department.toString()) {
      const departmentDoc = await Department.findById(department);
      if (!departmentDoc) {
        return res.status(400).json({
          success: false,
          message: 'Invalid department'
        });
      }
    }

    // Update student fields
    const updateFields = {
      admissionNo: admissionNo || student.admissionNo,
      fullName: fullName || student.fullName,
      dateOfBirth: dateOfBirth || student.dateOfBirth,
      bloodGroup: bloodGroup || student.bloodGroup,
      gender: gender || student.gender,
      phone: phone || student.phone,
      email: email || student.email,
      address: address || student.address,
      fatherName: fatherName || student.fatherName,
      motherName: motherName || student.motherName,
      guardianPhone: guardianPhone || student.guardianPhone,
      guardianEmail: guardianEmail !== undefined ? guardianEmail : student.guardianEmail,
      department: department || student.department,
      subDepartments: subDepartments !== undefined ? subDepartments : student.subDepartments,
      batches: batches !== undefined ? batches : student.batches,
      admittedToStandard: admittedToStandard || student.admittedToStandard,
      currentStandard: currentStandard || student.currentStandard,
      dateOfAdmission: dateOfAdmission || student.dateOfAdmission,
      shaakha: shaakha || student.shaakha,
      gothra: gothra || student.gothra,
      status: status || student.status,
      remarks: remarks !== undefined ? remarks : student.remarks
    };

    const updatedStudent = await Student.findByIdAndUpdate(
      req.params.id,
      updateFields,
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
    console.error('❌ Error updating student:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating student',
      error: error.message
    });
  }
});

// @route   DELETE /api/students/:id
// @desc    Delete student (soft delete)
// @access  Private (Admin, Coordinator)
router.delete('/:id', auth, async (req, res) => {
  try {
    // Check permissions
    const allowedRoles = [ROLES.ADMIN, ROLES.COORDINATOR];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete students'
      });
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Soft delete - mark as inactive
    student.status = 'inactive';
    student.isActive = false;
    await student.save();

    res.json({
      success: true,
      message: 'Student deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting student:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting student',
      error: error.message
    });
  }
});

// @route   POST /api/students/bulk-upload
// @desc    Bulk upload students
// @access  Private (Admin, Coordinator)
router.post('/bulk-upload', auth, async (req, res) => {
  try {
    // Check permissions
    const allowedRoles = [ROLES.ADMIN, ROLES.COORDINATOR];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to bulk upload students'
      });
    }

    const { students } = req.body;

    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No students data provided'
      });
    }

    const parseDate = (value) => {
      if (!value) return null;
      // Accept dd/mm/yyyy or yyyy-mm-dd
      if (value.includes('/')) {
        const [dd, mm, yyyy] = value.split('/').map((v) => v.trim());
        if (dd && mm && yyyy) return new Date(`${yyyy}-${mm}-${dd}`);
      }
      return new Date(value);
    };

    const clean = (obj) => {
      const out = {};
      Object.entries(obj || {}).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        if (typeof v === 'string' && v.trim() === '') return;
        out[k] = v;
      });
      return out;
    };

    const results = {
      success: [],
      errors: [],
      total: students.length
    };

    for (let i = 0; i < students.length; i++) {
      const row = students[i] || {};
      try {
        const admissionNo = row.admissionNo || row['Admission Number'] || row['Admission No'] || row['admission_no'];
        const fullName = row.fullName || row['Full Name'] || row['Name'];
        const department = row.department || row['Department'] || row['departmentId'];

        if (!admissionNo || !fullName) {
          results.errors.push({
            row: i + 1,
            error: 'Missing required fields (admissionNo, fullName)'
          });
          continue;
        }

        // Check duplicates
        const existingStudent = await Student.findOne({ admissionNo });
        if (existingStudent) {
          results.errors.push({
            row: i + 1,
            error: `Student with admission number ${admissionNo} already exists`
          });
          continue;
        }

        // Get parent email - map to guardianEmail field
        const parentEmail = row.parentEmail || row['Parent Email'] || row['parentEmail'] || row.guardianEmail || row['Guardian Email'];
        
        // Build student document with safe parsing and filtering empty values
        const studentDoc = clean({
          admissionNo,
          fullName,
          dateOfBirth: parseDate(row.dateOfBirth || row.dob || row['Date of Birth'] || row['D O B']),
          gender: row.gender || row['Gender'],
          bloodGroup: row.bloodGroup || row['Blood Group'],
          phone: row.phone || row['Phone'],
          email: row.email || row['Email'],
          address: row.address || row['Address'],
          fatherName: row.fatherName || row['Father\'s Name'] || row['Father Name'],
          motherName: row.motherName || row['Mother\'s Name'] || row['Mother Name'],
          guardianPhone: row.guardianPhone || row['Guardian Phone'] || row['Telephone / Mobile No'],
          guardianEmail: parentEmail ? parentEmail.toLowerCase().trim() : undefined, // Map parentEmail to guardianEmail
          shaakha: row.shaakha || row['Shaakha'],
          gothra: row.gothra || row['Gothra'],
          department,
          subDepartments: Array.isArray(row.subDepartments) ? row.subDepartments : 
                         (row['Sub-Departments'] ? (Array.isArray(row['Sub-Departments']) ? row['Sub-Departments'] : [row['Sub-Departments']]) : []),
          batches: Array.isArray(row.batches) ? row.batches : 
                  (row['Batches'] ? (Array.isArray(row['Batches']) ? row['Batches'] : [row['Batches']]) : []),
          admittedStandard: row.admittedStandard || row['Admitted to Standard'],
          currentStandard: row.currentStandard || row['Current Standard'],
          dateOfAdmission: parseDate(row.dateOfAdmission || row['Date of Admission']),
          status: row.status || row['Status'] || 'active',
          remarks: row.remarks || row['Remarks'],
          isActive: row.isActive !== false
        });

        const student = new Student(studentDoc);
        await student.save();

        results.success.push({
          row: i + 1,
          admissionNo,
          fullName
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
      message: `Bulk upload completed. ${results.success.length} students created, ${results.errors.length} errors.`,
      results
    });

  } catch (error) {
    console.error('❌ Error in bulk upload:', error);
    res.status(500).json({
      success: false,
      message: 'Error in bulk upload',
      error: error.message
    });
  }
});

// @route   GET /api/students/stats
// @desc    Get student statistics
// @access  Private
router.get('/stats/overview', auth, async (req, res) => {
  try {
    const stats = await Promise.all([
      Student.countDocuments({ status: 'active' }),
      Student.countDocuments({ status: 'inactive' }),
      Student.countDocuments({ status: 'graduated' }),
      Student.countDocuments({ status: 'transferred' }),
      Student.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: '$department', count: { $sum: 1 } } },
        { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'department' } },
        { $unwind: '$department' },
        { $project: { departmentName: '$department.name', count: 1 } }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        active: stats[0],
        inactive: stats[1],
        graduated: stats[2],
        transferred: stats[3],
        total: stats[0] + stats[1] + stats[2] + stats[3],
        byDepartment: stats[4]
      }
    });

  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
});

export default router;
