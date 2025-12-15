import express from 'express';
import { auth } from '../middleware/auth.js';
import { permit } from '../middleware/rbac.js';
import { ROLES } from '../utils/roles.js';
import {
  getCurrentAcademicYear,
  getAcademicYearList,
  isValidAcademicYear,
  getAcademicYearDates,
  getAcademicYearStartConfigSync
} from '../utils/academicYear.js';

const router = express.Router();

// GET /api/academic-year/current - Get current academic year (public endpoint)
router.get('/current', async (req, res) => {
  try {
    const currentYear = getCurrentAcademicYear();
    const config = getAcademicYearStartConfigSync();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    res.json({
      success: true,
      data: {
        academicYear: currentYear,
        label: `${currentYear} (Current)`,
        isCurrent: true,
        startDate: `${config.day} ${monthNames[config.month]}`,
        startMonth: config.month,
        startDay: config.day
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get current academic year',
      error: error.message
    });
  }
});

// GET /api/academic-year/list - Get list of academic years (public endpoint)
router.get('/list', async (req, res) => {
  try {
    const { yearsBack = 5, yearsForward = 2 } = req.query;
    const years = getAcademicYearList(
      parseInt(yearsBack),
      parseInt(yearsForward)
    );
    
    res.json({
      success: true,
      data: years
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get academic year list',
      error: error.message
    });
  }
});

// GET /api/academic-year/:year/validate - Validate academic year format (public endpoint)
router.get('/:year/validate', async (req, res) => {
  try {
    const { year } = req.params;
    const isValid = isValidAcademicYear(year);
    
    if (isValid) {
      const dates = getAcademicYearDates(year);
      res.json({
        success: true,
        data: {
          isValid: true,
          academicYear: year,
          startDate: dates.start,
          endDate: dates.end
        }
      });
    } else {
      res.status(400).json({
        success: false,
        data: {
          isValid: false,
          message: 'Invalid academic year format. Expected format: YYYY-YYYY (e.g., 2025-2026)'
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to validate academic year',
      error: error.message
    });
  }
});

export default router;
