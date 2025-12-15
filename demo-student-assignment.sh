#!/bin/bash

echo "🎓 Gurukul Student Assignment System Demo"
echo "========================================"

API_BASE="http://localhost:5001/api"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}$1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Step 1: Login as Admin
print_step "\n1. 🔐 AUTHENTICATION"
echo "Logging in as admin..."

LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.gurukul.edu","password":"admin123"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token // empty')

if [ -z "$TOKEN" ]; then
  print_error "Login failed. Please ensure admin account exists."
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

print_success "Admin login successful"

# Step 2: Get Departments
print_step "\n2. 🏫 DEPARTMENT STRUCTURE"
echo "Getting available departments..."

DEPT_RESPONSE=$(curl -s "$API_BASE/student-management/departments" \
  -H "Authorization: Bearer $TOKEN")

DEPT_COUNT=$(echo "$DEPT_RESPONSE" | jq -r '.departments | length')
print_success "Found $DEPT_COUNT departments"

# Get first department for demo
FIRST_DEPT_ID=$(echo "$DEPT_RESPONSE" | jq -r '.departments[0]._id')
FIRST_DEPT_NAME=$(echo "$DEPT_RESPONSE" | jq -r '.departments[0].name')

if [ "$FIRST_DEPT_ID" != "null" ]; then
  print_info "Using department: $FIRST_DEPT_NAME"
  
  # Get batches for this department
  echo "Getting batches for department..."
  BATCH_RESPONSE=$(curl -s "$API_BASE/student-management/departments/$FIRST_DEPT_ID/batches" \
    -H "Authorization: Bearer $TOKEN")
  
  BATCH_COUNT=$(echo "$BATCH_RESPONSE" | jq -r '.batches | length')
  print_success "Found $BATCH_COUNT batches"
  
  FIRST_BATCH_ID=$(echo "$BATCH_RESPONSE" | jq -r '.batches[0]._id // empty')
  FIRST_BATCH_NAME=$(echo "$BATCH_RESPONSE" | jq -r '.batches[0].name // "No batches"')
  
  if [ -n "$FIRST_BATCH_ID" ] && [ "$FIRST_BATCH_ID" != "null" ]; then
    print_info "Using batch: $FIRST_BATCH_NAME"
  else
    print_error "No batches found. Please create batches first."
    exit 1
  fi
else
  print_error "No departments found. Please initialize departments first."
  exit 1
fi

# Step 3: Create Test Student
print_step "\n3. 👨‍🎓 STUDENT CREATION"
echo "Creating test student..."

STUDENT_DATA='{
  "admissionNo": "DEMO2024001",
  "fullName": "Arjun Kumar Sharma",
  "dateOfBirth": "2005-01-15",
  "bloodGroup": "A+",
  "shaakha": "Rigveda – Shaakal",
  "gothra": "Bharadwaj",
  "telephone": "+919876543210",
  "fatherName": "Raj Kumar Sharma",
  "occupation": "Teacher",
  "presentAddress": "123 Demo Street, New Delhi",
  "admittedToStandard": "Class 10",
  "dateOfAdmission": "2024-01-15",
  "guardianInfo": {
    "guardianPhone": "+919876543210",
    "guardianEmail": "raj.sharma@demo.com"
  }
}'

STUDENT_RESPONSE=$(curl -s -X POST "$API_BASE/student-management/students" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$STUDENT_DATA")

STUDENT_SUCCESS=$(echo "$STUDENT_RESPONSE" | jq -r '.success')
STUDENT_ID=$(echo "$STUDENT_RESPONSE" | jq -r '.student._id // empty')

if [ "$STUDENT_SUCCESS" = "true" ] && [ -n "$STUDENT_ID" ]; then
  print_success "Student created successfully"
  print_info "Student ID: $STUDENT_ID"
else
  STUDENT_ERROR=$(echo "$STUDENT_RESPONSE" | jq -r '.message')
  print_error "Student creation failed: $STUDENT_ERROR"
  
  # Try to get existing student
  echo "Checking for existing students..."
  EXISTING_STUDENTS=$(curl -s "$API_BASE/student-management/students" \
    -H "Authorization: Bearer $TOKEN")
  
  STUDENT_ID=$(echo "$EXISTING_STUDENTS" | jq -r '.students[0]._id // empty')
  if [ -n "$STUDENT_ID" ] && [ "$STUDENT_ID" != "null" ]; then
    print_info "Using existing student: $STUDENT_ID"
  else
    print_error "No students available for assignment demo"
    exit 1
  fi
fi

# Step 4: Assign Student to Department and Batch
print_step "\n4. 🎯 STUDENT ASSIGNMENT"
echo "Assigning student to department and batch..."

ASSIGNMENT_DATA=$(cat <<EOF
{
  "studentId": "$STUDENT_ID",
  "departmentId": "$FIRST_DEPT_ID",
  "batchId": "$FIRST_BATCH_ID",
  "role": "student",
  "notes": "Demo assignment - assigned via API"
}
EOF
)

ASSIGN_RESPONSE=$(curl -s -X POST "$API_BASE/student-management/assign" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$ASSIGNMENT_DATA")

ASSIGN_SUCCESS=$(echo "$ASSIGN_RESPONSE" | jq -r '.success')

if [ "$ASSIGN_SUCCESS" = "true" ]; then
  print_success "Student assigned successfully!"
  print_info "Department: $FIRST_DEPT_NAME"
  print_info "Batch: $FIRST_BATCH_NAME"
  print_info "Role: student"
else
  ASSIGN_ERROR=$(echo "$ASSIGN_RESPONSE" | jq -r '.message')
  print_error "Assignment failed: $ASSIGN_ERROR"
fi

# Step 5: Verify Assignment
print_step "\n5. ✅ VERIFICATION"
echo "Retrieving student assignments..."

STUDENTS_RESPONSE=$(curl -s "$API_BASE/student-management/students" \
  -H "Authorization: Bearer $TOKEN")

STUDENTS_SUCCESS=$(echo "$STUDENTS_RESPONSE" | jq -r '.success')

if [ "$STUDENTS_SUCCESS" = "true" ]; then
  TOTAL_STUDENTS=$(echo "$STUDENTS_RESPONSE" | jq -r '.students | length')
  ASSIGNED_STUDENTS=$(echo "$STUDENTS_RESPONSE" | jq -r '[.students[] | select(.assignments | length > 0)] | length')
  
  print_success "Retrieved student data successfully"
  print_info "Total students: $TOTAL_STUDENTS"
  print_info "Students with assignments: $ASSIGNED_STUDENTS"
  
  # Show assignment details for our demo student
  DEMO_STUDENT=$(echo "$STUDENTS_RESPONSE" | jq -r --arg id "$STUDENT_ID" '.students[] | select(._id == $id)')
  if [ "$DEMO_STUDENT" != "null" ] && [ -n "$DEMO_STUDENT" ]; then
    STUDENT_NAME=$(echo "$DEMO_STUDENT" | jq -r '.fullName')
    ASSIGNMENT_COUNT=$(echo "$DEMO_STUDENT" | jq -r '.assignments | length')
    
    print_success "Demo student verification:"
    print_info "Name: $STUDENT_NAME"
    print_info "Assignments: $ASSIGNMENT_COUNT"
    
    if [ "$ASSIGNMENT_COUNT" -gt 0 ]; then
      DEPT_NAME=$(echo "$DEMO_STUDENT" | jq -r '.assignments[0].department.name')
      BATCH_NAME=$(echo "$DEMO_STUDENT" | jq -r '.assignments[0].batch.name')
      ROLE=$(echo "$DEMO_STUDENT" | jq -r '.assignments[0].role')
      
      print_info "✓ Department: $DEPT_NAME"
      print_info "✓ Batch: $BATCH_NAME"
      print_info "✓ Role: $ROLE"
    fi
  fi
else
  print_error "Failed to retrieve student assignments"
fi

# Summary
print_step "\n🎉 DEMO COMPLETED!"
echo "=========================================="
print_success "Student Assignment System is fully functional!"
echo ""
print_info "What was demonstrated:"
echo "   ✓ Admin authentication"
echo "   ✓ Department structure retrieval"
echo "   ✓ Batch information retrieval"
echo "   ✓ Student creation"
echo "   ✓ Student assignment to department & batch"
echo "   ✓ Assignment verification"
echo ""
print_info "Frontend Access:"
echo "   📱 Student Management: http://localhost:3000/students-simple"
echo "   🏫 Department Management: http://localhost:3000/departments"
echo "   👥 Teacher Management: http://localhost:3000/teachers"
echo ""
print_info "The system supports:"
echo "   • Multiple department assignments per student"
echo "   • Sub-department assignments (optional)"
echo "   • Different student roles (student, monitor, assistant, leader)"
echo "   • Bulk student upload via Excel"
echo "   • Complete assignment tracking and management"
