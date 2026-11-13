// SPDX-License-Identifier: MIT
// Pilulas na barra, ao lado do relogio: timer, cronometro e temperatura (so aparecem quando ha o que mostrar).
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { formatDuration } from './timerlogic.js';
import { timerLevel } from './popup.js';
import { weatherPillData } from './weatherview.js';

function pill(extra = '') {
  return new St.Label({ style_class: `ec-pill ${extra}`.trim(), y_align: Clutter.ActorAlign.CENTER, visible: false });
}

export class BarPills {
  /** @param dateMenu o botao do relogio do shell; as pilulas entram logo apos o texto da hora. */
  constructor(dateMenu, state, weatherClient, settings) {
    this._state = state;
    this._client = weatherClient;
    this._settings = settings;

    const box = dateMenu._clockDisplay.get_parent();
    this.actor = new St.BoxLayout({ style_class: 'ec-pills', y_align: Clutter.ActorAlign.CENTER });
    box.insert_child_above(this.actor, dateMenu._clockDisplay);

    this._sw = pill('ec-pill-blue');
    this._tm = pill();
    this._wx = new St.BoxLayout({ style_class: 'ec-pill ec-pill-neutral ec-pill-wx', y_align: Clutter.ActorAlign.CENTER, visible: false });
    this._wxIcon = new St.Icon({ icon_size: 13, style_class: 'ec-pill-icon', y_align: Clutter.ActorAlign.CENTER });
    this._wxText = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
    this._wx.add_child(this._wxIcon);
    this._wx.add_child(this._wxText);
    for (const w of [this._sw, this._tm, this._wx]) this.actor.add_child(w);

    this._unsub = state.connectChange(() => this.update());
    this._clientId = weatherClient?.connect('changed', () => this.update()) ?? 0;
    this._settingsIds = ['changed::bar-pills', 'changed::weather-bar-pill', 'changed::weather-enabled']
      .map(sig => settings.connect(sig, () => this.update()));
    this.update();
  }

  update() {
    const s = this._state;
    const showRun = this._settings.get_boolean('bar-pills');

    const swOn = showRun && (s.sw.running || s.sw.accumulated > 0);
    this._sw.visible = swOn;
    if (swOn) this._sw.text = `⏱ ${formatDuration(s.swElapsed())}${s.sw.running ? '' : ' ⏸'}`;

    const tmOn = showRun && s.tm.state !== 'idle';
    this._tm.visible = tmOn;
    if (tmOn) {
      const paused = s.tm.state === 'paused';
      const level = paused ? 'neutral' : { ok: 'ok', warn: 'warn', crit: 'crit' }[timerLevel(s.tmFraction())];
      this._tm.style_class = `ec-pill ec-pill-${level}`;
      this._tm.text = `⏳ ${formatDuration(s.tmRemainingShown())}${paused ? ' ⏸' : ''}`;
    }

    const wx = this._settings.get_boolean('weather-enabled') && this._settings.get_boolean('weather-bar-pill')
      ? weatherPillData(this._client) : null;
    this._wx.visible = !!wx;
    if (wx) {
      this._wxIcon.icon_name = wx.icon;
      this._wxText.text = wx.temp;
    }
  }

  destroy() {
    this._unsub?.();
    if (this._clientId) {
      try { this._client.disconnect(this._clientId); } catch {}
    }
    for (const id of this._settingsIds) this._settings.disconnect(id);
    this.actor.destroy();
  }
}
