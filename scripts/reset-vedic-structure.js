#!/usr/bin/env node

/**
 * Reset departments/subdepartments and wipe all students.
 * - Deletes: Student, StudentSimple, StudentAssignment, Batch, Department, SubDepartment,
 *            DailyAttendance, ClassAttendance (to avoid orphans)
 * - Seeds: Vedic departments + subdepartments as provided.
 *
 * Usage:
 *   node scripts/reset-vedic-structure.js
 *
 * Requires MONGO_URI in .env
 */

import dotenv from 'dotenv';
import { connectDB } from '../config/db.js';
import Department from '../models/Department.js';
import SubDepartment from '../models/SubDepartment.js';
import Batch from '../models/Batch.js';
import Student from '../models/Student.js';
import StudentSimple from '../models/StudentSimple.js';
import StudentAssignment from '../models/StudentAssignment.js';
import DailyAttendance from '../models/DailyAttendance.js';
import ClassAttendance from '../models/ClassAttendance.js';

dotenv.config();

const departments = [
  { name: 'Rigveda', code: 'RIG', description: 'Rigveda department' },
  { name: 'Yajurveda', code: 'YAJ', description: 'Yajurveda department' },
  { name: 'Samaveda', code: 'SAM', description: 'Samaveda department' },
  { name: 'Atharvaveda', code: 'ATH', description: 'Atharvaveda department' }
];

const subDepartments = [
  { name: 'Shaakal', code: 'RIG-SHK', description: 'Rigveda – Shaakal', departmentName: 'Rigveda' },
  { name: 'Krishna Taittiriya', code: 'YAJ-KT', description: 'Yajurveda – Krishna Taittiriya', departmentName: 'Yajurveda' },
  { name: 'Shukla Kanva', code: 'YAJ-SK', description: 'Yajurveda – Shukla Kanva', departmentName: 'Yajurveda' },
  { name: 'Shukla Madhyandina', code: 'YAJ-SM', description: 'Yajurveda – Shukla Madhyandina', departmentName: 'Yajurveda' },
  { name: 'Ranayaneeya', code: 'SAM-RN', description: 'Samaveda – Ranayaneeya', departmentName: 'Samaveda' },
  { name: 'Kauthuma', code: 'SAM-KT', description: 'Samaveda – Kauthuma', departmentName: 'Samaveda' },
  { name: 'Shaunaka', code: 'ATH-SH', description: 'Atharvaveda – Shaunaka', departmentName: 'Atharvaveda' }
];

async function run() {
  try {
    console.log('🔄 Connecting to database...');
    await connectDB();

    console.log('🗑️  Removing students and related data...');
    await Promise.all([
      Student.deleteMany({}),
      StudentSimple.deleteMany({}),
      StudentAssignment.deleteMany({}),
      DailyAttendance.deleteMany({}),
      ClassAttendance.deleteMany({})
    ]);

    console.log('🗑️  Removing departments, subdepartments, and batches...');
    await Promise.all([
      SubDepartment.deleteMany({}),
      Batch.deleteMany({}),
      Department.deleteMany({})
    ]);

    console.log('📚 Creating departments...');
    const deptDocs = await Department.insertMany(
      departments.map(d => ({ ...d, isActive: true }))
    );
    const deptMap = deptDocs.reduce((acc, d) => {
      acc[d.name] = d._id;
      return acc;
    }, {});

    console.log('📚 Creating subdepartments...');
    await SubDepartment.insertMany(
      subDepartments.map(s => ({
        name: s.name,
        code: s.code,
        description: s.description,
        department: deptMap[s.departmentName],
        isActive: true
      }))
    );

    console.log('✅ Reset complete.');
    console.log('Departments created:');
    deptDocs.forEach(d => console.log(` - ${d.name} (${d.code})`));
  } catch (err) {
    console.error('❌ Error during reset:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

run();
