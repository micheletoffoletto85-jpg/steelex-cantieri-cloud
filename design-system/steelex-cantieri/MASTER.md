# Design System Master File — STEELEX Cantieri

> **LOGIC:** When building a specific page, first check `design-system/steelex-cantieri/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

> **BRAND LOCK (precede sempre la skill):** i colori, il logo e il nome di marca
> sono fissati da `.claude/rules/02-brand.md` e `.claude/rules/05-due-app.md`.
> La skill UI/UX Pro Max ha proposto una palette teal: **scartata**. Si tiene
> l'arancione STEELEX. Della skill si adottano struttura, densità, tipografia,
> regole di interazione e checklist.

---

**Project:** STEELEX Cantieri
**Generated:** 2026-09-01 (skill: ui-ux-pro-max, brand-locked a mano)
**Category:** Productivity Tool / gestionale di cantiere B2B, mobile-first
**Design Dials:** Motion 3/10 (Subtle) · Density 8/10 (Dense / Dashboard)
**Style:** Flat Design — 2D, niente ombre pesanti, icone SVG, transizioni 150–200ms

---

## Global Rules

### Color Palette — Light (default)

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary / Accent | `#FF6B00` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Primary Pressed | `#E25F00` | `--color-primary-press` |
| Primary Tint (bg tenue) | `#FFF1E6` | `--color-primary-tint` |
| Secondary (ink scuro brand) | `#1A1A2E` | `--color-secondary` |
| Background | `#FBFAF8` | `--color-background` |
| Foreground (testo) | `#1B1B24` | `--color-foreground` |
| Card / Surface | `#FFFFFF` | `--color-card` |
| Surface 2 (righe, header tabella) | `#F2F0EB` | `--color-surface-2` |
| Muted | `#F1EEE8` | `--color-muted` |
| Muted Foreground | `#6B6862` | `--color-muted-foreground` |
| Border | `#E6E2D9` | `--color-border` |
| Border Strong | `#D7D2C6` | `--color-border-strong` |
| Success | `#15803D` | `--color-success` |
| Success Tint | `#E7F3EB` | `--color-success-tint` |
| Warning | `#B45309` | `--color-warning` |
| Warning Tint | `#FBEEDD` | `--color-warning-tint` |
| Destructive / Ritardo | `#C81E1E` | `--color-destructive` |
| Destructive Tint | `#FBE7E7` | `--color-destructive-tint` |
| Ring (focus) | `#FF6B00` | `--color-ring` |

### Color Palette — Dark

| Role | Hex |
|------|-----|
| Primary / Accent | `#FF7E1F` (schiarito per fondo scuro) |
| Primary Pressed | `#FF6B00` |
| Primary Tint | `#2C1E10` |
| Background | `#151519` |
| Foreground | `#F1EFEA` |
| Card / Surface | `#1E1E24` |
| Surface 2 | `#26262E` |
| Muted Foreground | `#A6A199` |
| Border | `#32323C` |
| Border Strong | `#3E3E49` |
| Success | `#54D186` |
| Warning | `#F1B45A` |
| Destructive | `#F0716B` |

**Regola tema:** definire la palette light su `:root`; ridefinire i soli token
sotto `@media (prefers-color-scheme: dark)` e sotto `[data-theme="dark"]`.
Mai colori letterali dentro i componenti — solo `var(--color-*)`.
Contrasto testo ≥ 4.5:1 in entrambi i temi.

### Typography

- **Famiglia UI (unica):** Plus Jakarta Sans — pensata per SaaS / dashboard / B2B
- **Dati numerici / tabelle / importi:** IBM Plex Mono con `font-variant-numeric: tabular-nums`
- **Fallback:** `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
- **Base:** 16px, line-height 1.5 · **Non scendere sotto 13px** nel corpo
- Titoli: `text-wrap: balance`, peso 600–700

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
```

### Spacing Variables — Density 8/10 (Dense / Dashboard)

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `2px` | Gap minimi |
| `--space-sm` | `4px` | Gap icone, spaziatura inline |
| `--space-md` | `8px` | Padding standard |
| `--space-lg` | `12px` | Padding card / righe |
| `--space-xl` | `16px` | Gap tra blocchi |
| `--space-2xl` | `24px` | Margini di sezione |
| `--space-3xl` | `32px` | Padding contenitore pagina |

### Elevation (Flat — ombre appena percettibili)

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(27,27,36,.05)` | Card, bottoni |
| `--shadow-md` | `0 1px 2px rgba(27,27,36,.04), 0 8px 24px -12px rgba(27,27,36,.12)` | Dropdown, popover |
| `--shadow-lg` | `0 12px 32px -12px rgba(27,27,36,.20)` | Modali |

Niente gradienti. Niente ombre colorate. Bordo `1px solid var(--color-border)` come separatore primario.

### Touch & Interaction (cantiere, coi guanti)

- Area cliccabile minima **44×44px** (bottoni, righe, chip, icone-azione)
- Gap ≥ **8px** tra target adiacenti
- `cursor: pointer` su tutto il cliccabile
- Ogni azione dà feedback: stato `loading` → `success` / `error`. Mai un tap nel vuoto.
- Transizioni 150–200ms `ease`. Nessun cambio di stato istantaneo (0ms).
- Niente hover come unico veicolo di informazione (touch non ha hover).

---

## Layout Pattern — Dashboard densa (sostituisce il pattern landing della skill)

L'app è **scansionata e operata**, non letta dall'alto in basso.

- **Sommario prima del dettaglio:** riga di KPI compatti in testa (attivi, in ritardo,
  SAL da emettere, margine), poi l'elenco.
- **Liste scansionabili:** ogni riga = nome + sotto-riga contesto + stato + avanzamento + prossima fase.
- **Stato codificato nella forma, non solo nel colore:** pastiglia con testo + banda
  laterale (3px) + pallino. Leggibile anche senza distinzione rosso/verde.
- **Azione primaria in alto a destra** ("Nuovo cantiere"), grande, sempre nello stesso posto.
- **Right rail** (≥ 1024px) per l'attività del giorno; sotto i 720px si nasconde.
- **Responsive:** sotto 720px le tabelle diventano schede a colonna singola,
  mai scroll orizzontale della pagina. Tabelle larghe → wrapper `overflow-x: auto`.
- **Azioni in blocco:** dove c'è un conteggio ("5 SAL da emettere") portare a
  selezione multipla + barra azioni, non ad aperture ripetute di scheda.
- Breakpoint di verifica: 375 / 768 / 1024 / 1440px.

---

## Component Specs

### Buttons

```css
.btn-primary {
  min-height: 44px;
  display: inline-flex; align-items: center; gap: var(--space-sm);
  background: var(--color-primary);
  color: var(--color-on-primary);
  padding: 11px 16px;
  border: 0; border-radius: 9px;
  font: 700 13px/1 "Plus Jakarta Sans", sans-serif;
  cursor: pointer;
  transition: background 160ms ease;
}
.btn-primary:hover  { background: var(--color-primary-press); }
.btn-primary:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }

.btn-ghost {
  min-height: 44px;
  background: transparent;
  color: var(--color-foreground);
  border: 1px solid var(--color-border-strong);
  border-radius: 9px; padding: 11px 16px;
  font-weight: 600; cursor: pointer;
}
```

### Cards / Rows (flat, niente lift)

```css
.card {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 11px;
  padding: var(--space-lg) var(--space-xl);
  transition: border-color 150ms ease;   /* niente transform: non spostare il layout */
}
.card:hover { border-color: var(--color-border-strong); }
```

### Status pill

```css
.pill {
  font: 700 11px/1 "Plus Jakarta Sans", sans-serif;
  text-transform: uppercase; letter-spacing: .03em;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 9px; border-radius: 6px;
}
.pill::before { content:""; width:6px; height:6px; border-radius:50%; background: currentColor; }
.pill.is-ok    { color: var(--color-success);     background: var(--color-success-tint); }
.pill.is-warn  { color: var(--color-warning);     background: var(--color-warning-tint); }
.pill.is-late  { color: var(--color-destructive); background: var(--color-destructive-tint); }
/* la riga porta anche una banda laterale 3px dello stesso colore semantico */
```

### Inputs

```css
.input {
  min-height: 44px;
  padding: 11px 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: 9px;
  font-size: 16px;                 /* evita lo zoom iOS */
  background: var(--color-card);
  color: var(--color-foreground);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.input:focus {
  border-color: var(--color-primary);
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 22%, transparent);
}
```

### Progress bar

```css
.bar { height:6px; border-radius:3px; background:var(--color-muted);
       border:1px solid var(--color-border); overflow:hidden; }
.bar > i { display:block; height:100%; background:var(--color-primary); }
```

### Modals

```css
.modal-overlay { background: rgba(26,26,46,.45); backdrop-filter: blur(3px); }
.modal { background: var(--color-card); border-radius: 16px; padding: var(--space-3xl);
         box-shadow: var(--shadow-lg); max-width: 520px; width: 92%; }
```

---

## Motion — 3/10 (Subtle)

Solo micro-reveal in ingresso. Rispettare sempre `prefers-reduced-motion`.

```js
// registrare una volta: gsap.registerPlugin(ScrollTrigger)
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  gsap.from(el, { opacity: 0, y: 12, duration: 0.35, ease: 'power1.out',
    scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none reverse' } });
}
```

- ✅ Offset y piccolo (8–16px): deve leggersi come fade, non come slide
- ✅ Animare `opacity` e `transform`, mai `width` / `height` / `top`
- ❌ Una sola durata per ogni transizione
- ❌ Contenuto critico invisibile-by-default senza fallback no-JS

---

## Icons

- Set unico: **Lucide** (o Heroicons). Mai emoji come icone. Mai mix di set.
- Icona-solo-azione → `aria-label`. Icona decorativa → `aria-hidden="true"`.

---

## Anti-Patterns (Do NOT Use)

- ❌ Palette teal della skill (brand = arancione `#FF6B00`)
- ❌ Emoji come icone
- ❌ `outline: none` senza un focus ring alternativo visibile
- ❌ Hover che sposta il layout (`transform: scale`, `translateY` su card)
- ❌ Stato comunicato solo dal colore
- ❌ Tabelle che sforano il viewport su mobile
- ❌ Cambi di stato istantanei (0ms)
- ❌ Testo sotto 13px nel corpo · contrasto < 4.5:1
- ❌ Onboarding complesso · performance lenta (CLS > 0.1)

---

## Pre-Delivery Checklist

- [ ] Accent = `#FF6B00`, nessun colore fuori dai token
- [ ] Nessuna emoji come icona · set icone unico (Lucide/Heroicons)
- [ ] `cursor: pointer` su tutto il cliccabile
- [ ] Target touch ≥ 44×44px · gap ≥ 8px
- [ ] Hover con transizione 150–200ms, senza spostare il layout
- [ ] Focus visibile da tastiera su ogni elemento interattivo
- [ ] Contrasto testo ≥ 4.5:1 in light **e** dark
- [ ] `prefers-reduced-motion` rispettato
- [ ] Responsive verificato a 375 / 768 / 1024 / 1440px
- [ ] Nessuno scroll orizzontale su mobile · nessun contenuto sotto navbar fisse
- [ ] Ogni azione ha feedback (loading → success/error)
- [ ] Importi e numeri in tabella: `tabular-nums`
