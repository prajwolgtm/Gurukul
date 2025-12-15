# Academic Year Switching Guide

## How Academic Year Switching Works

The academic year system **automatically switches** based on the current date. No manual intervention is required!

### Current Logic (April-Based System)

The academic year runs from **April to March**:
- **April 1, 2025 to March 31, 2026** = Academic Year **2025-2026**
- **April 1, 2026 to March 31, 2027** = Academic Year **2026-2027**

### Automatic Calculation

The system calculates the current academic year using this logic:

```javascript
const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth(); // 0-11 (0 = January, 3 = April)

if (currentMonth >= 3) {
  // April (3) to December (11) - Current year starts the academic year
  return `${currentYear}-${currentYear + 1}`;
} else {
  // January (0) to March (2) - Previous year started the academic year
  return `${currentYear - 1}-${currentYear}`;
}
```

### Examples

| Current Date | Month | Academic Year | Explanation |
|-------------|-------|---------------|-------------|
| Dec 10, 2025 | December (11) | **2025-2026** | April 2025 started this year |
| Jan 15, 2026 | January (0) | **2025-2026** | Still in 2025-2026 (ends March 31) |
| Mar 30, 2026 | March (2) | **2025-2026** | Still in 2025-2026 (ends March 31) |
| Apr 1, 2026 | April (3) | **2026-2027** | New academic year starts! |
| Apr 15, 2026 | April (3) | **2026-2027** | New academic year |
| Dec 10, 2026 | December (11) | **2026-2027** | Current academic year |

### Automatic Switching

**The system automatically switches on April 1st!**

- **Before April 1, 2026**: System shows 2025-2026 as current
- **On/After April 1, 2026**: System automatically shows 2026-2027 as current

**No manual action needed!** The system checks the date every time it loads.

### How It Works in Practice

1. **Today (December 10, 2025)**:
   - System calculates: Month = 11 (December) >= 3 (April)
   - Returns: `2025-2026` ✅
   - All new exams/classes default to **2025-2026**

2. **On April 1, 2026**:
   - System calculates: Month = 3 (April) >= 3 (April)
   - Returns: `2026-2027` ✅
   - All new exams/classes default to **2026-2027**
   - Previous year (2025-2026) data still accessible via "Show All Years"

3. **On March 31, 2026**:
   - System calculates: Month = 2 (March) < 3 (April)
   - Returns: `2025-2026` ✅
   - Still in 2025-2026 academic year

### Testing the Switch

To test what academic year will be current on a specific date:

```bash
# Test current date
node -e "const d = new Date('2025-12-10'); const y = d.getFullYear(); const m = d.getMonth(); console.log(m >= 3 ? y + '-' + (y+1) : (y-1) + '-' + y);"

# Test April 1, 2026
node -e "const d = new Date('2026-04-01'); const y = d.getFullYear(); const m = d.getMonth(); console.log(m >= 3 ? y + '-' + (y+1) : (y-1) + '-' + y);"

# Test March 31, 2026
node -e "const d = new Date('2026-03-31'); const y = d.getFullYear(); const m = d.getMonth(); console.log(m >= 3 ? y + '-' + (y+1) : (y-1) + '-' + y);"
```

### Manual Override (If Needed)

If you need to manually set or override the academic year for testing:

1. **For Testing**: You can modify `getCurrentAcademicYear()` in `/backend/utils/academicYear.js` temporarily
2. **For Production**: The automatic calculation is recommended - it ensures consistency

### Important Notes

- ✅ **Automatic**: No manual switching needed
- ✅ **Date-Based**: Uses server's current date
- ✅ **Consistent**: All pages use the same calculation
- ✅ **Historical Data**: Previous years remain accessible
- ✅ **New Records**: Automatically use current academic year

### Verification

To verify the current academic year:

```bash
# API Endpoint
curl http://localhost:5001/api/academic-year/current

# Expected Response (as of Dec 2025)
{
  "success": true,
  "data": {
    "academicYear": "2025-2026",
    "label": "2025-2026 (Current)",
    "isCurrent": true
  }
}
```

### Timeline Summary

| Period | Academic Year | Status |
|--------|---------------|--------|
| Apr 1, 2025 - Mar 31, 2026 | 2025-2026 | ✅ Current (Dec 2025) |
| Apr 1, 2026 - Mar 31, 2027 | 2026-2027 | ⏳ Next (starts Apr 2026) |
| Apr 1, 2027 - Mar 31, 2028 | 2027-2028 | ⏳ Future |

**The switch happens automatically on April 1st each year!**
