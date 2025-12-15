#!/bin/bash

# Simple test script for Academic Year API endpoints
# Make sure your backend server is running on http://localhost:5001

BASE_URL="http://localhost:5001/api/academic-year"

echo "🧪 Testing Academic Year API Endpoints"
echo "========================================"
echo ""

echo "1️⃣ Testing: GET /api/academic-year/current"
echo "──────────────────────────────────────────"
curl -s -X GET "${BASE_URL}/current" -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || curl -s -X GET "${BASE_URL}/current" -H "Content-Type: application/json"
echo ""
echo ""

echo "2️⃣ Testing: GET /api/academic-year/list"
echo "────────────────────────────────────────"
curl -s -X GET "${BASE_URL}/list" -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || curl -s -X GET "${BASE_URL}/list" -H "Content-Type: application/json"
echo ""
echo ""

echo "3️⃣ Testing: GET /api/academic-year/list?yearsBack=3&yearsForward=1"
echo "───────────────────────────────────────────────────────────────────"
curl -s -X GET "${BASE_URL}/list?yearsBack=3&yearsForward=1" -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || curl -s -X GET "${BASE_URL}/list?yearsBack=3&yearsForward=1" -H "Content-Type: application/json"
echo ""
echo ""

echo "4️⃣ Testing: GET /api/academic-year/2025-2026/validate (Valid format)"
echo "─────────────────────────────────────────────────────────────────────"
curl -s -X GET "${BASE_URL}/2025-2026/validate" -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || curl -s -X GET "${BASE_URL}/2025-2026/validate" -H "Content-Type: application/json"
echo ""
echo ""

echo "5️⃣ Testing: GET /api/academic-year/2025-26/validate (Invalid format)"
echo "──────────────────────────────────────────────────────────────────────"
curl -s -X GET "${BASE_URL}/2025-26/validate" -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || curl -s -X GET "${BASE_URL}/2025-26/validate" -H "Content-Type: application/json"
echo ""
echo ""

echo "6️⃣ Testing: GET /api/academic-year/2024-2025/validate (Valid format)"
echo "─────────────────────────────────────────────────────────────────────"
curl -s -X GET "${BASE_URL}/2024-2025/validate" -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || curl -s -X GET "${BASE_URL}/2024-2025/validate" -H "Content-Type: application/json"
echo ""
echo ""

echo "✅ All tests completed!"
echo "========================================"
