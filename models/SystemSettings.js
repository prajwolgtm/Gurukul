import mongoose from 'mongoose';

const SystemSettingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['academic', 'system', 'general'],
    default: 'system'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for faster lookups
SystemSettingsSchema.index({ key: 1 });

// Static method to get a setting
SystemSettingsSchema.statics.getSetting = async function(key, defaultValue = null) {
  const setting = await this.findOne({ key });
  return setting ? setting.value : defaultValue;
};

// Static method to set a setting
SystemSettingsSchema.statics.setSetting = async function(key, value, description = null, updatedBy = null) {
  return await this.findOneAndUpdate(
    { key },
    { 
      value, 
      description: description || `Setting for ${key}`,
      updatedBy 
    },
    { upsert: true, new: true }
  );
};

const SystemSettings = mongoose.model('SystemSettings', SystemSettingsSchema);

export default SystemSettings;
