---
name: Hearts UI refresh (non-scroll hand)
overview: Redesign the Hearts board to match the reference table layout, with a non-scroll, single-row hand that dynamically overlaps cards to fit small screens, centers itself, and grays out unplayable cards.
todos:
  - id: refactor-heartsboard-table-layout
    content: "Refactor `HeartsBoard.tsx` to new table grid: seat mapping, player HUD placement, center trick slots, white/black styling inside board."
    status: completed
  - id: dynamic-overlap-hand-non_scroll
    content: Implement single-row hand that dynamically adjusts overlap to fit available width (no scroll), centers the spread, and uses non-overlapping hitboxes for reliable taps.
    status: completed
  - id: unplayable-card-grayout
    content: Apply consistent disabled+grayout styling for illegal plays (rules + not-your-turn + trickWinner).
    status: completed
  - id: shared-validity-rules
    content: Create `src/games/hearts/rules.ts` and use it from both `logic.ts` and `HeartsBoard.tsx` to keep validity rules identical.
    status: completed
  - id: hearts-specific-css
    content: Add Hearts-scoped CSS in `src/index.css` for white background + medium black borders + slots + disabled cards + hand stacking/hitboxes.
    status: completed
isProject: false
---

### What changed vs prior plan

- **No horizontal scrolling for the hand** on small screens.
- The hand always fits in **one row** by increasing **overlap only as needed**.
- With fewer cards, overlap returns to a **default** amount; if the spread is narrower than the screen, it stays **visually centered**.

### What will change

- **Hearts board layout** redesigned into a “table”:
  - You at the **bottom**.
  - Opponents on **left / top / right**.
  - A **center play area** with 4 fixed “card slots” arranged like the screenshot.
- **Your hand** becomes a **single-row stacked spread** (no wrap, no scroll):
  - Uses a default overlap when it fits.
  - Increases overlap when necessary so the whole hand fits widthwise.
  - Centers itself when the spread is narrower than the available width.
- **Unplayable cards** are **disabled + grayed out**.
- **Styling**: Hearts board area uses **white background** and **medium-thickness black borders**.

### Key files

- Main UI work: `[src/games/hearts/HeartsBoard.tsx](/Users/warje/git/cams-favourite-games/src/games/hearts/HeartsBoard.tsx)`
- Shared styling utilities: `[src/index.css](/Users/warje/git/cams-favourite-games/src/index.css)`
- Keep rules consistent between engine + UI:
  - `[src/games/hearts/logic.ts](/Users/warje/git/cams-favourite-games/src/games/hearts/logic.ts)`
  - new `[src/games/hearts/rules.ts](/Users/warje/git/cams-favourite-games/src/games/hearts/rules.ts)`

### Implementation approach

- **Seat mapping** (relative to `myId`) so player positions stay consistent:
  - `seat = (playerIndex - myIndex + 4) % 4`
  - seats: `0=bottom(me), 1=left, 2=top, 3=right`
- **Center trick slots**:
  - Render 4 fixed slot containers (light gray fill, black border).
  - Map each `currentTrick` entry into its owner’s slot.
- **Non-scroll hand (dynamic overlap)**:
  - Render the hand in a **relative container** with a computed spread width.
  - Measure available width with `ResizeObserver`.
  - Choose:
    - `cardW`: fixed/clamped size per breakpoint.
    - `defaultStep`: horizontal increment between cards (less than `cardW` so they overlap).
    - `step = min(defaultStep, (availableW - cardW) / max(1, n-1))` so the spread always fits.
    - `spreadW = cardW + step*(n-1)`
  - Centering: place the spread in a full-width row with `justify-center` (or set left offset to `(availableW - spreadW)/2`).
  - **Tap-target reliability when overlap is high**:
    - Use a per-card **hitbox** that does **not** overlap: width is `step` for all but the last card (last gets `cardW`).
    - Inside each hitbox, render the full-width card visual with `position:absolute` + `overflow:visible` so visuals overlap but click areas don’t.
    - Maintain z-order so later cards appear “on top”.
- **Unplayable card grayout**:
  - Continue using `disabled` logic (phase/turn/trickWinner + rule check).
  - Add Hearts-specific class to apply grayscale + reduced opacity.
- **Single-source rules**:
  - Create `rules.ts` exporting `isValidHeartsPlay(state, playerIndex, card)`.
  - Update `logic.ts` (bots + action processing) and `HeartsBoard.tsx` to use it.

### Styling updates

- Add Hearts-scoped CSS helpers in `[src/index.css](/Users/warje/git/cams-favourite-games/src/index.css)`:
  - `.hearts-board` (white background / black border baseline)
  - `.hearts-slot` (placeholder slot styling)
  - `.hearts-card--disabled` (grayout)
  - `.hearts-hand`, `.hearts-handHitbox`, `.hearts-handCard` (stacking + hitbox behavior)

### Test plan (manual)

- Verify seat positions (me bottom; bots left/top/right).
- Verify center slots are correct for each player as cards are played.
- On small screens: hand never scrolls, fits in one row, expands overlap only when needed, and stays centered when not full-width.
- Verify grayed cards are not clickable and correspond to Hearts rules + turn state.

