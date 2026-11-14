// SPDX-License-Identifier: MIT
// Composicao da barra: monta, ao lado do relogio, os blocos que o usuario escolheu nas preferencias
// (hora ou data com formato proprio, timer, cronometro, clima, texto livre), cada um como texto ou pilula.
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { formatNow } from './presets.js';
import { formatDuration, timerLevel } from './timerlogic.js';
import { cleanBar, parseBlock } from './layoutlogic.js';
import { weatherPillData } from './weatherview.js';
import { setShown } from './anim.js';

const PILL_CLASS = {
  'pill-neutral': 'ec-pill-neutral',
  'pill-blue': 'ec-pill-blue',
  'pill-green': 'ec-pill-ok',
  'pill-yellow': 'ec-pill-warn',
  'pill-red': 'ec-pill-crit',
};

/** Classes de estilo de um bloco; `level` ('ok'|'warn'|'crit') so importa no estilo "auto" do timer. */
export function styleClassFor(style, level = 'ok') {
  if (style === 'plain') return 'ec-bar-plain';
  if (style === 'auto') return `ec-pill ec-pill-${level}`;
  return `ec-pill ${PILL_CLASS[style] ?? 'ec-pill-neutral'}`;
}

class Block {
  constructor(spec, ctx) {
    this.spec = spec;
    this.ctx = ctx;
    this.actor = this._build();
    this.actor.y_align = Clutter.ActorAlign.CENTER;
  }

  _label(text = '') {
    return new St.Label({ text, y_align: Clutter.ActorAlign.CENTER, style_class: styleClassFor(this.spec.style) });
  }

  _build() {
    const { kind, payload } = this.spec;
    if (kind === 'weather') {
      const box = new St.BoxLayout({ style_class: `${styleClassFor(this.spec.style)} ec-pill-wx` });
      this._icon = new St.Icon({ icon_size: 14, style_class: 'ec-pill-icon', y_align: Clutter.ActorAlign.CENTER });
      this._text = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
      box.add_child(this._icon);
      box.add_child(this._text);
      return box;
    }
    return this._label(kind === 'text' ? payload : '');
  }

  /** Atualiza texto e visibilidade a partir do estado atual. */
  update() {
    const { kind, style, payload } = this.spec;
    const { state, settings, client } = this.ctx;
    switch (kind) {
      case 'time':
        this.actor.text = formatNow(payload || settings.get_string('format-string'));
        break;
      case 'text':
        break;
      case 'stopwatch': {
        const on = state.sw.running || state.sw.accumulated > 0;
        setShown(this.actor, on, 'h');
        if (on) this.actor.text = `⏱ ${formatDuration(state.swElapsed())}${state.sw.running ? '' : ' ⏸'}`;
        break;
      }
      case 'timer': {
        const on = state.tm.state !== 'idle';
        setShown(this.actor, on, 'h');
        if (on) {
          const paused = state.tm.state === 'paused';
          const level = paused ? 'neutral' : timerLevel(state.tmFraction());
          this.actor.style_class = style === 'auto' ? styleClassFor('auto', level) : styleClassFor(style);
          this.actor.text = `⏳ ${formatDuration(state.tmRemainingShown())}${paused ? ' ⏸' : ''}`;
        }
        break;
      }
      case 'weather': {
        const d = weatherPillData(client);
        setShown(this.actor, !!d, 'h');
        if (d) {
          this._icon.icon_name = d.icon;
          this._icon.visible = true;
          this._text.visible = payload !== 'icon';
          this._text.text = payload === 'full' ? `${d.temp} ${d.conditions ?? ''}`.trim() : d.temp;
        }
        break;
      }
    }
  }
}

export class BarComposer {
  /** @param dateMenu o botao do relogio do shell; os blocos entram no lugar do texto original da hora. */
  constructor(dateMenu, state, weatherClient, settings) {
    this._dm = dateMenu;
    this._state = state;
    this._client = weatherClient;
    this._settings = settings;

    const box = dateMenu._clockDisplay.get_parent();
    this.actor = new St.BoxLayout({ style_class: 'ec-bar', y_align: Clutter.ActorAlign.CENTER });
    box.insert_child_above(this.actor, dateMenu._clockDisplay);
    // O texto original do GNOME fica escondido (continua existindo: o shell escreve nele).
    dateMenu._clockDisplay.hide();

    this._blocks = [];
    this._rebuild();

    this._unsub = state.connectChange(() => this.update());
    this._clientId = weatherClient?.connect('changed', () => this.update()) ?? 0;
    this._settingsIds = ['changed::bar-layout', 'changed::format-string']
      .map(sig => this._settings.connect(sig, () => (sig.endsWith('bar-layout') ? this._rebuild() : this.update())));
  }

  _spec() {
    return cleanBar(this._settings.get_strv('bar-layout')).map(parseBlock);
  }

  _rebuild() {
    for (const b of this._blocks) b.actor.destroy();
    this._blocks = this._spec().map(spec => new Block(spec, { state: this._state, settings: this._settings, client: this._client }));
    for (const b of this._blocks) this.actor.add_child(b.actor);
    this.update();
  }

  /** Algum bloco de hora mostra segundos? Decide se o relogio precisa andar a cada segundo. */
  showsSeconds(formatShowsSeconds) {
    const global = this._settings.get_string('format-string');
    return this._blocks.some(b => b.spec.kind === 'time' && formatShowsSeconds(b.spec.payload || global));
  }

  update() {
    for (const b of this._blocks) b.update();
  }

  destroy() {
    this._unsub?.();
    if (this._clientId) {
      try { this._client.disconnect(this._clientId); } catch {}
    }
    for (const id of this._settingsIds) this._settings.disconnect(id);
    this.actor.destroy();
    this._dm._clockDisplay.show();
  }
}
