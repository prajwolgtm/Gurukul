import express from 'express';
import multer from 'multer';
import { auth } from '../middleware/auth.js';
import { permit } from '../middleware/rbac.js';
import { ROLES } from '../utils/roles.js';
import { parseExcelToStudents, validateStudentData } from '../utils/excelParser.js';
import Student from '../models/Student.js';
import Department from '../models/Department.js';
import Batch from '../models/Batch.js';
import SubDepartment from '../models/SubDepartment.js';
import { resolveDepartmentAndSub } from '../utils/departmentResolver.js';

const router = express.Router();

// Configure multer for Excel files
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept Excel files
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.endsWith('.xlsx') ||
      file.originalname.endsWith('.xls')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'), false);
    }
  }
});

// Configure multer for image files
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit for images
  },
  fileFilter: (req, file, cb) => {
    // Accept image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// @route   POST /api/upload/students/excel
// @desc    Upload Excel file and bulk create students
// @access  Private (Admin/Principal only)
router.post('/students/excel', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL), excelUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an Excel file'
      });
    }

    // Parse Excel file
    let studentsData;
    try {
      studentsData = parseExcelToStudents(req.file.buffer);
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        message: parseError.message
      });
    }

    if (!studentsData || studentsData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No student data found in Excel file'
      });
    }

    // Preload departments and subdepartments for resolver
    const [departments, subDepartments] = await Promise.all([
      Department.find({ isActive: true }).lean(),
      SubDepartment.find({ isActive: true }).lean()
    ]);

    const results = {
      successful: [],
      failed: [],
      totalProcessed: studentsData.length
    };

    // Process each student
    for (let i = 0; i < studentsData.length; i++) {
      const studentData = studentsData[i];
      
      try {
        // Check if student data has parsing errors
        if (studentData._error) {
          results.failed.push({
            rowNumber: studentData.rowNumber || i + 1,
            admissionNo: studentData.admissionNo || 'N/A',
            fullName: studentData.fullName || 'N/A',
            errors: [studentData._error]
          });
          continue;
        }
        
        // Validate student data
        const validation = validateStudentData(studentData);
        if (!validation.isValid) {
          results.failed.push({
            rowNumber: studentData.rowNumber || i + 1,
            admissionNo: studentData.admissionNo || 'N/A',
            fullName: studentData.fullName || 'N/A',
            errors: validation.errors
          });
          continue;
        }

        // Check if student already exists
        const existingStudent = await Student.findOne({ admissionNo: studentData.admissionNo });
        if (existingStudent) {
          results.failed.push({
            rowNumber: studentData.rowNumber || i + 1,
            admissionNo: studentData.admissionNo,
            fullName: studentData.fullName,
            errors: ['Student already exists with this admission number']
          });
          continue;
        }

        // Resolve department and sub-department using fuzzy mapping
        const { department, subDepartment } = resolveDepartmentAndSub(
          departments,
          subDepartments,
          [studentData.departmentName, studentData.shaakha]
        );

        const departmentId = department?._id || null;
        const subDepartmentId = subDepartment?._id || null;
        
        // Debug logging for first few rows
        if (i < 3) {
          console.log(`Row ${i + 1} Department Resolution:`, {
            departmentName: studentData.departmentName,
            shaakha: studentData.shaakha,
            resolvedDepartment: department?.name || 'NOT FOUND',
            resolvedSubDepartment: subDepartment?.name || 'NOT FOUND',
            departmentId: departmentId ? 'FOUND' : 'MISSING'
          });
        }

        // Validate batches if provided (only if department exists)
        let validatedBatches = [];
        if (studentData.batchIds && Array.isArray(studentData.batchIds) && studentData.batchIds.length > 0) {
          if (!departmentId) {
            // Skip batch validation if no department
            validatedBatches = [];
          } else {
            const batches = await Batch.find({ 
              _id: { $in: studentData.batchIds },
              department: departmentId,
              isActive: true 
            });
            
            if (batches.length !== studentData.batchIds.length) {
              results.failed.push({
                rowNumber: studentData.rowNumber || i + 1,
                admissionNo: studentData.admissionNo,
                fullName: studentData.fullName,
                errors: ['One or more batch IDs are invalid']
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
        }

        // Parse dates with flexible format handling
        const parseDate = (dateString) => {
          if (!dateString || !dateString.toString().trim()) return null;
          
          const dateStr = dateString.toString().trim();
          
          // Handle DD/MM/YY (2-digit year) - assume 20xx for years 00-50, 19xx for 51-99
          const ddmmyyMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
          if (ddmmyyMatch) {
            const day = parseInt(ddmmyyMatch[1]);
            const month = parseInt(ddmmyyMatch[2]) - 1; // Month is 0-indexed
            const year2 = parseInt(ddmmyyMatch[3]);
            const fullYear = year2 <= 50 ? 2000 + year2 : 1900 + year2;
            return new Date(fullYear, month, day);
          }
          
          // Handle DD/MM/YYYY or DD-MM-YYYY
          const ddmmyyyyMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
          if (ddmmyyyyMatch) {
            const day = parseInt(ddmmyyyyMatch[1]);
            const month = parseInt(ddmmyyyyMatch[2]) - 1; // Month is 0-indexed
            const year = parseInt(ddmmyyyyMatch[3]);
            return new Date(year, month, day);
          }
          
          // Handle month-year formats like "Jan-22", "Feb-22", "January-2022"
          const monthYearMatch = dateStr.match(/^([A-Za-z]+)-(\d{2,4})$/i);
          if (monthYearMatch) {
            const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                               'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            const monthName = monthYearMatch[1].toLowerCase().substring(0, 3);
            const year = monthYearMatch[2];
            const monthIndex = monthNames.indexOf(monthName);
            
            if (monthIndex !== -1) {
              // Convert 2-digit year to 4-digit (assume 20xx for years 00-99)
              const fullYear = year.length === 2 ? `20${year}` : year;
              // Set to first day of the month
              return new Date(parseInt(fullYear), monthIndex, 1);
            }
          }
          
          // Handle YYYY-MM-DD format
          const yyyymmddMatch = dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
          if (yyyymmddMatch) {
            const year = parseInt(yyyymmddMatch[1]);
            const month = parseInt(yyyymmddMatch[2]) - 1; // Month is 0-indexed
            const day = parseInt(yyyymmddMatch[3]);
            return new Date(year, month, day);
          }
          
          // Try standard Date parsing
          const parsedDate = new Date(dateStr);
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate;
          }
          
          return null;
        };
        
        // Normalize blood group (remove "ve" suffix, handle variations)
        const normalizeBloodGroup = (bg) => {
          if (!bg || !bg.toString().trim()) return undefined;
          const normalized = bg.toString().trim().toUpperCase()
            .replace(/VE$/i, '')  // Remove "ve" suffix
            .replace(/\s+/g, ''); // Remove spaces
          const validGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
          return validGroups.includes(normalized) ? normalized : undefined;
        };
        
        const dateOfBirth = parseDate(studentData.dateOfBirth);
        const dateOfAdmission = parseDate(studentData.dateOfAdmission);
        const normalizedBloodGroup = normalizeBloodGroup(studentData.bloodGroup);

        // Create student
        // Note: shaakha field is optional since it's mapped to department in Excel
        const shaakhaValue = studentData.shaakha || studentData.departmentName || '';
        
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
        
        const normalizedTelephone = normalizeTelephone(studentData.telephone);

        // Prepare student data - handle null department and required fields
        const studentPayload = {
          admissionNo: studentData.admissionNo,
          fullName: studentData.fullName,
          dateOfBirth: dateOfBirth || new Date(), // Default to today if missing
          bloodGroup: normalizedBloodGroup,
          gender: studentData.gender || 'Male', // Default gender (can be updated later)
          shaakha: shaakhaValue,
          gothra: studentData.gothra || '',
          phone: normalizedTelephone,
          address: studentData.presentAddress || '', // Keep for backward compatibility
          presentAddress: studentData.presentAddress || '',
          permanentAddress: studentData.permanentAddress || studentData.presentAddress || '',
          fatherName: studentData.fatherName || 'N/A', // Required field - use default
          motherName: studentData.motherName || 'N/A', // Required field - use default
          occupation: studentData.occupation || '',
          guardianPhone: normalizedTelephone || '0000000000', // Required field - use default
          guardianEmail: studentData.guardianEmail || '',
          department: departmentId, // Must be ObjectId or undefined
          subDepartments: subDepartmentId ? [subDepartmentId] : [],
          batches: Array.isArray(validatedBatches) ? validatedBatches.map(b => b.batch).filter(Boolean) : [],
          admittedToStandard: studentData.admittedToStandard || '',
          currentStandard: studentData.currentStandard || studentData.admittedToStandard || '',
          dateOfAdmission: dateOfAdmission || new Date(), // Default to today if missing
          lastSchoolAttended: studentData.lastSchoolAttended || '',
          lastStandardStudied: studentData.lastStandardStudied || '',
          tcDetails: studentData.tcDetails || '',
          remarks: studentData.remarks || '',
          nationality: studentData.nationality || 'Indian',
          religion: studentData.religion || 'Hindu',
          caste: studentData.caste || '',
          motherTongue: studentData.motherTongue || ''
        };
        
        // Only set department if resolved, otherwise skip it (will fail validation but that's expected)
        if (!departmentId) {
          results.failed.push({
            rowNumber: studentData.rowNumber || i + 1,
            admissionNo: studentData.admissionNo,
            fullName: studentData.fullName,
            errors: [`Department not found: ${studentData.departmentName || studentData.shaakha || 'N/A'}`]
          });
          continue;
        }
        
        // Create student with validation disabled so empty fields are allowed per requirement
        const newStudent = new Student(studentPayload);
        await newStudent.save({ validateBeforeSave: false });

        results.successful.push({
          rowNumber: studentData.rowNumber || i + 1,
          admissionNo: newStudent.admissionNo,
          fullName: newStudent.fullName,
          id: newStudent._id
        });

      } catch (error) {
        console.error(`Error processing row ${studentData.rowNumber || i + 1}:`, error.message);
        console.error('Student data:', {
          admissionNo: studentData.admissionNo,
          fullName: studentData.fullName,
          dateOfBirth: studentData.dateOfBirth,
          bloodGroup: studentData.bloodGroup
        });
        
        results.failed.push({
          rowNumber: studentData.rowNumber || i + 1,
          admissionNo: studentData.admissionNo || 'N/A',
          fullName: studentData.fullName || 'N/A',
          errors: [error.message || 'Unknown error occurred']
        });
      }
    }

    res.json({
      success: true,
      message: `Excel upload completed. ${results.successful.length} successful, ${results.failed.length} failed.`,
      results
    });

  } catch (error) {
    console.error('Excel upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during Excel upload',
      error: error.message
    });
  }
});

// @route   POST /api/upload/image
// @desc    Upload image (ready for Cloudinary integration)
// @access  Private
router.post('/image', auth, imageUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an image file'
      });
    }

    // TODO: Integrate Cloudinary here
    // For now, return a placeholder URL structure
    // When Cloudinary is integrated, replace this with actual upload
    
    // Example Cloudinary upload code (to be implemented):
    // const cloudinary = require('cloudinary').v2;
    // const result = await cloudinary.uploader.upload_stream(
    //   { folder: 'gurukul/students' },
    //   (error, result) => {
    //     if (error) throw error;
    //     return result.secure_url;
    //   }
    // );
    // require('streamifier').createReadStream(req.file.buffer).pipe(result);

    // Temporary: Return file info (replace with Cloudinary URL later)
    const imageUrl = `placeholder_url_${Date.now()}_${req.file.originalname}`;
    
    res.json({
      success: true,
      message: 'Image uploaded successfully',
      imageUrl,
      // TODO: Replace with actual Cloudinary URL
      // cloudinaryUrl: result.secure_url,
      // publicId: result.public_id
    });

  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message
    });
  }
});

export default router;

