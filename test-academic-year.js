/**
 * Test script for Academic Year API endpoints
 * Run with: node test-academic-year.js
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:5001/api';
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''; // Set this if you need authentication

// Helper function to make API calls
async function testEndpoint(method, endpoint, data = null, token = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return {
      success: true,
      status: response.status,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      status: error.response?.status || 'N/A',
      error: error.response?.data || error.message
    };
  }
}

// Test functions
async function testCurrentAcademicYear() {
  console.log('\n📅 Testing: GET /api/academic-year/current');
  console.log('─'.repeat(60));
  
  const result = await testEndpoint('GET', '/academic-year/current', null, AUTH_TOKEN);
  
  if (result.success) {
    console.log('✅ Success!');
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } else {
    console.log('❌ Failed!');
    console.log('Status:', result.status);
    console.log('Error:', JSON.stringify(result.error, null, 2));
  }
  
  return result;
}

async function testAcademicYearList() {
  console.log('\n📋 Testing: GET /api/academic-year/list');
  console.log('─'.repeat(60));
  
  // Test with default parameters
  let result = await testEndpoint('GET', '/academic-year/list', null, AUTH_TOKEN);
  
  if (result.success) {
    console.log('✅ Success (default params)!');
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } else {
    console.log('❌ Failed!');
    console.log('Status:', result.status);
    console.log('Error:', JSON.stringify(result.error, null, 2));
  }
  
  // Test with custom parameters
  console.log('\n📋 Testing: GET /api/academic-year/list?yearsBack=3&yearsForward=1');
  console.log('─'.repeat(60));
  
  result = await testEndpoint('GET', '/academic-year/list?yearsBack=3&yearsForward=1', null, AUTH_TOKEN);
  
  if (result.success) {
    console.log('✅ Success (custom params)!');
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } else {
    console.log('❌ Failed!');
    console.log('Status:', result.status);
    console.log('Error:', JSON.stringify(result.error, null, 2));
  }
  
  return result;
}

async function testValidateAcademicYear() {
  console.log('\n✅ Testing: GET /api/academic-year/:year/validate');
  console.log('─'.repeat(60));
  
  // Test valid academic year
  console.log('\nTesting valid format: 2025-2026');
  let result = await testEndpoint('GET', '/academic-year/2025-2026/validate', null, AUTH_TOKEN);
  
  if (result.success) {
    console.log('✅ Success!');
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } else {
    console.log('❌ Failed!');
    console.log('Status:', result.status);
    console.log('Error:', JSON.stringify(result.error, null, 2));
  }
  
  // Test invalid format
  console.log('\nTesting invalid format: 2025-26');
  result = await testEndpoint('GET', '/academic-year/2025-26/validate', null, AUTH_TOKEN);
  
  if (result.success) {
    console.log('✅ Success (validation worked)!');
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } else {
    console.log('✅ Validation correctly rejected invalid format');
    console.log('Status:', result.status);
    console.log('Error:', JSON.stringify(result.error, null, 2));
  }
  
  // Test another invalid format
  console.log('\nTesting invalid format: 2025-2027');
  result = await testEndpoint('GET', '/academic-year/2025-2027/validate', null, AUTH_TOKEN);
  
  if (result.success) {
    console.log('✅ Success (validation worked)!');
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } else {
    console.log('✅ Validation correctly rejected invalid format');
    console.log('Status:', result.status);
    console.log('Error:', JSON.stringify(result.error, null, 2));
  }
  
  return result;
}

// Main test runner
async function runTests() {
  console.log('🧪 Academic Year API Endpoint Tests');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Auth Token: ${AUTH_TOKEN ? 'Set' : 'Not set (may need for protected routes)'}`);
  
  try {
    await testCurrentAcademicYear();
    await testAcademicYearList();
    await testValidateAcademicYear();
    
    console.log('\n' + '='.repeat(60));
    console.log('✨ All tests completed!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\n❌ Test runner error:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();
