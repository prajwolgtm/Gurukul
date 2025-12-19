import express from 'express';
import Student from '../models/Student.js';
import User from '../models/User.js';
import Department from '../models/Department.js';
import Batch from '../models/Batch.js';
import { auth } from '../middleware/auth.js';
import { permit } from '../middleware/rbac.js';
import { ROLES } from '../utils/roles.js';

const router = express.Router();

// @route   POST /api/admin/students/bulk-upload
// @desc    Bulk upload student data (Admin only)
// @access  Private (Admin/Principal only)
router.post('/students/bulk-upload', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const { students } = req.body;

    if (!students || !Array.isArray(students)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide students array in request body'
      });
    }

    const results = {
      successful: [],
      failed: [],
      totalProcessed: students.length
    };

    for (let i = 0; i < students.length; i++) {
      const studentData = students[i];
      
      try {
        // Validate required fields
        const requiredFields = ['admissionNo', 'fullName', 'dateOfBirth', 'bloodGroup', 'shaakha', 'gothra', 'telephone', 'fatherName', 'occupation', 'admittedToStandard', 'dateOfAdmission', 'departmentId'];
        const missingFields = requiredFields.filter(field => !studentData[field]);
        
        if (missingFields.length > 0) {
          results.failed.push({
            index: i,
            data: studentData,
            error: `Missing required fields: ${missingFields.join(', ')}`
          });
          continue;
        }

        // Validate department exists
        const department = await Department.findById(studentData.departmentId);
        if (!department) {
          results.failed.push({
            index: i,
            data: studentData,
            error: 'Invalid department ID'
          });
          continue;
        }

        // Validate batches if provided
        let validatedBatches = [];
        if (studentData.batchIds && Array.isArray(studentData.batchIds) && studentData.batchIds.length > 0) {
          const batches = await Batch.find({ 
            _id: { $in: studentData.batchIds },
            department: studentData.departmentId,
            isActive: true 
          });
          
          if (batches.length !== studentData.batchIds.length) {
            results.failed.push({
              index: i,
              data: studentData,
              error: 'One or more batch IDs are invalid or do not belong to the selected department'
            });
            continue;
          }
          
          validatedBatches = studentData.batchIds.map(batchId => ({
            batch: batchId,
            role: 'student',
            joinedDate: new Date(),
            status: 'active'
          }));
        }

        // Check if student already exists
        const existingStudent = await Student.findOne({
          admissionNo: studentData.admissionNo
        });

        if (existingStudent) {
          results.failed.push({
            index: i,
            data: studentData,
            error: 'Student already exists with this admission number'
          });
          continue;
        }

        // Process dates
        const dateOfBirth = studentData.dateOfBirth ? new Date(studentData.dateOfBirth) : null;
        const dateOfAdmission = studentData.dateOfAdmission ? new Date(studentData.dateOfAdmission) : null;

        // Normalize blood group (remove "ve" suffix, handle variations)
        const normalizeBloodGroup = (bg) => {
          if (!bg || !bg.toString().trim()) return undefined;
          const normalized = bg.toString().trim().toUpperCase()
            .replace(/VE$/i, '')  // Remove "ve" suffix
            .replace(/\s+/g, ''); // Remove spaces
          const validGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
          return validGroups.includes(normalized) ? normalized : undefined;
        };
        
        // Convert telephone from scientific notation if needed
        const normalizeTelephone = (tel) => {
          if (!tel || !tel.toString().trim()) return '';
          const telStr = tel.toString().trim();
          // Handle scientific notation (e.g., "9.79E+09" → "9790000000")
          if (telStr.includes('E+') || telStr.includes('e+')) {
            const num = parseFloat(telStr);
            if (!isNaN(num)) {
              return Math.round(num).toString();
            }
          }
          // Remove any non-digit characters except + at start
          return telStr.replace(/[^\d+]/g, '').replace(/^\+/, '');
        };
        
        const normalizedBloodGroup = normalizeBloodGroup(studentData.bloodGroup);
        const normalizedTelephone = normalizeTelephone(studentData.telephone || studentData.telephone);

        // Create student record - match exact format from normal student creation (students.routes.js POST /api/students)
        const newStudent = await Student.create({
          admissionNo: studentData.admissionNo,
          fullName: studentData.fullName,
          dateOfBirth: dateOfBirth,
          bloodGroup: normalizedBloodGroup,
          gender: studentData.gender || 'Male', // Default gender
          phone: normalizedTelephone,
          email: studentData.email || '', // Add email field to match normal creation
          address: studentData.presentAddress || '', // Keep for backward compatibility
          presentAddress: studentData.presentAddress || '',
          permanentAddress: studentData.permanentAddress || studentData.presentAddress || '',
          fatherName: studentData.fatherName,
          motherName: studentData.motherName || '',
          occupation: studentData.occupation || '',
          guardianPhone: normalizedTelephone || '0000000000',
          guardianEmail: studentData.guardianEmail || '',
          department: studentData.departmentId,
          subDepartments: studentData.subDepartmentIds || [],
          batches: validatedBatches.map(b => b.batch).filter(Boolean),
          admittedToStandard: studentData.admittedToStandard,
          currentStandard: studentData.currentStandard || studentData.admittedToStandard,
          dateOfAdmission: dateOfAdmission,
          shaakha: studentData.shaakha || '',
          gothra: studentData.gothra || '',
          lastSchoolAttended: studentData.lastSchoolAttended || '',
          lastStandardStudied: studentData.lastStandardStudied || '',
          tcDetails: studentData.tcDetails || '',
          remarks: studentData.remarks || '',
          nationality: studentData.nationality || 'Indian',
          religion: studentData.religion || 'Hindu',
          caste: studentData.caste || '',
          motherTongue: studentData.motherTongue || '',
          // Explicitly set status and isActive to match normal creation
          status: 'active',
          isActive: true
        });

        results.successful.push({
          index: i,
          admissionNo: newStudent.admissionNo,
          fullName: newStudent.fullName,
          id: newStudent._id
        });

      } catch (error) {
        results.failed.push({
          index: i,
          data: studentData,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Bulk upload completed. ${results.successful.length} successful, ${results.failed.length} failed.`,
      results
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error during bulk upload',
      error: error.message
    });
  }
});

// @route   POST /api/admin/students
// @desc    Create a single student (Admin/Principal only)
// @access  Private (Admin/Principal only)
router.post('/students', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const {
      admissionNo, fullName, dateOfBirth, bloodGroup, shaakha, gothra,
      telephone, fatherName, motherName, occupation, nationality, religion,
      caste, motherTongue, presentAddress, permanentAddress, lastSchoolAttended,
      lastStandardStudied, tcDetails, admittedToStandard, dateOfAdmission,
      currentStandard, remarks, departmentId, batchIds, profileImage
    } = req.body;

    // Validate required fields
    const requiredFields = ['admissionNo', 'fullName', 'dateOfBirth', 'bloodGroup', 'shaakha', 'gothra', 'telephone', 'fatherName', 'occupation', 'admittedToStandard', 'dateOfAdmission', 'departmentId'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Validate department exists
    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(400).json({
        success: false,
        message: 'Invalid department ID'
      });
    }

    // Validate batches if provided
    let validatedBatches = [];
    if (batchIds && Array.isArray(batchIds) && batchIds.length > 0) {
      const batches = await Batch.find({ 
        _id: { $in: batchIds },
        department: departmentId,
        isActive: true 
      });
      
      if (batches.length !== batchIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more batch IDs are invalid or do not belong to the selected department'
        });
      }
      
      validatedBatches = batchIds.map(batchId => ({
        batch: batchId,
        role: 'student',
        joinedDate: new Date(),
        status: 'active'
      }));
    }

    // Check if student already exists
    const existingStudent = await Student.findOne({ admissionNo });
    if (existingStudent) {
      return res.status(400).json({
        success: false,
        message: 'Student already exists with this admission number'
      });
    }

    // Process dates
    const processedDateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    const processedDateOfAdmission = dateOfAdmission ? new Date(dateOfAdmission) : null;

    // Create student
    const student = await Student.create({
      admissionNo,
      fullName,
      dateOfBirth: processedDateOfBirth,
      bloodGroup,
      shaakha,
      gothra,
      telephone,
      fatherName,
      motherName: motherName || '',
      occupation,
      nationality: nationality || 'Indian',
      religion: religion || 'Hindu',
      caste: caste || '',
      motherTongue: motherTongue || '',
      presentAddress,
      permanentAddress: permanentAddress || presentAddress,
      lastSchoolAttended: lastSchoolAttended || '',
      lastStandardStudied: lastStandardStudied || '',
      tcDetails: tcDetails || '',
      admittedToStandard,
      dateOfAdmission: processedDateOfAdmission,
      currentStandard: currentStandard || admittedToStandard,
      remarks: remarks || '',
      profileImage: profileImage || null, // Cloudinary URL if provided
      academicInfo: {
        department: departmentId,
        batches: validatedBatches
      },
      guardianInfo: {
        guardianPhone: telephone,
        guardianEmail: req.body.guardianEmail || ''
      }
    });

    res.status(201).json({
      success: true,
      message: 'Student created successfully',
      data: { student }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create student',
      error: error.message
    });
  }
});

// @route   GET /api/admin/students
// @desc    Get all students (Admin/Principal/HOD only)
// @access  Private (Admin/Principal/HOD only)
router.get('/students', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD), async (req, res) => {
  try {
    const { page = 1, limit = 50, search, standard, shaakha } = req.query;
    
    const query = { isActive: true };
    
    // Search functionality
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { admissionNo: { $regex: search, $options: 'i' } },
        { fatherName: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filter by standard
    if (standard) {
      query.currentStandard = standard;
    }
    
    // Filter by shaakha
    if (shaakha) {
      query.shaakha = shaakha;
    }

    const students = await Student.find(query)
      .select('-__v')
      .sort({ dateOfAdmission: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('academicInfo.department', 'name code')
      .populate('academicInfo.batch', 'name code');

    const total = await Student.countDocuments(query);

    res.json({
      success: true,
      data: students,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalStudents: total,
        studentsPerPage: limit
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch students',
      error: error.message
    });
  }
});

// @route   GET /api/admin/students/:id
// @desc    Get single student by ID (Admin/Principal/HOD only)
// @access  Private (Admin/Principal/HOD only)
router.get('/students/:id', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD), async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('academicInfo.department', 'name code')
      .populate('academicInfo.batch', 'name code')
      .populate('academicInfo.subDepartment', 'name code');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    res.json({
      success: true,
      data: { student }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student',
      error: error.message
    });
  }
});

// @route   PUT /api/admin/students/:id
// @desc    Update student (Admin/Principal only)
// @access  Private (Admin/Principal only)
router.put('/students/:id', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const {
      fullName, dateOfBirth, bloodGroup, shaakha, gothra, telephone,
      fatherName, motherName, occupation, nationality, religion,
      caste, motherTongue, presentAddress, permanentAddress, lastSchoolAttended,
      lastStandardStudied, tcDetails, admittedToStandard, dateOfAdmission,
      currentStandard, remarks, guardianEmail
    } = req.body;

    // Process dates
    const updates = { ...req.body };
    if (dateOfBirth) updates.dateOfBirth = new Date(dateOfBirth);
    if (dateOfAdmission) updates.dateOfAdmission = new Date(dateOfAdmission);
    
    // Update guardian info if provided
    if (guardianEmail) {
      updates['guardianInfo.guardianEmail'] = guardianEmail;
    }

    const updated = await Student.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    res.json({
      success: true,
      message: 'Student updated successfully',
      data: { student: updated }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update student',
      error: error.message
    });
  }
});

// @route   DELETE /api/admin/students/:id
// @desc    Soft delete a student (deactivate)
// @access  Private (Admin/Principal)
router.delete('/students/:id', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const updates = { isActive: false };
    // If model supports soft delete flags, set them defensively
    updates.isDeleted = true;
    updates.deletedAt = new Date();

    const updated = await Student.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    res.json({ success: true, message: 'Student deactivated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete student', error: error.message });
  }
});

// @route   POST /api/admin/users/create
// @desc    Create user (Admin only - for staff accounts)
// @access  Private (Admin only)
router.post('/users/create', auth, permit(ROLES.ADMIN), async (req, res) => {
  try {
    const { fullName, email, password, role, phone, employeeId } = req.body;

    // Validate required fields
    if (!fullName || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Please provide fullName, email, password, and role'
      });
    }

    // Validate role (exclude parent as it has special registration)
    const allowedRoles = [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER, ROLES.CARETAKER];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed roles: ${allowedRoles.join(', ')}`
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create user
    const user = await User.create({
      fullName,
      email,
      password,
      role,
      phone,
      employeeId
    });

    res.status(201).json({
      success: true,
      message: `${role} account created successfully`,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        phone: user.phone,
        employeeId: user.employeeId,
        isActive: user.isActive
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/admin/departments
// @desc    Get all departments for student assignment
// @access  Private (Admin/Principal)
router.get('/departments', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const departments = await Department.find({ isActive: true })
      .select('name code description')
      .sort({ name: 1 });

    res.json({
      success: true,
      departments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/admin/departments/:id/batches
// @desc    Get batches for a specific department
// @access  Private (Admin/Principal)
router.get('/departments/:id/batches', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate department exists
    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    const batches = await Batch.find({ 
      department: id, 
      isActive: true,
      status: 'active'
    })
    .select('name code academicYear currentSemester maxStudents currentStudentCount')
    .sort({ name: 1 });

    res.json({
      success: true,
      department: {
        id: department._id,
        name: department.name,
        code: department.code
      },
      batches
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

export default router; 