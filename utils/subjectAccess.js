export const buildExamSubjectsWithTeachers = async (subjectConfigs) => {
  return Promise.all(subjectConfigs.map(async config => {
    const source = typeof config === 'string' ? {} : config;
    const subjectId = typeof config === 'string' ? config : config.subject || config._id;
    const requestedAccess = Array.isArray(source.teacherAccess) ? source.teacherAccess : [];
    const accessByTeacher = new Map();
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
