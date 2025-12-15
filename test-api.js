import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api';

async function testAPI() {
  try {
    console.log('🧪 Testing Subject & Exam Management API...');
    
    // 1. Test health endpoint
    console.log('\n1. Testing health endpoint...');
    const healthResponse = await fetch(`${API_BASE}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check:', healthData.message);
    
    // 2. Login as coordinator
    console.log('\n2. Logging in as coordinator...');
    const loginResponse = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'coordinator@demo.gurukul.edu',
        password: 'demo123'
      })
    });
    
    if (!loginResponse.ok) {
      console.log('❌ Login failed. Creating coordinator account...');
      
      // Create coordinator account
      const registerResponse = await fetch(`${API_BASE}/auth/register-staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Test Coordinator',
          email: 'coordinator@demo.gurukul.edu',
          password: 'demo123',
          role: 'Coordinator'
        })
      });
      
      const registerData = await registerResponse.json();
      if (registerData.success) {
        console.log('✅ Coordinator account created');
      } else {
        console.log('❌ Failed to create coordinator:', registerData.message);
        return;
      }
      
      // Try login again
      const retryLoginResponse = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'coordinator@demo.gurukul.edu',
          password: 'demo123'
        })
      });
      
      const retryLoginData = await retryLoginResponse.json();
      if (!retryLoginData.success) {
        console.log('❌ Login still failed:', retryLoginData.message);
        return;
      }
      
      var token = retryLoginData.token;
    } else {
      const loginData = await loginResponse.json();
      var token = loginData.token;
    }
    
    console.log('✅ Login successful');
    
    // 3. Test subject categories endpoint
    console.log('\n3. Testing subject categories...');
    const categoriesResponse = await fetch(`${API_BASE}/subjects/meta/categories`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const categoriesData = await categoriesResponse.json();
    
    if (categoriesData.success) {
      console.log(`✅ Found ${categoriesData.categories.length} subject categories`);
      console.log('   Categories:', categoriesData.categories.map(c => c.label).join(', '));
    } else {
      console.log('❌ Failed to get categories:', categoriesData.message);
    }
    
    // 4. Test creating a subject
    console.log('\n4. Testing subject creation...');
    const subjectResponse = await fetch(`${API_BASE}/subjects`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Test Vedic Subject',
        code: 'TVS001',
        description: 'A test subject for API verification',
        category: 'vedic_studies',
        level: 'prathama',
        type: 'core',
        credits: 3,
        maxMarks: 100,
        passingMarks: 35,
        academicYear: '2024-2025',
        semester: 1,
        weeklyHours: 4
      })
    });
    
    const subjectData = await subjectResponse.json();
    if (subjectData.success) {
      console.log('✅ Subject created successfully:', subjectData.subject.name);
    } else {
      console.log('❌ Failed to create subject:', subjectData.message);
    }
    
    // 5. Test getting subjects
    console.log('\n5. Testing subject listing...');
    const subjectsResponse = await fetch(`${API_BASE}/subjects`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const subjectsData = await subjectsResponse.json();
    
    if (subjectsData.success) {
      console.log(`✅ Found ${subjectsData.subjects.length} subjects`);
      if (subjectsData.subjects.length > 0) {
        console.log('   First subject:', subjectsData.subjects[0].name);
      }
    } else {
      console.log('❌ Failed to get subjects:', subjectsData.message);
    }
    
    console.log('\n🎉 API testing completed successfully!');
    console.log('\n📋 Available API endpoints:');
    console.log('   📚 Subjects: /api/subjects');
    console.log('   📝 Enhanced Exams: /api/enhanced-exams');
    console.log('   📊 Marks Management: /api/marks-management');
    console.log('   👥 Account Management: /api/account-management');
    
  } catch (error) {
    console.error('❌ API test failed:', error.message);
  }
}

testAPI();

