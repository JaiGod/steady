/* Steady engine: pure logic, no DOM. Works in browsers (window.ST) and Node (require).
   Carries over the Time Management App's planner rules (priority score, productivity score, XP, streaks)
   and adds the school-level workload balancer. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ST = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---- Rules inherited from the Time Management App ---- */
  var IMPORTANCE = { low: 1, medium: 2, high: 3 };
  var DIFFICULTY = { easy: { w: 1, xp: 10 }, medium: { w: 1.5, xp: 25 }, hard: { w: 2, xp: 50 } };
  var DAILY_FOCUS_GOAL = 240, PRODUCTIVE_FOCUS = 25;

  /* ---- Workload model. ASSUMPTIONS to validate with teachers and counselors in the pilot. ---- */
  var TYPES = {
    homework: { label: 'Homework', w: 1, major: false, icon: '📚' },
    quiz:     { label: 'Quiz',     w: 2, major: false, icon: '✏️' },
    essay:    { label: 'Essay',    w: 3, major: true,  icon: '📝' },
    project:  { label: 'Project',  w: 3, major: true,  icon: '🧩' },
    test:     { label: 'Test',     w: 4, major: true,  icon: '📋' }
  };
  var HARD_BONUS = 1;           // a Hard item adds 1 load point
  var MODERATE_AT = 4, HEAVY_AT = 7;   // load points per day
  var PAPER = { sheetsPerTree: 8333 }; // common estimate used by print-management tools: about 8,333 sheets per tree

  function clamp(v, lo, hi) { v = Number(v); if (!isFinite(v)) v = lo; return Math.min(hi, Math.max(lo, v)); }
  function round(v, d) { var p = Math.pow(10, d == null ? 2 : d); return Math.round(v * p) / p; }

  /* ---- Dates (local, YYYY-MM-DD) ---- */
  function ymd(d) { var m = d.getMonth() + 1, day = d.getDate(); return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day; }
  function parseYmd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function daysBetween(a, b) { var x = parseYmd(a), y = parseYmd(b); return Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 86400000); }
  function isWeekday(s) { var g = parseYmd(s).getDay(); return g >= 1 && g <= 5; }

  /* ---- Priority (same rule as the original app): importance x urgency x difficulty ---- */
  function urgencyFor(due, today) {
    if (!due) return 1;
    var n = daysBetween(today, due);
    if (n < 0) return 6; if (n === 0) return 5; if (n === 1) return 4; if (n <= 3) return 3; if (n <= 7) return 2; return 1;
  }
  function priorityScore(t, today) { return (IMPORTANCE[t.importance] || 2) * urgencyFor(t.due, today) * (DIFFICULTY[t.difficulty] || DIFFICULTY.medium).w; }
  function smartOrder(tasks, today) {
    return tasks.slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      var d = priorityScore(b, today) - priorityScore(a, today); if (d) return d;
      var ad = a.due || '9999-99-99', bd = b.due || '9999-99-99'; if (ad !== bd) return ad < bd ? -1 : 1;
      return (a.created || 0) - (b.created || 0);
    });
  }
  function dueLabel(due, today) {
    var n = daysBetween(today, due);
    if (n < -1) return 'Overdue by ' + (-n) + ' days'; if (n === -1) return 'Overdue since yesterday'; if (n === 0) return 'Due today'; if (n === 1) return 'Due tomorrow';
    if (n < 7) return 'Due ' + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][parseYmd(due).getDay()];
    return 'Due ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseYmd(due).getMonth()] + ' ' + parseYmd(due).getDate();
  }
  function isOverdue(t, today) { return !t.done && !!t.due && t.due < today; }
  function tasksForToday(tasks, today) { return tasks.filter(function (t) { return t.done ? t.completedOn === today : (t.due && t.due <= today); }); }

  /* ---- Productivity score, XP, levels, streaks (same rules as the original app) ---- */
  function productivity(tasks, focusMinutes, today) {
    var td = tasksForToday(tasks, today), done = td.filter(function (t) { return t.done; }).length;
    var overdue = tasks.filter(function (t) { return isOverdue(t, today); }).length;
    var taskPts = td.length === 0 ? 20 : 40 * done / td.length;
    var focusPts = 40 * Math.min(1, focusMinutes / DAILY_FOCUS_GOAL);
    var overPts = Math.max(0, 20 - overdue * 5);
    return { score: clamp(Math.round(taskPts + focusPts + overPts), 0, 100), done: done, planned: td.length, overdue: overdue, focusMinutes: focusMinutes };
  }
  function xpToAdvance(level) { return 100 + (level - 1) * 50; }
  function levelFor(totalXp) {
    var lv = 1, rem = Math.max(0, totalXp | 0);
    while (rem >= xpToAdvance(lv)) { rem -= xpToAdvance(lv); lv++; }
    var title = lv >= 30 ? 'Time Wizard' : lv >= 20 ? 'Scholar' : lv >= 15 ? 'Senior' : lv >= 10 ? 'Junior' : lv >= 5 ? 'Sophomore' : 'Freshman';
    return { level: lv, title: title, into: rem, need: xpToAdvance(lv), pct: rem / xpToAdvance(lv) };
  }
  function isProductive(day) { return !!day && (day.focus >= PRODUCTIVE_FOCUS || day.done > 0); }
  /* An unproductive today does not break the streak until the day is over. */
  function streak(stats, today) {
    var d = isProductive(stats[today]) ? today : addDays(today, -1), n = 0;
    while (isProductive(stats[d])) { n++; d = addDays(d, -1); }
    return n;
  }

  /* ---- Workload model ---- */
  function itemLoad(t) { var ty = TYPES[t.type] || TYPES.homework; return ty.w + (t.difficulty === 'hard' ? HARD_BONUS : 0); }
  function levelOf(load) { return load >= HEAVY_AT ? 'heavy' : load >= MODERATE_AT ? 'moderate' : load > 0 ? 'light' : 'free'; }
  /* Load for each of n days starting at `from`, counting open items by due date. */
  function dayLoads(tasks, from, n) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var date = addDays(from, i), items = tasks.filter(function (t) { return !t.done && t.due === date; });
      var load = items.reduce(function (s, t) { return s + itemLoad(t); }, 0), majors = items.filter(function (t) { return (TYPES[t.type] || {}).major; }).length;
      out.push({ date: date, load: load, majors: majors, items: items, level: levelOf(load), collision: majors >= 2 });
    }
    return out;
  }

  /* Load-aware study planner: spread prep minutes over the days before the due date, preferring lighter days.
     Greedy, 15-minute chunks, capped per day. Never places work on or after the due date. */
  function planStudy(task, tasks, today, o) {
    o = o || {};
    var cap = o.capMinutes || 90, win = o.windowDays || 7, chunk = 15;
    var empty = { blocks: [], placed: 0, unplaced: 0, total: 0 };
    if (!task.due) return empty;
    var start = addDays(task.due, -win); if (start < today) start = today;
    var days = []; for (var d = start; d < task.due; d = addDays(d, 1)) days.push(d);
    var total = Math.ceil(clamp(task.minutes || 30, 5, 600) / chunk) * chunk;
    var base = {}; tasks.forEach(function (t) { if (!t.done && t.id !== task.id && t.due) base[t.due] = (base[t.due] || 0) + itemLoad(t); });
    var alloc = {}; days.forEach(function (x) { alloc[x] = 0; });
    var placed = 0;
    while (placed < total) {
      var best = null, bestScore = Infinity;
      days.forEach(function (x, i) {
        if (alloc[x] + chunk > cap) return;
        var score = (base[x] || 0) + (alloc[x] / chunk) * 0.75 + i * 0.001;
        if (score < bestScore) { bestScore = score; best = x; }
      });
      if (!best) break;
      alloc[best] += chunk; placed += chunk;
    }
    return { blocks: days.filter(function (x) { return alloc[x] > 0; }).map(function (x) { return { date: x, minutes: alloc[x] }; }), placed: placed, unplaced: total - placed, total: total };
  }

  /* ---- Paper saved by planning digitally (sheets and trees only) ---- */
  function paperSaved(sheets) { sheets = Math.max(0, sheets); return { sheets: sheets, trees: sheets / PAPER.sheetsPerTree }; }

  /* ---- School load codes: anonymous, offline, tamper-evident ---- */
  function crc16(str) {
    var crc = 0xFFFF;
    for (var i = 0; i < str.length; i++) { crc ^= str.charCodeAt(i) << 8; for (var b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF; }
    return ('0000' + crc.toString(16)).slice(-4).toUpperCase();
  }
  function b64enc(str) { var bytes = new TextEncoder().encode(str), bin = ''; for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64dec(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var bin = atob(s), bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes); }
  function newToken() { var a = 'abcdefghjkmnpqrstuvwxyz23456789', s = ''; for (var i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  var TYPE_KEYS = Object.keys(TYPES);
  /* The code holds only due dates, item types and a random token: no names, titles, or subjects. */
  function makeLoadCode(tasks, token, today) {
    var items = tasks.filter(function (t) { return !t.done && t.due && t.due >= today && t.due <= addDays(today, 90) && TYPES[t.type]; })
      .sort(function (a, b) { return a.due < b.due ? -1 : 1; }).slice(0, 80).map(function (t) { return [t.due, TYPE_KEYS.indexOf(t.type), t.difficulty === 'hard' ? 1 : 0]; });
    var body = b64enc(JSON.stringify({ v: 1, u: String(token).replace(/[^a-z0-9]/gi, '').slice(0, 12), t: today, i: items }));
    return 'ST1.' + body + '.' + crc16(body);
  }
  function parseLoadCode(code) {
    var p = String(code || '').trim().split('.');
    if (p.length !== 3 || p[0] !== 'ST1') return { ok: false, error: 'Not a Steady code.' };
    if (crc16(p[1]) !== p[2].toUpperCase()) return { ok: false, error: 'Code looks mistyped (check digits do not match).' };
    var d; try { d = JSON.parse(b64dec(p[1])); } catch (e) { return { ok: false, error: 'Code could not be read.' }; }
    if (!d || d.v !== 1 || !Array.isArray(d.i) || !d.u) return { ok: false, error: 'Unsupported code version.' };
    var items = [];
    d.i.slice(0, 80).forEach(function (x) {
      if (!Array.isArray(x) || !/^\d{4}-\d{2}-\d{2}$/.test(x[0]) || !TYPE_KEYS[x[1]]) return;
      items.push({ due: x[0], type: TYPE_KEYS[x[1]], difficulty: x[2] ? 'hard' : 'medium' });
    });
    return { ok: true, data: { u: String(d.u), t: String(d.t || ''), items: items } };
  }
  /* Combine codes. One student = one token; the newest code per token wins, so re-sharing never double counts. */
  function combineLoad(codes) {
    var errors = [], byTok = {};
    codes.forEach(function (raw, i) {
      var r = parseLoadCode(raw); if (!r.ok) { errors.push({ line: i + 1, error: r.error }); return; }
      var prev = byTok[r.data.u]; if (!prev || r.data.t >= prev.t) byTok[r.data.u] = r.data;
    });
    var students = Object.keys(byTok).map(function (k) { return byTok[k]; }), byDate = {};
    students.forEach(function (s) {
      var per = {};
      s.items.forEach(function (it) { (per[it.due] = per[it.due] || []).push(it); });
      Object.keys(per).forEach(function (date) {
        var items = per[date], load = items.reduce(function (t, it) { return t + itemLoad(it); }, 0), majors = items.filter(function (it) { return TYPES[it.type].major; }).length;
        var e = byDate[date] = byDate[date] || { students: 0, major: 0, heavy: 0, collision: 0, tests: 0 };
        e.students++; if (majors) e.major++; if (load >= HEAVY_AT) e.heavy++; if (majors >= 2) e.collision++; e.tests += items.filter(function (it) { return it.type === 'test'; }).length;
      });
    });
    return { n: students.length, byDate: byDate, errors: errors };
  }
  function emptyDay() { return { students: 0, major: 0, heavy: 0, collision: 0, tests: 0 }; }
  /* Best days to schedule a new test: fewest heavy days, then fewest major assessments, then earliest. */
  function bestDays(combined, from, span, count, weekdaysOnly) {
    var list = [];
    for (var i = 0; i < span; i++) { var d = addDays(from, i); if (weekdaysOnly !== false && !isWeekday(d)) continue; var e = combined.byDate[d] || emptyDay(); list.push({ date: d, heavy: e.heavy, major: e.major, students: e.students }); }
    list.sort(function (a, b) { return a.heavy - b.heavy || a.major - b.major || a.students - b.students || (a.date < b.date ? -1 : 1); });
    return list.slice(0, count || 3);
  }
  function collisionReport(combined, date) { var e = combined.byDate[date] || emptyDay(); return { date: date, n: combined.n, withMajor: e.major, heavy: e.heavy, collision: e.collision, tests: e.tests }; }

  return { TYPES: TYPES, IMPORTANCE: IMPORTANCE, DIFFICULTY: DIFFICULTY, PAPER: PAPER, MODERATE_AT: MODERATE_AT, HEAVY_AT: HEAVY_AT, DAILY_FOCUS_GOAL: DAILY_FOCUS_GOAL,
    ymd: ymd, parseYmd: parseYmd, addDays: addDays, daysBetween: daysBetween, isWeekday: isWeekday, urgencyFor: urgencyFor, priorityScore: priorityScore, smartOrder: smartOrder,
    dueLabel: dueLabel, isOverdue: isOverdue, tasksForToday: tasksForToday, productivity: productivity, xpToAdvance: xpToAdvance, levelFor: levelFor, isProductive: isProductive, streak: streak,
    itemLoad: itemLoad, levelOf: levelOf, dayLoads: dayLoads, planStudy: planStudy, paperSaved: paperSaved, crc16: crc16, newToken: newToken, makeLoadCode: makeLoadCode,
    parseLoadCode: parseLoadCode, combineLoad: combineLoad, bestDays: bestDays, collisionReport: collisionReport, clamp: clamp, round: round };
});
