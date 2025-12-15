import express from 'express';
import { auth } from '../middleware/auth.js';
import { permit } from '../middleware/rbac.js';
import { ROLES } from '../utils/roles.js';
import SystemSettings from '../models/SystemSettings.js';
import { getAcademicYearStartConfigSync, getCurrentAcademicYear, clearAcademicYearConfigCache } from '../utils/academicYear.js';

const router = express.Router();

// GET /api/system-settings/academic-year-config - Get academic year start configuration
router.get('/academic-year-config', auth, async (req, res) => {
  try {
    const config = getAcademicYearStartConfigSync();
    const currentYear = getCurrentAcademicYear();
    
    // Convert month number to name
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    res.json({
      success: true,
      data: {
        startMonth: config.month,
        startDay: config.day,
        startMonthName: monthNames[config.month],
        startDate: `${config.day} ${monthNames[config.month]}`,
        currentAcademicYear: currentYear,
        source: process.env.ACADEMIC_YEAR_START_MONTH ? 'environment' : 'default'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get academic year configuration',
      error: error.message
    });
  }
});

// PUT /api/system-settings/academic-year-config - Update academic year start configuration (Admin only)
router.put('/academic-year-config', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const { startMonth, startDay } = req.body;
    
    // Validate month (0-11)
    if (startMonth === undefined || startMonth < 0 || startMonth > 11) {
      return res.status(400).json({
        success: false,
        message: 'Start month must be between 0 (January) and 11 (December)'
      });
    }
    
    // Validate day (1-31)
    if (startDay === undefined || startDay < 1 || startDay > 31) {
      return res.status(400).json({
        success: false,
        message: 'Start day must be between 1 and 31'
      });
    }
    
    // Validate date is valid (e.g., Feb 30 is invalid)
    const testDate = new Date(2025, startMonth, startDay);
    if (testDate.getMonth() !== startMonth || testDate.getDate() !== startDay) {
      return res.status(400).json({
        success: false,
        message: `Invalid date: ${startDay}/${startMonth + 1} is not a valid date`
      });
    }
    
    // Save to database (for persistence across restarts)
    await SystemSettings.setSetting(
      'academicYearStartMonth',
      startMonth,
      'Academic year start month (0=January, 11=December)',
      req.user.id
    );
    
    await SystemSettings.setSetting(
      'academicYearStartDay',
      startDay,
      'Academic year start day (1-31)',
      req.user.id
    );
    
    // Also update environment variables (for current session)
    // Note: This won't persist after server restart unless saved to .env file
    process.env.ACADEMIC_YEAR_START_MONTH = startMonth.toString();
    process.env.ACADEMIC_YEAR_START_DAY = startDay.toString();
    
    // Clear cache so new config is used immediately
    clearAcademicYearConfigCache();
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    res.json({
      success: true,
      message: `Academic year start date updated to ${startDay} ${monthNames[startMonth]}`,
      data: {
        startMonth,
        startDay,
        startMonthName: monthNames[startMonth],
        startDate: `${startDay} ${monthNames[startMonth]}`,
        currentAcademicYear: getCurrentAcademicYear(),
        note: 'Changes take effect immediately. Settings are saved to database and will persist across server restarts.'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update academic year configuration',
      error: error.message
    });
  }
});

// GET /api/system-settings - Get all system settings (Admin only)
router.get('/', auth, permit(ROLES.ADMIN, ROLES.PRINCIPAL), async (req, res) => {
  try {
    const settings = await SystemSettings.find().sort({ category: 1, key: 1 });
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get system settings',
      error: error.message
    });
  }
});

export default router;
