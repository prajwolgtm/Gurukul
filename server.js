import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';

// Import routes
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import taskRoutes from './routes/tasks.routes.js';
import departmentRoutes from './routes/departments.routes.js';
import requestRoutes from './routes/requests.routes.js';
import teacherAssignmentRoutes from './routes/teacher-assignments.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import attendanceSessionRoutes from './routes/attendance-sessions.routes.js';
import classRoutes from './routes/classes.routes.js';
import classAttendanceRoutes from './routes/class-attendance.routes.js';
import examRoutes from './routes/exams.routes.js';
import examMarksRoutes from './routes/exam-marks.routes.js';
import examReportsRoutes from './routes/exam-reports.routes.js';
import studentManagementRoutes from './routes/student-management.routes.js';
import accountManagementRoutes from './routes/account-management.routes.js';
import subjectsRoutes from './routes/subjects.routes.js';
import enhancedExamsRoutes from './routes/enhanced-exams.routes.js';
import marksManagementRoutes from './routes/marks-management.routes.js';
import uploadRoutes from './routes/upload.routes.js';

// NEW CLEAN SYSTEM ROUTES
import academicStructureRoutes from './routes/academic-structure.routes.js';
import studentsRoutes from './routes/students.routes.js';
import teacherManagementRoutes from './routes/teacher-management.routes.js';
import teacherAssignmentsRoutes from './routes/teacher-assignments.routes.js';
import examManagementRoutes from './routes/exam-management.routes.js';
import examMarksManagementRoutes from './routes/exam-marks.routes.js';
import staffAttendanceRoutes from './routes/staff-attendance.routes.js';
import studentProfileRoutes from './routes/student-profile.routes.js';
import parentDashboardRoutes from './routes/parent-dashboard.routes.js';
import academicYearRoutes from './routes/academic-year.routes.js';
import systemSettingsRoutes from './routes/system-settings.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET'];
const missing = requiredEnvVars.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  console.error('Please create a .env file in the backend directory with all required variables.');
  console.error('See SETUP.md or .env.example for reference.');
  process.exit(1);
}

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', process.env.CORS_ORIGIN].filter(Boolean),
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
connectDB();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/teacher-assignments', teacherAssignmentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/attendance-sessions', attendanceSessionRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/class-attendance', classAttendanceRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/exam-marks', examMarksRoutes);
app.use('/api/exam-reports', examReportsRoutes);
app.use('/api/student-management', studentManagementRoutes);
app.use('/api/account-management', accountManagementRoutes);
app.use('/api/subjects', subjectsRoutes);
app.use('/api/enhanced-exams', enhancedExamsRoutes);
app.use('/api/marks-management', marksManagementRoutes);
app.use('/api/upload', uploadRoutes);

// NEW CLEAN SYSTEM ROUTES
app.use('/api/academic', academicStructureRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/teachers', teacherManagementRoutes);
app.use('/api/teacher-assignments', teacherAssignmentsRoutes);
app.use('/api/exam-management', examManagementRoutes);
app.use('/api/exam-marks-management', examMarksManagementRoutes);
app.use('/api/staff-attendance', staffAttendanceRoutes);
app.use('/api/student-profile', studentProfileRoutes);
app.use('/api/parent-dashboard', parentDashboardRoutes);
app.use('/api/academic-year', academicYearRoutes);
app.use('/api/system-settings', systemSettingsRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Basic health check route
app.get('/', (req, res) => {
  res.json({ 
    success: true,
    message: '🎓 Gurukul Education Management API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 3001; // Default to 3001 for consistency

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
}); 