# CLAUDE.md — Eltob Clock

## 1. Ler antes de começar

1. Memória: `~/.claude/projects/-home-eltobsjr-dev-linux-eltob-clock/memory/MEMORY.md` (índice).
2. Estado atual: `EltobClockSecondBrain/ESTADO.md`. Mapa do vault: `EltobClockSecondBrain/_secondbrain.md`.

## 2. O que é

Extensão do GNOME Shell: relógio da barra configurável (formatos, blocos, popup em 3 colunas) com timer, cronômetro e clima. Fork do **Numeric Clock** (Nick Otmazgin, MIT) — mantenha o crédito ao autor original no README e nas preferências (Sobre). Dev solo.

## 3. Estrutura

- `src/` — código da extensão (GJS): `extension.js`, `prefs.js`, `presets.js`, lógica pura do timer
- `tools/` — `validate.sh`, `build.sh`, `prefs-test.sh`, `nested-smoke-test.sh`, `tests/` (Node)
- `docs/` — capturas de tela; `dist/` — pacote gerado
- `.worktrees/` — trabalho de feature em worktree separado
- `EltobClockSecondBrain/` — vault (versionado junto com o repositório: **nunca escreva segredos nele**)

## 4. Comandos

```bash
tools/validate.sh && tools/build.sh      # validar e empacotar
tools/prefs-test.sh                       # preferências
tools/nested-smoke-test.sh                # GNOME aninhado
```

Para recarregar a extensão no Wayland é preciso **sair e entrar na sessão**.

## 5. Regras

- **Nada de push nem merge sem OK explícito do dono.**
- **O fork substitui o Numeric Clock:** nunca instalar os dois juntos. UUID `eltob-clock@eltobsjr.gmail.com`, schema `org.gnome.shell.extensions.eltob-clock`, classes CSS com prefixo `ec-`.
- **Privacidade:** clima usa o serviço do próprio GNOME (libgweather) + GeoClue; **clima desligado = zero acesso à rede**. Qualquer mudança que use rede exige atualizar `PRIVACY.md`.
- **Design:** seguir o *Eltob Indicator Design v1* (`~/dev/linux/claude-usage-indicator/docs/DESIGN.md`): tokens Catppuccin Macchiato, raios 8/12/16, estado em verde/amarelo/vermelho e **nunca** na cor de destaque.
- **`tools/release-publish.sh` veio do upstream:** não usar sem conferir.

## 6. Fluxo

1. Ler memória e `ESTADO.md`
2. Implementar (feature em worktree) e rodar `tools/validate.sh`
3. Ao fim da sessão, `/devtrack` (atualiza o `ESTADO.md`)
