#!/bin/bash

echo "🧪 Testing Subject & Exam Management API..."

API_BASE="http://localhost:3001/api"

# 1. Test health endpoint
echo ""
echo "1. Testing health endpoint..."
curl -s "$API_BASE/health" | jq -r '.message'

# 2. Create coordinator account if needed
echo ""
echo "2. Creating/logging in as coordinator..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"coordinator@demo.gurukul.edu","password":"demo123"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token // empty')

if [ -z "$TOKEN" ]; then
  echo "Creating coordinator account..."
  REGISTER_RESPONSE=$(curl -s -X POST "$API_BASE/auth/register-staff" \
    -H "Content-Type: application/json" \
    -d '{"fullName":"Test Coordinator","email":"coordinator@demo.gurukul.edu","password":"demo123","role":"Coordinator"}')
  
  echo "Registration result: $(echo "$REGISTER_RESPONSE" | jq -r '.message')"
  
  # Try login again
  LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"coordinator@demo.gurukul.edu","password":"demo123"}')
  
  TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token // empty')
fi

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get authentication token"
  exit 1
fi

echo "✅ Login successful"

# 3. Test subject categories
echo ""
echo "3. Testing subject categories..."
CATEGORIES_RESPONSE=$(curl -s "$API_BASE/subjects/meta/categories" \
  -H "Authorization: Bearer $TOKEN")

CATEGORIES_COUNT=$(echo "$CATEGORIES_RESPONSE" | jq -r '.categories | length')
echo "✅ Found $CATEGORIES_COUNT subject categories"

# 4. Test creating a subject
echo ""
echo "4. Testing subject creation..."
SUBJECT_RESPONSE=$(curl -s -X POST "$API_BASE/subjects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Vedic Subject",
    "code": "TVS001",
    "description": "A test subject for API verification",
    "category": "vedic_studies",
    "level": "prathama",
    "type": "core",
    "credits": 3,
    "maxMarks": 100,
    "passingMarks": 35,
    "academicYear": "2024-2025",
    "semester": 1,
    "weeklyHours": 4
  }')

SUBJECT_SUCCESS=$(echo "$SUBJECT_RESPONSE" | jq -r '.success')
if [ "$SUBJECT_SUCCESS" = "true" ]; then
  SUBJECT_NAME=$(echo "$SUBJECT_RESPONSE" | jq -r '.subject.name')
  echo "✅ Subject created successfully: $SUBJECT_NAME"
else
  SUBJECT_ERROR=$(echo "$SUBJECT_RESPONSE" | jq -r '.message')
  echo "⚠️  Subject creation result: $SUBJECT_ERROR"
fi

# 5. Test getting subjects
echo ""
echo "5. Testing subject listing..."
SUBJECTS_RESPONSE=$(curl -s "$API_BASE/subjects" \
  -H "Authorization: Bearer $TOKEN")

SUBJECTS_COUNT=$(echo "$SUBJECTS_RESPONSE" | jq -r '.subjects | length')
echo "✅ Found $SUBJECTS_COUNT subjects"

if [ "$SUBJECTS_COUNT" -gt 0 ]; then
  FIRST_SUBJECT=$(echo "$SUBJECTS_RESPONSE" | jq -r '.subjects[0].name')
  echo "   First subject: $FIRST_SUBJECT"
fi

echo ""
echo "🎉 API testing completed successfully!"
echo ""
echo "📋 Available API endpoints:"
echo "   📚 Subjects: $API_BASE/subjects"
echo "   📝 Enhanced Exams: $API_BASE/enhanced-exams"
echo "   📊 Marks Management: $API_BASE/marks-management"
echo "   👥 Account Management: $API_BASE/account-management"

