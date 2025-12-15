import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import { ROLES } from '../utils/roles.js';

const createInitialAccounts = async () => {
  try {
    console.log('🚀 Creating initial admin and coordinator accounts...');
    
    // Connect to MongoDB
    await connectDB();
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: ROLES.ADMIN });
    if (existingAdmin) {
      console.log('✅ Admin account already exists:', existingAdmin.email);
    } else {
      // Create admin account
      const admin = await User.create({
        fullName: 'System Administrator',
        email: 'admin@gurukul.edu',
        password: 'admin123', // Change this in production!
        role: ROLES.ADMIN,
        isVerified: true,
        accountStatus: 'verified',
        verifiedAt: new Date(),
        employeeId: 'ADM001'
      });
      console.log('✅ Admin account created:', admin.email);
    }
    
    // Check if coordinator already exists
    const existingCoordinator = await User.findOne({ role: ROLES.COORDINATOR });
    if (existingCoordinator) {
      console.log('✅ Coordinator account already exists:', existingCoordinator.email);
    } else {
      // Create coordinator account
      const coordinator = await User.create({
        fullName: 'Hostel Coordinator',
        email: 'coordinator@gurukul.edu',
        password: 'coord123', // Change this in production!
        role: ROLES.COORDINATOR,
        isVerified: true,
        accountStatus: 'verified',
        verifiedAt: new Date(),
        employeeId: 'COORD001'
      });
      console.log('✅ Coordinator account created:', coordinator.email);
    }
    
    // Check if principal already exists
    const existingPrincipal = await User.findOne({ role: ROLES.PRINCIPAL });
    if (existingPrincipal) {
      console.log('✅ Principal account already exists:', existingPrincipal.email);
    } else {
      // Create principal account
      const principal = await User.create({
        fullName: 'School Principal',
        email: 'principal@gurukul.edu',
        password: 'principal123', // Change this in production!
        role: ROLES.PRINCIPAL,
        isVerified: true,
        accountStatus: 'verified',
        verifiedAt: new Date(),
        employeeId: 'PRIN001'
      });
      console.log('✅ Principal account created:', principal.email);
    }
    
    // Create a sample teacher account (pending verification)
    const existingTeacher = await User.findOne({ email: 'teacher@gurukul.edu' });
    if (!existingTeacher) {
      const teacher = await User.create({
        fullName: 'Sample Teacher',
        email: 'teacher@gurukul.edu',
        password: 'teacher123',
        role: ROLES.TEACHER,
        isVerified: false,
        accountStatus: 'pending',
        employeeId: 'TEACH001'
      });
      console.log('✅ Sample teacher account created (pending verification):', teacher.email);
    } else {
      console.log('✅ Sample teacher account already exists:', existingTeacher.email);
    }
    
    console.log('\n🎉 Initial accounts setup completed!');
    console.log('\n📋 Login Credentials:');
    console.log('👑 Admin: admin@gurukul.edu / admin123');
    console.log('🏠 Coordinator: coordinator@gurukul.edu / coord123');
    console.log('🎓 Principal: principal@gurukul.edu / principal123');
    console.log('👨‍🏫 Teacher: teacher@gurukul.edu / teacher123 (needs verification)');
    console.log('\n⚠️  IMPORTANT: Change these passwords in production!');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error creating initial accounts:', error);
    process.exit(1);
  }
};

createInitialAccounts();
