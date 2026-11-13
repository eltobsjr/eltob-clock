// SPDX-License-Identifier: MIT
// Laboratorio do relogio, parte pura (sem imports do GNOME, testavel com node): o modelo de opcoes,
// a galeria de formatos e a montagem do formato strftime. O que strftime nao sabe escrever (dia ou
// hora por extenso, dia ordinal) vira um marcador {…} que expandTokens() troca por texto antes de o
// GLib formatar o resto.

export const DEFAULT_CFG = {
  dateOn: true, timeOn: true, order: 'dt', joiner: ' ',
  weekday: 'none', day: 'num0', month: 'num0', year: '4', dOrder: 'dmy', dSep: '/',
  hour12: false, hourPad: true, secs: true, ampm: true, tSep: ':', tWords: false,
  week: false, doy: false,
  position: 'center', pill: 'plain',
};

export const CHOICES = {
  order: ['dt', 'td'],
  joiner: [' ', ' · ', ' — ', ' | ', ' • '],
  weekday: ['none', 'short', 'long'],
  day: ['num', 'num0', 'ord', 'words'],
  month: ['num', 'num0', 'short', 'long'],
  year: ['none', '2', '4'],
  dOrder: ['dmy', 'mdy', 'ymd'],
  dSep: ['/', '-', '.', ' ', ' de '],
  tSep: [':', '.', 'h'],
  position: ['center', 'left', 'right'],
  pill: ['plain', 'pill-neutral', 'pill-blue', 'pill-green', 'pill-yellow', 'pill-red'],
};
const BOOLS = ['dateOn', 'timeOn', 'hour12', 'hourPad', 'secs', 'ampm', 'tWords', 'week', 'doy'];

/** Garante um cfg valido: chaves desconhecidas somem, valores fora da lista voltam ao padrao. */
export function cleanCfg(raw) {
  const out = { ...DEFAULT_CFG };
  if (!raw || typeof raw !== 'object') return out;
  for (const k of BOOLS) if (typeof raw[k] === 'boolean') out[k] = raw[k];
  for (const [k, list] of Object.entries(CHOICES)) if (list.includes(raw[k])) out[k] = raw[k];
  return out;
}

export function parseCfg(json) {
  try { return cleanCfg(JSON.parse(json)); } catch { return cleanCfg(null); }
}

// ── Montagem do formato ─────────────────────────────────────────────
const WEEKDAY = { short: '%a', long: '%A' };
const MONTH = { num: '%-m', num0: '%m', short: '%b', long: '%B' };
const YEAR = { '2': '%y', '4': '%Y' };
const DAY = { num: '%-d', num0: '%d', ord: '{dia:ordinal}', words: '{dia:extenso}' };

export const dayFmt = c => DAY[c.day];
export const monthFmt = c => MONTH[c.month];
export const yearFmt = c => YEAR[c.year] ?? '';
export const weekdayFmt = c => WEEKDAY[c.weekday] ?? '';

export function coreDateFmt(c) {
  const d = dayFmt(c), m = monthFmt(c), y = yearFmt(c);
  const seq = c.dOrder === 'dmy' ? [d, m, y] : c.dOrder === 'mdy' ? [m, d, y] : [y, m, d];
  return seq.filter(Boolean).join(c.dSep);
}

export function extrasFmt(c, lang = 'pt') {
  const o = [];
  if (c.week) o.push(`${lang === 'pt' ? 'S' : 'W'}%V`);
  if (c.doy) o.push(`${lang === 'pt' ? 'dia' : 'day'} %-j`);
  return o.join(' ');
}

export function dateFmt(c, lang = 'pt') {
  let out = '';
  if (c.dateOn) {
    const wd = weekdayFmt(c), core = coreDateFmt(c);
    out = wd ? (core ? wd + (c.weekday === 'long' ? ', ' : ' ') + core : wd) : core;
  }
  return [out, extrasFmt(c, lang)].filter(Boolean).join(' ');
}

export function timeFmt(c) {
  if (!c.timeOn) return '';
  if (c.tWords) return `{${c.hour12 ? 'hora12' : 'hora'}:extenso${c.secs ? '+s' : ''}}`;
  const h = c.hour12 ? (c.hourPad ? '%I' : '%-I') : (c.hourPad ? '%H' : '%-H');
  let out = c.tSep === 'h' ? `${h}h%M${c.secs ? 'm%Ss' : ''}` : `${h}${c.tSep}%M${c.secs ? `${c.tSep}%S` : ''}`;
  if (c.hour12 && c.ampm) out += ' %p';
  return out;
}

/** Formato completo (strftime com marcadores) para a configuracao inteira. */
export function buildFormat(cfg, lang = 'pt') {
  const c = cleanCfg(cfg);
  const seq = (c.order === 'dt' ? [dateFmt(c, lang), timeFmt(c)] : [timeFmt(c), dateFmt(c, lang)]).filter(Boolean);
  return seq.join(c.joiner) || '%H:%M';
}

export const usesTokens = fmt => /\{(dia|hora|hora12):[a-z]+(\+s)?\}/.test(fmt || '');

// ── Palavras ────────────────────────────────────────────────────────
const NW = {
  pt: ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
    'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'],
  en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
    'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'],
};
const TENS = {
  pt: ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta'],
  en: ['', '', 'twenty', 'thirty', 'forty', 'fifty'],
};

/** Numero de 0 a 59 por extenso. */
export function numWords(n, lang) {
  if (n < 20) return NW[lang][n];
  const t = TENS[lang][Math.floor(n / 10)], u = n % 10;
  return u ? t + (lang === 'pt' ? ' e ' : '-') + NW[lang][u] : t;
}

const feminine = s => s.replace(/(^| e )um$/, '$1uma').replace(/(^| e )dois$/, '$1duas');

function ordinalSuffix(n) {
  const m = n % 100;
  if (m >= 11 && m <= 13) return 'th';
  return ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] ?? 'th';
}

export function dayWords(day, lang) {
  return lang === 'pt' ? (day === 1 ? 'primeiro' : numWords(day, 'pt')) : numWords(day, 'en');
}

export function dayOrdinal(day, lang) {
  return lang === 'pt' ? (day === 1 ? '1º' : String(day)) : day + ordinalSuffix(day);
}

/** p = { hour (0-23), minute, second }; opts = { hour12, secs }. */
export function timeWords(p, opts, lang) {
  const h = opts.hour12 ? (p.hour % 12 || 12) : p.hour;
  const { minute: m, second: s } = p;
  if (lang === 'pt') {
    const hw = feminine(numWords(h, 'pt'));
    const hp = `${hw} ${h === 1 ? 'hora' : 'horas'}`;
    const mp = m === 0 ? '' : (m === 1 ? 'um minuto' : `${numWords(m, 'pt')} minutos`);
    const sp = opts.secs ? (s === 1 ? 'um segundo' : `${numWords(s, 'pt')} segundos`) : '';
    const rest = [mp, sp].filter(Boolean);
    let out = hp;
    if (rest.length === 0) out += ' em ponto';
    else if (rest.length === 1) out += ` e ${rest[0]}`;
    else out += `, ${rest[0]} e ${rest[1]}`;
    if (opts.hour12) out += p.hour < 12 ? ' da manhã' : p.hour < 18 ? ' da tarde' : ' da noite';
    return out;
  }
  let out = numWords(h, 'en') + (m === 0 ? " o'clock" : ` ${m < 10 ? 'oh ' : ''}${numWords(m, 'en')}`);
  if (opts.secs) out += ` and ${numWords(s, 'en')} seconds`;
  if (opts.hour12) out += p.hour < 12 ? ' AM' : ' PM';
  return out;
}

/** Troca os marcadores {dia:…} e {hora:…} por texto. p = { day, hour, minute, second }. */
export function expandTokens(fmt, p, lang = 'pt') {
  return fmt.replace(/\{(dia|hora|hora12):([a-z]+)(\+s)?\}/g, (whole, what, how, secs) => {
    if (what === 'dia') return how === 'ordinal' ? dayOrdinal(p.day, lang) : how === 'extenso' ? dayWords(p.day, lang) : whole;
    if (how !== 'extenso') return whole;
    return timeWords(p, { hour12: what === 'hora12', secs: !!secs }, lang);
  });
}

/** O formato mostra segundos? (inclui o marcador de hora por extenso com segundos) */
export const tokensShowSeconds = fmt => /\{hora(12)?:extenso\+s\}/.test(fmt || '');

// ── Galeria ─────────────────────────────────────────────────────────
const P = o => cleanCfg({ ...DEFAULT_CFG, ...o });

/** Formatos de um clique. `interval` = segundos entre atualizacoes quando nao ha segundos no formato. */
export const GALLERY = [
  { id: 'padrao', name: 'Padrão Eltob', hint: 'Data e hora numéricas, com segundos', cfg: P({}) },
  { id: 'iso', name: 'ISO 8601', hint: 'Ano primeiro, bom para ordenar', cfg: P({ dOrder: 'ymd', dSep: '-', joiner: ' ' }) },
  { id: 'curto', name: 'Extenso curto', hint: 'Dia da semana e mês abreviados', cfg: P({ weekday: 'short', day: 'num', month: 'short', year: 'none', dSep: ' ', joiner: ' · ', secs: false }) },
  { id: 'extenso', name: 'Por extenso', hint: 'Data completa e hora', cfg: P({ weekday: 'long', day: 'num', month: 'long', dSep: ' de ', joiner: ' — ', secs: false }) },
  { id: 'hora', name: 'Só a hora', hint: 'Hora numa pílula azul', cfg: P({ dateOn: false, pill: 'pill-blue' }) },
  { id: 'us', name: 'Americano 12 h', hint: 'Mês primeiro, AM/PM', cfg: P({ dOrder: 'mdy', hour12: true, hourPad: false, secs: false }) },
  { id: 'td', name: 'Hora e data', hint: 'Hora primeiro, data curta depois', cfg: P({ order: 'td', year: '2', secs: false, joiner: ' · ' }) },
  { id: 'horaext', name: 'Hora em palavras', hint: '“dezessete horas e dois minutos”', cfg: P({ dateOn: false, tWords: true, secs: false }) },
  { id: 'dataext', name: 'Data em palavras', hint: 'Dia por extenso e hora', cfg: P({ weekday: 'long', day: 'words', month: 'long', year: 'none', dSep: ' de ', joiner: ' · ', secs: false }) },
  { id: 'semana', name: 'Semana ISO', hint: 'Ano-mês-dia e número da semana', cfg: P({ dOrder: 'ymd', dSep: '-', week: true, secs: false, joiner: ' ' }) },
  { id: 'doy', name: 'Dia do ano', hint: 'Quantos dias já passaram', cfg: P({ dateOn: false, doy: true, secs: false, joiner: ' · ', pill: 'pill-neutral' }) },
  { id: 'h', name: 'Hora com h', hint: 'Estilo brasileiro: 17h02', cfg: P({ weekday: 'short', day: 'num', month: 'short', year: 'none', dSep: ' ', joiner: ' · ', tSep: 'h', secs: false }) },
  { id: 'estacao', name: 'Relógio de estação', hint: 'Pontos no lugar dos dois-pontos', cfg: P({ dateOn: false, tSep: '.', pill: 'pill-neutral' }) },
  { id: 'ordinal', name: 'Ordinal', hint: 'Dia 1º e mês por extenso', cfg: P({ day: 'ord', month: 'long', year: 'none', dSep: ' de ', joiner: ' · ', secs: false, pill: 'pill-green' }) },
  { id: 'esq', name: 'À esquerda', hint: 'Relógio ao lado de Atividades', cfg: P({ position: 'left', weekday: 'short', day: 'num', month: 'short', year: 'none', dSep: ' ', joiner: ' · ', secs: false }) },
  { id: 'quente', name: 'Destaque quente', hint: 'Pílula amarela só com a hora', cfg: P({ dateOn: false, pill: 'pill-yellow', secs: false }) },
];

export const sameCfg = (a, b) => JSON.stringify(cleanCfg(a)) === JSON.stringify(cleanCfg(b));
