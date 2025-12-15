const norm = (value = '') => value
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const DEPT_ALIASES = {
  rigveda: ['rig', 'rig veda', 'rigveda', 'rg veda', 'rgveda'],
  yajurveda: ['yajur', 'yajur veda', 'yajurveda', 'krishna', 'shukla', 'k yajur', 'yejur', 'yaju'],
  samaveda: ['sama', 'sama veda', 'samaveda', 'sama-veda'],
  atharvaveda: ['atharva', 'atharva veda', 'atharvaveda', 'atharvan']
};

const SUB_ALIASES = {
  rigveda: {
    shaakal: ['shaakal', 'shakal', 'sakhal', 'shakhal', 'saakal']
  },
  yajurveda: {
    taittiriya: ['taittiriya', 'taittriya', 'tittiriya', 'krishna', 'krsna'],
    kanva: ['kanva'],
    madhyandina: ['madhyandina', 'madhyandine', 'madhyan'],
  },
  samaveda: {
    ranayaneeya: ['ranayaneeya', 'ranayani', 'ranayaneya'],
    kauthuma: ['kauthuma', 'kauthum', 'kautham']
  },
  atharvaveda: {
    shaunaka: ['shaunaka', 'shaunak', 'saunaka']
  }
};

export const resolveDepartmentAndSub = (departments = [], subDepartments = [], rawInputs = []) => {
  const inputs = rawInputs.filter(Boolean).map(norm);

  const deptByNorm = new Map();
  departments.forEach(d => {
    deptByNorm.set(norm(d.name), d);
    deptByNorm.set(norm(d.code || ''), d);
  });

  const subByNorm = new Map();
  subDepartments.forEach(s => {
    subByNorm.set(norm(s.name), s);
    subByNorm.set(norm(s.code || ''), s);
  });

  const matchDeptAlias = () => {
    for (const input of inputs) {
      for (const [key, aliases] of Object.entries(DEPT_ALIASES)) {
        if (aliases.some(alias => input.includes(alias))) {
          return key;
        }
      }
    }
    return null;
  };

  const matchSubAlias = () => {
    for (const input of inputs) {
      for (const [deptKey, subs] of Object.entries(SUB_ALIASES)) {
        for (const [subKey, aliases] of Object.entries(subs)) {
          if (aliases.some(alias => input.includes(alias))) {
            return { deptKey, subKey };
          }
        }
      }
    }
    return null;
  };

  // 1) Exact/contains match to known departments
  let department = null;
  for (const input of inputs) {
    if (!input) continue;
    
    // Try exact match first
    if (deptByNorm.has(input)) {
      department = deptByNorm.get(input);
      break;
    }
    
    // Try contains match (both directions)
    for (const [k, doc] of deptByNorm.entries()) {
      if (!k) continue;
      // Remove spaces for comparison
      const inputNoSpace = input.replace(/\s/g, '');
      const kNoSpace = k.replace(/\s/g, '');
      if (inputNoSpace === kNoSpace || input.includes(k) || k.includes(input)) {
        department = doc;
        break;
      }
    }
    if (department) break;
  }

  // 2) Subdepartment inference
  let subDepartment = null;
  for (const input of inputs) {
    if (subByNorm.has(input)) {
      subDepartment = subByNorm.get(input);
      break;
    }
    for (const [k, doc] of subByNorm.entries()) {
      if (k && input.includes(k)) {
        subDepartment = doc;
        break;
      }
    }
    if (subDepartment) break;
  }

  // 3) Alias-based inference
  if (!subDepartment) {
    const subAlias = matchSubAlias();
    if (subAlias) {
      const candidates = subDepartments.filter(s => norm(s.name).includes(subAlias.subKey) || norm(s.code || '').includes(subAlias.subKey));
      if (candidates.length === 1) subDepartment = candidates[0];
    }
  }

  if (!department && subDepartment && subDepartment.department) {
    department = departments.find(d => d._id.toString() === subDepartment.department.toString()) || null;
  }

  if (!department) {
    const deptAlias = matchDeptAlias();
    if (deptAlias) {
      department = departments.find(d => norm(d.name).includes(deptAlias) || norm(d.code || '').includes(deptAlias)) || null;
    }
  }

  return { department, subDepartment };
};
