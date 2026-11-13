// Testes do laboratorio do relogio (parte pura). Uso: node tools/tests/clockfmt.test.mjs
import assert from 'node:assert/strict';
import * as F from '../../src/clockfmt.js';

let n = 0;
function t(name, fn) { fn(); n++; console.log(`PASS ${name}`); }

t('o padrao reproduz o formato do Eltob Clock', () => {
  assert.equal(F.buildFormat(F.DEFAULT_CFG), '%d/%m/%Y %H:%M:%S');
});

t('cleanCfg descarta lixo e mantem valores validos', () => {
  const c = F.cleanCfg({ month: 'long', day: 'xx', secs: 'sim', position: 'right', bobagem: 1 });
  assert.equal(c.month, 'long');
  assert.equal(c.day, 'num0');
  assert.equal(c.secs, true);
  assert.equal(c.position, 'right');
  assert.ok(!('bobagem' in c));
  assert.deepEqual(F.parseCfg('nao e json'), F.DEFAULT_CFG);
  assert.deepEqual(F.parseCfg(''), F.DEFAULT_CFG);
});

t('data por extenso e ordem da hora', () => {
  const f = F.buildFormat({ weekday: 'long', day: 'num', month: 'long', dSep: ' de ', secs: false, joiner: ' — ' });
  assert.equal(f, '%A, %-d de %B de %Y — %H:%M');
  assert.equal(F.buildFormat({ order: 'td', secs: false, joiner: ' · ', year: '2' }), '%H:%M · %d/%m/%y');
});

t('so data, so hora e nada ligado', () => {
  assert.equal(F.buildFormat({ timeOn: false }), '%d/%m/%Y');
  assert.equal(F.buildFormat({ dateOn: false, secs: false }), '%H:%M');
  assert.equal(F.buildFormat({ dateOn: false, timeOn: false }), '%H:%M', 'nunca deixa o relogio vazio');
});

t('12 h, hora com h e extras', () => {
  assert.equal(F.timeFmt(F.cleanCfg({ hour12: true, hourPad: false, secs: false })), '%-I:%M %p');
  assert.equal(F.timeFmt(F.cleanCfg({ tSep: 'h', secs: true })), '%Hh%Mm%Ss');
  assert.equal(F.dateFmt(F.cleanCfg({ dateOn: false, doy: true }), 'pt'), 'dia %-j');
  assert.equal(F.dateFmt(F.cleanCfg({ dOrder: 'ymd', dSep: '-', week: true }), 'en'), '%Y-%m-%d W%V');
});

t('palavras: numeros e horas em portugues', () => {
  assert.equal(F.numWords(0, 'pt'), 'zero');
  assert.equal(F.numWords(17, 'pt'), 'dezessete');
  assert.equal(F.numWords(21, 'pt'), 'vinte e um');
  assert.equal(F.numWords(59, 'pt'), 'cinquenta e nove');
  assert.equal(F.numWords(42, 'en'), 'forty-two');
  const at = (hour, minute, second, o) => F.timeWords({ hour, minute, second }, { hour12: false, secs: false, ...o }, 'pt');
  assert.equal(at(17, 2, 0), 'dezessete horas e dois minutos');
  assert.equal(at(1, 1, 0), 'uma hora e um minuto');
  assert.equal(at(2, 0, 0), 'duas horas em ponto');
  assert.equal(at(21, 30, 9, { secs: true }), 'vinte e uma horas, trinta minutos e nove segundos');
  assert.equal(at(17, 2, 0, { hour12: true }), 'cinco horas e dois minutos da tarde');
  assert.equal(F.timeWords({ hour: 17, minute: 5, second: 0 }, { hour12: false, secs: false }, 'en'), 'seventeen oh five');
});

t('dia ordinal e por extenso', () => {
  assert.equal(F.dayOrdinal(1, 'pt'), '1º');
  assert.equal(F.dayOrdinal(13, 'pt'), '13');
  assert.equal(F.dayOrdinal(22, 'en'), '22nd');
  assert.equal(F.dayOrdinal(11, 'en'), '11th');
  assert.equal(F.dayWords(1, 'pt'), 'primeiro');
  assert.equal(F.dayWords(13, 'pt'), 'treze');
});

t('expandTokens troca os marcadores e deixa o resto para o strftime', () => {
  const p = { day: 1, hour: 17, minute: 2, second: 5 };
  assert.equal(F.expandTokens('{dia:ordinal} de %B', p, 'pt'), '1º de %B');
  assert.equal(F.expandTokens('{hora:extenso} · %d', p, 'pt'), 'dezessete horas e dois minutos · %d');
  assert.equal(F.expandTokens('{hora:extenso+s}', p, 'pt'), 'dezessete horas, dois minutos e cinco segundos');
  assert.equal(F.expandTokens('{hora12:extenso}', p, 'pt'), 'cinco horas e dois minutos da tarde');
  assert.equal(F.expandTokens('{dia:inventado}', p, 'pt'), '{dia:inventado}', 'marcador desconhecido fica como esta');
  assert.equal(F.expandTokens('%H:%M', p, 'pt'), '%H:%M');
});

t('marcadores: deteccao e segundos', () => {
  assert.ok(F.usesTokens('{dia:ordinal} %B'));
  assert.ok(!F.usesTokens('%H:%M'));
  assert.ok(F.tokensShowSeconds('{hora:extenso+s}'));
  assert.ok(!F.tokensShowSeconds('{hora:extenso}'));
});

t('a galeria so tem configuracoes validas, ids unicos e formatos nao vazios', () => {
  const ids = new Set();
  for (const g of F.GALLERY) {
    assert.ok(!ids.has(g.id), `id repetido ${g.id}`);
    ids.add(g.id);
    assert.deepEqual(F.cleanCfg(g.cfg), g.cfg, `${g.id} tem valor fora da lista`);
    assert.ok(F.buildFormat(g.cfg).length > 0);
  }
  assert.ok(F.GALLERY.length >= 16);
  assert.ok(F.sameCfg(F.GALLERY[0].cfg, F.DEFAULT_CFG));
});

console.log(`CLOCKFMT TEST PASSED (${n})`);
