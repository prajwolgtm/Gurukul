import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

const SOURCE =
  process.argv[2] ||
  '/Users/prajwolgautam/Downloads/Chatra Admission Details-Veda Dept_2022.xlsx';

const OUT_DIR = process.argv[3] || '/tmp';

const HEADER_ALIASES = {
  'admission no': 'admissionNo',
  'full name': 'fullName',
  'd o b': 'dateOfBirth',
  'blood group': 'bloodGroup',
  shaakha: 'shaakha',
  gothra: 'gothra',
  'telephone / mobile no': 'phone',
  'father name': 'fatherName',
  'mother name': 'motherName',
  'parents name': 'parentsName',
  occupation: 'occupation',
  nationality: 'nationality',
  religion: 'religion',
  caste: 'caste',
  'mother tongue': 'motherTongue',
  'present address': 'presentAddress',
  'permanent address': 'permanentAddress',
  'last school attended': 'lastSchoolAttended',
  'last standard studied': 'lastStandardStudied',
  't c details': 'tcDetails',
  'admitted to standard': 'admittedToStandard',
  'date of admission': 'dateOfAdmission',
  'current standard': 'currentStandard',
  remarks: 'remarks'
};

const PRIORITY = [
  'Admission 2016-17',
  'Admission 2017-18',
  'Admission 2018-19',
  'Admission 2019-20',
  'Admission 2020-21',
  'Admission 2021-22',
  'Admission 2022-23',
  'B.A Students Details',
  'Quit Records',
  'Live Records'
];

const clean = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\r\n/g, '\n').trim();
};

const normalizeHeader = (value) => clean(value).replace(/\s+/g, ' ').toLowerCase();

const normalizeAdmissionNo = (value) => clean(value)
  .replace(/\s+/g, '')
  .replace(/^0+(\d+\/)/, '$1')
  .toLowerCase();

const excelDateToISO = (value) => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return '';
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).toISOString().slice(0, 10);
  }
  const text = clean(value);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString().slice(0, 10);
};

const splitParentName = (value) => {
  const text = clean(value);
  if (!text) return {};
  const parts = text.split(/\n|,|&|\band\b/i).map(part => part.trim()).filter(Boolean);
  return {
    fatherName: parts[0] || text,
    motherName: parts[1] || ''
  };
};

const workbook = XLSX.readFile(SOURCE, { cellDates: false });
const recordsByAdmission = new Map();

for (const sheetName of PRIORITY) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) continue;

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  const headerIndex = rows.findIndex(row =>
    row.some(cell => normalizeHeader(cell) === 'admission no')
  );
  if (headerIndex === -1) continue;

  const headers = rows[headerIndex].map(header => HEADER_ALIASES[normalizeHeader(header)] || '');

  for (const row of rows.slice(headerIndex + 1)) {
    const record = {};
    headers.forEach((field, index) => {
      if (!field) return;
      const value = row[index];
      if (field === 'dateOfBirth' || field === 'dateOfAdmission') {
        record[field] = excelDateToISO(value);
      } else {
        record[field] = clean(value);
      }
    });

    if (!record.admissionNo || !record.fullName) continue;

    if (record.parentsName && (!record.fatherName || !record.motherName)) {
      const split = splitParentName(record.parentsName);
      record.fatherName ||= split.fatherName;
      record.motherName ||= split.motherName;
    }

    record.guardianPhone = record.phone || '';
    record.address = record.presentAddress || record.permanentAddress || '';
    record.sourceStatus = sheetName === 'Quit Records' ? 'quit' : 'live';

    const key = normalizeAdmissionNo(record.admissionNo);
    const existing = recordsByAdmission.get(key) || { sourceSheets: [] };
    const merged = { ...existing };

    for (const [field, value] of Object.entries(record)) {
      if (value !== '') merged[field] = value;
    }

    merged.sourceSheets = [...new Set([...(existing.sourceSheets || []), sheetName])];
    merged.sourceSheet = merged.sourceSheets.join(', ');
    recordsByAdmission.set(key, merged);
  }
}

const records = [...recordsByAdmission.values()].map(record => {
  const { sourceSheets, ...rest } = record;
  return rest;
});

const dryRunPayload = {
  dryRun: true,
  onlyFillMissing: true,
  updateStatusFromQuitRecords: false,
  records
};

const applyPayload = {
  ...dryRunPayload,
  dryRun: false
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const dryRunPath = path.join(OUT_DIR, 'gurukul-student-reference-dry-run.json');
const applyPath = path.join(OUT_DIR, 'gurukul-student-reference-apply.json');
fs.writeFileSync(dryRunPath, JSON.stringify(dryRunPayload));
fs.writeFileSync(applyPath, JSON.stringify(applyPayload));

console.log(JSON.stringify({
  source: SOURCE,
  records: records.length,
  dryRunPath,
  applyPath,
  sample: records.slice(0, 5)
}, null, 2));
