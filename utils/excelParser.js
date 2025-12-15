import XLSX from 'xlsx';

/**
 * Parse Excel file and convert to student data array
 * @param {Buffer} fileBuffer - Excel file buffer
 * @returns {Array} Array of student objects
 */
export const parseExcelToStudents = (fileBuffer) => {
  try {
    // Read the workbook
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    
    // Get the first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Positional rows (header + data) for fallback when headers are merged/blank
    const rowsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
    const headerRow = rowsArray[0] || [];
    const normHeader = headerRow.map(h => h?.toString()
      .replace(/\u00A0/g, ' ')
      .toLowerCase()
      .replace(/[\s\t\n\r]+/g, ' ')
      .trim()
    );
    
    // Log actual headers for debugging
    console.log('📋 Excel Headers Found:', headerRow.join(' | '));
    console.log('📋 Normalized Headers:', normHeader.join(' | '));
    
    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      raw: false, // Convert all to strings for consistency
      defval: '' // Default value for empty cells
    });
    
    if (!jsonData || jsonData.length === 0) {
      throw new Error('Excel file is empty or has no data');
    }
    
    // Log available columns for debugging (first row only)
    if (jsonData.length > 0) {
      const availableColumns = Object.keys(jsonData[0]);
      console.log('📊 Available Excel columns (from JSON):', availableColumns.join(', '));
      console.log('📊 First row sample values:', {
        firstCol: availableColumns[0] ? jsonData[0][availableColumns[0]] : 'N/A',
        secondCol: availableColumns[1] ? jsonData[0][availableColumns[1]] : 'N/A'
      });
    }
    
    // Map Excel columns to student data format
    // Expected Excel columns (case-insensitive matching with exact field names from user):
    const students = jsonData.map((row, index) => {
      // Helper function to normalize strings for comparison
      const normalize = (str) => {
        if (!str) return '';
        // Remove all whitespace (spaces, tabs, newlines) and special chars, convert to lowercase
        return str.toString()
          .replace(/\u00A0/g, ' ') // NBSP to space
          .toLowerCase()
          .replace(/[\s\t\n\r]+/g, ' ')  // Replace all whitespace with single space
          .replace(/[\/\_\-]/g, ' ')      // Replace slashes, underscores, hyphens with space
          .replace(/\s+/g, ' ')          // Collapse multiple spaces
          .trim();
      };
      
      // Also create a version that removes all spaces for flexible matching
      const normalizeNoSpaces = (str) => {
        if (!str) return '';
        return normalize(str).replace(/\s/g, '');
      };
      
      // Helper function to get value case-insensitively with flexible matching
      const getValue = (keys) => {
        const rowKeys = Object.keys(row);
        
        for (const searchKey of keys) {
          const normalizedSearch = normalize(searchKey);
          const normalizedSearchNoSpaces = normalizeNoSpaces(searchKey);
          
          // Try multiple matching strategies
          let foundKey = null;
          
          // Strategy 1: Exact normalized match (preserving spaces)
          foundKey = rowKeys.find(k => normalize(k) === normalizedSearch);
          
          // Strategy 2: Match without any spaces (for "D O B" vs "DOB")
          if (!foundKey) {
            foundKey = rowKeys.find(k => normalizeNoSpaces(k) === normalizedSearchNoSpaces);
          }
          
          // Strategy 3: One contains the other (normalized)
          if (!foundKey) {
            foundKey = rowKeys.find(k => {
              const normalizedK = normalize(k);
              const normalizedKNoSpaces = normalizeNoSpaces(k);
              return normalizedK.includes(normalizedSearch) || 
                     normalizedSearch.includes(normalizedK) ||
                     normalizedKNoSpaces.includes(normalizedSearchNoSpaces) ||
                     normalizedSearchNoSpaces.includes(normalizedKNoSpaces);
            });
          }
          
          // Strategy 4: Match key parts (for "Telephone / Mobile No")
          if (!foundKey && searchKey.includes('/')) {
            const parts = searchKey.split('/').map(p => normalize(p.trim()));
            foundKey = rowKeys.find(k => {
              const normalizedK = normalize(k);
              return parts.every(part => normalizedK.includes(part));
            });
          }
          
          if (foundKey) {
            const value = row[foundKey];
            // Return value even if it's an empty string (let validation handle required checks)
            // But skip if it's null or undefined
            if (value !== null && value !== undefined) {
              const strValue = value.toString().trim();
              // Return empty string if truly empty, but don't skip it
              return strValue;
            }
          }
        }
        return '';
      };
      
      // Helper to convert telephone from scientific notation
      const normalizeTelephoneValue = (val) => {
        if (!val || !val.toString().trim()) return '';
        const valStr = val.toString().trim();
        // Handle scientific notation (e.g., "9.79E+09" → "9790000000")
        if (valStr.includes('E+') || valStr.includes('e+')) {
          const num = parseFloat(valStr);
          if (!isNaN(num)) {
            return Math.round(num).toString();
          }
        }
        return valStr;
      };
      
      // Map Excel columns to student fields (matching user's exact field names)
      // Priority: exact match first, then variations
      const studentData = {
        admissionNo: getValue(['Admission no', 'admission no', 'admissionno', 'admission_no', 'admission number', 'Admission No', 'Adm No', 'Adm No.', 'Admission No.', 'adm no', 'adm no.', 'Admission No', 'Admission Number']),
        fullName: getValue(['Full Name', 'full name', 'fullname', 'full_name', 'name', 'Name', 'Name of the student', 'name of the student', 'name of student', 'student name', 'Student Name', 'Student name', 'FullName']),
        dateOfBirth: getValue(['D O B', 'd o b', 'DOB', 'dob', 'dateofbirth', 'date of birth', 'birthdate', 'Date of Birth']),
        // Age is calculated, not stored
        bloodGroup: getValue(['Blood Group', 'blood group', 'bloodgroup', 'blood_group', 'blood', 'Blood']),
        shaakha: getValue(['Shaakha', 'shaakha', 'shakha', 'veda']), // This will be used for department lookup
        departmentName: getValue(['Shaakha', 'shaakha', 'shakha', 'department', 'dept']), // Shaakha column maps to department name
        gothra: getValue(['Gothra', 'gothra', 'gotra']),
        telephone: normalizeTelephoneValue(getValue(['Telephone / Mobile No', 'telephone / mobile no', 'telephone/mobile no', 'telephone', 'mobile', 'phone', 'contact', 'Telephone', 'Telephone / Mobile No'])),
        fatherName: getValue(['Father Name', 'father name', 'fathername', 'father_name', 'father', 'Father']),
        motherName: getValue(['Mother Name', 'mother name', 'mothername', 'mother_name', 'mother', 'Mother']),
        occupation: getValue(['Occupation', 'occupation', 'Occupatio n']),
        nationality: getValue(['Nationality', 'nationality', 'Nationalit y']) || 'Indian',
        religion: getValue(['Religion', 'religion']) || 'Hindu',
        caste: getValue(['Caste', 'caste']),
        motherTongue: getValue(['Mother Tongue', 'mother tongue', 'mothertongue', 'mother_tongue']),
        presentAddress: getValue(['Present Address', 'present address', 'presentaddress', 'present_address', 'Address']),
        permanentAddress: getValue(['Permanent Address', 'permanent address', 'permanentaddress', 'permanent_address', 'Permanen t Address']),
        lastSchoolAttended: getValue(['Last School Attended', 'last school attended', 'lastschoolattended', 'last_school_attended']),
        lastStandardStudied: getValue(['Last Standard Studied', 'last standard studied', 'laststandardstudied', 'last_standard_studied']),
        tcDetails: getValue(['T C details', 't c details', 'TC details', 'tc details', 'tcdetails', 'tc_details', 'transfer certificate', 'TC details']),
        admittedToStandard: getValue(['Admitted to Standard', 'admitted to standard', 'admittedtostandard', 'admitted_to_standard']),
        dateOfAdmission: getValue(['Date of Admission', 'date of admission', 'dateofadmission', 'date_of_admission', 'doa', 'Date of Admissio n']),
        // Stay Duration is calculated, not stored
        currentStandard: getValue(['Current Standard', 'current standard', 'currentstandard', 'current_standard', 'standard']),
        remarks: getValue(['Remarks', 'remarks']),
        rowNumber: index + 2 // Excel row number (accounting for header)
      };
      
      // Fallback for sheets without headers (__EMPTY columns)
      const emptyKeys = Object.keys(row).filter(k => k.startsWith('__EMPTY')).sort();
      if (!studentData.admissionNo && emptyKeys.length > 0) {
        studentData.admissionNo = row[emptyKeys[0]]?.toString().trim() || '';
      }
      if (!studentData.fullName && emptyKeys.length > 1) {
        studentData.fullName = row[emptyKeys[1]]?.toString().trim() || '';
      }

      // Positional fallback using row arrays (helps with merged/blank headers)
      const arrayRow = rowsArray[index + 1] || [];
      const getByIndex = (idx) => {
        if (idx === undefined || idx === null) return '';
        return arrayRow[idx]?.toString().trim() || '';
      };

      const findCol = (keywords) => {
        for (let i = 0; i < normHeader.length; i++) {
          const h = normHeader[i];
          if (!h) continue;
          if (keywords.some(k => h.includes(k))) return i;
        }
        return null;
      };

      const idxAdmission = findCol(['admission', 'adm', 'admission no', 'adm no']);
      const idxName = findCol(['full name', 'name', 'name of the student', 'student name']);
      const idxDept = findCol(['department', 'dept', 'veda', 'shaakha', 'shakha']);
      const idxSub = findCol(['sub', 'sub department', 'shaakal', 'shakal', 'tait', 'kanva', 'madhy', 'ranaya', 'kauthu', 'shaun']);

      if (!studentData.admissionNo) {
        studentData.admissionNo = getByIndex(idxAdmission) || getByIndex(0);
      }
      if (!studentData.fullName) {
        studentData.fullName = getByIndex(idxName) || getByIndex(1);
      }
      if (!studentData.departmentName) {
        studentData.departmentName = getByIndex(idxDept) || getByIndex(5);
      }
      if (!studentData.shaakha) {
        studentData.shaakha = getByIndex(idxSub) || getByIndex(6);
      }
      
      // Debug: Log found values for first 3 rows to help diagnose issues
      if (index < 3) {
        console.log(`\n=== Row ${index + 1} Parsed Data ===`);
        console.log('Available columns:', Object.keys(row).join(', '));
        console.log('Normalized header:', normHeader.join(', '));
        console.log('Column indices - Admission:', idxAdmission, 'Name:', idxName);
        console.log('Parsed values:', {
          admissionNo: studentData.admissionNo || '(empty)',
          fullName: studentData.fullName || '(empty)',
          dateOfBirth: studentData.dateOfBirth || '(empty)',
          bloodGroup: studentData.bloodGroup || '(empty)',
          gothra: studentData.gothra || '(empty)',
          telephone: studentData.telephone || '(empty)',
          fatherName: studentData.fatherName || '(empty)',
          occupation: studentData.occupation || '(empty)',
          admittedToStandard: studentData.admittedToStandard || '(empty)',
          dateOfAdmission: studentData.dateOfAdmission || '(empty)',
          presentAddress: studentData.presentAddress || '(empty)'
        });
        console.log('Raw row data (first 5 columns):', arrayRow.slice(0, 5));
      }
      
      // Validate required fields (department is optional - can be empty)
      const requiredFields = ['admissionNo', 'fullName'];
      
      const missingFields = requiredFields.filter(field => !studentData[field] || studentData[field].trim() === '');
      
      if (missingFields.length > 0) {
        // Show which columns were actually found in the Excel file
        const availableColumns = Object.keys(row).join(', ');
        console.log(`Row ${index + 1} Debug:`, {
          admissionNo: studentData.admissionNo,
          fullName: studentData.fullName,
          departmentName: studentData.departmentName,
          availableColumns,
          arrayRow: arrayRow.slice(0, 7)
        });
        studentData._error = `Missing required fields: ${missingFields.join(', ')}. Available columns in Excel: ${availableColumns}`;
      }
      
      return studentData;
    });
    
    return students;
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
};

/**
 * Validate student data format
 * @param {Object} studentData - Student data object
 * @returns {Object} Validation result with isValid and errors
 */
export const validateStudentData = (studentData) => {
  const errors = [];
  
  // Minimal required fields
  if (!studentData.admissionNo) errors.push('Admission number is required');
  if (!studentData.fullName) errors.push('Full name is required');
  
  // Format validation
  const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  if (studentData.bloodGroup && !bloodGroups.includes(studentData.bloodGroup)) {
    errors.push(`Invalid blood group. Must be one of: ${bloodGroups.join(', ')}`);
  }
  
  // Date validation - more flexible to handle month-year formats
  const parseDateForValidation = (dateString) => {
    if (!dateString || !dateString.toString().trim()) return null;
    
    const dateStr = dateString.toString().trim();
    
    // Handle month-year formats like "Jan-22", "Feb-22", "January-2022"
    const monthYearMatch = dateStr.match(/^([A-Za-z]+)-(\d{2,4})$/i);
    if (monthYearMatch) {
      const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                         'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const monthName = monthYearMatch[1].toLowerCase().substring(0, 3);
      const monthIndex = monthNames.indexOf(monthName);
      if (monthIndex !== -1) {
        return new Date(); // Valid month-year format
      }
    }
    
    // Handle DD/MM/YYYY or DD-MM-YYYY
    if (dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)) {
      return new Date(); // Valid format
    }
    
    // Handle YYYY-MM-DD format
    if (dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)) {
      return new Date(); // Valid format
    }
    
    // Try standard Date parsing
    const parsedDate = new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
    
    return null;
  };
  
  if (studentData.dateOfBirth) {
    const dob = parseDateForValidation(studentData.dateOfBirth);
    if (!dob) {
      errors.push('Invalid date of birth format (expected: DD/MM/YYYY, YYYY-MM-DD, or Month-YY like Jan-22)');
    }
  }
  
  if (studentData.dateOfAdmission) {
    const doa = parseDateForValidation(studentData.dateOfAdmission);
    if (!doa) {
      errors.push('Invalid date of admission format (expected: DD/MM/YYYY, YYYY-MM-DD, or Month-YY like Jan-22)');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

