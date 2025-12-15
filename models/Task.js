import mongoose from 'mongoose';
import { withTimestamps, oid } from './_base.js';

const TaskSchema = withTimestamps(new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Task title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  
  description: {
    type: String,
    required: [true, 'Task description is required'],
    trim: true
  },
  
  created_by: {
    type: oid,
    ref: 'User',
    required: true
  },
  
  assigned_to: {
    type: oid,
    ref: 'User',
    required: true
  },
  
  stage: {
    type: Number,
    enum: [1, 2, 3],
    default: 1,
    required: true
  },
  
  priority: {
    type: Number,
    enum: [1, 2, 3, 4, 5], // 1 = Critical, 2 = High, 3 = Medium, 4 = Low, 5 = Very Low
    default: 3,
    required: true
  },
  
  due_date: {
    type: Date,
    required: [true, 'Due date is required']
  },
  
  actual_closure_date: {
    type: Date
  },
  
  status: {
    type: String,
    enum: ['open', 'ongoing', 'hold', 'completed'],
    default: 'open',
    required: true
  },
  
  // Multiple attachments
  attachments: [String], // Store file URLs/paths
  
  // Additional fields for better task management
  comments: [{
    user: {
      type: oid,
      ref: 'User',
      required: true
    },
    comment: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Task completion percentage
  progress_percentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  // Task category for better organization
  category: {
    type: String,
    enum: ['academic', 'administrative', 'maintenance', 'event', 'exam', 'other'],
    default: 'other'
  }
}));

// Indexes for better performance
TaskSchema.index({ assigned_to: 1, status: 1 });
TaskSchema.index({ created_by: 1 });
TaskSchema.index({ due_date: 1 });
TaskSchema.index({ priority: 1, status: 1 });

// Virtual for checking if task is overdue
TaskSchema.virtual('isOverdue').get(function() {
  if (this.status === 'completed') return false;
  return new Date() > this.due_date;
});

// Method to add comment
TaskSchema.methods.addComment = function(userId, comment) {
  this.comments.push({
    user: userId,
    comment: comment,
    timestamp: new Date()
  });
  return this.save();
};

// Method to update progress
TaskSchema.methods.updateProgress = function(percentage) {
  this.progress_percentage = Math.max(0, Math.min(100, percentage));
  
  // Auto-update status based on progress
  if (percentage === 0) {
    this.status = 'open';
  } else if (percentage > 0 && percentage < 100) {
    this.status = 'ongoing';
  } else if (percentage === 100) {
    this.status = 'completed';
    this.actual_closure_date = new Date();
  }
  
  return this.save();
};

// Priority labels for frontend
TaskSchema.statics.getPriorityLabel = function(priority) {
  const labels = {
    1: 'Critical',
    2: 'High', 
    3: 'Medium',
    4: 'Low',
    5: 'Very Low'
  };
  return labels[priority] || 'Unknown';
};

// Stage labels for frontend
TaskSchema.statics.getStageLabel = function(stage) {
  const labels = {
    1: 'Planning',
    2: 'In Progress', 
    3: 'Review'
  };
  return labels[stage] || 'Unknown';
};

export default mongoose.model('Task', TaskSchema); 