// SPDX-License-Identifier: MIT
// Shared format presets and formatting — no GNOME Shell imports (safe for prefs + extension).
import GLib from 'gi://GLib';
import { expandTokens, tokensShowSeconds } from './clockfmt.js';

export const DEFAULT_FORMAT = '%d/%m/%Y %H:%M:%S';
export const MAX_FORMAT_LENGTH = 128;

/** @typedef {{ id: string, label: string, fmt: string, interval: number, smooth: boolean, onlyTopbar?: boolean }} FormatPreset */

/** @type {FormatPreset[]} */
export const FORMAT_PRESETS = [
  {
    id: 'intl-full',
    label: 'Internacional (DD/MM + segundos)',
    fmt: '%d/%m/%Y %H:%M:%S',
    interval: 1,
    smooth: true,
  },
  {
    id: 'weekday',
    label: 'Dia da semana + segundos',
    fmt: '%A %d/%m/%Y %H:%M:%S',
    interval: 1,
    smooth: true,
  },
  {
    id: 'compact',
    label: 'Compacto (DD/MM HH:MM)',
    fmt: '%d/%m %H:%M',
    interval: 60,
    smooth: false,
  },
  {
    id: 'time-only',
    label: 'Só hora (24 h)',
    fmt: '%H:%M:%S',
    interval: 1,
    smooth: true,
  },
  {
    id: 'iso',
    label: 'ISO 8601',
    fmt: '%Y-%m-%d %H:%M:%S',
    interval: 1,
    smooth: true,
  },
  {
    id: 'iso-week',
    label: 'ISO + número da semana',
    fmt: '%Y-%m-%d W%V %H:%M',
    interval: 60,
    smooth: false,
  },
  {
    id: 'us-12h',
    label: 'Americano 12 h',
    fmt: '%m/%d/%Y %I:%M:%S %p',
    interval: 1,
    smooth: true,
  },
  {
    id: 'topbar-only',
    label: 'Só na barra (DD/MM + segundos)',
    fmt: '%d/%m/%Y %H:%M:%S',
    interval: 1,
    smooth: true,
    onlyTopbar: true,
  },
];

/** Idioma das palavras do laboratorio (hora e dia por extenso): o do sistema, pt ou en. */
export function systemLang() {
  return (GLib.get_language_names()[0] || '').startsWith('pt') ? 'pt' : 'en';
}

// Troca os marcadores {dia:…} e {hora:…} do laboratorio por texto; o resto segue para o strftime.
function expand(fmt, dt) {
  return expandTokens(fmt, {
    day: dt.get_day_of_month(), hour: dt.get_hour(), minute: dt.get_minute(), second: dt.get_second(),
  }, systemLang());
}

/**
 * Format the current local time. GLib returns null (it does not throw) for an
 * invalid format, and an empty format would blank the clock, so both fall back
 * to the default format.
 */
export function formatNow(fmt) {
  const dt = GLib.DateTime.new_now_local();
  let out = null;
  try {
    out = fmt ? dt.format(expand(fmt, dt)) : null;
  } catch {}
  return out || dt.format(DEFAULT_FORMAT);
}

/** True when the format is non-empty and GLib can format it. */
export function isValidFormat(fmt) {
  if (!fmt) return false;
  try {
    const dt = GLib.DateTime.new_now_local();
    return !!dt.format(expand(fmt, dt));
  } catch {
    return false;
  }
}

/** True when the format changes every second, so the clock must tick at 1 s. */
export function formatShowsSeconds(fmt) {
  return /%[-_0^#]?[0-9]*[STsrc]/.test(fmt || '') || tokensShowSeconds(fmt);
}

export function applyPresetToSettings(settings, preset) {
  settings.set_string('format-string', preset.fmt);
  settings.set_int('update-interval', preset.interval);
  settings.set_boolean('smooth-second', preset.smooth);
  if (preset.onlyTopbar !== undefined)
    settings.set_boolean('only-topbar', preset.onlyTopbar);
}
