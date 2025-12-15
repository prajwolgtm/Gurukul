import jwt from 'jsonwebtoken';

export const auth = (req, res, next) => {
  const header = req.headers.authorization;
  
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false,
      message: 'Access denied. No token provided.' 
    });
  }
  
  const token = header.split(' ')[1];
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, role, email, fullName }
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false,
      message: 'Invalid token.' 
    });
  }
};

// Optional auth - doesn't fail if no token
export const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization;
  
  if (!header?.startsWith('Bearer ')) {
    return next();
  }
  
  const token = header.split(' ')[1];
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
  } catch (error) {
    // Ignore invalid tokens in optional auth
  }
  
  next();
}; 