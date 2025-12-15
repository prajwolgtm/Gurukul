#!/bin/bash

echo "🎓 Student Assignment Demo"
echo "========================="

API_BASE="http://localhost:5001/api"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_step() { echo -e "${BLUE}$1${NC}"; }
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ️  $1${NC}"; }

# Step 1: Login
print_step "\n1. 🔐 LOGIN"
LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.gurukul.edu","password":"admin123"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token // empty')
if [ -z "$TOKEN" ]; then
  echo "❌ Login failed. Please ensure admin account exists."
  exit 1
fi
print_success "Logged in successfully"

# Step 2: Get Available Structure
print_step "\n2. 📋 GET AVAILABLE STRUCTURE"

# Get departments
DEPT_RESPONSE=$(curl -s "$API_BASE/student-management/departments" \
  -H "Authorization: Bearer $TOKEN")
DEPT_COUNT=$(echo "$DEPT_RESPONSE" | jq -r '.departments | length')
print_success "Found $DEPT_COUNT departments"

if [ "$DEPT_COUNT" -eq 0 ]; then
  echo "❌ No departments found. Please create departments first."
  exit 1
fi

# Show first department
FIRST_DEPT=$(echo "$DEPT_RESPONSE" | jq -r '.departments[0]')
DEPT_ID=$(echo "$FIRST_DEPT" | jq -r '._id')
DEPT_NAME=$(echo "$FIRST_DEPT" | jq -r '.name')
print_info "Using Department: $DEPT_NAME"

# Get sub-departments for this department
SUBDEPT_RESPONSE=$(curl -s "$API_BASE/student-management/departments/$DEPT_ID/sub-departments" \
  -H "Authorization: Bearer $TOKEN")
SUBDEPT_COUNT=$(echo "$SUBDEPT_RESPONSE" | jq -r '.subDepartments | length // 0')
print_success "Found $SUBDEPT_COUNT sub-departments"

SUBDEPT_ID=""
if [ "$SUBDEPT_COUNT" -gt 0 ]; then
  SUBDEPT_ID=$(echo "$SUBDEPT_RESPONSE" | jq -r '.subDepartments[0]._id')
  SUBDEPT_NAME=$(echo "$SUBDEPT_RESPONSE" | jq -r '.subDepartments[0].name')
  print_info "Available Sub-Department: $SUBDEPT_NAME"
fi

# Get batches for this department
BATCH_RESPONSE=$(curl -s "$API_BASE/student-management/departments/$DEPT_ID/batches" \
  -H "Authorization: Bearer $TOKEN")
BATCH_COUNT=$(echo "$BATCH_RESPONSE" | jq -r '.batches | length // 0')
print_success "Found $BATCH_COUNT batches"

if [ "$BATCH_COUNT" -eq 0 ]; then
  echo "❌ No batches found. Please create batches first."
  exit 1
fi

BATCH_ID=$(echo "$BATCH_RESPONSE" | jq -r '.batches[0]._id')
BATCH_NAME=$(echo "$BATCH_RESPONSE" | jq -r '.batches[0].name')
print_info "Using Batch: $BATCH_NAME"

# Step 3: Create or Get Student
print_step "\n3. 👨‍🎓 STUDENT SETUP"

# Try to create a demo student
STUDENT_DATA='{
  "admissionNo": "ASSIGN_DEMO_001",
  "fullName": "Assignment Demo Student",
  "dateOfBirth": "2005-06-15",
  "bloodGroup": "B+",
  "shaakha": "Rigveda – Shaakal",
  "gothra": "Demo Gothra",
  "telephone": "+919876543999",
  "fatherName": "Demo Father",
  "occupation": "Engineer",
  "presentAddress": "Demo Assignment Address",
  "admittedToStandard": "Class 11",
  "dateOfAdmission": "2024-06-15",
  "guardianInfo": {
    "guardianPhone": "+919876543999",
    "guardianEmail": "demo.assign@parent.com"
  }
}'

STUDENT_RESPONSE=$(curl -s -X POST "$API_BASE/student-management/students" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$STUDENT_DATA")

STUDENT_SUCCESS=$(echo "$STUDENT_RESPONSE" | jq -r '.success // false')
if [ "$STUDENT_SUCCESS" = "true" ]; then
  STUDENT_ID=$(echo "$STUDENT_RESPONSE" | jq -r '.student._id')
  print_success "Created demo student: $STUDENT_ID"
else
  # Try to get existing students
  EXISTING_RESPONSE=$(curl -s "$API_BASE/student-management/students" \
    -H "Authorization: Bearer $TOKEN")
  STUDENT_ID=$(echo "$EXISTING_RESPONSE" | jq -r '.students[0]._id // empty')
  
  if [ -n "$STUDENT_ID" ]; then
    STUDENT_NAME=$(echo "$EXISTING_RESPONSE" | jq -r '.students[0].fullName')
    print_info "Using existing student: $STUDENT_NAME ($STUDENT_ID)"
  else
    echo "❌ No students available. Please create a student first."
    exit 1
  fi
fi

# Step 4: Assignment Examples
print_step "\n4. 🎯 ASSIGNMENT EXAMPLES"

# Assignment 1: Department + Batch (No Sub-Department)
print_info "Assignment 1: Department + Batch"
ASSIGN1_DATA=$(cat <<EOF
{
  "studentId": "$STUDENT_ID",
  "departmentId": "$DEPT_ID",
  "batchId": "$BATCH_ID",
  "role": "student",
  "notes": "Primary assignment to department and batch"
}
EOF
)

ASSIGN1_RESPONSE=$(curl -s -X POST "$API_BASE/student-management/assign" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$ASSIGN1_DATA")

ASSIGN1_SUCCESS=$(echo "$ASSIGN1_RESPONSE" | jq -r '.success // false')
if [ "$ASSIGN1_SUCCESS" = "true" ]; then
  print_success "✓ Assigned to Department: $DEPT_NAME"
  print_success "✓ Assigned to Batch: $BATCH_NAME"
else
  ASSIGN1_ERROR=$(echo "$ASSIGN1_RESPONSE" | jq -r '.message')
  echo "⚠️  Assignment 1 result: $ASSIGN1_ERROR"
fi

# Assignment 2: Department + Sub-Department + Batch (if sub-department exists)
if [ -n "$SUBDEPT_ID" ] && [ "$SUBDEPT_ID" != "null" ]; then
  print_info "\nAssignment 2: Department + Sub-Department + Batch"
  
  # Get batches for sub-department
  SUBDEPT_BATCH_RESPONSE=$(curl -s "$API_BASE/student-management/sub-departments/$SUBDEPT_ID/batches" \
    -H "Authorization: Bearer $TOKEN")
  SUBDEPT_BATCH_COUNT=$(echo "$SUBDEPT_BATCH_RESPONSE" | jq -r '.batches | length // 0')
  
  if [ "$SUBDEPT_BATCH_COUNT" -gt 0 ]; then
    SUBDEPT_BATCH_ID=$(echo "$SUBDEPT_BATCH_RESPONSE" | jq -r '.batches[0]._id')
    SUBDEPT_BATCH_NAME=$(echo "$SUBDEPT_BATCH_RESPONSE" | jq -r '.batches[0].name')
    
    ASSIGN2_DATA=$(cat <<EOF
{
  "studentId": "$STUDENT_ID",
  "departmentId": "$DEPT_ID",
  "subDepartmentId": "$SUBDEPT_ID",
  "batchId": "$SUBDEPT_BATCH_ID",
  "role": "monitor",
  "notes": "Assignment with sub-department - student is a monitor"
}
EOF
)

    ASSIGN2_RESPONSE=$(curl -s -X POST "$API_BASE/student-management/assign" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$ASSIGN2_DATA")

    ASSIGN2_SUCCESS=$(echo "$ASSIGN2_RESPONSE" | jq -r '.success // false')
    if [ "$ASSIGN2_SUCCESS" = "true" ]; then
      print_success "✓ Assigned to Sub-Department: $SUBDEPT_NAME"
      print_success "✓ Assigned to Sub-Dept Batch: $SUBDEPT_BATCH_NAME"
      print_success "✓ Role: Monitor"
    else
      ASSIGN2_ERROR=$(echo "$ASSIGN2_RESPONSE" | jq -r '.message')
      echo "⚠️  Assignment 2 result: $ASSIGN2_ERROR"
    fi
  else
    print_info "No batches found in sub-department for assignment 2"
  fi
fi

# Step 5: Verify Assignments
print_step "\n5. ✅ VERIFY ASSIGNMENTS"
VERIFY_RESPONSE=$(curl -s "$API_BASE/student-management/students" \
  -H "Authorization: Bearer $TOKEN")

STUDENT_DATA=$(echo "$VERIFY_RESPONSE" | jq -r --arg id "$STUDENT_ID" '.students[] | select(._id == $id)')
ASSIGNMENT_COUNT=$(echo "$STUDENT_DATA" | jq -r '.assignments | length // 0')

print_success "Student has $ASSIGNMENT_COUNT assignments:"

if [ "$ASSIGNMENT_COUNT" -gt 0 ]; then
  echo "$STUDENT_DATA" | jq -r '.assignments[] | "  • Department: \(.department.name // "N/A") | Sub-Dept: \(.subDepartment.name // "None") | Batch: \(.batch.name // "N/A") | Role: \(.role)"'
fi

# Summary
print_step "\n🎉 ASSIGNMENT DEMO COMPLETED!"
echo "=================================="
print_success "Successfully demonstrated student assignments!"
echo ""
print_info "Assignment Options:"
echo "   1. Department + Batch (basic assignment)"
echo "   2. Department + Sub-Department + Batch (detailed assignment)"
echo "   3. Multiple assignments per student (different roles)"
echo ""
print_info "Available Roles:"
echo "   • student (default)"
echo "   • monitor (class monitor)"
echo "   • assistant (teacher assistant)"
echo "   • leader (batch leader)"
echo ""
print_info "Frontend Access:"
echo "   📱 http://localhost:3000/students-simple"
echo "   Use the assignment form to assign students easily!"
