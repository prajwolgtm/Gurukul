import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Teacher from '../models/Teacher.js';
import Department from '../models/Department.js';
import SubDepartment from '../models/SubDepartment.js';
import Batch from '../models/Batch.js';
import TeacherAssignment from '../models/TeacherAssignment.js';
import { auth } from '../middleware/auth.js';
import { ROLES } from '../utils/roles.js';

const router = express.Router();
const TEACHER_MANAGERS = [ROLES.ADMIN, ROLES.COORDINATOR, ROLES.PRINCIPAL];
const TEACHING_ROLES = [ROLES.TEACHER, ROLES.COORDINATOR, ROLES.PRINCIPAL, ROLES.ADMIN];

const syncMissingTeacherProfiles = async () => {
  const teacherUserIds = await Teacher.distinct('user');
  const missingUsers = await User.find({
    role: ROLES.TEACHER,
    _id: { $nin: teacherUserIds }
  }).select('_id employeeId isActive isVerified verifiedBy verifiedAt createdAt');

  if (!missingUsers.length) return 0;

  await Teacher.bulkWrite(missingUsers.map(user => ({
    updateOne: {
      filter: { user: user._id },
      update: {
        $setOnInsert: {
          employeeId: user.employeeId || `T-${user._id.toString().slice(-8).toUpperCase()}`,
          status: user.isActive === false ? 'inactive' : 'active',
          isVerified: user.isVerified !== false,
          verifiedBy: user.verifiedBy,
          verifiedAt: user.verifiedAt,
          joiningDate: user.createdAt || new Date()
        }
      },
      upsert: true
    }
  })), { ordered: false });

  return missingUsers.length;
};

// @route   GET /api/teachers
// @desc    Get all teachers with filtering
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    if (TEACHER_MANAGERS.includes(req.user.role)) {
      await syncMissingTeacherProfiles();
    }

    const {
      page = 1,
      limit = 20,
      department,
      subDepartment,
      batch,
      status = '',
      isVerified,
      search
    } = req.query;

    // Build query
    let query = {};

    if (department) query.departments = department;
    if (subDepartment) query.subDepartments = subDepartment;
    if (batch) query.batches = batch;
    if (status && status.trim() !== '') query.status = status;
    if (isVerified !== undefined && isVerified !== '') {
      query.isVerified = isVerified === 'true' || isVerified === true;
    }

    // Add search to query if provided
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      const matchingUsers = await User.find({
        $or: [{ fullName: searchRegex }, { email: searchRegex }]
      }).select('_id');
      query.$or = [
        { employeeId: searchRegex },
        { user: { $in: matchingUsers.map(user => user._id) } }
      ];
    }

    const total = await Teacher.countDocuments(query);

    const teachers = await Teacher.find(query)
      .populate('user', 'fullName email phone role isActive')
      .populate('departments', 'name code')
      .populate('subDepartments', 'name code')
      .populate('batches', 'name code academicYear')
      .populate('verifiedBy', 'fullName email')
      .sort({ employeeId: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    res.json({
      success: true,
      count: teachers.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      teachers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalTeachers: total
      }
    });
  } catch (error) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching teachers',
      error: error.message
    });
  }
});

// @route   GET /api/teachers/:id
// @desc    Get single teacher
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id)
      .populate('user', 'fullName email phone role isActive')
      .populate('departments', 'name code')
      .populate('subDepartments', 'name code')
      .populate('batches', 'name code academicYear')
      .populate('verifiedBy', 'fullName email');

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    res.json({
      success: true,
      teacher
    });
  } catch (error) {
    console.error('Error fetching teacher:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching teacher',
      error: error.message
    });
  }
});

// @route   POST /api/teachers
// @desc    Create new teacher account
// @access  Private (Admin/Coordinator only)
router.post('/', auth, async (req, res) => {
  try {
    const userRole = req.user.role;

    // Check permissions
    if (!TEACHER_MANAGERS.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only Admin, Coordinator, or Principal can create teacher accounts'
      });
    }

    const {
      // User account fields
      fullName, email, phone, password, role = ROLES.TEACHER,
      // Teacher profile fields
      employeeId, motherName, spouseName, dateOfBirth, religion, category,
      nationality, languages, qualification, specialization, veda, shakha,
      educationalBackground, experience, permanentAddress, aadhaarNumber,
      panNumber, bankDetails,
      joiningDate, departments, subDepartments, batches,
      subjects, address, emergencyContact, remarks
    } = req.body;

    // Validate required fields
    if (!fullName || !email || !password || !employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: fullName, email, password, employeeId'
      });
    }

    if (!TEACHING_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed roles: ${TEACHING_ROLES.join(', ')}`
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Check if employee ID already exists
    const existingTeacher = await Teacher.findOne({ employeeId });
    if (existingTeacher) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID already exists'
      });
    }

    // Create user account (auto-verified, can login immediately)
    // Note: Don't hash password manually - User model's pre-save hook will handle it
    const user = new User({
      fullName,
      email,
      phone,
      password: password, // Plain password - will be hashed by User model's pre-save hook
      role,
      isActive: true,
      isVerified: true,
      accountStatus: 'verified',
      verifiedBy: req.user.id,
      verifiedAt: new Date()
    });

    await user.save();

    // Create teacher profile (auto-verified)
    const teacher = new Teacher({
      user: user._id,
      employeeId,
      motherName,
      spouseName,
      dateOfBirth,
      religion,
      category,
      nationality,
      languages: languages || [],
      qualification,
      specialization,
      veda,
      shakha,
      educationalBackground,
      experience,
      joiningDate,
      departments: departments || [],
      subDepartments: subDepartments || [],
      batches: batches || [],
      subjects: subjects || [],
      permanentAddress,
      address,
      emergencyContact,
      aadhaarNumber,
      panNumber,
      bankDetails,
      remarks,
      isVerified: true, // Auto-verified, can login immediately
      verifiedBy: req.user.id,
      verifiedAt: new Date()
    });

    await teacher.save();
    await teacher.populate([
      { path: 'user', select: 'fullName email phone role isActive isVerified accountStatus' },
      { path: 'departments', select: 'name code' },
      { path: 'subDepartments', select: 'name code' },
      { path: 'batches', select: 'name code academicYear' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Teacher account created successfully. Teacher can login immediately.',
      teacher
    });
  } catch (error) {
    console.error('Error creating teacher:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating teacher account',
      error: error.message
    });
  }
});

// @route   PUT /api/teachers/:id
// @desc    Update teacher
// @access  Private (Admin/Coordinator/Self)
router.put('/:id', auth, async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    const teacher = await Teacher.findById(req.params.id).populate('user');
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    // Check permissions
    const canUpdate = TEACHER_MANAGERS.includes(userRole) ||
                     teacher.user._id.toString() === userId;

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    const {
      fullName, phone, role, employeeId,
      motherName, spouseName, dateOfBirth, religion, category, nationality, languages,
      qualification, specialization, veda, shakha, educationalBackground, experience,
      joiningDate, departments, subDepartments, batches,
      subjects, permanentAddress, address, emergencyContact,
      aadhaarNumber, panNumber, bankDetails, remarks, status
    } = req.body;

    if (role !== undefined && !TEACHING_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed roles: ${TEACHING_ROLES.join(', ')}`
      });
    }

    // Update user account
    if (fullName || phone !== undefined || role) {
      await User.findByIdAndUpdate(teacher.user._id, {
        ...(fullName && { fullName }),
        ...(phone !== undefined && { phone }),
        ...(role && TEACHER_MANAGERS.includes(userRole) && { role })
      });
    }

    // Update teacher profile
    const updateData = {
      ...(employeeId && { employeeId }),
      ...(motherName !== undefined && { motherName }),
      ...(spouseName !== undefined && { spouseName }),
      ...(dateOfBirth !== undefined && { dateOfBirth }),
      ...(religion !== undefined && { religion }),
      ...(category !== undefined && { category }),
      ...(nationality !== undefined && { nationality }),
      ...(languages !== undefined && { languages }),
      ...(qualification !== undefined && { qualification }),
      ...(specialization !== undefined && { specialization }),
      ...(veda !== undefined && { veda }),
      ...(shakha !== undefined && { shakha }),
      ...(educationalBackground !== undefined && { educationalBackground }),
      ...(experience !== undefined && { experience }),
      ...(joiningDate !== undefined && { joiningDate }),
      ...(permanentAddress !== undefined && { permanentAddress }),
      ...(address !== undefined && { address }),
      ...(emergencyContact !== undefined && { emergencyContact }),
      ...(aadhaarNumber !== undefined && { aadhaarNumber }),
      ...(panNumber !== undefined && { panNumber }),
      ...(bankDetails !== undefined && { bankDetails }),
      ...(remarks !== undefined && { remarks }),
      ...(status && { status })
    };
    
    // Only update arrays if provided
    if (departments !== undefined) updateData.departments = departments || teacher.departments;
    if (subDepartments !== undefined) updateData.subDepartments = subDepartments || teacher.subDepartments;
    if (batches !== undefined) updateData.batches = batches || teacher.batches;
    if (subjects !== undefined) updateData.subjects = subjects || teacher.subjects;
    
    const updatedTeacher = await Teacher.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate([
      { path: 'user', select: 'fullName email phone role isActive' },
      { path: 'departments', select: 'name code' },
      { path: 'subDepartments', select: 'name code' },
      { path: 'batches', select: 'name code academicYear' },
      { path: 'verifiedBy', select: 'fullName email' }
    ]);

    res.json({
      success: true,
      message: 'Teacher updated successfully',
      teacher: updatedTeacher
    });
  } catch (error) {
    console.error('Error updating teacher:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating teacher',
      error: error.message
    });
  }
});

// @route   PUT /api/teachers/:id/verify
// @desc    Verify teacher account
// @access  Private (Admin/Coordinator only)
router.put('/:id/verify', auth, async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    // Check permissions
    if (!TEACHER_MANAGERS.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only Admin, Coordinator, or Principal can verify teacher accounts'
      });
    }

    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    // Get the user ID (could be ObjectId or populated object)
    const userIdToVerify = teacher.user?._id || teacher.user;
    
    // Update Teacher model
    const updatedTeacher = await Teacher.findByIdAndUpdate(
      req.params.id,
      {
        isVerified: true,
        verifiedBy: userId,
        verifiedAt: new Date()
      },
      { new: true }
    ).populate([
      { path: 'user', select: 'fullName email phone role isActive isVerified accountStatus' },
      { path: 'departments', select: 'name code' },
      { path: 'subDepartments', select: 'name code' },
      { path: 'batches', select: 'name code academicYear' },
      { path: 'verifiedBy', select: 'fullName email' }
    ]);

    // Also verify the associated User account if it exists
    if (userIdToVerify) {
      const user = await User.findById(userIdToVerify);
      if (user) {
        await user.verifyAccount(userId);
        console.log(`✅ Verified User account for teacher: ${user.email}`);
      } else {
        console.warn(`⚠️ User not found for teacher user ID: ${userIdToVerify}`);
      }
    } else {
      console.warn(`⚠️ Teacher ${req.params.id} has no associated user`);
    }

    res.json({
      success: true,
      message: 'Teacher account verified successfully',
      teacher: updatedTeacher
    });
  } catch (error) {
    console.error('Error verifying teacher:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying teacher account',
      error: error.message
    });
  }
});

// @route   PUT /api/teachers/:id/verification
// @desc    Change teacher verification in both profile and login account
// @access  Private (Admin/Coordinator/Principal)
router.put('/:id/verification', auth, async (req, res) => {
  try {
    if (!TEACHER_MANAGERS.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }

    const { isVerified } = req.body;
    if (typeof isVerified !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isVerified must be true or false' });
    }

    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    const verificationUpdate = isVerified
      ? { isVerified: true, verifiedBy: req.user.id, verifiedAt: new Date() }
      : { isVerified: false, verifiedBy: null, verifiedAt: null };

    await Promise.all([
      Teacher.findByIdAndUpdate(teacher._id, verificationUpdate, { runValidators: true }),
      User.findByIdAndUpdate(teacher.user, {
        ...verificationUpdate,
        accountStatus: isVerified ? 'verified' : 'pending'
      }, { runValidators: true })
    ]);

    res.json({
      success: true,
      message: `Teacher marked as ${isVerified ? 'verified' : 'pending'}`
    });
  } catch (error) {
    console.error('Error changing teacher verification:', error);
    res.status(500).json({ success: false, message: 'Error changing verification', error: error.message });
  }
});

// @route   PUT /api/teachers/:id/status
// @desc    Change teacher employment status and login access
// @access  Private (Admin/Coordinator/Principal)
router.put('/:id/status', auth, async (req, res) => {
  try {
    if (!TEACHER_MANAGERS.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }

    const allowedStatuses = ['active', 'inactive', 'on_leave', 'terminated'];
    const { status } = req.body;
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid teacher status' });
    }

    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    const isActive = ['active', 'on_leave'].includes(status);
    await Promise.all([
      Teacher.findByIdAndUpdate(teacher._id, { status }, { runValidators: true }),
      User.findByIdAndUpdate(teacher.user, { isActive }, { runValidators: true })
    ]);

    res.json({ success: true, message: `Teacher status changed to ${status}` });
  } catch (error) {
    console.error('Error changing teacher status:', error);
    res.status(500).json({ success: false, message: 'Error changing status', error: error.message });
  }
});

// @route   PUT /api/teachers/:id/assignments
// @desc    Update teacher assignments (departments, sub-departments, batches)
// @access  Private (Admin/Coordinator only)
router.put('/:id/assignments', auth, async (req, res) => {
  try {
    const userRole = req.user.role;

    // Check permissions
    if (!TEACHER_MANAGERS.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only Admin, Coordinator, or Principal can update teacher assignments'
      });
    }

    const { departments, subDepartments, batches } = req.body;

    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    // Validate assignments
    if (departments && departments.length > 0) {
      const validDepartments = await Department.find({ _id: { $in: departments } });
      if (validDepartments.length !== departments.length) {
        return res.status(400).json({
          success: false,
          message: 'Some departments are invalid'
        });
      }
    }

    if (subDepartments && subDepartments.length > 0) {
      const validSubDepartments = await SubDepartment.find({ _id: { $in: subDepartments } });
      if (validSubDepartments.length !== subDepartments.length) {
        return res.status(400).json({
          success: false,
          message: 'Some sub-departments are invalid'
        });
      }
    }

    if (batches && batches.length > 0) {
      const validBatches = await Batch.find({ _id: { $in: batches } });
      if (validBatches.length !== batches.length) {
        return res.status(400).json({
          success: false,
          message: 'Some batches are invalid'
        });
      }
    }

    const updatedTeacher = await Teacher.findByIdAndUpdate(
      req.params.id,
      {
        departments: departments || [],
        subDepartments: subDepartments || [],
        batches: batches || []
      },
      { new: true }
    ).populate([
      { path: 'user', select: 'fullName email phone role isActive' },
      { path: 'departments', select: 'name code' },
      { path: 'subDepartments', select: 'name code' },
      { path: 'batches', select: 'name code academicYear' }
    ]);

    res.json({
      success: true,
      message: 'Teacher assignments updated successfully',
      teacher: updatedTeacher
    });
  } catch (error) {
    console.error('Error updating teacher assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating teacher assignments',
      error: error.message
    });
  }
});

// @route   DELETE /api/teachers/:id
// @desc    Delete teacher account
// @access  Private (Admin/Coordinator only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const userRole = req.user.role;

    // Check permissions
    if (!TEACHER_MANAGERS.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only Admin, Coordinator, or Principal can delete teacher accounts'
      });
    }

    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    if (req.query.permanent === 'true') {
      if (teacher.user.toString() === req.user.id) {
        return res.status(400).json({ success: false, message: 'You cannot permanently delete your own account' });
      }

      const teacherUser = await User.findById(teacher.user).select('role');
      if (teacherUser?.role === ROLES.ADMIN) {
        const adminCount = await User.countDocuments({ role: ROLES.ADMIN, isActive: true });
        if (adminCount <= 1) {
          return res.status(400).json({ success: false, message: 'The last active Admin account cannot be deleted' });
        }
      }

      await Promise.all([
        TeacherAssignment.deleteMany({ teacher: teacher.user }),
        Department.updateMany({ hod: teacher.user }, { $unset: { hod: 1 } }),
        SubDepartment.updateMany({ coordinator: teacher.user }, { $unset: { coordinator: 1 } }),
        Batch.updateMany({ classTeacher: teacher.user }, { $unset: { classTeacher: 1 } })
      ]);
      await Teacher.findByIdAndDelete(teacher._id);
      await User.findByIdAndDelete(teacher.user);

      return res.json({ success: true, message: 'Teacher profile and login account permanently deleted' });
    }

    // Soft delete teacher profile
    await Teacher.findByIdAndUpdate(req.params.id, { status: 'terminated' });

    // Deactivate user account
    await User.findByIdAndUpdate(teacher.user, { isActive: false });

    res.json({
      success: true,
      message: 'Teacher account archived successfully'
    });
  } catch (error) {
    console.error('Error deleting teacher:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting teacher account',
      error: error.message
    });
  }
});

export default router;
