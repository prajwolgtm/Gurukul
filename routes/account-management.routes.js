import express from 'express';
import User from '../models/User.js';
import Teacher from '../models/Teacher.js';
import { auth } from '../middleware/auth.js';
import { permit } from '../middleware/rbac.js';
import { ROLES, ACCOUNT_MANAGERS, TEACHER_VERIFIERS, FULL_ACCESS_ROLES } from '../utils/roles.js';

const router = express.Router();

// ==================== ACCOUNT MANAGEMENT ROUTES ====================

// @route   GET /api/account-management/pending-accounts
// @desc    Get all pending accounts (especially teachers waiting for verification)
// @access  Private (Admin/Coordinator only)
router.get('/pending-accounts', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR), async (req, res) => {
  try {
    const pendingAccounts = await User.find({
      accountStatus: 'pending'
    }).select('-password').sort({ createdAt: -1 });

    res.json({
      success: true,
      message: `Found ${pendingAccounts.length} pending accounts`,
      accounts: pendingAccounts,
      count: pendingAccounts.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching pending accounts',
      error: error.message
    });
  }
});

// @route   GET /api/account-management/all-accounts
// @desc    Get all user accounts with filtering options
// @access  Private (Admin/Coordinator only)
router.get('/all-accounts', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR), async (req, res) => {
  try {
    const { role, status, verified, active, page = 1, limit = 20 } = req.query;
    
    // Build filter query
    const filter = {};
    if (role) filter.role = role;
    if (status) filter.accountStatus = status;
    if (verified !== undefined) filter.isVerified = verified === 'true';
    if (active !== undefined) filter.isActive = active === 'true';

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const accounts = await User.find(filter)
      .select('-password')
      .populate('verifiedBy', 'fullName email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalCount = await User.countDocuments(filter);

    res.json({
      success: true,
      message: `Found ${accounts.length} accounts`,
      accounts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching accounts',
      error: error.message
    });
  }
});

// @route   POST /api/account-management/verify-account/:userId
// @desc    Verify a pending account (especially teacher accounts)
// @access  Private (Admin/Coordinator only)
router.post('/verify-account/:userId', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR), async (req, res) => {
  try {
    const { userId } = req.params;
    const { notes } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.accountStatus === 'verified') {
      return res.status(400).json({
        success: false,
        message: 'Account is already verified'
      });
    }

    // Verify the account
    await user.verifyAccount(req.user.id);

    res.json({
      success: true,
      message: `Account verified successfully for ${user.fullName}`,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus,
        isVerified: user.isVerified,
        verifiedAt: user.verifiedAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error verifying account',
      error: error.message
    });
  }
});

// @route   POST /api/account-management/reject-account/:userId
// @desc    Reject a pending account
// @access  Private (Admin/Coordinator only)
router.post('/reject-account/:userId', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR), async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Reject the account
    await user.rejectAccount(req.user.id, reason);

    res.json({
      success: true,
      message: `Account rejected for ${user.fullName}`,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus,
        rejectionReason: user.rejectionReason
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error rejecting account',
      error: error.message
    });
  }
});

// @route   POST /api/account-management/suspend-account/:userId
// @desc    Suspend an active account
// @access  Private (Admin/Coordinator only)
router.post('/suspend-account/:userId', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR), async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Suspension reason is required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Don't allow suspending Admin or Coordinator accounts
    if ([ROLES.ADMIN, ROLES.COORDINATOR].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Cannot suspend Admin or Coordinator accounts'
      });
    }

    // Suspend the account
    await user.suspendAccount(req.user.id, reason);

    res.json({
      success: true,
      message: `Account suspended for ${user.fullName}`,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus,
        isActive: user.isActive,
        rejectionReason: user.rejectionReason
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error suspending account',
      error: error.message
    });
  }
});

// @route   POST /api/account-management/reactivate-account/:userId
// @desc    Reactivate a suspended account
// @access  Private (Admin/Coordinator only)
router.post('/reactivate-account/:userId', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR), async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Reactivate the account
    await user.reactivateAccount(req.user.id);

    res.json({
      success: true,
      message: `Account reactivated for ${user.fullName}`,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus,
        isActive: user.isActive,
        verifiedAt: user.verifiedAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error reactivating account',
      error: error.message
    });
  }
});

// @route   POST /api/account-management/create-staff-account
// @desc    Create staff accounts (Admin/Coordinator/Principal/Teacher)
// @access  Private (Admin/Coordinator only)
router.post('/create-staff-account', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR), async (req, res) => {
  try {
    console.log('📝 Create staff account request:', {
      user: req.user?.email,
      userRole: req.user?.role,
      requestBody: { ...req.body, password: '[HIDDEN]' }
    });
    
    const { 
      fullName, email, password, role, phone, employeeId,
      qualification, experience, specialization, address, joiningDate
    } = req.body;

    // Validate required fields
    if (!fullName || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Please provide fullName, email, password, and role'
      });
    }

    // Validate role
    const allowedRoles = [ROLES.COORDINATOR, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed roles: ${allowedRoles.join(', ')}`
      });
    }

    // Only Admin can create Coordinator accounts
    if (role === ROLES.COORDINATOR && req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'Only Admin can create Coordinator accounts'
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

    // Create user with appropriate verification status
    const userData = {
      fullName,
      email,
      password,
      role,
      phone,
      employeeId: employeeId || `EMP${Date.now()}` // Generate employeeId if not provided
    };
    
    // Add additional fields if they exist in the User model
    // Note: qualification, experience, specialization, address, joiningDate 
    // are not part of the base User model - they would need to be added
    // or stored in a separate profile/staff model

    // Auto-verify high-level roles and teachers
    if ([ROLES.COORDINATOR, ROLES.PRINCIPAL, ROLES.TEACHER].includes(role)) {
      userData.isVerified = true;
      userData.accountStatus = 'verified';
      userData.verifiedBy = req.user.id;
      userData.verifiedAt = new Date();
    }

    const user = await User.create(userData);

    res.status(201).json({
      success: true,
      message: `${role} account created successfully`,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus,
        isVerified: user.isVerified,
        employeeId: user.employeeId
      }
    });
  } catch (error) {
    console.error('❌ Error creating staff account:', {
      error: error.message,
      stack: error.stack,
      user: req.user?.email,
      requestBody: { ...req.body, password: '[HIDDEN]' }
    });
    
    res.status(500).json({
      success: false,
      message: 'Error creating staff account',
      error: error.message
    });
  }
});

// @route   GET /api/account-management/account-stats
// @desc    Get account statistics
// @access  Private (Admin/Coordinator only)
router.get('/account-stats', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR), async (req, res) => {
  try {
    const stats = await Promise.all([
      User.countDocuments({ accountStatus: 'pending' }),
      User.countDocuments({ accountStatus: 'verified' }),
      User.countDocuments({ accountStatus: 'rejected' }),
      User.countDocuments({ accountStatus: 'suspended' }),
      User.countDocuments({ role: ROLES.TEACHER }),
      User.countDocuments({ role: ROLES.TEACHER, accountStatus: 'pending' }),
      User.countDocuments({ role: ROLES.PRINCIPAL }),
      User.countDocuments({ role: ROLES.COORDINATOR }),
      User.countDocuments({ role: ROLES.ADMIN }),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: false })
    ]);

    const [
      pendingCount,
      verifiedCount,
      rejectedCount,
      suspendedCount,
      teacherCount,
      pendingTeacherCount,
      principalCount,
      coordinatorCount,
      adminCount,
      activeCount,
      inactiveCount
    ] = stats;

    res.json({
      success: true,
      stats: {
        accountStatus: {
          pending: pendingCount,
          verified: verifiedCount,
          rejected: rejectedCount,
          suspended: suspendedCount
        },
        roles: {
          admin: adminCount,
          coordinator: coordinatorCount,
          principal: principalCount,
          teacher: teacherCount,
          pendingTeachers: pendingTeacherCount
        },
        activity: {
          active: activeCount,
          inactive: inactiveCount
        },
        total: activeCount + inactiveCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching account statistics',
      error: error.message
    });
  }
});

// @route   PUT /api/account-management/update-account/:userId
// @desc    Update user account details
// @access  Private (Admin/Coordinator only)
router.put('/update-account/:userId', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR), async (req, res) => {
  try {
    const { userId } = req.params;
    const { fullName, email, phone, employeeId, role } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Don't allow changing Admin role unless current user is Admin
    if (user.role === ROLES.ADMIN && req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'Only Admin can modify Admin accounts'
      });
    }

    // Update allowed fields
    if (fullName) user.fullName = fullName;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (employeeId) user.employeeId = employeeId;
    
    // Role changes require special handling
    if (role && role !== user.role) {
      const allowedRoles = [ROLES.COORDINATOR, ROLES.PRINCIPAL, ROLES.HOD, ROLES.TEACHER];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message: `Invalid role. Allowed roles: ${allowedRoles.join(', ')}`
        });
      }
      
      // Only Admin can assign Coordinator role
      if (role === ROLES.COORDINATOR && req.user.role !== ROLES.ADMIN) {
        return res.status(403).json({
          success: false,
          message: 'Only Admin can assign Coordinator role'
        });
      }
      
      user.role = role;
      
      // Re-evaluate verification status based on new role
      if ([ROLES.COORDINATOR, ROLES.PRINCIPAL].includes(role)) {
        user.isVerified = true;
        user.accountStatus = 'verified';
        user.verifiedBy = req.user.id;
        user.verifiedAt = new Date();
      } else if (role === ROLES.TEACHER && user.accountStatus === 'verified') {
        // Keep verified status for teachers who were already verified
      }
    }

    await user.save();

    res.json({
      success: true,
      message: 'Account updated successfully',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        phone: user.phone,
        employeeId: user.employeeId,
        accountStatus: user.accountStatus,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating account',
      error: error.message
    });
  }
});

// @route   POST /api/account-management/verify-by-email
// @desc    Verify a user account by email (quick fix for verified teachers)
// @access  Private (Admin/Coordinator only)
router.post('/verify-by-email', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR), async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this email'
      });
    }

    if (user.accountStatus === 'verified' && user.isVerified) {
      return res.json({
        success: true,
        message: 'User is already verified',
        user: {
          id: user._id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          accountStatus: user.accountStatus,
          isVerified: user.isVerified
        }
      });
    }

    // Verify the account
    await user.verifyAccount(req.user.id);

    res.json({
      success: true,
      message: `Account verified successfully for ${user.fullName}`,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        accountStatus: user.accountStatus,
        isVerified: user.isVerified,
        verifiedAt: user.verifiedAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error verifying account by email',
      error: error.message
    });
  }
});

// @route   POST /api/account-management/sync-teacher-verification
// @desc    Sync verification status from Teacher model to User model for all verified teachers
// @access  Private (Admin/Coordinator only)
router.post('/sync-teacher-verification', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR), async (req, res) => {
  try {
    // Find all verified teachers
    const verifiedTeachers = await Teacher.find({ isVerified: true }).populate('user');
    
    let synced = 0;
    let errors = [];

    for (const teacher of verifiedTeachers) {
      try {
        const userId = teacher.user?._id || teacher.user;
        if (!userId) {
          errors.push(`Teacher ${teacher._id} has no associated user`);
          continue;
        }

        const user = await User.findById(userId);
        if (!user) {
          errors.push(`User not found for teacher ${teacher._id}`);
          continue;
        }

        // If user is not verified, verify it
        if (!user.isVerified || user.accountStatus !== 'verified') {
          await user.verifyAccount(req.user.id);
          synced++;
        }
      } catch (err) {
        errors.push(`Error syncing teacher ${teacher._id}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      message: `Synced ${synced} teacher accounts. ${errors.length} errors.`,
      synced,
      totalVerifiedTeachers: verifiedTeachers.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error syncing teacher verification',
      error: error.message
    });
  }
});

// @route   POST /api/account-management/reset-password
// @desc    Reset password for a user by email (Admin/Coordinator only)
// @access  Private (Admin/Coordinator only)
router.post('/reset-password', auth, permit(ROLES.ADMIN, ROLES.COORDINATOR), async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this email'
      });
    }

    // Set new password (will be hashed by pre-save hook)
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: `Password reset successfully for ${user.fullName}`,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error resetting password',
      error: error.message
    });
  }
});

// @route   POST /api/account-management/fix-double-hashed-passwords
// @desc    Fix accounts with double-hashed passwords by resetting to a temporary password
// @access  Private (Admin only)
router.post('/fix-double-hashed-passwords', auth, permit(ROLES.ADMIN), async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this email'
      });
    }

    // Set a new password (or use provided one, or generate a temporary one)
    const tempPassword = newPassword || `Temp${Date.now()}`;
    user.password = tempPassword;
    await user.save();

    res.json({
      success: true,
      message: `Password reset successfully for ${user.fullName}. ${newPassword ? 'New password set.' : 'Temporary password generated.'}`,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      },
      ...(newPassword ? {} : { temporaryPassword: tempPassword, note: 'Please change this password after login.' })
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fixing password',
      error: error.message
    });
  }
});

export default router;
