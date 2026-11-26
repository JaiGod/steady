const test = require('node:test'); const assert = require('node:assert/strict');
const ST = require('../docs/js/engine.js');
const T = (o) => Object.assign({ id: Math.random().toString(36).slice(2), name: 'x', type: 'homework', importance: 'medium', difficulty: 'medium', minutes: 30, done: false, created: 1 }, o);
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const TODAY = '2026-11-25';

/* --- rules inherited from the Time Management App --- */
test('urgency matches the original app', () => {
  const u = d => ST.urgencyFor(d, TODAY);
  assert.deepEqual([u('2026-11-24'), u('2026-11-25'), u('2026-11-26'), u('2026-11-28'), u('2026-12-02'), u('2026-12-03'), u(null)], [6, 5, 4, 3, 2, 1, 1]);
});
test('priority = importance x urgency x difficulty weight', () => {
  near(ST.priorityScore(T({ importance: 'high', difficulty: 'hard', due: '2026-11-26' }), TODAY), 3 * 4 * 2);
  near(ST.priorityScore(T({ importance: 'low', difficulty: 'easy', due: '2026-12-20' }), TODAY), 1);
  assert.ok(ST.priorityScore(T({ importance: 'high', due: '2026-11-26' }), TODAY) > ST.priorityScore(T({ importance: 'high', due: '2026-12-10' }), TODAY));
});
test('smartOrder puts done last, then highest score, then earliest due', () => {
  const a = T({ name: 'a', importance: 'low', due: '2026-12-30' }), b = T({ name: 'b', importance: 'high', due: '2026-11-26' }), c = T({ name: 'c', done: true, importance: 'high', due: '2026-11-25' });
  assert.deepEqual(ST.smartOrder([c, a, b], TODAY).map(t => t.name), ['b', 'a', 'c']);
});
test('due labels', () => {
  assert.equal(ST.dueLabel('2026-11-25', TODAY), 'Due today'); assert.equal(ST.dueLabel('2026-11-26', TODAY), 'Due tomorrow'); assert.equal(ST.dueLabel('2026-11-23', TODAY), 'Overdue by 2 days'); assert.equal(ST.dueLabel('2026-11-27', TODAY), 'Due Friday'); assert.equal(ST.dueLabel('2026-12-15', TODAY), 'Due Dec 15');
});
test('productivity score: 40 tasks + 40 focus + 20 not overdue', () => {
  assert.equal(ST.productivity([], 0, TODAY).score, 40); // no tasks = 20, nothing overdue = 20
  assert.equal(ST.productivity([], 240, TODAY).score, 80);
  const done = T({ done: true, completedOn: TODAY, due: TODAY }), open = T({ due: TODAY });
  assert.equal(ST.productivity([done, open], 120, TODAY).score, Math.round(20 + 20 + 20));
  const over = [1, 2, 3, 4, 5].map(() => T({ due: '2026-11-20' }));
  assert.equal(ST.productivity(over, 0, TODAY).overdue, 5); assert.equal(ST.productivity(over, 240, TODAY).score, 40 + 0 + 0);
});
test('levels cost 50 XP more each time and have titles', () => {
  assert.equal(ST.levelFor(0).level, 1); assert.equal(ST.levelFor(99).level, 1); assert.equal(ST.levelFor(100).level, 2); assert.equal(ST.levelFor(249).level, 2); assert.equal(ST.levelFor(250).level, 3);
  assert.equal(ST.levelFor(0).title, 'Freshman'); assert.equal(ST.levelFor(-50).level, 1); assert.ok(ST.levelFor(1e6).title === 'Time Wizard');
});
test('streak: productive = 25+ focus minutes or a finished task; today may be empty', () => {
  const s = { '2026-11-22': { focus: 30, done: 0 }, '2026-11-23': { focus: 0, done: 1 }, '2026-11-24': { focus: 24, done: 0 } };
  assert.equal(ST.streak(s, '2026-11-24'), 2); // 24 min is not productive, so today is skipped and the streak counts back from yesterday
  s['2026-11-24'] = { focus: 25, done: 0 }; assert.equal(ST.streak(s, '2026-11-24'), 3); assert.equal(ST.streak(s, '2026-11-25'), 3); assert.equal(ST.streak(s, '2026-11-26'), 0);
});

/* --- workload model --- */
test('item load: type weight plus hard bonus', () => {
  assert.equal(ST.itemLoad(T({ type: 'test' })), 4); assert.equal(ST.itemLoad(T({ type: 'test', difficulty: 'hard' })), 5); assert.equal(ST.itemLoad(T({ type: 'homework' })), 1); assert.equal(ST.itemLoad({ type: 'junk' }), 1);
});
test('day levels', () => { assert.deepEqual([0, 1, 3, 4, 6, 7, 12].map(ST.levelOf), ['free', 'light', 'light', 'moderate', 'moderate', 'heavy', 'heavy']); });
test('dayLoads sums open items per due date, ignores done, flags collisions', () => {
  const tasks = [T({ type: 'test', due: '2026-11-27' }), T({ type: 'project', due: '2026-11-27' }), T({ type: 'homework', due: '2026-11-27' }), T({ type: 'quiz', due: '2026-11-27', done: true }), T({ type: 'homework', due: '2026-11-26' })];
  const d = ST.dayLoads(tasks, TODAY, 4);
  assert.equal(d.length, 4); assert.equal(d[0].level, 'free'); assert.equal(d[1].load, 1);
  assert.equal(d[2].load, 4 + 3 + 1); assert.equal(d[2].level, 'heavy'); assert.equal(d[2].majors, 2); assert.equal(d[2].collision, true); assert.equal(d[1].collision, false);
});

/* --- load-aware study planner --- */
test('planner places all minutes before the due date, never on or after it', () => {
  const test_ = T({ type: 'test', due: '2026-11-30', minutes: 120 }), r = ST.planStudy(test_, [test_], TODAY);
  assert.equal(r.placed, 120); assert.equal(r.unplaced, 0); assert.ok(r.blocks.every(b => b.date >= TODAY && b.date < '2026-11-30'));
  assert.equal(r.blocks.reduce((s, b) => s + b.minutes, 0), 120);
});
test('planner avoids a heavy day when lighter days exist', () => {
  const test_ = T({ type: 'test', due: '2026-11-30', minutes: 90 });
  const heavy = [T({ type: 'test', due: '2026-11-27' }), T({ type: 'project', due: '2026-11-27' })];
  const r = ST.planStudy(test_, [test_, ...heavy], TODAY);
  const on27 = (r.blocks.find(b => b.date === '2026-11-27') || { minutes: 0 }).minutes;
  assert.ok(on27 < Math.max(...r.blocks.map(b => b.minutes)) || on27 === 0, 'heavy day gets the least prep');
  assert.equal(r.placed, 90);
});
test('planner spreads work instead of cramming', () => {
  const test_ = T({ type: 'test', due: '2026-12-02', minutes: 150 }), r = ST.planStudy(test_, [test_], TODAY);
  assert.ok(r.blocks.length >= 3, 'uses several days'); assert.ok(r.blocks.every(b => b.minutes <= 90));
});
test('planner respects the daily cap and reports what does not fit', () => {
  const test_ = T({ type: 'test', due: '2026-11-27', minutes: 600 }), r = ST.planStudy(test_, [test_], TODAY, { capMinutes: 60 });
  assert.equal(r.blocks.length, 2); assert.equal(r.placed, 120); assert.equal(r.unplaced, 480);
});
test('planner handles items due today, overdue, or without a date', () => {
  assert.equal(ST.planStudy(T({ due: TODAY, minutes: 30 }), [], TODAY).blocks.length, 0); assert.equal(ST.planStudy(T({ due: TODAY, minutes: 30 }), [], TODAY).unplaced, 30);
  assert.equal(ST.planStudy(T({ due: null }), [], TODAY).total, 0); assert.equal(ST.planStudy(T({ due: '2026-11-01' }), [], TODAY).blocks.length, 0);
});
test('planner rounds up to 15-minute chunks and clamps absurd inputs', () => {
  const r = ST.planStudy(T({ due: '2026-12-10', minutes: 20 }), [], TODAY); assert.equal(r.total, 30);
  assert.equal(ST.planStudy(T({ due: '2026-12-10', minutes: 99999 }), [], TODAY, { capMinutes: 200 }).total, 600);
});

/* --- paper --- */
test('paper saved is counted in sheets and trees', () => { assert.equal(ST.paperSaved(200).sheets, 200); near(ST.paperSaved(8333).trees, 1); assert.equal(ST.paperSaved(-5).sheets, 0); assert.equal(ST.paperSaved(10).kg, undefined); });

/* --- school load codes --- */
const mk = (token, items, t = TODAY) => ST.makeLoadCode(items, token, t);
test('load code round-trips and contains no titles or subjects', () => {
  const code = mk('abc123', [T({ name: 'Secret Essay Title', subject: 'Chem', type: 'test', due: '2026-11-30', difficulty: 'hard' })]);
  const r = ST.parseLoadCode(code); assert.ok(r.ok); assert.deepEqual(r.data.items, [{ due: '2026-11-30', type: 'test', difficulty: 'hard' }]);
  const raw = Buffer.from(code.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
  assert.ok(!raw.includes('Secret') && !raw.includes('Chem'));
});
test('load code excludes done, past, and far-future items', () => {
  const r = ST.parseLoadCode(mk('t1', [T({ due: '2026-11-24' }), T({ due: '2026-11-30', done: true }), T({ due: '2027-06-01' }), T({ due: '2026-12-01' })]));
  assert.equal(r.data.items.length, 1);
});
test('load code detects typos and junk', () => {
  const code = mk('t1', [T({ due: '2026-12-01' })]); const bad = code.replace(/\.(\w)/, (m, c) => '.' + (c === 'a' ? 'b' : 'a'));
  assert.equal(ST.parseLoadCode(bad).ok, false); assert.equal(ST.parseLoadCode('hello').ok, false); assert.equal(ST.parseLoadCode('').ok, false); assert.equal(ST.parseLoadCode('ST1.e30.0000').ok, false);
});
test('combine counts students per day and dedupes by token (newest wins)', () => {
  const a1 = mk('aaa', [T({ type: 'test', due: '2026-12-01' })], '2026-11-20');
  const a2 = mk('aaa', [T({ type: 'test', due: '2026-12-01' }), T({ type: 'project', due: '2026-12-01' })], '2026-11-24');
  const b = mk('bbb', [T({ type: 'test', due: '2026-12-01' })], TODAY), c = mk('ccc', [T({ type: 'homework', due: '2026-12-01' })], TODAY);
  const r = ST.combineLoad([a1, a2, b, c, 'junk']);
  assert.equal(r.n, 3); assert.equal(r.errors.length, 1);
  const d = r.byDate['2026-12-01'];
  assert.equal(d.students, 3); assert.equal(d.major, 2); assert.equal(d.collision, 1); assert.equal(d.heavy, 1); assert.equal(d.tests, 2);
});
test('bestDays prefers weekdays with the fewest heavy days', () => {
  const codes = [mk('a', [T({ type: 'test', due: '2026-12-01' }), T({ type: 'project', due: '2026-12-01' })]), mk('b', [T({ type: 'test', due: '2026-12-02' })])];
  const c = ST.combineLoad(codes), best = ST.bestDays(c, '2026-11-30', 5, 3);
  assert.equal(best.length, 3); assert.ok(best.every(d => ST.isWeekday(d.date))); assert.ok(!best.some(d => d.date === '2026-12-01'), 'avoids the collision day');
  assert.equal(best[0].date, '2026-11-30');
  assert.ok(ST.bestDays(c, '2026-11-28', 2, 5).every(d => d.date !== '2026-11-28' && d.date !== '2026-11-29'), 'skips weekend');
});
test('collisionReport counts students on a date', () => {
  const c = ST.combineLoad([mk('a', [T({ type: 'test', due: '2026-12-01' })]), mk('b', [T({ type: 'homework', due: '2026-12-01' })])]);
  const r = ST.collisionReport(c, '2026-12-01'); assert.equal(r.n, 2); assert.equal(r.withMajor, 1); assert.equal(ST.collisionReport(c, '2026-12-05').withMajor, 0);
});
