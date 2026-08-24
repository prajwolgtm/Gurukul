import SubjectClass from '../models/SubjectClass.js';
import Teacher from '../models/Teacher.js';
import Department from '../models/Department.js';
import SubDepartment from '../models/SubDepartment.js';
import Batch from '../models/Batch.js';

const addId = (set, value) => {
  const id = value?._id || value;
  if (id) set.add(id.toString());
};

export const resolveSubjectTeacherIds = async (subject) => {
  const ids = new Set();
  (subject.teachers || []).forEach(link => addId(ids, link.teacher));

  const [classes, teacherProfiles, departments, subDepartments, batches] = await Promise.all([
    SubjectClass.find({ _id: { $in: subject.classes || [] }, isDeleted: { $ne: true } })
      .select('classTeacher additionalTeachers.teacher').lean(),
    Teacher.find({
      status: 'active',
      $or: [
        { departments: { $in: subject.departments || [] } },
        { subDepartments: { $in: subject.subDepartments || [] } },
        { batches: { $in: subject.batches || [] } }
      ]
    }).select('user').lean(),
    Department.find({ _id: { $in: subject.departments || [] } }).select('hod').lean(),
    SubDepartment.find({ _id: { $in: subject.subDepartments || [] } }).select('coordinator').lean(),
    Batch.find({ _id: { $in: subject.batches || [] } }).select('classTeacher').lean()
  ]);

  classes.forEach(item => {
    addId(ids, item.classTeacher);
    (item.additionalTeachers || []).forEach(link => addId(ids, link.teacher));
  });
  teacherProfiles.forEach(item => addId(ids, item.user));
  departments.forEach(item => addId(ids, item.hod));
  subDepartments.forEach(item => addId(ids, item.coordinator));
  batches.forEach(item => addId(ids, item.classTeacher));

  return [...ids];
};

export const buildExamSubjectsWithTeachers = async (subjectConfigs, subjectDocuments) => {
  const documentsById = new Map(subjectDocuments.map(subject => [subject._id.toString(), subject]));

  return Promise.all(subjectConfigs.map(async config => {
    const source = typeof config === 'string' ? {} : config;
    const subjectId = typeof config === 'string' ? config : config.subject || config._id;
    const subject = documentsById.get(subjectId.toString());
    const automaticTeachers = subject ? await resolveSubjectTeacherIds(subject) : [];
    const requestedAccess = Array.isArray(source.teacherAccess) ? source.teacherAccess : [];
    const accessByTeacher = new Map(automaticTeachers.map(teacher => [teacher, 'edit']));
    requestedAccess.forEach(link => {
      const teacher = link?.teacher?._id || link?.teacher;
      if (teacher) accessByTeacher.set(teacher.toString(), link.permission === 'view' ? 'view' : 'edit');
    });

    const result = {
      subject: subjectId,
      maxMarks: source.maxMarks || 100,
      passingMarks: source.passingMarks || 40,
      weightage: source.weightage || 1,
      useDivisions: Boolean(source.useDivisions),
      divisions: [] ,
      teacherAccess: [...accessByTeacher].map(([teacher, permission]) => ({ teacher, permission }))
    };

    if (result.useDivisions) {
      result.divisions = Array.from({ length: 10 }, (_, index) => ({
        name: `Division ${index + 1}`,
        maxMarks: 10,
        order: index + 1
      }));
    }
    return result;
  }));
};

export const mergeTeacherIds = (...groups) => [...new Set(groups.flat().filter(Boolean).map(String))];
