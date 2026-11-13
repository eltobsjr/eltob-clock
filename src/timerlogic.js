// SPDX-License-Identifier: MIT
// Logica pura do cronometro e do timer: sem imports do GNOME (testavel com node).
// Todos os tempos sao em milissegundos; `now` vem de quem chama (relogio de parede),
// assim os testes controlam o tempo e o timer continua certo apos suspender o PC.

export const TIMER_PRESET_MINUTES = [5, 10, 15, 25, 30, 60];
export const MAX_TIMER_MS = 99 * 3600 * 1000 + 59 * 60 * 1000 + 59 * 1000;

/** 65000 -> "01:05"; 3725000 -> "1:02:05". Negativos viram 00:00. */
export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ── Cronometro ──────────────────────────────────────────────────────
export function stopwatchNew() {
  return { running: false, startedAt: 0, accumulated: 0 };
}

export function stopwatchElapsed(sw, now) {
  return sw.accumulated + (sw.running ? Math.max(0, now - sw.startedAt) : 0);
}

export function stopwatchStart(sw, now) {
  if (sw.running) return sw;
  return { running: true, startedAt: now, accumulated: sw.accumulated };
}

export function stopwatchPause(sw, now) {
  if (!sw.running) return sw;
  return { running: false, startedAt: 0, accumulated: stopwatchElapsed(sw, now) };
}

export function stopwatchReset() {
  return stopwatchNew();
}

// ── Timer (contagem regressiva) ─────────────────────────────────────
// idle: nada configurado | running: endsAt valido | paused: remaining guardado.
export function timerNew() {
  return { state: 'idle', durationMs: 0, endsAt: 0, remainingMs: 0 };
}

function clampDuration(ms) {
  const n = Math.floor(Number(ms));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_TIMER_MS);
}

export function timerStart(durationMs, now) {
  const d = clampDuration(durationMs);
  if (d === 0) return timerNew();
  return { state: 'running', durationMs: d, endsAt: now + d, remainingMs: d };
}

export function timerRemaining(t, now) {
  if (t.state === 'running') return Math.max(0, t.endsAt - now);
  if (t.state === 'paused') return t.remainingMs;
  return 0;
}

export function timerPause(t, now) {
  if (t.state !== 'running') return t;
  return { ...t, state: 'paused', endsAt: 0, remainingMs: timerRemaining(t, now) };
}

export function timerResume(t, now) {
  if (t.state !== 'paused' || t.remainingMs <= 0) return t;
  return { ...t, state: 'running', endsAt: now + t.remainingMs };
}

export function timerCancel() {
  return timerNew();
}

/** true quando o timer em andamento chegou ao fim. */
export function timerIsDone(t, now) {
  return t.state === 'running' && now >= t.endsAt;
}

/** Texto curto para a barra, ou '' quando nao ha nada ativo. */
export function barSuffix(sw, t, now) {
  const parts = [];
  if (t.state === 'running' || t.state === 'paused')
    parts.push(`⏳ ${formatDuration(timerRemaining(t, now))}${t.state === 'paused' ? ' ⏸' : ''}`);
  if (sw.running || sw.accumulated > 0)
    parts.push(`⏱ ${formatDuration(stopwatchElapsed(sw, now))}${sw.running ? '' : ' ⏸'}`);
  return parts.join('  ');
}
