// SPDX-License-Identifier: MIT
// Popup do relogio: cartoes (hora, timer, cronometro, acoes; o clima fica em weatherview.js) e o
// PopupLayout, que monta as colunas conforme o layout escolhido nas preferencias.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { FORMAT_PRESETS, applyPresetToSettings, formatNow } from './presets.js';
import { TIMER_PRESET_MINUTES, formatDuration, timerLevel } from './timerlogic.js';
import { cleanCols, parseCard } from './layoutlogic.js';
import { WeatherCard } from './weatherview.js';
import { collapseV, fadeIn, revealV, setShown } from './anim.js';

export const MENU_STYLES = [['system', 'Padrão'], ['light', 'Claro'], ['dark', 'Escuro']];
export { timerLevel };

const RING_COLORS = { ok: [166, 218, 149], warn: [238, 212, 159], crit: [237, 135, 150], idle: [128, 135, 162] };

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

function setStyle(actor, cls) {
  for (const c of ['ec-style-light', 'ec-style-dark'])
    actor.remove_style_class_name(c);
  if (cls) actor.add_style_class_name(cls);
}

// Base dos cartoes: guarda o estado vivo e a assinatura de mudancas.
class Card {
  constructor() {
    this._unsub = null;
  }

  setStyleClass(cls) { setStyle(this.actor, cls); }
  update() {}
  onOpen() {}
  onClose() {}

  destroy() {
    this._unsub?.();
    this.onClose();
    this.actor.destroy();
  }
}

// ── Hora formatada ──────────────────────────────────────────────────
class ClockCard extends Card {
  constructor(settings, size) {
    super();
    this._settings = settings;
    this.actor = new St.BoxLayout({ style_class: `ec-row ec-head ${size === 'compact' ? 'ec-head-compact' : ''}`.trim(), x_expand: true });
    this._clock = new St.Label({ style_class: 'ec-clock', x_expand: true, y_align: Clutter.ActorAlign.CENTER });
    this.actor.add_child(this._clock);
    this._id = 0;
    this.update();
  }

  update() {
    this._clock.text = formatNow(this._settings.get_string('format-string'));
  }

  onOpen() {
    this.update();
    if (!this._id) {
      this._id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
        this.update();
        return GLib.SOURCE_CONTINUE;
      });
    }
  }

  onClose() {
    if (this._id) {
      GLib.source_remove(this._id);
      this._id = 0;
    }
  }
}

// ── Anel de progresso (cairo) ───────────────────────────────────────
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

// ── Timer ───────────────────────────────────────────────────────────
class TimerCard extends Card {
  constructor(state, size) {
    super();
    this._state = state;
    this._compact = size === 'compact';
    this.actor = card('Timer', !this._compact);

    const body = new St.BoxLayout({ style_class: 'ec-row ec-timer-body', y_expand: !this._compact, y_align: Clutter.ActorAlign.CENTER });
    this._ring = new Ring(this._compact ? 0 : 76);
    if (!this._compact) body.add_child(this._ring.actor);
    else {
      this._cTime = new St.Label({ style_class: 'ec-compact-time', y_align: Clutter.ActorAlign.CENTER });
      body.add_child(this._cTime);
    }
    const right = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'ec-col-gap' });
    this._info = new St.Label({ style_class: 'ec-dim ec-small' });
    this._info.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    if (!this._compact) right.add_child(this._info);
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
    this._unsub = state.connectChange(() => this.update());
    this.update();
  }

  update() {
    const s = this._state;
    const t = s.tm;
    const idle = t.state === 'idle';
    const shown = idle ? '00:00' : formatDuration(s.tmRemainingShown());
    if (idle) {
      this._ring.set(0, 'idle', '00:00');
      this._info.text = 'Escolha uma duração';
    } else {
      const frac = s.tmFraction();
      this._ring.set(frac, t.state === 'paused' ? 'idle' : timerLevel(frac), shown);
      const mins = Math.round(t.durationMs / 60000);
      this._info.text = t.state === 'paused'
        ? `pausado · de ${mins} min`
        : `de ${mins} min · termina ${GLib.DateTime.new_from_unix_local(Math.floor(t.endsAt / 1000)).format('%H:%M')}`;
      this._pause.label = t.state === 'paused' ? 'Retomar' : 'Pausar';
    }
    if (this._cTime) this._cTime.text = shown;
    setShown(this._buttons, !idle);
    if (this._compact) setShown(this._chipRow, idle);
    for (const [m, b] of this._chips) {
      if (!idle && Math.round(t.durationMs / 60000) === m) b.add_style_pseudo_class('checked');
      else b.remove_style_pseudo_class('checked');
    }
  }
}

// ── Cronometro ──────────────────────────────────────────────────────
class StopwatchCard extends Card {
  constructor(state, size) {
    super();
    this._state = state;
    this._compact = size === 'compact';
    this.actor = card('Cronômetro', !this._compact);
    this._time = new St.Label({
      style_class: this._compact ? 'ec-compact-time' : 'ec-sw-time',
      x_align: this._compact ? Clutter.ActorAlign.START : Clutter.ActorAlign.CENTER,
      y_expand: !this._compact,
      y_align: Clutter.ActorAlign.CENTER,
    });
    this._toggle = button('Iniciar', 'ec-btn-primary', () => state.swToggle());
    this._reset = button('Zerar', '', () => state.swReset());
    const row = new St.BoxLayout({ style_class: 'ec-row', x_expand: true, y_align: Clutter.ActorAlign.CENTER });
    if (this._compact) {
      row.add_child(this._time);
      row.add_child(this._toggle);
      row.add_child(this._reset);
      this.actor.add_child(row);
    } else {
      this.actor.add_child(this._time);
      row.add_child(this._toggle);
      row.add_child(this._reset);
      this.actor.add_child(row);
    }
    this._unsub = state.connectChange(() => this.update());
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

// ── Acoes ───────────────────────────────────────────────────────────
class ActionsCard extends Card {
  constructor({ settings, copyTime, openPrefs, openAbout, onPresetApplied, size }) {
    super();
    this._settings = settings;
    this._compact = size === 'compact';
    this.actor = card('Eltob Clock');
    this._grid = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, style_class: 'ec-col-gap' });
    const add = (icon, text, onClick, chevron = false) => {
      const b = new St.Button({ style_class: 'ec-act', can_focus: true, x_expand: true });
      const box = new St.BoxLayout({ x_expand: true, style_class: 'ec-act-box' });
      if (this._compact) box.x_align = Clutter.ActorAlign.CENTER;
      box.add_child(new St.Icon({ icon_name: icon, icon_size: 14, style_class: 'ec-act-ic' }));
      if (!this._compact) {
        const l = new St.Label({ text, style_class: 'ec-act-label', x_expand: true, y_align: Clutter.ActorAlign.CENTER });
        l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(l);
        if (chevron) box.add_child(new St.Icon({ icon_name: 'pan-end-symbolic', icon_size: 12, style_class: 'ec-act-chev' }));
      }
      b.child = box;
      b.connect('clicked', onClick);
      return b;
    };
    const copy = add('edit-copy-symbolic', 'Copiar hora', copyTime);
    const presets = add('document-edit-symbolic', 'Presets', () => this._toggleSub('presets'), true);
    const style = add('applications-graphics-symbolic', 'Estilo', () => this._toggleSub('style'), true);
    const prefs = add('preferences-system-symbolic', 'Preferências', openPrefs);
    const about = add('help-about-symbolic', 'Sobre', openAbout);
    const rows = this._compact ? [[copy, presets, style], [prefs, about]] : [[copy, presets], [style, prefs], [about]];
    for (const items of rows) {
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
    const wasOpen = this._open !== null;
    this._open = which;
    this._sub.destroy_all_children();
    if (which === 'presets') this._fillPresets();
    else this._fillStyles();
    if (wasOpen) this._scroll.show();
    else revealV(this._scroll);
  }

  _closeSub(animate = true) {
    if (this._open === null) return;
    this._open = null;
    if (animate) collapseV(this._scroll);
    else this._scroll.hide();
  }

  onOpen() {
    this._closeSub(false);
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

function makeCard(id, size, ctx) {
  switch (id) {
    case 'clock': return new ClockCard(ctx.settings, size);
    case 'timer': return new TimerCard(ctx.state, size);
    case 'stopwatch': return new StopwatchCard(ctx.state, size);
    case 'weather': return new WeatherCard(ctx.client, size);
    case 'actions': return new ActionsCard({ ...ctx.actions, settings: ctx.settings, size });
    default: return null;
  }
}

/**
 * Monta as colunas extras do popup nativo a partir de popup-col2 (abaixo do calendario) e popup-col3
 * (coluna nova a direita). Reconstroi sozinho quando o layout muda nas preferencias.
 */
export class PopupLayout {
  constructor({ dateMenu, settings, state, client, actions }) {
    this._dm = dateMenu;
    this._settings = settings;
    this._ctx = { settings, state, client, actions };
    this._cards = [];
    this._styleClass = '';
    this._open = false;

    this._hbox = dateMenu._messageList.get_parent();
    this._col2Host = dateMenu._displaysSection.get_parent();
    this._col3 = new St.BoxLayout({ style_class: 'ec-col', orientation: Clutter.Orientation.VERTICAL, y_expand: true });
    this._hbox.add_child(this._col3);

    // Eventos e relogios mundiais nativos saem; o clima nativo e trocado pelo nosso cartao.
    this._visId = dateMenu._displaysSection.connect('notify::visible', () => {
      if (dateMenu._displaysSection.visible) dateMenu._displaysSection.hide();
    });
    dateMenu._displaysSection.hide();

    this._ids = ['changed::popup-col2', 'changed::popup-col3'].map(sig => settings.connect(sig, () => this._build(true)));
    this._build(false);
  }

  _layout() {
    return cleanCols(this._settings.get_strv('popup-col2'), this._settings.get_strv('popup-col3'));
  }

  _clear() {
    for (const c of this._cards) c.destroy();
    this._cards = [];
  }

  _build(animate) {
    this._clear();
    const [c2, c3] = this._layout();
    const add = (list, host) => {
      for (const s of list) {
        const spec = parseCard(s);
        const c = makeCard(spec.id, spec.size, this._ctx);
        if (!c) continue;
        c.setStyleClass(this._styleClass);
        host.add_child(c.actor);
        this._cards.push(c);
        if (animate) fadeIn(c.actor);
        if (this._open) c.onOpen();
      }
    };
    add(c2, this._col2Host);
    add(c3, this._col3);
    this._col3.visible = c3.length > 0;
  }

  setStyleClass(cls) {
    this._styleClass = cls;
    setStyle(this._col3, cls);
    for (const c of this._cards) c.setStyleClass(cls);
  }

  onOpen() {
    this._open = true;
    for (const c of this._cards) {
      c.update();
      c.onOpen();
    }
  }

  onClose() {
    this._open = false;
    for (const c of this._cards) c.onClose();
  }

  /** Atualiza a hora das caixas que mostram a hora formatada (ex.: depois de mudar o formato). */
  refreshClock() {
    for (const c of this._cards) {
      if (c instanceof ClockCard) c.update();
    }
  }

  /** Ajuda os testes: primeiro cartao do tipo dado. */
  find(Type) {
    return this._cards.find(c => c instanceof Type) ?? null;
  }

  destroy() {
    for (const id of this._ids) this._settings.disconnect(id);
    this._ids = [];
    this._clear();
    this._dm._displaysSection.disconnect(this._visId);
    this._col3.destroy();
    // Devolve as secoes nativas (eventos, relogios mundiais, clima).
    this._dm._displaysSection.visible = Main.sessionMode.allowSettings;
  }
}

export { ClockCard, TimerCard, StopwatchCard, ActionsCard };
