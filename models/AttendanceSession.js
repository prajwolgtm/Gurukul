import mongoose from 'mongoose';
import { withTimestamps, oid } from './_base.js';

const AttendanceSessionSchema = withTimestamps(new mongoose.Schema({
  sessionKey: {
    type: String,
    required: true,
    unique: true
  },
  
  displayNames: {
    hindi: String,
    sanskrit: String,
    english: {
      type: String,
      required: true
    }
  },
  
  defaultTime: {
    type: String, // Format: "HH:MM"
    required: true
  },
  
  category: {
    type: String,
    enum: ['prayer', 'study', 'physical', 'meal', 'class', 'service'],
    required: true
  },
  
  priority: {
    type: Number,
    default: 1
  },
  
  duration: {
    type: Number, // in minutes
    default: 30
  },
  
  icon: String,
  color: String,
  
  isMandatory: {
    type: Boolean,
    default: true
  },
  
  rules: {
    type: String,
    default: ''
  },
  
  displayOrder: {
    type: Number,
    required: true
  }
}));

// Indexes
// Note: sessionKey index is automatically created by unique: true in schema
AttendanceSessionSchema.index({ displayOrder: 1 });
AttendanceSessionSchema.index({ category: 1 });

// Static method to initialize default sessions
AttendanceSessionSchema.statics.initializeDefaults = async function() {
  const defaultSessions = [
    {
      sessionKey: 'prayer_morning',
      displayNames: {
        hindi: 'प्रार्थना',
        sanskrit: 'प्रातः सन्ध्या',
        english: 'Prathana (Prātaḥ Sandhyā)'
      },
      defaultTime: '05:00',
      category: 'prayer',
      priority: 1,
      duration: 30,
      icon: '🙏',
      color: '#4CAF50',
      isMandatory: true,
      rules: 'All students must attend morning prayer',
      displayOrder: 1
    },
    {
      sessionKey: 'sandhya',
      displayNames: {
        hindi: 'सन्ध्या',
        sanskrit: 'सन्ध्या',
        english: 'Sandhyā'
      },
      defaultTime: '05:30',
      category: 'prayer',
      priority: 1,
      duration: 30,
      icon: '🙏',
      color: '#4CAF50',
      isMandatory: true,
      rules: 'Sandhyā prayer',
      displayOrder: 2
    },
    {
      sessionKey: 'yoga',
      displayNames: {
        hindi: 'योग',
        sanskrit: 'योग',
        english: 'Yoga'
      },
      defaultTime: '06:30',
      category: 'physical',
      priority: 2,
      duration: 45,
      icon: '🧘',
      color: '#FF9800',
      isMandatory: true,
      rules: 'Physical exercise and meditation',
      displayOrder: 3
    },
    {
      sessionKey: 'service',
      displayNames: {
        hindi: 'सेवा',
        sanskrit: 'सेवा',
        english: 'Sevā'
      },
      defaultTime: '07:15',
      category: 'service',
      priority: 3,
      duration: 30,
      icon: '🤝',
      color: '#9C27B0',
      isMandatory: true,
      rules: 'Community service activities',
      displayOrder: 4
    },
    {
      sessionKey: 'breakfast',
      displayNames: {
        hindi: 'नाश्ता',
        sanskrit: 'प्रातराशः',
        english: 'Breakfast'
      },
      defaultTime: '07:45',
      category: 'meal',
      priority: 1,
      duration: 45,
      icon: '🍳',
      color: '#FF5722',
      isMandatory: true,
      rules: 'Morning meal',
      displayOrder: 5
    },
    {
      sessionKey: 'morning_class',
      displayNames: {
        hindi: 'सुबह की कक्षा',
        sanskrit: 'प्रातःकालीनकक्षा',
        english: 'Morning Class'
      },
      defaultTime: '08:30',
      category: 'class',
      priority: 1,
      duration: 90,
      icon: '🎓',
      color: '#3F51B5',
      isMandatory: true,
      rules: 'Academic instruction',
      displayOrder: 6
    },
    {
      sessionKey: 'midday_prayer',
      displayNames: {
        hindi: 'दोपहर की प्रार्थना',
        sanskrit: 'मध्याह्नप्रार्थना',
        english: 'Midday Prayer'
      },
      defaultTime: '10:00',
      category: 'prayer',
      priority: 1,
      duration: 15,
      icon: '🙏',
      color: '#4CAF50',
      isMandatory: true,
      rules: 'Midday prayer session',
      displayOrder: 7
    },
    {
      sessionKey: 'lunch',
      displayNames: {
        hindi: 'दोपहर का भोजन',
        sanskrit: 'मध्याह्नभोजन',
        english: 'Lunch'
      },
      defaultTime: '12:00',
      category: 'meal',
      priority: 1,
      duration: 60,
      icon: '🍽️',
      color: '#FF5722',
      isMandatory: true,
      rules: 'Main meal of the day',
      displayOrder: 8
    },
    {
      sessionKey: 'afternoon_class',
      displayNames: {
        hindi: 'दोपहर की कक्षा',
        sanskrit: 'अपराह्नकक्षा',
        english: 'Afternoon Class'
      },
      defaultTime: '13:00',
      category: 'class',
      priority: 1,
      duration: 90,
      icon: '🎓',
      color: '#3F51B5',
      isMandatory: true,
      rules: 'Academic instruction',
      displayOrder: 9
    },
    {
      sessionKey: 'evening_prayer',
      displayNames: {
        hindi: 'शाम की प्रार्थना',
        sanskrit: 'सायंकालप्रार्थना',
        english: 'Evening Prayer'
      },
      defaultTime: '16:00',
      category: 'prayer',
      priority: 1,
      duration: 20,
      icon: '🙏',
      color: '#4CAF50',
      isMandatory: true,
      rules: 'Evening prayer session',
      displayOrder: 10
    },
    {
      sessionKey: 'evening_study',
      displayNames: {
        hindi: 'शाम का अध्ययन',
        sanskrit: 'सायंकालीनअध्ययन',
        english: 'Evening Study'
      },
      defaultTime: '16:30',
      category: 'study',
      priority: 2,
      duration: 60,
      icon: '📚',
      color: '#2196F3',
      isMandatory: true,
      rules: 'Group study and homework',
      displayOrder: 11
    },
    {
      sessionKey: 'dinner',
      displayNames: {
        hindi: 'रात का भोजन',
        sanskrit: 'रात्रिभोजन',
        english: 'Dinner'
      },
      defaultTime: '18:00',
      category: 'meal',
      priority: 1,
      duration: 45,
      icon: '🍽️',
      color: '#FF5722',
      isMandatory: true,
      rules: 'Evening meal',
      displayOrder: 12
    },
    {
      sessionKey: 'night_prayer',
      displayNames: {
        hindi: 'रात की प्रार्थना',
        sanskrit: 'रात्रिप्रार्थना',
        english: 'Night Prayer'
      },
      defaultTime: '19:00',
      category: 'prayer',
      priority: 1,
      duration: 15,
      icon: '🙏',
      color: '#4CAF50',
      isMandatory: true,
      rules: 'Final prayer of the day',
      displayOrder: 13
    },
    {
      sessionKey: 'bedtime',
      displayNames: {
        hindi: 'सोने का समय',
        sanskrit: 'शयनकाल',
        english: 'Bedtime'
      },
      defaultTime: '21:00',
      category: 'physical',
      priority: 3,
      duration: 0,
      icon: '😴',
      color: '#607D8B',
      isMandatory: true,
      rules: 'Lights out and sleep',
      displayOrder: 14
    }
  ];

  try {
    // Clear existing sessions
    await this.deleteMany({});
    
    // Insert default sessions
    const sessions = await this.insertMany(defaultSessions);
    
    console.log(`✅ Initialized ${sessions.length} default attendance sessions`);
    return sessions;
  } catch (error) {
    console.error('❌ Error initializing default sessions:', error);
    throw error;
  }
};

// Method to get display name based on language preference
AttendanceSessionSchema.methods.getDisplayName = function(language = 'english') {
  return this.displayNames[language] || this.displayNames.english || this.sessionKey;
};

// Method to get sessions by category
AttendanceSessionSchema.statics.getByCategory = function(category) {
  return this.find({ category }).sort({ displayOrder: 1 });
};

// Method to get sessions in display order
AttendanceSessionSchema.statics.getInOrder = function() {
  return this.find().sort({ displayOrder: 1 });
};

export default mongoose.model('AttendanceSession', AttendanceSessionSchema); 