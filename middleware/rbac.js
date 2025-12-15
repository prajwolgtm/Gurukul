import { ACCESS_LEVELS } from '../utils/roles.js';

// Check if user has one of the required roles
export const permit = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false,
      message: 'Unauthorized access. Please login first.' 
    });
  }
  
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ 
      success: false,
      message: 'Forbidden. Insufficient permissions.' 
    });
  }
  
  next();
};

// Check if user has minimum access level
export const requireAccessLevel = (minLevel) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false,
      message: 'Unauthorized access. Please login first.' 
    });
  }
  
  const userLevel = ACCESS_LEVELS[req.user.role] || 0;
  
  if (userLevel < minLevel) {
    return res.status(403).json({ 
      success: false,
      message: 'Forbidden. Insufficient access level.' 
    });
  }
  
  next();
};

// Check if user owns the resource or has admin privileges
export const ownerOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false,
      message: 'Unauthorized access. Please login first.' 
    });
  }
  
  const userLevel = ACCESS_LEVELS[req.user.role] || 0;
  const resourceUserId = req.params.userId || req.body.userId || req.query.userId;
  
  // Allow if user is admin/principal or owns the resource
  if (userLevel >= ACCESS_LEVELS.PRINCIPAL || req.user.id === resourceUserId) {
    return next();
  }
  
  return res.status(403).json({ 
    success: false,
    message: 'Forbidden. You can only access your own data.' 
  });
}; 