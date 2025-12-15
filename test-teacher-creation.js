import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5001/api';

async function testTeacherCreation() {
  try {
    console.log('🧪 Testing Teacher Creation...');
    
    // 1. First, login as admin to get a valid token
    console.log('\n1. Logging in as admin...');
    const loginResponse = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@demo.gurukul.edu',
        password: 'admin123'
      })
    });
    
    const loginData = await loginResponse.json();
    if (!loginData.success) {
      console.log('❌ Login failed:', loginData.message);
      console.log('   Creating admin account first...');
      
      // Try to create admin account
      const registerResponse = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'System Admin',
          email: 'admin@demo.gurukul.edu',
          password: 'admin123',
          role: 'Admin'
        })
      });
      
      const registerData = await registerResponse.json();
      console.log('   Register result:', registerData.message);
      
      if (!registerData.success) {
        console.log('❌ Cannot create admin account. Please check if admin exists.');
        return;
      }
      
      // Try login again
      const retryLoginResponse = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@demo.gurukul.edu',
          password: 'admin123'
        })
      });
      
      const retryLoginData = await retryLoginResponse.json();
      if (!retryLoginData.success) {
        console.log('❌ Still cannot login:', retryLoginData.message);
        return;
      }
      
      var token = retryLoginData.token;
    } else {
      var token = loginData.token;
    }
    
    console.log('✅ Login successful');
    
    // 2. Test teacher creation
    console.log('\n2. Creating teacher account...');
    const teacherData = {
      fullName: 'Test Teacher',
      email: 'teacher.test@demo.gurukul.edu',
      password: 'teacher123',
      role: 'Teacher',
      phone: '+1234567890',
      qualification: 'M.A. Sanskrit',
      experience: '5 years',
      specialization: 'Vedic Studies',
      address: '123 Test Street',
      joiningDate: '2024-01-15'
    };
    
    const teacherResponse = await fetch(`${API_BASE}/account-management/create-staff-account`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(teacherData)
    });
    
    const teacherResult = await teacherResponse.json();
    
    if (teacherResult.success) {
      console.log('✅ Teacher created successfully!');
      console.log('   Teacher ID:', teacherResult.user?.id);
      console.log('   Status:', teacherResult.user?.accountStatus);
      console.log('   Verified:', teacherResult.user?.isVerified);
    } else {
      console.log('❌ Teacher creation failed:', teacherResult.message);
      console.log('   Error details:', teacherResult.error);
    }
    
    // 3. Test duplicate email
    console.log('\n3. Testing duplicate email handling...');
    const duplicateResponse = await fetch(`${API_BASE}/account-management/create-staff-account`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(teacherData) // Same data
    });
    
    const duplicateResult = await duplicateResponse.json();
    if (!duplicateResult.success && duplicateResult.message.includes('already exists')) {
      console.log('✅ Duplicate email handling works correctly');
    } else {
      console.log('⚠️  Unexpected duplicate result:', duplicateResult.message);
    }
    
    console.log('\n🎉 Teacher creation test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testTeacherCreation();
