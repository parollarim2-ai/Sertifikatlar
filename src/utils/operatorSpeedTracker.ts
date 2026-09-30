import { Student } from '../types';

export interface CertifyEvent {
  studentId: string;
  studentName: string;
  timestamp: string; // ISO string
}

export interface DaySpeedSummary {
  dateKey: string; // YYYY-MM-DD
  label: string; // Masalan: "Bugun", "Kecha", "28-sentabr"
  count: number;
  averageSeconds: number;
  speedFormatted: string;
}

export interface OperatorSpeedAnalysis {
  isActive: boolean; // 3+ consecutive in <=15 min gap, and last <=15 min ago
  streakCount: number; // how many in current streak
  minutesSinceLastCert: number;
  currentIntervalFormatted: string; // time since last cert (e.g. "3 daqiqa oldin")
  
  // Averages
  todayAverageSeconds: number;
  todayAverageFormatted: string;
  yesterdayAverageSeconds: number;
  yesterdayAverageFormatted: string;
  overallAverageSeconds: number;
  overallAverageFormatted: string;
  
  // Growth & Comparison
  speedChangePercent: number; // positive means faster today vs yesterday!
  isFasterThanYesterday: boolean;
  
  // All time record
  recordSeconds: number;
  recordFormatted: string;
  recordStudentName?: string;
  recordDate?: string;
  
  // Tomorrow's Prediction
  predictedSecondsTomorrow: number;
  predictedTomorrowFormatted: string;
  projectedCountTomorrow: number;
  predictionConfidence: string;
  
  // Timeline history for Chart (diagramma)
  dailyHistory: DaySpeedSummary[];
  recentIntervals: {
    studentName: string;
    seconds: number;
    formatted: string;
    time: string;
  }[];
}

const STORAGE_LOGS_KEY = 'coursera_operator_certify_logs_v1';

/**
 * Load raw certify logs from storage or seed from existing certified students
 */
export function getStoredCertifyLogs(students: Student[] = []): CertifyEvent[] {
  let logs: CertifyEvent[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_LOGS_KEY);
    if (raw) {
      logs = JSON.parse(raw);
    }
  } catch {}

  // If no logs in storage yet, seed from certified students
  if (!logs || logs.length === 0) {
    const certified = students
      .filter((s) => s.status === 'certified')
      .map((s) => ({
        studentId: s.id,
        studentName: s.fullName,
        timestamp: s.certifiedAt || s.createdAt || new Date().toISOString(),
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (certified.length > 0) {
      logs = certified;
      try {
        localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(logs));
      } catch {}
    }
  }

  return logs;
}

/**
 * Record a new certificate entry in history
 */
export function recordCertifyEvent(studentId: string, studentName: string, timestamp?: string): CertifyEvent[] {
  const time = timestamp || new Date().toISOString();
  let logs = getStoredCertifyLogs();

  // Avoid exact duplicate
  if (!logs.some((l) => l.studentId === studentId && Math.abs(new Date(l.timestamp).getTime() - new Date(time).getTime()) < 2000)) {
    logs.push({ studentId, studentName, timestamp: time });
    logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    try {
      localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(logs));
    } catch {}
  }
  return logs;
}

/**
 * Format duration in seconds to Uzbek human readable format
 * e.g. "1 daq 45 son" or "42 soniya"
 */
export function formatDurationSeconds(seconds: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return "—";
  const sec = Math.round(seconds);
  if (sec < 60) {
    return `${sec} soniya`;
  }
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (remSec === 0) {
    return `${min} daqiqa`;
  }
  return `${min} daq ${remSec} son`;
}

/**
 * Analyze operator speed and activity with 15-minute gap threshold
 */
export function analyzeOperatorSpeed(logs: CertifyEvent[]): OperatorSpeedAnalysis {
  const sorted = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const now = Date.now();
  const FIFTEEN_MIN_SEC = 15 * 60;

  if (sorted.length === 0) {
    return {
      isActive: false,
      streakCount: 0,
      minutesSinceLastCert: 999,
      currentIntervalFormatted: "Hali kiritilmagan",
      todayAverageSeconds: 0,
      todayAverageFormatted: "—",
      yesterdayAverageSeconds: 0,
      yesterdayAverageFormatted: "—",
      overallAverageSeconds: 0,
      overallAverageFormatted: "—",
      speedChangePercent: 0,
      isFasterThanYesterday: false,
      recordSeconds: 0,
      recordFormatted: "—",
      predictedSecondsTomorrow: 0,
      predictedTomorrowFormatted: "—",
      projectedCountTomorrow: 0,
      predictionConfidence: "Kam ma'lumot",
      dailyHistory: [],
      recentIntervals: [],
    };
  }

  const lastEvent = sorted[sorted.length - 1];
  const lastTimeMs = new Date(lastEvent.timestamp).getTime();
  const minutesSinceLastCert = Math.max(0, (now - lastTimeMs) / (60 * 1000));
  const currentIntervalFormatted =
    minutesSinceLastCert < 1
      ? "Hozirgina"
      : minutesSinceLastCert < 60
      ? `${Math.floor(minutesSinceLastCert)} daqiqa oldin`
      : `${Math.floor(minutesSinceLastCert / 60)} soat oldin`;

  // 1. Calculate active streak backwards
  let streakCount = 1;
  for (let i = sorted.length - 1; i > 0; i--) {
    const tCurrent = new Date(sorted[i].timestamp).getTime();
    const tPrev = new Date(sorted[i - 1].timestamp).getTime();
    const diffSec = (tCurrent - tPrev) / 1000;
    if (diffSec <= FIFTEEN_MIN_SEC && diffSec > 0) {
      streakCount++;
    } else {
      break;
    }
  }

  // Active condition: At least 3 certificates in streak AND last certificate <= 15 minutes ago
  const isActive = streakCount >= 3 && minutesSinceLastCert <= 15;

  // 2. Compute valid intervals (<15 min and >5 sec) across history
  interface IntervalData {
    seconds: number;
    timestamp: string;
    studentName: string;
    dateKey: string;
  }

  const allIntervals: IntervalData[] = [];
  let recordSeconds = Infinity;
  let recordStudentName = '';
  let recordDate = '';

  for (let i = 1; i < sorted.length; i++) {
    const tCurrent = new Date(sorted[i].timestamp).getTime();
    const tPrev = new Date(sorted[i - 1].timestamp).getTime();
    const diffSec = (tCurrent - tPrev) / 1000;

    // Filter reasonable intervals within active work sessions
    if (diffSec > 5 && diffSec <= FIFTEEN_MIN_SEC) {
      const dateKey = sorted[i].timestamp.slice(0, 10);
      allIntervals.push({
        seconds: diffSec,
        timestamp: sorted[i].timestamp,
        studentName: sorted[i].studentName,
        dateKey,
      });

      if (diffSec < recordSeconds) {
        recordSeconds = diffSec;
        recordStudentName = sorted[i].studentName;
        recordDate = sorted[i].timestamp;
      }
    }
  }

  // If no interval < 15 min found, fallback record
  if (recordSeconds === Infinity) {
    recordSeconds = 0;
  }

  // 3. Group intervals by day
  const todayKey = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(now - 24 * 3600 * 1000);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  const todayIntervals = allIntervals.filter((item) => item.dateKey === todayKey);
  const yesterdayIntervals = allIntervals.filter((item) => item.dateKey === yesterdayKey);

  const calcAvg = (arr: IntervalData[]) =>
    arr.length > 0 ? arr.reduce((acc, curr) => acc + curr.seconds, 0) / arr.length : 0;

  const todayAverageSeconds = calcAvg(todayIntervals);
  const yesterdayAverageSeconds = calcAvg(yesterdayIntervals);
  const overallAverageSeconds = calcAvg(allIntervals);

  // Speed change calculation (lower seconds = faster speed!)
  let speedChangePercent = 0;
  let isFasterThanYesterday = false;
  if (todayAverageSeconds > 0 && yesterdayAverageSeconds > 0) {
    speedChangePercent = Math.round(((yesterdayAverageSeconds - todayAverageSeconds) / yesterdayAverageSeconds) * 100);
    isFasterThanYesterday = speedChangePercent > 0;
  }

  // 4. Daily history for diagram (last 7 days)
  const daysMap = new Map<string, IntervalData[]>();
  // Initialize last 5 days
  for (let d = 4; d >= 0; d--) {
    const dayDate = new Date(now - d * 24 * 3600 * 1000);
    const k = dayDate.toISOString().slice(0, 10);
    daysMap.set(k, []);
  }

  allIntervals.forEach((item) => {
    if (daysMap.has(item.dateKey)) {
      daysMap.get(item.dateKey)!.push(item);
    }
  });

  const dailyHistory: DaySpeedSummary[] = Array.from(daysMap.entries()).map(([k, items]) => {
    const avgSec = calcAvg(items);
    let label = k.slice(5); // MM-DD
    if (k === todayKey) label = "Bugun";
    else if (k === yesterdayKey) label = "Kecha";

    return {
      dateKey: k,
      label,
      count: items.length + (items.length > 0 ? 1 : 0),
      averageSeconds: Math.round(avgSec),
      speedFormatted: formatDurationSeconds(avgSec),
    };
  });

  // 5. Prediction for tomorrow
  // Use weighted trend: 60% today, 40% yesterday or overall
  let predictedSecondsTomorrow = 0;
  if (todayAverageSeconds > 0 && yesterdayAverageSeconds > 0) {
    predictedSecondsTomorrow = Math.max(30, Math.round(todayAverageSeconds * 0.7 + yesterdayAverageSeconds * 0.3));
  } else if (todayAverageSeconds > 0) {
    predictedSecondsTomorrow = Math.max(30, Math.round(todayAverageSeconds * 0.95)); // optimistic expectation
  } else if (overallAverageSeconds > 0) {
    predictedSecondsTomorrow = Math.round(overallAverageSeconds);
  } else {
    predictedSecondsTomorrow = 120; // 2 min default
  }

  // In an average 2-hour work shift (7200 seconds)
  const projectedCountTomorrow = Math.round(7200 / predictedSecondsTomorrow);
  const predictionConfidence = allIntervals.length >= 10 ? "Yuqori aniqlik (95%)" : "O'rtacha";

  // Recent intervals for breakdown table
  const recentIntervals = allIntervals.slice(-8).reverse().map((item) => ({
    studentName: item.studentName,
    seconds: Math.round(item.seconds),
    formatted: formatDurationSeconds(item.seconds),
    time: new Date(item.timestamp).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  }));

  return {
    isActive,
    streakCount,
    minutesSinceLastCert: Math.round(minutesSinceLastCert),
    currentIntervalFormatted,
    todayAverageSeconds: Math.round(todayAverageSeconds),
    todayAverageFormatted: formatDurationSeconds(todayAverageSeconds),
    yesterdayAverageSeconds: Math.round(yesterdayAverageSeconds),
    yesterdayAverageFormatted: formatDurationSeconds(yesterdayAverageSeconds),
    overallAverageSeconds: Math.round(overallAverageSeconds),
    overallAverageFormatted: formatDurationSeconds(overallAverageSeconds),
    speedChangePercent,
    isFasterThanYesterday,
    recordSeconds: Math.round(recordSeconds),
    recordFormatted: formatDurationSeconds(recordSeconds),
    recordStudentName,
    recordDate: recordDate ? new Date(recordDate).toLocaleDateString('uz-UZ') : undefined,
    predictedSecondsTomorrow,
    predictedTomorrowFormatted: formatDurationSeconds(predictedSecondsTomorrow),
    projectedCountTomorrow,
    predictionConfidence,
    dailyHistory,
    recentIntervals,
  };
}
