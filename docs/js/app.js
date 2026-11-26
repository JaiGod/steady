/* Steady UI. Plain JS, no dependencies, works offline and inside an Android WebView. */
(function () {
  'use strict';
  var KEY = 'steady.v1', VERSION = '2.0.0-beta', mem = null;

  /* ---------- storage ---------- */
  function fresh() { return { tasks: [], blocks: [], stats: {}, xp: 0, paper: 0, token: ST.newToken(), codes: '', timer: null, sort: 'smart', demo: false, mood: {}, wins: {}, cards: [] }; }
  function load() {
    var raw = null; try { raw = localStorage.getItem(KEY); } catch (e) { raw = mem; }
    var s = fresh();
    if (raw) { try { var p = JSON.parse(raw); for (var k in s) if (p && p[k] != null) s[k] = p[k]; } catch (e) {} }
    s.tasks = s.tasks.filter(function (t) { return t && t.id && t.name && /^\d{4}-\d{2}-\d{2}$/.test(t.due) && ST.TYPES[t.type]; });
    s.blocks = (s.blocks || []).filter(function (b) { return b && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && b.minutes > 0; });
    return s;
  }
  function save() { var raw = JSON.stringify(state); try { localStorage.setItem(KEY, raw); } catch (e) { mem = raw; } }
  var state = load();

  /* ---------- helpers ---------- */
  function h(tag, props) {
    var el = document.createElement(tag);
    for (var k in (props || {})) { var v = props[k]; if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v); }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(function (x) { add(el, x); }); else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
  function today() { return ST.ymd(new Date()); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function mins(m) { return m < 60 ? m + 'm' : m % 60 === 0 ? (m / 60) + 'h' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; }
  function dstat(d) { return state.stats[d] || (state.stats[d] = { focus: 0, done: 0 }); }
  function short(d) { var x = ST.parseYmd(d); return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][x.getDay()] + ' ' + (x.getMonth() + 1) + '/' + x.getDate(); }
  function toast(msg, undo) {
    var t = document.getElementById('toast'); t.textContent = msg;
    if (undo) t.appendChild(h('button', { text: 'Undo', onclick: function () { undo(); t.classList.remove('show'); } }));
    t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, undo ? 5000 : 2500);
  }
  function svgEl(tag, attrs) { var e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  var LEVEL_TEXT = { free: 'Clear', light: 'Light', moderate: 'Moderate', heavy: 'Heavy' };
  var PAL = ['#3F7F5F', '#E8895B', '#4A7FB5', '#9A6BB5', '#C9A227', '#C4503F'];
  function subjColor(s) { if (!s) return '#B8C4BC'; var n = 0; for (var i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0; return PAL[n % PAL.length]; }
  function pill(level) { return h('span', { class: 'pill ' + level, text: LEVEL_TEXT[level] }); }

  /* ---------- shell ---------- */
  var tab = 'today', main = document.getElementById('main'), tick = null;
  function go(t) { tab = t; render(); main.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  function render() {
    clearInterval(tick); settleTimer();
    var lv = ST.levelFor(state.xp);
    document.getElementById('levelChip').textContent = 'Lv ' + lv.level + ' · ' + lv.title;
    var b = document.getElementById('demoBanner'); b.hidden = !state.demo; b.textContent = '';
    if (state.demo) { b.appendChild(document.createTextNode('Sample data is loaded so you can explore. It is not real.')); b.appendChild(h('button', { class: 'btn sm warn', text: 'Clear', onclick: function () { var tok = state.token; state = fresh(); state.token = tok; save(); render(); } })); }
    document.querySelectorAll('.tabs button').forEach(function (btn) { if (btn.dataset.tab === tab) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current'); });
    main.textContent = '';
    ({ today: viewToday, plan: viewPlan, load: viewLoad, focus: viewFocus, school: viewSchool, about: viewAbout })[tab]();
  }
  document.querySelector('.tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) go(b.dataset.tab); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });

  /* ---------- tasks ---------- */
  function openTasks() { return state.tasks.filter(function (t) { return !t.done; }); }
  function toggleDone(t) {
    var t0 = today();
    if (!t.done) {
      t.done = true; t.completedOn = t0; dstat(t0).done++;
      if (!t.rewardClaimed) { t.rewardClaimed = true; state.xp += ST.DIFFICULTY[t.difficulty].xp; toast('Done! +' + ST.DIFFICULTY[t.difficulty].xp + ' XP'); }
    } else { t.done = false; if (t.completedOn && dstat(t.completedOn).done > 0) dstat(t.completedOn).done--; t.completedOn = null; }
    save(); render();
  }
  function deleteTask(t) {
    var snap = { t: t, blocks: state.blocks.filter(function (b) { return b.taskId === t.id; }) };
    state.tasks = state.tasks.filter(function (x) { return x.id !== t.id; }); state.blocks = state.blocks.filter(function (b) { return b.taskId !== t.id; }); save(); render();
    toast('Removed', function () { state.tasks.push(snap.t); state.blocks = state.blocks.concat(snap.blocks); save(); render(); });
  }
  function taskRow(t, opts) {
    opts = opts || {}; var t0 = today(), lvl = ST.levelOf(ST.itemLoad(t)), ty = ST.TYPES[t.type];
    var overdue = ST.isOverdue(t, t0);
    return h('div', { class: 'entry' + (t.done ? ' done' : ''), style: 'border-left:4px solid ' + subjColor(t.subject) + ';padding-left:8px' },
      h('button', { class: 'check', role: 'checkbox', 'aria-checked': t.done ? 'true' : 'false', 'aria-label': (t.done ? 'Mark not done: ' : 'Mark done: ') + t.name, text: t.done ? '✓' : '', onclick: function () { toggleDone(t); } }),
      h('div', { class: 'tx' }, h('b', { text: ty.icon + ' ' + t.name }),
        h('span', {}, (t.subject ? t.subject + ' · ' : '') + ty.label + ' · ', h('span', { class: overdue ? 'warn-text' : '', text: ST.dueLabel(t.due, t0) }), ' · ' + mins(t.minutes) + (t.done ? '' : ' · '), t.done ? null : h('span', { class: 'score', text: 'priority ' + ST.priorityScore(t, t0).toFixed(1).replace(/\.0$/, '') }))),
      opts.noActions ? null : [
        t.done ? null : h('button', { class: 'x', 'aria-label': 'Start focus timer for ' + t.name, text: '▶', onclick: function () { state.focusTask = t.id; save(); go('focus'); } }),
        h('button', { class: 'x', 'aria-label': 'Delete ' + t.name, text: '✕', onclick: function () { deleteTask(t); } })]);
  }

  /* ---------- add-task sheet ---------- */
  function openAdd(preset) {
    var root = document.getElementById('sheetRoot'); preset = preset || {};
    var f = { name: h('input', { type: 'text', id: 'f-name', maxlength: 60, placeholder: 'e.g. Chapter 7 test', value: preset.name || '' }), subject: h('input', { type: 'text', id: 'f-sub', maxlength: 20, placeholder: 'e.g. Chem', value: preset.subject || '' }),
      type: h('select', { id: 'f-type' }, Object.keys(ST.TYPES).map(function (k) { return h('option', { value: k, selected: k === (preset.type || 'homework'), text: ST.TYPES[k].icon + ' ' + ST.TYPES[k].label }); })),
      due: h('input', { type: 'date', id: 'f-due', value: preset.due || ST.addDays(today(), 1), min: ST.addDays(today(), -30) }),
      imp: h('select', { id: 'f-imp' }, ['high', 'medium', 'low'].map(function (k) { return h('option', { value: k, selected: k === 'medium', text: k[0].toUpperCase() + k.slice(1) }); })),
      dif: h('select', { id: 'f-dif' }, ['easy', 'medium', 'hard'].map(function (k) { return h('option', { value: k, selected: k === 'medium', text: k[0].toUpperCase() + k.slice(1) }); })),
      min: h('input', { type: 'number', id: 'f-min', min: 5, max: 600, step: 5, value: preset.minutes || 30 }) };
    var note = h('p', { class: 'muted small', 'aria-live': 'polite', style: 'min-height:20px;margin:0 0 8px' });
    function close() { root.textContent = ''; }
    function peek() { var d = f.due.value; if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { note.textContent = ''; return; } var probe = { type: f.type.value, difficulty: f.dif.value, due: d, id: 'probe' }; var day = ST.dayLoads(state.tasks.concat([probe]), d, 1)[0]; note.textContent = day.collision ? 'Heads up: that day would have ' + day.majors + ' major assessments.' : 'That day would be ' + LEVEL_TEXT[day.level].toLowerCase() + ' (load ' + day.load + ').'; note.className = 'small ' + (day.collision || day.level === 'heavy' ? 'warn-text' : 'muted'); }
    [f.type, f.due, f.dif].forEach(function (el) { el.addEventListener('change', peek); });
    var sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Add to plan', style: 'max-height:92vh;overflow:auto' },
      h('div', { class: 'row sp' }, h('h3', { text: 'Add to your plan' }), h('button', { class: 'x', 'aria-label': 'Close', text: '✕', onclick: close })),
      h('div', { class: 'field' }, h('label', { for: 'f-name', text: 'What is it?' }), f.name),
      h('div', { class: 'two field' }, h('div', {}, h('label', { for: 'f-sub', text: 'Subject' }), f.subject), h('div', {}, h('label', { for: 'f-type', text: 'Type' }), f.type)),
      h('div', { class: 'two field' }, h('div', {}, h('label', { for: 'f-due', text: 'Due date' }), f.due), h('div', {}, h('label', { for: 'f-min', text: 'Minutes needed' }), f.min)),
      h('div', { class: 'two field' }, h('div', {}, h('label', { for: 'f-imp', text: 'Importance' }), f.imp), h('div', {}, h('label', { for: 'f-dif', text: 'Difficulty' }), f.dif)),
      note,
      h('button', { class: 'btn', style: 'width:100%', text: 'Add', onclick: function () {
        var name = f.name.value.trim(); if (!name) { toast('Give it a name'); f.name.focus(); return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.due.value)) { toast('Pick a due date'); return; }
        var t = { id: uid(), name: name.replace(/[<>]/g, ''), subject: f.subject.value.trim().replace(/[<>]/g, ''), type: f.type.value, due: f.due.value, importance: f.imp.value, difficulty: f.dif.value, minutes: ST.clamp(parseInt(f.min.value, 10) || 30, 5, 600), done: false, created: Date.now() };
        state.tasks.push(t); save(); close(); render(); toast('Added to your plan');
      } }));
    var scrim = h('div', { class: 'scrim', onclick: function (ev) { if (ev.target === scrim) close(); } }, sheet);
    scrim.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') close(); });
    root.textContent = ''; root.appendChild(scrim); peek(); f.name.focus();
  }

  /* ---------- Today ---------- */
  function viewToday() {
    todayTop();
    var t0 = today(), st = dstat(t0), prod = ST.productivity(state.tasks, st.focus, t0), lv = ST.levelFor(state.xp), sk = ST.streak(state.stats, t0);
    var R = 54, C = 2 * Math.PI * R, pct = prod.score / 100;
    var ring = h('div', { class: 'ring', role: 'img', 'aria-label': 'Productivity score ' + prod.score + ' out of 100' }), svg = svgEl('svg', { viewBox: '0 0 128 128' });
    svg.appendChild(svgEl('circle', { cx: 64, cy: 64, r: R, fill: 'none', stroke: 'rgba(255,255,255,.22)', 'stroke-width': 12 }));
    svg.appendChild(svgEl('circle', { cx: 64, cy: 64, r: R, fill: 'none', stroke: '#E8895B', 'stroke-width': 12, 'stroke-linecap': 'round', 'stroke-dasharray': C, 'stroke-dashoffset': C * (1 - pct) }));
    ring.appendChild(svg); ring.appendChild(h('div', { class: 'val' }, h('b', { text: String(prod.score) }), h('span', { text: 'productivity' })));
    main.appendChild(h('section', { class: 'card hero', 'aria-label': 'Today' }, ring, h('div', { class: 'stats' },
      h('div', {}, h('b', { text: sk + (sk === 1 ? ' day' : ' days') }), h('span', { class: 'muted', text: ' streak' })),
      h('div', {}, h('b', { text: mins(st.focus) }), h('span', { class: 'muted', text: ' focus today' })),
      h('div', {}, h('b', { text: String(state.xp) }), h('span', { class: 'muted', text: ' XP · ' + (lv.need - lv.into) + ' to level ' + (lv.level + 1) }), h('div', { class: 'bar' }, h('i', { style: 'width:' + Math.round(lv.pct * 100) + '%' }))))));
    // workload heads-up
    var next = ST.dayLoads(state.tasks, t0, 7), worst = next.filter(function (d) { return d.collision || d.level === 'heavy'; })[0], tl = next[0];
    var headsUp = h('section', { class: 'card' }, h('div', { class: 'row sp' }, h('h3', { text: 'Your workload' }), pill(tl.level)),
      worst ? h('p', { style: 'margin:0' }, h('span', { class: 'warn-text', text: 'Heads up: ' }), short(worst.date) + ' looks ' + (worst.collision ? 'crowded (' + worst.majors + ' major assessments)' : 'heavy') + '. ', h('button', { class: 'link', text: 'Plan ahead', onclick: function () { go('load'); } }))
        : h('p', { class: 'muted', style: 'margin:0', text: state.tasks.length ? 'No pile-ups in the next 7 days. Nice and steady.' : 'Add your tests and assignments to see pile-ups before they happen.' }));
    main.appendChild(headsUp);
    // study blocks today
    var bl = state.blocks.filter(function (b) { return b.date === t0; });
    if (bl.length) main.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Study blocks today' }), bl.map(function (b) {
      var tk = state.tasks.filter(function (x) { return x.id === b.taskId; })[0];
      return h('div', { class: 'entry' + (b.done ? ' done' : '') }, h('button', { class: 'check', role: 'checkbox', 'aria-checked': b.done ? 'true' : 'false', 'aria-label': 'Mark study block done', text: b.done ? '✓' : '', onclick: function () { b.done = !b.done; dstat(t0).focus += b.done ? b.minutes : -b.minutes; if (dstat(t0).focus < 0) dstat(t0).focus = 0; if (b.done) state.xp += b.minutes; else state.xp = Math.max(0, state.xp - b.minutes); save(); render(); } }),
        h('div', { class: 'tx' }, h('b', { text: 'Prep: ' + (tk ? tk.name : 'task') }), h('span', { text: mins(b.minutes) })));
    })));
    // up next
    var up = ST.smartOrder(openTasks(), t0).slice(0, 3);
    main.appendChild(h('section', { class: 'card' }, h('div', { class: 'row sp' }, h('h3', { text: 'Up next' }), h('button', { class: 'btn sm', text: '+ Add', onclick: function () { openAdd(); } })),
      up.length ? up.map(function (t) { return taskRow(t); }) : h('div', { class: 'empty', text: 'Nothing planned yet. Tap + Add to start.' }),
      up.length ? h('p', { class: 'muted small', style: 'margin:8px 0 0', text: 'Ranked by importance × urgency × difficulty.' }) : null));
    // paperless
    var ps = ST.paperSaved(state.paper);
    main.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Paper-free planning' }),
      h('p', { class: 'muted small', style: 'margin:0 0 8px', text: 'Planning here instead of a paper planner or a printed handout saves paper. Log each sheet you did not print or write on.' }),
      h('div', { class: 'row sp' }, h('div', {}, h('b', { style: 'font-size:22px', text: String(ps.sheets) }), h('span', { class: 'muted small', text: ' sheets saved · ' + ps.trees.toFixed(4) + ' trees' })),
        h('div', { class: 'row' }, h('button', { class: 'btn sm alt', 'aria-label': 'Remove one sheet', text: '−1', onclick: function () { state.paper = Math.max(0, state.paper - 1); save(); render(); } }), h('button', { class: 'btn sm', text: '+1', onclick: function () { state.paper++; save(); render(); } }), h('button', { class: 'btn sm', text: '+5', onclick: function () { state.paper += 5; save(); render(); } })))));
    todayExtras();
    if (!state.tasks.length) main.appendChild(h('div', { class: 'row', style: 'justify-content:center' }, h('button', { class: 'btn alt', text: 'Try sample data', onclick: loadSample })));
  }

  /* ---------- Plan ---------- */
  function viewPlan() {
    var t0 = today(), filter = 'open';
    main.appendChild(h('div', { class: 'row sp' }, h('h2', { text: 'Plan' }), h('button', { class: 'btn', text: '+ Add', onclick: function () { openAdd(); } })));
    var list = h('section', { class: 'card', 'aria-live': 'polite' });
    var sorts = h('div', { class: 'chips', role: 'group', 'aria-label': 'Sort and filter' }, [['smart', 'Smart order'], ['due', 'By due date'], ['done', 'Done']].map(function (o) {
      return h('button', { 'aria-pressed': (o[0] === 'done' ? filter === 'done' : state.sort === o[0] && filter === 'open') ? 'true' : 'false', text: o[1], onclick: function () { if (o[0] === 'done') filter = 'done'; else { filter = 'open'; state.sort = o[0]; save(); } sorts.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); }); this.setAttribute('aria-pressed', 'true'); draw(); } });
    }));
    function draw() {
      list.textContent = '';
      var items = filter === 'done' ? state.tasks.filter(function (t) { return t.done; }).sort(function (a, b) { return (b.completedOn || '') < (a.completedOn || '') ? -1 : 1; })
        : state.sort === 'due' ? openTasks().sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; }) : ST.smartOrder(openTasks(), t0);
      if (!items.length) { list.appendChild(h('div', { class: 'empty', text: filter === 'done' ? 'Finished items show up here.' : 'All clear. Tap + Add to plan something.' })); return; }
      items.forEach(function (t) { list.appendChild(taskRow(t)); });
    }
    main.appendChild(sorts); main.appendChild(list); draw();
  }

  /* ---------- Load ---------- */
  function viewLoad() {
    var t0 = today(), days = ST.dayLoads(state.tasks, t0, 14), sel = null;
    main.appendChild(h('h2', { text: 'Workload forecast' }));
    main.appendChild(h('p', { class: 'muted', text: 'See crowded days before they arrive. Each item adds load points; two or more major assessments on one day is a collision.' }));
    var detail = h('section', { class: 'card', 'aria-live': 'polite' });
    var grid = h('div', { class: 'heat' });
    function drawDetail() {
      detail.textContent = ''; if (!sel) { detail.appendChild(h('p', { class: 'muted', style: 'margin:0', text: 'Tap a day to see what is due.' })); return; }
      var d = days.filter(function (x) { return x.date === sel; })[0];
      detail.appendChild(h('div', { class: 'row sp' }, h('h3', { text: short(d.date) }), pill(d.level)));
      if (d.collision) detail.appendChild(h('p', { class: 'warn-text', text: 'Collision: ' + d.majors + ' major assessments on one day.' }));
      add(detail, d.items.length ? d.items.map(function (t) { return taskRow(t, { noActions: true }); }) : h('p', { class: 'muted', style: 'margin:0', text: 'Nothing due. A good day to get ahead.' }));
    }
    days.forEach(function (d) {
      var b = h('button', { class: 'day ' + d.level + (d.collision ? ' collision' : ''), 'aria-pressed': 'false', 'aria-label': short(d.date) + ', ' + LEVEL_TEXT[d.level] + ', load ' + d.load + (d.collision ? ', collision' : ''), onclick: function () { sel = d.date; grid.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); this.setAttribute('aria-pressed', 'true'); drawDetail(); } },
        h('small', { text: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][ST.parseYmd(d.date).getDay()] + ' ' + ST.parseYmd(d.date).getDate() }), h('b', { text: d.load ? String(d.load) : '·' }));
      grid.appendChild(b);
    });
    main.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Next 14 days' }), grid,
      h('div', { class: 'legend' }, [['free', 'Clear', '#EEF2EE'], ['light', 'Light (1 to 3)', '#CFE6D8'], ['moderate', 'Moderate (' + ST.MODERATE_AT + ' to ' + (ST.HEAVY_AT - 1) + ')', '#F4DD9E'], ['heavy', 'Heavy (' + ST.HEAVY_AT + '+)', '#EFA27D']].map(function (l) { return h('span', {}, h('i', { style: 'background:' + l[2] }), l[1]); })), h('span', { class: 'small muted', text: 'Red outline = collision.' })));
    main.appendChild(detail); drawDetail();
    // study planner
    var cands = openTasks().filter(function (t) { return t.due > t0 && t.type !== 'homework'; }).sort(function (a, b) { return a.due < b.due ? -1 : 1; });
    var out = h('div', { 'aria-live': 'polite' });
    var planCard = h('section', { class: 'card' }, h('h3', { text: 'Study planner' }), h('p', { class: 'muted small', text: 'Spreads prep time over the days before something is due, giving lighter days more of it and capping each day at 90 minutes.' }));
    if (!cands.length) planCard.appendChild(h('p', { class: 'muted', style: 'margin:0', text: 'Add a test, quiz, project, or essay that is due after today, and Steady will plan your prep.' }));
    else {
      var sel2 = h('select', { id: 'pl', 'aria-label': 'Choose an item to plan' }, cands.map(function (t) { return h('option', { value: t.id, text: ST.TYPES[t.type].icon + ' ' + t.name + ' (' + short(t.due) + ')' }); }));
      planCard.appendChild(sel2); planCard.appendChild(h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn', text: 'Plan my prep', onclick: function () { showPlan(); } }))); planCard.appendChild(out);
      function showPlan() {
        var t = cands.filter(function (x) { return x.id === sel2.value; })[0], r = ST.planStudy(t, state.tasks, t0); out.textContent = '';
        var existing = state.blocks.filter(function (b) { return b.taskId === t.id; });
        out.appendChild(h('div', { style: 'margin-top:10px' }, r.blocks.length ? r.blocks.map(function (b) { var dl = days.filter(function (x) { return x.date === b.date; })[0]; return h('div', { class: 'entry' }, h('div', { class: 'tx' }, h('b', { text: short(b.date) }), h('span', { text: dl ? 'That day is ' + LEVEL_TEXT[dl.level].toLowerCase() : '' })), h('span', { class: 'kg', text: mins(b.minutes) })); }) : h('p', { class: 'muted', text: 'No room before the due date. Start today if you can.' })));
        if (r.unplaced > 0) out.appendChild(h('p', { class: 'warn-text small', text: mins(r.unplaced) + ' did not fit before it is due. Consider starting earlier or trimming the plan.' }));
        if (r.blocks.length) out.appendChild(h('button', { class: 'btn', style: 'width:100%;margin-top:8px', text: existing.length ? 'Replace my study blocks' : 'Add to my plan', onclick: function () { state.blocks = state.blocks.filter(function (b) { return b.taskId !== t.id; }).concat(r.blocks.map(function (b) { return { id: uid(), taskId: t.id, date: b.date, minutes: b.minutes, done: false }; })); save(); toast('Study blocks added'); render(); } }));
      }
    }
    main.appendChild(planCard);
  }


  /* ---------- Today: greeting, chips, quick add (MyStudyLife-style dashboard) ---------- */
  function todayTop() {
    var t0 = today(), hr = new Date().getHours(), open = openTasks();
    var dueToday = open.filter(function (t) { return t.due === t0; }).length;
    var wk = ST.dayLoads(state.tasks, t0, 7), majors = wk.reduce(function (a, d) { return a + d.majors; }, 0);
    main.appendChild(h('section', { class: 'card', 'aria-label': 'Overview' },
      h('h2', { style: 'margin:0 0 8px', text: hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening' }),
      h('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px' },
        h('span', { class: 'pill ' + (dueToday ? 'moderate' : 'free'), text: dueToday + ' due today' }),
        h('span', { class: 'pill ' + (majors ? 'heavy' : 'free'), text: majors + ' major this week' }),
        h('span', { class: 'pill light', text: open.length + ' open' })),
      h('form', { class: 'row', style: 'margin-top:10px;gap:8px', onsubmit: function (e) {
        e.preventDefault(); var nm = this.elements.qn.value.trim(), d = this.elements.qd.value; if (!nm) { toast('Type what you need to do'); return; }
        state.tasks.push({ id: uid(), name: nm.replace(/[<>]/g, ''), subject: '', type: 'homework', due: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ST.addDays(t0, 1), importance: 'medium', difficulty: 'medium', minutes: 30, done: false, created: Date.now() });
        save(); render(); toast('Quick-added. Use Plan to see it.'); } },
        h('input', { type: 'text', name: 'qn', maxlength: 60, placeholder: 'Quick add a task…', 'aria-label': 'Quick add task name', style: 'flex:1;min-width:0' }),
        h('input', { type: 'date', name: 'qd', value: ST.addDays(t0, 1), 'aria-label': 'Due date' }),
        h('button', { class: 'btn sm', type: 'submit', text: 'Add' }))));
  }

  /* ---------- Today: week strip + stress check-in (planner-style) ---------- */
  function todayExtras() {
    var t0 = today(), days = ST.dayLoads(state.tasks, t0, 7), sel = t0, strip = h('div', { class: 'heat' }), det = h('div', { 'aria-live': 'polite' });
    function drawDay() {
      det.textContent = ''; var d = days.filter(function (x) { return x.date === sel; })[0], bl = state.blocks.filter(function (b) { return b.date === sel; });
      det.appendChild(h('div', { class: 'row sp', style: 'margin-top:10px' }, h('b', { text: short(sel) }), pill(d.level)));
      if (!d.items.length && !bl.length) det.appendChild(h('p', { class: 'muted small', style: 'margin:6px 0 0', text: 'Nothing scheduled.' }));
      d.items.forEach(function (t) { det.appendChild(taskRow(t, { noActions: true })); });
      bl.forEach(function (b) { var tk = state.tasks.filter(function (x) { return x.id === b.taskId; })[0]; det.appendChild(h('div', { class: 'entry' }, h('div', { class: 'tx' }, h('b', { text: 'Study: ' + (tk ? tk.name : 'task') }), h('span', { text: mins(b.minutes) })))); });
    }
    days.forEach(function (d) {
      strip.appendChild(h('button', { class: 'day ' + d.level + (d.collision ? ' collision' : ''), 'aria-pressed': d.date === sel ? 'true' : 'false', 'aria-label': short(d.date) + ', ' + LEVEL_TEXT[d.level], onclick: function () { sel = d.date; strip.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); this.setAttribute('aria-pressed', 'true'); drawDay(); } },
        h('small', { text: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][ST.parseYmd(d.date).getDay()] }), h('b', { text: String(ST.parseYmd(d.date).getDate()) })));
    });
    main.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Your week' }), strip, det)); drawDay();
    // stress check-in
    var labels = ['Calm', 'Fine', 'Busy', 'Stressed', 'Overwhelmed'], cur = state.mood[t0], bars = [];
    for (var i = 6; i >= 0; i--) { var dd = ST.addDays(t0, -i), v = state.mood[dd]; bars.push(h('span', { role: 'img', 'aria-label': short(dd) + ': ' + (v ? labels[v - 1] : 'no check-in'), style: 'display:inline-block;width:14px;margin-right:4px;border-radius:3px;vertical-align:bottom;background:' + (v ? (v >= 4 ? '#C4503F' : v === 3 ? '#E8C26B' : '#7FB89A') : '#E3E8E3') + ';height:' + (v ? 6 + v * 7 : 6) + 'px' })); }
    var nxt = days[1], tip = cur >= 4 && nxt && (nxt.level === 'heavy' || nxt.collision) ? 'Tomorrow looks heavy too. Try a shorter study block tonight and take a real break.' : cur >= 4 ? 'Rough day. Pick one small task, then rest.' : '';
    main.appendChild(h('section', { class: 'card' }, h('h3', { text: 'How stressed do you feel today?' }),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Stress level' }, labels.map(function (l, i) { return h('button', { 'aria-pressed': cur === i + 1 ? 'true' : 'false', text: l, onclick: function () { state.mood[t0] = i + 1; save(); render(); } }); })),
      h('div', { style: 'margin-top:10px;height:56px;display:flex;align-items:flex-end' }, bars),
      h('p', { class: 'muted small', style: 'margin:6px 0 0', text: 'Last 7 days. Private to this device. This is a self check-in, not medical advice.' }),
      tip ? h('p', { class: 'small', style: 'margin:6px 0 0', text: tip }) : null,
      h('label', { for: 'win', class: 'small', style: 'display:block;margin-top:10px', text: 'One win today (gratitude)' }),
      h('input', { type: 'text', id: 'win', maxlength: 80, placeholder: 'e.g. Finished my lab report early', value: state.wins[t0] || '', style: 'width:100%', oninput: function () { state.wins[t0] = this.value; save(); } })));
  }

  /* ---------- Focus: growing tree + flash cards ---------- */
  function treeSvg(p) {
    var svg = svgEl('svg', { viewBox: '0 0 120 120', width: 120, height: 120, role: 'img', 'aria-label': 'Tree ' + Math.round(p * 100) + '% grown' });
    var th = 8 + p * 46, r = 8 + p * 30;
    svg.appendChild(svgEl('rect', { x: 55, y: 108 - th, width: 10, height: th, rx: 3, fill: '#8A6B4F' }));
    svg.appendChild(svgEl('circle', { cx: 60, cy: 108 - th - r * 0.5, r: r, fill: p >= 1 ? '#3F7F5F' : '#6FA88A' }));
    svg.appendChild(svgEl('rect', { x: 20, y: 108, width: 80, height: 6, rx: 3, fill: '#D9C9A8' })); return svg;
  }
  function totalTrees() { var n = 0; for (var k in state.stats) n += state.stats[k].trees || 0; return n; }
  function cardsSection() {
    var box = h('section', { class: 'card' }), order = null, idx = 0, flipped = false;
    function draw() {
      box.textContent = ''; box.appendChild(h('div', { class: 'row sp' }, h('h3', { text: 'Flash cards' }), h('span', { class: 'muted small', text: state.cards.length + ' cards' })));
      if (order && idx < order.length) {
        var c = order[idx];
        box.appendChild(h('div', { class: 'entry', style: 'border-left:4px solid ' + subjColor(c.subject) + ';padding:14px;min-height:70px;flex-direction:column;align-items:flex-start' }, h('span', { class: 'muted small', text: (c.subject || 'General') + ' · ' + (idx + 1) + ' of ' + order.length }), h('b', { text: flipped ? c.a : c.q })));
        box.appendChild(flipped ? h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn sm', text: 'Got it (+2 XP)', onclick: function () { state.xp += 2; c.box = (c.box || 0) + 1; save(); idx++; flipped = false; draw(); } }), h('button', { class: 'btn sm alt', text: 'Again', onclick: function () { idx++; flipped = false; draw(); } }))
          : h('button', { class: 'btn sm', style: 'margin-top:8px', text: 'Flip', onclick: function () { flipped = true; draw(); } }));
        return;
      }
      if (order) { box.appendChild(h('p', { text: 'Round done. Nice work.' })); order = null; }
      var q = h('input', { type: 'text', maxlength: 120, placeholder: 'Question', 'aria-label': 'Card front' }), a = h('input', { type: 'text', maxlength: 160, placeholder: 'Answer', 'aria-label': 'Card back' }), sb = h('input', { type: 'text', maxlength: 20, placeholder: 'Subject', 'aria-label': 'Card subject' });
      box.appendChild(h('div', { class: 'field' }, sb, q, a));
      box.appendChild(h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('button', { class: 'btn sm', text: 'Add card', onclick: function () { if (!q.value.trim() || !a.value.trim()) { toast('Fill in both sides'); return; } state.cards.push({ id: uid(), subject: sb.value.trim().replace(/[<>]/g, ''), q: q.value.trim().replace(/[<>]/g, ''), a: a.value.trim().replace(/[<>]/g, ''), box: 0 }); save(); toast('Card added'); draw(); } }),
        state.cards.length ? h('button', { class: 'btn sm alt', text: 'Review', onclick: function () { order = state.cards.slice().sort(function (x, y) { return (x.box || 0) - (y.box || 0) || (x.id < y.id ? -1 : 1); }).slice(0, 10); idx = 0; flipped = false; draw(); } }) : null));
    }
    draw(); return box;
  }

  /* ---------- Focus timer ---------- */
  var preset = 25;
  function settleTimer() {
    var tm = state.timer; if (!tm || Date.now() < tm.endAt) return;
    state.timer = null; var t0 = ST.ymd(new Date(tm.endAt)); dstat(t0).focus += tm.minutes; dstat(t0).trees = (dstat(t0).trees || 0) + 1; state.xp += tm.minutes; save();
    if (navigator.vibrate) try { navigator.vibrate([200, 100, 200]); } catch (e) {}
    setTimeout(function () { toast('Focus session complete: +' + tm.minutes + ' XP and a tree planted'); }, 50);
  }
  function viewFocus() {
    var tm = state.timer, t0 = today();
    main.appendChild(h('h2', { text: 'Focus timer' }));
    var tk = state.focusTask ? state.tasks.filter(function (t) { return t.id === state.focusTask && !t.done; })[0] : null;
    var disp = h('div', { class: 'timer', role: 'timer', 'aria-live': 'off' }), grow = h('div', { style: 'display:flex;justify-content:center' });
    function paint() { var left = tm ? Math.max(0, tm.endAt - Date.now()) : preset * 60000, s = Math.ceil(left / 1000); disp.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); grow.textContent = ''; grow.appendChild(treeSvg(tm ? 1 - left / (tm.minutes * 60000) : 0.15)); if (tm && left <= 0) { clearInterval(tick); render(); } }
    var taskSel = h('select', { id: 'ft', 'aria-label': 'Task for this session', disabled: !!tm, onchange: function () { state.focusTask = this.value || null; save(); } }, [h('option', { value: '', text: 'No specific task' })].concat(openTasks().map(function (t) { return h('option', { value: t.id, selected: tk && t.id === tk.id, text: t.name }); })));
    main.appendChild(h('section', { class: 'card', style: 'text-align:center' }, grow, disp,
      !tm ? h('div', { class: 'seg', role: 'group', 'aria-label': 'Length' }, [15, 25, 45].map(function (m) { return h('button', { 'aria-pressed': m === preset ? 'true' : 'false', text: m + ' min', onclick: function () { preset = m; render(); } }); })) : h('p', { class: 'muted', text: 'Study mode: phone face down, one goal. Finish the session to grow your tree. Ending early keeps your minutes but no tree.' }),
      h('div', { style: 'text-align:left;margin:8px 0' }, h('label', { for: 'ft', text: 'Working on' }), taskSel),
      tm ? h('button', { class: 'btn warn', style: 'width:100%', text: 'End early', onclick: function () { var done = Math.floor((Date.now() - (tm.endAt - tm.minutes * 60000)) / 60000); if (done > 0) { dstat(t0).focus += done; state.xp += done; } state.timer = null; save(); render(); toast(done > 0 ? 'Logged ' + done + ' min' : 'Timer stopped'); } })
        : h('button', { class: 'btn', style: 'width:100%', text: 'Start ' + preset + ' minutes', onclick: function () { state.timer = { endAt: Date.now() + preset * 60000, minutes: preset }; save(); render(); } })));
    main.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Today' }), h('p', { style: 'margin:0' }, h('b', { text: mins(dstat(t0).focus) }), ' of ' + mins(ST.DAILY_FOCUS_GOAL) + ' goal. A day counts toward your streak at 25 focus minutes or one finished task.'), h('p', { class: 'small', style: 'margin:6px 0 0', text: 'Your forest: ' + totalTrees() + (totalTrees() === 1 ? ' tree' : ' trees') + ' (' + (dstat(t0).trees || 0) + ' today)' })));
    main.appendChild(cardsSection());
    paint(); if (tm) tick = setInterval(paint, 500);
  }

  /* ---------- School ---------- */
  function viewSchool() {
    var t0 = today(), mine = ST.makeLoadCode(state.tasks, state.token, t0);
    main.appendChild(h('h2', { text: 'School workload' }));
    main.appendChild(h('p', { class: 'muted', text: 'Tests and big assignments pile up because nobody can see the whole picture. Share a code, combine a class, and find the best day for the next test. No accounts, no servers.' }));
    var codeBox = h('div', { class: 'code', 'aria-label': 'Your load code', text: mine });
    main.appendChild(h('section', { class: 'card' }, h('h3', { text: '1. Share your load code' }),
      h('p', { class: 'muted small', text: 'It contains only due dates, item types (like “test”), and a random ID. Never names, titles, or subjects.' }), codeBox,
      h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn sm', text: 'Copy code', onclick: function () { copy(mine); } }), h('button', { class: 'btn sm alt', text: 'Share…', onclick: function () { if (navigator.share) navigator.share({ title: 'My Steady code', text: mine }).catch(function () {}); else copy(mine); } }))));
    var ta = h('textarea', { id: 'codes', placeholder: 'Paste codes here, one per line', 'aria-label': 'Load codes, one per line', oninput: function () { state.codes = this.value; save(); } }); ta.value = state.codes || '';
    var out = h('div', { 'aria-live': 'polite' });
    main.appendChild(h('section', { class: 'card' }, h('h3', { text: '2. Combine the class' }), ta,
      h('div', { class: 'row', style: 'margin-top:10px;flex-wrap:wrap' }, h('button', { class: 'btn sm', text: 'Add mine & combine', onclick: combine }), h('button', { class: 'btn sm alt', text: 'Sample class', onclick: function () { ta.value = sampleClass().join('\n'); state.codes = ta.value; save(); combine(); } }), h('button', { class: 'btn sm alt', text: 'Clear', onclick: function () { ta.value = ''; state.codes = ''; save(); out.textContent = ''; } }))));
    main.appendChild(out);
    function combine() {
      var lines = ta.value.split(/\s+/).filter(Boolean); lines.push(mine);
      var c = ST.combineLoad(lines); out.textContent = '';
      var best = ST.bestDays(c, ST.addDays(t0, 1), 21, 3);
      out.appendChild(h('section', { class: 'card pop' }, h('h3', { text: 'Best days to schedule a test' }), h('p', { class: 'muted small', text: 'Next 3 weeks, weekdays only, fewest students already overloaded.' }),
        best.map(function (b, i) { return h('div', { class: 'entry' }, h('div', { class: 'tx' }, h('b', { text: (i + 1) + '. ' + short(b.date) }), h('span', { text: b.major + ' of ' + c.n + ' students already have a major assessment' })), h('span', { class: 'pill ' + (b.heavy ? 'heavy' : b.major ? 'moderate' : 'light'), text: b.heavy ? b.heavy + ' heavy' : b.major ? 'busy' : 'open' })); }),
        h('p', { class: 'muted small', style: 'margin:8px 0 0', text: c.n + (c.n === 1 ? ' student' : ' students') + ' counted.' })));
      var rows = []; for (var i = 1; i <= 21; i++) { var d = ST.addDays(t0, i); if (ST.isWeekday(d)) rows.push({ d: d, e: c.byDate[d] || { major: 0, heavy: 0, collision: 0 } }); }
      var mx = Math.max(1, Math.max.apply(null, rows.map(function (r) { return r.e.major; })));
      out.appendChild(h('section', { class: 'card bars' }, h('h3', { text: 'Students with a major assessment' }), rows.map(function (r) { return h('div', { class: 'row' }, h('span', { class: 'lab', text: short(r.d) }), h('span', { class: 'track', role: 'img', 'aria-label': r.e.major + ' students' }, h('i', { style: 'width:' + Math.round(r.e.major / mx * 100) + '%' + (r.e.collision ? ';background:#C4503F' : '') })), h('span', { class: 'val', text: String(r.e.major) })); }),
        h('p', { class: 'muted small', style: 'margin:8px 0 0', text: 'Red bars mean some students have two or more major assessments that day.' })));
      var chk = h('input', { type: 'date', id: 'chk', value: ST.addDays(t0, 3), 'aria-label': 'Date to check' }), res = h('p', { 'aria-live': 'polite', style: 'margin:8px 0 0' });
      function upd() { if (!chk.value) return; var r = ST.collisionReport(c, chk.value); res.textContent = r.n ? r.withMajor + ' of ' + r.n + ' students already have a major assessment on ' + short(chk.value) + (r.collision ? ' (' + r.collision + ' have two or more)' : '') + '.' : 'No data yet.'; }
      chk.addEventListener('change', upd); upd();
      out.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Teachers: check a date first' }), chk, res));
      if (c.errors.length) out.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Codes to check' }), c.errors.map(function (er) { return h('p', { class: 'small', text: 'Code ' + er.line + ': ' + er.error }); })));
    }
    if (state.codes) combine();
  }
  function sampleClass() {
    var t0 = today(), seed = 11, codes = [], types = ['homework', 'quiz', 'test', 'project', 'essay'];
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (var s = 0; s < 24; s++) {
      var items = [], n = 3 + Math.floor(rnd() * 4);
      for (var i = 0; i < n; i++) { var off = rnd() < .45 ? 4 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 18), d = ST.addDays(t0, off); items.push({ type: types[Math.floor(rnd() * types.length)], due: d, difficulty: rnd() < .3 ? 'hard' : 'medium', id: 'x' + s + i }); }
      codes.push(ST.makeLoadCode(items, 'demo' + (100 + s), t0));
    }
    return codes;
  }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast('Copied'); }, fb); else fb();
    function fb() { var t = h('textarea', { style: 'position:fixed;opacity:0' }); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast('Copied'); } catch (e) { toast('Select and copy the code manually'); } t.remove(); }
  }

  /* ---------- Method ---------- */
  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) { installEvt = e; e.preventDefault(); if (tab === 'about') render(); });
  function table(head, rows) { return h('div', { style: 'overflow-x:auto' }, h('table', {}, h('thead', {}, h('tr', {}, head.map(function (x) { return h('th', { text: x }); }))), h('tbody', {}, rows.map(function (r) { return h('tr', {}, r.map(function (c) { return h('td', { text: c }); })); })))); }
  function viewAbout() {
    main.appendChild(h('h2', { text: 'The problem' }));
    main.appendChild(h('div', { class: 'card' },
      h('p', { text: 'In our own survey of 92 students (mostly juniors and seniors), 86% said they had struggled with time management. The top reasons were schoolwork (82%), too much homework (66%), after-school activities (58%), and college applications (38%).' }),
      h('p', { text: 'Much of that pressure is a scheduling problem, not a willpower problem. Teachers plan in isolation, so tests, projects, and essays land on the same days, and no one can see it coming. Steady fixes both sides: it helps each student plan around their own load, and it lets a class or school see the combined load so work can be spread fairly.' })));
    main.appendChild(h('section', { class: 'card' }, h('h3', { text: 'How it works' }),
      h('details', { open: true }, h('summary', { text: 'What to do first' }), h('p', { class: 'small', text: 'Add tests, projects, and homework on the Plan tab. Check the Load tab for crowded days, then use the study planner to spread your prep. On the School tab, share your anonymous code so a teacher or club can see the combined picture.' })),
      h('details', {}, h('summary', { text: 'Priority score (from our Time Management App)' }), h('p', { class: 'small', text: 'Priority = importance × urgency × difficulty. Importance: Low 1, Medium 2, High 3. Difficulty: Easy 1, Medium 1.5, Hard 2. Urgency: overdue 6, today 5, tomorrow 4, within 3 days 3, within a week 2, later 1.' })),
      h('details', {}, h('summary', { text: 'Productivity score, XP, and streaks' }), h('p', { class: 'small', text: 'Up to 40 points for finishing today’s tasks, 40 for focus time (goal 4 hours), and 20 for nothing overdue. Finishing a task earns 10, 25, or 50 XP for Easy, Medium, or Hard, and focus earns 1 XP per minute. A day counts toward your streak at 25 focus minutes or one finished task.' }))));
    main.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Workload model' }), h('p', { class: 'small muted', text: 'Each open item adds load points on its due date. These weights and thresholds are our starting assumptions, to be tested with teachers and counselors.' }),
      table(['Item', 'Load points', 'Major?'], Object.keys(ST.TYPES).map(function (k) { return [ST.TYPES[k].label, String(ST.TYPES[k].w), ST.TYPES[k].major ? 'Yes' : 'No']; }).concat([['Hard difficulty', '+1', '']])),
      h('p', { class: 'small', style: 'margin-top:10px', text: 'A day is Light at 1 to 3 points, Moderate at 4 to 6, and Heavy at 7 or more. Two or more major items on one day is a collision.' })));
    main.appendChild(h('section', { class: 'card' }, h('h3', { text: 'STEAM in the app' }), h('div', { class: 'steam' }, [['S', 'Science', 'Built from survey evidence and the research on workload, spacing, and study habits.'], ['T', 'Technology', 'Offline-first web app that installs on any phone, with tamper-evident share codes.'], ['E', 'Engineering', 'A tested scheduling engine (the study planner and collision finder) plus an Android app.'], ['A', 'Arts', 'Color-coded forecast and an interface designed to lower stress, not add to it.'], ['M', 'Math', 'Scoring models, optimization of study time across days, and a CRC-16 check for codes.']].map(function (s) { return [h('b', { text: s[0] }), h('div', {}, h('b', { style: 'all:unset;font-weight:700', text: s[1] + ': ' }), s[2])]; }))));
    main.appendChild(h('section', { class: 'card' },
      h('details', { open: true }, h('summary', { text: 'Honest limits' }), h('p', { class: 'small', text: 'Steady only knows what students enter, so school totals are as good as participation. Load weights are estimates. Codes show how many students have major items on a day, not how hard a particular test is.' })),
      h('details', {}, h('summary', { text: 'Privacy' }), h('p', { class: 'small', text: 'No accounts, ads, tracking, or servers. Your plan stays on your device. A share code holds only due dates, item types, and a random ID: no name, title, or subject.' })),
      h('details', {}, h('summary', { text: 'Equity and well-being' }), h('p', { class: 'small', text: 'Free, offline, and usable on any phone. Students with jobs, family duties, or limited devices are helped most when teachers can see the combined load. The app encourages breaks and never shames a missed day.' })),
      h('details', {}, h('summary', { text: 'Paper-free planning' }), h('p', { class: 'small', text: 'The counter on the Today tab is self-reported. We convert sheets to trees using a common estimate of about 8,333 sheets per tree.' })),
      h('details', {}, h('summary', { text: 'Accessibility' }), h('p', { class: 'small', text: 'Large touch targets, keyboard navigation, screen reader labels, readable contrast, reduced-motion support, and nothing that relies on color alone.' }))));
    main.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Your data' }),
      h('div', { class: 'row', style: 'flex-wrap:wrap' }, installEvt ? h('button', { class: 'btn sm', text: 'Install app', onclick: function () { installEvt.prompt(); } }) : null,
        h('button', { class: 'btn sm alt', text: 'Load sample data', onclick: loadSample }),
        h('button', { class: 'btn sm warn', text: 'Erase everything', onclick: function () { if (confirm('Erase everything on this device?')) { state = fresh(); save(); render(); toast('Erased'); } } }))));
    main.appendChild(h('p', { class: 'muted small', style: 'text-align:center', text: 'Steady v' + VERSION + ' · Student project for the NJSBA STEAM Tank Challenge · Built by Jaineil Rana, from the Time Management App' }));
  }

  function loadSample() {
    var t0 = today(), A = function (n) { return ST.addDays(t0, n); }, mk = function (name, subject, type, off, imp, dif, m, done) { return { id: uid() + name.length, name: name, subject: subject, type: type, due: A(off), importance: imp, difficulty: dif, minutes: m, done: !!done, completedOn: done ? A(-1) : null, rewardClaimed: !!done, created: Date.now() }; };
    state.tasks = [mk('Unit 4 test', 'Calc BC', 'test', 3, 'high', 'hard', 120), mk('Lab report', 'Physics', 'project', 3, 'high', 'medium', 90), mk('Essay draft', 'English', 'essay', 3, 'medium', 'medium', 90), mk('Vocab quiz', 'Spanish', 'quiz', 2, 'medium', 'easy', 20), mk('Problem set 12', 'Calc BC', 'homework', 1, 'medium', 'medium', 45), mk('Reading ch. 9', 'History', 'homework', 2, 'low', 'easy', 30), mk('Chem test', 'Chem', 'test', 9, 'high', 'hard', 150), mk('Research project', 'APUSH', 'project', 11, 'medium', 'medium', 180), mk('Worksheet', 'Stats', 'homework', 0, 'medium', 'easy', 25), mk('Past quiz', 'Bio', 'quiz', -1, 'low', 'easy', 15, true)];
    state.stats = {}; state.stats[A(-1)] = { focus: 55, done: 1 }; state.stats[A(-2)] = { focus: 40, done: 0 }; state.stats[A(-3)] = { focus: 30, done: 1 }; state.stats[t0] = { focus: 50, done: 0 };
    state.xp = 310; state.paper = 24; state.blocks = []; state.mood = {}; state.mood[A(-3)] = 2; state.mood[A(-2)] = 3; state.mood[A(-1)] = 4; state.mood[t0] = 4; state.stats[A(-1)].trees = 2; state.cards = [{ id: 'c1', subject: 'Calc BC', q: 'd/dx sin x', a: 'cos x', box: 0 }, { id: 'c2', subject: 'Chem', q: 'Avogadro number', a: '6.022 × 10^23', box: 0 }]; state.demo = true; save(); go('today');
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () {});
  render();
})();
