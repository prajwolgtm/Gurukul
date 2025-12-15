import express from 'express';
import Department from '../models/Department.js';
import SubDepartment from '../models/SubDepartment.js';
import Batch from '../models/Batch.js';
import { auth } from '../middleware/auth.js';
import { ROLES } from '../utils/roles.js';

const router = express.Router();

// ==================== DEPARTMENTS ====================

// @route   GET /api/academic/departments
// @desc    Get all departments
// @access  Private
router.get('/departments', auth, async (req, res) => {
  try {
    const departments = await Department.find({ isActive: true })
      .populate('hod', 'fullName email')
      .sort({ name: 1 });

    res.json({
      success: true,
      count: departments.length,
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

// @route   POST /api/academic/departments
// @desc    Create new department
// @access  Private (Admin/Coordinator only)
router.post('/departments', auth, async (req, res) => {
  try {
    const { name, code, description, hod } = req.body;
    const userRole = req.user.role;

    // Check permissions
    if (![ROLES.ADMIN, ROLES.COORDINATOR].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only Admin or Coordinator can create departments'
      });
    }

    // Validate required fields
    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Name and code are required'
      });
    }

    const department = new Department({
      name,
      code,
      description,
      hod
    });

    await department.save();
    await department.populate('hod', 'fullName email');

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      department
    });
  } catch (error) {
    console.error('Error creating department:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Department name or code already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating department',
      error: error.message
    });
  }
});

// ==================== SUB-DEPARTMENTS ====================

// @route   GET /api/academic/departments/:departmentId/sub-departments
// @desc    Get sub-departments for a department
// @access  Private
router.get('/departments/:departmentId/sub-departments', auth, async (req, res) => {
  try {
    const { departmentId } = req.params;

    const subDepartments = await SubDepartment.find({
      department: departmentId,
      isActive: true
    })
      .populate('coordinator', 'fullName email')
      .sort({ name: 1 });

    res.json({
      success: true,
      count: subDepartments.length,
      subDepartments
    });
  } catch (error) {
    console.error('Error fetching sub-departments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching sub-departments',
      error: error.message
    });
  }
});

// @route   POST /api/academic/departments/:departmentId/sub-departments
// @desc    Create sub-department under a department
// @access  Private (Admin/Coordinator/HOD)
router.post('/departments/:departmentId/sub-departments', auth, async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { name, code, description, coordinator } = req.body;
    const userRole = req.user.role;

    // Check permissions
    if (![ROLES.ADMIN, ROLES.COORDINATOR, ROLES.HOD].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    // Validate required fields
    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Name and code are required'
      });
    }

    const subDepartment = new SubDepartment({
      name,
      code,
      description,
      department: departmentId,
      coordinator
    });

    await subDepartment.save();
    await subDepartment.populate(['department', 'coordinator']);

    res.status(201).json({
      success: true,
      message: 'Sub-department created successfully',
      subDepartment
    });
  } catch (error) {
    console.error('Error creating sub-department:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Sub-department name or code already exists in this department'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating sub-department',
      error: error.message
    });
  }
});

// ==================== BATCHES ====================

// @route   GET /api/academic/departments/:departmentId/batches
// @desc    Get batches for a department
// @access  Private
router.get('/departments/:departmentId/batches', auth, async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { subDepartmentId, status = 'active' } = req.query;

    let query = {
      department: departmentId,
      isActive: true
    };

    if (subDepartmentId) {
      query.subDepartment = subDepartmentId;
    }

    if (status) {
      query.status = status;
    }

    const batches = await Batch.find(query)
      .populate('department', 'name code')
      .populate('subDepartment', 'name code')
      .sort({ name: 1 });

    res.json({
      success: true,
      count: batches.length,
      batches
    });
  } catch (error) {
    console.error('Error fetching batches:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching batches',
      error: error.message
    });
  }
});

// @route   GET /api/academic/sub-departments/:subDepartmentId/batches
// @desc    Get batches for a sub-department
// @access  Private
router.get('/sub-departments/:subDepartmentId/batches', auth, async (req, res) => {
  try {
    const { subDepartmentId } = req.params;
    const { status = 'active' } = req.query;

    let query = {
      subDepartment: subDepartmentId,
      isActive: true
    };

    if (status) {
      query.status = status;
    }

    const batches = await Batch.find(query)
      .populate('department', 'name code')
      .populate('subDepartment', 'name code')
      .sort({ name: 1 });

    res.json({
      success: true,
      count: batches.length,
      batches
    });
  } catch (error) {
    console.error('Error fetching batches:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching batches',
      error: error.message
    });
  }
});

// @route   POST /api/academic/batches
// @desc    Create new batch
// @access  Private (Admin/Coordinator/HOD)
router.post('/batches', auth, async (req, res) => {
  try {
    const {
      name, code, department, subDepartment, academicYear,
      startDate, endDate, maxStudents
    } = req.body;
    const userRole = req.user.role;

    // Check permissions
    if (![ROLES.ADMIN, ROLES.COORDINATOR, ROLES.HOD].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    // Validate required fields
    if (!name || !code || !department) {
      return res.status(400).json({
        success: false,
        message: 'Name, code, and department are required'
      });
    }

    const batch = new Batch({
      name,
      code,
      department,
      subDepartment,
      academicYear,
      startDate,
      endDate,
      maxStudents
    });

    await batch.save();
    await batch.populate(['department', 'subDepartment']);

    res.status(201).json({
      success: true,
      message: 'Batch created successfully',
      batch
    });
  } catch (error) {
    console.error('Error creating batch:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Batch code already exists for this department and academic year'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating batch',
      error: error.message
    });
  }
});

// @route   GET /api/academic/structure
// @desc    Get complete academic structure
// @access  Private
router.get('/structure', auth, async (req, res) => {
  try {
    const departments = await Department.find({ isActive: true })
      .populate('hod', 'fullName email')
      .sort({ name: 1 });

    const structure = await Promise.all(departments.map(async (dept) => {
      // Get sub-departments for this department
      const subDepartments = await SubDepartment.find({
        department: dept._id,
        isActive: true
      })
        .populate('coordinator', 'fullName email')
        .sort({ name: 1 });

      // Get batches for each sub-department and department
      const subDepartmentsWithBatches = await Promise.all(subDepartments.map(async (subDept) => {
        const batches = await Batch.find({
          subDepartment: subDept._id,
          isActive: true
        }).sort({ name: 1 });

        return {
          ...subDept.toObject(),
          batches
        };
      }));

      // Get department-level batches (not assigned to any sub-department)
      const departmentBatches = await Batch.find({
        department: dept._id,
        subDepartment: { $exists: false },
        isActive: true
      }).sort({ name: 1 });

      return {
        ...dept.toObject(),
        subDepartments: subDepartmentsWithBatches,
        batches: departmentBatches
      };
    }));

    res.json({
      success: true,
      structure
    });
  } catch (error) {
    console.error('Error fetching academic structure:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching academic structure',
      error: error.message
    });
  }
});

export default router;
