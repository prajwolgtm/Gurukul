# 🎓 Gurukul Education Management Backend

A modern, scalable backend API for education management systems built with Node.js, Express, and MongoDB.

## 🚀 Features

- **Role-based Authentication** (Admin, Principal, HOD, Teacher, Parent, Caretaker, Student)
- **Comprehensive User Management** with enhanced profiles
- **Student Information System** with academic tracking
- **Role-based Access Control (RBAC)** for secure operations
- **Modern ES6 Modules** architecture
- **RESTful API Design** with consistent responses
- **Comprehensive Error Handling**

## 📁 Project Structure

```
backend/
├── src/
│   ├── server.js              # Main server file
│   ├── config/
│   │   └── db.js             # Database configuration
│   ├── utils/
│   │   └── roles.js          # Role definitions and permissions
│   ├── middleware/
│   │   ├── auth.js           # JWT authentication
│   │   └── rbac.js           # Role-based access control
│   ├── models/
│   │   ├── _base.js          # Common model utilities
│   │   ├── Role.js           # Role model
│   │   ├── User.js           # User model (enhanced)
│   │   └── Student.js        # Student model
│   └── routes/
│       └── auth.routes.js    # Authentication routes
├── package.json
├── .env.example              # Environment variables template
└── README.md
```

## 🛠️ Installation & Setup

### 1. Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or cloud)
- npm or yarn

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your actual values
nano .env
```

Required environment variables:
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/gurukul
JWT_SECRET=your_super_secret_jwt_key_here
CORS_ORIGIN=http://localhost:5173
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASS=your_password
```

### 4. Start the Server
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

## 🧪 Testing the API

### Health Check
```bash
# Test if server is running
curl http://localhost:5000/api/health

# Expected response:
{
  "success": true,
  "message": "API is healthy",
  "uptime": 123.456,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "development"
}
```

### Authentication Testing

#### 1. Register a User
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "John Doe",
    "email": "john@example.com", 
    "password": "password123",
    "role": "teacher"
  }'
```

#### 2. Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

#### 3. Get Current User (Protected Route)
```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

## 🔐 Roles & Permissions

| Role | Access Level | Description |
|------|-------------|-------------|
| Admin | 100 | Full system access |
| Principal | 90 | School management |
| HOD | 80 | Department management |
| Teacher | 70 | Class and student management |
| Caretaker | 60 | Hostel and student care |
| Parent | 50 | Student progress viewing |
| Student | 40 | Limited self-data access |

## 📚 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user info

### Health & Status
- `GET /` - Basic API info
- `GET /api/health` - Detailed health check

## 🔄 Next Steps

The current implementation includes:
- ✅ Basic authentication system
- ✅ Role-based access control
- ✅ User and Student models
- ✅ ES6 modules architecture

**Coming Soon:**
- Student management routes
- Attendance tracking
- Task assignment system
- Leave management
- Exam and results system
- Parent portal features

## 🛡️ Security Features

- **Password Hashing** with bcrypt
- **JWT Authentication** with 30-day expiry
- **Role-based Access Control**
- **Input Validation** and sanitization
- **CORS Protection** with configurable origins
- **Environment-based Configuration**

## 🐛 Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**
   - Check if MongoDB is running
   - Verify MONGO_URI in .env file
   - Ensure network connectivity

2. **JWT Token Invalid**
   - Check JWT_SECRET in .env
   - Verify token format: `Bearer <token>`

3. **Role Permission Denied**
   - Check user role in database
   - Verify role permissions in `src/utils/roles.js`

## 📝 Development Notes

- Uses ES6 modules (`"type": "module"` in package.json)
- Follows RESTful API conventions
- Consistent error response format
- Comprehensive logging for debugging
- Modular architecture for scalability 