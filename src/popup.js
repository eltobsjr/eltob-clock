// SPDX-License-Identifier: MIT
// Terceira coluna do popup do relogio: hora formatada, timer, cronometro e acoes.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import { FORMAT_PRESETS, applyPresetToSettings, formatNow } from './presets.js';
import { TIMER_PRESET_MINUTES, formatDuration } from './timerlogic.js';

export const MENU_STYLES = [['system', 'Padrão'], ['light', 'Claro'], ['dark', 'Escuro']];

const RING_COLORS = { ok: [166, 218, 149], warn: [238, 212, 159], crit: [237, 135, 150], idle: [128, 135, 162] };

/** Cor do timer pela fracao restante: verde, amarelo (<=25%), vermelho (<=10%). */
export function timerLevel(fraction) {
  if (fraction <= 0.1) return 'crit';
  if (fraction <= 0.25) return 'warn';
  return 'ok';
}

function hms(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const p = n => String(n).padStart(2, '0');
  return `${p(Math.floor(total / 3600))}:${p(Math.floor((total % 3600) / 60))}:${p(total % 60)}`;
}

function button(text, styleClass, onClick) {
  const b = new St.Button({ label: text, style_class: `ec-btn ${styleClass ?? ''}`.trim(), can_focus: true, x_expand: true });
  b.connect('clicked', onClick);
  return b;
}

function card(title, grow = false) {
  const c = new St.BoxLayout({ style_class: 'ec-card', orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_expand: grow });
  if (title) c.add_child(new St.Label({ text: title, style_class: 'ec-title' }));
  return c;
}

// Anel de progresso do timer (cairo), com o tempo escrito no centro.
class Ring {
  constructor(size) {
    this.actor = new St.Widget({ layout_manager: new Clutter.BinLayout(), style_class: 'ec-ring' });
    this._area = new St.DrawingArea({ width: size, height: size });
    this._area.connect('repaint', a => this._paint(a));
    this._text = new St.Label({ style_class: 'ec-ring-text', x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER });
    this.actor.add_child(this._area);
    this.actor.add_child(this._text);
    this._fraction = 0;
    this._level = 'idle';
  }

  set(fraction, level, text) {
    this._fraction = fraction;
    this._level = level;
    this._text.text = text;
    this._area.queue_repaint();
  }

  _paint(area) {
    const cr = area.get_context();
    const [w, h] = area.get_surface_size();
    const r = Math.min(w, h) / 2 - 4;
    cr.setLineWidth(5);
    cr.setLineCap(1);
    cr.setSourceRGBA(0.5, 0.53, 0.64, 0.22);
    cr.arc(w / 2, h / 2, r, 0, 2 * Math.PI);
    cr.stroke();
    if (this._fraction > 0) {
      const [R, G, B] = RING_COLORS[this._level] ?? RING_COLORS.ok;
      cr.setSourceRGBA(R / 255, G / 255, B / 255, 1);
      cr.arc(w / 2, h / 2, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * this._fraction);
      cr.stroke();
    }
    cr.$dispose();
  }
}

class TimerCard {
  constructor(state) {
    this._state = state;
    this.actor = card('Timer', true);
    const body = new St.BoxLayout({ style_class: 'ec-row ec-timer-body', y_expand: true, y_align: Clutter.ActorAlign.CENTER });
    this._ring = new Ring(76);
    body.add_child(this._ring.actor);
    const right = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'ec-col-gap' });
    this._info = new St.Label({ style_class: 'ec-dim ec-small' });
    this._info.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    right.add_child(this._info);
    this._buttons = new St.BoxLayout({ style_class: 'ec-row' });
    this._pause = button('Pausar', '', () => state.tmPauseResume());
    this._cancel = button('Cancelar', '', () => state.tmCancel());
    this._buttons.add_child(this._pause);
    this._buttons.add_child(this._cancel);
    right.add_child(this._buttons);
    body.add_child(right);
    this.actor.add_child(body);

    this._chipRow = new St.BoxLayout({ style_class: 'ec-chip-row', x_expand: true });
    this._chips = TIMER_PRESET_MINUTES.map(m => {
      const b = new St.Button({ label: m === 60 ? '60 min' : String(m), style_class: 'ec-chip', can_focus: true });
      b.connect('clicked', () => state.tmStart(m));
      this._chipRow.add_child(b);
      return [m, b];
    });
    this.actor.add_child(this._chipRow);
    this.update();
  }

  update() {
    const s = this._state;
    const t = s.tm;
    if (t.state === 'idle') {
      this._ring.set(0, 'idle', '00:00');
      this._info.text = 'Escolha uma duração';
      this._buttons.hide();
    } else {
      const frac = s.tmFraction();
      this._ring.set(frac, t.state === 'paused' ? 'idle' : timerLevel(frac), formatDuration(s.tmRemainingShown()));
      const mins = Math.round(t.durationMs / 60000);
      this._info.text = t.state === 'paused'
        ? `pausado · de ${mins} min`
        : `de ${mins} min · termina ${GLib.DateTime.new_from_unix_local(Math.floor(t.endsAt / 1000)).format('%H:%M')}`;
      this._pause.label = t.state === 'paused' ? 'Retomar' : 'Pausar';
      this._buttons.show();
    }
    for (const [m, b] of this._chips) {
      if (t.state !== 'idle' && Math.round(t.durationMs / 60000) === m) b.add_style_pseudo_class('checked');
      else b.remove_style_pseudo_class('checked');
    }
  }
}

class StopwatchCard {
  constructor(state) {
    this._state = state;
    this.actor = card('Cronômetro', true);
    this._time = new St.Label({ style_class: 'ec-sw-time', x_align: Clutter.ActorAlign.CENTER, y_expand: true, y_align: Clutter.ActorAlign.CENTER });
    this.actor.add_child(this._time);
    const row = new St.BoxLayout({ style_class: 'ec-row' });
    this._toggle = button('Iniciar', 'ec-btn-primary', () => state.swToggle());
    this._reset = button('Zerar', '', () => state.swReset());
    row.add_child(this._toggle);
    row.add_child(this._reset);
    this.actor.add_child(row);
    this.update();
  }

  update() {
    const sw = this._state.sw;
    this._time.text = hms(this._state.swElapsed());
    this._toggle.label = sw.running ? 'Pausar' : (sw.accumulated > 0 ? 'Continuar' : 'Iniciar');
    this._reset.reactive = sw.running || sw.accumulated > 0;
    this._reset.opacity = this._reset.reactive ? 255 : 110;
  }
}

class ActionsCard {
  constructor({ settings, copyTime, openPrefs, openAbout, onPresetApplied }) {
    this._settings = settings;
    this.actor = card('Eltob Clock');
    this._grid = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, style_class: 'ec-col-gap' });
    this._rows = [];
    const add = (icon, text, onClick, chevron = false) => {
      const b = new St.Button({ style_class: 'ec-act', can_focus: true, x_expand: true });
      const box = new St.BoxLayout({ x_expand: true, style_class: 'ec-act-box' });
      box.add_child(new St.Icon({ icon_name: icon, icon_size: 14, style_class: 'ec-act-ic' }));
      const l = new St.Label({ text, style_class: 'ec-act-label', x_expand: true, y_align: Clutter.ActorAlign.CENTER });
      l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
      box.add_child(l);
      if (chevron) box.add_child(new St.Icon({ icon_name: 'pan-end-symbolic', icon_size: 12, style_class: 'ec-act-chev' }));
      b.child = box;
      b.connect('clicked', onClick);
      return b;
    };
    this._btnPresets = add('document-edit-symbolic', 'Presets', () => this._toggleSub('presets'), true);
    this._btnStyle = add('applications-graphics-symbolic', 'Estilo', () => this._toggleSub('style'), true);
    const pairs = [
      [add('edit-copy-symbolic', 'Copiar hora', copyTime), this._btnPresets],
      [this._btnStyle, add('preferences-system-symbolic', 'Preferências', openPrefs)],
      [add('help-about-symbolic', 'Sobre', openAbout)],
    ];
    for (const items of pairs) {
      const row = new St.BoxLayout({ style_class: 'ec-row', x_expand: true });
      for (const b of items) row.add_child(b);
      this._grid.add_child(row);
    }
    this.actor.add_child(this._grid);

    this._sub = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, style_class: 'ec-sub ec-col-gap', x_expand: true });
    // A lista tem altura maxima (CSS) e rola, para nao alongar o popup alem da tela.
    this._scroll = new St.ScrollView({
      style_class: 'ec-sub-scroll vfade',
      x_expand: true,
      overlay_scrollbars: true,
      hscrollbar_policy: St.PolicyType.NEVER,
      vscrollbar_policy: St.PolicyType.AUTOMATIC,
      child: this._sub,
    });
    this._scroll.hide();
    this.actor.add_child(this._scroll);
    this._open = null;
    this._onPresetApplied = onPresetApplied;
  }

  _toggleSub(which) {
    if (this._open === which) {
      this._closeSub();
      return;
    }
    this._open = which;
    this._sub.destroy_all_children();
    if (which === 'presets') this._fillPresets();
    else this._fillStyles();
    this._scroll.show();
  }

  _closeSub() {
    this._open = null;
    this._scroll.hide();
  }

  _item(text, sample, checked, onClick) {
    const b = new St.Button({ style_class: 'ec-sub-item', can_focus: true, x_expand: true });
    if (checked) b.add_style_pseudo_class('checked');
    const box = new St.BoxLayout({ x_expand: true });
    const l = new St.Label({ text: (checked ? '✓ ' : '') + text, x_expand: true, y_align: Clutter.ActorAlign.CENTER });
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    box.add_child(l);
    if (sample) box.add_child(new St.Label({ text: sample, style_class: 'ec-dim ec-small', y_align: Clutter.ActorAlign.CENTER }));
    b.child = box;
    b.connect('clicked', onClick);
    this._sub.add_child(b);
  }

  _fillPresets() {
    const current = this._settings.get_string('format-string');
    // Varios presets podem ter o mesmo formato; marca so o primeiro.
    const active = FORMAT_PRESETS.findIndex(p => p.fmt === current);
    for (const [i, p] of FORMAT_PRESETS.entries()) {
      this._item(p.label, formatNow(p.fmt), i === active, () => {
        applyPresetToSettings(this._settings, p);
        this._onPresetApplied?.(p);
        this._closeSub();
      });
    }
  }

  _fillStyles() {
    const current = this._settings.get_string('menu-style');
    for (const [value, text] of MENU_STYLES) {
      this._item(text, null, value === current, () => {
        this._settings.set_string('menu-style', value);
        this._closeSub();
      });
    }
  }
}

export class PopupColumn {
  constructor({ settings, state, copyTime, openPrefs, openAbout, onPresetApplied }) {
    this._settings = settings;
    this.actor = new St.BoxLayout({
      style_class: 'ec-col',
      orientation: Clutter.Orientation.VERTICAL,
      y_expand: true,
    });

    const head = new St.BoxLayout({ style_class: 'ec-row ec-head', x_expand: true });
    this._clock = new St.Label({ style_class: 'ec-clock', x_expand: true, y_align: Clutter.ActorAlign.CENTER });
    head.add_child(this._clock);
    this._fmtHint = new St.Label({ style_class: 'ec-dim ec-tiny', y_align: Clutter.ActorAlign.CENTER });
    head.add_child(this._fmtHint);
    this.actor.add_child(head);

    this._timer = new TimerCard(state);
    this._stopwatch = new StopwatchCard(state);
    this._actions = new ActionsCard({ settings, copyTime, openPrefs, openAbout, onPresetApplied });
    this.actor.add_child(this._timer.actor);
    this.actor.add_child(this._stopwatch.actor);
    this.actor.add_child(this._actions.actor);

    this._unsub = state.connectChange(() => this.updateState());
    this._clockId = 0;
    this.refreshClock();
  }

  setStyleClass(cls) {
    for (const c of ['ec-style-light', 'ec-style-dark'])
      this.actor.remove_style_class_name(c);
    if (cls) this.actor.add_style_class_name(cls);
  }

  refreshClock() {
    const fmt = this._settings.get_string('format-string');
    this._clock.text = formatNow(fmt);
    this._fmtHint.text = '';
  }

  updateState() {
    this._timer.update();
    this._stopwatch.update();
  }

  /** Chamado quando o popup abre: mostra a hora viva e reinicia a lista de acoes. */
  onOpen() {
    this.refreshClock();
    this.updateState();
    this._actions._closeSub();
    if (!this._clockId) {
      this._clockId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
        this.refreshClock();
        return GLib.SOURCE_CONTINUE;
      });
    }
  }

  onClose() {
    if (this._clockId) {
      GLib.source_remove(this._clockId);
      this._clockId = 0;
    }
  }

  destroy() {
    this.onClose();
    this._unsub?.();
    this.actor.destroy();
  }
}
