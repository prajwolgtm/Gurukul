export const ROLES = {
  ADMIN: 'Admin',
  COORDINATOR: 'Coordinator', // Hostel Coordinator - same access as Admin
  PRINCIPAL: 'Principal',
  HOD: 'HOD',
  TEACHER: 'Teacher',
  PARENT: 'Parent',
  CARETAKER: 'Caretaker', // Legacy role - kept for backward compatibility
  STUDENT: 'Student'
};

export const ACCESS_LEVELS = {
  [ROLES.ADMIN]: 10,
  [ROLES.COORDINATOR]: 10, // Same level as Admin - can do everything
  [ROLES.PRINCIPAL]: 9,
  [ROLES.HOD]: 7,
  [ROLES.TEACHER]: 5,
  [ROLES.CARETAKER]: 4, // Legacy Hostel Coordinator role
  [ROLES.PARENT]: 2,
  [ROLES.STUDENT]: 1
};

export const TASK_ASSIGNERS = new Set([ROLES.PRINCIPAL, ROLES.HOD]);
export const TASK_ASSIGNEES = new Set([ROLES.TEACHER]);

// Attendance Management Permissions
export const ATTENDANCE_MANAGERS = new Set([
  ROLES.ADMIN,
  ROLES.COORDINATOR, // Coordinator can manage all attendance
  ROLES.PRINCIPAL,
  ROLES.HOD,
  ROLES.CARETAKER // Legacy Hostel Coordinator
]);

export const ATTENDANCE_VIEWERS = new Set([
  ROLES.ADMIN,
  ROLES.COORDINATOR,
  ROLES.PRINCIPAL,
  ROLES.HOD,
  ROLES.TEACHER,
  ROLES.CARETAKER,
  ROLES.PARENT // Parents can view their child's attendance
]);

export const BULK_ATTENDANCE_MANAGERS = new Set([
  ROLES.ADMIN,
  ROLES.COORDINATOR, // Coordinator - main role for daily attendance
  ROLES.PRINCIPAL,
  ROLES.CARETAKER // Legacy Hostel Coordinator
]);

// Hostel Management Permissions
export const HOSTEL_MANAGERS = new Set([
  ROLES.ADMIN,
  ROLES.COORDINATOR, // Coordinator manages hostel
  ROLES.PRINCIPAL,
  ROLES.CARETAKER
]);

export const DISCIPLINARY_REPORTERS = new Set([
  ROLES.ADMIN,
  ROLES.COORDINATOR,
  ROLES.PRINCIPAL,
  ROLES.HOD,
  ROLES.TEACHER,
  ROLES.CARETAKER
]);

// Account Management Permissions
export const ACCOUNT_MANAGERS = new Set([
  ROLES.ADMIN,
  ROLES.COORDINATOR // Coordinator can manage all accounts
]);

export const TEACHER_VERIFIERS = new Set([
  ROLES.ADMIN,
  ROLES.COORDINATOR // Only Admin and Coordinator can verify teacher accounts
]);

// Full System Access (All permissions)
export const FULL_ACCESS_ROLES = new Set([
  ROLES.ADMIN,
  ROLES.COORDINATOR // Coordinator has same access as Admin
]);

// Exam Management Permissions
export const EXAM_MANAGERS = new Set([
  ROLES.ADMIN,
  ROLES.COORDINATOR,
  ROLES.PRINCIPAL,
  ROLES.HOD
]);

export const EXAM_VIEWERS = new Set([
  ROLES.ADMIN,
  ROLES.COORDINATOR,
  ROLES.PRINCIPAL,
  ROLES.HOD,
  ROLES.TEACHER,
  ROLES.PARENT // Parents can view their child's exam results
]);

// Class Management Permissions
export const CLASS_MANAGERS = new Set([
  ROLES.ADMIN,
  ROLES.COORDINATOR,
  ROLES.PRINCIPAL,
  ROLES.HOD,
  ROLES.TEACHER // Teachers can manage their assigned classes
]);

// Student Management Permissions
export const STUDENT_MANAGERS = new Set([
  ROLES.ADMIN,
  ROLES.COORDINATOR,
  ROLES.PRINCIPAL
]);

export const STUDENT_DATA_VIEWERS = new Set([
  ROLES.ADMIN,
  ROLES.COORDINATOR,
  ROLES.PRINCIPAL, 
  ROLES.HOD, 
  ROLES.TEACHER
]); 