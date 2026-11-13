// SPDX-License-Identifier: MIT
// Eltob Clock — GNOME 45+ (ESM). Fork do Numeric Clock (MIT, Nick Otmazgin).
// Troca o texto do relogio da barra por um formato livre e acrescenta ao popup do relogio
// uma terceira coluna (timer, cronometro, acoes), o clima e pilulas na barra.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { WeatherClient } from 'resource:///org/gnome/shell/misc/weather.js';
import { formatNow } from './presets.js';
import { ClockState } from './clockstate.js';
import { PopupColumn } from './popup.js';
import { WeatherCard } from './weatherview.js';
import { BarPills } from './barpills.js';

// Labels fora do DateMenu da barra so sao tomados quando parecem um relogio inteiro
// ("qua 13:17", "22/10 1:17 PM") ou tem classe/nome "clock". O relogio do GNOME escreve "13‎∶24".
const CLOCK_NAME_RE = /(^|[-_\s])clock([-_\s]|$)/i;
const CLOCK_TEXT_RE = /^[\p{L}\p{N}\s,./-]{0,24}?\d{1,2}‎?[:∶]\d{2}(‎?[:∶]\d{2})?(\s?[ap]\.?m\.?)?$/iu;
const RESCAN_TICKS = 5;
const STYLE_CLASS = { system: '', light: 'ec-style-light', dark: 'ec-style-dark' };

function looksLikeClock(lab) {
  const cls = lab.get_style_class_name?.() || '';
  const name = lab.get_name?.() || '';
  if (CLOCK_NAME_RE.test(cls) || CLOCK_NAME_RE.test(name))
    return true;
  const txt = (lab.get_text?.() || '').trim();
  return txt.length > 0 && txt.length <= 40 && CLOCK_TEXT_RE.test(txt);
}

// Coleta St.Labels sob o stage, pulando subarvores em `skip` (popup do calendario, notificacoes, nossa coluna).
function stageLabels(skip) {
  const out = [];
  (function walk(a) {
    for (const c of a.get_children()) {
      if (skip.has(c)) continue;
      if (c instanceof St.Label) out.push(c);
      walk(c);
    }
  })(global.stage);
  return out;
}

// Clutter 14 (GNOME 46) renomeou actor-added/-removed para child-added/-removed.
function connectFirst(obj, signals, callback) {
  for (const sig of signals) {
    if (GObject.signal_lookup(sig, obj.constructor.$gtype))
      return obj.connect(sig, callback);
  }
  return 0;
}

export default class EltobClockExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    // Label gancho -> { ct, textId, destroyId }
    this._labels = new Map();
    this._timeoutId = 0;
    this._ticks = 0;
    this._rescanIdleId = 0;
    this._applying = false;
    this._column = null;

    this._attachPopup();

    this._settingsChangedIds = [
      this._settings.connect('changed::format-string', () => {
        this._updateAll();
        this._column?.refreshClock();
      }),
      this._settings.connect('changed::update-interval', () => this._restartTimer()),
      this._settings.connect('changed::smooth-second', () => this._restartTimer()),
      this._settings.connect('changed::only-topbar', () => {
        this._unhookAll();
        this._restoreDateMenu();
        this._restartTimer();
      }),
      this._settings.connect('changed::menu-style', () => this._applyStyle()),
      this._settings.connect('changed::weather-enabled', () => this._syncWeatherCard()),
      this._settings.connect('changed::weather-auto-location', () => this._syncAutoLocation()),
    ];
    // Filhos do stage vem e vao com paineis e docks; olhar de novo quando ocioso.
    this._stageSignalIds = [['child-added', 'actor-added'], ['child-removed', 'actor-removed']]
      .map(names => connectFirst(global.stage, names, () => this._queueRescan()))
      .filter(id => id);
    this._restartTimer();
  }

  disable() {
    this._clearTimer();
    if (this._rescanIdleId) {
      GLib.source_remove(this._rescanIdleId);
      this._rescanIdleId = 0;
    }
    for (const id of this._stageSignalIds)
      global.stage.disconnect(id);
    this._stageSignalIds = null;
    for (const id of this._settingsChangedIds)
      this._settings.disconnect(id);
    this._settingsChangedIds = null;

    this._detachPopup();
    this._unhookAll();
    this._labels = null;
    this._restoreDateMenu();
    this._settings = null;
  }

  // ── Popup do relogio ──────────────────────────────────────────────
  _attachPopup() {
    const dm = this._dateMenu();
    if (!dm?._messageList || !dm?._displaysSection) {
      console.warn('[Eltob Clock] popup do relogio nao reconhecido (GNOME mudou?); so o texto da barra foi trocado.');
      return;
    }
    this._dm = dm;
    this._state = new ClockState(this._settings);

    // Reaproveita o cliente de clima do proprio GNOME (libgweather + GeoClue); sem rede nem local proprios.
    this._ownsClient = !dm._weatherItem?._weatherClient;
    this._client = dm._weatherItem?._weatherClient ?? new WeatherClient();
    this._syncAutoLocation();

    const copyTime = () => {
      try {
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, formatNow(this._settings.get_string('format-string')));
        Main.notify('Eltob Clock', 'Hora copiada para a área de transferência');
      } catch (e) {
        console.error(`[Eltob Clock] copiar: ${e.message}`);
      }
    };
    const openPrefs = () => {
      dm.menu.close();
      Promise.resolve(this.openPreferences())
        .catch(e => console.warn(`[Eltob Clock] nao abriu as preferencias: ${e.message}`));
    };
    const openAbout = () => {
      this._settings.set_string('prefs-page', 'about');
      openPrefs();
    };

    this._column = new PopupColumn({
      settings: this._settings,
      state: this._state,
      copyTime,
      openPrefs,
      openAbout,
      onPresetApplied: p => Main.notify('Eltob Clock', `Formato aplicado: ${p.label}`),
    });
    dm._messageList.get_parent().add_child(this._column.actor);

    // Eventos e relogios mundiais saem; o clima nativo e trocado pelo nosso cartao (abaixo do calendario).
    this._displaysVisibleId = dm._displaysSection.connect('notify::visible', () => {
      if (dm._displaysSection.visible)
        dm._displaysSection.hide();
    });
    dm._displaysSection.hide();
    this._syncWeatherCard();

    this._menuOpenId = dm.menu.connect('open-state-changed', (_menu, open) => {
      if (open) {
        this._client.update();
        this._column.onOpen();
      } else {
        this._column.onClose();
      }
    });

    this._pills = new BarPills(dm, this._state, this._client, this._settings);
    this._applyStyle();
  }

  _detachPopup() {
    const dm = this._dm;
    if (!dm) return;
    if (this._menuOpenId) dm.menu.disconnect(this._menuOpenId);
    if (this._displaysVisibleId) dm._displaysSection.disconnect(this._displaysVisibleId);
    this._menuOpenId = 0;
    this._displaysVisibleId = 0;
    this._pills?.destroy();
    this._pills = null;
    this._weatherCard?.destroy();
    this._weatherCard = null;
    this._column?.destroy();
    this._column = null;
    this._state?.destroy();
    this._state = null;
    // Devolve as secoes nativas (eventos, relogios, clima).
    dm._displaysSection.visible = Main.sessionMode.allowSettings;
    if (this._ownsClient) this._client = null;
    this._dm = null;
  }

  _syncWeatherCard() {
    const dm = this._dm;
    if (!dm) return;
    const want = this._settings.get_boolean('weather-enabled');
    if (want && !this._weatherCard) {
      this._weatherCard = new WeatherCard(this._client);
      dm._displaysSection.get_parent().add_child(this._weatherCard.actor);
      this._applyStyle();
    } else if (!want && this._weatherCard) {
      this._weatherCard.destroy();
      this._weatherCard = null;
    }
  }

  // Liga a localizacao automatica do clima do GNOME (GeoClue) quando o usuario pede.
  _syncAutoLocation() {
    if (!this._settings.get_boolean('weather-auto-location')) return;
    try {
      const ws = new Gio.Settings({ schema_id: 'org.gnome.shell.weather' });
      if (!ws.get_boolean('automatic-location'))
        ws.set_boolean('automatic-location', true);
    } catch (e) {
      console.warn(`[Eltob Clock] localizacao automatica: ${e.message}`);
    }
  }

  _applyStyle() {
    const cls = STYLE_CLASS[this._settings.get_string('menu-style')] ?? '';
    this._column?.setStyleClass(cls);
    this._weatherCard?.setStyleClass(cls);
  }

  // ── Texto do relogio da barra ─────────────────────────────────────
  _dateMenu() {
    return Main.panel?.statusArea?.dateMenu ?? null;
  }

  _candidateLabels() {
    const out = [];
    const dm = this._dateMenu();
    if (dm?._clockDisplay instanceof St.Label)
      out.push(dm._clockDisplay);
    if (this._settings.get_boolean('only-topbar'))
      return out;
    const skip = new Set([Main.messageTray]);
    if (this._column) skip.add(this._column.actor);
    if (dm?.menu?.actor)
      skip.add(dm.menu.actor);
    for (const lab of stageLabels(skip)) {
      if (!this._labels.has(lab) && looksLikeClock(lab))
        out.push(lab);
    }
    return out;
  }

  _scan() {
    for (const lab of this._candidateLabels())
      this._hook(lab);
  }

  _queueRescan() {
    if (this._rescanIdleId || this._settings.get_boolean('only-topbar'))
      return;
    this._rescanIdleId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
      this._rescanIdleId = 0;
      this._scan();
      this._updateAll();
      return GLib.SOURCE_REMOVE;
    });
  }

  _hook(lab) {
    if (this._labels.has(lab)) return;
    const ct = lab.clutter_text;
    const entry = { ct, textId: 0, destroyId: 0 };
    // So texto puro: nunca deixar o formato injetar markup Pango.
    ct.set_use_markup(false);
    // O shell reescreve o texto do relogio no horario dele; coloca o nosso de volta.
    entry.textId = ct.connect('notify::text', () => {
      if (!this._applying)
        this._apply(lab);
    });
    entry.destroyId = lab.connect('destroy', () => this._labels?.delete(lab));
    this._labels.set(lab, entry);
    this._apply(lab);
  }

  _unhookAll() {
    for (const [lab, e] of this._labels) {
      e.ct.disconnect(e.textId);
      lab.disconnect(e.destroyId);
    }
    this._labels.clear();
  }

  _apply(lab) {
    const text = formatNow(this._settings.get_string('format-string'));
    if (lab.get_text() === text) return;
    this._applying = true;
    try {
      lab.set_text(text);
    } finally {
      this._applying = false;
    }
  }

  _updateAll() {
    for (const lab of this._labels.keys())
      this._apply(lab);
  }

  _tick() {
    if (this._ticks++ % RESCAN_TICKS === 0 || this._labels.size === 0)
      this._scan();
    this._updateAll();
  }

  _clearTimer() {
    if (this._timeoutId) {
      GLib.source_remove(this._timeoutId);
      this._timeoutId = 0;
    }
  }

  _restartTimer() {
    this._clearTimer();
    this._ticks = 0;
    this._tick();
    const sec = Math.max(1, this._settings.get_int('update-interval'));
    if (this._settings.get_boolean('smooth-second'))
      this._scheduleAligned(sec);
    else
      this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, sec, () => {
        this._tick();
        return GLib.SOURCE_CONTINUE;
      });
  }

  // Dispara logo apos cada virada de segundo. timeout_add_seconds() nao serve aqui: o GLib o desloca
  // por um offset da sessao, e os segundos mostrados atrasariam ate 1 s em relacao aos reais.
  _scheduleAligned(sec) {
    const ms = Math.floor(GLib.get_real_time() / 1000) % 1000;
    this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, sec * 1000 - ms + 5, () => {
      this._tick();
      this._scheduleAligned(sec);
      return GLib.SOURCE_REMOVE;
    });
  }

  // Devolve o texto original do GNOME na hora, sem esperar o proximo tick.
  _restoreDateMenu() {
    const dm = this._dateMenu();
    if (dm?._clockDisplay && typeof dm._clock?.clock === 'string')
      dm._clockDisplay.text = dm._clock.clock;
  }
}
