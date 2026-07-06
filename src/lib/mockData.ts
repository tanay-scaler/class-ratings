// Mock ratings and user data for local development

export interface ClassRating {
  program: string;          // e.g. AIML, DSML, Academy, Devops
  classDate: string;        // YYYY-MM-DD
  day: string;              // Mon, Tue, etc.
  numberOfRatings: number;  // count of ratings
  classRating: number;      // avg rating
  instructorName: string;   // instructor name
  classTopic: string;       // topic
  moduleName: string;       // module
  sbNames: string;          // SuperBatch/Batch names
  feedback: string;         // aggregated from learner-level data at runtime
  reportLink?: string;      // Typeform report link for the class
  sbatGroupId: string;      // group identifier
}

export interface MenteeRating {
  instructorName: string;
  userId: string;
  sbatGroupId: string;
  sbatId: string;
  email: string;
  superBatchName: string;
  moduleName: string;
  classTopic: string;
  classDate: string;
  classType: string;
  feedbackSummary: string;
  reportLink: string;
  program: string;
  menteeLessonRating: number;
  classRating: number;
  optionalClassFlag: boolean;
  learnersRatedLowAgainCount: number;
  instructorChangeFlag: boolean;
  suggestion: string;
  lowRatingLabelOthers: string;
  numRatings1?: number;
  numRatings2?: number;
  numRatings3?: number;
  numRatings4?: number;
  numRatings5?: number;
}

export interface AuthorizedUser {
  email: string;
  role: 'Admin' | 'Viewer';
  status: 'Active' | 'Inactive';
}

export interface DashboardData {
  classRatings: ClassRating[];
  menteeRatings: MenteeRating[];
  authorizedUsers: AuthorizedUser[];
  timestamp: string;
  error?: string;
}

const mockInstructors = ["Anshul Bhatnagar", "Kshitiz Gupta", "Neha Sharma", "Tarun Malhotra", "Sandeep Singh"];
const mockModules = ["Intro to Python", "DSA Recursion", "System Design LLD", "DBMS SQL", "Advanced DSA Trees"];
const mockPrograms = ["AIML", "DSML", "Academy", "Devops"];
const mockSbNamesMap: Record<string, string[]> = {
  "AIML": ["AIML June 2026", "AIML July 2026"],
  "DSML": ["DSML May 2026", "DSML June 2026"],
  "Academy": ["Academy April 2026", "Academy May 2026"],
  "Devops": ["Devops March 2026", "Devops April 2026"]
};
const mockTopics: Record<string, string[]> = {
  "Intro to Python": ["Loops & Conditionals", "Functions & Scopes", "Lists & Dictionaries"],
  "DSA Recursion": ["Introduction to Recursion", "Backtracking Basics", "Divide and Conquer"],
  "System Design LLD": ["OOP Principles & UML", "Design Patterns Overview", "Solid Principles"],
  "DBMS SQL": ["SQL Joins & Subqueries", "Indexing & Transactions", "NoSQL vs SQL"],
  "Advanced DSA Trees": ["Binary Trees Traversals", "BST & AVL Trees", "Tries & Segment Trees"]
};
const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const classTypes = ["Lecture", "Problem Solving", "Office Hours", "Live Class"];
const lowRatingLabels = [
  "Audio/Video Quality",
  "Pacing too fast",
  "Pacing too slow",
  "Not enough examples",
  "Confusing explanation",
  "Content not relevant",
  ""
];
const suggestions = [
  "Please share code snippets after class.",
  "Reduce speed during problem solving.",
  "More interactive sessions needed.",
  "Provide recordings sooner.",
  "Cover more edge cases.",
  ""
];

const generateMockClassRatings = (): ClassRating[] => {
  const ratings: ClassRating[] = [];
  const now = new Date();
  const positiveComments = [
    "Excellent class! Very clear explanation.",
    "Instructor solved all doubts patiently.",
    "Great examples and hands-on coding.",
    "Very interactive session.",
    "Loved the visualization of the data structures."
  ];
  const negativeComments = [
    "Instructor was going too fast.",
    "Audio quality was poor, voice breaking frequently.",
    "Felt the explanation of backtracking was a bit confusing.",
    "Did not cover enough coding examples.",
    "Not enough time spent on the core problem statement.",
    "Got stuck during live coding.",
    "Pacing was slow in the first half and rushed at the end."
  ];

  for (let i = 0; i < 60; i++) {
    const date = new Date(now);
    date.setDate(now.getDate() - Math.floor(Math.random() * 30));
    const dateStr = date.toISOString().split('T')[0];
    const day = daysOfWeek[date.getDay()];
    const program = mockPrograms[Math.floor(Math.random() * mockPrograms.length)];
    const sbNames = mockSbNamesMap[program][Math.floor(Math.random() * mockSbNamesMap[program].length)];
    const moduleName = mockModules[Math.floor(Math.random() * mockModules.length)];
    const classTopic = mockTopics[moduleName][Math.floor(Math.random() * mockTopics[moduleName].length)];
    const instructorName = mockInstructors[Math.floor(Math.random() * mockInstructors.length)];

    let baseRating = 4.2;
    if (instructorName === "Neha Sharma") baseRating = 4.6;
    if (instructorName === "Kshitiz Gupta") baseRating = 3.6;
    if (moduleName === "DSA Recursion") baseRating -= 0.3;

    const rating = Math.min(5, Math.max(1, Math.round((baseRating + (Math.random() * 0.8 - 0.4)) * 100) / 100));
    const numberOfRatings = Math.floor(Math.random() * 30) + 5;
    const commentsList: string[] = [];
    const numComments = Math.floor(Math.random() * 3);
    for (let c = 0; c < numComments; c++) {
      commentsList.push(
        rating < 3.8
          ? negativeComments[Math.floor(Math.random() * negativeComments.length)]
          : Math.random() > 0.3
          ? positiveComments[Math.floor(Math.random() * positiveComments.length)]
          : negativeComments[Math.floor(Math.random() * negativeComments.length)]
      );
    }

    ratings.push({
      program, classDate: dateStr, day, numberOfRatings,
      classRating: rating, instructorName, classTopic, moduleName,
      sbNames,
      feedback: '',  // populated at runtime from learner-level data
      sbatGroupId: `grp_${program.toLowerCase()}_${Math.floor(Math.random() * 100)}`
    });
  }
  return ratings.sort((a, b) => new Date(b.classDate).getTime() - new Date(a.classDate).getTime());
};

const generateMockMenteeRatings = (classRatings: ClassRating[]): MenteeRating[] => {
  const mentees = [
    { name: "Rahul Gupta", email: "rahul.g@learner.scaler.com", userId: "u001" },
    { name: "Priya Sharma", email: "priya.s@learner.scaler.com", userId: "u002" },
    { name: "Amit Verma", email: "amit.v@learner.scaler.com", userId: "u003" },
    { name: "Siddharth Sen", email: "sid.sen@learner.scaler.com", userId: "u004" },
    { name: "Tanvi Rao", email: "tanvi.r@learner.scaler.com", userId: "u005" },
    { name: "Vikram Malhotra", email: "vikram.m@learner.scaler.com", userId: "u006" },
    { name: "Ananya Iyer", email: "ananya.i@learner.scaler.com", userId: "u007" },
    { name: "Rohan Das", email: "rohan.d@learner.scaler.com", userId: "u008" }
  ];

  const menteeRatings: MenteeRating[] = [];
  let sbatIdCounter = 1000;

  classRatings.forEach((cr, index) => {
    if (index % 2 === 0) {
      const numMentees = Math.floor(Math.random() * 3) + 1;
      const shuffledMentees = [...mentees].sort(() => 0.5 - Math.random());

      for (let m = 0; m < numMentees; m++) {
        const mentee = shuffledMentees[m];
        let ratingVal = Math.floor(cr.classRating);
        if (Math.random() > 0.7) {
          ratingVal = Math.max(1, Math.min(5, ratingVal + (Math.random() > 0.5 ? 1 : -1)));
        }

        const isLow = ratingVal <= 3;
        const lowLabel = isLow ? lowRatingLabels[Math.floor(Math.random() * (lowRatingLabels.length - 1))] : "";
        const suggestion = isLow ? suggestions[Math.floor(Math.random() * (suggestions.length - 1))] : "";
        const feedbackSummary = isLow
          ? `Student gave ${ratingVal}★ rating. ${lowLabel ? `Reason: ${lowLabel}.` : ""} ${suggestion ? `Suggestion: ${suggestion}` : ""}`
          : ratingVal >= 4 ? "Student found the class helpful and engaging." : "";

        menteeRatings.push({
          instructorName: cr.instructorName,
          userId: mentee.userId,
          sbatGroupId: cr.sbatGroupId,
          sbatId: `sbat_${++sbatIdCounter}`,
          email: mentee.email,
          superBatchName: cr.sbNames,
          moduleName: cr.moduleName,
          classTopic: cr.classTopic,
          classDate: cr.classDate,
          classType: classTypes[Math.floor(Math.random() * classTypes.length)],
          feedbackSummary,
          reportLink: `https://scaler.com/reports/${cr.sbatGroupId}`,
          program: cr.program,
          menteeLessonRating: ratingVal,
          classRating: cr.classRating,
          optionalClassFlag: Math.random() > 0.85,
          learnersRatedLowAgainCount: isLow ? Math.floor(Math.random() * 5) : 0,
          instructorChangeFlag: isLow && Math.random() > 0.7,
          suggestion,
          lowRatingLabelOthers: lowLabel
        });
      }
    }
  });

  return menteeRatings.sort((a, b) => new Date(b.classDate).getTime() - new Date(a.classDate).getTime());
};

const mockClassRatings = generateMockClassRatings();
const mockMenteeRatings = generateMockMenteeRatings(mockClassRatings);

export const mockDashboardData: DashboardData = {
  classRatings: mockClassRatings,
  menteeRatings: mockMenteeRatings,
  authorizedUsers: [
    { email: "admin@scaler.com", role: "Admin", status: "Active" },
    { email: "viewer@scaler.com", role: "Viewer", status: "Active" },
    { email: "inactive@scaler.com", role: "Viewer", status: "Inactive" },
    { email: "anshul.b@scaler.com", role: "Admin", status: "Active" },
    { email: "neha.s@scaler.com", role: "Viewer", status: "Active" }
  ],
  timestamp: new Date().toISOString()
};
