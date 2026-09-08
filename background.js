// Feature Toggle: Notifications
let notificationsEnabled = true;

// Safe wrapper for notifications
const originalCreate = chrome.notifications?.create;
if (chrome.notifications) {
  chrome.notifications.create = function (notificationId, options, callback) {
    if (!notificationsEnabled) {
      if (callback) callback(notificationId);
      return;
    }
    if (originalCreate) {
      originalCreate(notificationId, options, callback);
    }
  };
}

let timerInterval = null;
let startTime = 0;
let elapsedTime = 0;
let isRunning = false;
let dailyLogs = {};
let dailyPauses = {};
let dailyBreaks = {}; 
let dailyGoalMs = 8 * 60 * 60 * 1000;
let lastWeeklyReportDate = '';

// New Minimal Classic Productivity Features
let timerMode = 'stopwatch'; // 'stopwatch' | 'pomodoro'
let pomodoroDurationMs = 25 * 60 * 1000;
let pomodoroRemainingMs = 25 * 60 * 1000;
let activeTag = 'Deep Work';
let dailySessions = {}; // { 'YYYY-MM-DD': [ { id, startTime, endTime, duration, tag, mode } ] }
let dailyTags = {}; // { 'YYYY-MM-DD': { [tag]: durationMs } }
let idleThreshold = 900; // 15 mins default in seconds
let soundEnabled = true;

// Google Sheets Sync State
let googleSheetsUrl = '';
let googleSheetsAutoSync = false;
let googleSheetsSyncStatus = 'disconnected';
let googleSheetsLastSyncTime = 0;

// Analytics State
let longestSessionMs = 0;
let overworkNotifiedForCurrentSession = false;
let startTimesSum = 0;
let startTimesCount = 0;
let hasStartedToday = false;
let timeOfDayBuckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
let lastPauseTimestamp = 0;
let lastSavedHeartbeatTime = 0;

function getTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

let lastRecordedDate = getTodayDate();
let reminderDisabledUntil = 0;
let wasAutoPaused = false;

// Calculate Streak (Consecutive days reaching daily goal)
function calculateStreak() {
  const today = getTodayDate();
  let streak = 0;
  let d = new Date();
  
  // Check if today meets goal
  const todayTotal = (dailyLogs[today] || 0) + (isRunning ? (Date.now() - startTime + elapsedTime) : elapsedTime);
  if (todayTotal >= dailyGoalMs) {
    streak++;
  }

  // Count backwards for previous days
  d.setDate(d.getDate() - 1);
  for (let i = 0; i < 365; i++) {
    const dateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    if ((dailyLogs[dateStr] || 0) >= dailyGoalMs) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// Record individual session interval
function recordSessionInterval(startMs, endMs, tag, mode) {
  const today = getTodayDate();
  const duration = Math.max(0, endMs - startMs);
  if (duration < 3000) return; // Skip sub-3-second clicks

  if (!dailySessions[today]) dailySessions[today] = [];
  const sessionItem = {
    id: 's_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    startTime: startMs,
    endTime: endMs,
    duration: duration,
    tag: tag || activeTag || 'Deep Work',
    mode: mode || timerMode || 'stopwatch'
  };
  dailySessions[today].unshift(sessionItem);

  if (dailySessions[today].length > 150) {
    dailySessions[today] = dailySessions[today].slice(0, 150);
  }

  // Record into tag breakdown
  const currentTag = tag || activeTag || 'Deep Work';
  if (!dailyTags[today]) dailyTags[today] = {};
  dailyTags[today][currentTag] = (dailyTags[today][currentTag] || 0) + duration;

  chrome.storage.local.set({ dailySessions, dailyTags });
}

// Initialize state from storage
let storageLoadedPromise = new Promise((resolve) => {
  chrome.storage.session.get('sessionActive', (sessionResult) => {
    const isNewSession = !sessionResult.sessionActive;

    chrome.storage.local.get([
      'startTime', 'elapsedTime', 'isRunning', 'dailyLogs', 'lastRecordedDate', 'reminderDisabledUntil', 'wasAutoPaused', 'dailyPauses', 'dailyGoalMs', 'lastWeeklyReportDate',
      'longestSessionMs', 'startTimesSum', 'startTimesCount', 'hasStartedToday', 'timeOfDayBuckets', 'lastPauseTimestamp', 'lastHeartbeatTime', 'dailyBreaks',
      'googleSheetsUrl', 'googleSheetsAutoSync', 'googleSheetsSyncStatus', 'googleSheetsLastSyncTime',
      'timerMode', 'pomodoroDurationMs', 'pomodoroRemainingMs', 'activeTag', 'dailySessions', 'dailyTags', 'idleThreshold', 'soundEnabled'
    ], (result) => {
      startTime = result.startTime || 0;
      elapsedTime = result.elapsedTime || 0;
      isRunning = result.isRunning || false;
      dailyLogs = result.dailyLogs || {};
      dailyBreaks = result.dailyBreaks || {};
      lastRecordedDate = result.lastRecordedDate || getTodayDate();
      reminderDisabledUntil = result.reminderDisabledUntil || 0;
      wasAutoPaused = result.wasAutoPaused || false;
      dailyPauses = result.dailyPauses || {};
      dailyGoalMs = result.dailyGoalMs || 8 * 60 * 60 * 1000;
      lastWeeklyReportDate = result.lastWeeklyReportDate || '';
      
      longestSessionMs = result.longestSessionMs || 0;
      startTimesSum = result.startTimesSum || 0;
      startTimesCount = result.startTimesCount || 0;
      hasStartedToday = result.hasStartedToday || false;
      timeOfDayBuckets = result.timeOfDayBuckets || { morning: 0, afternoon: 0, evening: 0, night: 0 };
      lastPauseTimestamp = result.lastPauseTimestamp || 0;
      const lastHeartbeatTime = result.lastHeartbeatTime || 0;

      // New Features
      timerMode = result.timerMode || 'stopwatch';
      pomodoroDurationMs = result.pomodoroDurationMs || 25 * 60 * 1000;
      pomodoroRemainingMs = result.pomodoroRemainingMs || pomodoroDurationMs;
      activeTag = result.activeTag || 'Deep Work';
      dailySessions = result.dailySessions || {};
      dailyTags = result.dailyTags || {};
      idleThreshold = result.idleThreshold || 900;
      soundEnabled = result.soundEnabled !== undefined ? result.soundEnabled : true;

      // Set idle detection interval
      try {
        if (idleThreshold > 0) {
          chrome.idle.setDetectionInterval(idleThreshold);
        }
      } catch (e) {}

      googleSheetsUrl = result.googleSheetsUrl || '';
      googleSheetsAutoSync = result.googleSheetsAutoSync || false;
      googleSheetsSyncStatus = result.googleSheetsSyncStatus || 'disconnected';
      googleSheetsLastSyncTime = result.googleSheetsLastSyncTime || 0;

      if (isNewSession) {
        chrome.storage.session.set({ sessionActive: true });

        if (isRunning) {
          isRunning = false;
          
          let activeDuration = 0;
          if (lastHeartbeatTime > startTime) {
            activeDuration = lastHeartbeatTime - startTime;
          }
          
          elapsedTime += activeDuration;
          recordWorkedTime(activeDuration, lastRecordedDate);
          checkLongestSession(elapsedTime);
          
          if (activeDuration > 0) {
            recordTimeOfDayBuckets(startTime, startTime + activeDuration);
            recordSessionInterval(startTime, startTime + activeDuration, activeTag, timerMode);
          }
          
          startTime = 0;
          lastPauseTimestamp = Date.now();
          
          chrome.storage.local.set({ 
            isRunning, 
            elapsedTime, 
            startTime, 
            dailyLogs, 
            longestSessionMs, 
            timeOfDayBuckets, 
            lastPauseTimestamp,
            lastHeartbeatTime: 0 
          });
        }
      }

      checkMidnightReset();

      if (isRunning) {
        lastSavedHeartbeatTime = (lastHeartbeatTime > 0 && !isNewSession) ? lastHeartbeatTime : Date.now();
        startBadgeUpdate();
      }
      resolve();
    });
  });
});

function checkMidnightReset() {
  const today = getTodayDate();
  if (today !== lastRecordedDate) {
    if (isRunning) {
      const endOfPreviousDay = new Date();
      endOfPreviousDay.setHours(0, 0, 0, 0); 
      
      const durationForOldDay = endOfPreviousDay.getTime() - startTime;
      
      if (durationForOldDay > 0) {
        recordWorkedTime(durationForOldDay, lastRecordedDate);
        checkLongestSession(durationForOldDay + elapsedTime);
        recordTimeOfDayBuckets(startTime, endOfPreviousDay.getTime());
        recordSessionInterval(startTime, endOfPreviousDay.getTime(), activeTag, timerMode);
      }
      
      startTime = endOfPreviousDay.getTime();
      elapsedTime = 0; 
      hasStartedToday = true;
    } else {
      elapsedTime = 0;
      startTime = 0;
      hasStartedToday = false;
    }
    
    lastPauseTimestamp = 0;
    lastRecordedDate = today;
    reminderDisabledUntil = 0;
    chrome.storage.local.set({ isRunning, elapsedTime, startTime, lastRecordedDate, reminderDisabledUntil, hasStartedToday, lastPauseTimestamp });
    
    if (googleSheetsAutoSync && googleSheetsUrl) {
      syncToGoogleSheets();
    }
    
    if (isRunning) {
      updateBadge();
    } else {
      chrome.runtime.sendMessage({ type: 'STATE_UPDATED' }).catch(() => {});
    }
  }
}

// Alarms
chrome.alarms.create('daily-reset-check', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'daily-reset-check') {
    checkMidnightReset();
    checkWeeklyReport();
    
    if (isRunning) {
      const now = Date.now();
      chrome.storage.local.get(['lastHeartbeatTime', 'startTime', 'elapsedTime'], (result) => {
        const lastHb = result.lastHeartbeatTime || 0;
        const sTime = result.startTime || 0;
        const elTime = result.elapsedTime || 0;
        
        if (lastHb > 0 && now - lastHb > 5 * 60 * 1000) {
          handleSleepStop(lastHb, sTime, elTime);
        } else {
          chrome.storage.local.set({ lastHeartbeatTime: now });
          lastSavedHeartbeatTime = now;
        }
      });
    }
  }
});

function handleSleepStop(lastHb, sTime, elTime) {
  isRunning = false;
  const activeDuration = Math.max(0, lastHb - sTime);
  elapsedTime = elTime + activeDuration;
  recordWorkedTime(activeDuration);
  checkLongestSession(elapsedTime);
  if (activeDuration > 0) {
    recordTimeOfDayBuckets(sTime, sTime + activeDuration);
    recordSessionInterval(sTime, sTime + activeDuration, activeTag, timerMode);
  }
  recordPause('idle');
  
  wasAutoPaused = false; 
  lastPauseTimestamp = 0;
  chrome.storage.local.set({ isRunning, elapsedTime, wasAutoPaused, lastPauseTimestamp, lastHeartbeatTime: 0 });
  stopBadgeUpdate();
  
  chrome.notifications.create('sleep-stop-notification', {
    type: 'basic',
    iconUrl: 'icons/logo.png',
    title: 'Focus Flow: Paused',
    message: 'Timer paused because the device went to sleep.',
    priority: 1
  });
  chrome.runtime.sendMessage({ type: 'STATE_UPDATED' }).catch(() => {});
}

function checkWeeklyReport() {
  const now = new Date();
  if (now.getDay() === 0 && now.getHours() >= 18) {
    const todayStr = getTodayDate();
    if (lastWeeklyReportDate !== todayStr) {
      sendWeeklyReport();
      lastWeeklyReportDate = todayStr;
      chrome.storage.local.set({ lastWeeklyReportDate });
    }
  }
}

function sendWeeklyReport() {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  
  let totalMs = 0;
  let bestDayMs = 0;
  let daysWithData = 0;
  
  Object.entries(dailyLogs).forEach(([dateStr, ms]) => {
    const logDate = new Date(dateStr);
    if (logDate >= startOfWeek && logDate <= now) {
      totalMs += ms;
      if (ms > bestDayMs) bestDayMs = ms;
      if (ms > 0) daysWithData++;
    }
  });
  
  const hours = (totalMs / (1000 * 60 * 60)).toFixed(1);
  const avg = daysWithData > 0 ? (totalMs / daysWithData / (1000 * 60 * 60)).toFixed(1) : 0;
  
  chrome.notifications.create('weekly-report', {
    type: 'basic',
    iconUrl: 'icons/logo.png',
    title: 'Focus Flow: Weekly Report',
    message: `You focused ${hours}h this week! Avg: ${avg}h/day. Keep up the momentum.`,
    priority: 1
  });
}

function formatBadgeText(ms) {
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const seconds = Math.floor((ms / 1000) % 60);
  const hours = Math.floor(totalMinutes / 60);
  
  if (hours > 0) {
    return `${hours}h${totalMinutes % 60}m`;
  }
  return `${totalMinutes}:${seconds.toString().padStart(2, '0')}`;
}

function updateBadge() {
  checkMidnightReset();

  if (!isRunning) {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'Focus Flow' });
    return;
  }

  const now = Date.now();
  
  if (lastSavedHeartbeatTime > 0 && now - lastSavedHeartbeatTime > 5 * 60 * 1000) {
    handleSleepStop(lastSavedHeartbeatTime, startTime, elapsedTime);
    return;
  }

  if (now - lastSavedHeartbeatTime >= 5000) {
    lastSavedHeartbeatTime = now;
    chrome.storage.local.set({ lastHeartbeatTime: now });
  }

  if (timerMode === 'pomodoro') {
    const elapsedSinceStart = now - startTime;
    const remaining = Math.max(0, pomodoroRemainingMs - elapsedSinceStart);
    
    if (remaining <= 0) {
      // Pomodoro Finished!
      doStopTimer(false);
      chrome.notifications.create('pomodoro-completed', {
        type: 'basic',
        iconUrl: 'icons/logo.png',
        title: 'Focus Sprint Complete! 🎯',
        message: `Great job! You finished your ${Math.round(pomodoroDurationMs / 60000)}-minute focus block. Take a well-deserved break!`,
        priority: 2
      });
      chrome.runtime.sendMessage({ type: 'POMODORO_COMPLETED' }).catch(() => {});
      return;
    }
    
    const formatted = formatBadgeText(remaining);
    chrome.action.setBadgeText({ text: formatted });
    chrome.action.setBadgeBackgroundColor({ color: '#1e293b' });
    chrome.action.setBadgeTextColor({ color: '#ffffff' });
    chrome.action.setTitle({ title: `Focus Flow: ${formatted} remaining (${activeTag})` });
  } else {
    const currentElapsed = now - startTime + elapsedTime;
    const formatted = formatBadgeText(currentElapsed);
    
    chrome.action.setBadgeText({ text: formatted });
    chrome.action.setBadgeBackgroundColor({ color: '#1e293b' });
    chrome.action.setBadgeTextColor({ color: '#ffffff' });
    chrome.action.setTitle({ title: `Focus Flow: ${formatted} (${activeTag})` });

    if (currentElapsed > 4 * 60 * 60 * 1000 && !overworkNotifiedForCurrentSession) {
      chrome.notifications.create('overwork-alert', {
        type: 'basic',
        iconUrl: 'icons/logo.png',
        title: 'Focus Flow: Overwork Alert',
        message: 'You have been in flow for 4+ hours straight. Consider resting your eyes!',
        priority: 1
      });
      overworkNotifiedForCurrentSession = true;
    }
  }
}

function recordWorkedTime(ms, date = null) {
  const targetDate = date || getTodayDate();
  dailyLogs[targetDate] = (dailyLogs[targetDate] || 0) + ms;
  chrome.storage.local.set({ dailyLogs });
}

function recordBreakTime(ms, date = null) {
  const targetDate = date || getTodayDate();
  dailyBreaks[targetDate] = (dailyBreaks[targetDate] || 0) + ms;
  chrome.storage.local.set({ dailyBreaks });
}

function checkLongestSession(ms) {
  if (ms > longestSessionMs) {
    longestSessionMs = ms;
    chrome.storage.local.set({ longestSessionMs });
  }
}

function recordTimeOfDayBuckets(start, end) {
  const midPoint = new Date((start + end) / 2);
  const hour = midPoint.getHours();
  let bucket = 'night';
  if (hour >= 6 && hour < 12) bucket = 'morning';
  else if (hour >= 12 && hour < 17) bucket = 'afternoon';
  else if (hour >= 17 && hour < 22) bucket = 'evening';
  
  timeOfDayBuckets[bucket] += (end - start);
  chrome.storage.local.set({ timeOfDayBuckets });
}

function recordPause(type, date = null) {
  const targetDate = date || getTodayDate();
  if (!dailyPauses[targetDate]) dailyPauses[targetDate] = { manual: 0, idle: 0 };
  dailyPauses[targetDate][type] = (dailyPauses[targetDate][type] || 0) + 1;
  chrome.storage.local.set({ dailyPauses });
}

function startBadgeUpdate() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateBadge, 1000);
  updateBadge();
}

function stopBadgeUpdate() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  chrome.action.setBadgeText({ text: '' });
}

function doStartTimer(customTag = null, customMode = null) {
  wasAutoPaused = false;
  if (customTag) activeTag = customTag;
  if (customMode) timerMode = customMode;

  if (!isRunning) {
    isRunning = true;
    const now = Date.now();
    startTime = now;
    overworkNotifiedForCurrentSession = false;
    
    // Add break duration since last pause
    if (lastPauseTimestamp > 0 && elapsedTime < dailyGoalMs) {
      let breakDuration = now - lastPauseTimestamp;
      if (breakDuration > 0) {
        const MAX_BREAK_MS = 2 * 60 * 60 * 1000;
        if (breakDuration > MAX_BREAK_MS) breakDuration = MAX_BREAK_MS;
        recordBreakTime(breakDuration);
      }
    }
    
    if (!hasStartedToday) {
      hasStartedToday = true;
      const d = new Date();
      startTimesSum += (d.getHours() * 60 + d.getMinutes());
      startTimesCount += 1;
      chrome.storage.local.set({ hasStartedToday, startTimesSum, startTimesCount });
    }
    
    lastPauseTimestamp = 0;
    lastSavedHeartbeatTime = now;
    
    chrome.storage.local.set({ 
      isRunning, startTime, wasAutoPaused, lastPauseTimestamp, lastHeartbeatTime: now,
      activeTag, timerMode, pomodoroRemainingMs 
    });
    startBadgeUpdate();
    chrome.notifications.clear('start-reminder');
  }
}

function doStopTimer(isManual) {
  wasAutoPaused = false;
  if (isRunning) {
    isRunning = false;
    const now = Date.now();
    const sessionDuration = now - startTime;
    
    elapsedTime += sessionDuration;
    recordWorkedTime(sessionDuration);
    checkLongestSession(elapsedTime);
    recordTimeOfDayBuckets(startTime, now);
    recordSessionInterval(startTime, now, activeTag, timerMode);

    if (timerMode === 'pomodoro') {
      pomodoroRemainingMs = Math.max(0, pomodoroRemainingMs - sessionDuration);
      if (pomodoroRemainingMs <= 0) {
        pomodoroRemainingMs = pomodoroDurationMs; // Reset for next session
      }
    }
    
    if (isManual) recordPause('manual');
    
    lastPauseTimestamp = now;
    chrome.storage.local.set({ 
      isRunning, elapsedTime, wasAutoPaused, lastPauseTimestamp, lastHeartbeatTime: 0,
      pomodoroRemainingMs 
    });
    stopBadgeUpdate();
    
    if (googleSheetsAutoSync && googleSheetsUrl) {
      syncToGoogleSheets();
    }
  }
}

// Runtime message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  storageLoadedPromise.then(() => {
    checkMidnightReset();

    if (message.type === 'START') {
      doStartTimer(message.tag, message.mode);
      sendResponse({ success: true });
    } else if (message.type === 'STOP') {
      doStopTimer(true);
      sendResponse({ success: true });
    } else if (message.type === 'GET_STATUS') {
      const now = Date.now();
      const currentElapsed = isRunning ? (now - startTime + elapsedTime) : elapsedTime;
      let currentPomodoroRemaining = pomodoroRemainingMs;
      if (timerMode === 'pomodoro' && isRunning) {
        currentPomodoroRemaining = Math.max(0, pomodoroRemainingMs - (now - startTime));
      }

      const todayStr = getTodayDate();
      sendResponse({ 
        isRunning, 
        elapsedTime: currentElapsed, 
        timerMode,
        pomodoroDurationMs,
        pomodoroRemainingMs: currentPomodoroRemaining,
        activeTag,
        dailySessions: dailySessions[todayStr] || [],
        allDailySessions: dailySessions,
        dailyTags: dailyTags[todayStr] || {},
        allDailyTags: dailyTags,
        dailyLogs, 
        dailyPauses, 
        dailyGoalMs, 
        startTime, 
        longestSessionMs, 
        startTimesSum, 
        startTimesCount,
        timeOfDayBuckets, 
        dailyBreaks, 
        lastPauseTimestamp,
        streakCount: calculateStreak(),
        idleThreshold,
        soundEnabled,
        googleSheetsUrl, 
        googleSheetsAutoSync, 
        googleSheetsSyncStatus, 
        googleSheetsLastSyncTime
      });
    } else if (message.type === 'UPDATE_GOAL') {
      dailyGoalMs = message.dailyGoalMs;
      chrome.storage.local.set({ dailyGoalMs });
      sendResponse({ success: true });
    } else if (message.type === 'SET_TIMER_MODE') {
      timerMode = message.mode;
      chrome.storage.local.set({ timerMode });
      updateBadge();
      sendResponse({ success: true });
    } else if (message.type === 'SET_POMODORO_DURATION') {
      pomodoroDurationMs = message.durationMs;
      pomodoroRemainingMs = message.durationMs;
      chrome.storage.local.set({ pomodoroDurationMs, pomodoroRemainingMs });
      updateBadge();
      sendResponse({ success: true });
    } else if (message.type === 'SET_ACTIVE_TAG') {
      activeTag = message.tag || 'Deep Work';
      chrome.storage.local.set({ activeTag });
      sendResponse({ success: true });
    } else if (message.type === 'SET_IDLE_THRESHOLD') {
      idleThreshold = message.threshold;
      chrome.storage.local.set({ idleThreshold });
      try {
        if (idleThreshold > 0) chrome.idle.setDetectionInterval(idleThreshold);
      } catch (e) {}
      sendResponse({ success: true });
    } else if (message.type === 'SET_SOUND_ENABLED') {
      soundEnabled = message.soundEnabled;
      chrome.storage.local.set({ soundEnabled });
      sendResponse({ success: true });
    } else if (message.type === 'RESET') {
      wasAutoPaused = false;
      isRunning = false;
      elapsedTime = 0;
      startTime = 0;
      pomodoroRemainingMs = pomodoroDurationMs;
      chrome.storage.local.set({ 
        isRunning, elapsedTime, startTime, wasAutoPaused, lastHeartbeatTime: 0, pomodoroRemainingMs 
      });
      stopBadgeUpdate();
      if (googleSheetsAutoSync && googleSheetsUrl) {
        syncToGoogleSheets();
      }
      sendResponse({ success: true });
    } else if (message.type === 'CLEAR_TODAY_LOGS') {
      const todayStr = getTodayDate();
      wasAutoPaused = false;
      isRunning = false;
      elapsedTime = 0;
      startTime = 0;
      pomodoroRemainingMs = pomodoroDurationMs;
      dailyLogs[todayStr] = 0;
      dailyBreaks[todayStr] = 0;
      dailyPauses[todayStr] = { manual: 0, idle: 0 };
      dailySessions[todayStr] = [];
      dailyTags[todayStr] = {};
      chrome.storage.local.set({
        isRunning, elapsedTime, startTime, wasAutoPaused, lastHeartbeatTime: 0,
        pomodoroRemainingMs, dailyLogs, dailyBreaks, dailyPauses, dailySessions, dailyTags
      });
      stopBadgeUpdate();
      sendResponse({ success: true });
    } else if (message.type === 'DELETE_SESSION') {
      const todayStr = getTodayDate();
      if (dailySessions[todayStr]) {
        const idx = dailySessions[todayStr].findIndex(s => s.id === message.sessionId);
        if (idx !== -1) {
          const removed = dailySessions[todayStr].splice(idx, 1)[0];
          // Subtract from dailyLogs
          dailyLogs[todayStr] = Math.max(0, (dailyLogs[todayStr] || 0) - removed.duration);
          elapsedTime = Math.max(0, elapsedTime - removed.duration);
          chrome.storage.local.set({ dailySessions, dailyLogs, elapsedTime });
        }
      }
      sendResponse({ success: true });
    } else if (message.type === 'TEST_CONNECT') {
      syncToGoogleSheets(message.url).then(res => sendResponse(res));
    } else if (message.type === 'SYNC_NOW') {
      syncToGoogleSheets().then(res => sendResponse(res));
    } else if (message.type === 'UPDATE_AUTO_SYNC') {
      googleSheetsAutoSync = message.autoSync;
      chrome.storage.local.set({ googleSheetsAutoSync });
      sendResponse({ success: true });
    } else if (message.type === 'DISCONNECT_SHEETS') {
      googleSheetsUrl = '';
      googleSheetsAutoSync = false;
      googleSheetsSyncStatus = 'disconnected';
      googleSheetsLastSyncTime = 0;
      chrome.storage.local.set({ googleSheetsUrl, googleSheetsAutoSync, googleSheetsSyncStatus, googleSheetsLastSyncTime });
      sendResponse({ success: true });
    }
  });
  return true;
});

// Auto-Pause Logic
function triggerAutoPause(newState) {
  isRunning = false;
  const now = Date.now();
  const sessionDurationSinceStart = now - startTime;
  let activeDuration;
  
  if (newState === 'idle') {
    const idleTimeMs = (idleThreshold || 900) * 1000;
    activeDuration = Math.max(0, sessionDurationSinceStart - idleTimeMs);
  } else {
    activeDuration = sessionDurationSinceStart;
  }
  
  elapsedTime += activeDuration;
  recordWorkedTime(activeDuration);
  checkLongestSession(elapsedTime);
  recordTimeOfDayBuckets(startTime, startTime + activeDuration);
  recordSessionInterval(startTime, startTime + activeDuration, activeTag, timerMode);
  recordPause('idle');
  
  wasAutoPaused = newState === 'idle';
  lastPauseTimestamp = now;
  
  chrome.storage.local.set({ isRunning, elapsedTime, wasAutoPaused, lastPauseTimestamp, lastHeartbeatTime: 0 });
  stopBadgeUpdate();

  chrome.notifications.create('auto-pause-notification', {
    type: 'basic',
    iconUrl: 'icons/logo.png',
    title: newState === 'idle' ? 'Focus Flow: Auto-Paused' : 'Focus Flow: Stopped',
    message: newState === 'idle' 
      ? `Paused after ${Math.round((idleThreshold || 900) / 60)} minutes of inactivity.`
      : 'Stopped because the screen turned off or system locked.',
    priority: 1
  });

  chrome.runtime.sendMessage({ type: 'STATE_UPDATED' }).catch(() => {});
}

chrome.idle.onStateChanged.addListener((newState) => {
  storageLoadedPromise.then(() => {
    if (newState === 'idle' || newState === 'locked') {
      if (isRunning) {
        if (newState === 'idle') {
          chrome.tabs.query({ audible: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
              return;
            }
            triggerAutoPause(newState);
          });
        } else {
          triggerAutoPause(newState);
        }
      }
    } else if (newState === 'active') {
      checkMidnightReset();
      if (wasAutoPaused && !isRunning) {
        isRunning = true;
        const now = Date.now();
        startTime = now;
        wasAutoPaused = false;
        overworkNotifiedForCurrentSession = false;
        
        if (lastPauseTimestamp > 0 && elapsedTime < dailyGoalMs) {
          let breakDuration = now - lastPauseTimestamp;
          if (breakDuration > 0) {
            const MAX_BREAK_MS = 2 * 60 * 60 * 1000;
            if (breakDuration > MAX_BREAK_MS) breakDuration = MAX_BREAK_MS;
            recordBreakTime(breakDuration);
          }
        }
        
        lastPauseTimestamp = 0;
        lastSavedHeartbeatTime = now;
        
        chrome.storage.local.set({ isRunning, startTime, wasAutoPaused, lastPauseTimestamp, lastHeartbeatTime: now });
        startBadgeUpdate();

        chrome.notifications.create('auto-resume-notification', {
          type: 'basic',
          iconUrl: 'icons/logo.png',
          title: 'Focus Flow: Auto-Resumed',
          message: 'Welcome back! Your focus flow has resumed.',
          priority: 1
        });

        chrome.runtime.sendMessage({ type: 'STATE_UPDATED' }).catch(() => {});
      }
    }
  });
});

chrome.runtime.onSuspend.addListener(() => {
  if (isRunning) {
    const now = Date.now();
    chrome.storage.local.set({ lastHeartbeatTime: now });
  }
});

// Google Sheets Sync Engine
function syncToGoogleSheets(customUrl = null) {
  const urlToUse = customUrl || googleSheetsUrl;
  if (!urlToUse) {
    return Promise.resolve({ success: false, error: 'No URL configured' });
  }

  googleSheetsSyncStatus = 'connecting';
  chrome.storage.local.set({ googleSheetsSyncStatus });
  chrome.runtime.sendMessage({ type: 'STATE_UPDATED' }).catch(() => {});

  const today = getTodayDate();
  const logsToSync = { ...dailyLogs };
  const breaksToSync = { ...dailyBreaks };
  const pausesToSync = { ...dailyPauses };

  const todayWork = isRunning ? (Date.now() - startTime + elapsedTime) : elapsedTime;
  if (todayWork > 0) {
    logsToSync[today] = todayWork;
  }

  let activeBreak = 0;
  if (!isRunning && lastPauseTimestamp > 0) {
    activeBreak = Date.now() - lastPauseTimestamp;
    const MAX_BREAK_MS = 2 * 60 * 60 * 1000;
    if (activeBreak > MAX_BREAK_MS) activeBreak = MAX_BREAK_MS;
  }
  const todayBreakTotal = (dailyBreaks[today] || 0) + activeBreak;
  if (todayBreakTotal > 0) {
    breaksToSync[today] = todayBreakTotal;
  }

  const payload = {
    dailyLogs: logsToSync,
    dailyBreaks: breaksToSync,
    dailyPauses: pausesToSync
  };

  return fetch(urlToUse, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  })
  .then(response => {
    if (!response.ok) throw new Error(`HTTP status: ${response.status}`);
    return response.json();
  })
  .then(data => {
    if (data && data.success) {
      googleSheetsSyncStatus = 'connected';
      googleSheetsLastSyncTime = Date.now();
      const updateObj = { googleSheetsSyncStatus, googleSheetsLastSyncTime };
      if (customUrl) {
        googleSheetsUrl = customUrl;
        updateObj.googleSheetsUrl = customUrl;
      }
      chrome.storage.local.set(updateObj);
      chrome.runtime.sendMessage({ type: 'STATE_UPDATED' }).catch(() => {});
      return { success: true, count: data.count };
    } else {
      throw new Error((data && data.error) || 'Apps Script returned failure');
    }
  })
  .catch(error => {
    googleSheetsSyncStatus = 'failed';
    chrome.storage.local.set({ googleSheetsSyncStatus });
    chrome.runtime.sendMessage({ type: 'STATE_UPDATED' }).catch(() => {});
    return { success: false, error: error.toString() };
  });
}
