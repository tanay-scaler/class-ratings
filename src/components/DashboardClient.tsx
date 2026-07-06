"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { signOut } from 'next-auth/react';
import { DashboardData } from '@/lib/mockData';
import { computePatterns } from '@/lib/patterns';
import styles from '@/app/dashboard.module.css';
import { TrendChart } from './TrendChart';

interface DashboardClientProps {
  data: DashboardData;
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: 'Admin' | 'Viewer';
  };
}

type TabType = 'overview' | 'modules' | 'instructors' | 'batches' | 'mentees' | 'comments' | 'patterns';
type DateRangeType = '7d' | '15d' | '30d' | 'all' | 'custom-single' | 'custom-range';
type RatingThresholdType = 'all' | '4.6' | '4.4' | '4.2';
type OptionalClassFilterType = 'all' | 'regular' | 'optional';
type InstructorChangeFilterType = 'all' | 'changed' | 'not_changed';

export function DashboardClient({ data, user }: DashboardClientProps) {
  // --- Active Tab State ---
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // --- Filter States ---
  const [selectedBatchSet, setSelectedBatchSet] = useState<string>('All');
  const [selectedBatch, setSelectedBatch] = useState<string>('All');
  const [selectedModule, setSelectedModule] = useState<string>('All');
  const [selectedInstructor, setSelectedInstructor] = useState<string>('All');
  const [dateRange, setDateRange] = useState<DateRangeType>('30d');
  const [ratingThreshold, setRatingThreshold] = useState<RatingThresholdType>('4.6');
  const [optionalClassFilter, setOptionalClassFilter] = useState<OptionalClassFilterType>('all');
  const [instructorChangeFilter, setInstructorChangeFilter] = useState<InstructorChangeFilterType>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [customSingleDate, setCustomSingleDate] = useState<string>('');

  // --- Table Sorting States ---
  const [sortField, setSortField] = useState<string>('avgRating');
  const [sortAsc, setSortAsc] = useState<boolean>(false); // default to descending for ratings

  // --- Instructor Modal Detail State ---
  const [selectedInstructorDetail, setSelectedInstructorDetail] = useState<string | null>(null);

  // --- Reset Filters ---
  const handleResetFilters = () => {
    setSelectedBatchSet('All');
    setSelectedBatch('All');
    setSelectedModule('All');
    setSelectedInstructor('All');
    setDateRange('30d');
    setRatingThreshold('4.6');
    setOptionalClassFilter('all');
    setInstructorChangeFilter('all');
    setSearchQuery('');
    setCustomStartDate('');
    setCustomEndDate('');
    setCustomSingleDate('');
  };

  const classFlagsByGroupId = useMemo(() => {
    const flags = new Map<string, { isOptional: boolean; hasInstructorChange: boolean }>();

    data.menteeRatings.forEach(r => {
      if (!r.sbatGroupId) return;
      const existing = flags.get(r.sbatGroupId) || { isOptional: false, hasInstructorChange: false };
      flags.set(r.sbatGroupId, {
        isOptional: existing.isOptional || r.optionalClassFlag,
        hasInstructorChange: existing.hasInstructorChange || r.instructorChangeFlag
      });
    });

    return flags;
  }, [data.menteeRatings]);

  const thresholdNum = ratingThreshold === 'all' ? 4.6 : parseFloat(ratingThreshold);

  // --- Derive Available Filter Options Dynamically ---
  const filterOptions = useMemo(() => {
    const programs = new Set<string>();
    const sbNamesSet = new Set<string>();
    const modules = new Set<string>();
    const instructors = new Set<string>();

    data.classRatings.forEach(r => {
      if (r.program) programs.add(r.program);
      if (r.sbNames && (selectedBatchSet === 'All' || r.program === selectedBatchSet)) {
        sbNamesSet.add(r.sbNames);
      }
      if (r.moduleName) modules.add(r.moduleName);
      if (r.instructorName) instructors.add(r.instructorName);
    });

    return {
      batchSets: ['All', ...Array.from(programs).sort()],
      batches: ['All', ...Array.from(sbNamesSet).sort()],
      modules: ['All', ...Array.from(modules).sort()],
      instructors: ['All', ...Array.from(instructors).sort()]
    };
  }, [data.classRatings, selectedBatchSet]);

  // --- Date Filtering Helper ---
  const isWithinDateRange = useCallback((dateStr: string) => {
    if (!dateStr) return false;

    if (dateRange === 'custom-single') {
      return !customSingleDate || dateStr === customSingleDate;
    }
    
    if (dateRange === 'custom-range') {
      if (customStartDate && dateStr < customStartDate) return false;
      if (customEndDate && dateStr > customEndDate) return false;
      return true;
    }

    if (dateRange === 'all') return true;
    
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (dateRange === '7d') return diffDays <= 7;
    if (dateRange === '15d') return diffDays <= 15;
    if (dateRange === '30d') return diffDays <= 30;
    return true;
  }, [dateRange, customSingleDate, customStartDate, customEndDate]);

  // --- Filter Ratings ---
  const filteredData = useMemo(() => {
    // 1. Filter Class Ratings
    const classRatings = data.classRatings.filter(r => {
      const flags = classFlagsByGroupId.get(r.sbatGroupId);
      const matchBatchSet = selectedBatchSet === 'All' || r.program === selectedBatchSet;
      const matchBatch = selectedBatch === 'All' || r.sbNames === selectedBatch;
      const matchModule = selectedModule === 'All' || r.moduleName === selectedModule;
      const matchInstructor = selectedInstructor === 'All' || r.instructorName === selectedInstructor;
      const matchDate = isWithinDateRange(r.classDate);
      const matchOptional = optionalClassFilter === 'all' ||
        (optionalClassFilter === 'optional' && flags?.isOptional === true) ||
        (optionalClassFilter === 'regular' && flags?.isOptional !== true);
      const matchInstructorChange = instructorChangeFilter === 'all' ||
        (instructorChangeFilter === 'changed' && flags?.hasInstructorChange === true) ||
        (instructorChangeFilter === 'not_changed' && flags?.hasInstructorChange !== true);
      
      const matchSearch = searchQuery === '' || 
        r.classTopic.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.instructorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.feedback.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.moduleName.toLowerCase().includes(searchQuery.toLowerCase());

      return matchBatchSet && matchBatch && matchModule && matchInstructor && matchDate && matchOptional && matchInstructorChange && matchSearch;
    });

    // 2. Filter Mentee Ratings
    const menteeRatings = data.menteeRatings.filter(r => {
      const matchBatchSet = selectedBatchSet === 'All' || r.program === selectedBatchSet;
      const matchBatch = selectedBatch === 'All' || r.superBatchName === selectedBatch;
      const matchModule = selectedModule === 'All' || r.moduleName === selectedModule;
      const matchInstructor = selectedInstructor === 'All' || r.instructorName === selectedInstructor;
      const matchDate = isWithinDateRange(r.classDate);
      const matchOptional = optionalClassFilter === 'all' ||
        (optionalClassFilter === 'optional' && r.optionalClassFlag) ||
        (optionalClassFilter === 'regular' && !r.optionalClassFlag);
      const matchInstructorChange = instructorChangeFilter === 'all' ||
        (instructorChangeFilter === 'changed' && r.instructorChangeFlag) ||
        (instructorChangeFilter === 'not_changed' && !r.instructorChangeFlag);
      
      const matchSearch = searchQuery === '' ||
        r.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.instructorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.feedbackSummary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.suggestion.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.lowRatingLabelOthers.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.classTopic.toLowerCase().includes(searchQuery.toLowerCase());

      return matchBatchSet && matchBatch && matchModule && matchInstructor && matchDate && matchOptional && matchInstructorChange && matchSearch;
    });

    return { classRatings, menteeRatings };
  }, [
    data.classRatings,
    data.menteeRatings,
    selectedBatchSet,
    selectedBatch,
    selectedModule,
    selectedInstructor,
    isWithinDateRange,
    optionalClassFilter,
    instructorChangeFilter,
    classFlagsByGroupId,
    searchQuery
  ]);

  // --- Compute Dashboard KPI Metrics ---
  const metrics = useMemo(() => {
    const ratings = filteredData.classRatings;
    if (ratings.length === 0) {
      return { avgRating: 0, totalFeedbacks: 0, lowRatingCount: 0, lowRatingRate: 0 };
    }

    let sumWeightedRating = 0;
    let totalFeedbacks = 0;
    let lowRatingCount = 0;

    ratings.forEach(r => {
      sumWeightedRating += r.classRating * r.numberOfRatings;
      totalFeedbacks += r.numberOfRatings;
      
      if (r.classRating < thresholdNum) {
        lowRatingCount++;
      }
    });

    const avgRating = totalFeedbacks > 0 ? sumWeightedRating / totalFeedbacks : 0;
    const lowRatingRate = ratings.length > 0 ? (lowRatingCount / ratings.length) * 100 : 0;

    return {
      avgRating: Math.round(avgRating * 100) / 100,
      totalFeedbacks,
      lowRatingCount,
      lowRatingRate: Math.round(lowRatingRate * 10) / 10
    };
  }, [filteredData.classRatings, thresholdNum]);

  // --- Compute Module Level Breakdown ---
  const moduleBreakdown = useMemo(() => {
    const breakdownMap: Record<string, { name: string; sumWeightedRating: number; totalFeedbacks: number; lowCount: number; classCount: number }> = {};
    filteredData.classRatings.forEach(r => {
      if (!breakdownMap[r.moduleName]) {
        breakdownMap[r.moduleName] = { name: r.moduleName, sumWeightedRating: 0, totalFeedbacks: 0, lowCount: 0, classCount: 0 };
      }
      const item = breakdownMap[r.moduleName];
      item.sumWeightedRating += r.classRating * r.numberOfRatings;
      item.totalFeedbacks += r.numberOfRatings;
      item.classCount++;
      if (r.classRating < thresholdNum) {
        item.lowCount++;
      }
    });

    return Object.values(breakdownMap).map(d => ({
      name: d.name,
      avgRating: d.totalFeedbacks > 0 ? Math.round((d.sumWeightedRating / d.totalFeedbacks) * 100) / 100 : 0,
      totalFeedbacks: d.totalFeedbacks,
      lowCount: d.lowCount,
      classCount: d.classCount,
      lowRate: d.classCount > 0 ? Math.round((d.lowCount / d.classCount) * 1000) / 10 : 0
    }));
  }, [filteredData.classRatings, thresholdNum]);

  // --- Compute Instructor Level Breakdown ---
  const instructorBreakdown = useMemo(() => {
    const breakdownMap: Record<string, { name: string; sumWeightedRating: number; totalFeedbacks: number; lowCount: number; classCount: number }> = {};
    filteredData.classRatings.forEach(r => {
      if (!breakdownMap[r.instructorName]) {
        breakdownMap[r.instructorName] = { name: r.instructorName, sumWeightedRating: 0, totalFeedbacks: 0, lowCount: 0, classCount: 0 };
      }
      const item = breakdownMap[r.instructorName];
      item.sumWeightedRating += r.classRating * r.numberOfRatings;
      item.totalFeedbacks += r.numberOfRatings;
      item.classCount++;
      if (r.classRating < thresholdNum) {
        item.lowCount++;
      }
    });

    return Object.values(breakdownMap).map(d => ({
      name: d.name,
      avgRating: d.totalFeedbacks > 0 ? Math.round((d.sumWeightedRating / d.totalFeedbacks) * 100) / 100 : 0,
      totalFeedbacks: d.totalFeedbacks,
      lowCount: d.lowCount,
      classCount: d.classCount,
      lowRate: d.classCount > 0 ? Math.round((d.lowCount / d.classCount) * 1000) / 10 : 0
    }));
  }, [filteredData.classRatings, thresholdNum]);

  // --- Compute Batch Level Breakdown ---
  const batchBreakdown = useMemo(() => {
    const breakdownMap: Record<string, { name: string; batchSet: string; sumWeightedRating: number; totalFeedbacks: number; lowCount: number; classCount: number }> = {};
    filteredData.classRatings.forEach(r => {
      const key = `${r.program} | ${r.sbNames}`;
      if (!breakdownMap[key]) {
        breakdownMap[key] = { name: r.sbNames, batchSet: r.program, sumWeightedRating: 0, totalFeedbacks: 0, lowCount: 0, classCount: 0 };
      }
      const item = breakdownMap[key];
      item.sumWeightedRating += r.classRating * r.numberOfRatings;
      item.totalFeedbacks += r.numberOfRatings;
      item.classCount++;
      if (r.classRating < thresholdNum) {
        item.lowCount++;
      }
    });

    return Object.values(breakdownMap).map(d => ({
      name: d.name,
      batchSet: d.batchSet,
      avgRating: d.totalFeedbacks > 0 ? Math.round((d.sumWeightedRating / d.totalFeedbacks) * 100) / 100 : 0,
      totalFeedbacks: d.totalFeedbacks,
      lowCount: d.lowCount,
      classCount: d.classCount,
      lowRate: d.classCount > 0 ? Math.round((d.lowCount / d.classCount) * 1000) / 10 : 0
    }));
  }, [filteredData.classRatings, thresholdNum]);

  // --- Trend Chart Data Preparation (Daily aggregation) ---
  const trendData = useMemo(() => {
    const dailyMap: Record<string, { sumWeighted: number; feedbacks: number }> = {};
    
    filteredData.classRatings.forEach(r => {
      const day = r.classDate;
      if (!day) return;
      if (!dailyMap[day]) {
        dailyMap[day] = { sumWeighted: 0, feedbacks: 0 };
      }
      dailyMap[day].sumWeighted += r.classRating * r.numberOfRatings;
      dailyMap[day].feedbacks += r.numberOfRatings;
    });

    return Object.entries(dailyMap)
      .map(([date, d]) => ({
        label: date,
        value: d.feedbacks > 0 ? Math.round((d.sumWeighted / d.feedbacks) * 100) / 100 : 0,
        feedbacksCount: d.feedbacks
      }))
      .sort((a, b) => new Date(a.label).getTime() - new Date(b.label).getTime());
  }, [filteredData.classRatings]);

  // --- Sort Helper for breakdowns ---
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'name' || field === 'batchSet'); // default Asc for strings, Desc for numbers
    }
  };

  const getSortedData = <T extends Record<string, string | number>>(list: T[]) => {
    return [...list].sort((a, b) => {
      const valA = a[sortField as keyof T] as string | number;
      const valB = b[sortField as keyof T] as string | number;
      
      if (typeof valA === 'string') {
        const strA = String(valA);
        const strB = String(valB);
        return sortAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
      }
      
      const numA = Number(valA);
      const numB = Number(valB);
      return sortAsc ? numA - numB : numB - numA;
    });
  };

  // --- Details for Instructor Popup Modal ---
  const selectedInstructorInfo = useMemo(() => {
    if (!selectedInstructorDetail) return null;
    
    const instructorClasses = filteredData.classRatings.filter(r => r.instructorName === selectedInstructorDetail);
    
    let sumWeighted = 0;
    let totalFeedbacks = 0;
    let lowCount = 0;
    
    const classes = instructorClasses.map(c => {
      sumWeighted += c.classRating * c.numberOfRatings;
      totalFeedbacks += c.numberOfRatings;
      if (c.classRating < thresholdNum) lowCount++;
      return c;
    });
    
    const avgRating = totalFeedbacks > 0 ? sumWeighted / totalFeedbacks : 0;
    
    classes.sort((a, b) => new Date(b.classDate).getTime() - new Date(a.classDate).getTime());

    // Generate instructor trend data
    const dailyMap: Record<string, { sumWeighted: number; feedbacks: number }> = {};
    classes.forEach(c => {
      const day = c.classDate;
      if (!day) return;
      if (!dailyMap[day]) dailyMap[day] = { sumWeighted: 0, feedbacks: 0 };
      dailyMap[day].sumWeighted += c.classRating * c.numberOfRatings;
      dailyMap[day].feedbacks += c.numberOfRatings;
    });
    const trend = Object.entries(dailyMap)
      .map(([date, d]) => ({
        label: date,
        value: d.feedbacks > 0 ? d.sumWeighted / d.feedbacks : 0
      }))
      .sort((a, b) => new Date(a.label).getTime() - new Date(b.label).getTime());

    return {
      name: selectedInstructorDetail,
      avgRating: Math.round(avgRating * 100) / 100,
      totalFeedbacks,
      lowCount,
      classCount: classes.length,
      classes,
      trend
    };
  }, [selectedInstructorDetail, filteredData.classRatings, thresholdNum]);

  // Ratings threshold list filtered for comments tab
  const commentsList = useMemo(() => {
    const ratings = filteredData.classRatings;
    return ratings
      .filter(r => r.classRating < thresholdNum && (r.feedback.trim() !== '' || r.reportLink))
      .map(r => ({
        type: 'Class',
        date: r.classDate,
        batchSet: r.program,
        batch: r.sbNames,
        module: r.moduleName,
        instructor: r.instructorName,
        topic: r.classTopic,
        rating: r.classRating,
        comment: r.feedback,
        reportLink: r.reportLink,
        meta: `Feedbacks: ${r.numberOfRatings}`
      }));
  }, [filteredData.classRatings, thresholdNum]);

  // --- Compute Patterns & Insights ---
  const patterns = useMemo(() => {
    return computePatterns(filteredData.classRatings, filteredData.menteeRatings, thresholdNum);
  }, [filteredData.classRatings, filteredData.menteeRatings, thresholdNum]);

  const overviewClassIssues = useMemo(() => {
    return [...patterns.classStreaks]
      .filter(item => item.totalLowClasses > 0)
      .sort((a, b) => b.currentStreak - a.currentStreak || b.maxStreak - a.maxStreak || a.lastRating - b.lastRating)
      .slice(0, 3);
  }, [patterns.classStreaks]);

  const overviewInstructorIssues = useMemo(() => {
    return [...patterns.instructorPatterns]
      .filter(item => item.totalLowClasses > 0)
      .sort((a, b) => a.avgRating - b.avgRating || b.currentStreak - a.currentStreak)
      .slice(0, 3);
  }, [patterns.instructorPatterns]);

  const overviewModuleIssues = useMemo(() => {
    return [...patterns.modulePatterns]
      .filter(item => item.lowClassCount > 0)
      .sort((a, b) => a.avgRating - b.avgRating || b.lowClassCount - a.lowClassCount)
      .slice(0, 3);
  }, [patterns.modulePatterns]);

  const overviewBatchIssues = useMemo(() => {
    return [...batchBreakdown]
      .filter(item => item.lowCount > 0)
      .sort((a, b) => a.avgRating - b.avgRating || b.lowCount - a.lowCount)
      .slice(0, 3);
  }, [batchBreakdown]);

  return (
    <div className={styles.layout}>
      {/* Top Sync Information Bar */}
      <div className={styles.syncBar}>
        <div className={styles.syncDetail}>
          <div className={`${styles.pulseIndicator} ${data.error ? styles.pulseWarning : ''}`}></div>
          <span>
            {data.error 
              ? `API connection offline: Showing local fallback data (${data.error})` 
              : "Connected to Live Google Sheet API"}
          </span>
        </div>
        <div>
          <span>Data synced: {new Date(data.timestamp).toISOString().slice(11, 19)} UTC</span>
        </div>
      </div>

      {/* Main Dashboard Header */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logo}>S</div>
          <span className={styles.brandName}>Scaler Ratings Portal</span>
          <span className={styles.brandRole}>{user.role || 'Viewer'}</span>
        </div>

        <div className={styles.userInfo}>
          <div className={styles.userProfile}>
            {user.image ? (
              <img src={user.image} alt={user.name || "User"} className={styles.avatar} />
            ) : (
              <div className={styles.avatar} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                {user.name ? user.name[0] : 'U'}
              </div>
            )}
            <div className={styles.details}>
              <span className={styles.userName}>{user.name || "Ops User"}</span>
              <span className={styles.userRole}>{user.email}</span>
            </div>
          </div>
          <button onClick={() => signOut({ callbackUrl: '/login' })} className={styles.logoutBtn}>
            Log Out
          </button>
        </div>
      </header>

      {/* Filters Box */}
      <main className={styles.main}>
        {activeTab !== 'overview' && (
          <div className="card-glass animate-fade">
            <div className={styles.filterBar}>
              <div className={styles.filterGroup}>
                <div className={styles.selectWrapper}>
                  <label className={styles.selectLabel}>Program (Batchset)</label>
                  <select 
                    value={selectedBatchSet} 
                    onChange={e => { setSelectedBatchSet(e.target.value); setSelectedBatch('All'); }} 
                    className={styles.select}
                  >
                    {filterOptions.batchSets.map(bs => <option key={bs} value={bs}>{bs}</option>)}
                  </select>
                </div>

                <div className={styles.selectWrapper}>
                  <label className={styles.selectLabel}>Batch (Superbatch)</label>
                  <select 
                    value={selectedBatch} 
                    onChange={e => setSelectedBatch(e.target.value)} 
                    className={styles.select}
                    disabled={selectedBatchSet === 'All'}
                  >
                    {filterOptions.batches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div className={styles.selectWrapper}>
                  <label className={styles.selectLabel}>Module</label>
                  <select 
                    value={selectedModule} 
                    onChange={e => setSelectedModule(e.target.value)} 
                    className={styles.select}
                  >
                    {filterOptions.modules.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div className={styles.selectWrapper}>
                  <label className={styles.selectLabel}>Instructor</label>
                  <select 
                    value={selectedInstructor} 
                    onChange={e => setSelectedInstructor(e.target.value)} 
                    className={styles.select}
                  >
                    {filterOptions.instructors.map(ins => <option key={ins} value={ins}>{ins}</option>)}
                  </select>
                </div>

                <div className={styles.selectWrapper}>
                  <label className={styles.selectLabel}>Time Window</label>
                  <select 
                    value={dateRange} 
                    onChange={e => setDateRange(e.target.value as DateRangeType)} 
                    className={styles.select}
                  >
                    <option value="7d">Last 7 Days</option>
                    <option value="15d">Last 15 Days</option>
                    <option value="30d">Last 30 Days (Default)</option>
                    <option value="all">All Time</option>
                    <option value="custom-single">Single Date</option>
                    <option value="custom-range">Custom Date Range</option>
                  </select>
                </div>

                {dateRange === 'custom-single' && (
                  <div className={styles.selectWrapper}>
                    <label className={styles.selectLabel}>Select Date</label>
                    <input
                      type="date"
                      value={customSingleDate}
                      onChange={e => setCustomSingleDate(e.target.value)}
                      className={styles.select}
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                )}

                {dateRange === 'custom-range' && (
                  <>
                    <div className={styles.selectWrapper}>
                      <label className={styles.selectLabel}>Start Date</label>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={e => setCustomStartDate(e.target.value)}
                        className={styles.select}
                        style={{ colorScheme: 'dark' }}
                      />
                    </div>
                    <div className={styles.selectWrapper}>
                      <label className={styles.selectLabel}>End Date</label>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={e => setCustomEndDate(e.target.value)}
                        className={styles.select}
                        style={{ colorScheme: 'dark' }}
                      />
                    </div>
                  </>
                )}

                <div className={styles.selectWrapper}>
                  <label className={styles.selectLabel}>Low Rating Alert</label>
                  <select 
                    value={ratingThreshold} 
                    onChange={e => setRatingThreshold(e.target.value as RatingThresholdType)} 
                    className={styles.select}
                  >
                    <option value="all">None (Show All)</option>
                    <option value="4.6">Average &lt; 4.6 ★</option>
                    <option value="4.4">Average &lt; 4.4 ★</option>
                    <option value="4.2">Average &lt; 4.2 ★</option>
                  </select>
                </div>

                <div className={styles.selectWrapper}>
                  <label className={styles.selectLabel}>Class Type</label>
                  <select
                    value={optionalClassFilter}
                    onChange={e => setOptionalClassFilter(e.target.value as OptionalClassFilterType)}
                    className={styles.select}
                  >
                    <option value="all">All Classes</option>
                    <option value="regular">Regular Only</option>
                    <option value="optional">Optional Only</option>
                  </select>
                </div>

                <div className={styles.selectWrapper}>
                  <label className={styles.selectLabel}>Instructor Change</label>
                  <select
                    value={instructorChangeFilter}
                    onChange={e => setInstructorChangeFilter(e.target.value as InstructorChangeFilterType)}
                    className={styles.select}
                  >
                    <option value="all">All Classes</option>
                    <option value="changed">Changed Only</option>
                    <option value="not_changed">No Change</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className={styles.searchContainer}>
                  <svg className={styles.searchIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search topic, instructor, feedback..." 
                    className={styles.searchInput}
                  />
                </div>
                <button onClick={handleResetFilters} className={styles.filterReset}>
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard Metrics Grid */}
        <section className={styles.summaryGrid}>
          {/* Card 1: Avg Rating */}
          <div className="card-glass animate-slide styles.kpiCard" style={{ padding: '20px' }}>
            <div className={styles.kpiTitle}>Weighted Avg Rating</div>
            <div className={styles.kpiValue}>
              {metrics.avgRating > 0 ? `${metrics.avgRating.toFixed(2)}` : 'N/A'}
              <span style={{ fontSize: '1.25rem', color: 'var(--text-muted)', marginLeft: '4px' }}>★</span>
            </div>
            <div className={styles.kpiChange}>
              <span className={metrics.avgRating >= 4.6 ? styles.ratingHigh : metrics.avgRating >= 4.2 ? styles.ratingMed : styles.ratingLow}>
                {metrics.avgRating >= 4.6 ? 'Optimal Performance' : metrics.avgRating >= 4.2 ? 'Requires Attention' : 'Critical Low Ratings'}
              </span>
            </div>
          </div>

          {/* Card 2: Total Feedbacks */}
          <div className="card-glass animate-slide" style={{ padding: '20px', animationDelay: '0.1s' }}>
            <div className={styles.kpiTitle}>Total Ratings Submitted</div>
            <div className={styles.kpiValue}>{metrics.totalFeedbacks.toLocaleString()}</div>
            <div className={styles.kpiChange}>
              <span style={{ color: 'var(--text-muted)' }}>Sum of all learner ratings across classes</span>
            </div>
          </div>

          {/* Card 3: Count of Classes below threshold */}
          <div className="card-glass animate-slide" style={{ padding: '20px', animationDelay: '0.2s' }}>
            <div className={styles.kpiTitle}>Low Rated Classes</div>
            <div className={styles.kpiValue} style={{ color: metrics.lowRatingCount > 0 ? 'var(--danger)' : 'inherit' }}>
              {metrics.lowRatingCount}
            </div>
            <div className={styles.kpiChange}>
              <span>Classes scoring &lt; {ratingThreshold === 'all' ? '4.6' : ratingThreshold} ★</span>
            </div>
          </div>

          {/* Card 4: Percentage of classes below threshold */}
          <div className="card-glass animate-slide" style={{ padding: '20px', animationDelay: '0.3s' }}>
            <div className={styles.kpiTitle}>Low Rating Incidence</div>
            <div className={styles.kpiValue} style={{ color: metrics.lowRatingRate > 15 ? 'var(--danger)' : metrics.lowRatingRate > 5 ? 'var(--warning)' : 'var(--success)' }}>
              {metrics.lowRatingRate}%
            </div>
            <div className={styles.kpiChange}>
              <span>Percent of classes flagged as low</span>
            </div>
          </div>
        </section>

        {/* Tab switcher */}
        <div className={styles.tabs}>
          <button onClick={() => { setActiveTab('overview'); }} className={`${styles.tab} ${activeTab === 'overview' ? styles.activeTab : ''}`}>Overview & Trends</button>
          <button onClick={() => { setActiveTab('modules'); setSortField('avgRating'); }} className={`${styles.tab} ${activeTab === 'modules' ? styles.activeTab : ''}`}>Module Analysis</button>
          <button onClick={() => { setActiveTab('instructors'); setSortField('avgRating'); }} className={`${styles.tab} ${activeTab === 'instructors' ? styles.activeTab : ''}`}>Instructor Analysis</button>
          <button onClick={() => { setActiveTab('batches'); setSortField('avgRating'); }} className={`${styles.tab} ${activeTab === 'batches' ? styles.activeTab : ''}`}>Batch Performance</button>
          <button onClick={() => { setActiveTab('mentees'); setSortField('timestamp'); }} className={`${styles.tab} ${activeTab === 'mentees' ? styles.activeTab : ''}`}>Mentee Feedbacks ({filteredData.menteeRatings.length})</button>
          <button onClick={() => { setActiveTab('comments'); setSortField('date'); }} className={`${styles.tab} ${activeTab === 'comments' ? styles.activeTab : ''}`}>Comments Explorer ({commentsList.length})</button>
          <button onClick={() => setActiveTab('patterns')} className={`${styles.tab} ${activeTab === 'patterns' ? styles.activeTab : ''}`} style={{ position: 'relative' }}>
            🔍 Patterns &amp; Insights
            {patterns.classStreaks.some(s => s.currentStreak >= 2) && (
              <span style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--danger)', display: 'block' }} />
            )}
          </button>
        </div>

        {/* Dashboard Tabs Content */}
        <section className={styles.contentArea}>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className={styles.overviewStack}>
              <div className={`${styles.overviewHeaderCard} card-glass`}>
                <div>
                  <p className={styles.overviewEyebrow}>Executive summary</p>
                  <h3 className={styles.overviewHeadline}>Top issues requiring attention</h3>
                  <p className={styles.overviewDescription}>
                    This view is intentionally concise. It surfaces the strongest signals first and keeps detailed filters inside the analysis tabs.
                  </p>
                </div>
                <div className={styles.overviewActions}>
                  <button className={styles.overviewActionButton} onClick={() => setActiveTab('patterns')}>
                    Open patterns
                  </button>
                  <button className={styles.overviewActionButtonSecondary} onClick={() => setActiveTab('modules')}>
                    Open module analysis
                  </button>
                </div>
              </div>

              <section className={styles.summaryGrid}>
                <div className="card-glass animate-slide" style={{ padding: '20px' }}>
                  <div className={styles.kpiTitle}>Weighted Avg Rating</div>
                  <div className={styles.kpiValue}>
                    {metrics.avgRating > 0 ? `${metrics.avgRating.toFixed(2)}` : 'N/A'}
                    <span style={{ fontSize: '1.25rem', color: 'var(--text-muted)', marginLeft: '4px' }}>★</span>
                  </div>
                  <div className={styles.kpiChange}>
                    <span className={metrics.avgRating >= 4.6 ? styles.ratingHigh : metrics.avgRating >= 4.2 ? styles.ratingMed : styles.ratingLow}>
                      {metrics.avgRating >= 4.6 ? 'Optimal Performance' : metrics.avgRating >= 4.2 ? 'Requires Attention' : 'Critical Low Ratings'}
                    </span>
                  </div>
                </div>

                <div className="card-glass animate-slide" style={{ padding: '20px', animationDelay: '0.1s' }}>
                  <div className={styles.kpiTitle}>Total Ratings Submitted</div>
                  <div className={styles.kpiValue}>{metrics.totalFeedbacks.toLocaleString()}</div>
                  <div className={styles.kpiChange}>
                    <span style={{ color: 'var(--text-muted)' }}>Sum of all learner ratings across classes</span>
                  </div>
                </div>

                <div className="card-glass animate-slide" style={{ padding: '20px', animationDelay: '0.2s' }}>
                  <div className={styles.kpiTitle}>Low Rated Classes</div>
                  <div className={styles.kpiValue} style={{ color: metrics.lowRatingCount > 0 ? 'var(--danger)' : 'inherit' }}>
                    {metrics.lowRatingCount}
                  </div>
                  <div className={styles.kpiChange}>
                    <span>Classes scoring &lt; {ratingThreshold === 'all' ? '4.6' : ratingThreshold} ★</span>
                  </div>
                </div>

                <div className="card-glass animate-slide" style={{ padding: '20px', animationDelay: '0.3s' }}>
                  <div className={styles.kpiTitle}>Low Rating Incidence</div>
                  <div className={styles.kpiValue} style={{ color: metrics.lowRatingRate > 15 ? 'var(--danger)' : metrics.lowRatingRate > 5 ? 'var(--warning)' : 'var(--success)' }}>
                    {metrics.lowRatingRate}%
                  </div>
                  <div className={styles.kpiChange}>
                    <span>Percent of classes flagged as low</span>
                  </div>
                </div>
              </section>

              <section className={styles.overviewIssuesGrid}>
                <div className={`${styles.overviewIssueCard} card-glass`}>
                  <div className={styles.overviewIssueHeader}>
                    <div>
                      <div className={styles.overviewIssueTitle}>Open class streaks</div>
                      <div className={styles.overviewIssueSubtitle}>Consecutive low-rated sessions in the active window</div>
                    </div>
                    <button className={styles.overviewLinkButton} onClick={() => setActiveTab('patterns')}>View details</button>
                  </div>
                  <div className={styles.overviewIssueList}>
                    {overviewClassIssues.length > 0 ? overviewClassIssues.map((item, index) => (
                      <div key={`${item.sbNames}-${item.moduleName}-${index}`} className={styles.overviewIssueRow}>
                        <div>
                          <div className={styles.overviewIssueName}>{item.sbNames}</div>
                          <div className={styles.overviewIssueMeta}>{item.moduleName} · {item.program}</div>
                        </div>
                        <div className={styles.overviewIssueValue}>
                          {item.currentStreak > 0 ? `${item.currentStreak} active` : 'review'}
                        </div>
                      </div>
                    )) : (
                      <div className={styles.overviewEmptyState}>No consecutive low-rating streaks in the current window.</div>
                    )}
                  </div>
                </div>

                <div className={`${styles.overviewIssueCard} card-glass`}>
                  <div className={styles.overviewIssueHeader}>
                    <div>
                      <div className={styles.overviewIssueTitle}>Instructor watchlist</div>
                      <div className={styles.overviewIssueSubtitle}>Lowest rated instructors in the current view</div>
                    </div>
                    <button className={styles.overviewLinkButton} onClick={() => setActiveTab('instructors')}>View details</button>
                  </div>
                  <div className={styles.overviewIssueList}>
                    {overviewInstructorIssues.length > 0 ? overviewInstructorIssues.map((item, index) => (
                      <div key={`${item.instructorName}-${index}`} className={styles.overviewIssueRow}>
                        <div>
                          <div className={styles.overviewIssueName}>{item.instructorName}</div>
                          <div className={styles.overviewIssueMeta}>{item.totalLowClasses} low classes · {item.totalClasses} total</div>
                        </div>
                        <div className={styles.overviewIssueValue}>
                          {item.avgRating.toFixed(2)} ★
                        </div>
                      </div>
                    )) : (
                      <div className={styles.overviewEmptyState}>No instructor issues in the current window.</div>
                    )}
                  </div>
                </div>

                <div className={`${styles.overviewIssueCard} card-glass`}>
                  <div className={styles.overviewIssueHeader}>
                    <div>
                      <div className={styles.overviewIssueTitle}>Module watchlist</div>
                      <div className={styles.overviewIssueSubtitle}>Modules with the weakest scores</div>
                    </div>
                    <button className={styles.overviewLinkButton} onClick={() => setActiveTab('modules')}>View details</button>
                  </div>
                  <div className={styles.overviewIssueList}>
                    {overviewModuleIssues.length > 0 ? overviewModuleIssues.map((item, index) => (
                      <div key={`${item.moduleName}-${index}`} className={styles.overviewIssueRow}>
                        <div>
                          <div className={styles.overviewIssueName}>{item.moduleName}</div>
                          <div className={styles.overviewIssueMeta}>{item.lowClassCount} low classes · {item.totalClasses} total</div>
                        </div>
                        <div className={styles.overviewIssueValue}>
                          {item.avgRating.toFixed(2)} ★
                        </div>
                      </div>
                    )) : (
                      <div className={styles.overviewEmptyState}>No module issues in the current window.</div>
                    )}
                  </div>
                </div>

                <div className={`${styles.overviewIssueCard} card-glass`}>
                  <div className={styles.overviewIssueHeader}>
                    <div>
                      <div className={styles.overviewIssueTitle}>Batch watchlist</div>
                      <div className={styles.overviewIssueSubtitle}>Batchsets with the weakest average ratings</div>
                    </div>
                    <button className={styles.overviewLinkButton} onClick={() => setActiveTab('batches')}>View details</button>
                  </div>
                  <div className={styles.overviewIssueList}>
                    {overviewBatchIssues.length > 0 ? overviewBatchIssues.map((item, index) => (
                      <div key={`${item.batchSet}-${item.name}-${index}`} className={styles.overviewIssueRow}>
                        <div>
                          <div className={styles.overviewIssueName}>{item.name}</div>
                          <div className={styles.overviewIssueMeta}>{item.batchSet} · {item.lowCount} low classes</div>
                        </div>
                        <div className={styles.overviewIssueValue}>
                          {item.avgRating.toFixed(2)} ★
                        </div>
                      </div>
                    )) : (
                      <div className={styles.overviewEmptyState}>No batch issues in the current window.</div>
                    )}
                  </div>
                </div>
              </section>

              <div className={styles.chartGrid}>
                <div className={`${styles.chartCard} card-glass`}>
                  <h3 className={styles.chartTitle}>Class Rating Trend Over Time</h3>
                  <div className={styles.chartContainer}>
                    <TrendChart data={trendData} />
                  </div>
                  <div className={styles.customLegend}>
                    <div className={styles.legendItem}>
                      <div className={styles.legendColor} style={{ backgroundColor: 'var(--primary)' }}></div>
                      <span>Average Daily Class Rating (1-5★)</span>
                    </div>
                  </div>
                </div>

                <div className={`${styles.chartCard} card-glass`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <h3 className={styles.chartTitle}>Executive notes</h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                      Use the overview to identify what needs attention, then move into the detailed tabs for filters, root cause analysis, and comment review.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '6px' }}>Current review focus</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{metrics.lowRatingCount} low-rated classes</span>
                          <span className={styles.ratingScore} style={{ color: metrics.lowRatingCount > 0 ? 'var(--danger)' : 'var(--success)' }}>
                            {metrics.lowRatingRate}%
                          </span>
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '6px' }}>Most urgent next step</div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                          Review the lowest instructor, then inspect the matching module and batch in the analysis tabs.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '24px', backgroundColor: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Detailed filters stay in the analysis tabs so the overview remains a clean executive summary.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MODULE ANALYSIS */}
          {activeTab === 'modules' && (
            <div className={`${styles.tableCard} card-glass animate-fade`}>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>Module Name {sortField === 'name' ? (sortAsc ? '▲' : '▼') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('avgRating')}>Weighted Avg Rating {sortField === 'avgRating' ? (sortAsc ? '▲' : '▼') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('classCount')}>Total Classes {sortField === 'classCount' ? (sortAsc ? '▲' : '▼') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('totalFeedbacks')}>Total Feedbacks {sortField === 'totalFeedbacks' ? (sortAsc ? '▲' : '▼') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('lowCount')}>Low Rated Classes {sortField === 'lowCount' ? (sortAsc ? '▲' : '▼') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('lowRate')}>Low Rating % {sortField === 'lowRate' ? (sortAsc ? '▲' : '▼') : ''}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moduleBreakdown.length > 0 ? (
                      getSortedData(moduleBreakdown).map((m, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: '600' }}>{m.name}</td>
                          <td>
                            <div className={styles.ratingScore}>
                              <span className={m.avgRating >= 4.6 ? styles.ratingHigh : m.avgRating >= 4.2 ? styles.ratingMed : styles.ratingLow}>
                                {m.avgRating.toFixed(2)}
                              </span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>★</span>
                            </div>
                          </td>
                          <td>{m.classCount}</td>
                          <td>{m.totalFeedbacks}</td>
                          <td style={{ color: m.lowCount > 0 ? 'var(--danger)' : 'inherit', fontWeight: m.lowCount > 0 ? '600' : 'normal' }}>{m.lowCount}</td>
                          <td>
                            <span className={m.lowRate > 30 ? "badge badge-danger" : m.lowRate > 10 ? "badge badge-warning" : "badge badge-success"}>
                              {m.lowRate}%
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                          No modules match current filter settings.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: INSTRUCTOR ANALYSIS */}
          {activeTab === 'instructors' && (
            <div className={`${styles.tableCard} card-glass animate-fade`}>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>Instructor Name {sortField === 'name' ? (sortAsc ? '▲' : '▼') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('avgRating')}>Weighted Avg Rating {sortField === 'avgRating' ? (sortAsc ? '▲' : '▼') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('classCount')}>Total Classes {sortField === 'classCount' ? (sortAsc ? '▲' : '▼') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('totalFeedbacks')}>Total Feedbacks {sortField === 'totalFeedbacks' ? (sortAsc ? '▲' : '▼') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('lowCount')}>Low Rated Classes {sortField === 'lowCount' ? (sortAsc ? '▲' : '▼') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('lowRate')}>Low Rating % {sortField === 'lowRate' ? (sortAsc ? '▲' : '▼') : ''}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instructorBreakdown.length > 0 ? (
                      getSortedData(instructorBreakdown).map((ins, idx) => (
                        <tr 
                          key={idx} 
                          onClick={() => setSelectedInstructorDetail(ins.name)}
                          className={styles.rowClickable}
                          title="Click to view details"
                        >
                          <td style={{ fontWeight: '600', color: 'var(--primary)', textDecoration: 'underline' }}>{ins.name}</td>
                          <td>
                            <div className={styles.ratingScore}>
                              <span className={ins.avgRating >= 4.6 ? styles.ratingHigh : ins.avgRating >= 4.2 ? styles.ratingMed : styles.ratingLow}>
                                {ins.avgRating.toFixed(2)}
                              </span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>★</span>
                            </div>
                          </td>
                          <td>{ins.classCount}</td>
                          <td>{ins.totalFeedbacks}</td>
                          <td style={{ color: ins.lowCount > 0 ? 'var(--danger)' : 'inherit', fontWeight: ins.lowCount > 0 ? '600' : 'normal' }}>{ins.lowCount}</td>
                          <td>
                            <span className={ins.lowRate > 30 ? "badge badge-danger" : ins.lowRate > 10 ? "badge badge-warning" : "badge badge-success"}>
                              {ins.lowRate}%
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                          No instructors match current filter settings.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: BATCH PERFORMANCE */}
          {activeTab === 'batches' && (
            <div className={`${styles.tableCard} card-glass animate-fade`}>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>Batch {sortField === 'name' ? (sortAsc ? '▲' : '▼') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('batchSet')}>Program {sortField === 'batchSet' ? (sortAsc ? '▲' : '▼') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('avgRating')}>Weighted Avg Rating {sortField === 'avgRating' ? (sortAsc ? '▲' : '▼') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('classCount')}>Total Classes {sortField === 'classCount' ? (sortAsc ? '▲' : '▼') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('totalFeedbacks')}>Total Feedbacks {sortField === 'totalFeedbacks' ? (sortAsc ? '▲' : '▼') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('lowCount')}>Low Rated Classes {sortField === 'lowCount' ? (sortAsc ? '▲' : '▼') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('lowRate')}>Low Rating % {sortField === 'lowRate' ? (sortAsc ? '▲' : '▼') : ''}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchBreakdown.length > 0 ? (
                      getSortedData(batchBreakdown).map((b, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: '600' }}>{b.name}</td>
                          <td>{b.batchSet}</td>
                          <td>
                            <div className={styles.ratingScore}>
                              <span className={b.avgRating >= 4.6 ? styles.ratingHigh : b.avgRating >= 4.2 ? styles.ratingMed : styles.ratingLow}>
                                {b.avgRating.toFixed(2)}
                              </span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>★</span>
                            </div>
                          </td>
                          <td>{b.classCount}</td>
                          <td>{b.totalFeedbacks}</td>
                          <td style={{ color: b.lowCount > 0 ? 'var(--danger)' : 'inherit', fontWeight: b.lowCount > 0 ? '600' : 'normal' }}>{b.lowCount}</td>
                          <td>
                            <span className={b.lowRate > 30 ? "badge badge-danger" : b.lowRate > 10 ? "badge badge-warning" : "badge badge-success"}>
                              {b.lowRate}%
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                          No batches match current filter settings.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: MENTEE FEEDBACKS (Learner Level) */}
          {activeTab === 'mentees' && (
            <div className={`${styles.tableCard} card-glass animate-fade`}>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Email</th>
                      <th>Program / Batch</th>
                      <th>Instructor</th>
                      <th>Module / Topic</th>
                      <th>Class Type</th>
                      <th>Lesson Rating</th>
                      <th>Class Rating</th>
                      <th>Low Rating Label</th>
                      <th>Feedback Summary</th>
                      <th>Suggestion</th>
                      <th>Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.menteeRatings.length > 0 ? (
                      filteredData.menteeRatings.map((mr, idx) => (
                        <tr key={idx}>
                          <td style={{ whiteSpace: 'nowrap' }}>{mr.classDate}</td>
                          <td style={{ fontSize: '0.8rem' }}>{mr.email}</td>
                          <td>
                            <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{mr.program}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{mr.superBatchName}</div>
                          </td>
                          <td style={{ fontWeight: '600', fontSize: '0.875rem' }}>{mr.instructorName}</td>
                          <td>
                            <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{mr.moduleName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{mr.classTopic}</div>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.75rem', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: '4px' }}>
                              {mr.classType}
                            </span>
                          </td>
                          <td>
                            <div className={styles.ratingScore}>
                              <span className={mr.menteeLessonRating >= 4 ? styles.ratingHigh : mr.menteeLessonRating >= 3 ? styles.ratingMed : styles.ratingLow}>
                                {mr.menteeLessonRating}
                              </span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>★</span>
                            </div>
                          </td>
                          <td>
                            <div className={styles.ratingScore}>
                              <span className={mr.classRating >= 4 ? styles.ratingHigh : mr.classRating >= 3 ? styles.ratingMed : styles.ratingLow}>
                                {mr.classRating.toFixed(2)}
                              </span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>★</span>
                            </div>
                          </td>
                          <td>
                            {mr.lowRatingLabelOthers ? (
                              <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                                {mr.lowRatingLabelOthers}
                              </span>
                            ) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                          </td>
                          <td style={{ maxWidth: '220px', fontSize: '0.8rem', lineHeight: '1.4' }}>
                            {mr.feedbackSummary ? (
                              <div style={{ fontStyle: 'italic', color: mr.menteeLessonRating <= 3 ? 'var(--danger)' : 'inherit' }}>
                                {mr.feedbackSummary}
                              </div>
                            ) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                          </td>
                          <td style={{ maxWidth: '180px', fontSize: '0.8rem' }}>
                            {mr.suggestion || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {mr.instructorChangeFlag && (
                                <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>Instructor Change</span>
                              )}
                              {mr.optionalClassFlag && (
                                <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>Optional</span>
                              )}
                              {mr.learnersRatedLowAgainCount > 0 && (
                                <span className="badge badge-danger" style={{ fontSize: '0.65rem' }}>Repeat: {mr.learnersRatedLowAgainCount}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={12} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                          No learner-level feedbacks match current filter/search parameters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: COMMENTS EXPLORER */}
          {activeTab === 'comments' && (
            <div className={styles.commentGrid}>
              {commentsList.length > 0 ? (
                commentsList.map((c, idx) => (
                  <div key={idx} className={`${styles.commentCard} card-glass animate-fade`}>
                    <div className={styles.commentHeader}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span className={c.rating >= 4.6 ? 'badge badge-success' : c.rating >= 4.2 ? 'badge badge-warning' : 'badge badge-danger'}>
                          {c.rating.toFixed(2)} ★
                        </span>
                        <h4 style={{ fontSize: '0.95rem' }}>{c.topic}</h4>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                        {c.date}
                      </span>
                    </div>

                    <div className={styles.commentDetails}>
                      <div className={styles.commentMetaItem}>
                        <span className={styles.commentLabel}>Instructor:</span>
                        <span>{c.instructor}</span>
                      </div>
                      <div className={styles.commentMetaItem}>
                        <span className={styles.commentLabel}>Module:</span>
                        <span>{c.module}</span>
                      </div>
                      <div className={styles.commentMetaItem}>
                        <span className={styles.commentLabel}>Batch:</span>
                        <span>{c.batch} ({c.batchSet})</span>
                      </div>
                      <div className={styles.commentMetaItem}>
                        <span className={styles.commentLabel}>Source:</span>
                        <span>{c.type} Level ({c.meta})</span>
                      </div>
                      {c.reportLink && (
                        <div className={styles.commentMetaItem}>
                          <span className={styles.commentLabel}>Report:</span>
                          <a href={c.reportLink} target="_blank" rel="noreferrer" aria-label="Open report link">
                            ↗
                          </a>
                        </div>
                      )}
                    </div>

                    <div className={`${styles.commentBody} ${c.rating <= 3.5 ? styles.commentBodyLow : c.rating < 4.0 ? styles.commentBodyMed : ''}`}>
                      {c.comment ? `"${c.comment}"` : 'No written feedback text.'}
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.emptyState}>
                  <div className={styles.emptyTitle}>No Comments Found</div>
                  <p className={styles.emptyDesc}>
                    There are no reviews or written feedback matching the selected rating threshold (&le; {ratingThreshold} ★) and search filter.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 7: PATTERNS & INSIGHTS */}
          {activeTab === 'patterns' && (
            <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* Section 1: Consecutive Low-Rating Streaks */}
              <div className={`${styles.tableCard} card-glass`}>
                <h3 className={styles.chartTitle} style={{ padding: '20px 20px 0' }}>
                  🔴 Consecutive Low-Rating Streaks
                  <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '12px' }}>
                    Classes rated below threshold in consecutive sessions
                  </span>
                </h3>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Batchset</th>
                        <th>Program</th>
                        <th>Instructors</th>
                        <th>Module</th>
                        <th>Active Streak</th>
                        <th>Max Streak</th>
                        <th>Low / Total</th>
                        <th>Last Low Date</th>
                        <th>Last Rating</th>
                        <th>Recent (last 5)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patterns.classStreaks.filter(s => s.totalLowClasses > 0).length > 0 ? (
                        patterns.classStreaks.filter(s => s.totalLowClasses > 0).map((s, idx) => (
                          <tr key={idx} style={{ backgroundColor: s.currentStreak >= 3 ? 'rgba(var(--danger-rgb, 220,50,50),0.07)' : s.currentStreak >= 2 ? 'rgba(var(--warning-rgb, 245,158,11),0.06)' : 'inherit' }}>
                            <td style={{ fontWeight: 600 }}>{s.sbNames}</td>
                            <td><span className="badge badge-primary" style={{ fontSize: '0.72rem' }}>{s.program}</span></td>
                            <td style={{ fontSize: '0.8rem' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {s.instructors.slice(0, 3).map((ins, i) => (
                                  <span key={i} style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>{ins}</span>
                                ))}
                                {s.instructors.length > 3 && <span style={{ color: 'var(--text-muted)' }}>+{s.instructors.length - 3}</span>}
                              </div>
                            </td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{s.moduleName}</td>
                            <td style={{ textAlign: 'center' }}>
                              {s.currentStreak >= 2 ? (
                                <span className="badge badge-danger" style={{ fontSize: '0.85rem', padding: '4px 10px' }}>{s.currentStreak}</span>
                              ) : s.currentStreak === 1 ? (
                                <span className="badge badge-warning" style={{ fontSize: '0.85rem' }}>1</span>
                              ) : (
                                <span style={{ color: 'var(--success)' }}>0</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: s.maxStreak >= 3 ? 700 : 400, color: s.maxStreak >= 3 ? 'var(--danger)' : 'inherit' }}>{s.maxStreak}</td>
                            <td style={{ textAlign: 'center' }}><span style={{ color: s.totalLowClasses > 0 ? 'var(--danger)' : 'inherit' }}>{s.totalLowClasses}</span> / {s.totalClasses}</td>
                            <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{s.lastLowDate || '—'}</td>
                            <td>
                              <span className={s.lastRating >= 4.6 ? styles.ratingHigh : s.lastRating >= 4.2 ? styles.ratingMed : styles.ratingLow}>
                                {s.lastRating > 0 ? s.lastRating.toFixed(2) : '—'}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '3px' }}>
                                {s.recentClasses.map((rc, i) => (
                                  <div key={i} title={`${rc.date}: ${rc.topic} (${rc.rating.toFixed(2)}★)`}
                                    style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: rc.isLow ? 'var(--danger)' : 'var(--success)', flexShrink: 0 }} />
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No low-rated classes in current filter window.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 2: Instructor Patterns */}
              <div className={`${styles.tableCard} card-glass`}>
                <h3 className={styles.chartTitle} style={{ padding: '20px 20px 0' }}>
                  👨‍🏫 Instructor Patterns
                  <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '12px' }}>
                    Streak, affected modules/batches, and top learner feedback reasons
                  </span>
                </h3>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Instructor</th>
                        <th>Avg Rating</th>
                        <th>Active Streak</th>
                        <th>Low / Total</th>
                        <th>Affected Modules</th>
                        <th>Affected Batches</th>
                        <th>Top Feedback Reasons</th>
                        <th>Change Flag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patterns.instructorPatterns.filter(p => p.totalLowClasses > 0).length > 0 ? (
                        patterns.instructorPatterns.filter(p => p.totalLowClasses > 0).map((p, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: 600, color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={() => { setSelectedInstructorDetail(p.instructorName); setActiveTab('instructors'); }}>
                              {p.instructorName}
                            </td>
                            <td>
                              <span className={p.avgRating >= 4.6 ? styles.ratingHigh : p.avgRating >= 4.2 ? styles.ratingMed : styles.ratingLow}>
                                {p.avgRating.toFixed(2)}★
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {p.currentStreak >= 2 ? <span className="badge badge-danger">{p.currentStreak}</span>
                                : p.currentStreak === 1 ? <span className="badge badge-warning">1</span>
                                : <span style={{ color: 'var(--success)' }}>0</span>}
                            </td>
                            <td style={{ textAlign: 'center' }}>{p.totalLowClasses} / {p.totalClasses}</td>
                            <td style={{ fontSize: '0.78rem' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {p.affectedModules.slice(0, 3).map((m, i) => (
                                  <span key={i} style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>{m}</span>
                                ))}
                                {p.affectedModules.length > 3 && <span style={{ color: 'var(--text-muted)' }}>+{p.affectedModules.length - 3}</span>}
                              </div>
                            </td>
                            <td style={{ fontSize: '0.78rem' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {p.affectedBatches.slice(0, 2).map((b, i) => (
                                  <span key={i} style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>{b}</span>
                                ))}
                                {p.affectedBatches.length > 2 && <span style={{ color: 'var(--text-muted)' }}>+{p.affectedBatches.length - 2}</span>}
                              </div>
                            </td>
                            <td style={{ maxWidth: '200px', fontSize: '0.78rem' }}>
                              {p.topFeedbackReasons.slice(0, 2).map((r, i) => (
                                <div key={i} style={{ marginBottom: '2px' }}>
                                  <span style={{ color: 'var(--text-muted)' }}>×{r.count}</span> {r.reason.slice(0, 50)}{r.reason.length > 50 ? '…' : ''}
                                </div>
                              ))}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {p.instructorChangeFlag
                                ? <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>⚑ Flagged</span>
                                : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No instructor patterns detected.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 3: Module Deep Dive */}
              <div className={`${styles.tableCard} card-glass`}>
                <h3 className={styles.chartTitle} style={{ padding: '20px 20px 0' }}>
                  📚 Module Deep Dive
                  <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '12px' }}>
                    Module-wide vs instructor-specific issues
                  </span>
                </h3>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Module</th>
                        <th>Avg Rating</th>
                        <th>Low / Total</th>
                        <th>Low Rate</th>
                        <th>Issue Type</th>
                        <th>Lowest Instructor</th>
                        <th>Lowest Batch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patterns.modulePatterns.filter(m => m.lowClassCount > 0).length > 0 ? (
                        patterns.modulePatterns.filter(m => m.lowClassCount > 0).map((m, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: 600 }}>{m.moduleName}</td>
                            <td>
                              <span className={m.avgRating >= 4.6 ? styles.ratingHigh : m.avgRating >= 4.2 ? styles.ratingMed : styles.ratingLow}>
                                {m.avgRating.toFixed(2)}★
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>{m.lowClassCount} / {m.totalClasses}</td>
                            <td>
                              <span className={m.lowRate > 30 ? 'badge badge-danger' : m.lowRate > 10 ? 'badge badge-warning' : 'badge badge-success'}>
                                {m.lowRate}%
                              </span>
                            </td>
                            <td>
                              {m.isModuleWideIssue
                                ? <span className="badge badge-danger" style={{ fontSize: '0.72rem' }}>🌐 Module-Wide</span>
                                : <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>👤 Instructor-Specific</span>}
                            </td>
                            <td style={{ fontSize: '0.82rem' }}>
                              {m.instructorBreakdown[0] ? (
                                <span>{m.instructorBreakdown[0].instructorName} ({m.instructorBreakdown[0].avgRating.toFixed(2)}★)</span>
                              ) : '—'}
                            </td>
                            <td style={{ fontSize: '0.82rem' }}>
                              {m.batchBreakdown[0] ? (
                                <span>{m.batchBreakdown[0].sbNames} ({m.batchBreakdown[0].avgRating.toFixed(2)}★)</span>
                              ) : '—'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No module low-rating patterns detected.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 4: Cross-Sectional (Instructor × Module × Batch) */}
              <div className={`${styles.tableCard} card-glass`}>
                <h3 className={styles.chartTitle} style={{ padding: '20px 20px 0' }}>
                  🔀 Cross-Sectional: Instructor × Module × Batch
                  <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '12px' }}>
                    Combinations where all classes are low-rated (alarm) or mostly low
                  </span>
                </h3>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Instructor</th>
                        <th>Module</th>
                        <th>Batchset</th>
                        <th>Program</th>
                        <th>Avg Rating</th>
                        <th>Low / Total</th>
                        <th>Low Rate</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patterns.crossSections.length > 0 ? (
                        patterns.crossSections.map((cs, idx) => (
                          <tr key={idx} style={{ backgroundColor: cs.isAlarm ? 'rgba(220,50,50,0.06)' : 'inherit' }}>
                            <td style={{ fontWeight: 600 }}>{cs.instructorName}</td>
                            <td style={{ fontSize: '0.85rem' }}>{cs.moduleName}</td>
                            <td style={{ fontSize: '0.85rem' }}>{cs.sbNames}</td>
                            <td><span className="badge badge-primary" style={{ fontSize: '0.72rem' }}>{cs.program}</span></td>
                            <td>
                              <span className={cs.avgRating >= 4.6 ? styles.ratingHigh : cs.avgRating >= 4.2 ? styles.ratingMed : styles.ratingLow}>
                                {cs.avgRating.toFixed(2)}★
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>{cs.lowCount} / {cs.classCount}</td>
                            <td>
                              <span className={cs.lowRate > 50 ? 'badge badge-danger' : cs.lowRate > 20 ? 'badge badge-warning' : 'badge badge-success'}>
                                {cs.lowRate}%
                              </span>
                            </td>
                            <td>
                              {cs.isAlarm
                                ? <span className="badge badge-danger" style={{ fontSize: '0.72rem' }}>🚨 All Low</span>
                                : <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>Partial</span>}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No cross-sectional low-rating patterns detected.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 5: Learner Repeat Patterns */}
              <div className={`${styles.tableCard} card-glass`}>
                <h3 className={styles.chartTitle} style={{ padding: '20px 20px 0' }}>
                  👤 Learner Repeat Low-Rating Patterns
                  <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '12px' }}>
                    Learners with consecutive or repeated low ratings
                  </span>
                </h3>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Program / Batch</th>
                        <th>Total Low Ratings</th>
                        <th>Max Consecutive</th>
                        <th>Instructor Change</th>
                        <th>Recent Low Classes</th>
                        <th>Top Reasons</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patterns.learnerPatterns.length > 0 ? (
                        patterns.learnerPatterns.slice(0, 50).map((lp, idx) => (
                          <tr key={idx}>
                            <td style={{ fontSize: '0.8rem' }}>{lp.email}</td>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{lp.program}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{lp.superBatchName}</div>
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 600, color: lp.totalLowRatings >= 3 ? 'var(--danger)' : 'inherit' }}>
                              {lp.totalLowRatings}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {lp.maxConsecutiveLow >= 3
                                ? <span className="badge badge-danger">{lp.maxConsecutiveLow}</span>
                                : lp.maxConsecutiveLow >= 2
                                ? <span className="badge badge-warning">{lp.maxConsecutiveLow}</span>
                                : <span>{lp.maxConsecutiveLow}</span>}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {lp.instructorChangeFlagged
                                ? <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>Yes</span>
                                : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </td>
                            <td style={{ fontSize: '0.78rem' }}>
                              {lp.affectedClasses.slice(0, 2).map((c, i) => (
                                <div key={i} style={{ marginBottom: '2px' }}>
                                  <span style={{ color: 'var(--text-muted)' }}>{c.date}</span> {c.topic.slice(0, 25)}{c.topic.length > 25 ? '…' : ''} ({c.rating}★)
                                </div>
                              ))}
                            </td>
                            <td style={{ fontSize: '0.78rem', maxWidth: '160px' }}>
                              {lp.topReasons.slice(0, 2).map((r, i) => (
                                <div key={i} style={{ color: 'var(--text-secondary)', marginBottom: '2px' }}>
                                  {r.slice(0, 40)}{r.length > 40 ? '…' : ''}
                                </div>
                              ))}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No repeat low-rating learner patterns found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}
        </section>
      </main>

      {/* Slide-out details modal overlay for instructor details */}
      {selectedInstructorDetail && selectedInstructorInfo && (
        <div className={styles.modalOverlay} onClick={() => setSelectedInstructorDetail(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{selectedInstructorInfo.name}</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Instructor Performance Overview</p>
              </div>
              <button className={styles.closeBtn} onClick={() => setSelectedInstructorDetail(null)}>&times;</button>
            </div>

            {/* Performance Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>AVG RATING</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: selectedInstructorInfo.avgRating >= 4.6 ? 'var(--success)' : selectedInstructorInfo.avgRating >= 4.2 ? 'var(--warning)' : 'var(--danger)' }}>
                  {selectedInstructorInfo.avgRating.toFixed(2)} ★
                </div>
              </div>
              <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>CLASSES</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>{selectedInstructorInfo.classCount}</div>
              </div>
              <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>LOW RATED</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: selectedInstructorInfo.lowCount > 0 ? 'var(--danger)' : 'inherit' }}>
                  {selectedInstructorInfo.lowCount}
                </div>
              </div>
            </div>

            {/* Instructor Trend Line Chart */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', backgroundColor: 'var(--bg-secondary)' }}>
              <h4 style={{ fontSize: '0.85rem', marginBottom: '12px', color: 'var(--text-secondary)' }}>Personal Rating Trend</h4>
              <div style={{ height: '140px' }}>
                <TrendChart data={selectedInstructorInfo.trend} height={140} />
              </div>
            </div>

            {/* Class-wise Ratings and Comments */}
            <div>
              <h3 style={{ fontSize: '1.05rem', marginBottom: '12px' }}>Recent Classes & Feedback</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {selectedInstructorInfo.classes.map((c, idx) => (
                  <div key={idx} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h4 style={{ fontSize: '0.9rem' }}>{c.classTopic}</h4>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {c.sbNames} &bull; {new Date(c.classDate).toLocaleDateString()}
                        </div>
                      </div>
                      <span className={c.classRating >= 4.6 ? 'badge badge-success' : c.classRating >= 4.2 ? 'badge badge-warning' : 'badge badge-danger'}>
                        {c.classRating.toFixed(2)} ★
                      </span>
                    </div>
                    {c.feedback ? (
                      <div style={{ fontSize: '0.8rem', fontStyle: 'italic', backgroundColor: 'var(--bg-primary)', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid var(--border-color)' }}>
                        &quot;{c.feedback}&quot;
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No written feedback comments.</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
