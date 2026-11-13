// SPDX-License-Identifier: MIT
// Estado vivo do cronometro e do timer (usa timerlogic.js; so adiciona relogio, laco de 0,5 s e aviso).
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as L from './timerlogic.js';

export const nowMs = () => Math.floor(GLib.get_real_time() / 1000);

export class ClockState {
  constructor(settings) {
    this._settings = settings;
    this.sw = L.stopwatchNew();
    this.tm = L.timerNew();
    this._listeners = new Set();
    this._src = 0;
  }

  /** Registra um ouvinte de mudancas; devolve a funcao que o remove. */
  connectChange(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  get active() {
    return this.sw.running || this.tm.state === 'running';
  }

  get anything() {
    return this.active || this.tm.state === 'paused' || this.sw.accumulated > 0;
  }

  // ── Cronometro ────────────────────────────────────────────────────
  swElapsed() { return L.stopwatchElapsed(this.sw, nowMs()); }
  swToggle() {
    this.sw = this.sw.running ? L.stopwatchPause(this.sw, nowMs()) : L.stopwatchStart(this.sw, nowMs());
    this._changed();
  }
  swReset() {
    this.sw = L.stopwatchReset();
    this._changed();
  }

  // ── Timer ─────────────────────────────────────────────────────────
  /** Tempo restante para mostrar: arredonda para cima, para comecar em 05:00 e nao em 04:59. */
  tmRemainingShown() {
    return this.tm.state === 'idle' ? 0 : L.timerRemaining(this.tm, nowMs()) + 999;
  }
  tmFraction() {
    if (this.tm.state === 'idle' || this.tm.durationMs <= 0) return 0;
    return Math.min(1, L.timerRemaining(this.tm, nowMs()) / this.tm.durationMs);
  }
  tmStart(minutes) {
    this.tm = L.timerStart(minutes * 60 * 1000, nowMs());
    this._changed();
  }
  tmPauseResume() {
    const now = nowMs();
    this.tm = this.tm.state === 'running' ? L.timerPause(this.tm, now) : L.timerResume(this.tm, now);
    this._changed();
  }
  tmCancel() {
    this.tm = L.timerCancel();
    this._changed();
  }

  // ── Interno ───────────────────────────────────────────────────────
  _changed() {
    this._syncLoop();
    this._emit();
  }

  _emit() {
    for (const cb of [...this._listeners]) {
      try { cb(); } catch (e) { console.error(`[Eltob Clock] listener: ${e.message}`); }
    }
  }

  _syncLoop() {
    if (this.active && !this._src) {
      this._src = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        this._tick();
        if (!this.active) {
          this._src = 0;
          return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
      });
    } else if (!this.active && this._src) {
      GLib.source_remove(this._src);
      this._src = 0;
    }
  }

  _tick() {
    if (L.timerIsDone(this.tm, nowMs()))
      this._timerFinished();
    this._emit();
  }

  _timerFinished() {
    const total = this.tm.durationMs;
    this.tm = L.timerCancel();
    try {
      Main.notify(_('Eltob Clock'), `${_('Timer finished')}: ${L.formatDuration(total)}`);
    } catch (e) {
      console.error(`[Eltob Clock] notify: ${e.message}`);
    }
    if (this._settings.get_boolean('timer-sound')) {
      try {
        global.display.get_sound_player().play_from_theme('complete', _('Timer finished'), null);
      } catch (e) {
        console.warn(`[Eltob Clock] sound: ${e.message}`);
      }
    }
  }

  destroy() {
    if (this._src) {
      GLib.source_remove(this._src);
      this._src = 0;
    }
    this._listeners.clear();
  }
}
