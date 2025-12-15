import mongoose from 'mongoose';

// Helper to add timestamps to schemas
export const withTimestamps = (schema) => {
  schema.set('timestamps', true);
  return schema;
};

// Common ObjectId reference
export const oid = mongoose.Schema.Types.ObjectId;

// Common validation patterns
export const validators = {
  email: {
    validator: function(email) {
      return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email);
    },
    message: 'Please enter a valid email address'
  },
  phone: {
    validator: function(phone) {
      return /^[\+]?[1-9][\d]{0,15}$/.test(phone);
    },
    message: 'Please enter a valid phone number'
  }
}; 