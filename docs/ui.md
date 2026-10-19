# ui.md - Resbot Web UI Specification

Theme: **analog horror**. A degraded tape archive that happens to contain student records. The interface should feel like a cursed VHS/CCTV system, not like a SaaS dashboard.

This file is the single source of truth for look and feel. If a component is not described here, build it in the same spirit and add it to this file.

---

## 0. Hard rules

1. **No emojis anywhere.** Not in copy, buttons, toasts, headings, alerts, email templates, error messages, page titles, favicons, meta tags, commit-visible strings, or placeholder text. Also avoid Unicode symbols that render as color pictographs on some platforms (warning sign, check mark, cross mark, star, bell, lock, gear, and so on). Icons are drawn as ASCII art or inline SVG line marks (section 6).
   - Allowed glyph set for UI text: printable ASCII, block elements (`░ ▒ ▓ █ ▀ ▄ ▌ ▐`), and box-drawing characters (`─ │ ┌ ┐ └ ┘ ╔ ╗ ╚ ╝ ═ ║`).
   - Add `font-variant-emoji: text;` on `body` as a safety net.
   - Favicon is an SVG or ICO drawn in the theme, never an emoji.
   - Add a CI grep that fails the build on emoji ranges (see section 15).
2. **No "AI dashboard" look.** Banned: rounded-corner cards, drop-shadow cards, pill buttons, pastel chips, gradient hero sections, icon-in-a-circle feature grids, evenly spaced box grids, glassmorphism, sidebars made of identical rounded rows.
3. **Strictly monochrome.** Only `#000` and `#fff`. Every gray is white at reduced alpha (section 3). No accent color unless explicitly enabled later (section 3.3).
4. **Data must stay readable.** Grades, scholar numbers, names, and numbers never glitch, flicker, or distort while on screen. Effects hit chrome, headings, labels, and decoration only.
5. **Never harm the user.** No flashing faster than 3 per second, no full-screen strobes, `prefers-reduced-motion` honored, and a visible "Reduce distortion" toggle (section 12).
6. **Forms are calm.** Inputs, the captcha, and anything the user types into never glitch.

---

## 1. Concept

The site is a **tape archive**. Each student is a **subject file**. Each search is a **tape being pulled**. The AI assistant is **the archive speaking**. The admin panel is the **control room** with monitors and an incident log.

Mood references: lost-footage VHS, public-access static, CCTV corridors, cave-wall markings scratched into black, redacted documents. Dread comes from restraint: mostly stillness, then a short, wrong moment.

---

## 2. Layout principles (anti-box)

- Content sits **directly on the black**. No containers around content by default.
- Separate regions with **scratched lines**, white space, ASCII fragments, or cave-mark rows, not with rectangles.
- **Asymmetry on purpose.** Main column slightly off-center, art bleeding off one edge, labels rotated 1 to 3 degrees.
- **Ragged edges.** Where a surface is needed (a record, a modal), use a torn-paper `clip-path` polygon (section 9.5), never `border-radius`.
- **Fragmentary frames.** If something needs framing, use only corners or one side drawn in ASCII, never a closed four-sided box.
- **Layered depth.** Large ASCII art sits behind content at 6 to 12 percent opacity.
- **Tape artifacts as structure.** Counter, timestamps, and tracking marks are used as layout anchors (top bar, bottom bar).
- Max content width 1100px, but art and effects span full width.
- Grid is a loose 12-column; deliberately break it with offsets of 8 to 40px on headings and art.

---

## 3. Color and tone

### 3.1 Tokens

```css
:root {
  --void: #000;
  --bone: #fff;

  /* grays are alpha only */
  --bone-100: rgb(255 255 255 / 1);
  --bone-80:  rgb(255 255 255 / .80);  /* body text */
  --bone-60:  rgb(255 255 255 / .60);  /* secondary text (min for readable text) */
  --bone-35:  rgb(255 255 255 / .35);  /* hairlines, disabled */
  --bone-15:  rgb(255 255 255 / .15);  /* faint structure */
  --bone-07:  rgb(255 255 255 / .07);  /* scanlines, background art */
}
```

- Text below `--bone-60` is decoration only (aria-hidden), never information.
- Inversion (black text on a white slab) marks the primary action, the active nav item, and warnings. Inversion is the only "emphasis color".

### 3.2 Status without color

| State | Treatment |
|---|---|
| Pass / OK | `[ PASS ]` plain, steady |
| Withheld / warning | inverted slab, `WH` |
| Error / blocked | glitched label + jagged underline, text `FAULT` |
| No data | `NO SIGNAL` at 50 percent opacity with static fill |
| Success toast | `RECEIVED` in typewriter text |

### 3.3 Optional accent (off by default)

If a single accent is ever approved, it is one dim blood red used only for the REC dot and destructive confirmation. Do not use until requested.

---

## 4. Typography

| Role | Font | Notes |
|---|---|---|
| Display, OSD, headings, labels, ASCII | **VT323** | Pixel terminal face. Uppercase, wide tracking (0.06 to 0.18em). |
| Body, ledger lines, long text | **Special Elite** | Typewriter. Used for sentences and AI answers. |
| Numbers / scholar IDs | VT323 | Tabular feel. |

Fallbacks: `'VT323', 'Courier New', monospace` and `'Special Elite', 'Courier New', monospace`.

Scale (px): 14 body-small, 16 body, 20 label, 28 section, 44 page title, 72 hero, 96 to 120 logo on login.

Rules:
- Labels and headings uppercase. Body sentence case.
- Headings use the glitch treatment (section 8.1). Body never does.
- Pixelated rendering: `-webkit-font-smoothing: none; font-smooth: never;` on display text; `image-rendering: pixelated` on any bitmap.
- Line length 60 to 70 characters for answers.

---

## 5. Texture stack (applied once, globally)

Render as fixed, `pointer-events: none`, `aria-hidden` layers above content (`z-index` high, below modals' focus UI).

1. **Scanlines**: 1px lines every 3px at `--bone-07`.
2. **Noise**: pre-generated 256x256 tileable monochrome PNG, animated by `background-position` with `steps(8)` at about 8 fps, opacity .08 to .14, `mix-blend-mode: screen`. Do **not** use live SVG `feTurbulence` for the global layer (expensive); it is acceptable for small, static decorative elements.
3. **Vignette**: radial gradient, transparent to `rgb(0 0 0 / .85)`, slow "breathing" (opacity 0.8 to 0.95, 9s).
4. **Tracking bands**: 1 to 3 horizontal bands, 4 to 14px tall, `--bone-15`, skewed, drifting vertically and occasionally jumping.
5. **Chroma ghost** (monochrome): duplicate text offset 2 to 3px left/right at 15 to 35 percent white. No color channels.

```css
.fx-scan  { position:fixed; inset:0; pointer-events:none; z-index:90;
  background:repeating-linear-gradient(0deg, var(--bone-07) 0 1px, transparent 1px 3px); }
.fx-vig   { position:fixed; inset:0; pointer-events:none; z-index:91;
  background:radial-gradient(ellipse at center, transparent 50%, rgb(0 0 0 / .85) 100%);
  animation:breathe 9s ease-in-out infinite; }
.fx-noise { position:fixed; inset:0; pointer-events:none; z-index:92; opacity:.11;
  background:url(/fx/noise-256.png); mix-blend-mode:screen;
  animation:noise .9s steps(8) infinite; }
@keyframes breathe { 50% { opacity:.8 } }
@keyframes noise {
  0%{background-position:0 0} 25%{background-position:-64px 40px}
  50%{background-position:30px -80px} 75%{background-position:-20px 90px} 100%{background-position:0 0} }
```

---

## 6. Pixelated ASCII art

### 6.1 Rules
- Always in a `<pre aria-hidden="true">` unless it conveys meaning (then `role="img"` with `aria-label`).
- Font: VT323, `line-height: 1`, `letter-spacing: 0`, `white-space: pre`.
- Never wrap. Scale with `font-size` using `clamp()`; hide secondary art below 640px.
- Display at `--bone-100` for hero art, `--bone-15` to `--bone-35` for background art.
- Art may "degrade": randomly replace a few characters with `░▒▓` for 100 to 250ms (section 8.4).
- Each art piece also exists in **corrupted** and **blink** variants for animation (swap `<pre>` contents).

### 6.2 Art library (starter set; store in `/web/src/art/*.txt`)

**EYE** (login hero; follows the cursor, section 8.5)
```
        _.-''''''-._
     .-'   .-""-.   '-.
    <     ( (@@) )     >
     '-.   '-..-'   .-'
        '-.______.-'
```

**EYE_CLOSED** (blink frame)
```
        _.-''''''-._
     .-'            '-.
    <  ----------------  >
     '-.            .-'
        '-.______.-'
```

**HAND** (home, empty states)
```
         |  |  |  |
         |  |  |  |  _
        _|  |  |  |_| |
       | |  |  |  | | |
       | '--'--'--' | |
       |             /
        \           /
         |         |
         |_________|
```

**WATCHER** (rare appearance, bottom corner)
```
          ___
         (. .)
          |_|
         /| |\
        / | | \
          | |
          | |
         _| |_
```

**SKULL** (blocked account, fatal errors)
```
        .-"""""-.
       /  _   _  \
      |  (O) (O)  |
       \    ^    /
        |VVVVVVV|
         '-----'
```

**DOOR** (pending approval screen)
```
      ______________
     |  __________  |
     | |          | |
     | |          | |
     | |        o | |
     | |          | |
     | |__________| |
     |______________|
```

**STATIC BAR** (dividers, loading)
```
░▒▓█▓▒░░▒▓█▓▒░ ▒▓█▓▒░░▒▓█ ▓▒░░▒▓█▓▒░
```

**NO SIGNAL** (404, empty result)
```
 █▄ █ █▀█   ▄▀▀ █ ▄▀▀ █▄ █ ▄▀█ █
 █ ▀█ █▄█   ▄██ █ ▀▄█ █ ▀█ █▀█ █▄▄
```

### 6.3 Pixel mosaic art
Large, low-fi "pixel" imagery (faces, corridors, a figure in a doorway) is built as a character grid of `░▒▓█` and rendered at 6 to 10 percent opacity behind content. Generate from a source image with a script (`scripts/img2ascii.js`): downscale to 80x40, threshold to four levels, map to the block characters, export as `.txt`. No gray photos in the UI; everything is quantized.

---

## 7. Cave-mark line symbols

Hand-scratched primitive marks used as icons, dividers, bullets, and decoration. Drawn as inline SVG strokes (white, `stroke-linecap: round`, `fill: none`), then roughened.

### 7.1 Roughen filter (apply to every mark)
```html
<svg width="0" height="0" aria-hidden="true">
  <filter id="scratch">
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="4"/>
    <feDisplacementMap in="SourceGraphic" scale="3"/>
  </filter>
</svg>
```
Marks use `filter: url(#scratch)` and a slightly uneven `stroke-width` (1.6 to 2.4px). Static, not animated, to keep it cheap.

### 7.2 Symbol vocabulary and UI meaning

| Mark | Meaning in UI | Use |
|---|---|---|
| Zigzag line | Water / loading / transition | Section dividers, progress |
| Spiral | Search / the archive | Search icon, loader |
| Radiating-line sun | Admin / authority | Admin nav, alert header |
| Hand stencil (negative print) | User / identity | Account menu, profile |
| Parallel finger flutings (3 to 4 scratched strokes) | Count / quota | Usage meters |
| Row of dots | Pagination / history | Page indicator, timeline |
| Stick figure, one | Subject / student | Subject file header |
| Stick figures, group of hunters with spears | Sweep / bulk query | Anomaly alerts |
| Single large eye | Watching / tracked scholar | Special-scholar tag |
| Crossed strokes (X) | Blocked / revoked | Block status |
| Open circle | Pending | Pending approval |
| Animal outline (simple bison) | Archive / data | Empty states, footer |

### 7.3 Starter SVGs
```html
<!-- zigzag divider -->
<svg viewBox="0 0 320 24" width="320" height="24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#scratch)" aria-hidden="true">
  <path d="M2 18 L22 4 L42 18 L62 4 L82 18 L102 4 L122 18 L142 4 L162 18 L182 4 L202 18 L222 4 L242 18 L262 4 L282 18 L302 4 L318 14"/>
</svg>

<!-- sun (admin) -->
<svg viewBox="0 0 48 48" width="32" height="32" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" filter="url(#scratch)" aria-hidden="true">
  <circle cx="24" cy="24" r="8"/>
  <path d="M24 4V12 M24 36V44 M4 24H12 M36 24H44 M10 10L16 16 M32 32L38 38 M38 10L32 16 M16 32L10 38"/>
</svg>

<!-- stick figure (subject) -->
<svg viewBox="0 0 32 56" width="20" height="36" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" filter="url(#scratch)" aria-hidden="true">
  <circle cx="16" cy="8" r="5"/><path d="M16 13V34 M16 20L4 28 M16 20L28 28 M16 34L6 52 M16 34L26 52"/>
</svg>

<!-- finger flutings (quota) -->
<svg viewBox="0 0 40 28" width="40" height="28" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" filter="url(#scratch)" aria-hidden="true">
  <path d="M6 24 C5 16 7 8 6 3 M16 24 C15 16 17 8 16 3 M26 24 C25 16 27 8 26 3 M36 24 C35 16 37 8 36 3"/>
</svg>
```
Build the full set (hand stencil, spiral, bison, hunters, eye, X, circle) in `/web/src/marks/` as React components `<Mark name="spiral" />`. Each mark: 32px default, scales with `em`.

### 7.4 Mark usage rules
- Marks replace icon libraries. No icon font, no Material/Feather/Lucide icons.
- A row of marks can act as a border along one edge of a section ("cave frieze"), repeated at 20 to 35 percent opacity.
- Never place two different marks side by side as decoration without meaning.

---

## 8. Glitch and horror effects

All effects are **short, irregular, and rare**. Predictable loops read as cheap; random scheduling reads as haunted.

### 8.1 Glitch text (headings, logo, labels only)
Markup: `<h1 class="glitch" data-text="RESBOT">RESBOT</h1>`
```css
.glitch { position:relative; display:inline-block; }
.glitch::before, .glitch::after {
  content: attr(data-text); position:absolute; inset:0; pointer-events:none;
  background:#000; opacity:0; }
.glitch::before { left:3px;  text-shadow:-2px 0 rgb(255 255 255 / .5); }
.glitch::after  { left:-3px; text-shadow: 2px 0 rgb(255 255 255 / .3); }
.glitch.is-glitching::before { opacity:1; animation:slice-a .28s steps(2) 1; }
.glitch.is-glitching::after  { opacity:1; animation:slice-b .28s steps(2) 1; }
@keyframes slice-a {
  0%{clip-path:inset(10% 0 70% 0)} 25%{clip-path:inset(60% 0 12% 0)}
  50%{clip-path:inset(30% 0 45% 0)} 75%{clip-path:inset(75% 0 5% 0)} 100%{clip-path:inset(0 0 90% 0)} }
@keyframes slice-b {
  0%{clip-path:inset(55% 0 20% 0)} 25%{clip-path:inset(5% 0 80% 0)}
  50%{clip-path:inset(70% 0 10% 0)} 75%{clip-path:inset(20% 0 60% 0)} 100%{clip-path:inset(40% 0 40% 0)} }
```
Scheduler (JS): for each `.glitch`, add `is-glitching` for 180 to 320ms at a random interval of 5 to 14 seconds; on hover or after an error, trigger immediately. Max one glitching element per viewport region at a time.

### 8.2 Tape tear (page transitions, route changes)
On navigation: 280 to 400ms. The old page is cut into 6 to 10 horizontal strips; each strip translates X by a random -40 to 40px and fades, then the new page strips snap in, with a brief tracking band sweeping down. Implement with CSS `clip-path: inset()` slices on a snapshot layer. Never block interaction longer than 400ms.

### 8.3 Flicker and instability
- Global "power" flicker: whole app opacity jitters between 0.93 and 1, 4 to 6 random steps, once every 20 to 40 seconds, under 250ms, never full-screen black.
- Hairline jitter: ASCII art and marks shift 1px on X at random for 80ms.
- Vertical hold slip: very rarely (once every 2 to 4 minutes), the main content shifts down 6 to 12px and snaps back over 300ms.

### 8.4 Text corruption
Occasionally (every 8 to 20s), 1 to 3 characters in a label or ASCII art are replaced with `░ ▒ ▓ █` for 100 to 250ms, then restored. Never applied to names, numbers, scholar IDs, grades, emails, or anything inside a form.
```js
function corrupt(el) {
  const t = el.textContent, i = Math.floor(Math.random()*t.length);
  if (/\s/.test(t[i])) return;
  el.textContent = t.slice(0,i) + '░▒▓█'[Math.floor(Math.random()*4)] + t.slice(i+1);
  setTimeout(() => el.textContent = t, 100 + Math.random()*150);
}
```

### 8.5 The Eye (login and idle screens)
The EYE art follows the cursor: compute the pointer angle from the eye center, pick one of 5 frames (center, left, right, up, down) with the pupil `@@` shifted. Blink (swap to EYE_CLOSED) for 120ms every 4 to 9 seconds. On a failed login it stares dead-center and stops blinking until the next input.

### 8.6 The Watcher (rare event)
1 to 2 percent chance per page view: after 20 to 60 seconds idle, WATCHER art fades in (2s fade) at the bottom-left corner at 20 percent opacity, and fades out (3s) when the pointer moves. Never during form entry, never over data, never while a modal is open. Not shown with "Reduce distortion".

### 8.7 Tracking error on slow requests
While a request is pending over 400ms: a tracking band sweeps down the main area and the OSD shows `TRACKING...`. On completion the band exits quickly. Replaces spinners.

### 8.8 Cursor and selection
- Caret: block cursor (`caret-shape: block` where supported, else a blinking `█` overlay).
- Text selection: inverted (`::selection { background:#fff; color:#000 }`).
- Hover on links: text jitters 1px for 120ms and a scratched underline draws in (stroke-dashoffset animation).

### 8.9 Sound (optional, default OFF)
Low tape hiss and a faint mechanical click on route change. Muted by default, opt-in toggle `SOUND: OFF`, remembered, never autoplays, and respects the OS mute.

### 8.10 Intensity levels
User-facing setting `DISTORTION: LOW / NORMAL / OFF`.

| Level | Behavior |
|---|---|
| NORMAL (default) | Everything in this section |
| LOW | Scanlines + vignette + static noise only; glitches 4x rarer; no Watcher, no tape tear |
| OFF | Static texture only (no animation), also forced by `prefers-reduced-motion: reduce` |

---

## 9. Components (no boxes)

### 9.1 Buttons
- **Primary:** inverted slab (white fill, black VT323 text) with **jagged left and right edges** via `clip-path`. Label ends with ` >>`. Hover: edges shift 2px, label jitters.
- **Secondary:** text with a scratched underline (SVG zigzag stroke), prefix `> `.
- **Destructive:** primary slab plus label `CONFIRM REVOKE`; requires typed confirmation for delete (section 11).
- Min hit area 44x44px even though the visual is ragged.
- Focus: a hand-drawn bracket pair `[ ]` appears around the control plus a 2px white outline offset 3px (never rely on only the effect).

```css
.btn-primary { background:#fff; color:#000; font:22px 'VT323',monospace; letter-spacing:.1em;
  padding:10px 28px; border:0;
  clip-path:polygon(0 8%, 4% 0, 12% 6%, 100% 0, 98% 40%, 100% 62%, 96% 100%, 8% 94%, 0 100%, 3% 50%); }
.btn-primary:focus-visible { outline:2px solid #fff; outline-offset:4px; }
```

### 9.2 Inputs
Underline only. A scratched line, no field box. Label above in VT323 uppercase. Placeholder is a faint underscore run `________`. Caret is a block. Error: the underline becomes jagged and the message appears in typewriter text under it starting with `FAULT:`. Never glitch the text inside.

### 9.3 Navigation
Top bar is the tape OSD: left `REC  CH 03`, center nothing, right live timestamp (IST). Below it the logo and nav as plain text items; active item is an inverted slab with jagged edges. On mobile the nav becomes a full-height "channel list" overlay (`CH 01 SEARCH`, `CH 02 TAPES`).

### 9.4 Record (the student "subject file")
Not a card. Layout:
- A **torn-paper strip** (white at 8 percent, ragged top/bottom via clip-path) behind the name only, rotated -1deg, reading `SUBJECT FILE // 25U020130`.
- Name in 46px VT323 with glitch.
- CPI at 80px with a soft glow (`text-shadow: 0 0 10px rgb(255 255 255 / .7)`).
- Semester results as a **ledger**: eight rows of typewriter text with dotted leaders, not tiles.
```
SEM 1 ........................ 8.60   [ PASS ]
SEM 2 ........................ 8.35   [ PASS ]
SEM 5 ........................ 8.40   [ WH ]
SEM 6 ........................ --     NO SIGNAL
```
- Admin-only fields appear as a redaction block (white bar, text invisible) with `ADMIN CLEARANCE ONLY`. For admins, the bar "peels" away (scale-X to 0 over 400ms).
- A stick-figure mark sits at the top-left; a tracked scholar gets the eye mark.

### 9.5 Surfaces (torn edges)
Use for modals, the record strip, and the announcement notice.
```css
.torn { background:rgb(255 255 255 / .08);
  clip-path:polygon(0 3%,6% 0,15% 4%,27% 1%,41% 5%,58% 0,73% 4%,88% 1%,100% 5%,
                    99% 38%,100% 71%,97% 100%,84% 96%,66% 100%,49% 95%,31% 100%,14% 96%,2% 100%,0 70%,1% 34%); }
```
Provide 4 variants of the polygon and pick one per instance (hash of id) so no two look identical.

### 9.6 Tables and lists (history, users, logs)
Typewriter rows with dotted leaders and a scratched rule between groups. Row hover: the row inverts. No zebra stripes, no cell borders.

### 9.7 Status chips
No pills. Plain bracketed words: `[ ACTIVE ]`, `[ PENDING ]`, `[ BLOCKED ]`. Blocked shows the X mark in front. Pending shows the open circle.

### 9.8 Progress and quota
Block-character meters, not bars: `LOOKUPS  12/60  ██░░░░░░░░` with finger-fluting mark. `role="img"` with an `aria-label` of the numbers.

### 9.9 Modals
A torn surface over a darkened, noise-boosted background. Title with glitch. Close control is the X mark. Enter animation is a tape tear. Focus is trapped; Escape closes.

### 9.10 Toasts
Single typewriter line at the bottom-left, prefixed `> `, auto-dismiss 5s, no box, with a faint scanline behind. Errors prefix `FAULT:`. Success prefix `RECEIVED:`.

### 9.11 Announcements
A **torn strip** across the top under the OSD, label `NOTICE` inverted, text typewriter. `critical` level adds a continuous slow tracking band behind it (not strobing).

### 9.12 Captcha (Cloudflare Turnstile)
The widget is an iframe and is boxy by nature. Set theme `dark`, wrap it in a ragged mask with ASCII corner fragments (top-left and bottom-right only), caption `VERIFYING SUBJECT IS HUMAN`. Do not overlay effects on the widget itself or tint it. After success, replace the surrounding caption with `[ OK ]`.

### 9.13 Tabs
Two or three words in VT323 with a scratched underline on the active one. No tab container.

---

## 10. Screens

### 10.1 Sign in ("Insert tape")
- Left two thirds: giant `RESBOT` (96 to 120px) with heavy glitch, EYE art beneath following the cursor, faint background pixel mosaic of a corridor at 8 percent.
- Right column: `AUTHENTICATE` heading, Google button as secondary-style text `> CONTINUE WITH GOOGLE`, divider `OR` in zigzag, email and password underline inputs, captcha, primary slab `SIGN IN >>`.
- Footer line: `ACCESS RESTRICTED TO @IIITBHOPAL.AC.IN` and a row of dots.
- Failed login: EYE stops blinking and stares; headline glitches once; message `FAULT: CREDENTIALS NOT RECOGNIZED.`
- Rejected domain: `FAULT: THIS ARCHIVE ONLY ACCEPTS INSTITUTE ADDRESSES.`

### 10.2 Pending approval
DOOR art centered, `YOUR TAPE IS WAITING TO BE WATCHED.` and `AN ADMINISTRATOR WILL OPEN THE DOOR.` Open-circle mark. Poll in the background; when approved, the door art "opens" (frame swap) and the page tears into Search.

### 10.3 Blocked
SKULL art, `ACCESS REVOKED.` plus the admin reason in typewriter text, and the X mark. No effects intensity change; keep it still and quiet.

### 10.4 Search ("Pull a tape")
- Big underline input labelled `ENTER NAME OR SCHOLAR NO.` with a spiral mark.
- Results list as ledger rows; a single exact match opens the subject file directly.
- Usage meters in the right margin as finger-fluting marks plus block meters.
- Captcha re-challenge appears inline: the page dims slightly and the text `VERIFY TO CONTINUE VIEWING.` shows with the Turnstile widget.
- Quota hit: `FAULT: DAILY TAPE LIMIT REACHED. RESETS IN 07:12:40.` with a countdown in VT323.

### 10.5 Subject file
See 9.4. Back control: `<< REWIND`. Admin extras: `TRACK THIS SUBJECT` secondary action, registration data block revealed under the redaction peel.

### 10.6 AI assistant ("The archive speaks")
- A conversation as a **transcript**, not chat bubbles. User lines prefixed `> `, replies in typewriter text prefixed `ARCHIVE:`.
- Replies appear with a **stutter-type** effect (variable per-character delay, occasional 100ms hold) and finish clean. Total typing time capped at 1.5s; skip on click.
- Cached replies show the label `REPLAY`. Refusals show a short static line, `THE ARCHIVE WILL NOT ANSWER THAT.`
- Markdown from the API is rendered as plain typewriter text with no raw HTML.

### 10.7 My history
Timeline as a row of dots down the left margin with timestamps in VT323 and queries in typewriter text.

### 10.8 Admin ("Control room")
- Left: channel list `CH 01 DASHBOARD` through `CH 13 AUDIT LOG` in VT323, active channel inverted. Sun mark at the top.
- Dashboard: three large numbers in 60px VT323 with labels, no boxes, separated by zigzag dividers.
- Alerts page `INCIDENT LOG`: each incident is a typewriter paragraph with the incident number, a torn label for its type (`SPECIAL HIT`, `BATCH SWEEP`, `ENUMERATION`), the hunters mark for sweeps and the eye mark for special hits, and three text actions: `WARN`, `REVOKE` (inverted slab), `DISMISS`.
- Destructive actions require a typed confirmation in a torn modal.
- Admin screens use LOW distortion by default so work stays legible; user can raise it.

### 10.9 Empty, loading, and error states
| State | Treatment |
|---|---|
| Loading | Tracking band + `TRACKING...` + static bar |
| Empty | HAND art + one-line typewriter message |
| 404 | NO SIGNAL art + `THIS CHANNEL DOES NOT EXIST.` |
| 500 | Heavy glitch headline `FAULT` + `THE TAPE IS DAMAGED. TRY AGAIN.` |
| Offline | Frozen frame effect (image desaturates, scanlines stop) + `SIGNAL LOST.` |

---

## 11. Copy and tone

- Terse, procedural, slightly wrong. Clarity first: every message must still tell the user what to do.
- Uppercase for labels and system messages; sentence case for explanations.
- Phrase bank: `PULL A TAPE`, `SUBJECT FILE`, `NO SIGNAL`, `REWIND`, `TRACKING...`, `VERIFY TO CONTINUE VIEWING`, `RECEIVED`, `FAULT`, `ACCESS REVOKED`, `THE ARCHIVE WILL NOT ANSWER THAT`, `THIS TAPE HAS BEEN WATCHED N TIMES`.
- No jokes, no gore, no real names in decorative text, no references to real people or tragedies. Dread by implication.
- Never use scary copy for destructive-action confirmations; keep those plain: `Type the user's email to confirm.`
- Placeholder data uses brackets: `[name]@iiitbhopal.ac.in`.

---

## 12. Accessibility and safety

- Contrast: body text `--bone-80` or higher on black (above 7:1). Minimum informational opacity `--bone-60`.
- All decorative layers and ASCII art: `aria-hidden="true"`. Meaningful art: `role="img"` + label.
- `prefers-reduced-motion: reduce` disables all animation, tape tear, flicker, the Watcher, and noise movement. Static scanlines and vignette remain.
- Photosensitivity: no element changes brightness more than 3 times per second; no flash covers more than 25 percent of the viewport; flicker amplitude stays within 7 percent of luminance.
- A persistent footer control `DISTORTION: NORMAL / LOW / OFF` and `SOUND: OFF / ON`. Preference is stored client-side and applied before first paint to avoid a flash.
- Keyboard: every interactive element is focusable with a visible focus state (section 9.1). Glitching never moves focus targets more than 2px.
- Screen readers get clean text: the visible glitch copies use `data-text` pseudo-elements, so the real text node is unchanged.
- Touch targets at least 44px. Hover-only effects have a focus equivalent.

---

## 13. Responsive

| Width | Behavior |
|---|---|
| 1200+ | Full art, side columns, all effects |
| 768 to 1199 | Background art reduced, single main column with offset |
| under 768 | Nav becomes channel overlay, ASCII hero at 60 percent size, background mosaic and the Watcher hidden, noise opacity halved |

Mobile devices default to LOW distortion to save battery.

---

## 14. Performance

- Effects use only `transform`, `opacity`, and `clip-path`; no layout-triggering animation.
- Global noise is one tiled PNG (under 20 KB) animated by `background-position`.
- Glitch scheduler uses one shared timer, not one per element.
- Pause all effects when the tab is hidden (`visibilitychange`) and while the user is typing.
- Fonts: preload VT323 and Special Elite, `font-display: swap`; total under 120 KB.
- ASCII art loads as text modules, not images.
- Budget: first interactive under 2.5s on mid-range mobile, no effect drops the page below 50 fps; if the frame rate does, auto-step distortion down one level.

---

## 15. Implementation notes

- Stack: React + Vite, CSS variables for tokens, no UI component library (it will drag in rounded boxy defaults).
- Folders:
```
web/src/
  fx/        Scanlines.jsx, Noise.jsx, Vignette.jsx, TrackingBand.jsx, scheduler.js
  art/       eye.txt, hand.txt, watcher.txt, skull.txt, door.txt, nosignal.txt
  marks/     Mark.jsx + svg paths (spiral, zigzag, sun, hand, hunters, eye, x, circle, bison)
  ui/        Button, Underline Input, Ledger, TornSurface, Meter, Toast, Modal, Nav, Redaction
  styles/    tokens.css, texture.css, glitch.css, type.css
  settings/  distortion.js (LOW/NORMAL/OFF, stored in localStorage, applied pre-paint)
```
- Page `<title>`: plain text, e.g. `RESBOT // SEARCH`. No emoji, no symbols from outside the allowed set.
- Emoji lint (CI and pre-commit): fail if any source file, string, or built bundle matches an emoji range.
```bash
# fails on emoji / pictograph code points in source
grep -RInP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{1F000}-\x{1F2FF}\x{FE0F}]" web/src docs server && exit 1 || exit 0
```
(The allowed block-element and box-drawing characters live outside those ranges.)
- Lint for banned styles: fail on `border-radius` values above 0 outside of the Turnstile wrapper, and on `box-shadow` other than the soft white glow tokens.

---

## 16. Acceptance checklist

- [ ] No emoji in the built bundle (grep passes), favicon is a theme SVG.
- [ ] Palette is only `#000` and `#fff` plus alpha variants.
- [ ] No rounded cards, pills, or four-sided bordered containers outside the Turnstile wrapper.
- [ ] Every screen in section 10 matches its description, including empty, loading, error, offline states.
- [ ] Glitch applies only to headings, labels, and decoration; never to data or form fields.
- [ ] ASCII art library and cave-mark components exist and are `aria-hidden` unless meaningful.
- [ ] DISTORTION toggle works (NORMAL / LOW / OFF) and `prefers-reduced-motion` forces OFF.
- [ ] No flashing over 3 per second; verified with a frame-by-frame capture.
- [ ] Keyboard-only walkthrough of login, search, subject file, AI, admin works with visible focus.
- [ ] Lighthouse accessibility score of 95 or higher; contrast checks pass.
- [ ] Mobile defaults to LOW distortion; frame rate holds at or above 50 fps on a mid-range phone.