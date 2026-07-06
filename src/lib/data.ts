import { DashboardData, MenteeRating } from './mockData';

type RawRecord = Record<string, unknown>;

function cleanString(val: unknown): string {
  const str = String(val || '').trim();
  const lower = str.toLowerCase();
  if (lower === 'nan' || lower === 'null' || lower === 'undefined') {
    return '';
  }
  return str;
}

// High-performance, memory-efficient global cache (bypasses Next.js 2MB fetch cache limits)
let cachedData: DashboardData | null = null;
let lastFetchTime: number = 0;
const CACHE_TTL_MS = 60 * 1000; // Cache for 60 seconds (1 minute)

export async function fetchDashboardData(forceFresh: boolean = false): Promise<DashboardData> {
  const now = Date.now();

  // If memory cache is fresh and not forced, return it instantly (0ms latency)
  if (!forceFresh && cachedData && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedData;
  }
  const url = process.env.APPS_SCRIPT_URL;
  const token = process.env.APPS_SCRIPT_TOKEN;

  // If environment variables are not configured, return empty dataset with error message
  if (!url || !token) {
    return {
      classRatings: [],
      menteeRatings: [],
      authorizedUsers: [],
      timestamp: new Date().toISOString(),
      error: "Google Sheets integration environment variables (APPS_SCRIPT_URL/APPS_SCRIPT_TOKEN) are not configured."
    };
  }

  try {
    // Construct Apps Script URL with token authorization
    const fetchUrl = `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
    
    // Fetch directly using cache: 'no-store' to bypass Next.js 2MB cache limit completely
    const response = await fetch(fetchUrl, {
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`Google Apps Script returned status code ${response.status}`);
    }

    const data = await response.json();
    
    if (data && data.error) {
      throw new Error(data.message || data.error);
    }

    // Ensure basic structures are present
    const classRatings = Array.isArray(data.classRatings) ? data.classRatings : [];
    const menteeRatings = Array.isArray(data.menteeRatings) ? data.menteeRatings : [];
    const learnerSplits = Array.isArray(data.learnerSplits) ? data.learnerSplits : [];
    const authorizedUsers = Array.isArray(data.authorizedUsers) ? data.authorizedUsers : [];

    // Parse ratings data to correct types
    const parsedMenteeRatings = menteeRatings.map((mr: RawRecord) => ({
      instructorName: String(mr.instructorName || '').trim(),
      userId: String(mr.userId || '').trim(),
      sbatGroupId: String(mr.sbatGroupId || '').trim(),
      sbatId: String(mr.sbatId || '').trim(),
      email: String(mr.email || '').trim(),
      superBatchName: String(mr.superBatchName || '').trim(),
      moduleName: String(mr.moduleName || '').trim(),
      classTopic: String(mr.classTopic || '').trim(),
      classDate: String(mr.classDate || '').trim(),
      classType: String(mr.classType || '').trim(),
      feedbackSummary: String(mr.feedbackSummary || '').trim(),
      reportLink: String(mr.reportLink || '').trim(),
      program: String(mr.program || '').trim(),
      menteeLessonRating: parseFloat(String(mr.menteeLessonRating)) || 0,
      classRating: parseFloat(String(mr.classRating)) || 0,
      optionalClassFlag: mr.optionalClassFlag === true || mr.optionalClassFlag === 'TRUE',
      learnersRatedLowAgainCount: parseInt(String(mr.learnersRatedLowAgainCount)) || 0,
      instructorChangeFlag: mr.instructorChangeFlag === true || mr.instructorChangeFlag === 'TRUE',
      suggestion: cleanString(mr.suggestion),
      lowRatingLabelOthers: cleanString(mr.lowRatingLabelOthers),
      numRatings1: parseInt(String(mr.numRatings1 || mr.num_ratings_1 || '0')) || 0,
      numRatings2: parseInt(String(mr.numRatings2 || mr.num_ratings_2 || '0')) || 0,
      numRatings3: parseInt(String(mr.numRatings3 || mr.num_ratings_3 || '0')) || 0,
      numRatings4: parseInt(String(mr.numRatings4 || mr.num_ratings_4 || '0')) || 0,
      numRatings5: parseInt(String(mr.numRatings5 || mr.num_ratings_5 || '0')) || 0
    }));

    // Group rating splits by the class primary key
    const splitsMap = new Map<string, { n1: number; n2: number; n3: number; n4: number; n5: number }>();
    for (const split of learnerSplits) {
      const key = String(split.sbatGroupId || '').trim();
      if (!key) continue;
      splitsMap.set(key, {
        n1: parseInt(String(split.numRatings1 || split.num_ratings_1 || '0')) || 0,
        n2: parseInt(String(split.numRatings2 || split.num_ratings_2 || '0')) || 0,
        n3: parseInt(String(split.numRatings3 || split.num_ratings_3 || '0')) || 0,
        n4: parseInt(String(split.numRatings4 || split.num_ratings_4 || '0')) || 0,
        n5: parseInt(String(split.numRatings5 || split.num_ratings_5 || '0')) || 0,
      });
    }

    // 1. Group mentee ratings by the class primary key.
    const menteeMap = new Map<string, MenteeRating[]>();
    for (const mr of parsedMenteeRatings) {
      const key = mr.sbatGroupId;
      if (!key) continue;
      if (!menteeMap.has(key)) {
        menteeMap.set(key, []);
      }
      menteeMap.get(key)!.push(mr);
    }

    // 2. Parse class ratings and map aggregated learner feedbacks in O(M) time using Map lookup
    const parsedClassRatings = classRatings.map((cr: RawRecord) => {
      const topic = String(cr.classTopic || '').trim();
      const mod = String(cr.moduleName || '').trim();
      const inst = String(cr.instructorName || '').trim();
      const dt = String(cr.classDate || '').trim();
      const sbatGroupId = String(cr.sbatGroupId || '').trim();

      const matchingMentees = menteeMap.get(sbatGroupId) || [];

      // Compile comments from each matching student rating
      const comments = matchingMentees
        .map((mr: MenteeRating) => {
          const parts: string[] = [];
          if (mr.lowRatingLabelOthers) {
            parts.push(`Reason: ${mr.lowRatingLabelOthers}`);
          }
          if (mr.suggestion) {
            parts.push(`Suggestion: ${mr.suggestion}`);
          }
          if (mr.feedbackSummary && parts.length === 0) {
            parts.push(mr.feedbackSummary);
          }
          return parts.join(' | ').trim();
        })
        .filter((t: string) => t.length > 0);

      // Build feedback purely from matched learner-level data
      // (cr.feedback is a typeform report link, not usable text)
      const combinedFeedback = comments.join('\n');

      let ratingSplitSummary = '';
      const split = splitsMap.get(sbatGroupId);
      if (split) {
        const { n1, n2, n3, n4, n5 } = split;
        if (n1 > 0 || n2 > 0 || n3 > 0 || n4 > 0 || n5 > 0) {
          ratingSplitSummary = `1★: ${n1} | 2★: ${n2} | 3★: ${n3} | 4★: ${n4} | 5★: ${n5}`;
        }
      } else if (matchingMentees.length > 0) {
        const mm = matchingMentees[0];
        const n1 = mm.numRatings1 || 0;
        const n2 = mm.numRatings2 || 0;
        const n3 = mm.numRatings3 || 0;
        const n4 = mm.numRatings4 || 0;
        const n5 = mm.numRatings5 || 0;
        if (n1 > 0 || n2 > 0 || n3 > 0 || n4 > 0 || n5 > 0) {
          ratingSplitSummary = `1★: ${n1} | 2★: ${n2} | 3★: ${n3} | 4★: ${n4} | 5★: ${n5}`;
        }
      }

      return {
        program: String(cr.program || 'Unknown'),
        classDate: dt,
        day: String(cr.day || ''),
        numberOfRatings: parseInt(String(cr.numberOfRatings)) || 0,
        classRating: parseFloat(String(cr.classRating)) || 0,
        instructorName: inst,
        classTopic: topic,
        moduleName: mod,
        sbNames: String(cr.sbNames || 'Unknown'),
        feedback: combinedFeedback,
        reportLink: cleanString(cr.feedback),
        sbatGroupId,
        ratingSplit: ratingSplitSummary
      };
    });

    const parsedAuthorizedUsers = authorizedUsers.map((au: RawRecord) => ({
      email: String(au.email || '').trim().toLowerCase(),
      role: (au.role === 'Admin' ? 'Admin' : 'Viewer') as 'Admin' | 'Viewer',
      status: (au.status === 'Active' ? 'Active' : 'Inactive') as 'Active' | 'Inactive'
    }));

    const result = {
      classRatings: parsedClassRatings,
      menteeRatings: parsedMenteeRatings,
      authorizedUsers: parsedAuthorizedUsers,
      timestamp: data.timestamp || new Date().toISOString()
    };

    // Save successfully parsed result to in-memory cache
    cachedData = result;
    lastFetchTime = Date.now();

    return result;

  } catch (error) {
    console.error("Failed to fetch dashboard data.", error);

    // If we have stale cached data, return that
    if (cachedData) {
      console.log("[MemoryCache] Serving stale cached data as fallback");
      return {
        ...cachedData,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    return {
      classRatings: [],
      menteeRatings: [],
      authorizedUsers: [],
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Verify whether a user's email has access to the dashboard.
 * - Must end in @scaler.com
 * - Must be present and 'Active' in the ACL sheet, OR if the ACL sheet is empty/not configured
 *   we allow access by default to any @scaler.com email to simplify setup.
 */
export async function verifyUserAccess(email: string): Promise<{ authorized: boolean; role: 'Admin' | 'Viewer' }> {
  const normalizedEmail = email.trim().toLowerCase();
  console.log(`[ACL] Verifying email: "${normalizedEmail}"`);
  
  // Rule 1: Email must be a scaler.com email
  if (!normalizedEmail.endsWith('@scaler.com')) {
    console.log(`[ACL] Rejected: "${normalizedEmail}" does not end with @scaler.com`);
    return { authorized: false, role: 'Viewer' };
  }

  // Fetch current ACL users (use cache for high performance and low latency)
  const data = await fetchDashboardData(false);
  const acl = data.authorizedUsers;
  console.log(`[ACL] Total users in sheet: ${acl.length}. List:`, JSON.stringify(acl));

  const activeAclUsers = acl.filter(u => u.status === 'Active');
  console.log(`[ACL] Active users in sheet: ${activeAclUsers.length}. List:`, JSON.stringify(activeAclUsers));
  
  if (activeAclUsers.length === 0) {
    console.log("[ACL] No active ACL users found in sheet. Defaulting to allowing any @scaler.com email.");
    return { authorized: true, role: 'Viewer' };
  }

  // Find user in ACL list
  const match = activeAclUsers.find(u => u.email === normalizedEmail);
  if (match) {
    console.log(`[ACL] Granted: found matching user in ACL:`, match);
    return { authorized: true, role: match.role };
  }

  console.log(`[ACL] Denied: "${normalizedEmail}" was not found in the active ACL list.`);
  return { authorized: false, role: 'Viewer' };
}
