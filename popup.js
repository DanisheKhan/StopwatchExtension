// ==========================================================================
// FOCUS FLOW — PROFESSIONAL POPUP ENGINE (ZERO-LATENCY IPC)
// ==========================================================================

function getTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

// Local State
let isRunning = false;
let displayTime = 0; // Cumulative ms recorded prior to current session
let sessionStartTime = 0; // Timestamp when active session started
let animationFrameId = null;

let currentDailyLogs = {};
let currentDailyPauses = {};
let currentDailyBreaks = {};
let currentDailyGoalMs = 8 * 60 * 60 * 1000;
let currentTimeOfDayBuckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
let currentLongestSessionMs = 0;
let currentStartTimesSum = 0;
let currentStartTimesCount = 0;
let currentLastPauseTimestamp = 0;
let currentStreakCount = 0;

let timerMode = 'stopwatch'; // 'stopwatch' | 'pomodoro'
let pomodoroDurationMs = 25 * 60 * 1000;
let pomodoroRemainingMs = 25 * 60 * 1000;
let activeTag = 'Deep Work';
let dailySessions = [];
let allDailySessions = {};
let dailyTags = {};
let idleThreshold = 900;
let soundEnabled = true;

// DOM Elements
const displayEl = document.getElementById('display');
const msEl = document.getElementById('msDisplay');
const startStopBtn = document.getElementById('startStopBtn');
const startBtnLabel = document.getElementById('startBtnLabel');
const resetBtn = document.getElementById('resetBtn');
const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');
const currentTimeEl = document.getElementById('currentTime');
const streakCountEl = document.getElementById('streakCount');
const dialProgress = document.getElementById('dialProgress');
const goalPercentText = document.getElementById('goalPercentText');

// Mode Switcher Elements
const modeStopwatchBtn = document.getElementById('modeStopwatchBtn');
const modePomodoroBtn = document.getElementById('modePomodoroBtn');
const pomodoroPresetBar = document.getElementById('pomodoroPresetBar');
const pomoChips = document.querySelectorAll('.pomo-chip');

// Tag Selector Elements
const tagSelectorBtn = document.getElementById('tagSelectorBtn');
const activeTagLabel = document.getElementById('activeTagLabel');
const tagDropdown = document.getElementById('tagDropdown');
const customTagInput = document.getElementById('customTagInput');
const tagOptItems = document.querySelectorAll('.tag-opt-item');

// Nav Tabs
const navBtns = document.querySelectorAll('.nav-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

// Analytics Elements
const kpiToday = document.getElementById('kpiToday');
const statWeekly = document.getElementById('statWeekly');
const statMonthly = document.getElementById('statMonthly');
const statAverage = document.getElementById('statAverage');
const dayGoalVal = document.getElementById('dayGoalVal');
const dayGoalBar = document.getElementById('dayGoalBar');
const dayRatioVal = document.getElementById('dayRatioVal');
const dayRatioWorkBar = document.getElementById('dayRatioWorkBar');
const dayRatioBreakBar = document.getElementById('dayRatioBreakBar');
const dayWorkHrs = document.getElementById('dayWorkHrs');
const dayBreakHrs = document.getElementById('dayBreakHrs');
const barMorning = document.getElementById('barMorning');
const barAfternoon = document.getElementById('barAfternoon');
const barEvening = document.getElementById('barEvening');
const barNight = document.getElementById('barNight');
const bestDayBadge = document.getElementById('bestDayBadge');
const avgStartTimeEl = document.getElementById('avgStartTime');
const longestSessionTimeEl = document.getElementById('longestSessionTime');
const dayPausesCombined = document.getElementById('dayPausesCombined');
const heatmapGrid = document.getElementById('heatmapGrid');
const detailsDateEl = document.getElementById('detailsDate');
const detailsTimeEl = document.getElementById('detailsTime');

// Log Elements
const sessionList = document.getElementById('sessionList');
const sessionCount = document.getElementById('sessionCount');
const copySummaryBtn = document.getElementById('copySummaryBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const clearTodayBtn = document.getElementById('clearTodayBtn');

// Settings Elements
const goalMinusBtn = document.getElementById('goalMinusBtn');
const goalPlusBtn = document.getElementById('goalPlusBtn');
const goalDisplayVal = document.getElementById('goalDisplayVal');
const dailyGoalInput = document.getElementById('dailyGoalInput');
const presetPills = document.querySelectorAll('.preset-pill');
const idleSelect = document.getElementById('idleSelect');
const soundToggle = document.getElementById('soundToggle');

// Google Sheets Elements
const syncStatusEl = document.getElementById('syncStatus');
const syncStatusDesc = document.getElementById('syncStatusDesc');
const sheetsUrlInput = document.getElementById('sheetsUrlInput');
const saveConnectBtn = document.getElementById('saveConnectBtn');
const syncNowBtn = document.getElementById('syncNowBtn');
const autoSyncCheckbox = document.getElementById('autoSyncCheckbox');
const guideToggleBtn = document.getElementById('guideToggleBtn');
const guideContent = document.getElementById('guideContent');
const copyScriptBtn = document.getElementById('copyScriptBtn');

// Toast Element
const toastNotification = document.getElementById('toastNotification');
const toastMessage = document.getElementById('toastMessage');

// ==========================================================================
// TOAST HELPER
// ==========================================================================
let toastTimer = null;
function showToast(msg) {
  if (!toastNotification || !toastMessage) return;
  toastMessage.textContent = msg;
  toastNotification.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastNotification.classList.add('hidden');
  }, 2000);
}

// ==========================================================================
// AUDIO CHIMES (Synthesized via Web Audio API)
// ==========================================================================
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) audioCtx = new AudioCtx();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playChime(type) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'start') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'stop') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(700, now);
      osc.frequency.exponentialRampToValueAtTime(350, now + 0.08);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'finish') {
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.15, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.5);
      });
    }
  } catch (e) {}
}

// ==========================================================================
// TIME FORMATTERS
// ==========================================================================
function formatTime(ms) {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  const h = hours.toString().padStart(2, '0');
  const m = minutes.toString().padStart(2, '0');
  const s = seconds.toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatMs(ms) {
  if (ms < 0) ms = 0;
  const centis = Math.floor((ms % 1000) / 10);
  return `.${centis.toString().padStart(2, '0')}`;
}

function formatShortTime(ms) {
  if (!ms || ms <= 0) return '0m';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatClockTime(ts) {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

// ==========================================================================
// LOCAL TIME CALCULATORS (ZERO IPC OVERHEAD)
// ==========================================================================
function getLiveElapsed() {
  if (isRunning && sessionStartTime > 0) {
    return displayTime + (Date.now() - sessionStartTime);
  }
  return displayTime;
}

function getLivePomodoroRemaining() {
  if (isRunning && sessionStartTime > 0) {
    const elapsedSinceStart = Date.now() - sessionStartTime;
    return Math.max(0, pomodoroRemainingMs - elapsedSinceStart);
  }
  return pomodoroRemainingMs;
}

// ==========================================================================
// 60FPS LOCAL ANIMATION LOOP (NO SENDMESSAGE INSIDE!)
// ==========================================================================
const CIRCLE_CIRCUMFERENCE = 641; // 2 * PI * 102

function startAnimation() {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  const step = () => {
    if (!isRunning) {
      animationFrameId = null;
      return;
    }

    if (timerMode === 'pomodoro') {
      const remaining = getLivePomodoroRemaining();
      displayEl.textContent = formatTime(remaining);
      msEl.textContent = formatMs(remaining);

      const completed = Math.max(0, pomodoroDurationMs - remaining);
      const ratio = Math.min(1, completed / pomodoroDurationMs);
      dialProgress.style.strokeDashoffset = CIRCLE_CIRCUMFERENCE - (ratio * CIRCLE_CIRCUMFERENCE);

      if (remaining <= 0) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        updateUI();
        return;
      }
    } else {
      const elapsed = getLiveElapsed();
      displayEl.textContent = formatTime(elapsed);
      msEl.textContent = formatMs(elapsed);

      const ratio = Math.min(elapsed / currentDailyGoalMs, 1);
      dialProgress.style.strokeDashoffset = CIRCLE_CIRCUMFERENCE - (ratio * CIRCLE_CIRCUMFERENCE);

      const pct = Math.round((elapsed / currentDailyGoalMs) * 100);
      const hrs = (currentDailyGoalMs / 3600000).toFixed(1);
      goalPercentText.textContent = `${pct}% of ${hrs}h goal`;
    }

    animationFrameId = requestAnimationFrame(step);
  };

  animationFrameId = requestAnimationFrame(step);
}

// ==========================================================================
// TAB NAVIGATION
// ==========================================================================
navBtns.forEach(btn => {
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    const tab = this.getAttribute('data-tab');
    if (tab) switchTab(tab);
  });
});

function updateNavIndicator() {
  const indicator = document.getElementById('navIndicator');
  const activeBtn = document.querySelector('.nav-btn.active');
  if (!indicator || !activeBtn) return;

  const left = activeBtn.offsetLeft;
  const width = activeBtn.offsetWidth;
  indicator.style.transform = `translateX(${left}px)`;
  indicator.style.width = `${width}px`;
}

function switchTab(tabId) {
  if (!tabId) return;

  const currentNavBtns = document.querySelectorAll('.nav-btn');
  currentNavBtns.forEach(b => {
    const isActive = b.getAttribute('data-tab') === tabId;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  const targetId = `panel${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`;
  document.querySelectorAll('.tab-panel').forEach(p => {
    const isTarget = p.id === targetId;
    p.classList.toggle('active', isTarget);
  });

  requestAnimationFrame(updateNavIndicator);

  chrome.storage.local.set({ lastActiveTab: tabId });

  if (tabId === 'analytics') {
    renderHeatmap();
    updateStatistics();
  } else if (tabId === 'log') {
    renderSessionList();
  }
}

chrome.storage.local.get('lastActiveTab', (res) => {
  if (res && res.lastActiveTab) {
    switchTab(res.lastActiveTab);
  } else {
    requestAnimationFrame(updateNavIndicator);
  }
});

window.addEventListener('load', () => {
  requestAnimationFrame(updateNavIndicator);
});
window.addEventListener('resize', updateNavIndicator);

// ==========================================================================
// MODE SELECTOR & TAGS (Optional controls)
// ==========================================================================
if (modeStopwatchBtn) {
  modeStopwatchBtn.addEventListener('click', () => {
    if (timerMode === 'stopwatch') return;
    setTimerMode('stopwatch');
  });
}

if (modePomodoroBtn) {
  modePomodoroBtn.addEventListener('click', () => {
    if (timerMode === 'pomodoro') return;
    setTimerMode('pomodoro');
  });
}

function setTimerMode(mode) {
  timerMode = mode;
  if (modeStopwatchBtn) modeStopwatchBtn.classList.toggle('active', mode === 'stopwatch');
  if (modePomodoroBtn) modePomodoroBtn.classList.toggle('active', mode === 'pomodoro');
  if (pomodoroPresetBar) pomodoroPresetBar.classList.toggle('hidden', mode !== 'pomodoro');

  chrome.runtime.sendMessage({ type: 'SET_TIMER_MODE', mode }, () => {
    updateUI();
  });
}

if (pomoChips) {
  pomoChips.forEach(chip => {
    chip.addEventListener('click', () => {
      pomoChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const mins = parseInt(chip.getAttribute('data-mins'), 10);
      const ms = mins * 60 * 1000;
      pomodoroDurationMs = ms;
      pomodoroRemainingMs = ms;
      chrome.runtime.sendMessage({ type: 'SET_POMODORO_DURATION', durationMs: ms }, () => {
        showToast(`${mins}m sprint block configured`);
        updateUI();
      });
    });
  });
}

// Tag Selector & Dropdown
if (tagSelectorBtn && tagDropdown) {
  tagSelectorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    tagDropdown.classList.toggle('hidden');
    if (!tagDropdown.classList.contains('hidden') && customTagInput) {
      customTagInput.focus();
    }
  });

  document.addEventListener('click', (e) => {
    if (!tagDropdown.contains(e.target) && e.target !== tagSelectorBtn) {
      tagDropdown.classList.add('hidden');
    }
  });
}

if (tagOptItems) {
  tagOptItems.forEach(item => {
    item.addEventListener('click', () => {
      const tag = item.getAttribute('data-tag');
      setActiveTag(tag);
      if (tagDropdown) tagDropdown.classList.add('hidden');
    });
  });
}

if (customTagInput) {
  customTagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = customTagInput.value.trim();
      if (val) {
        setActiveTag(val);
        customTagInput.value = '';
        if (tagDropdown) tagDropdown.classList.add('hidden');
      }
    }
  });
}

function setActiveTag(tag) {
  activeTag = tag;
  if (activeTagLabel) activeTagLabel.textContent = tag;
  if (tagOptItems) {
    tagOptItems.forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-tag') === tag);
    });
  }
  chrome.runtime.sendMessage({ type: 'SET_ACTIVE_TAG', tag }, () => {
    showToast(`Tag set to ${tag}`);
  });
}

// ==========================================================================
// APP HEADER CLOCK
// ==========================================================================
function updateHeaderClock() {
  if (!currentTimeEl) return;
  const now = new Date();
  let h = now.getHours();
  const m = now.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  currentTimeEl.textContent = `${h}:${m} ${ampm}`;
}
setInterval(updateHeaderClock, 1000);
updateHeaderClock();

// ==========================================================================
// CORE UI SYNC FUNCTION
// ==========================================================================
function updateUI() {
  updateHeaderClock();

  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (!response) return;

    isRunning = response.isRunning;
    displayTime = response.elapsedTime;
    sessionStartTime = response.startTime;
    timerMode = response.timerMode || 'stopwatch';
    pomodoroDurationMs = response.pomodoroDurationMs || 25 * 60 * 1000;
    pomodoroRemainingMs = response.pomodoroRemainingMs !== undefined ? response.pomodoroRemainingMs : pomodoroDurationMs;
    activeTag = response.activeTag || 'Deep Work';
    dailySessions = response.dailySessions || [];
    allDailySessions = response.allDailySessions || {};
    dailyTags = response.dailyTags || {};
    currentDailyLogs = response.dailyLogs || {};
    currentDailyPauses = response.dailyPauses || {};
    currentDailyBreaks = response.dailyBreaks || {};
    currentDailyGoalMs = response.dailyGoalMs || 8 * 3600000;
    currentTimeOfDayBuckets = response.timeOfDayBuckets || { morning: 0, afternoon: 0, evening: 0, night: 0 };
    currentLongestSessionMs = response.longestSessionMs || 0;
    currentStartTimesSum = response.startTimesSum || 0;
    currentStartTimesCount = response.startTimesCount || 0;
    currentLastPauseTimestamp = response.lastPauseTimestamp || 0;
    currentStreakCount = response.streakCount || 0;
    idleThreshold = response.idleThreshold || 900;
    soundEnabled = response.soundEnabled !== undefined ? response.soundEnabled : true;

    // Header Streak
    if (streakCountEl) streakCountEl.textContent = `${currentStreakCount}d`;

    // Active Tag & Mode Controls (if present)
    if (activeTagLabel) activeTagLabel.textContent = activeTag;
    if (tagOptItems) {
      tagOptItems.forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-tag') === activeTag);
      });
    }

    if (modeStopwatchBtn) modeStopwatchBtn.classList.toggle('active', timerMode === 'stopwatch');
    if (modePomodoroBtn) modePomodoroBtn.classList.toggle('active', timerMode === 'pomodoro');
    if (pomodoroPresetBar) pomodoroPresetBar.classList.toggle('hidden', timerMode !== 'pomodoro');

    document.body.classList.toggle('isRunning', isRunning);

    // Button states
    if (isRunning) {
      startStopBtn.classList.add('stop');
      startBtnLabel.textContent = timerMode === 'pomodoro' ? 'Pause Sprint' : 'Pause Focus';
      statusText.textContent = timerMode === 'pomodoro' ? 'IN SPRINT' : 'FOCUSING';
    } else {
      startStopBtn.classList.remove('stop');
      startBtnLabel.textContent = timerMode === 'pomodoro' ? 'Start Sprint' : 'Start Focus';
      statusText.textContent = (timerMode === 'pomodoro' ? pomodoroRemainingMs < pomodoroDurationMs : displayTime > 0) ? 'PAUSED' : 'READY';
    }

    // Dial Display
    if (timerMode === 'pomodoro') {
      const remaining = getLivePomodoroRemaining();
      displayEl.textContent = formatTime(remaining);
      msEl.textContent = isRunning ? formatMs(remaining) : '.00';

      const completed = Math.max(0, pomodoroDurationMs - remaining);
      const ratio = Math.min(1, completed / pomodoroDurationMs);
      dialProgress.style.strokeDashoffset = CIRCLE_CIRCUMFERENCE - (ratio * CIRCLE_CIRCUMFERENCE);

      const mins = Math.round(pomodoroDurationMs / 60000);
      goalPercentText.textContent = `${mins}m Pomodoro Sprint`;
    } else {
      const elapsed = getLiveElapsed();
      displayEl.textContent = formatTime(elapsed);
      msEl.textContent = isRunning ? formatMs(elapsed) : formatMs(elapsed);

      const ratio = Math.min(elapsed / currentDailyGoalMs, 1);
      dialProgress.style.strokeDashoffset = CIRCLE_CIRCUMFERENCE - (ratio * CIRCLE_CIRCUMFERENCE);

      const pct = Math.round((elapsed / currentDailyGoalMs) * 100);
      const hrs = (currentDailyGoalMs / 3600000).toFixed(1);
      goalPercentText.textContent = `${pct}% of ${hrs}h goal`;
    }

    // Animation loop
    if (isRunning) {
      if (!animationFrameId) startAnimation();
    } else {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    }

    // Update active tab contents
    const activePanel = document.querySelector('.tab-panel.active');
    if (activePanel) {
      if (activePanel.id === 'panelAnalytics') updateStatistics();
      else if (activePanel.id === 'panelLog') renderSessionList();
    }

    // Sync Settings fields
    if (goalDisplayVal && dailyGoalInput) {
      const goalHrs = (currentDailyGoalMs / 3600000).toFixed(1);
      goalDisplayVal.textContent = `${goalHrs}h`;
      dailyGoalInput.value = (currentDailyGoalMs / 3600000);
      presetPills.forEach(pill => {
        pill.classList.toggle('active', pill.getAttribute('data-hrs') === String(Math.round(currentDailyGoalMs / 3600000)));
      });
    }

    if (idleSelect) idleSelect.value = String(idleThreshold);
    if (soundToggle) soundToggle.checked = soundEnabled;

    updateSheetsUI(response);
  });
}

// ==========================================================================
// INSTANT START & RESET BUTTONS (ZERO LAG)
// ==========================================================================
startStopBtn.addEventListener('click', (e) => {
  e.preventDefault();
  if (isRunning) {
    playChime('stop');
    chrome.runtime.sendMessage({ type: 'STOP' }, () => {
      updateUI();
    });
  } else {
    playChime('start');
    chrome.runtime.sendMessage({ 
      type: 'START', 
      tag: activeTag, 
      mode: timerMode 
    }, () => {
      updateUI();
    });
  }
});

resetBtn.addEventListener('click', (e) => {
  e.preventDefault();
  if (confirm('Reset timer for today? (Your session log will be kept)')) {
    playChime('stop');
    chrome.runtime.sendMessage({ type: 'RESET' }, () => {
      showToast('Timer reset');
      updateUI();
    });
  }
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  const tag = e.target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  if (e.code === 'Space') {
    e.preventDefault();
    startStopBtn.click();
  } else if (e.code === 'KeyR') {
    e.preventDefault();
    resetBtn.click();
  } else if (e.key === '1') {
    switchTab('timer');
  } else if (e.key === '2') {
    switchTab('analytics');
  } else if (e.key === '3') {
    switchTab('log');
  } else if (e.key === '4') {
    switchTab('settings');
  }
});

// ==========================================================================
// TAB 2: INSIGHTS & HEATMAP
// ==========================================================================
function updateStatistics() {
  const now = new Date();
  const todayStr = getTodayDate();
  
  let weeklyTotal = 0;
  let monthlyTotal = 0;
  let totalLogs = 0;
  let daysWithData = 0;
  let bestDayMs = 0;

  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  let todayTotal = currentDailyLogs[todayStr] || 0;
  if (isRunning && sessionStartTime) {
    todayTotal += (Date.now() - sessionStartTime);
  }

  Object.entries(currentDailyLogs).forEach(([dateStr, ms]) => {
    let val = ms;
    if (dateStr === todayStr) val = todayTotal;

    const logDate = new Date(dateStr);
    if (logDate.getMonth() === currentMonth && logDate.getFullYear() === currentYear) {
      monthlyTotal += val;
    }
    if (logDate >= startOfWeek && logDate <= now) {
      weeklyTotal += val;
      if (val > bestDayMs) bestDayMs = val;
    }
    if (val > 0) {
      totalLogs += val;
      daysWithData++;
    }
  });

  if (kpiToday) kpiToday.textContent = formatShortTime(todayTotal);
  if (statWeekly) statWeekly.textContent = formatShortTime(weeklyTotal);
  if (statMonthly) statMonthly.textContent = formatShortTime(monthlyTotal);
  if (statAverage) statAverage.textContent = daysWithData > 0 ? formatShortTime(totalLogs / daysWithData) : '0m';
  if (bestDayBadge) bestDayBadge.textContent = bestDayMs > 0 ? formatShortTime(bestDayMs) : '-';

  if (avgStartTimeEl) {
    if (currentStartTimesCount > 0) {
      const avgMins = currentStartTimesSum / currentStartTimesCount;
      const h = Math.floor(avgMins / 60);
      const m = Math.floor(avgMins % 60);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      avgStartTimeEl.textContent = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
    } else {
      avgStartTimeEl.textContent = '-';
    }
  }

  if (longestSessionTimeEl) {
    longestSessionTimeEl.textContent = currentLongestSessionMs > 0 ? formatShortTime(currentLongestSessionMs) : '-';
  }

  const pauses = currentDailyPauses[todayStr] || { manual: 0, idle: 0 };
  if (dayPausesCombined) {
    dayPausesCombined.textContent = (pauses.manual + pauses.idle).toString();
  }

  // Goal Progress
  const goalRatio = Math.min(Math.round((todayTotal / currentDailyGoalMs) * 100), 100);
  const goalHours = (currentDailyGoalMs / 3600000).toFixed(1);
  const workedHours = (todayTotal / 3600000).toFixed(1);
  if (dayGoalVal) dayGoalVal.textContent = `${workedHours}h / ${goalHours}h (${goalRatio}%)`;
  if (dayGoalBar) dayGoalBar.style.width = `${goalRatio}%`;

  // Work vs Break
  let breakMs = currentDailyBreaks[todayStr] || 0;
  if (!isRunning && currentLastPauseTimestamp > 0 && todayTotal < currentDailyGoalMs) {
    const liveBreak = Math.min(Date.now() - currentLastPauseTimestamp, 2 * 3600000);
    breakMs += liveBreak;
  }
  const total = todayTotal + breakMs;
  if (total > 0) {
    const workPct = Math.round((todayTotal / total) * 100);
    const breakPct = 100 - workPct;
    if (dayRatioVal) dayRatioVal.textContent = `${workPct}% Work / ${breakPct}% Break`;
    if (dayRatioWorkBar) dayRatioWorkBar.style.width = `${workPct}%`;
    if (dayRatioBreakBar) dayRatioBreakBar.style.width = `${breakPct}%`;
    if (dayWorkHrs) dayWorkHrs.textContent = formatShortTime(todayTotal);
    if (dayBreakHrs) dayBreakHrs.textContent = formatShortTime(breakMs);
  } else {
    if (dayRatioVal) dayRatioVal.textContent = '100% Work';
    if (dayRatioWorkBar) dayRatioWorkBar.style.width = '100%';
    if (dayRatioBreakBar) dayRatioBreakBar.style.width = '0%';
    if (dayWorkHrs) dayWorkHrs.textContent = '0m';
    if (dayBreakHrs) dayBreakHrs.textContent = '0m';
  }

  // Time of Day distribution
  const maxBucket = Math.max(
    currentTimeOfDayBuckets.morning, 
    currentTimeOfDayBuckets.afternoon, 
    currentTimeOfDayBuckets.evening, 
    currentTimeOfDayBuckets.night, 
    1
  );
  if (barMorning) barMorning.style.height = `${(currentTimeOfDayBuckets.morning / maxBucket) * 100}%`;
  if (barAfternoon) barAfternoon.style.height = `${(currentTimeOfDayBuckets.afternoon / maxBucket) * 100}%`;
  if (barEvening) barEvening.style.height = `${(currentTimeOfDayBuckets.evening / maxBucket) * 100}%`;
  if (barNight) barNight.style.height = `${(currentTimeOfDayBuckets.night / maxBucket) * 100}%`;
}

function renderHeatmap() {
  if (!heatmapGrid) return;
  heatmapGrid.innerHTML = '';
  const todayDate = new Date();
  const startDate = new Date();
  startDate.setDate(todayDate.getDate() - 364);
  const todayStr = getTodayDate();

  for (let i = 0; i < startDate.getDay(); i++) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.visibility = 'hidden';
    heatmapGrid.appendChild(emptyDiv);
  }

  for (let i = 0; i <= 364; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;

    const cell = document.createElement('div');
    cell.classList.add('heatmap-cell');

    let timeMs = currentDailyLogs[dateStr] || 0;
    if (dateStr === todayStr && isRunning && sessionStartTime) {
      timeMs += (Date.now() - sessionStartTime);
    }

    if (timeMs > 0) {
      const hours = timeMs / 3600000;
      if (hours < 2) cell.classList.add('heatmap-lvl-1');
      else if (hours < 5) cell.classList.add('heatmap-lvl-2');
      else if (hours < 8) cell.classList.add('heatmap-lvl-3');
      else cell.classList.add('heatmap-lvl-4');
    }

    if (dateStr === todayStr) {
      cell.classList.add('selected');
      updateSelectedDateDetails(dateStr, timeMs);
    }

    cell.addEventListener('click', () => {
      const container = document.querySelector('.heatmap-container');
      if (container && container.classList.contains('is-dragging')) return;
      document.querySelectorAll('.heatmap-cell').forEach(el => el.classList.remove('selected'));
      cell.classList.add('selected');
      updateSelectedDateDetails(dateStr, timeMs);
    });

    heatmapGrid.appendChild(cell);
  }

  // Complete current week with invisible spacer cells to ensure even columns
  const remainingDaysInWeek = 6 - todayDate.getDay();
  for (let i = 0; i < remainingDaysInWeek; i++) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.visibility = 'hidden';
    emptyDiv.setAttribute('aria-hidden', 'true');
    heatmapGrid.appendChild(emptyDiv);
  }

  const container = document.querySelector('.heatmap-container');
  if (container) {
    requestAnimationFrame(() => {
      container.scrollLeft = container.scrollWidth;
    });
    initHeatmapInteractions(container);
  }
}

function initHeatmapInteractions(container) {
  if (!container || container.dataset.interactionsInit) return;
  container.dataset.interactionsInit = 'true';

  // Click & drag horizontal panning
  let isDown = false;
  let startX = 0;
  let scrollStart = 0;

  container.addEventListener('mousedown', (e) => {
    isDown = true;
    startX = e.pageX - container.offsetLeft;
    scrollStart = container.scrollLeft;
  });

  window.addEventListener('mouseup', () => {
    if (isDown) {
      isDown = false;
      setTimeout(() => {
        container.classList.remove('is-dragging');
      }, 50);
    }
  });

  container.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    const x = e.pageX - container.offsetLeft;
    const walk = x - startX;
    if (Math.abs(walk) > 3) {
      container.classList.add('is-dragging');
      e.preventDefault();
      container.scrollLeft = scrollStart - walk;
    }
  });
}

function updateSelectedDateDetails(dateStr, timeMs) {
  if (!detailsDateEl || !detailsTimeEl) return;
  const parts = dateStr.split('-');
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  detailsDateEl.textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  detailsTimeEl.textContent = formatTime(timeMs);
}

// ==========================================================================
// TAB 3: SESSIONS / LOG
// ==========================================================================
function renderSessionList() {
  if (!sessionList || !sessionCount) return;
  sessionList.innerHTML = '';
  sessionCount.textContent = `${dailySessions.length} recorded`;

  if (dailySessions.length === 0) {
    sessionList.innerHTML = `
      <div class="empty-log-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="empty-svg">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 14 14"></polyline>
        </svg>
        <span class="empty-title">No sessions yet today</span>
        <span class="empty-sub">Focus intervals will appear here automatically when you start and pause the timer.</span>
      </div>
    `;
    return;
  }

  dailySessions.forEach(session => {
    const row = document.createElement('div');
    row.classList.add('session-row');

    const modeIcon = session.mode === 'pomodoro' ? '🍅' : '⏱️';
    const startStr = formatClockTime(session.startTime);
    const endStr = formatClockTime(session.endTime);
    const durationStr = formatShortTime(session.duration);

    row.innerHTML = `
      <div class="session-row-left">
        <span class="session-badge">${modeIcon}</span>
        <div class="session-meta-info">
          <span class="session-tag-name">${escapeHtml(session.tag || 'Deep Work')}</span>
          <span class="session-time-str">${startStr} &rarr; ${endStr}</span>
        </div>
      </div>
      <div class="session-row-right">
        <span class="session-time-spent">${durationStr}</span>
        <button class="session-remove-btn" title="Delete interval" data-id="${session.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    const delBtn = row.querySelector('.session-remove-btn');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      row.classList.add('exiting');
      setTimeout(() => {
        chrome.runtime.sendMessage({ type: 'DELETE_SESSION', sessionId: session.id }, () => {
          showToast('Session removed');
          updateUI();
        });
      }, 220);
    });

    sessionList.appendChild(row);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

if (copySummaryBtn) {
  copySummaryBtn.addEventListener('click', () => {
    const todayStr = getTodayDate();
    const d = new Date();
    const dateFormatted = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    
    let liveToday = currentDailyLogs[todayStr] || 0;
    if (isRunning && sessionStartTime) {
      liveToday += (Date.now() - sessionStartTime);
    }
    const workedHours = (liveToday / 3600000).toFixed(1);
    const goalHours = (currentDailyGoalMs / 3600000).toFixed(1);
    const goalPct = Math.round((liveToday / currentDailyGoalMs) * 100);

    let summaryText = `🎯 Focus Flow Summary — ${dateFormatted}\n`;
    summaryText += `⏱️ Focus Time: ${formatShortTime(liveToday)} (${workedHours}h / ${goalHours}h • ${goalPct}%)\n`;
    summaryText += `⚡ Active Streak: ${currentStreakCount} day${currentStreakCount === 1 ? '' : 's'}\n`;
    summaryText += `📋 Sessions: ${dailySessions.length} recorded\n`;

    if (Object.keys(dailyTags).length > 0) {
      summaryText += `🏷️ Tasks Breakdown:\n`;
      Object.entries(dailyTags).forEach(([tag, ms]) => {
        summaryText += `  • ${tag}: ${formatShortTime(ms)}\n`;
      });
    }

    navigator.clipboard.writeText(summaryText).then(() => {
      showToast('Standup summary copied!');
    }).catch(() => {
      showToast('Could not copy');
    });
  });
}

if (exportCsvBtn) {
  exportCsvBtn.addEventListener('click', () => {
    let csvContent = 'Date,Session ID,Mode,Tag,Start Time,End Time,Duration Minutes,Formatted\n';
    const allDates = Object.keys(allDailySessions).sort().reverse();

    if (allDates.length === 0) {
      const todayStr = getTodayDate();
      csvContent += `"${todayStr}","N/A","stopwatch","Deep Work","","",${((currentDailyLogs[todayStr] || 0) / 60000).toFixed(1)},"${formatShortTime(currentDailyLogs[todayStr] || 0)}"\n`;
    } else {
      allDates.forEach(date => {
        const sessions = allDailySessions[date] || [];
        sessions.forEach(s => {
          const durationMins = (s.duration / 60000).toFixed(1);
          const startStr = new Date(s.startTime).toISOString();
          const endStr = new Date(s.endTime).toISOString();
          csvContent += `"${date}","${s.id}","${s.mode}","${s.tag}","${startStr}","${endStr}",${durationMins},"${formatShortTime(s.duration)}"\n`;
        });
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `focus-flow-${getTodayDate()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV downloaded!');
  });
}

if (clearTodayBtn) {
  clearTodayBtn.addEventListener('click', () => {
    if (confirm('Clear today\'s timer progress and all recorded sessions?')) {
      chrome.runtime.sendMessage({ type: 'CLEAR_TODAY_LOGS' }, () => {
        showToast('Today cleared');
        updateUI();
      });
    }
  });
}

// ==========================================================================
// TAB 4: SETTINGS
// ==========================================================================
if (goalMinusBtn && goalPlusBtn && dailyGoalInput) {
  goalMinusBtn.addEventListener('click', () => {
    let current = parseFloat(dailyGoalInput.value) || 8;
    if (current > 1) {
      current = Math.max(1, current - 0.5);
      saveDailyGoal(current);
    }
  });

  goalPlusBtn.addEventListener('click', () => {
    let current = parseFloat(dailyGoalInput.value) || 8;
    if (current < 24) {
      current = Math.min(24, current + 0.5);
      saveDailyGoal(current);
    }
  });

  presetPills.forEach(pill => {
    pill.addEventListener('click', () => {
      presetPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const hrs = parseFloat(pill.getAttribute('data-hrs'));
      saveDailyGoal(hrs);
    });
  });
}

function saveDailyGoal(hours) {
  dailyGoalInput.value = hours;
  if (goalDisplayVal) goalDisplayVal.textContent = `${hours.toFixed(1)}h`;
  chrome.runtime.sendMessage({ type: 'UPDATE_GOAL', dailyGoalMs: hours * 3600000 }, () => {
    showToast(`Target goal: ${hours}h`);
    updateUI();
  });
}

if (idleSelect) {
  idleSelect.addEventListener('change', (e) => {
    const threshold = parseInt(e.target.value, 10);
    chrome.runtime.sendMessage({ type: 'SET_IDLE_THRESHOLD', threshold }, () => {
      showToast(threshold === 0 ? 'Auto-pause disabled' : `Auto-pause set to ${threshold / 60}m`);
    });
  });
}

if (soundToggle) {
  soundToggle.addEventListener('change', (e) => {
    soundEnabled = e.target.checked;
    chrome.runtime.sendMessage({ type: 'SET_SOUND_ENABLED', soundEnabled }, () => {
      if (soundEnabled) playChime('start');
      showToast(soundEnabled ? 'Audio chimes active' : 'Audio chimes muted');
    });
  });
}

// ==========================================================================
// GOOGLE SHEETS CLOUD SYNC
// ==========================================================================
function updateSheetsUI(response) {
  if (!syncStatusEl) return;
  const status = response.googleSheetsSyncStatus || 'disconnected';
  const savedUrl = response.googleSheetsUrl || '';
  const lastSync = response.googleSheetsLastSyncTime || 0;

  if (document.activeElement !== sheetsUrlInput && sheetsUrlInput) {
    sheetsUrlInput.value = savedUrl;
  }
  if (autoSyncCheckbox) {
    autoSyncCheckbox.checked = response.googleSheetsAutoSync || false;
  }

  syncStatusEl.className = 'sync-badge';
  if (status === 'connected') {
    syncStatusEl.classList.add('connected');
    let lastTimeStr = 'Just now';
    if (lastSync > 0) {
      const diff = Date.now() - lastSync;
      const mins = Math.floor(diff / 60000);
      if (mins < 1) lastTimeStr = 'Just now';
      else if (mins < 60) lastTimeStr = `${mins}m ago`;
      else lastTimeStr = `${Math.floor(mins / 60)}h ago`;
    }
    syncStatusEl.textContent = 'Connected';
    if (syncStatusDesc) syncStatusDesc.textContent = `Synced: ${lastTimeStr}`;
    if (syncNowBtn) syncNowBtn.disabled = false;
    if (saveConnectBtn) saveConnectBtn.textContent = 'Disconnect';
  } else if (status === 'connecting') {
    syncStatusEl.classList.add('connecting');
    syncStatusEl.textContent = 'Connecting...';
    if (syncNowBtn) syncNowBtn.disabled = true;
    if (saveConnectBtn) saveConnectBtn.textContent = 'Connecting...';
  } else {
    syncStatusEl.classList.add('disconnected');
    syncStatusEl.textContent = 'Not Connected';
    if (syncStatusDesc) syncStatusDesc.textContent = 'Continuous cloud backup';
    if (syncNowBtn) syncNowBtn.disabled = true;
    if (saveConnectBtn) saveConnectBtn.textContent = 'Connect';
  }
}

if (saveConnectBtn && sheetsUrlInput) {
  saveConnectBtn.addEventListener('click', () => {
    if (saveConnectBtn.textContent === 'Disconnect') {
      sheetsUrlInput.value = '';
      chrome.runtime.sendMessage({ type: 'DISCONNECT_SHEETS' }, () => {
        showToast('Disconnected');
        updateUI();
      });
      return;
    }

    const url = sheetsUrlInput.value.trim();
    if (!url) {
      showToast('Paste a Web App URL');
      return;
    }

    saveConnectBtn.disabled = true;
    saveConnectBtn.textContent = 'Connecting...';

    chrome.runtime.sendMessage({ type: 'TEST_CONNECT', url }, (res) => {
      saveConnectBtn.disabled = false;
      if (res && res.success) {
        showToast('Connected successfully!');
      } else {
        showToast('Connection failed');
      }
      updateUI();
    });
  });
}

if (syncNowBtn) {
  syncNowBtn.addEventListener('click', () => {
    syncNowBtn.disabled = true;
    syncNowBtn.textContent = 'Syncing...';
    chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, (res) => {
      syncNowBtn.disabled = false;
      syncNowBtn.textContent = 'Sync Now';
      if (res && res.success) {
        showToast(`Synced ${res.count} records!`);
      } else {
        showToast('Sync failed');
      }
      updateUI();
    });
  });
}

if (autoSyncCheckbox) {
  autoSyncCheckbox.addEventListener('change', (e) => {
    chrome.runtime.sendMessage({ type: 'UPDATE_AUTO_SYNC', autoSync: e.target.checked }, () => {
      showToast(e.target.checked ? 'Auto-sync active' : 'Auto-sync off');
    });
  });
}

if (guideToggleBtn && guideContent) {
  guideToggleBtn.addEventListener('click', () => {
    const isHidden = guideContent.classList.toggle('hidden');
    guideToggleBtn.classList.toggle('open', !isHidden);
    guideToggleBtn.classList.toggle('expanded', !isHidden);
  });
}

if (copyScriptBtn) {
  copyScriptBtn.addEventListener('click', () => {
    const scriptCode = `function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Date", "Work Hours", "Break Hours", "Manual Pauses", "Idle Pauses", "Work %", "Last Updated"]);
      sheet.getRange("A1:G1").setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
    }
    
    function parseDateString(str) {
      if (!str) return "";
      str = String(str).trim();
      if (/^\\d{4}-\\d{2}-\\d{2}$/.test(str)) return str;
      var m = str.match(/^(\\d{1,2})[\\/\\-](\\d{1,2})[\\/\\-](\\d{4})$/);
      if (m) return m[3] + "-" + ("0" + m[1]).slice(-2) + "-" + ("0" + m[2]).slice(-2);
      try {
        var d = new Date(str);
        if (!isNaN(d.getTime())) {
          return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
        }
      } catch (e) {}
      return str;
    }
    
    var dateRowMap = {};
    if (sheet.getLastRow() > 1) {
      var existingData = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getDisplayValues();
      for (var r = 0; r < existingData.length; r++) {
        var rawDateVal = existingData[r][0];
        if (rawDateVal) {
          var parsedKey = parseDateString(rawDateVal);
          if (parsedKey) dateRowMap[parsedKey] = r + 2;
        }
      }
    }
    
    var logs = data.dailyLogs || {};
    var breaks = data.dailyBreaks || {};
    var pauses = data.dailyPauses || {};
    var dates = Object.keys(logs).concat(Object.keys(breaks)).concat(Object.keys(pauses));
    dates = Array.from(new Set(dates)).sort();
    
    if (dates.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ success: true, count: 0 }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var nowStr = new Date().toLocaleString();
    var updatedCount = 0;
    
    for (var i = 0; i < dates.length; i++) {
      var dateStr = dates[i];
      var workMs = logs[dateStr] || 0;
      var breakMs = breaks[dateStr] || 0;
      var pauseData = pauses[dateStr] || { manual: 0, idle: 0 };
      
      var workHours = Number((workMs / 3600000).toFixed(2));
      var breakHours = Number((breakMs / 3600000).toFixed(2));
      var totalHours = workHours + breakHours;
      var workPct = totalHours > 0 ? Math.round((workHours / totalHours) * 100) : 0;
      
      var rowValues = [dateStr, workHours, breakHours, pauseData.manual || 0, pauseData.idle || 0, workPct + "%", nowStr];
      
      if (dateRowMap[dateStr]) {
        sheet.getRange(dateRowMap[dateStr], 1, 1, 7).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
        dateRowMap[dateStr] = sheet.getLastRow();
      }
      updatedCount++;
    }
    
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).sort({column: 1, ascending: true});
      sheet.autoResizeColumns(1, 7);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, count: updatedCount }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

    navigator.clipboard.writeText(scriptCode).then(() => {
      showToast('Apps Script code copied!');
    }).catch(() => {
      showToast('Could not copy');
    });
  });
}

// Background event listener
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATE_UPDATED') {
    updateUI();
  } else if (message.type === 'POMODORO_COMPLETED') {
    playChime('finish');
    showToast('🎉 Pomodoro Sprint Complete!');
    updateUI();
  }
});

// Boot & gentle 1s sync interval (replaces 60fps IPC flood!)
updateUI();
setInterval(updateUI, 1000);
