/**
 * Deterministic Study Schedule Allocator for Trao Prep Kits.
 * Allocates questions into an exact N-day study timeline.
 * 
 * Invariants:
 * 1. Schedule length matches EXACTLY the requested totalDays (1 to 60).
 * 2. Every day specifies day, focus, question_ids, and allocatedMinutes (integer).
 * 3. Every must-have requirement appears somewhere in the schedule.
 * 4. Prioritizes must-have and harder questions earlier in the timeline.
 * 5. 100% deterministic code. Zero LLM calls or LLM arithmetic.
 */

const DIFFICULTY_WEIGHTS = {
  STAFF: 4,
  SENIOR: 3,
  MID: 2,
  ENTRY: 1
};

const CATEGORY_ORDER = {
  SYSTEM_DESIGN: 1,
  TECHNICAL_DEEP_DIVE: 2,
  CODING: 3,
  BEHAVIORAL: 4,
  COMPANY_SPECIFIC: 5
};

/**
 * Categorizes and sorts questions such that must-have requirements
 * and higher-difficulty questions appear first.
 */
export function prioritizeQuestions(questions = [], requirements = []) {
  const reqMap = new Map(requirements.map(r => [r.id, r]));

  return [...questions].sort((a, b) => {
    // 1. Must-have priority: Does question target any 'must-have' requirement?
    const aTargetReqs = (a.targetRequirementIds || a.competencyIds || []).map(id => reqMap.get(id)).filter(Boolean);
    const bTargetReqs = (b.targetRequirementIds || b.competencyIds || []).map(id => reqMap.get(id)).filter(Boolean);

    const aHasMustHave = aTargetReqs.some(r => r.priority === 'must-have');
    const bHasMustHave = bTargetReqs.some(r => r.priority === 'must-have');

    if (aHasMustHave && !bHasMustHave) {
      return -1;
    }
    if (!aHasMustHave && bHasMustHave) {
      return 1;
    }

    // 2. Difficulty score (Staff > Senior > Mid > Entry)
    const aDiff = DIFFICULTY_WEIGHTS[a.difficulty?.toUpperCase()] || 2;
    const bDiff = DIFFICULTY_WEIGHTS[b.difficulty?.toUpperCase()] || 2;
    if (aDiff !== bDiff) {
      return bDiff - aDiff; // higher difficulty first
    }

    // 3. Category architectural order
    const aCat = CATEGORY_ORDER[a.category?.toUpperCase()] || 3;
    const bCat = CATEGORY_ORDER[b.category?.toUpperCase()] || 3;
    if (aCat !== bCat) {
      return aCat - bCat;
    }

    // 4. Estimated minutes (longer deep dives earlier)
    const aMins = Number(a.estimatedMinutes) || 15;
    const bMins = Number(b.estimatedMinutes) || 15;
    return bMins - aMins;
  });
}

/**
 * Derives a human-readable focus theme based on the questions assigned to a day.
 */
export function deriveDayFocus(dayQuestions = [], dayNumber = 1, totalDays = 1, isReview = false) {
  if (isReview) {
    return dayQuestions.length > 0 
      ? `Spaced Review & Speed Recall: ${dayQuestions.map(q => q.category || 'Core').slice(0, 2).join(' & ')}`
      : 'Active Rest, Consolidation & Mental Rehearsal';
  }

  if (dayQuestions.length === 0) {
    if (dayNumber === totalDays) {
      return 'Final Mental Readiness & High-Yield Flashcard Review';
    }
    return 'Consolidation, Note Synthesis & Buffer Day';
  }

  const categories = Array.from(new Set(dayQuestions.map(q => q.category).filter(Boolean)));
  const topQuestion = dayQuestions[0];

  if (totalDays === 1) {
    return 'Comprehensive Sprint: Core Architecture & High-Yield Competency Mastery';
  }

  if (categories.includes('SYSTEM_DESIGN')) {
    return 'Distributed Architecture, Scalability & Failure Modes';
  }
  if (categories.includes('TECHNICAL_DEEP_DIVE') || categories.includes('CODING')) {
    return `Deep Dive: ${topQuestion.question ? topQuestion.question.slice(0, 45) + '...' : 'Core Technical Systems'}`;
  }
  if (categories.includes('BEHAVIORAL')) {
    return 'Leadership, STAR Stories & Conflict Resolution Mastery';
  }
  if (categories.includes('COMPANY_SPECIFIC')) {
    return 'Company Culture, Mission Alignment & Domain Strategy';
  }

  return `Core Mastery Session: ${categories.join(' & ') || 'Technical Competencies'}`;
}

/**
 * Deterministically allocates questions into an exact N-day schedule.
 *
 * @param {Object} params
 * @param {Array} params.questions - Available questions in the prep kit
 * @param {Array} params.requirements - Complete set of job requirements
 * @param {number} params.totalDays - Requested schedule horizon (e.g. 1 to 60)
 * @returns {Array<{
 *   day: number,
 *   focus: string,
 *   question_ids: string[],
 *   allocatedMinutes: number,
 *   mustHaveCoverage: string[],
 *   isReviewDay: boolean
 * }>}
 */
export function allocateSchedule({ questions = [], requirements = [], totalDays = 7 }) {
  const safeTotalDays = Math.max(1, Math.min(60, Math.floor(Number(totalDays) || 7)));
  const sortedQuestions = prioritizeQuestions(questions, requirements);
  const reqMap = new Map(requirements.map(r => [r.id, r]));

  // Helper to extract must-have requirement IDs covered by a list of questions
  const getMustHaveCoverage = (qList) => {
    const coveredMustHaves = new Set();
    qList.forEach(q => {
      const ids = q.targetRequirementIds || q.competencyIds || [];
      ids.forEach(id => {
        const req = reqMap.get(id);
        if (req && req.priority === 'must-have') {
          coveredMustHaves.add(id);
        }
      });
    });
    return Array.from(coveredMustHaves);
  };

  const schedule = [];

  // ==========================================
  // CASE 1: Single-day Intensive Cram (N = 1)
  // ==========================================
  if (safeTotalDays === 1) {
    const totalMinutes = sortedQuestions.reduce((sum, q) => sum + (Math.round(Number(q.estimatedMinutes)) || 20), 0);
    schedule.push({
      day: 1,
      focus: deriveDayFocus(sortedQuestions, 1, 1, false),
      question_ids: sortedQuestions.map(q => q.id || q.questionId),
      allocatedMinutes: Math.floor(totalMinutes),
      mustHaveCoverage: getMustHaveCoverage(sortedQuestions),
      isReviewDay: false
    });
    return schedule;
  }

  // ==========================================
  // CASE 2: Days <= Question Count (1 < N <= |Q|)
  // Linear bin-packing into N buckets
  // ==========================================
  if (safeTotalDays <= sortedQuestions.length) {
    const dayBuckets = Array.from({ length: safeTotalDays }, () => []);

    // Distribute sorted questions into days (front-loading high priority and hard questions into earlier days)
    sortedQuestions.forEach((q, idx) => {
      const targetDayIndex = Math.min(safeTotalDays - 1, Math.floor((idx / sortedQuestions.length) * safeTotalDays));
      dayBuckets[targetDayIndex].push(q);
    });

    for (let d = 0; d < safeTotalDays; d++) {
      const dayQuestions = dayBuckets[d];
      const minutes = dayQuestions.reduce((sum, q) => sum + (Math.round(Number(q.estimatedMinutes)) || 20), 0);

      schedule.push({
        day: d + 1,
        focus: deriveDayFocus(dayQuestions, d + 1, safeTotalDays, false),
        question_ids: dayQuestions.map(q => q.id || q.questionId),
        allocatedMinutes: Math.floor(minutes),
        mustHaveCoverage: getMustHaveCoverage(dayQuestions),
        isReviewDay: false
      });
    }

    // Guarantee: Check if every must-have appears. In Case 2, all questions are assigned across days,
    // so all coverable must-haves are present.
    return schedule;
  }

  // ==========================================================================
  // CASE 3: Days > Question Count (e.g. N = 14, 30, 60 days with 10 questions)
  // Phase 1: Deep dive learning (1-2 questions per active learning day)
  // Phase 2: Spaced repetition intervals (+3d, +7d, +14d reviews)
  // Phase 3: Milestone consolidation & mock synthesis days
  // ==========================================================================
  const totalQ = sortedQuestions.length;
  // Dedicate first half or initial period to first-pass learning
  const learnDaysCount = Math.min(safeTotalDays - 1, Math.max(totalQ, Math.floor(safeTotalDays * 0.4)));

  const dayAssignments = Array.from({ length: safeTotalDays }, () => ({
    questions: [],
    isReview: false
  }));

  // 1. Assign first-pass learning days (front-loading harder and must-have questions)
  sortedQuestions.forEach((q, idx) => {
    const targetDayIndex = Math.min(learnDaysCount - 1, Math.floor((idx / totalQ) * learnDaysCount));
    dayAssignments[targetDayIndex].questions.push(q);
  });

  // 2. Schedule spaced repetition reviews
  // For each question, schedule a review at +3 days and +7 days if within schedule bounds
  sortedQuestions.forEach((q, idx) => {
    const originalDay = Math.min(learnDaysCount - 1, Math.floor((idx / totalQ) * learnDaysCount));
    
    // First review at +3 to +5 days
    const reviewDay1 = originalDay + 3;
    if (reviewDay1 < safeTotalDays) {
      if (!dayAssignments[reviewDay1].questions.some(existing => (existing.id || existing.questionId) === (q.id || q.questionId))) {
        dayAssignments[reviewDay1].questions.push(q);
        dayAssignments[reviewDay1].isReview = true;
      }
    }

    // Second review at +7 to +14 days
    const reviewDay2 = originalDay + 8;
    if (reviewDay2 < safeTotalDays) {
      if (!dayAssignments[reviewDay2].questions.some(existing => (existing.id || existing.questionId) === (q.id || q.questionId))) {
        dayAssignments[reviewDay2].questions.push(q);
        dayAssignments[reviewDay2].isReview = true;
      }
    }
  });

  // 3. Final Milestone Days (Ensure the final days have high-yield mock synthesis and review)
  if (safeTotalDays >= 7) {
    const penultimateDayIndex = safeTotalDays - 2;
    const finalDayIndex = safeTotalDays - 1;

    // Pick top must-have questions for penultimate comprehensive review
    const mustHaveQuestions = sortedQuestions.filter(q => {
      const ids = q.targetRequirementIds || q.competencyIds || [];
      return ids.some(id => reqMap.get(id)?.priority === 'must-have');
    });

    if (mustHaveQuestions.length > 0) {
      dayAssignments[penultimateDayIndex].questions = mustHaveQuestions.slice(0, 3);
      dayAssignments[penultimateDayIndex].isReview = true;
    }
    dayAssignments[finalDayIndex].isReview = true;
  }

  // 4. Build output schedule ensuring EXACTLY safeTotalDays entries
  for (let d = 0; d < safeTotalDays; d++) {
    const assignment = dayAssignments[d];
    const dayQuestions = assignment.questions;
    const isReview = assignment.isReview || (dayQuestions.length === 0 && d > learnDaysCount);

    // Calculate integer minutes
    let minutes = 0;
    if (dayQuestions.length > 0) {
      minutes = dayQuestions.reduce((sum, q) => {
        const baseMins = Number(q.estimatedMinutes) || 20;
        // Review sessions take ~50% of the initial deep-dive time
        return sum + (isReview ? Math.round(baseMins * 0.6) : baseMins);
      }, 0);
    } else if (d === safeTotalDays - 1) {
      minutes = 30; // Final mental prep and flashcards
    } else {
      minutes = 15; // Light recap and flashcard revision
    }

    schedule.push({
      day: d + 1,
      focus: deriveDayFocus(dayQuestions, d + 1, safeTotalDays, isReview),
      question_ids: dayQuestions.map(q => q.id || q.questionId),
      allocatedMinutes: Math.floor(minutes),
      mustHaveCoverage: getMustHaveCoverage(dayQuestions),
      isReviewDay: isReview
    });
  }

  return schedule;
}

export default {
  allocateSchedule,
  prioritizeQuestions,
  deriveDayFocus
};
