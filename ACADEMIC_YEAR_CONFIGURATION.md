# Academic Year Configuration Guide

## Overview

The academic year start date is now **fully configurable**. You can set it to any date you want (e.g., April 5, May 20, etc.) instead of the default April 1st.

## How to Configure

### Method 1: Admin UI (Recommended)

1. **Login as Admin or Principal**
2. **Go to Dashboard** → Click **"Academic Year Settings"**
3. **Select Start Month** (e.g., April, May)
4. **Select Start Day** (e.g., 5, 20)
5. **Click "Save Configuration"**

Changes take effect **immediately** and are saved to the database.

### Method 2: Environment Variables

Add to your `.env` file:

```env
# Academic Year Start Configuration
ACADEMIC_YEAR_START_MONTH=3    # 0=January, 3=April, 4=May, etc.
ACADEMIC_YEAR_START_DAY=5      # Day of month (1-31)
```

**Examples:**
- April 5: `ACADEMIC_YEAR_START_MONTH=3` and `ACADEMIC_YEAR_START_DAY=5`
- May 20: `ACADEMIC_YEAR_START_MONTH=4` and `ACADEMIC_YEAR_START_DAY=20`
- April 1 (default): `ACADEMIC_YEAR_START_MONTH=3` and `ACADEMIC_YEAR_START_DAY=1`

**Note:** Environment variables have highest priority. If set, they override database settings.

### Method 3: API (For Programmatic Access)

```bash
# Get current configuration
GET /api/system-settings/academic-year-config

# Update configuration (Admin/Principal only)
PUT /api/system-settings/academic-year-config
Body: {
  "startMonth": 3,  // 0-11 (0=January, 3=April, 4=May)
  "startDay": 5      // 1-31
}
```

## Month Reference

| Month | Value | Example |
|-------|-------|---------|
| January | 0 | `ACADEMIC_YEAR_START_MONTH=0` |
| February | 1 | `ACADEMIC_YEAR_START_MONTH=1` |
| March | 2 | `ACADEMIC_YEAR_START_MONTH=2` |
| **April** | **3** | **`ACADEMIC_YEAR_START_MONTH=3`** (default) |
| **May** | **4** | **`ACADEMIC_YEAR_START_MONTH=4`** |
| June | 5 | `ACADEMIC_YEAR_START_MONTH=5` |
| July | 6 | `ACADEMIC_YEAR_START_MONTH=6` |
| August | 7 | `ACADEMIC_YEAR_START_MONTH=7` |
| September | 8 | `ACADEMIC_YEAR_START_MONTH=8` |
| October | 9 | `ACADEMIC_YEAR_START_MONTH=9` |
| November | 10 | `ACADEMIC_YEAR_START_MONTH=10` |
| December | 11 | `ACADEMIC_YEAR_START_MONTH=11` |

## Examples

### Example 1: April 5th Start

**Configuration:**
- Month: April (3)
- Day: 5

**Result:**
- Academic year 2025-2026 runs from: **April 5, 2025 to April 4, 2026**
- Academic year 2026-2027 starts on: **April 5, 2026**

### Example 2: May 20th Start

**Configuration:**
- Month: May (4)
- Day: 20

**Result:**
- Academic year 2025-2026 runs from: **May 20, 2025 to May 19, 2026**
- Academic year 2026-2027 starts on: **May 20, 2026**

### Example 3: June 1st Start

**Configuration:**
- Month: June (5)
- Day: 1

**Result:**
- Academic year 2025-2026 runs from: **June 1, 2025 to May 31, 2026**
- Academic year 2026-2027 starts on: **June 1, 2026**

## How Switching Works

The system automatically switches academic years based on the configured start date:

1. **Before Start Date**: Previous academic year is current
2. **On/After Start Date**: New academic year becomes current

**Example with April 5:**
- **April 4, 2026**: Still in 2025-2026
- **April 5, 2026**: Automatically switches to 2026-2027 ✅
- **April 6, 2026**: 2026-2027 is current

## Priority Order

The system checks configuration in this order:

1. **Environment Variables** (highest priority)
2. **Database Settings** (saved via Admin UI)
3. **Default** (April 1st)

## Verification

After setting the configuration, verify it:

```bash
# Check current configuration
curl http://localhost:5001/api/system-settings/academic-year-config

# Check current academic year
curl http://localhost:5001/api/academic-year/current
```

## Important Notes

- ✅ **Changes take effect immediately** (no server restart needed)
- ✅ **Settings persist** across server restarts (saved to database)
- ✅ **Automatic switching** happens on the configured date
- ✅ **Previous years' data** remains accessible via "Show All Years"
- ✅ **New records** automatically use current academic year

## Troubleshooting

**Q: Changes not taking effect?**
- Check if environment variables are set (they override database)
- Clear browser cache and reload
- Restart backend server if using environment variables

**Q: Invalid date error?**
- Make sure the day is valid for the selected month (e.g., don't select Feb 30)
- The system validates dates before saving

**Q: Want to revert to default?**
- Set to April 1: Month = 3 (April), Day = 1
- Or remove environment variables and database settings
