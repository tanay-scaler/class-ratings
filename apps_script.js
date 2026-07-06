/**
 * Google Apps Script - Low Ratings Dashboard Data API (Optimized Version)
 * 
 * Instructions:
 * 1. Open your Google Sheet containing the ratings data.
 * 2. Click Extensions > Apps Script.
 * 3. Delete any code in the editor and paste this code.
 * 4. Set AUTH_TOKEN via Project Settings > Script Properties:
 *    - Name: AUTH_TOKEN
 *    - Value: academy-classroom-8417-TM  (match your APPS_SCRIPT_TOKEN env var)
 * 5. Deploy as Web App:
 *    - Click "Deploy" > "New deployment"  (or "Manage deployments" > "Edit" if updating)
 *    - Execute as: "Me" (your admin Google account)
 *    - Who has access: "Anyone"
 *    - Click "Deploy" and copy the Web App URL.
 * 6. IMPORTANT: After pasting new code, you MUST create a NEW deployment (not just Save).
 *    The URL stays the same if you click "Edit" on an existing deployment.
 *
 * Sheet tab names expected:
 *   "Class Ratings"       — class-level ratings
 *   "Learner Level Data"  — learner-level ratings
 *   "Users"               — ACL allowlist (columns: email, role, status)
 */

// Fallback token if Script Properties are not configured
const FALLBACK_AUTH_TOKEN = "academy-classroom-8417-TM";

/**
 * Handle GET requests from the dashboard
 */
function doGet(e) {
  // 1. Authenticate
  const scriptProperties = PropertiesService.getScriptProperties();
  const validToken = scriptProperties.getProperty("AUTH_TOKEN") || FALLBACK_AUTH_TOKEN;
  const token = e.parameter.token;

  if (!token || token !== validToken) {
    return jsonResponse({ error: "Unauthorized. Missing or invalid token." });
  }

  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

    // 2. Fetch each sheet case-insensitively
    const classRatingsSheet = getSheetByNameCaseInsensitive(spreadsheet, "Class Ratings");
    const learnerSplitsSheet = getSheetByNameCaseInsensitive(spreadsheet, "Learner Level Data");
    const menteeRatingsSheet = getSheetByNameCaseInsensitive(spreadsheet, "Low Rated Session Learner Level") || getSheetByNameCaseInsensitive(spreadsheet, "Learner Level Data");
    const usersSheet = getSheetByNameCaseInsensitive(spreadsheet, "Users");

    const classRatingsData   = classRatingsSheet   ? getSheetData(classRatingsSheet)   : [];
    const learnerSplitsData  = learnerSplitsSheet  ? getSheetData(learnerSplitsSheet)  : [];
    const menteeRatingsData  = menteeRatingsSheet  ? getSheetData(menteeRatingsSheet)  : [];
    const usersData          = usersSheet          ? getSheetData(usersSheet)          : [];

    return jsonResponse({
      classRatings:     classRatingsData,
      learnerSplits:    learnerSplitsData,
      menteeRatings:    menteeRatingsData,
      authorizedUsers:  usersData,
      timestamp:        new Date().toISOString()
    });

  } catch (err) {
    return jsonResponse({
      error:   "Internal Error",
      message: err.toString()
    });
  }
}

/**
 * Handle OPTIONS preflight (CORS) — required for some browser environments
 */
function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Wrap any object as a JSON ContentService response.
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Convert a sheet's rows into an array of objects keyed by camelCase headers.
 * High-performance: formats dates in pure JS to avoid slow Google API calls inside loops.
 */
function getSheetData(sheet) {
  const range  = sheet.getDataRange();
  const values = range.getValues();

  if (values.length <= 1) return []; // header-only or empty

  const headers = values[0].map(function(h) { return normalizeHeader(h); });
  const data    = [];

  // Determine indices of header fields that are dates to optimize type checking
  for (var i = 1; i < values.length; i++) {
    var row = values[i];

    // Quick blank row check: skip if the first 3 columns are empty
    if (row[0] === "" && row[1] === "" && row[2] === "") {
      continue;
    }

    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = row[j];
      
      // Convert Date objects to ISO string in pure JS (1000x faster than Utilities.formatDate)
      if (val instanceof Date) {
        var yyyy = val.getFullYear();
        var mm = val.getMonth() + 1;
        var dd = val.getDate();
        val = yyyy + "-" + (mm < 10 ? "0" + mm : mm) + "-" + (dd < 10 ? "0" + dd : dd);
      }
      
      obj[headers[j]] = val;
    }
    data.push(obj);
  }

  return data;
}

/**
 * Normalize a header string to camelCase:
 *   "Class Date"   -> "classDate"
 *   "sb_names"     -> "sbNames"
 *   "mentee_lesson_rating" -> "menteeLessonRating"
 */
function normalizeHeader(header) {
  return header
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")          // strip special chars
    .replace(/[\s_-]+(.)/g, function(_, c) { return c.toUpperCase(); }) // camelCase
    .replace(/^(.)/, function(c) { return c.toLowerCase(); });           // first char lower
}

/**
 * Find a sheet by name case-insensitively, ignoring spaces, hyphens, and underscores.
 */
function getSheetByNameCaseInsensitive(spreadsheet, targetName) {
  const sheets = spreadsheet.getSheets();
  const targetLower = targetName.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (var i = 0; i < sheets.length; i++) {
    const sheetName = sheets[i].getName();
    const sheetLower = sheetName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (sheetLower === targetLower) {
      return sheets[i];
    }
  }
  return null;
}
