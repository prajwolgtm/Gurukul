/**
 * Academic Year Utility Functions
 * Academic year runs from configurable start date (default: April 1) to end date
 * Can be configured via environment variables, system settings, or API
 */

// Default academic year start (can be overridden)
const DEFAULT_START_MONTH = 3; // April (0-indexed: 0=Jan, 3=Apr)
const DEFAULT_START_DAY = 1;   // 1st day of month

// Cache for system settings (to avoid repeated DB calls)
let cachedConfig = null;
let configCacheTime = null;
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get academic year start configuration
 * Checks in order: 1) Environment variables, 2) System settings (DB), 3) Defaults
 * Format: { month: 0-11, day: 1-31 }
 * 
 * Note: This is the async version that can check database
 * For synchronous calls, use getAcademicYearStartConfigSync()
 */
export const getAcademicYearStartConfig = async () => {
  // Check environment variables first (highest priority)
  const envMonth = process.env.ACADEMIC_YEAR_START_MONTH;
  const envDay = process.env.ACADEMIC_YEAR_START_DAY;
  
  if (envMonth !== undefined && envDay !== undefined) {
    const parsedMonth = parseInt(envMonth);
    const parsedDay = parseInt(envDay);
    if (!isNaN(parsedMonth) && parsedMonth >= 0 && parsedMonth <= 11 &&
        !isNaN(parsedDay) && parsedDay >= 1 && parsedDay <= 31) {
      return { month: parsedMonth, day: parsedDay };
    }
  }
  
  // Check cache (if available and not expired)
  const now = Date.now();
  if (cachedConfig && configCacheTime && (now - configCacheTime) < CONFIG_CACHE_TTL) {
    return cachedConfig;
  }
  
  // Try to load from database (if mongoose is available)
  let month = DEFAULT_START_MONTH;
  let day = DEFAULT_START_DAY;
  
  try {
    // Dynamic import to avoid circular dependencies
    const SystemSettings = (await import('../models/SystemSettings.js')).default;
    const dbMonth = await SystemSettings.getSetting('academicYearStartMonth');
    const dbDay = await SystemSettings.getSetting('academicYearStartDay');
    
    if (dbMonth !== null && dbMonth >= 0 && dbMonth <= 11) {
      month = dbMonth;
    }
    if (dbDay !== null && dbDay >= 1 && dbDay <= 31) {
      day = dbDay;
    }
  } catch (error) {
    // If DB not available or model not loaded, use defaults
    // This is fine for initial startup
  }
  
  // Cache the result
  cachedConfig = { month, day };
  configCacheTime = now;
  
  return { month, day };
};

/**
 * Synchronous version (for cases where async is not possible)
 * Uses cached config or defaults
 */
export const getAcademicYearStartConfigSync = () => {
  // Check environment variables first
  const envMonth = process.env.ACADEMIC_YEAR_START_MONTH;
  const envDay = process.env.ACADEMIC_YEAR_START_DAY;
  
  if (envMonth !== undefined && envDay !== undefined) {
    const parsedMonth = parseInt(envMonth);
    const parsedDay = parseInt(envDay);
    if (!isNaN(parsedMonth) && parsedMonth >= 0 && parsedMonth <= 11 &&
        !isNaN(parsedDay) && parsedDay >= 1 && parsedDay <= 31) {
      return { month: parsedMonth, day: parsedDay };
    }
  }
  
  // Use cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }
  
  // Fallback to defaults
  return { month: DEFAULT_START_MONTH, day: DEFAULT_START_DAY };
};

/**
 * Clear config cache (call after updating settings)
 */
export const clearAcademicYearConfigCache = () => {
  cachedConfig = null;
  configCacheTime = null;
};

/**
 * Get current academic year based on current date and configurable start date
 * Format: YYYY-YYYY (e.g., "2025-2026")
 * Academic year starts on configured date (default: April 1)
 * Uses synchronous version for compatibility
 */
export const getCurrentAcademicYear = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11 (0 = January)
  const currentDay = now.getDate(); // 1-31
  
  const { month: startMonth, day: startDay } = getAcademicYearStartConfigSync();
  
  // Compare current date with academic year start date
  // If current date is on or after the start date, current academic year starts this year
  // If current date is before the start date, current academic year started last year
  if (currentMonth > startMonth || (currentMonth === startMonth && currentDay >= startDay)) {
    // Current date is on or after the start date
    return `${currentYear}-${currentYear + 1}`;
  } else {
    // Current date is before the start date
    return `${currentYear - 1}-${currentYear}`;
  }
};

/**
 * Get academic year from a date
 * @param {Date} date - The date to get academic year for
 * @returns {string} Academic year in format YYYY-YYYY
 */
export const getAcademicYearFromDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-11
  const day = d.getDate(); // 1-31
  
  const { month: startMonth, day: startDay } = getAcademicYearStartConfigSync();
  
  if (month > startMonth || (month === startMonth && day >= startDay)) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
};

/**
 * Get list of academic years (for dropdowns)
 * @param {number} yearsBack - How many years back to include
 * @param {number} yearsForward - How many years forward to include
 * @returns {Array<{value: string, label: string}>}
 */
export const getAcademicYearList = (yearsBack = 5, yearsForward = 2) => {
  const currentYear = getCurrentAcademicYear();
  const [startYear] = currentYear.split('-').map(Number);
  const years = [];
  
  // Years back
  for (let i = yearsBack; i >= 1; i--) {
    const year = startYear - i;
    const yearStr = `${year}-${year + 1}`;
    years.push({
      value: yearStr,
      label: yearStr,
      isCurrent: false,
      isPast: true
    });
  }
  
  // Current year
  years.push({
    value: currentYear,
    label: `${currentYear} (Current)`,
    isCurrent: true,
    isPast: false
  });
  
  // Years forward
  for (let i = 1; i <= yearsForward; i++) {
    const year = startYear + i;
    const yearStr = `${year}-${year + 1}`;
    years.push({
      value: yearStr,
      label: yearStr,
      isCurrent: false,
      isPast: false
    });
  }
  
  return years;
};

/**
 * Validate academic year format
 * @param {string} academicYear - Academic year string
 * @returns {boolean}
 */
export const isValidAcademicYear = (academicYear) => {
  if (!academicYear || typeof academicYear !== 'string') return false;
  const pattern = /^\d{4}-\d{4}$/;
  if (!pattern.test(academicYear)) return false;
  
  const [start, end] = academicYear.split('-').map(Number);
  return end === start + 1;
};

/**
 * Get academic year start and end dates
 * @param {string} academicYear - Academic year in format YYYY-YYYY
 * @returns {{start: Date, end: Date}}
 */
export const getAcademicYearDates = (academicYear) => {
  if (!isValidAcademicYear(academicYear)) {
    throw new Error('Invalid academic year format');
  }
  
  const [startYear] = academicYear.split('-').map(Number);
  const { month: startMonth, day: startDay } = getAcademicYearStartConfigSync();
  
  // Start date: configured month and day of start year
  const start = new Date(startYear, startMonth, startDay, 0, 0, 0, 0);
  
  // End date: day before the start date of next academic year
  const end = new Date(startYear + 1, startMonth, startDay, 23, 59, 59, 999);
  end.setDate(end.getDate() - 1); // One day before next year starts
  
  return { start, end };
};

/**
 * Check if a date falls within an academic year
 * @param {Date} date - Date to check
 * @param {string} academicYear - Academic year in format YYYY-YYYY
 * @returns {boolean}
 */
export const isDateInAcademicYear = (date, academicYear) => {
  const { start, end } = getAcademicYearDates(academicYear);
  const d = new Date(date);
  return d >= start && d <= end;
};
