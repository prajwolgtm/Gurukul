import mongoose from 'mongoose';
import Batch from './models/Batch.js';
import SubDepartment from './models/SubDepartment.js';
import Department from './models/Department.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/gurukul';

async function fixBatchSubDepartmentLinks() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Get all batches
    const batches = await Batch.find({}).populate('department subDepartment');
    console.log(`📦 Found ${batches.length} batches`);

    // Get all sub-departments
    const subDepartments = await SubDepartment.find({}).populate('department');
    console.log(`🏢 Found ${subDepartments.length} sub-departments`);

    console.log('\n📊 Current Batch Status:');
    console.log('========================');
    
    let batchesWithSubDept = 0;
    let batchesWithoutSubDept = 0;
    
    for (const batch of batches) {
      if (batch.subDepartment) {
        console.log(`✅ ${batch.name} → Department: ${batch.department?.name} → Sub-Dept: ${batch.subDepartment.name}`);
        batchesWithSubDept++;
      } else {
        console.log(`⚠️  ${batch.name} → Department: ${batch.department?.name} → Sub-Dept: NONE`);
        batchesWithoutSubDept++;
      }
    }
    
    console.log(`\n📈 Summary:`);
    console.log(`   - Batches with sub-department: ${batchesWithSubDept}`);
    console.log(`   - Batches without sub-department: ${batchesWithoutSubDept}`);

    console.log('\n🏢 Available Sub-Departments:');
    console.log('=============================');
    for (const subDept of subDepartments) {
      const batchCount = await Batch.countDocuments({ subDepartment: subDept._id });
      console.log(`   - ${subDept.name} (${subDept.department?.name}) → ${batchCount} batches`);
    }

    // Interactive assignment (you can modify this part)
    console.log('\n💡 To assign batches to sub-departments:');
    console.log('1. Go to http://localhost:3000/departments');
    console.log('2. Edit existing batches and select a sub-department');
    console.log('3. Or create new batches with sub-department assignments');
    
    console.log('\n🔧 Quick Fix Example:');
    console.log('If you want to assign the first batch to the first sub-department:');
    
    if (batches.length > 0 && subDepartments.length > 0 && !batches[0].subDepartment) {
      const firstBatch = batches[0];
      const firstSubDept = subDepartments.find(sd => sd.department._id.toString() === firstBatch.department._id.toString());
      
      if (firstSubDept) {
        console.log(`\n🎯 DEMO: Assigning "${firstBatch.name}" to "${firstSubDept.name}"`);
        
        // Uncomment the next lines to actually perform the assignment
        // firstBatch.subDepartment = firstSubDept._id;
        // await firstBatch.save();
        // console.log('✅ Assignment completed!');
        
        console.log('⚠️  Assignment commented out for safety. Uncomment lines 61-63 to execute.');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

fixBatchSubDepartmentLinks();
