import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Student from '../models/Student.js';
import { auth } from '../middleware/auth.js';
import { ROLES } from '../utils/roles.js';

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register a new user (Admin/Principal/Teacher/Caretaker)
// @access  Public (but should be restricted in production for non-parent roles)
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;

    // Only allow parent registration through this endpoint
    // Other roles should be created by admin
    if (role && role !== ROLES.PARENT) {
      return res.status(403).json({
        success: false,
        message: 'Only parent registration is allowed through this endpoint. Contact admin for other roles.'
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create user with parent role
    const user = await User.create({
      fullName,
      email,
      password,
      role: ROLES.PARENT
    });

    // Generate JWT
    const token = jwt.sign(
      { 
        id: user._id, 
        email: user.email, 
        role: user.role,
        fullName: user.fullName 
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'Parent registered successfully',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
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

// @route   POST /api/auth/register-parent
// @desc    Register parent with student verification
// @access  Public
router.post('/register-parent', async (req, res) => {
  try {
    const { 
      fullName, 
      email, 
      password, 
      phone,
      studentFirstName, 
      guardianPhone 
    } = req.body;

    // Validate required fields
    if (!fullName || !email || !password || !studentFirstName || !guardianPhone) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: fullName, email, password, studentFirstName, guardianPhone'
      });
    }

    // Check if parent email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Account already exists with this email'
      });
    }

    // Find student with matching phone and first name (case insensitive)
    const student = await Student.findOne({
      'guardianInfo.guardianPhone': guardianPhone,
      'personalInfo.firstName': { $regex: new RegExp(`^${studentFirstName}$`, 'i') }
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'No student found with the provided first name and guardian phone number. Please verify the details.'
      });
    }

    // Check if this student already has a linked parent
    if (student.guardianInfo.parentUserId) {
      return res.status(400).json({
        success: false,
        message: 'This student already has a registered parent account'
      });
    }

    // Create parent user account
    const parentUser = await User.create({
      fullName,
      email,
      password,
      phone: phone || guardianPhone,
      role: ROLES.PARENT
    });

    // Link parent to student
    student.guardianInfo.parentUserId = parentUser._id;
    await student.save();

    // Generate JWT
    const token = jwt.sign(
      { 
        id: parentUser._id, 
        email: parentUser.email, 
        role: parentUser.role,
        fullName: parentUser.fullName 
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'Parent account created and linked to student successfully',
      token,
      user: {
        id: parentUser._id,
        fullName: parentUser.fullName,
        email: parentUser.email,
        role: parentUser.role,
        linkedStudent: {
          studentId: student.studentId,
          fullName: student.personalInfo.fullName,
          rollNumber: student.rollNumber,
          department: { name: 'Loading...', code: 'TBD' },
          batch: { name: 'Loading...', code: 'TBD' }
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error during parent registration',
      error: error.message
    });
  }
});

// @route   POST /api/auth/register-staff (DEVELOPMENT ONLY)
// @desc    Register staff accounts for development/testing
// @access  Public (REMOVE IN PRODUCTION)
router.post('/register-staff', async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;

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
      role
    });

    // Generate JWT
    const token = jwt.sign(
      { 
        id: user._id, 
        email: user.email, 
        role: user.role,
        fullName: user.fullName 
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      message: `${role} account created successfully`,
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
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

// @route   POST /api/auth/login-parent
// @desc    Parent login using email and child's DOB as password (format: DDMMYYYY)
// @access  Public
router.post('/login-parent', async (req, res) => {
  try {
    const { email, dob } = req.body; // dob in format DDMMYYYY (e.g., 16082002 for 16/08/2002)

    console.log('🔐 Parent login attempt:', { email, dobLength: dob?.length });

    if (!email || !dob) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and date of birth (DDMMYYYY format)'
      });
    }

    // Validate DOB format (8 digits)
    if (!/^\d{8}$/.test(dob)) {
      return res.status(400).json({
        success: false,
        message: 'Date of birth must be in DDMMYYYY format (e.g., 16082002 for 16/08/2002)'
      });
    }

    // Find student by guardian email ONLY (normalize email)
    const normalizedEmail = email.toLowerCase().trim();
    
    console.log('🔍 Searching for student with parent email:', normalizedEmail);
    
    // STRICT: Only allow login with guardianEmail (parent email), NOT student's own email
    let student = await Student.findOne({ 
      guardianEmail: normalizedEmail
    }).populate('department', 'name code')
      .populate('subDepartments', 'name code')
      .populate('batches', 'name code');

    if (!student) {
      // Try case-insensitive search for guardianEmail only (in case of data inconsistency)
      const allStudents = await Student.find({ 
        guardianEmail: { $exists: true, $ne: '' } 
      }).select('guardianEmail fullName admissionNo');
      
      const matchingStudent = allStudents.find(s => 
        s.guardianEmail && s.guardianEmail.toLowerCase().trim() === normalizedEmail
      );
      
      if (matchingStudent) {
        console.log('✅ Found student with case-insensitive guardianEmail search');
        student = await Student.findById(matchingStudent._id)
          .populate('department', 'name code')
          .populate('subDepartments', 'name code')
          .populate('batches', 'name code');
      }
    }

    if (!student) {
      console.log('❌ No student found for parent email:', normalizedEmail);
      // Get sample emails for debugging (first 3 students with guardianEmail)
      const sampleStudents = await Student.find({ guardianEmail: { $exists: true, $ne: '' } })
        .limit(3)
        .select('guardianEmail fullName admissionNo');
      console.log('📋 Sample guardian emails in database:', sampleStudents.map(s => ({
        email: s.guardianEmail,
        name: s.fullName,
        admissionNo: s.admissionNo
      })));
      
      return res.status(404).json({
        success: false,
        message: 'No student found with this parent email. Only parent emails (stored in "Parent Email" field) can be used for parent login. Student emails cannot be used.'
      });
    }

    // SECURITY CHECK: Verify this is NOT a student's own email
    if (student.email && student.email.toLowerCase().trim() === normalizedEmail) {
      console.log('⚠️ SECURITY: Attempted login with student email instead of parent email');
      return res.status(403).json({
        success: false,
        message: 'Student emails cannot be used for parent login. Please use the parent email address set in the student record.'
      });
    }

    console.log('✅ Student found:', { 
      admissionNo: student.admissionNo, 
      fullName: student.fullName,
      hasDOB: !!student.dateOfBirth,
      guardianEmail: student.guardianEmail
    });

    // Check if student has dateOfBirth
    if (!student.dateOfBirth) {
      return res.status(400).json({
        success: false,
        message: 'Student date of birth is not set. Please contact administrator.'
      });
    }

    // Convert DOB string to Date for comparison
    const day = parseInt(dob.substring(0, 2));
    const month = parseInt(dob.substring(2, 4)) - 1; // Month is 0-indexed
    const year = parseInt(dob.substring(4, 8));
    const providedDOB = new Date(year, month, day);
    
    // Compare dates (ignore time)
    const studentDOB = new Date(student.dateOfBirth);
    studentDOB.setHours(0, 0, 0, 0);
    providedDOB.setHours(0, 0, 0, 0);

    if (studentDOB.getTime() !== providedDOB.getTime()) {
      return res.status(401).json({
        success: false,
        message: 'Invalid date of birth. Please check and try again.'
      });
    }

    // Find or create parent user account
    // Need password for bcrypt compare; select it explicitly
    let parentUser = await User.findOne({ email: normalizedEmail }).select('+password');
    
    if (!parentUser) {
      console.log('📝 Creating new parent user account');
      // Create parent account with DOB as password
      parentUser = new User({
        fullName: student.fatherName || student.motherName || 'Parent',
        email: normalizedEmail,
        password: dob, // DOB as password (will be hashed by pre-save hook)
        role: ROLES.PARENT,
        phone: student.guardianPhone,
        isActive: true,
        isVerified: true,
        accountStatus: 'verified'
      });
      await parentUser.save();
      console.log('✅ Parent user created:', parentUser._id);

      // Link parent to student
      if (!student.linkedStudent || student.linkedStudent.toString() !== parentUser._id.toString()) {
        student.linkedStudent = parentUser._id;
        await student.save();
        console.log('✅ Linked student to parent user');
      }
    } else {
      console.log('👤 Existing parent user found');
      // Verify password matches DOB
      const isMatch = await parentUser.matchPassword(dob);
      console.log('🔑 Password match:', isMatch);
      
      if (!isMatch) {
        // If password doesn't match, update it to DOB (will be hashed by pre-save hook)
        console.log('🔄 Updating parent password to DOB');
        parentUser.password = dob;
        await parentUser.save();
      }
      
      // Ensure parent user has correct role and is active
      if (parentUser.role !== ROLES.PARENT) {
        parentUser.role = ROLES.PARENT;
      }
      if (!parentUser.isActive) {
        parentUser.isActive = true;
      }
      if (parentUser.isModified()) {
        await parentUser.save();
        // Re-select password after save to ensure we have the hashed version
        parentUser = await User.findById(parentUser._id).select('+password');
      }
      
      // IMPORTANT: Ensure student is linked to this parent user (even if parent already existed)
      if (!student.linkedStudent || student.linkedStudent.toString() !== parentUser._id.toString()) {
        student.linkedStudent = parentUser._id;
        await student.save();
        console.log('✅ Updated student linkedStudent field to parent user');
      }
    }

    // Check if user is active
    if (!parentUser.isActive) {
      console.log('⚠️ Parent user account is inactive');
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact administrator.'
      });
    }

    // Verify the password one more time before allowing login
    const finalPasswordCheck = await parentUser.matchPassword(dob);
    if (!finalPasswordCheck) {
      console.log('❌ Final password check failed - updating password');
      parentUser.password = dob;
      await parentUser.save();
      // Re-select password after save to ensure we have the hashed version
      parentUser = await User.findById(parentUser._id).select('+password');
    }

    // Update last login
    await parentUser.updateLastLogin();
    console.log('✅ Parent login successful');

    // Generate JWT
    const token = jwt.sign(
      { 
        id: parentUser._id, 
        email: parentUser.email, 
        role: parentUser.role,
        fullName: parentUser.fullName,
        linkedStudent: student._id
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: parentUser._id,
        fullName: parentUser.fullName,
        email: parentUser.email,
        role: parentUser.role,
        linkedStudent: {
          id: student._id,
          admissionNo: student.admissionNo,
          fullName: student.fullName,
          department: student.department,
          subDepartments: student.subDepartments,
          batches: student.batches
        }
      }
    });

  } catch (error) {
    console.error('Parent login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password'
      });
    }

    // Normalize email (lowercase and trim)
    const normalizedEmail = email.toLowerCase().trim();

    // Check for user and include password
    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact administrator.'
      });
    }

    // Check if user account is verified (especially for teachers)
    if (!user.canAccessSystem()) {
      const statusMessages = {
        'pending': 'Your account is pending verification. Please wait for admin/coordinator approval.',
        'rejected': `Your account was rejected. Reason: ${user.rejectionReason || 'Not specified'}`,
        'suspended': `Your account is suspended. Reason: ${user.rejectionReason || 'Not specified'}`
      };
      
      return res.status(403).json({
        success: false,
        message: statusMessages[user.accountStatus] || 'Account access denied.',
        accountStatus: user.accountStatus,
        rejectionReason: user.rejectionReason
      });
    }

    // Check password
    if (!user.password) {
      console.error('User has no password set:', { email: user.email, userId: user._id });
      return res.status(401).json({
        success: false,
        message: 'Account error. Please contact administrator to reset your password.'
      });
    }

    const isMatch = await user.matchPassword(password);
    
    if (!isMatch) {
      // Additional debugging info (remove in production)
      console.log('Login failed:', {
        email: user.email,
        userId: user._id,
        role: user.role,
        isActive: user.isActive,
        isVerified: user.isVerified,
        accountStatus: user.accountStatus,
        hasPassword: !!user.password,
        passwordStartsWith: user.password?.substring(0, 10) // First 10 chars of hash (for debugging)
      });
      
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Please check your email and password.'
      });
    }

    // Update last login
    await user.updateLastLogin();

    // For parents, also get linked student info
    let linkedStudent = null;
    if (user.role === ROLES.PARENT) {
      const student = await Student.findOne({ 'guardianInfo.parentUserId': user._id });
      const populatedStudent = await Student.findOne({ 'guardianInfo.parentUserId': user._id })
        .populate('department', 'name code')
        .populate('subDepartment', 'name code')
        .populate('batch', 'name code academicYear');
      
      if (populatedStudent) {
        linkedStudent = {
          studentId: populatedStudent.studentId,
          fullName: populatedStudent.personalInfo.fullName,
          rollNumber: populatedStudent.rollNumber,
          department: populatedStudent.department,
          subDepartment: populatedStudent.subDepartment,
          batch: populatedStudent.batch
        };
      }
    }

    // Generate JWT
    const token = jwt.sign(
      { 
        id: user._id, 
        email: user.email, 
        role: user.role,
        fullName: user.fullName 
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin,
        ...(linkedStudent && { linkedStudent })
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

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // For parents, also get linked student info
    let linkedStudent = null;
    if (user.role === ROLES.PARENT) {
      const student = await Student.findOne({ 'guardianInfo.parentUserId': user._id })
        .populate('department', 'name code')
        .populate('subDepartment', 'name code')
        .populate('batch', 'name code academicYear classTeacher', 'fullName');
      
      if (student) {
        linkedStudent = {
          studentId: student.studentId,
          fullName: student.personalInfo.fullName,
          rollNumber: student.rollNumber,
          department: student.department,
          subDepartment: student.subDepartment,
          batch: student.batch,
          academicInfo: student.academicInfo,
          hostelInfo: student.hostelInfo
        };
      }
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        phone: user.phone,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        profileImage: user.profileImage,
        address: user.address,
        ...(linkedStudent && { linkedStudent })
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

// @route   POST /api/auth/register-teacher
// @desc    Register teacher account (requires verification by Admin/Coordinator)
// @access  Public
router.post('/register-teacher', async (req, res) => {
  try {
    const { fullName, email, password, phone, employeeId, qualifications, experience } = req.body;

    // Validate required fields
    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide fullName, email, and password'
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

    // Create teacher account (auto-verified, can login immediately)
    const teacher = await User.create({
      fullName,
      email,
      password,
      phone,
      employeeId,
      role: ROLES.TEACHER,
      // Teachers are auto-verified and can login immediately
      isVerified: true,
      accountStatus: 'verified',
      verifiedAt: new Date()
    });

    // Generate JWT token so they can login immediately
    const token = jwt.sign(
      { 
        id: teacher._id, 
        email: teacher.email, 
        role: teacher.role,
        fullName: teacher.fullName 
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'Teacher account created successfully. You can now login.',
      token,
      user: {
        id: teacher._id,
        fullName: teacher.fullName,
        email: teacher.email,
        role: teacher.role,
        accountStatus: teacher.accountStatus,
        isVerified: teacher.isVerified
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating teacher account',
      error: error.message
    });
  }
});

// @route   POST /api/auth/verify-student
// @desc    Verify if student exists with given first name and guardian phone
// @access  Public
router.post('/verify-student', async (req, res) => {
  try {
    const { studentFirstName, guardianPhone } = req.body;

    if (!studentFirstName || !guardianPhone) {
      return res.status(400).json({
        success: false,
        message: 'Please provide student first name and guardian phone number'
      });
    }

    // Find student with matching phone and first name (case insensitive)
    const student = await Student.findOne({
      'guardianInfo.guardianPhone': guardianPhone,
      'personalInfo.firstName': { $regex: new RegExp(`^${studentFirstName}$`, 'i') }
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'No student found with the provided details'
      });
    }

    // Check if already has linked parent
    if (student.guardianInfo.parentUserId) {
      return res.status(400).json({
        success: false,
        message: 'This student already has a registered parent account'
      });
    }

    res.json({
      success: true,
      message: 'Student found and available for parent registration',
      student: {
        fullName: student.personalInfo.fullName,
        class: student.academicInfo.class,
        section: student.academicInfo.section,
        rollNumber: student.rollNumber
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

export default router; 