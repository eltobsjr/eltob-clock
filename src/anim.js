// SPDX-License-Identifier: MIT
// Transicoes suaves para o popup e a barra. Tudo respeita a opcao de animacoes do GNOME
// (Configuracoes > Acessibilidade > "Reduzir animacoes"): desligada, a mudanca e imediata.
import Clutter from 'gi://Clutter';
import St from 'gi://St';

export const DURATION = 200;

export function animationsOn() {
  try {
    return St.Settings.get().enable_animations;
  } catch {
    return true;
  }
}

const dur = ms => (animationsOn() ? ms : 0);

function stop(actor) {
  actor.remove_all_transitions();
}

/** Aparece com fade, sem mexer no tamanho. */
export function fadeIn(actor, ms = DURATION) {
  stop(actor);
  actor.show();
  const d = dur(ms);
  if (d === 0) {
    actor.opacity = 255;
    return;
  }
  actor.opacity = 0;
  actor.ease({ opacity: 255, duration: d, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
}

function naturalSize(actor, axis) {
  if (axis === 'height') {
    const w = actor.get_width();
    let h = actor.get_preferred_height(w > 0 ? w : -1)[1];
    // O CSS pode limitar a altura (lista com rolagem): anima so ate o limite, sem pulo no fim.
    try {
      const max = actor.get_theme_node().get_max_height();
      if (max > 0) h = Math.min(h, max);
    } catch {}
    return h;
  }
  return actor.get_preferred_width(-1)[1];
}

function reveal(actor, axis, ms, onDone) {
  stop(actor);
  actor.show();
  const d = dur(ms);
  const set = axis === 'height' ? v => actor.set_height(v) : v => actor.set_width(v);
  if (d === 0) {
    set(-1);
    actor.opacity = 255;
    onDone?.();
    return;
  }
  const target = naturalSize(actor, axis);
  actor.clip_to_allocation = true;
  set(0);
  actor.opacity = 0;
  actor.ease({
    [axis]: target,
    opacity: 255,
    duration: d,
    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    onComplete: () => {
      set(-1);
      actor.clip_to_allocation = false;
      onDone?.();
    },
  });
}

function collapse(actor, axis, ms, onDone) {
  if (!actor.visible) {
    onDone?.();
    return;
  }
  stop(actor);
  const d = dur(ms);
  const set = axis === 'height' ? v => actor.set_height(v) : v => actor.set_width(v);
  if (d === 0) {
    actor.hide();
    set(-1);
    onDone?.();
    return;
  }
  actor.clip_to_allocation = true;
  set(axis === 'height' ? actor.get_height() : actor.get_width());
  actor.ease({
    [axis]: 0,
    opacity: 0,
    duration: d,
    mode: Clutter.AnimationMode.EASE_IN_QUAD,
    onComplete: () => {
      actor.hide();
      set(-1);
      actor.opacity = 255;
      actor.clip_to_allocation = false;
      onDone?.();
    },
  });
}

/** Mostra crescendo na vertical (listas que abrem, linhas que aparecem). */
export const revealV = (actor, ms = DURATION, onDone) => reveal(actor, 'height', ms, onDone);
/** Esconde encolhendo na vertical. */
export const collapseV = (actor, ms = DURATION, onDone) => collapse(actor, 'height', ms, onDone);
/** Mostra crescendo na horizontal (pilulas da barra). */
export const revealH = (actor, ms = DURATION, onDone) => reveal(actor, 'width', ms, onDone);
/** Esconde encolhendo na horizontal. */
export const collapseH = (actor, ms = DURATION, onDone) => collapse(actor, 'width', ms, onDone);

/**
 * Liga/desliga a visibilidade com animacao, so quando ela muda de verdade.
 * `axis` = 'v' ou 'h'. A primeira chamada (antes de o ator ser mapeado) nao anima.
 */
export function setShown(actor, shown, axis = 'v') {
  const was = actor._ecShown;
  actor._ecShown = shown;
  if (was === undefined) {
    actor.visible = shown;
    return;
  }
  if (was === shown) return;
  if (shown) (axis === 'h' ? revealH : revealV)(actor);
  else (axis === 'h' ? collapseH : collapseV)(actor);
}
