// Testes das regras de layout. Uso: node tools/tests/layoutlogic.test.mjs
import assert from 'node:assert/strict';
import * as L from '../../src/layoutlogic.js';

let n = 0;
function t(name, fn) { fn(); n++; console.log(`PASS ${name}`); }

t('parseBlock aceita os tipos e normaliza', () => {
  assert.deepEqual(L.parseBlock('time|plain|%H:%M'), { kind: 'time', style: 'plain', payload: '%H:%M' });
  assert.deepEqual(L.parseBlock('time|pill-blue|%a|%d'), { kind: 'time', style: 'pill-blue', payload: '%a|%d' });
  assert.equal(L.parseBlock('foo|plain|'), null);
  assert.equal(L.parseBlock(42), null);
  assert.equal(L.parseBlock('time|auto|').style, 'plain', 'auto so vale para o timer');
  assert.equal(L.parseBlock('timer|auto|').style, 'auto');
  assert.equal(L.parseBlock('timer|xxx|').style, 'auto', 'estilo invalido volta ao padrao do tipo');
  assert.equal(L.parseBlock('weather|plain|lixo').payload, 'temp');
  assert.equal(L.parseBlock('weather|plain|full').payload, 'full');
  assert.equal(L.parseBlock('timer|auto|qualquer').payload, '');
});

t('text e limitado em tamanho', () => {
  const b = L.parseBlock(`text|plain|${'x'.repeat(100)}`);
  assert.equal(b.payload.length, L.MAX_TEXT_LENGTH);
});

t('serialize e parse sao inversos', () => {
  for (const s of L.DEFAULT_BAR) assert.equal(L.serializeBlock(L.parseBlock(s)), s);
});

t('cleanBar descarta lixo, limita e nunca devolve vazio', () => {
  assert.deepEqual(L.cleanBar(['x', 5, null]), L.DEFAULT_BAR);
  assert.deepEqual(L.cleanBar([]), L.DEFAULT_BAR);
  assert.deepEqual(L.cleanBar('nao e lista'), L.DEFAULT_BAR);
  const many = Array.from({ length: 20 }, () => 'time|plain|%H');
  assert.equal(L.cleanBar(many).length, L.MAX_BAR_BLOCKS);
});

t('addBlock respeita o maximo; newBlock tem padroes uteis', () => {
  let l = ['time|plain|'];
  l = L.addBlock(l, 'weather');
  assert.equal(l[1], 'weather|pill-neutral|temp');
  assert.equal(L.newBlock('text'), 'text|plain|•');
  assert.equal(L.newBlock('time'), 'time|plain|%H:%M');
  assert.equal(L.newBlock('timer'), 'timer|auto|');
  const full = Array.from({ length: L.MAX_BAR_BLOCKS }, () => 'time|plain|%H');
  assert.equal(L.addBlock(full, 'text'), full);
});

t('removeAt nao esvazia a lista', () => {
  assert.deepEqual(L.removeAt(['a', 'b'], 0), ['b']);
  assert.deepEqual(L.removeAt(['a'], 0), ['a']);
  assert.deepEqual(L.removeAt(['a', 'b'], 9), ['a', 'b']);
});

t('moveAt troca vizinhos e ignora bordas', () => {
  assert.deepEqual(L.moveAt(['a', 'b', 'c'], 1, -1), ['b', 'a', 'c']);
  assert.deepEqual(L.moveAt(['a', 'b', 'c'], 1, 1), ['a', 'c', 'b']);
  assert.deepEqual(L.moveAt(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']);
  assert.deepEqual(L.moveAt(['a', 'b', 'c'], 2, 1), ['a', 'b', 'c']);
});

t('updateBlock altera so o pedido e revalida', () => {
  const l = ['time|plain|', 'timer|auto|'];
  assert.deepEqual(L.updateBlock(l, 0, { payload: '%A %d/%m' })[0], 'time|plain|%A %d/%m');
  assert.deepEqual(L.updateBlock(l, 0, { style: 'pill-green' })[0], 'time|pill-green|');
  assert.equal(L.updateBlock(l, 0, { style: 'auto' })[0], 'time|plain|', 'auto invalido para time');
  assert.deepEqual(L.updateBlock(l, 5, { style: 'plain' }), l);
});

t('cleanCols remove repetidos e invalidos', () => {
  const [a, b] = L.cleanCols(['weather|normal', 'timer|x'], ['timer|compact', 'zzz|normal', 'actions']);
  assert.deepEqual(a, ['weather|normal', 'timer|normal']);
  assert.deepEqual(b, ['actions|normal']);
});

t('padroes das colunas sao validos e completos', () => {
  const [a, b] = L.cleanCols(L.DEFAULT_COL2, L.DEFAULT_COL3);
  assert.deepEqual(a, L.DEFAULT_COL2);
  assert.deepEqual(b, L.DEFAULT_COL3);
  assert.deepEqual(L.hiddenCards(a, b), []);
});

t('hiddenCards lista o que sobrou', () => {
  assert.deepEqual(L.hiddenCards(['weather|normal'], ['clock|normal']), ['timer', 'stopwatch', 'actions']);
});

t('moveCard entre colunas e para escondidos', () => {
  const [a, b] = L.moveCard(['weather|compact'], ['clock|normal'], 'weather', 'col3');
  assert.deepEqual(a, []);
  assert.deepEqual(b, ['clock|normal', 'weather|compact'], 'mantem o tamanho');
  const [c, d] = L.moveCard(a, b, 'clock', 'hidden');
  assert.deepEqual(d, ['weather|compact']);
  assert.deepEqual(L.hiddenCards(c, d).includes('clock'), true);
  const [e, f] = L.moveCard(c, d, 'timer', 'col2');
  assert.deepEqual(e, ['timer|normal']);
});

t('setCardSize', () => {
  assert.deepEqual(L.setCardSize(['timer|normal'], 0, 'compact'), ['timer|compact']);
  assert.deepEqual(L.setCardSize(['timer|normal'], 0, 'enorme'), ['timer|normal']);
});

console.log(`LAYOUTLOGIC TEST PASSED (${n})`);
