# Asset audit — what the OmniFuel repo offers Control Tower Shift

Audited 2026-08-30 across `src/`, `public/`, and `index.html`.

## Finding: no Control Tower assets exist

There are no pre-existing Control Tower characters, sprites, or
game-specific art anywhere in the repository. The game will use original
geometric/icon shapes (below) rather than inventing "missing" assets.

## Reusable: the Fueling Intelligence visual system

The repo carries a complete, documented design system (`src/index.css`
`@theme` block, primitives in `src/components/ui.jsx`) that the game's UI
chrome should adopt wholesale:

| Token | Value | Game use |
|---|---|---|
| `--color-paper` | `#f7f4ec` | Screen ground / play-field background |
| `--color-ink` | `#121210` | All type, entity outlines |
| `--color-cobalt` | `#1f35c4` | The single accent: player actions, active ability, score |
| `--color-cobalt-ink` | `#16289b` | Pressed/hover states |
| `--color-berry` | `#8e3044` | Damage, failure state |
| `--color-mist` | `#dce6d7` | Shield-active wash |
| `--color-sand` | `#eacd91` | Warning band (integrity low) |
| `--color-line` | `rgb(18 18 16 / 0.16)` | Hairline rules, HUD dividers |

**Typography**: Bodoni Moda (serif) for the score and large numerals;
Archivo (sans) for labels, ability buttons, HUD text. Both already loaded.

**Rules that carry over** (from ui.jsx's header comment):
- Sharp rectangles only — no rounded corners except true circles.
- Status is shown by SHAPE + WORD, never color alone.
- Uppercase tracked labels for controls (`Button` primitive is reusable
  as-is for pause/restart/ability buttons).
- Every control gets a visible focus ring and a real label.

**Reusable components**: `Button`, `TextButton` from
`src/components/ui.jsx`; the PWA shell (vite-plugin-pwa) if the game gets
its own route.

## Gaps and the geometric alternatives chosen

| Expected | Present? | Alternative |
|---|---|---|
| Tower sprite | No | Ink square + cobalt circle footprint (true circle allowed) |
| Threat sprites | No | Small ink triangles, vertex pointing along velocity |
| Ability icons | No | Geometric marks: shield=outlined square, pulse=concentric circles, burst=chevron pair, multiplier=×2 in Bodoni, repair=plus sign |
| Explosion/clear FX | No | Expanding hairline circle (matches the design's line language) |
| Sound | No (none in repo) | Out of scope for M1; decide at M2 |

Nothing in `public/` beyond app icons; nothing to reuse there.
