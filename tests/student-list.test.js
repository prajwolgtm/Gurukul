import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import router from '../routes/students.routes.js';
import Student from '../models/Student.js';
import Department from '../models/Department.js';

test('student listing filters, searches and sorts before pagination', async () => {
  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri());
    const a = new mongoose.Types.ObjectId();
    const b = new mongoose.Types.ObjectId();
    const branch = new mongoose.Types.ObjectId();
    const batch = new mongoose.Types.ObjectId();
    await Department.collection.insertMany([{ _id: a, name: 'Rigveda' }, { _id: b, name: 'Atharvaveda' }]);
    await Student.collection.insertMany([
      { fullName: 'Student A', admissionNo: '10/2025', department: a, subDepartments: [branch], batches: [batch], fatherName: 'Parent [A]', status: 'active', isActive: true },
      { fullName: 'Student B', admissionNo: '2/2025', department: a, status: 'active', isActive: true },
      { fullName: 'Student C', admissionNo: '1/2024', department: b, status: 'active', isActive: true },
      { fullName: 'Left Student', admissionNo: '3/2025', department: a, status: 'leftout', isActive: true }
    ]);
    const handler = router.stack.find(layer => layer.route?.path === '/' && layer.route.methods.get).route.stack.at(-1).handle;
    const list = async query => {
      let result;
      let status = 200;
      await handler({ query }, { status(code) { status = code; return this; }, json(body) { result = body; } });
      return { ...result, statusCode: status };
    };
    assert.deepEqual((await list({})).students.map(s => s.admissionNo), ['1/2024', '2/2025', '10/2025']);
    const filtered = await list({ department: String(a), limit: '1', page: '2' });
    assert.equal(filtered.pagination.totalStudents, 2);
    assert.equal(filtered.students[0].admissionNo, '10/2025');
    assert.equal((await list({ department: String(a), subDepartment: String(branch), batch: String(batch) })).students.length, 1);
    assert.equal((await list({ search: ' [A] ' })).students.length, 1);
    assert.equal((await list({ search: '.*' })).students.length, 0);
    assert.equal((await list({ sortBy: 'department' })).students[0].department.name, 'Atharvaveda');
    assert.equal((await list({ status: '', includeLeftout: 'true' })).pagination.totalStudents, 4);
    assert.equal((await list({ department: 'invalid' })).statusCode, 400);
    assert.equal((await list({ limit: '0' })).statusCode, 400);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
