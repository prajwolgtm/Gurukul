const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - verify JWT token
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({ 
          success: false,
          message: 'User not found' 
        });
      }

      next();
    } catch (error) {
      console.error('Token verification error:', error);
      res.status(401).json({ 
        success: false,
        message: 'Not authorized, invalid token' 
      });
    }
  }

  if (!token) {
    res.status(401).json({ 
      success: false,
      message: 'Not authorized, no token' 
    });
  }
};

// Role-based authorization middleware
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: 'Not authorized' 
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route` 
      });
    }

    next();
  };
};

// Specific role middlewares
const requireAdmin = authorizeRoles('admin');
const requirePrincipal = authorizeRoles('principal');
const requireTeacher = authorizeRoles('teacher');
const requireParent = authorizeRoles('parent');
const requireCaretaker = authorizeRoles('caretaker');

module.exports = {
  protect,
  authorizeRoles,
  requireAdmin,
  requirePrincipal,
  requireTeacher,
  requireParent,
  requireCaretaker,
}; 