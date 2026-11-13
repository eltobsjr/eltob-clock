// Testes da logica do timer/cronometro. Uso: node tools/tests/timerlogic.test.mjs
import assert from 'node:assert/strict';
import * as L from '../../src/timerlogic.js';

let n = 0;
function t(name, fn) { fn(); n++; console.log(`PASS ${name}`); }

t('formatDuration', () => {
  assert.equal(L.formatDuration(0), '00:00');
  assert.equal(L.formatDuration(65000), '01:05');
  assert.equal(L.formatDuration(3725000), '1:02:05');
  assert.equal(L.formatDuration(-5), '00:00');
  assert.equal(L.formatDuration(999), '00:00');
});

t('stopwatch start/pause/resume/reset', () => {
  let sw = L.stopwatchNew();
  sw = L.stopwatchStart(sw, 1000);
  assert.equal(L.stopwatchElapsed(sw, 4000), 3000);
  sw = L.stopwatchPause(sw, 4000);
  assert.equal(L.stopwatchElapsed(sw, 99999), 3000);
  sw = L.stopwatchStart(sw, 10000);
  assert.equal(L.stopwatchElapsed(sw, 12000), 5000);
  assert.deepEqual(L.stopwatchReset(), L.stopwatchNew());
});

t('stopwatch ignora relogio andando para tras', () => {
  const sw = L.stopwatchStart(L.stopwatchNew(), 5000);
  assert.equal(L.stopwatchElapsed(sw, 4000), 0);
});

t('timer conta e termina', () => {
  let tm = L.timerStart(10000, 1000);
  assert.equal(L.timerRemaining(tm, 4000), 7000);
  assert.equal(L.timerIsDone(tm, 10999), false);
  assert.equal(L.timerIsDone(tm, 11000), true);
  assert.equal(L.timerRemaining(tm, 50000), 0);
});

t('timer pausa e retoma', () => {
  let tm = L.timerStart(10000, 0);
  tm = L.timerPause(tm, 3000);
  assert.equal(tm.state, 'paused');
  assert.equal(L.timerRemaining(tm, 99999), 7000);
  assert.equal(L.timerIsDone(tm, 99999), false);
  tm = L.timerResume(tm, 20000);
  assert.equal(L.timerRemaining(tm, 22000), 5000);
});

t('timer rejeita duracao invalida e limita o maximo', () => {
  assert.equal(L.timerStart(0, 0).state, 'idle');
  assert.equal(L.timerStart(-1, 0).state, 'idle');
  assert.equal(L.timerStart(NaN, 0).state, 'idle');
  assert.equal(L.timerStart(1e12, 0).durationMs, L.MAX_TIMER_MS);
});

t('timer cancel volta a idle', () => {
  assert.deepEqual(L.timerCancel(), L.timerNew());
});

t('barSuffix', () => {
  const sw0 = L.stopwatchNew();
  const t0 = L.timerNew();
  assert.equal(L.barSuffix(sw0, t0, 0), '');
  const tm = L.timerStart(90000, 0);
  assert.equal(L.barSuffix(sw0, tm, 30000), '⏳ 01:00');
  const sw = L.stopwatchStart(sw0, 0);
  assert.equal(L.barSuffix(sw, t0, 5000), '⏱ 00:05');
  assert.equal(L.barSuffix(L.stopwatchPause(sw, 5000), t0, 9000), '⏱ 00:05 ⏸');
  assert.equal(L.barSuffix(sw, tm, 30000), '⏳ 01:00  ⏱ 00:30');
});

t('timerLevel', () => {
  assert.equal(L.timerLevel(1), 'ok');
  assert.equal(L.timerLevel(0.26), 'ok');
  assert.equal(L.timerLevel(0.25), 'warn');
  assert.equal(L.timerLevel(0.11), 'warn');
  assert.equal(L.timerLevel(0.1), 'crit');
  assert.equal(L.timerLevel(0), 'crit');
});

console.log(`TIMERLOGIC TEST PASSED (${n})`);
