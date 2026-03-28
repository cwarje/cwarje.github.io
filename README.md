# Cam's Favourite Games

A browser-based multiplayer game suite built with React, TypeScript, Vite, and PeerJS.

This project runs fully peer-to-peer in the browser: one player hosts a lobby and acts as the authoritative game server, while other players connect directly using a 4-character room code.

## Games included

Current game types (from `src/games/registry.ts` and `src/networking/types.ts`):

- `mobilization` (4-6 players)
- `byggkasino` (2-4 players; optional `byggkasinoMatchLength` in start options: `to11`, `to21`, or `eachDealerOnce` — default `to21`)
- `yahtzee` (1-4 players)
- `farkle` (2-6 players; target score 3000, 5000, or 10000)
- `hearts` (4 players; target score 50 or 100)
- `battleship` (2 players)
- `liars-dice` (2-4 players)
- `poker` (2-8 players)
- `up-and-down-the-river` (4-6 players; start order `up-down` or `down-up`)
- `twelve` (2-4 players; UI title **Tolva** — table piles, pile count 3-6)
- `settler` (3-4 players)
- `cross-crib` (2 or 4 players only)

**Production** home page and game picker use `PRODUCTION_GAME_TYPES` in `registry.ts`: mobilization, byggkasino, yahtzee, hearts, twelve, settler, up-and-down-the-river, farkle, cross-crib, poker.

**Dev-only** (`production: false`): battleship and liars-dice.

## Key features

- Host-authoritative multiplayer state sync over WebRTC (PeerJS)
- No dedicated backend required for gameplay state
- Room code join flow (`ABCD` format -> `cfg-ABCD` peer IDs)
- Bot players with host-side delayed turn scheduling
- Reconnect flow with exponential backoff and grace-period disconnect handling
- GitHub Pages deployment via GitHub Actions on push to `master`

## Architecture

### High-level system view

```mermaid
flowchart LR
  browserHost[HostBrowser]
  browserClient[ClientBrowser]
  roomProvider[RoomProvider]
  peerLayer[PeerLayerPeerJS]
  gameEngine[GameEngine]
  gameBoards[GameBoards]
  gameLogic[GameLogicModules]
  localStorage[LocalStorage]

  browserHost --> roomProvider
  browserClient --> roomProvider
  roomProvider --> peerLayer
  roomProvider --> gameEngine
  gameEngine --> gameLogic
  browserHost --> gameBoards
  browserClient --> gameBoards
  gameBoards --> roomProvider
  roomProvider --> localStorage
```

### Runtime message flow

```mermaid
sequenceDiagram
  participant host as HostBrowser
  participant client as ClientBrowser
  participant room as RoomProviderHost
  participant engine as GameEngine

  client->>host: join(roomCode, playerName, deviceId)
  host->>client: room-state
  host->>client: game-state (if already playing)
  host->>room: startGame(gameType)
  room->>engine: createInitialGameState()
  room->>client: room-state + game-state
  client->>host: action(payload)
  host->>engine: processGameAction(payload, senderId)
  engine-->>host: newGameState
  host->>client: game-state(newGameState)
```

### Core design invariants

- Host is always the source of truth for room and game state.
- Clients never mutate authoritative state directly; they send actions.
- Game logic is isolated per game module and orchestrated through `src/games/gameEngine.ts`, which dispatches via `src/games/registry.ts`.
- Bots run on the host side and follow the same action pipeline as humans.

## How the project works

### App shell and routing

- Entry point: `src/main.tsx`
- Root providers + routes: `src/App.tsx`
- Routes:
  - `/` -> `src/pages/Home.tsx`
  - `/game/:roomCode` -> `src/pages/GamePage.tsx`

### Lobby and game lifecycle

1. User lands on `Home`.
2. If no name in localStorage, a prompt is shown (`playerName`, `playerColor`).
3. Host creates lobby (`createLobby`) with generated room code.
4. Clients join using room code (`joinRoom`).
5. Host selects game and starts (`startGame`).
6. Clients and host transition to `GamePage`.
7. During play, actions are processed by host and broadcast as full game-state snapshots.
8. Non-poker games transition to `finished`, then host can return to lobby and wins are tracked.

### Networking model

Main files:

- `src/networking/roomStore.tsx` (state authority and orchestration)
- `src/networking/peer.ts` (PeerJS setup/connect/destroy)
- `src/networking/types.ts` (shared network contracts)
- `src/utils/roomCode.ts` (room code and peer ID mapping)
- `src/utils/deviceId.ts` (persistent device identity)

Important message types:

- Client -> host: `join`, `update-profile`, `action`, `leave`, `ready`
- Host -> client: `room-state`, `game-state`, `error`, `kicked`, `host-disconnected`

Reconnect behavior:

- Clients attempt reconnect with backoff (1s, 2s, 4s).
- Host applies a 15s grace period before marking players disconnected.
- Rejoining clients can receive in-progress `game-state` immediately.

## Project structure

```text
src/
  components/        # Shared UI components
  games/             # Game registry, engine, and per-game modules
    registry.ts      # Single source of truth for all game definitions
    gameEngine.ts    # Orchestrates logic via registry lookups
    <game-name>/     # Per-game types, logic, board, and optional options/HUD
  networking/        # Peer/network state and messaging
  pages/             # Route-level pages (Home/GamePage)
  utils/             # Device ID and room code helpers
```

## Local development

### Prerequisites

- Node.js 20+ recommended
- npm

### Install and run

```bash
npm install
npm run dev
```

### Quality checks and production build

```bash
npm run lint
npm run typecheck
npm run test
npm run test:watch
npm run test:e2e
npm run build
npm run preview
```

Scripts are defined in `package.json`:

- `dev`: run Vite dev server
- `build`: `tsc -b && vite build`
- `lint`: ESLint over project files
- `typecheck`: TypeScript project reference checks without emit
- `test`: run Vitest unit/component suites
- `test:watch`: run Vitest in watch mode
- `test:coverage`: run Vitest with coverage output
- `test:e2e`: run Playwright smoke tests
- `preview`: serve built app locally
- `ci`: run lint, typecheck, unit tests, and build locally (does not run Playwright; use `npm run test:e2e` for that)

### Local troubleshooting

- If joining fails, verify room code format is 4 chars and host is online.
- If connections time out, refresh both host/client tabs and recreate lobby.
- If identity behavior seems odd, inspect localStorage keys: `deviceId`, `playerName`, `playerColor`.

## Build and deployment

Build stack:

- Vite + React (`vite.config.ts`)
- TypeScript project references (`tsconfig.app.json`, `tsconfig.node.json`)
- ESLint flat config (`eslint.config.js`)
- Tailwind v4 via Vite plugin

Deployment:

- Validation workflow: `.github/workflows/ci.yml`
  - Triggers on pull requests and pushes to `master`
  - Parallel jobs: lint + typecheck, unit tests (`vitest run`), production build, Playwright smoke tests (Chromium)
- Deployment workflow: `.github/workflows/deploy.yml`
  - Triggers on push to `master` (or manual workflow dispatch)
  - Builds and deploys `dist/` to GitHub Pages

## Adding a new game

Use this checklist when extending the platform. The game registry centralizes all per-game configuration, so adding a game requires edits in only three places.

1. **Add type** in `src/networking/types.ts`
   - Extend the `GameType` union with your game key (e.g. `'my-game'`).
   - Add any new game-start options to `GameStartOptions` if needed.

2. **Create game module** `src/games/<game-name>/`
   - `types.ts` — state and action types
   - `logic.ts` — `createState`, `processAction`, `isOver`, `runBotTurn`, `getWinners`
   - `<GameName>Board.tsx` — React board component
   - (optional) `rules.ts` — rule helpers
   - (optional) `*Options.tsx` — start options panel (e.g. Hearts target, Twelve pile count)
   - (optional) `*TitleExtra.tsx` / `*ToolbarExtra.tsx` — HUD content

3. **Register the game** in `src/games/registry.ts`
   - Add one entry to `GAME_REGISTRY` with metadata, theme, logic functions, Board component, and optional OptionsPanel/HUD components.
   - Set `production: true` to include it in production builds, or `false` for dev-only.

All other wiring (GamePage, Home, GameCard, GameEngine) is derived from the registry automatically.

### Conventions to follow

- Treat game state as immutable.
- Invalid actions should return unchanged state.
- Validate current player before applying an action.
- Keep bot logic idempotent and host-driven.
- Keep engine-level interfaces generic (`unknown`) and cast inside game modules.

## Contributor playbook

Use this map to find where changes should go quickly:

- UI styling/layout tweaks -> `src/components/*`, `src/pages/*`, `src/index.css`
- Lobby/network behavior -> `src/networking/roomStore.tsx`, `src/networking/peer.ts`
- Game rule bugs/features -> `src/games/<game>/logic.ts` and `src/games/<game>/types.ts`
- Cross-game orchestration -> `src/games/gameEngine.ts`
- Game metadata, themes, and discoverability -> `src/games/registry.ts`

Recommended implementation workflow:

1. Identify whether change is UI-only, game-specific logic, or networking.
2. Keep host-authoritative data flow intact (clients send actions only).
3. Run `npm run lint` and `npm run build`.
4. If changing a game, manually test at least one host + one client browser flow.

## Tech stack

- React 19
- React Router 7
- TypeScript 5
- Vite 7
- PeerJS
- Tailwind CSS v4
- Framer Motion
- Lucide React (icons)
