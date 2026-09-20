import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  questionId: {
    type: String,
    required: true
  },
  prompt: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['CODING', 'SYSTEM_DESIGN', 'BEHAVIORAL', 'TECHNICAL_DEEP_DIVE'],
    required: true
  },
  difficulty: {
    type: String,
    enum: ['ENTRY', 'MID', 'SENIOR', 'STAFF'],
    default: 'MID'
  },
  competencyIds: [{
    type: String
  }],
  estimatedMinutes: {
    type: Number,
    default: 20
  },
  answerFramework: {
    approach: { type: String, default: '' },
    keyPointsToCover: [{ type: String }],
    commonTraps: [{ type: String }],
    sampleOutline: { type: String, default: '' }
  },
  rubric: {
    criteria: { type: String, default: '' },
    level1Deficient: { type: String, default: '' },
    level3Acceptable: { type: String, default: '' },
    level5Exceptional: { type: String, default: '' }
  },
  isCustomized: {
    type: Boolean,
    default: false
  },
  revision: {
    type: Number,
    default: 1
  },
  userNotes: {
    type: String,
    default: ''
  },
  origin: {
    type: String,
    enum: ['GENERATED', 'USER_EDITED', 'USER_CREATED'],
    default: 'GENERATED'
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  order: {
    type: Number,
    default: 0
  }
});

const moduleSchema = new mongoose.Schema({
  moduleId: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['TECHNICAL', 'SYSTEM_DESIGN', 'BEHAVIORAL', 'COMPANY_SPECIFIC'],
    required: true
  },
  priority: {
    type: String,
    enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
    default: 'HIGH'
  },
  questions: [questionSchema]
});

const competencySchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['CORE_TECHNICAL', 'SYSTEM_DESIGN', 'BEHAVIORAL', 'DOMAIN_KNOWLEDGE'],
    required: true
  },
  importance: {
    type: String,
    enum: ['CRITICAL', 'HIGH', 'MEDIUM'],
    default: 'HIGH'
  },
  proficiencyRequired: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  }
});

const prepKitSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    targetRole: {
      type: String,
      required: [true, 'Target role is required'],
      trim: true
    },
    targetCompany: {
      type: String,
      required: [true, 'Target company is required'],
      trim: true
    },
    companyUrl: {
      type: String,
      trim: true
    },
    jobDescriptionRaw: {
      type: String,
      required: [true, 'Job description is required']
    },
    candidateResumeRaw: {
      type: String
    },
    companyProfile: {
      name: String,
      industry: String,
      techStack: [String],
      engineeringValues: [String],
      interviewFormatSummary: String,
      researchedAt: Date
    },
    requirements: [{
      id: { type: String, required: true },
      text: { type: String, required: true },
      kind: { type: String, required: true },
      priority: { type: String, required: true },
      sourceSnippet: { type: String },
      origin: {
        type: String,
        enum: ['GENERATED', 'USER_EDITED', 'USER_CREATED'],
        default: 'GENERATED'
      },
      isPinned: {
        type: Boolean,
        default: false
      }
    }],
    isSparseJd: {
      type: Boolean,
      default: false
    },
    insufficientInfoNotes: {
      type: String,
      default: null
    },
    roleBreakdown: {
      title: String,
      seniority: String,
      coreFocus: String,
      dayToDayResponsibilities: [String],
      primaryChallenges: [String],
      successCriteria: [String]
    },
    companyBrief: {
      overview: String,
      missionValues: [String],
      products: [String],
      techStack: [String],
      interviewCulture: String,
      sourceAttribution: [String]
    },
    flashcards: [{
      id: String,
      targetRequirementId: String,
      category: String,
      frontPrompt: String,
      backKeyPoints: [String],
      quickTip: String,
      origin: {
        type: String,
        enum: ['GENERATED', 'USER_EDITED', 'USER_CREATED'],
        default: 'GENERATED'
      },
      isPinned: {
        type: Boolean,
        default: false
      },
      confidence: {
        type: Number,
        min: 1,
        max: 4,
        default: null
      },
      reviewCount: {
        type: Number,
        default: 0
      },
      isCovered: {
        type: Boolean,
        default: false
      },
      lastReviewedAt: {
        type: Date,
        default: null
      },
      order: {
        type: Number,
        default: 0
      }
    }],
    schedule: [{
      day: { type: Number, required: true },
      focus: { type: String, required: true },
      question_ids: [{ type: String }],
      allocatedMinutes: { type: Number, default: 0 },
      mustHaveCoverage: [{ type: String }],
      isReviewDay: { type: Boolean, default: false }
    }],
    competencies: [competencySchema],
    modules: [moduleSchema],
    coverageScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    uncoveredGaps: [{
      type: String
    }],
    status: {
      type: String,
      enum: ['PENDING', 'RESEARCHING', 'GENERATING', 'READY', 'DIRTY_EDITING', 'FAILED'],
      default: 'PENDING',
      index: true
    },
    version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: true
  }
);

prepKitSchema.index({ userId: 1, createdAt: -1 });

export const PrepKit = mongoose.model('PrepKit', prepKitSchema);
export default PrepKit;
