import { ClassRating, MenteeRating } from './mockData';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ClassStreak {
  sbNames: string;
  program: string;
  moduleName: string;
  instructors: string[];
  currentStreak: number;      // consecutive low-rated classes up to most recent
  maxStreak: number;          // longest streak ever
  totalLowClasses: number;
  totalClasses: number;
  lastLowDate: string;
  lastRating: number;
  recentClasses: { date: string; rating: number; topic: string; instructorName: string; isLow: boolean }[];
}

export interface InstructorPattern {
  instructorName: string;
  avgRating: number;
  currentStreak: number;
  maxStreak: number;
  totalLowClasses: number;
  totalClasses: number;
  affectedModules: string[];
  affectedBatches: string[];
  topFeedbackReasons: { reason: string; count: number }[];
  instructorChangeFlag: boolean; // any learner flagged instructor change for this instructor
}

export interface ModulePattern {
  moduleName: string;
  avgRating: number;
  totalClasses: number;
  lowClassCount: number;
  lowRate: number;
  instructorBreakdown: { instructorName: string; avgRating: number; classCount: number; lowCount: number }[];
  batchBreakdown: { sbNames: string; avgRating: number; classCount: number }[];
  isModuleWideIssue: boolean;  // true if ≥50% of instructors teaching it have low avg rating
}

export interface LearnerPattern {
  email: string;
  userId: string;
  program: string;
  superBatchName: string;
  totalLowRatings: number;
  maxConsecutiveLow: number;
  instructorChangeFlagged: boolean;
  affectedClasses: { date: string; topic: string; instructorName: string; rating: number }[];
  topReasons: string[];
}

export interface CrossSection {
  instructorName: string;
  moduleName: string;
  sbNames: string;
  program: string;
  avgRating: number;
  classCount: number;
  lowCount: number;
  lowRate: number;
  isAlarm: boolean;  // all classes low rated
}

export interface Patterns {
  classStreaks: ClassStreak[];
  instructorPatterns: InstructorPattern[];
  modulePatterns: ModulePattern[];
  learnerPatterns: LearnerPattern[];
  crossSections: CrossSection[];
}

// ─────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────

export function computePatterns(
  classRatings: ClassRating[],
  menteeRatings: MenteeRating[],
  threshold: number = 4.6
): Patterns {
  return {
    classStreaks: computeClassStreaks(classRatings, threshold),
    instructorPatterns: computeInstructorPatterns(classRatings, menteeRatings, threshold),
    modulePatterns: computeModulePatterns(classRatings, threshold),
    learnerPatterns: computeLearnerPatterns(menteeRatings),
    crossSections: computeCrossSections(classRatings, threshold),
  };
}

// ─────────────────────────────────────────────────────────────
// 1. Class streaks — consecutive low-rated classes per batchset
// ─────────────────────────────────────────────────────────────

function computeClassStreaks(classRatings: ClassRating[], threshold: number): ClassStreak[] {
  // Group by batchset + module so streaks continue across instructor changes.
  const groups = new Map<string, ClassRating[]>();
  for (const cr of classRatings) {
    const key = `${cr.sbNames}||${cr.moduleName}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(cr);
  }

  const results: ClassStreak[] = [];

  for (const [, classes] of groups) {
    // Sort ascending by date
    const sorted = [...classes].sort(
      (a, b) => new Date(a.classDate).getTime() - new Date(b.classDate).getTime()
    );

    let currentStreak = 0;
    let maxStreak = 0;
    let tempStreak = 0;
    let totalLow = 0;
    let lastLowDate = '';
    let lastRating = 0;

    for (const c of sorted) {
      const isLow = c.classRating < threshold && c.numberOfRatings > 0;
      if (isLow) {
        tempStreak++;
        totalLow++;
        lastLowDate = c.classDate;
      } else {
        tempStreak = 0;
      }
      if (tempStreak > maxStreak) maxStreak = tempStreak;
      lastRating = c.classRating;
    }

    // Current streak = streak ending at the last class
    let cs = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].classRating < threshold && sorted[i].numberOfRatings > 0) cs++;
      else break;
    }
    currentStreak = cs;

    const sample = sorted[0];
    const instructors = [...new Set(sorted.map(c => c.instructorName).filter(Boolean))];
    const recentClasses = sorted.slice(-5).map(c => ({
      date: c.classDate,
      rating: c.classRating,
      topic: c.classTopic,
      instructorName: c.instructorName,
      isLow: c.classRating < threshold && c.numberOfRatings > 0,
    })).reverse();

    results.push({
      sbNames: sample.sbNames,
      program: sample.program,
      moduleName: sample.moduleName,
      instructors,
      currentStreak,
      maxStreak,
      totalLowClasses: totalLow,
      totalClasses: sorted.length,
      lastLowDate,
      lastRating,
      recentClasses,
    });
  }

  // Sort: active streaks first, then by max streak
  return results.sort((a, b) => {
    if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
    return b.maxStreak - a.maxStreak;
  });
}

// ─────────────────────────────────────────────────────────────
// 2. Instructor patterns
// ─────────────────────────────────────────────────────────────

function computeInstructorPatterns(
  classRatings: ClassRating[],
  menteeRatings: MenteeRating[],
  threshold: number
): InstructorPattern[] {
  const map = new Map<string, ClassRating[]>();
  for (const cr of classRatings) {
    if (!map.has(cr.instructorName)) map.set(cr.instructorName, []);
    map.get(cr.instructorName)!.push(cr);
  }

  // Build mentee lookup by instructor
  const menteeByInstructor = new Map<string, MenteeRating[]>();
  for (const mr of menteeRatings) {
    if (!menteeByInstructor.has(mr.instructorName)) menteeByInstructor.set(mr.instructorName, []);
    menteeByInstructor.get(mr.instructorName)!.push(mr);
  }

  const results: InstructorPattern[] = [];

  for (const [instructor, classes] of map) {
    const sorted = [...classes].sort(
      (a, b) => new Date(a.classDate).getTime() - new Date(b.classDate).getTime()
    );

    let maxStreak = 0;
    let tempStreak = 0;
    let totalLow = 0;
    let sumWeighted = 0;
    let totalRatings = 0;

    for (const c of sorted) {
      const isLow = c.classRating < threshold && c.numberOfRatings > 0;
      sumWeighted += c.classRating * c.numberOfRatings;
      totalRatings += c.numberOfRatings;
      if (isLow) { tempStreak++; totalLow++; } else { tempStreak = 0; }
      if (tempStreak > maxStreak) maxStreak = tempStreak;
    }

    let cs = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].classRating < threshold && sorted[i].numberOfRatings > 0) cs++; else break;
    }

    const mentees = menteeByInstructor.get(instructor) || [];
    const reasonCount = new Map<string, number>();
    let hasInstructorChangeFlag = false;
    for (const mr of mentees) {
      if (mr.instructorChangeFlag) hasInstructorChangeFlag = true;
      if (mr.lowRatingLabelOthers) {
        reasonCount.set(mr.lowRatingLabelOthers, (reasonCount.get(mr.lowRatingLabelOthers) || 0) + 1);
      }
      if (mr.suggestion) {
        reasonCount.set(mr.suggestion, (reasonCount.get(mr.suggestion) || 0) + 1);
      }
    }

    const topFeedbackReasons = [...reasonCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));

    const affectedModules = [...new Set(classes.filter(c => c.classRating < threshold && c.numberOfRatings > 0).map(c => c.moduleName))];
    const affectedBatches = [...new Set(classes.filter(c => c.classRating < threshold && c.numberOfRatings > 0).map(c => c.sbNames))];

    results.push({
      instructorName: instructor,
      avgRating: totalRatings > 0 ? Math.round((sumWeighted / totalRatings) * 100) / 100 : 0,
      currentStreak: cs,
      maxStreak,
      totalLowClasses: totalLow,
      totalClasses: sorted.length,
      affectedModules,
      affectedBatches,
      topFeedbackReasons,
      instructorChangeFlag: hasInstructorChangeFlag,
    });
  }

  return results.sort((a, b) => {
    if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
    return a.avgRating - b.avgRating;
  });
}

// ─────────────────────────────────────────────────────────────
// 3. Module patterns
// ─────────────────────────────────────────────────────────────

function computeModulePatterns(classRatings: ClassRating[], threshold: number): ModulePattern[] {
  const map = new Map<string, ClassRating[]>();
  for (const cr of classRatings) {
    if (!map.has(cr.moduleName)) map.set(cr.moduleName, []);
    map.get(cr.moduleName)!.push(cr);
  }

  const results: ModulePattern[] = [];

  for (const [module, classes] of map) {
    let sumWeighted = 0; let totalRatings = 0; let lowCount = 0;

    // Per-instructor breakdown
    const instMap = new Map<string, { sum: number; ratings: number; low: number; count: number }>();
    // Per-batch breakdown
    const batchMap = new Map<string, { sum: number; ratings: number; count: number }>();

    for (const c of classes) {
      sumWeighted += c.classRating * c.numberOfRatings;
      totalRatings += c.numberOfRatings;
      if (c.classRating < threshold && c.numberOfRatings > 0) lowCount++;

      if (!instMap.has(c.instructorName)) instMap.set(c.instructorName, { sum: 0, ratings: 0, low: 0, count: 0 });
      const inst = instMap.get(c.instructorName)!;
      inst.sum += c.classRating * c.numberOfRatings;
      inst.ratings += c.numberOfRatings;
      inst.count++;
      if (c.classRating < threshold && c.numberOfRatings > 0) inst.low++;

      if (!batchMap.has(c.sbNames)) batchMap.set(c.sbNames, { sum: 0, ratings: 0, count: 0 });
      const batch = batchMap.get(c.sbNames)!;
      batch.sum += c.classRating * c.numberOfRatings;
      batch.ratings += c.numberOfRatings;
      batch.count++;
    }

    const instructorBreakdown = [...instMap.entries()].map(([name, d]) => ({
      instructorName: name,
      avgRating: d.ratings > 0 ? Math.round((d.sum / d.ratings) * 100) / 100 : 0,
      classCount: d.count,
      lowCount: d.low,
    })).sort((a, b) => a.avgRating - b.avgRating);

    const batchBreakdown = [...batchMap.entries()].map(([name, d]) => ({
      sbNames: name,
      avgRating: d.ratings > 0 ? Math.round((d.sum / d.ratings) * 100) / 100 : 0,
      classCount: d.count,
    })).sort((a, b) => a.avgRating - b.avgRating);

    // Module-wide issue if ≥50% of instructors teaching it have avg < threshold
    const lowInstructors = instructorBreakdown.filter(i => i.avgRating < threshold).length;
    const isModuleWideIssue = instructorBreakdown.length > 0 && (lowInstructors / instructorBreakdown.length) >= 0.5;

    results.push({
      moduleName: module,
      avgRating: totalRatings > 0 ? Math.round((sumWeighted / totalRatings) * 100) / 100 : 0,
      totalClasses: classes.length,
      lowClassCount: lowCount,
      lowRate: classes.length > 0 ? Math.round((lowCount / classes.length) * 1000) / 10 : 0,
      instructorBreakdown,
      batchBreakdown,
      isModuleWideIssue,
    });
  }

  return results.sort((a, b) => a.avgRating - b.avgRating);
}

// ─────────────────────────────────────────────────────────────
// 4. Learner repeat-low patterns
// ─────────────────────────────────────────────────────────────

function computeLearnerPatterns(menteeRatings: MenteeRating[]): LearnerPattern[] {
  const learnerLowThreshold = 4;
  const map = new Map<string, MenteeRating[]>();
  for (const mr of menteeRatings) {
    if (!map.has(mr.email)) map.set(mr.email, []);
    map.get(mr.email)!.push(mr);
  }

  const results: LearnerPattern[] = [];

  for (const [email, ratings] of map) {
    const lowRatings = ratings.filter(mr => mr.menteeLessonRating < learnerLowThreshold);
    if (lowRatings.length === 0) continue;

    const sorted = [...ratings].sort(
      (a, b) => new Date(a.classDate).getTime() - new Date(b.classDate).getTime()
    );

    // Compute max consecutive low streak for this learner
    let maxConsec = 0; let tempConsec = 0;
    for (const mr of sorted) {
      if (mr.menteeLessonRating < learnerLowThreshold) { tempConsec++; } else { tempConsec = 0; }
      if (tempConsec > maxConsec) maxConsec = tempConsec;
    }

    const instructorChangeFlagged = lowRatings.some(mr => mr.instructorChangeFlag);
    const sample = ratings[0];

    const affectedClasses = lowRatings
      .sort((a, b) => new Date(b.classDate).getTime() - new Date(a.classDate).getTime())
      .slice(0, 10)
      .map(mr => ({
        date: mr.classDate,
        topic: mr.classTopic,
        instructorName: mr.instructorName,
        rating: mr.menteeLessonRating,
      }));

    const reasonCounts = new Map<string, number>();
    for (const mr of lowRatings) {
      if (mr.lowRatingLabelOthers) reasonCounts.set(mr.lowRatingLabelOthers, (reasonCounts.get(mr.lowRatingLabelOthers) || 0) + 1);
      if (mr.suggestion) reasonCounts.set(mr.suggestion, (reasonCounts.get(mr.suggestion) || 0) + 1);
    }
    const topReasons = [...reasonCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([r]) => r);

    // Also grab max from the field itself
    const maxFromField = Math.max(...lowRatings.map(mr => mr.learnersRatedLowAgainCount || 0), 0);

    results.push({
      email,
      userId: sample.userId,
      program: sample.program,
      superBatchName: sample.superBatchName,
      totalLowRatings: lowRatings.length,
      maxConsecutiveLow: Math.max(maxConsec, maxFromField),
      instructorChangeFlagged,
      affectedClasses,
      topReasons,
    });
  }

  return results.sort((a, b) => {
    if (b.maxConsecutiveLow !== a.maxConsecutiveLow) return b.maxConsecutiveLow - a.maxConsecutiveLow;
    return b.totalLowRatings - a.totalLowRatings;
  });
}

// ─────────────────────────────────────────────────────────────
// 5. Cross-sectional: Instructor × Module × Batch
// ─────────────────────────────────────────────────────────────

function computeCrossSections(classRatings: ClassRating[], threshold: number): CrossSection[] {
  const map = new Map<string, { classes: ClassRating[] }>();

  for (const cr of classRatings) {
    const key = `${cr.instructorName}||${cr.moduleName}||${cr.sbNames}`;
    if (!map.has(key)) map.set(key, { classes: [] });
    map.get(key)!.classes.push(cr);
  }

  const results: CrossSection[] = [];

  for (const [, { classes }] of map) {
    let sumWeighted = 0; let totalRatings = 0; let lowCount = 0;
    for (const c of classes) {
      sumWeighted += c.classRating * c.numberOfRatings;
      totalRatings += c.numberOfRatings;
      if (c.classRating < threshold && c.numberOfRatings > 0) lowCount++;
    }
    const avgRating = totalRatings > 0 ? Math.round((sumWeighted / totalRatings) * 100) / 100 : 0;
    const sample = classes[0];

    results.push({
      instructorName: sample.instructorName,
      moduleName: sample.moduleName,
      sbNames: sample.sbNames,
      program: sample.program,
      avgRating,
      classCount: classes.length,
      lowCount,
      lowRate: classes.length > 0 ? Math.round((lowCount / classes.length) * 1000) / 10 : 0,
      isAlarm: lowCount === classes.length && classes.length >= 2,
    });
  }

  return results
    .filter(cs => cs.lowCount > 0)
    .sort((a, b) => {
      if (b.isAlarm !== a.isAlarm) return b.isAlarm ? 1 : -1;
      return a.avgRating - b.avgRating;
    });
}
