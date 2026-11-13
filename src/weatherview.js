// SPDX-License-Identifier: MIT
// Cartao de clima do popup e dados para a pilula da barra. Usa o WeatherClient nativo do GNOME Shell
// (libgweather + GeoClue): nenhuma chamada de rede nem localizacao propria desta extensao.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GWeather from 'gi://GWeather';
import Pango from 'gi://Pango';
import St from 'gi://St';
import { fadeIn } from './anim.js';

const MAX_HOURS = 5;

function tempText(info) {
  try {
    const [ok, v] = info.get_value_temp(GWeather.TemperatureUnit.DEFAULT);
    return ok ? `${Math.round(v)}°` : null;
  } catch {
    return null;
  }
}

/** Dados curtos para a pilula da barra: { icon, temp } ou null quando nao ha clima valido. */
export function weatherPillData(client) {
  try {
    if (!client?.available || !client.hasLocation || client.loading) return null;
    const info = client.info;
    if (!info?.is_valid()) return null;
    const temp = tempText(info);
    return temp ? { icon: info.get_symbolic_icon_name(), temp, conditions: clean(info.get_conditions() || info.get_sky()) } : null;
  } catch {
    return null;
  }
}

function locationName(loc) {
  const name = loc.get_name();
  if (loc.get_level() === GWeather.LocationLevel.CITY || !loc.has_coords())
    return name;
  const city = GWeather.Location.get_world().find_nearest_city(...loc.get_coords());
  const cityName = city.get_name();
  return name.includes(cityName) ? cityName : name;
}

// Proximas previsoes, no maximo uma por hora (mesma regra do clima nativo).
function nextForecasts(info) {
  const out = [];
  const now = GLib.DateTime.new_now_local();
  let last = GLib.DateTime.new_from_unix_local(0);
  for (const fc of info.get_forecast_list()) {
    const [valid, ts] = fc.get_value_update();
    if (!valid || ts === 0) continue;
    const dt = GLib.DateTime.new_from_unix_local(ts);
    if (now.difference(dt) > 0) continue;
    if (dt.difference(last) < GLib.TIME_SPAN_HOUR) continue;
    out.push([dt, fc]);
    if (out.length === MAX_HOURS) break;
    last = dt;
  }
  return out;
}

function clean(text) {
  const t = (text ?? '').toString().trim();
  return !t || /^(unknown|desconhecid)/i.test(t) ? '—' : t;
}

function label(text, styleClass) {
  const l = new St.Label({ text, style_class: styleClass });
  l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
  return l;
}

export class WeatherCard {
  constructor(client, size = 'normal') {
    this._client = client;
    this._compact = size === 'compact';
    this.actor = new St.BoxLayout({
      style_class: 'ec-card ec-weather',
      orientation: Clutter.Orientation.VERTICAL,
      x_expand: true,
      y_expand: true,
    });
    this._body = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_expand: true, style_class: 'ec-weather-body' });
    this.actor.add_child(this._body);
    this._lastKey = null;
    this._changedId = client.connect('changed', () => this.refresh());
    this.refresh();
  }

  setStyleClass(cls) {
    for (const c of ['ec-style-light', 'ec-style-dark'])
      this.actor.remove_style_class_name(c);
    if (cls) this.actor.add_style_class_name(cls);
  }

  update() {}
  onOpen() {}
  onClose() {}

  // Estado atual do clima como uma chave curta: o conteudo so reaparece com fade quando ela muda.
  _stateKey() {
    const c = this._client;
    if (!c.available) return 'sem-app';
    if (!c.hasLocation) return 'sem-local';
    if (c.loading) return 'carregando';
    return c.info?.is_valid() ? 'ok' : (c.info?.network_error() ? 'sem-rede' : 'indisponivel');
  }

  refresh() {
    this._body.destroy_all_children();
    const c = this._client;
    const key = this._stateKey();
    this._body.add_child(this._header());

    if (key === 'sem-app') {
      this._message('O GNOME Weather não está instalado.');
    } else if (key === 'sem-local') {
      this._message('Sem local definido para o clima.', 'Escolher local…', () => c.activateApp());
    } else if (key === 'carregando') {
      this._message('Carregando…');
    } else if (key === 'sem-rede') {
      this._message('Sem rede para buscar o clima.');
    } else if (key === 'indisponivel') {
      this._message('Clima indisponível agora.');
    } else {
      const info = c.info;
      this._current(info);
      if (!this._compact) {
        this._hourly(info);
        this._chips(info);
      }
    }
    if (key !== this._lastKey) fadeIn(this._body);
    this._lastKey = key;
  }

  _header() {
    const row = new St.BoxLayout({ style_class: 'ec-row' });
    row.add_child(new St.Label({ text: 'Clima', style_class: 'ec-title', x_expand: true }));
    if (this._client.hasLocation) {
      try {
        row.add_child(label(locationName(this._client.info.location), 'ec-dim ec-small'));
      } catch {}
    }
    return row;
  }

  _message(text, actionText = null, action = null) {
    const box = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, y_expand: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'ec-col-gap' });
    const l = label(text, 'ec-dim');
    l.x_align = Clutter.ActorAlign.CENTER;
    box.add_child(l);
    if (actionText) {
      const b = new St.Button({ label: actionText, style_class: 'ec-btn', can_focus: true, x_align: Clutter.ActorAlign.CENTER });
      b.connect('clicked', action);
      box.add_child(b);
    }
    this._body.add_child(box);
  }

  _current(info) {
    const row = new St.BoxLayout({ style_class: 'ec-row ec-weather-now', y_align: Clutter.ActorAlign.CENTER });
    row.add_child(new St.Icon({ icon_name: info.get_symbolic_icon_name(), style_class: 'ec-weather-icon', icon_size: 34 }));
    const mid = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true });
    mid.add_child(new St.Label({ text: tempText(info) ?? '—', style_class: 'ec-weather-temp' }));
    const cond = new St.Label({ text: clean(info.get_conditions() || info.get_sky()), style_class: 'ec-dim ec-small' });
    cond.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    mid.add_child(cond);
    row.add_child(mid);
    try {
      const [okMax, max] = info.get_value_temp_max(GWeather.TemperatureUnit.DEFAULT);
      const [okMin, min] = info.get_value_temp_min(GWeather.TemperatureUnit.DEFAULT);
      if (okMax && okMin) {
        const mm = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, y_align: Clutter.ActorAlign.CENTER, style_class: 'ec-weather-minmax' });
        mm.add_child(new St.Label({ text: `máx ${Math.round(max)}°`, style_class: 'ec-dim ec-small' }));
        mm.add_child(new St.Label({ text: `mín ${Math.round(min)}°`, style_class: 'ec-dim ec-small' }));
        row.add_child(mm);
      }
    } catch {}
    this._body.add_child(row);
  }

  _hourly(info) {
    const list = nextForecasts(info);
    if (list.length === 0) return;
    const row = new St.BoxLayout({ style_class: 'ec-hours', x_expand: true });
    for (const [dt, fc] of list) {
      const col = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true, style_class: 'ec-hour' });
      const hh = dt.format('%Hh');
      col.add_child(new St.Label({ text: hh, style_class: 'ec-dim ec-small', x_align: Clutter.ActorAlign.CENTER }));
      col.add_child(new St.Icon({ icon_name: fc.get_symbolic_icon_name(), icon_size: 16, style_class: 'ec-hour-icon', x_align: Clutter.ActorAlign.CENTER }));
      col.add_child(new St.Label({ text: tempText(fc) ?? '—', style_class: 'ec-hour-temp', x_align: Clutter.ActorAlign.CENTER }));
      row.add_child(col);
    }
    this._body.add_child(row);
  }

  _chips(info) {
    const row = new St.BoxLayout({ style_class: 'ec-chips', x_expand: true });
    const chip = (title, value) => {
      const b = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true, style_class: 'ec-chip-box' });
      b.add_child(label(title, 'ec-dim ec-small'));
      b.add_child(label(value, 'ec-chip-value'));
      row.add_child(b);
    };
    chip('Sensação', clean(info.get_apparent()));
    chip('Vento', clean(info.get_wind()));
    chip('Umidade', clean(info.get_humidity()));
    this._body.add_child(row);
  }

  destroy() {
    try { this._client.disconnect(this._changedId); } catch {}
    this.actor.destroy();
  }
}
