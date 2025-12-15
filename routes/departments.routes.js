import express from 'express';
import Department from '../models/Department.js';
import SubDepartment from '../models/SubDepartment.js';
import Batch from '../models/Batch.js';
import Student from '../models/Student.js';
import StudentAssignment from '../models/StudentAssignment.js';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';
import { permit } from '../middleware/rbac.js';
import { ROLES } from '../utils/roles.js';

const router = express.Router();

// ==================== DEPARTMENTS ====================

// @route   POST /api/departments
// @desc    Create new department (Admin/Principal only)
// @access  Private
router.post('/', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const { name, code, description, hodId } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Department name and code are required'
      });
    }

    // Validate HOD if provided (check for empty string, null, or undefined)
    let validHodId = null;
    if (hodId && hodId.toString().trim() !== '') {
      const hodExists = await User.findById(hodId);
      if (!hodExists) {
        return res.status(400).json({
          success: false,
          message: 'Invalid HOD user ID'
        });
      }
      validHodId = hodId;
    }

    // Prepare department data
    const departmentData = {
      name: name.trim(),
      code: code.toUpperCase().trim(),
      description: description?.trim() || ''
    };
    
    // Only add hod if we have a valid ID
    if (validHodId) {
      departmentData.hod = validHodId;
    }

    const department = await Department.create(departmentData);

    // Populate HOD if it exists
    if (department.hod) {
      try {
        await department.populate('hod', 'fullName email role');
      } catch (populateError) {
        console.warn('Failed to populate HOD:', populateError.message);
        // Continue without populating - not critical
      }
    }

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      department: {
        id: department._id,
        name: department.name,
        code: department.code,
        description: department.description,
        hod: department.hod || null,
        totalStudents: 0, // New department has no students yet
        totalBatches: 0, // New department has no batches yet
        isActive: department.isActive,
        createdAt: department.createdAt
      }
    });

  } catch (error) {
    console.error('Error creating department:', error);
    
    if (error.code === 11000) {
      // Duplicate key error
      const field = error.keyPattern?.name ? 'name' : 'code';
      return res.status(400).json({
        success: false,
        message: `Department ${field} already exists`
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while creating department',
      error: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
    });
  }
});

// @route   GET /api/departments
// @desc    Get all departments
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const departments = await Department.find({ isActive: true })
      .populate('hod', 'fullName email role')
      .sort({ name: 1 });
    
    // Get counts for each department using aggregation
    const departmentsWithCounts = await Promise.all(departments.map(async (dept) => {
      // Count students from both Student model (direct department field) and StudentAssignment (via assignments)
      // Count all students regardless of status
      const [studentsFromModel, studentsFromAssignments, totalBatches] = await Promise.all([
        Student.countDocuments({ department: dept._id }),
        StudentAssignment.countDocuments({ department: dept._id }),
        Batch.countDocuments({ department: dept._id })
      ]);
      
      // Total students = students with direct department field + students assigned via StudentAssignment
      const totalStudents = studentsFromModel + studentsFromAssignments;
      
      // Debug logging for first department
      if (dept.code === 'RIG' && (totalStudents > 0 || totalBatches > 0)) {
        console.log(`📊 Department ${dept.name} (${dept._id}):`);
        console.log(`   - Students from Student model: ${studentsFromModel}`);
        console.log(`   - Students from StudentAssignment: ${studentsFromAssignments}`);
        console.log(`   - Total students: ${totalStudents}`);
        console.log(`   - Total batches: ${totalBatches}`);
      }
      
      return {
        id: dept._id,
        name: dept.name,
        code: dept.code,
        description: dept.description,
        hod: dept.hod,
        totalStudents,
        totalBatches,
        isActive: dept.isActive,
        createdAt: dept.createdAt
      };
    }));

    res.json({
      success: true,
      departments: departmentsWithCounts
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/departments/:id
// @desc    Update department (Admin/Principal/HOD if own department)
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, hodId } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Find the department
    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    // Check permissions
    const canEdit = userRole === ROLES.ADMIN || 
                   userRole === ROLES.PRINCIPAL || 
                   (userRole === ROLES.HOD && department.hod?.toString() === userId);

    if (!canEdit) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own department'
      });
    }

    // Validate and prepare update data
    const updateData = {};
    
    if (name) updateData.name = name.trim();
    if (code) updateData.code = code.toUpperCase().trim();
    if (description !== undefined) updateData.description = description?.trim() || '';
    
    // Handle HOD - only set if provided and not empty
    if (hodId && hodId.toString().trim() !== '') {
      // Validate HOD user exists
      const hodExists = await User.findById(hodId);
      if (!hodExists) {
        return res.status(400).json({
          success: false,
          message: 'Invalid HOD user ID'
        });
      }
      updateData.hod = hodId;
    } else if (hodId === null || hodId === '') {
      // Allow clearing HOD by setting to null
      updateData.hod = null;
    }

    // Update department
    const updatedDepartment = await Department.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    // Populate HOD if it exists
    if (updatedDepartment.hod) {
      await updatedDepartment.populate('hod', 'fullName email role');
    }

    // Get counts for the updated department (from both Student and StudentAssignment)
    const [studentsFromModel, studentsFromAssignments] = await Promise.all([
      Student.countDocuments({ department: updatedDepartment._id }),
      StudentAssignment.countDocuments({ department: updatedDepartment._id })
    ]);
    const totalStudents = studentsFromModel + studentsFromAssignments;
    const totalBatches = await Batch.countDocuments({ department: updatedDepartment._id });

    res.json({
      success: true,
      message: 'Department updated successfully',
      department: {
        id: updatedDepartment._id,
        name: updatedDepartment.name,
        code: updatedDepartment.code,
        description: updatedDepartment.description,
        hod: updatedDepartment.hod || null,
        totalStudents,
        totalBatches,
        isActive: updatedDepartment.isActive,
        updatedAt: updatedDepartment.updatedAt
      }
    });

  } catch (error) {
    console.error('Error updating department:', error);
    
    if (error.code === 11000) {
      const field = error.keyPattern?.name ? 'name' : 'code';
      return res.status(400).json({
        success: false,
        message: `Department ${field} already exists`
      });
    }
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while updating department',
      error: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
    });
  }
});

// @route   DELETE /api/departments/:id
// @desc    Delete department (Admin/Principal only)
// @access  Private
router.delete('/:id', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if department has students (from both Student and StudentAssignment)
    const Student = (await import('../models/Student.js')).default;
    const StudentAssignment = (await import('../models/StudentAssignment.js')).default;
    const [studentsFromModel, studentsFromAssignments] = await Promise.all([
      Student.countDocuments({ department: id }),
      StudentAssignment.countDocuments({ department: id })
    ]);
    const studentCount = studentsFromModel + studentsFromAssignments;
    
    if (studentCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete department. It has ${studentCount} active students.`
      });
    }

    // Check if department has sub-departments
    const subDeptCount = await SubDepartment.countDocuments({ department: id, isActive: true });
    if (subDeptCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete department. It has ${subDeptCount} active sub-departments.`
      });
    }

    // Check if department has batches
    const batchCount = await Batch.countDocuments({ department: id, status: 'active' });
    if (batchCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete department. It has ${batchCount} active batches.`
      });
    }

    // Soft delete - mark as inactive
    await Department.findByIdAndUpdate(id, { isActive: false });

    res.json({
      success: true,
      message: 'Department deleted successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// ==================== SUB-DEPARTMENTS ====================

// @route   POST /api/departments/:departmentId/sub-departments
// @desc    Create sub-department under a department (Admin/Principal/HOD if own department)
// @access  Private
router.post('/:departmentId/sub-departments', auth, async (req, res) => {
  try {
    const { name, code, description, coordinatorId } = req.body;
    const { departmentId } = req.params;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Sub-department name and code are required'
      });
    }

    // Verify department exists and check permissions
    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    const userId = req.user.id;
    const userRole = req.user.role;

    // Check permissions
    const canCreate = userRole === ROLES.ADMIN || 
                     userRole === ROLES.PRINCIPAL || 
                     (userRole === ROLES.HOD && department.hod?.toString() === userId);

    if (!canCreate) {
      return res.status(403).json({
        success: false,
        message: 'You can only create sub-departments in your own department'
      });
    }

    // Validate coordinator if provided
    let validCoordinatorId = null;
    if (coordinatorId && coordinatorId.toString().trim() !== '') {
      const coordinatorExists = await User.findById(coordinatorId);
      if (!coordinatorExists) {
        return res.status(400).json({
          success: false,
          message: 'Invalid coordinator user ID'
        });
      }
      validCoordinatorId = coordinatorId;
    }

    // Prepare sub-department data
    const subDeptData = {
      name: name.trim(),
      code: code.toUpperCase().trim(),
      description: description?.trim() || '',
      department: departmentId
    };
    
    // Only add coordinator if we have a valid ID
    if (validCoordinatorId) {
      subDeptData.coordinator = validCoordinatorId;
    }

    const subDepartment = await SubDepartment.create(subDeptData);

    // Populate department and coordinator
    await subDepartment.populate('department', 'name code');
    if (subDepartment.coordinator) {
      try {
        await subDepartment.populate('coordinator', 'fullName email role');
      } catch (populateError) {
        console.warn('Failed to populate coordinator:', populateError.message);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Sub-department created successfully',
      subDepartment: {
        id: subDepartment._id,
        name: subDepartment.name,
        code: subDepartment.code,
        description: subDepartment.description,
        department: subDepartment.department,
        coordinator: subDepartment.coordinator,
        isActive: subDepartment.isActive,
        createdAt: subDepartment.createdAt
      }
    });

  } catch (error) {
    console.error('Error creating sub-department:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Sub-department code already exists in this department'
      });
    }
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while creating sub-department',
      error: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
    });
  }
});

// @route   GET /api/departments/sub-departments
// @desc    Get all sub-departments (optional: filter by department)
// @access  Private
router.get('/sub-departments', auth, async (req, res) => {
  try {
    const { departmentId } = req.query;
    
    let query = { isActive: true };
    if (departmentId) {
      query.department = departmentId;
    }

    const subDepartments = await SubDepartment.find(query)
      .populate('department', 'name code')
      .populate('coordinator', 'fullName email role')
      .sort({ name: 1 });
    
    console.log(`Found ${subDepartments.length} sub-departments with query:`, query);
    
    // Get counts for each sub-department
    const subDepartmentsWithCounts = await Promise.all(subDepartments.map(async (subDept) => {
      // Count students from both Student model and StudentAssignment
      const [studentsFromModel, studentsFromAssignments] = await Promise.all([
        Student.countDocuments({ subDepartments: subDept._id }),
        StudentAssignment.countDocuments({ subDepartment: subDept._id })
      ]);
      const totalStudents = studentsFromModel + studentsFromAssignments;
      // Count all batches for this sub-department (regardless of status)
      const totalBatches = await Batch.countDocuments({ subDepartment: subDept._id });
      
      // Debug logging for first sub-department
      if (subDept.code && totalBatches > 0) {
        console.log(`📊 Sub-department ${subDept.name}: Found ${totalBatches} batches`);
      }
      
      return {
        id: subDept._id,
        name: subDept.name,
        code: subDept.code,
        description: subDept.description,
        department: subDept.department,
        coordinator: subDept.coordinator || null,
        totalStudents,
        totalBatches,
        isActive: subDept.isActive,
        createdAt: subDept.createdAt
      };
    }));

    console.log(`Returning ${subDepartmentsWithCounts.length} sub-departments`);
    
    res.json({
      success: true,
      subDepartments: subDepartmentsWithCounts
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/departments/:departmentId/sub-departments
// @desc    Get sub-departments of a specific department
// @access  Private
router.get('/:departmentId/sub-departments', auth, async (req, res) => {
  try {
    const { departmentId } = req.params;

    const subDepartments = await SubDepartment.find({ 
      department: departmentId, 
      isActive: true 
    })
      .populate('coordinator', 'fullName email role')
      .sort({ name: 1 });

    res.json({
      success: true,
      subDepartments: subDepartments.map(subDept => ({
        id: subDept._id,
        name: subDept.name,
        code: subDept.code,
        description: subDept.description,
        coordinator: subDept.coordinator,
        totalStudents: subDept.totalStudents || 0,
        isActive: subDept.isActive,
        createdAt: subDept.createdAt
      }))
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/departments/:departmentId/sub-departments/:id
// @desc    Update sub-department (Admin/Principal/HOD if own department/Coordinator if own sub-department)
// @access  Private
router.put('/:departmentId/sub-departments/:id', auth, async (req, res) => {
  try {
    const { departmentId, id } = req.params;
    const { name, code, description, coordinatorId } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Verify department and sub-department exist
    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    const subDepartment = await SubDepartment.findOne({ _id: id, department: departmentId });
    if (!subDepartment) {
      return res.status(404).json({
        success: false,
        message: 'Sub-department not found in this department'
      });
    }

    // Check permissions
    const canEdit = userRole === ROLES.ADMIN || 
                   userRole === ROLES.PRINCIPAL || 
                   (userRole === ROLES.HOD && department.hod?.toString() === userId) ||
                   (userRole === ROLES.TEACHER && subDepartment.coordinator?.toString() === userId);

    if (!canEdit) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to edit this sub-department'
      });
    }

    // Validate coordinator if provided
    let validCoordinatorId = null;
    if (coordinatorId && coordinatorId.toString().trim() !== '') {
      const coordinatorExists = await User.findById(coordinatorId);
      if (!coordinatorExists) {
        return res.status(400).json({
          success: false,
          message: 'Invalid coordinator user ID'
        });
      }
      validCoordinatorId = coordinatorId;
    }

    // Prepare update data
    const updateData = {};
    if (name) updateData.name = name.trim();
    if (code) updateData.code = code.toUpperCase().trim();
    if (description !== undefined) updateData.description = description?.trim() || '';
    
    // Handle coordinator - only set if provided and not empty
    if (validCoordinatorId) {
      updateData.coordinator = validCoordinatorId;
    } else if (coordinatorId === null || coordinatorId === '') {
      // Allow clearing coordinator by setting to null
      updateData.coordinator = null;
    }

    // Update sub-department
    const updatedSubDepartment = await SubDepartment.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    // Populate related data
    await updatedSubDepartment.populate('department', 'name code');
    if (updatedSubDepartment.coordinator) {
      try {
        await updatedSubDepartment.populate('coordinator', 'fullName email role');
      } catch (populateError) {
        console.warn('Failed to populate coordinator:', populateError.message);
      }
    }

    res.json({
      success: true,
      message: 'Sub-department updated successfully',
      subDepartment: {
        id: updatedSubDepartment._id,
        name: updatedSubDepartment.name,
        code: updatedSubDepartment.code,
        description: updatedSubDepartment.description,
        department: updatedSubDepartment.department,
        coordinator: updatedSubDepartment.coordinator,
        isActive: updatedSubDepartment.isActive,
        updatedAt: updatedSubDepartment.updatedAt
      }
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Sub-department code already exists in this department'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   DELETE /api/departments/:departmentId/sub-departments/:id
// @desc    Delete sub-department (Admin/Principal/HOD if own department)
// @access  Private
router.delete('/:departmentId/sub-departments/:id', auth, async (req, res) => {
  try {
    const { departmentId, id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Verify department and sub-department exist
    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    const subDepartment = await SubDepartment.findOne({ _id: id, department: departmentId });
    if (!subDepartment) {
      return res.status(404).json({
        success: false,
        message: 'Sub-department not found in this department'
      });
    }

    // Check permissions
    const canDelete = userRole === ROLES.ADMIN || 
                     userRole === ROLES.PRINCIPAL || 
                     (userRole === ROLES.HOD && department.hod?.toString() === userId);

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this sub-department'
      });
    }

    // Check if sub-department has students
    const Student = (await import('../models/Student.js')).default;
    const studentCount = await Student.countDocuments({ subDepartment: id, isActive: true });
    
    if (studentCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete sub-department. It has ${studentCount} active students.`
      });
    }

    // Check if sub-department has batches
    const batchCount = await Batch.countDocuments({ subDepartment: id, status: 'active' });
    if (batchCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete sub-department. It has ${batchCount} active batches.`
      });
    }

    // Soft delete - mark as inactive
    await SubDepartment.findByIdAndUpdate(id, { isActive: false });

    res.json({
      success: true,
      message: 'Sub-department deleted successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// ==================== BATCHES ====================

// @route   POST /api/departments/:departmentId/batches
// @desc    Create batch under department (or sub-department)
// @access  Private
router.post('/:departmentId/batches', auth, async (req, res) => {
  try {
    const { 
      name, 
      code, 
      subDepartmentId, 
      academicYear, 
      classTeacherId, 
      maxStudents = null // No limit by default 
    } = req.body;
    const { departmentId } = req.params;

    if (!name || !code || !academicYear) {
      return res.status(400).json({
        success: false,
        message: 'Batch name, code, and academic year are required'
      });
    }

    // Verify department exists and check permissions
    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    const userId = req.user.id;
    const userRole = req.user.role;

    // Check permissions - simple like department/sub-department
    const canCreate = userRole === ROLES.ADMIN || 
                     userRole === ROLES.PRINCIPAL || 
                     (userRole === ROLES.HOD && department.hod?.toString() === userId);

    if (!canCreate) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create batches in this department'
      });
    }

    // Verify sub-department if provided
    if (subDepartmentId && subDepartmentId.toString().trim() !== '') {
      const subDepartment = await SubDepartment.findOne({
        _id: subDepartmentId,
        department: departmentId
      });
      if (!subDepartment) {
        return res.status(404).json({
          success: false,
          message: 'Sub-department not found in this department'
        });
      }
    }

    // Validate classTeacher if provided (optional, like HOD/coordinator)
    let validClassTeacherId = null;
    if (classTeacherId && classTeacherId.toString().trim() !== '') {
      const classTeacherExists = await User.findById(classTeacherId);
      if (!classTeacherExists) {
        return res.status(400).json({
          success: false,
          message: 'Invalid class teacher user ID'
        });
      }
      validClassTeacherId = classTeacherId;
    }

    // Prepare batch data - simple like department/sub-department
    const batchData = {
      name: name.trim(),
      code: code.toUpperCase().trim(),
      department: departmentId,
      academicYear: academicYear.trim(),
      maxStudents: maxStudents ? parseInt(maxStudents) : null // Optional, no limit if not provided
    };
    
    // Only add subDepartment if provided
    if (subDepartmentId && subDepartmentId.toString().trim() !== '') {
      batchData.subDepartment = subDepartmentId;
    }
    
    // Only add classTeacher if we have a valid ID
    if (validClassTeacherId) {
      batchData.classTeacher = validClassTeacherId;
    }

    const batch = await Batch.create(batchData);

    // Populate related data - with try-catch like department/sub-department
    // If populate fails, we continue without it - not critical for creation
    try {
      await batch.populate([
        { path: 'department', select: 'name code' },
        { path: 'subDepartment', select: 'name code' },
        { path: 'classTeacher', select: 'fullName email role' }
      ]);
    } catch (populateError) {
      console.warn('Failed to populate batch relations:', populateError.message);
      // Try individual populates as fallback
      try {
    await batch.populate('department', 'name code');
      } catch (e) {}
    if (batch.subDepartment) {
      try {
        await batch.populate('subDepartment', 'name code');
        } catch (e) {}
      }
      // Skip classTeacher populate if it fails - it's optional
    }

    // Calculate available seats (null = unlimited)
    const batchMaxStudents = batch.maxStudents;
    const batchCurrentStudents = batch.currentStudents || 0;
    const availableSeats = batchMaxStudents ? Math.max(0, batchMaxStudents - batchCurrentStudents) : null;

    res.status(201).json({
      success: true,
      message: 'Batch created successfully',
      batch: {
        id: batch._id,
        name: batch.name,
        code: batch.code,
        department: batch.department,
        subDepartment: batch.subDepartment || null,
        academicYear: batch.academicYear,
        classTeacher: batch.classTeacher || null,
        maxStudents: batch.maxStudents,
        currentStudents: batchCurrentStudents,
        currentStudentCount: batchCurrentStudents, // Alias for compatibility
        availableSeats: availableSeats,
        status: batch.status,
        isActive: batch.isActive,
        createdAt: batch.createdAt
      }
    });

  } catch (error) {
    console.error('Error creating batch:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Batch code already exists in this department/sub-department'
      });
    }
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while creating batch',
      error: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
    });
  }
});

// @route   GET /api/departments/batches
// @desc    Get all batches (optional: filter by department, sub-department, academic year)
// @access  Private
router.get('/batches', auth, async (req, res) => {
  try {
    const { departmentId, subDepartmentId, academicYear, status } = req.query;
    
    // Build query - don't filter by isActive/status by default to show all batches
    let query = {};
    
    // Only filter by status if explicitly provided
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (departmentId) {
      query.department = departmentId;
    }
    if (subDepartmentId) {
      query.subDepartment = subDepartmentId;
    }
    if (academicYear) {
      query.academicYear = academicYear;
    }

    const batches = await Batch.find(query)
      .populate('department', 'name code')
      .populate('subDepartment', 'name code')
      .populate('classTeacher', 'fullName email role')
      .sort({ academicYear: -1, name: 1 });
    
    console.log(`Found ${batches.length} batches with query:`, query);
    
    // Get counts for each batch
    const batchesWithCounts = await Promise.all(batches.map(async (batch) => {
      // Count all students in this batch (regardless of status)
      const currentStudentCount = await Student.countDocuments({ 
        batches: batch._id
      });
      
      return {
        id: batch._id,
        name: batch.name,
        code: batch.code,
        fullName: `${batch.name} (${batch.code})`,
        department: batch.department,
        subDepartment: batch.subDepartment || null,
        academicYear: batch.academicYear,
        classTeacher: batch.classTeacher || null,
        maxStudents: batch.maxStudents,
        currentStudents: currentStudentCount,
        currentStudentCount, // Alias for compatibility
        availableSeats: batch.maxStudents ? Math.max(0, batch.maxStudents - currentStudentCount) : null, // null = unlimited
        status: batch.status,
        isActive: batch.isActive,
        createdAt: batch.createdAt
      };
    }));

    console.log(`Returning ${batchesWithCounts.length} batches`);
    
    res.json({
      success: true,
      batches: batchesWithCounts
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/departments/:departmentId/batches
// @desc    Get batches of a specific department
// @access  Private
router.get('/:departmentId/batches', auth, async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { subDepartmentId, academicYear, status } = req.query;

    let query = { 
      department: departmentId
    };

    // Only filter by status if explicitly provided
    if (status && status !== 'all') {
      query.status = status;
    }

    if (subDepartmentId) {
      query.subDepartment = subDepartmentId;
    }

    if (academicYear) {
      query.academicYear = academicYear;
    }

    const batches = await Batch.find(query)
      .populate('department', 'name code')
      .populate('subDepartment', 'name code')
      .populate('classTeacher', 'fullName email role')
      .sort({ name: 1 });

    res.json({
      success: true,
      batches: batches.map(batch => ({
        id: batch._id,
        name: batch.name,
        code: batch.code,
        fullName: `${batch.name} (${batch.code})`,
        department: batch.department,
        subDepartment: batch.subDepartment,
        academicYear: batch.academicYear,
        classTeacher: batch.classTeacher,
        maxStudents: batch.maxStudents,
        currentStudents: batch.currentStudents || 0,
        currentStudentCount: batch.currentStudents || 0, // Alias for compatibility
        availableSeats: batch.maxStudents ? Math.max(0, batch.maxStudents - (batch.currentStudents || 0)) : null, // null = unlimited
        isFull: batch.maxStudents ? (batch.currentStudents || 0) >= batch.maxStudents : false, // Never full if unlimited
        status: batch.status,
        isActive: batch.isActive,
        createdAt: batch.createdAt
      }))
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/departments/:departmentId/batches/:id
// @desc    Update batch (Admin/Principal/HOD if own department/Coordinator if own sub-department/ClassTeacher if own batch)
// @access  Private
router.put('/:departmentId/batches/:id', auth, async (req, res) => {
  try {
    const { departmentId, id } = req.params;
    const { 
      name, 
      code, 
      academicYear, 
      currentSemester,
      subDepartmentId,
      classTeacherId, 
      maxStudents,
      status,
      schedule
    } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Verify department exists
    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    // Find the batch
    const batch = await Batch.findOne({ _id: id, department: departmentId })
      .populate('subDepartment');
    
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found in this department'
      });
    }

    // Check permissions
    let canEdit = userRole === ROLES.ADMIN || userRole === ROLES.PRINCIPAL;
    
    if (!canEdit && userRole === ROLES.HOD) {
      canEdit = department.hod?.toString() === userId;
    }
    
    if (!canEdit && userRole === ROLES.TEACHER) {
      // Coordinator of sub-department or class teacher of batch
      canEdit = (batch.subDepartment?.coordinator?.toString() === userId) ||
                (batch.classTeacher?.toString() === userId);
    }

    if (!canEdit) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to edit this batch'
      });
    }

    // Validate classTeacher if provided
    let validClassTeacherId = null;
    if (classTeacherId && classTeacherId.toString().trim() !== '') {
      const classTeacherExists = await User.findById(classTeacherId);
      if (!classTeacherExists) {
        return res.status(400).json({
          success: false,
          message: 'Invalid class teacher user ID'
        });
      }
      validClassTeacherId = classTeacherId;
    }

    // Validate sub-department if provided
    let validSubDepartmentId = null;
    console.log('Update batch - received subDepartmentId:', subDepartmentId, 'type:', typeof subDepartmentId);
    if (subDepartmentId !== undefined && subDepartmentId !== null && subDepartmentId.toString().trim() !== '') {
      const subDepartment = await SubDepartment.findOne({
        _id: subDepartmentId,
        department: departmentId
      });
      if (!subDepartment) {
        return res.status(400).json({
          success: false,
          message: 'Sub-department not found in this department'
        });
      }
      validSubDepartmentId = subDepartmentId;
      console.log('Update batch - validated subDepartmentId:', validSubDepartmentId);
    } else {
      console.log('Update batch - subDepartmentId is empty/null, will clear subDepartment');
    }

    // Prepare update data
    const updateData = {};
    if (name) updateData.name = name.trim();
    if (code) updateData.code = code.toUpperCase().trim();
    if (academicYear) updateData.academicYear = academicYear.trim();
    if (currentSemester !== undefined) updateData.currentSemester = parseInt(currentSemester) || 1;
    if (maxStudents !== undefined) {
      updateData.maxStudents = maxStudents ? parseInt(maxStudents) : null; // null = unlimited
    }
    if (status) updateData.status = status;
    if (schedule) updateData.schedule = schedule;
    
    // Handle subDepartment - always update if subDepartmentId is in request (even if empty/null)
    // Check if subDepartmentId is explicitly provided (including null to clear)
    if (subDepartmentId !== undefined) {
      if (validSubDepartmentId) {
        updateData.subDepartment = validSubDepartmentId;
        console.log('Update batch - setting subDepartment to:', validSubDepartmentId);
      } else {
        // Clear subDepartment by setting to null (when empty string, null, or invalid ID is sent)
        updateData.subDepartment = null;
        console.log('Update batch - clearing subDepartment (setting to null)');
      }
    } else {
      // If subDepartmentId is not in request at all, don't update it (preserve existing value)
      // This allows partial updates without affecting subDepartment
      console.log('Update batch - subDepartmentId not in request, preserving existing value');
    }
    
    // Handle classTeacher - only set if provided and not empty
    if (validClassTeacherId) {
      updateData.classTeacher = validClassTeacherId;
    } else if (classTeacherId === null || classTeacherId === '') {
      // Allow clearing classTeacher by setting to null
      updateData.classTeacher = null;
    }

    // Update batch
    const updatedBatch = await Batch.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    // Populate related data
    await updatedBatch.populate('department', 'name code');
    // Always try to populate subDepartment, even if null (to handle clearing)
      try {
      if (updatedBatch.subDepartment) {
        await updatedBatch.populate('subDepartment', 'name code');
      }
      } catch (populateError) {
        console.warn('Failed to populate subDepartment:', populateError.message);
    }
    if (updatedBatch.classTeacher) {
      try {
        await updatedBatch.populate('classTeacher', 'fullName email role');
      } catch (populateError) {
        console.warn('Failed to populate classTeacher:', populateError.message);
      }
    }

    res.json({
      success: true,
      message: 'Batch updated successfully',
      batch: {
        id: updatedBatch._id,
        name: updatedBatch.name,
        code: updatedBatch.code,
        fullName: `${updatedBatch.name} (${updatedBatch.code})`,
        department: updatedBatch.department,
        subDepartment: updatedBatch.subDepartment,
        academicYear: updatedBatch.academicYear,
        classTeacher: updatedBatch.classTeacher,
        maxStudents: updatedBatch.maxStudents,
        currentStudents: updatedBatch.currentStudents || 0,
        currentStudentCount: updatedBatch.currentStudents || 0, // Alias for compatibility
        availableSeats: Math.max(0, (updatedBatch.maxStudents || 0) - (updatedBatch.currentStudents || 0)),
        status: updatedBatch.status,
        schedule: updatedBatch.schedule,
        isActive: updatedBatch.isActive,
        updatedAt: updatedBatch.updatedAt
      }
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Batch code already exists in this department/sub-department'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   DELETE /api/departments/:departmentId/batches/:id
// @desc    Delete batch (Admin/Principal/HOD if own department/Coordinator if own sub-department)
// @access  Private
router.delete('/:departmentId/batches/:id', auth, async (req, res) => {
  try {
    const { departmentId, id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Verify department exists
    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    // Find the batch
    const batch = await Batch.findOne({ _id: id, department: departmentId })
      .populate('subDepartment');
    
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found in this department'
      });
    }

    // Check permissions (exclude class teacher from deletion)
    let canDelete = userRole === ROLES.ADMIN || userRole === ROLES.PRINCIPAL;
    
    if (!canDelete && userRole === ROLES.HOD) {
      canDelete = department.hod?.toString() === userId;
    }
    
    if (!canDelete && userRole === ROLES.TEACHER && batch.subDepartment) {
      canDelete = batch.subDepartment.coordinator?.toString() === userId;
    }

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this batch'
      });
    }

    // Check if batch has students (students have batches array)
    const Student = (await import('../models/Student.js')).default;
    const studentCount = await Student.countDocuments({ batches: id, isActive: true });
    
    if (studentCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete batch. It has ${studentCount} active students.`
      });
    }

    // Soft delete - mark as inactive
    await Batch.findByIdAndUpdate(id, { status: 'discontinued', isActive: false });

    res.json({
      success: true,
      message: 'Batch deleted successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/departments/structure
// @desc    Get complete department structure (departments -> sub-departments -> batches)
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

      // Get direct batches (no sub-department) - don't filter by status
      const directBatches = await Batch.find({
        department: dept._id,
        subDepartment: null
      })
        .populate('classTeacher', 'fullName email')
        .sort({ name: 1 });

      // Get batches for each sub-department - don't filter by status
      const subDepartmentsWithBatches = await Promise.all(subDepartments.map(async (subDept) => {
        const batches = await Batch.find({
          department: dept._id,
          subDepartment: subDept._id
        })
          .populate('classTeacher', 'fullName email')
          .sort({ name: 1 });

        // Debug logging for first sub-department
        if (subDept.code && batches.length > 0) {
          console.log(`📊 Sub-department ${subDept.name} (${subDept._id}): Found ${batches.length} batches`);
        }

        // Calculate student counts dynamically
        const batchesWithCounts = await Promise.all(batches.map(async (batch) => {
      const studentCount = await Student.countDocuments({ 
        batches: batch._id
      });
        return {
            id: batch._id,
            name: batch.name,
            code: batch.code,
            academicYear: batch.academicYear,
            classTeacher: batch.classTeacher,
            currentStudents: studentCount,
            currentStudentCount: studentCount, // Alias for compatibility
            maxStudents: batch.maxStudents,
            availableSeats: batch.maxStudents ? Math.max(0, batch.maxStudents - studentCount) : null // null = unlimited
          };
        }));

        return {
          id: subDept._id,
          name: subDept.name,
          code: subDept.code,
          coordinator: subDept.coordinator,
          batches: batchesWithCounts
        };
      }));

      return {
        id: dept._id,
        name: dept.name,
        code: dept.code,
        description: dept.description,
        hod: dept.hod,
        directBatches: await Promise.all(directBatches.map(async (batch) => {
      const studentCount = await Student.countDocuments({ 
        batches: batch._id
      });
          return {
          id: batch._id,
          name: batch.name,
          code: batch.code,
            fullName: `${batch.name} (${batch.code})`,
          academicYear: batch.academicYear,
          classTeacher: batch.classTeacher,
            currentStudents: studentCount,
            currentStudentCount: studentCount, // Alias for compatibility
          maxStudents: batch.maxStudents,
            availableSeats: batch.maxStudents ? Math.max(0, batch.maxStudents - studentCount) : null // null = unlimited
          };
        })),
        subDepartments: subDepartmentsWithBatches
      };
    }));

    res.json({
      success: true,
      structure
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