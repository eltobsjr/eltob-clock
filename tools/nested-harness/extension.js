// Harness do tools/nested-smoke-test.sh — nunca vai no zip da release.
// Conduz o Eltob Clock dentro de um GNOME Shell isolado e escreve linhas "NCTEST".
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import GWeather from 'gi://GWeather';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot', 'screenshot_finish');

const UUID = 'eltob-clock@eltobsjr.gmail.com';
const L = (...a) => console.log('NCTEST', ...a);
const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
  r();
  return GLib.SOURCE_REMOVE;
}));
const fmt = f => GLib.DateTime.new_now_local().format(f);

function ncSettings() {
  const ext = Main.extensionManager.lookup(UUID);
  const src = Gio.SettingsSchemaSource.new_from_directory(`${ext.path}/schemas`,
    Gio.SettingsSchemaSource.get_default(), false);
  return new Gio.Settings({ settings_schema: src.lookup('org.gnome.shell.extensions.eltob-clock', false) });
}

function check(name, ok, detail = '') {
  L(ok ? 'PASS' : 'FAIL', name, detail);
}

// Percorre a arvore de atores procurando por classe de estilo.
function findByClass(root, cls) {
  const out = [];
  (function walk(a) {
    if (a.has_style_class_name?.(cls)) out.push(a);
    for (const c of a.get_children?.() ?? []) walk(c);
  })(root);
  return out;
}

// ── Capturas de tela (so com EC_SHOT_DIR); o clima usa dados de exemplo ───────
async function snap(path) {
  const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
  await new Shell.Screenshot().screenshot(false, stream);
  stream.close(null);
}

function fakeWeatherClient() {
  const now = Math.floor(GLib.get_real_time() / 1e6);
  const fc = (h, t, icon) => ({
    get_value_update: () => [true, now + h * 3600],
    get_value_temp: () => [true, t],
    get_symbolic_icon_name: () => icon,
  });
  const info = {
    is_valid: () => true,
    network_error: () => false,
    get_value_temp: () => [true, 24],
    get_value_temp_max: () => [true, 27],
    get_value_temp_min: () => [true, 22],
    get_symbolic_icon_name: () => 'weather-few-clouds-symbolic',
    get_conditions: () => 'Parcialmente nublado',
    get_sky: () => 'Parcialmente nublado',
    get_apparent: () => '26 °C',
    get_wind: () => 'Leste, 18 km/h',
    get_humidity: () => '72%',
    get_forecast_list: () => [fc(1, 24, 'weather-few-clouds-symbolic'), fc(2, 23, 'weather-few-clouds-symbolic'),
      fc(3, 23, 'weather-clear-night-symbolic'), fc(4, 22, 'weather-clear-night-symbolic'), fc(5, 22, 'weather-clear-night-symbolic')],
    location: { get_name: () => 'Fortaleza', get_level: () => GWeather.LocationLevel.CITY, has_coords: () => true },
  };
  return { available: true, hasLocation: true, loading: false, info, connect: () => 1, disconnect() {}, update() {}, activateApp() {} };
}

async function visualShots(s, dm, inst) {
  const dir = GLib.getenv('EC_SHOT_DIR');
  const st = inst()._state;
  const now = () => Math.floor(GLib.get_real_time() / 1000);
  const fake = fakeWeatherClient();
  inst()._popup._ctx.client = fake;
  inst()._bar._client = fake;
  s.set_string('format-string', '%d/%m/%Y %H:%M:%S');
  st.tm = { state: 'running', durationMs: 600000, endsAt: now() + 272000, remainingMs: 600000 };
  st.sw = { running: false, startedAt: 0, accumulated: 754000 };
  inst()._popup._build(false);
  inst()._bar._rebuild();
  st._changed();
  dm.menu.open();
  await wait(900);
  await snap(`${dir}/popup-aberto.png`);

  inst()._popup.find(inst()._mods.ActionsCard)._toggleSub('presets');
  await wait(500);
  await snap(`${dir}/popup-presets.png`);
  inst()._popup.find(inst()._mods.ActionsCard)._toggleSub('presets');
  await wait(400);

  st.tm = { state: 'running', durationMs: 600000, endsAt: now() + 40000, remainingMs: 600000 };
  st._changed();
  await wait(400);
  await snap(`${dir}/popup-timer-vermelho.png`);

  // Layout personalizado: barra com blocos proprios e cartoes compactos em outra ordem
  s.set_strv('bar-layout', ['time|plain|%a %d/%m', 'time|pill-blue|%H:%M', 'text|plain|•', 'timer|auto|', 'stopwatch|pill-green|', 'weather|pill-neutral|full']);
  s.set_strv('popup-col2', ['timer|compact', 'weather|normal']);
  s.set_strv('popup-col3', ['clock|compact', 'stopwatch|compact', 'actions|compact']);
  await wait(700);
  await snap(`${dir}/popup-personalizado.png`);
  dm.menu.close();
  await wait(300);
  for (const k of ['bar-layout', 'popup-col2', 'popup-col3']) s.reset(k);
  await wait(300);
  st.tmCancel();
  st.swReset();
  L('capturas em', dir);
}

async function run() {
  await wait(2000);
  const s = ncSettings();
  const dm = Main.panel.statusArea.dateMenu;
  const clock = () => dm._clockDisplay.text;
  const inst = () => Main.extensionManager.lookup(UUID)?.stateObj;
  const hbox = () => dm._messageList.get_parent();
  const ext = Main.extensionManager.lookup(UUID);
  const mods = await import(`file://${ext.path}/popup.js`);
  const weatherMod = await import(`file://${ext.path}/weatherview.js`);
  inst()._mods = { ...mods, ...weatherMod };
  const M = inst()._mods;
  const blocks = () => inst()._bar._blocks;
  const block = kind => blocks().find(b => b.spec.kind === kind);

  check('extensao ativa', Main.extensionManager.lookup(UUID)?.state === 1);

  // ── Texto do relogio (herdado do Numeric Clock): o rotulo original continua sendo reescrito ──
  const first = clock();
  check('formato padrao no rotulo original', /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(first), first);
  await wait(1100);
  check('tique a cada segundo', clock() !== first, `${first} -> ${clock()}`);

  const offsets = [];
  const ct = dm._clockDisplay.clutter_text;
  const id = ct.connect('notify::text', () => offsets.push((GLib.get_real_time() / 1000) % 1000));
  await wait(3200);
  ct.disconnect(id);
  check('alinhado ao segundo', offsets.length >= 2 && offsets.every(o => o < 150), offsets.map(Math.round).join(','));

  s.set_string('format-string', '%Y-%m-%d %H:%M');
  await wait(50);
  check('mudar formato', clock() === fmt('%Y-%m-%d %H:%M'), clock());
  s.set_string('format-string', '');
  await wait(50);
  check('formato vazio volta ao padrao', clock() === fmt('%d/%m/%Y %H:%M:%S'), clock());
  s.set_string('format-string', '%H:%M:%S');
  dm._clockDisplay.text = 'stock';
  check('reescrita do shell e sobrescrita', clock() !== 'stock', clock());
  s.set_string('format-string', '<b>%H</b>');
  await wait(50);
  check('texto puro (sem markup)', clock() === fmt('<b>%H</b>') && !ct.use_markup, clock());
  s.set_string('format-string', '%d/%m/%Y %H:%M:%S');

  // ── Barra: composicao por blocos ───────────────────────────────────
  check('rotulo original escondido', !dm._clockDisplay.visible);
  check('compositor na barra', findByClass(dm, 'ec-bar').length === 1);
  check('blocos padrao', blocks().map(b => b.spec.kind).join() === 'time,stopwatch,timer,weather', blocks().map(b => b.spec.kind).join());
  check('bloco de hora usa o formato global', block('time').actor.text === fmt('%d/%m/%Y %H:%M:%S'), block('time').actor.text);
  check('bloco de hora nao usa a classe clock (temas forcam altura nela)', !block('time').actor.has_style_class_name('clock'));
  check('pilulas comecam escondidas', !block('timer').actor.visible && !block('stopwatch').actor.visible);

  s.set_strv('bar-layout', ['time|plain|%a %d/%m', 'text|plain|•', 'time|pill-blue|%H:%M']);
  await wait(100);
  check('barra personalizada: 3 blocos', blocks().length === 3, blocks().map(b => b.spec.kind).join());
  check('hora com formato proprio', blocks()[0].actor.text === fmt('%a %d/%m'), blocks()[0].actor.text);
  check('texto livre', blocks()[1].actor.text === '•');
  check('hora em pilula azul', blocks()[2].actor.has_style_class_name('ec-pill-blue') && blocks()[2].actor.text === fmt('%H:%M'), blocks()[2].actor.style_class);
  s.set_strv('bar-layout', ['lixo', 'x|y|z']);
  await wait(100);
  check('layout invalido volta ao padrao', blocks().map(b => b.spec.kind).join() === 'time,stopwatch,timer,weather');

  // segundos num bloco forcam tique de 1 s mesmo com intervalo grande
  s.set_int('update-interval', 60);
  s.set_boolean('smooth-second', false);
  s.set_strv('bar-layout', ['time|plain|%H:%M:%S']);
  await wait(300);
  const t0 = blocks()[0].actor.text;
  await wait(1500);
  check('segundos no bloco: tique de 1 s', blocks()[0].actor.text !== t0, `${t0} -> ${blocks()[0].actor.text}`);
  s.reset('update-interval');
  s.reset('smooth-second');
  s.reset('bar-layout');
  await wait(200);

  // ── Popup: colunas montadas pelo layout ───────────────────────────
  check('terceira coluna no popup', findByClass(hbox(), 'ec-col').length === 1);
  check('eventos e relogios mundiais escondidos', !dm._displaysSection.visible);
  check('clima abaixo do calendario', findByClass(dm._displaysSection.get_parent(), 'ec-weather').length === 1);
  const col3 = () => findByClass(hbox(), 'ec-col')[0];
  check('cartoes padrao da coluna', inst()._popup._cards.map(c => c.constructor.name).join() === 'WeatherCard,ClockCard,TimerCard,StopwatchCard,ActionsCard',
    inst()._popup._cards.map(c => c.constructor.name).join());

  dm.menu.open();
  await wait(400);
  check('popup abre', dm.menu.isOpen);
  check('hora formatada no cartao', inst()._popup.find(M.ClockCard)._clock.text.length > 0);

  // layout: mover, esconder, compactar
  s.set_strv('popup-col2', []);
  s.set_strv('popup-col3', ['weather|compact', 'timer|compact']);
  await wait(300);
  check('clima foi para a coluna da direita', inst()._popup.find(M.WeatherCard).actor.get_parent() === col3());
  check('cartoes escondidos somem', !inst()._popup.find(M.ClockCard) && !inst()._popup.find(M.ActionsCard) && !inst()._popup.find(M.StopwatchCard));
  check('timer compacto sem anel', inst()._popup.find(M.TimerCard)._compact === true && !inst()._popup.find(M.TimerCard)._ring.actor.get_parent());
  s.set_strv('popup-col3', []);
  await wait(200);
  check('coluna vazia some', !col3().visible);
  s.set_strv('popup-col2', ['weather|normal', 'weather|compact', 'zzz|normal']);
  await wait(200);
  check('repetidos e invalidos ignorados', inst()._popup._cards.length === 1);
  s.reset('popup-col2');
  s.reset('popup-col3');
  await wait(300);
  check('layout restaurado', inst()._popup._cards.length === 5 && col3().visible);

  // ── Timer ──────────────────────────────────────────────────────────
  const st = inst()._state;
  check('timer inicia ocioso', st.tm.state === 'idle' && !block('timer').actor.visible);
  st.tmStart(1);
  await wait(500);
  check('timer em andamento', st.tm.state === 'running' && block('timer').actor.visible && /⏳ 01:00/.test(block('timer').actor.text), block('timer').actor.text);
  check('pilula revelada por completo', block('timer').actor.width > 20 && block('timer').actor.opacity === 255, `w=${block('timer').actor.width} op=${block('timer').actor.opacity}`);
  check('timer verde', block('timer').actor.style_class.includes('ec-pill-ok'), block('timer').actor.style_class);
  st.tmPauseResume();
  await wait(100);
  check('timer pausado', st.tm.state === 'paused' && /⏸/.test(block('timer').actor.text), block('timer').actor.text);
  st.tmPauseResume();
  await wait(100);
  check('timer retomado', st.tm.state === 'running');
  st.tmCancel();
  await wait(500);
  check('timer cancelado: pilula some animada', st.tm.state === 'idle' && !block('timer').actor.visible);
  st.tm = { state: 'running', durationMs: 700, endsAt: Math.floor(GLib.get_real_time() / 1000) + 700, remainingMs: 700 };
  st._changed();
  await wait(2000);
  check('timer termina sozinho', st.tm.state === 'idle' && !block('timer').actor.visible);

  // ── Cronometro ─────────────────────────────────────────────────────
  check('cronometro inicia zerado', !st.sw.running && !block('stopwatch').actor.visible);
  st.swToggle();
  await wait(1500);
  check('cronometro conta', st.sw.running && block('stopwatch').actor.visible && /⏱ 00:0[1-3]/.test(block('stopwatch').actor.text), block('stopwatch').actor.text);
  st.swToggle();
  const frozen = st.swElapsed();
  await wait(700);
  check('cronometro pausa', !st.sw.running && st.swElapsed() === frozen && /⏸/.test(block('stopwatch').actor.text));
  st.swReset();
  await wait(500);
  check('cronometro zera', st.swElapsed() === 0 && !block('stopwatch').actor.visible);

  // ── Acoes: presets e estilo, com transicao ────────────────────────
  const actions = inst()._popup.find(M.ActionsCard);
  actions._toggleSub('presets');
  await wait(500);
  check('lista de presets abre', actions._sub.get_n_children() === 8 && actions._scroll.visible && actions._scroll.height > 0, `h=${actions._scroll.height}`);
  check('lista com altura limitada', actions._scroll.height <= 200, `h=${actions._scroll.height}`);
  actions._sub.get_child_at_index(1).emit('clicked', 0);
  await wait(500);
  check('preset aplicado e lista fechada', s.get_string('format-string') === '%A %d/%m/%Y %H:%M:%S' && !actions._scroll.visible, s.get_string('format-string'));
  s.reset('format-string');
  actions._toggleSub('style');
  await wait(400);
  check('lista de estilos', actions._sub.get_n_children() === 3 && actions._scroll.visible);
  for (const style of ['light', 'dark', 'system']) {
    s.set_string('menu-style', style);
    await wait(50);
    const cls = col3().get_style_class_name();
    const others = ['light', 'dark'].filter(x => x !== style);
    check(`estilo ${style}`, (style === 'system' || cls.includes(`ec-style-${style}`)) && others.every(x => !cls.includes(`ec-style-${x}`)), cls);
  }
  actions._closeSub();
  await wait(400);
  check('lista de estilos fecha animada', !actions._scroll.visible);

  // ── Clima ──────────────────────────────────────────────────────────
  const wc = inst()._popup.find(M.WeatherCard);
  check('cartao de clima com conteudo', !!wc && wc._body.get_n_children() >= 2, `filhos=${wc?._body.get_n_children()}`);

  dm.menu.close();
  await wait(300);
  check('popup fecha', !dm.menu.isOpen);

  if (GLib.getenv('EC_SHOT_DIR')) await visualShots(s, dm, inst);

  // ── Laboratorio: marcadores por extenso e posicao do relogio ───────
  s.set_string('format-string', '{hora:extenso}');
  await wait(400);
  check('barra: hora por extenso', /horas?( e | em ponto)|o'clock|oh /.test(block('time').actor.text) || /^[a-zç -]+ (hora|horas)/.test(block('time').actor.text), block('time').actor.text);
  s.set_string('format-string', '{dia:ordinal} de %B');
  await wait(400);
  check('barra: dia ordinal e mes', !block('time').actor.text.includes('{') && block('time').actor.text.length > 4, block('time').actor.text);
  s.set_string('format-string', '%d/%m/%Y %H:%M:%S');
  const box = () => dm.container.get_parent();
  check('posicao padrao: centro', box() === Main.panel._centerBox);
  s.set_string('clock-position', 'left');
  await wait(300);
  check('posicao: esquerda', box() === Main.panel._leftBox);
  s.set_string('clock-position', 'right');
  await wait(300);
  check('posicao: direita', box() === Main.panel._rightBox);
  s.set_string('clock-position', 'center');
  await wait(300);
  check('posicao: volta ao centro', box() === Main.panel._centerBox);
  s.set_string('clock-position', 'left');
  await wait(200);

  // ── Modo fora da barra ─────────────────────────────────────────────
  s.set_boolean('only-topbar', false);
  await wait(1200);
  check('only-topbar off ainda formata', clock() === fmt('%d/%m/%Y %H:%M:%S'), clock());
  s.set_boolean('only-topbar', true);

  // ── Desativar devolve tudo; reativar refaz ─────────────────────────
  await Main.extensionManager.disableExtension(UUID);
  await wait(300);
  check('desativar devolve o relogio de onde saiu (esquerda -> centro)', dm.container.get_parent() === Main.panel._centerBox);
  check('desativar restaura o relogio', clock() === dm._clock.clock && dm._clockDisplay.visible, `${clock()} vs ${dm._clock.clock}`);
  check('coluna removida', findByClass(hbox(), 'ec-col').length === 0);
  check('compositor removido', findByClass(dm, 'ec-bar').length === 0);
  check('cartao de clima removido', findByClass(dm._displaysSection.get_parent(), 'ec-weather').length === 0);
  check('secoes nativas de volta', dm._displaysSection.visible === Main.sessionMode.allowSettings);
  await Main.extensionManager.enableExtension(UUID);
  await wait(500);
  check('reativar refaz a coluna e a barra', findByClass(hbox(), 'ec-col').length === 1 && findByClass(dm, 'ec-bar').length === 1);

  for (let i = 0; i < 3; i++) {
    await Main.extensionManager.disableExtension(UUID);
    await Main.extensionManager.enableExtension(UUID);
  }
  await wait(400);
  check('ciclos de ativar/desativar',
    Main.extensionManager.lookup(UUID)?.state === 1 &&
    findByClass(hbox(), 'ec-col').length === 1 && findByClass(dm, 'ec-bar').length === 1);
  L('DONE');
}

export default class EltobClockTestHarness extends Extension {
  enable() {
    run().catch(e => L('FAIL excecao', e, e.stack));
  }

  disable() {}
}
