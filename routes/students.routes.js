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

    // Handle special sorting for admission numbers (format: "number/year")
    if (sortBy === 'admissionNo') {
      // For admission numbers, we need to sort by year first, then by number
      // We'll use aggregation pipeline for this
      const sortDirection = sortOrder === 'desc' ? -1 : 1;
      
      // Use aggregation to parse and sort admission numbers
      const pipeline = [
        { $match: query },
        {
          $addFields: {
            admissionNoParts: {
              $split: [{ $ifNull: ['$admissionNo', '0/0'] }, '/']
            }
          }
        },
        {
          $addFields: {
            admissionNoYear: {
              $toInt: {
                $ifNull: [
                  { $arrayElemAt: ['$admissionNoParts', 1] },
                  '0'
                ]
              }
            },
            admissionNoNumber: {
              $toInt: {
                $ifNull: [
                  { $arrayElemAt: ['$admissionNoParts', 0] },
                  '0'
                ]
              }
            }
          }
        },
        {
          $sort: {
            admissionNoYear: sortDirection,
            admissionNoNumber: sortDirection
          }
        },
        {
          $project: {
            admissionNoParts: 0,
            admissionNoYear: 0,
            admissionNoNumber: 0
          }
        },
        {
          $skip: (parseInt(page) - 1) * parseInt(limit)
        },
        {
          $limit: parseInt(limit)
        }
      ];

      // Execute aggregation
      const students = await Student.aggregate(pipeline);
      const totalDocs = await Student.countDocuments(query);
      
      // Convert aggregation results back to Mongoose documents for population
      const studentIds = students.map(s => s._id);
      const populatedStudents = await Student.find({ _id: { $in: studentIds } })
        .populate([
          { path: 'department', select: 'name code' },
          { path: 'subDepartments', select: 'name code' },
          { path: 'batches', select: 'name code academicYear' }
        ]);
      
      // Create a map for quick lookup
      const studentMap = new Map();
      populatedStudents.forEach(s => {
        studentMap.set(s._id.toString(), s);
      });
      
      // Maintain the sort order from aggregation
      const sortedPopulated = studentIds
        .map(id => studentMap.get(id.toString()))
        .filter(Boolean);

      return res.json({
        success: true,
        students: sortedPopulated,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalDocs / parseInt(limit)),
          totalStudents: totalDocs,
          hasNextPage: parseInt(page) < Math.ceil(totalDocs / parseInt(limit)),
          hasPrevPage: parseInt(page) > 1
        }
      });
    }

    // Regular sorting for other fields
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

    // Create student - include all fields from Student schema to match bulk upload format
    const {
      presentAddress,
      permanentAddress,
      occupation,
      nationality,
      religion,
      caste,
      motherTongue,
      lastSchoolAttended,
      lastStandardStudied,
      tcDetails
    } = req.body;

    const student = new Student({
      admissionNo,
      fullName,
      dateOfBirth,
      bloodGroup,
      gender,
      phone,
      email,
      address,
      presentAddress: presentAddress || address || '',
      permanentAddress: permanentAddress || presentAddress || address || '',
      fatherName,
      motherName,
      occupation: occupation || '',
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
      lastSchoolAttended: lastSchoolAttended || '',
      lastStandardStudied: lastStandardStudied || '',
      tcDetails: tcDetails || '',
      remarks,
      nationality: nationality || 'Indian',
      religion: religion || 'Hindu',
      caste: caste || '',
      motherTongue: motherTongue || '',
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

    // Soft delete - mark as leftout
    student.status = 'leftout';
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
    
    // Preload departments for shaakha resolution
    const allDepartments = await Department.find({ isActive: true }).lean();
    const allSubDepartments = await SubDepartment.find({ isActive: true }).lean();
    
    // Helper to resolve department from shaakha
    const resolveDepartmentFromShaakha = (shaakha) => {
      if (!shaakha) return { department: null, subDepartment: null };
      const s = shaakha.toString().toLowerCase();
      
      let deptName = null;
      let subDeptName = null;
      
      if (s.includes('krishna') || s.includes('taittiriya')) {
        deptName = 'yajurveda';
        subDeptName = 'krishna';
      } else if (s.includes('shukla') && s.includes('kanva')) {
        deptName = 'yajurveda';
        subDeptName = 'kanva';
      } else if (s.includes('shukla') && (s.includes('madhyandina') || s.includes('madhyan'))) {
        deptName = 'yajurveda';
        subDeptName = 'madhyandina';
      } else if (s.includes('shukla')) {
        deptName = 'yajurveda';
        subDeptName = 'madhyandina'; // default
      } else if (s.includes('rig') || s.includes('shaakal') || s.includes('shakal')) {
        deptName = 'rigveda';
        subDeptName = 'shaakal';
      } else if (s.includes('sama') && (s.includes('ranayaneeya') || s.includes('ranayani'))) {
        deptName = 'samaveda';
        subDeptName = 'ranayaneeya';
      } else if (s.includes('sama') && (s.includes('kauthuma') || s.includes('kauthum'))) {
        deptName = 'samaveda';
        subDeptName = 'kauthuma';
      } else if (s.includes('sama')) {
        deptName = 'samaveda';
        subDeptName = 'kauthuma'; // default
      } else if (s.includes('atharva') || s.includes('shaunaka') || s.includes('shaunak')) {
        deptName = 'atharvaveda';
        subDeptName = 'shaunaka';
      }
      
      const department = deptName ? allDepartments.find(d => d.name.toLowerCase().includes(deptName)) : null;
      const subDepartment = subDeptName ? allSubDepartments.find(sd => sd.name.toLowerCase().includes(subDeptName)) : null;
      
      return { department: department?._id || null, subDepartment: subDepartment?._id || null };
    };

    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No students data provided'
      });
    }

    const parseDate = (value) => {
      if (!value) return null;
      // Convert to string first to handle numbers
      const strValue = value.toString().trim();
      if (!strValue) return null;
      
      // Accept dd/mm/yyyy format
      if (strValue.includes('/')) {
        const parts = strValue.split('/').map((v) => v.trim());
        if (parts.length === 3) {
          const [dd, mm, yyyy] = parts;
          // Handle 2-digit year
          const fullYear = yyyy.length === 2 ? (parseInt(yyyy) > 50 ? `19${yyyy}` : `20${yyyy}`) : yyyy;
          const date = new Date(parseInt(fullYear), parseInt(mm) - 1, parseInt(dd));
          if (!isNaN(date.getTime())) return date;
        }
      }
      
      // Accept yyyy-mm-dd format
      if (strValue.includes('-')) {
        const date = new Date(strValue);
        if (!isNaN(date.getTime())) return date;
      }
      
      // Try standard parsing
      const date = new Date(strValue);
      if (!isNaN(date.getTime())) return date;
      
      return null; // Return null instead of Invalid Date
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

    // Debug: log first row to see actual keys
    if (students.length > 0) {
      console.log('📋 Bulk upload - First row keys:', Object.keys(students[0]));
      console.log('📋 Bulk upload - First row data:', JSON.stringify(students[0]).substring(0, 500));
    }

    for (let i = 0; i < students.length; i++) {
      const row = students[i] || {};
      try {
        // Try all possible key variations
        const admissionNo = row.admissionNo || row['Admission no'] || row['Admission Number'] || row['Admission No'] || row['admission_no'] || row['admission no'];
        const fullName = row.fullName || row['Full Name'] || row['Name'] || row['full name'] || row['Full name'];
        const shaakha = row.shaakha || row['Shaakha'] || '';
        
        // Resolve department from shaakha if not provided
        let department = row.department || row['Department'] || row['departmentId'];
        let subDepartmentId = null;
        
        if (!department && shaakha) {
          const resolved = resolveDepartmentFromShaakha(shaakha);
          department = resolved.department;
          subDepartmentId = resolved.subDepartment;
        }

        // Debug first few rows
        if (i < 3) {
          console.log(`📋 Row ${i + 1}: admissionNo="${admissionNo}", fullName="${fullName}", shaakha="${shaakha}", dept="${department}"`);
        }

        if (!admissionNo || !fullName) {
          results.errors.push({
            row: i + 1,
            error: 'Missing required fields (admissionNo, fullName)'
          });
          continue;
        }
        
        if (!department) {
          results.errors.push({
            row: i + 1,
            error: `Could not resolve department from shaakha: ${shaakha || 'empty'}`
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
        
        // Convert phone to string (fix "value.includes is not a function" error)
        const phoneValue = (row.phone || row['Phone'] || row['Telephone / Mobile No'] || '').toString();
        const guardianPhoneValue = (row.guardianPhone || row['Guardian Phone'] || row['Telephone / Mobile No'] || '0000000000').toString();
        
        // Parse dateOfBirth - default to today if invalid/missing
        const dobValue = row.dateOfBirth || row.dob || row['Date of Birth'] || row['D O B'] || row['DOB'];
        const parsedDob = parseDate(dobValue);
        const dateOfBirth = parsedDob || new Date(); // Default to today if parsing fails
        
        // Build student document with safe parsing and filtering empty values
        const studentDoc = clean({
          admissionNo,
          fullName,
          dateOfBirth,
          gender: row.gender || row['Gender'] || 'Male',
          bloodGroup: row.bloodGroup || row['Blood Group'],
          phone: phoneValue,
          email: row.email || row['Email'],
          address: row.address || row['Address'] || row['Present Address'],
          fatherName: row.fatherName || row['Father\'s Name'] || row['Father Name'] || 'N/A',
          motherName: row.motherName || row['Mother\'s Name'] || row['Mother Name'] || 'N/A',
          guardianPhone: guardianPhoneValue,
          guardianEmail: parentEmail ? parentEmail.toString().toLowerCase().trim() : undefined,
          shaakha: shaakha,
          gothra: row.gothra || row['Gothra'],
          department,
          subDepartments: subDepartmentId ? [subDepartmentId] : (Array.isArray(row.subDepartments) ? row.subDepartments : []),
          batches: Array.isArray(row.batches) ? row.batches : 
                  (row['Batches'] ? (Array.isArray(row['Batches']) ? row['Batches'] : [row['Batches']]) : []),
          admittedToStandard: row.admittedToStandard || row.admittedStandard || row['Admitted to Standard'],
          currentStandard: row.currentStandard || row['Current Standard'],
          dateOfAdmission: parseDate(row.dateOfAdmission || row['Date of Admission']),
          status: row.status || row['Status'] || 'active',
          remarks: row.remarks || row['Remarks'],
          isActive: true
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
      Student.countDocuments({ status: 'graduated' }),
      Student.countDocuments({ status: 'transferred' }),
      Student.countDocuments({ status: 'leftout' }),
      Student.countDocuments({ status: 'Completed Moola' }),
      Student.countDocuments({ status: 'Post Graduated' }),
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
        graduated: stats[1],
        transferred: stats[2],
        leftout: stats[3],
        completedMoola: stats[4],
        postGraduated: stats[5],
        total: stats[0] + stats[1] + stats[2] + stats[3] + stats[4] + stats[5],
        byDepartment: stats[6]
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

// @route   GET /api/students/:id/health-records
// @desc    Get health records for a student
// @access  Private
router.get('/:id/health-records', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).select('fullName admissionNo healthRecords latestHealth');
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    res.json({
      success: true,
      data: {
        student: {
          _id: student._id,
          fullName: student.fullName,
          admissionNo: student.admissionNo,
          latestHealth: student.latestHealth || null
        },
        records: student.healthRecords || []
      }
    });
  } catch (error) {
    console.error('❌ Error fetching health records:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching health records',
      error: error.message
    });
  }
});

// @route   POST /api/students/:id/health-records
// @desc    Add a health record for a student
// @access  Private (Admin / Principal / Coordinator / Caretaker)
router.post('/:id/health-records', auth, async (req, res) => {
  try {
    const { user } = req;
    const {
      date,
      heightCm,
      weightKg,
      condition,
      remarks,
      checkupType,
      hospitalName,
      reason,
      diagnosis,
      treatment,
      followUpDate
    } = req.body;

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const record = {
      date: date ? new Date(date) : new Date(),
      heightCm,
      weightKg,
      condition,
      remarks,
      checkupType,
      hospitalName,
      reason,
      diagnosis,
      treatment,
      followUpDate: followUpDate ? new Date(followUpDate) : undefined,
      recordedBy: user?._id || user?.id,
      recordedByName: user?.fullName || user?.name || user?.email
    };

    student.healthRecords.push(record);

    // Update latestHealth summary
    student.latestHealth = {
      heightCm,
      weightKg,
      condition,
      notes: remarks,
      lastCheckupDate: record.date
    };

    await student.save();

    res.status(201).json({
      success: true,
      message: 'Health record added successfully',
      data: {
        latestHealth: student.latestHealth,
        record: student.healthRecords[student.healthRecords.length - 1]
      }
    });
  } catch (error) {
    console.error('❌ Error adding health record:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding health record',
      error: error.message
    });
  }
});

export default router;
