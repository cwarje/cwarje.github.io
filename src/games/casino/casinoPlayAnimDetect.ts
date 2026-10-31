import { getCaptureOutcomeFromPreview } from './logic';
import type {
  Card,
  CasinoActionAnnouncement,
  CasinoState,
  TableItem,
  TableSlot,
} from './types';
import { cardEquals } from './types';

export type CasinoPlayAnimIntent =
  | {
      kind: 'capture-preview-play';
      playerId: string;
      playedCard: Card;
      capturedSlotIndices: number[];
    }
  | {
      kind: 'announcement-hand-to-table';
      playerId: string;
      playedCard: Card;
      targetSlotIndex: number;
      announcementKind: 'trail' | 'build' | 'extend-build';
    }
  | {
      kind: 'capture-to-seat';
      playerId: string;
      capturedCards: Card[];
      /** Cards to fly from each table slot (prev layout). */
      slotFlights: { slotIndex: number; cards: Card[] }[];
      /** Played card origin for immediate sweep (never went through capture preview). */
      playedFromHand: Card | null;
      /** Played card sitting on table during capture preview — fly from preview slot, not hand. */
      playedFromPreview: { card: Card; slotIndices: number[] } | null;
    }
  | {
      kind: 'table-only-group';
      playerId: string;
      targetSlotIndex: number;
      /** One card (or top representative) per source slot. */
      sourceFlights: { slotIndex: number; card: Card }[];
    };

function announcementKey(ann: CasinoActionAnnouncement | null): string | null {
  if (!ann) return null;
  if (ann.kind === 'capture') {
    return `capture-${ann.playerId}-${ann.capturedCards.map(c => `${c.rank}${c.suit}`).join(',')}`;
  }
  if (ann.kind === 'build') {
    return `build-${ann.playerId}-${ann.playedCard.rank}${ann.playedCard.suit}`;
  }
  if (ann.kind === 'extend-build') {
    return `extend-${ann.playerId}-${ann.playedCard.rank}${ann.playedCard.suit}-${ann.declaredValue}`;
  }
  return `trail-${ann.playerId}-${ann.playedCard.rank}${ann.playedCard.suit}`;
}

function slotLength(slots: TableSlot[]): number {
  return Math.max(slots.length, 0);
}

function maxSlotIndex(a: TableSlot[], b: TableSlot[]): number {
  return Math.max(slotLength(a), slotLength(b)) - 1;
}

function tableItemSignature(item: TableItem | null | undefined): string {
  if (!item) return '';
  if (item.kind === 'card') return `c:${item.card.rank}${item.card.suit}`;
  const top = item.build.cards[item.build.cards.length - 1];
  return `b:${item.build.value}:${item.build.groupCount}:${top?.rank}${top?.suit}:${item.build.cards.length}`;
}

export function findTrailTargetSlot(
  prev: TableSlot[],
  next: TableSlot[],
  playedCard: Card,
): number | null {
  const limit = maxSlotIndex(prev, next);
  for (let i = 0; i <= limit; i++) {
    const wasEmpty = (prev[i] ?? null) == null;
    const now = next[i] ?? null;
    if (wasEmpty && now?.kind === 'card' && cardEquals(now.card, playedCard)) {
      return i;
    }
  }
  return null;
}

export function findBuildTargetSlot(
  prev: TableSlot[],
  next: TableSlot[],
  playedCard: Card,
): number | null {
  const limit = maxSlotIndex(prev, next);
  for (let i = 0; i <= limit; i++) {
    const now = next[i];
    if (now?.kind !== 'build') continue;
    if (!now.build.cards.some(c => cardEquals(c, playedCard))) continue;
    const before = prev[i];
    if (before?.kind === 'build' && tableItemSignature(before) === tableItemSignature(now)) {
      continue;
    }
    return i;
  }
  return null;
}

export function findExtendBuildTargetSlot(
  prev: TableSlot[],
  next: TableSlot[],
  playedCard: Card,
): number | null {
  const limit = maxSlotIndex(prev, next);
  for (let i = 0; i <= limit; i++) {
    const before = prev[i];
    const now = next[i];
    if (before?.kind !== 'build' || now?.kind !== 'build') continue;
    if (now.build.cards.length <= before.build.cards.length) continue;
    const added = now.build.cards[now.build.cards.length - 1];
    if (added && cardEquals(added, playedCard)) return i;
  }
  return null;
}

function cardsFromTableItem(item: TableItem): Card[] {
  if (item.kind === 'card') return [item.card];
  return [...item.build.cards];
}

function representativeCard(item: TableItem): Card {
  if (item.kind === 'card') return item.card;
  return item.build.cards[item.build.cards.length - 1]!;
}

/** Map captured cards to prev table slot positions for fly-out animation. */
export function buildCaptureSlotFlights(
  prevSlots: TableSlot[],
  capturedSlotIndices: number[],
  playedCard: Card,
  capturedCards: Card[],
): { slotFlights: { slotIndex: number; cards: Card[] }[]; playedFromHand: Card | null } {
  const slotFlights: { slotIndex: number; cards: Card[] }[] = [];
  const assigned = new Set<string>();

  const markAssigned = (c: Card) => assigned.add(`${c.rank}-${c.suit}`);

  for (const idx of capturedSlotIndices) {
    const item = prevSlots[idx];
    if (!item) continue;
    const cards = cardsFromTableItem(item);
    for (const c of cards) markAssigned(c);
    slotFlights.push({ slotIndex: idx, cards });
  }

  let playedFromHand: Card | null = null;
  if (capturedCards.some(c => cardEquals(c, playedCard))) {
    const onTable = capturedSlotIndices.some(idx => {
      const item = prevSlots[idx];
      return item && cardsFromTableItem(item).some(c => cardEquals(c, playedCard));
    });
    if (!onTable) playedFromHand = playedCard;
  }

  return { slotFlights, playedFromHand };
}

export function detectTableOnlyGroupIntent(
  prev: CasinoState,
  next: CasinoState,
): CasinoPlayAnimIntent | null {
  if (prev.phase !== 'playing' || next.phase !== 'playing') return null;
  if (prev.currentPlayerIndex !== next.currentPlayerIndex) return null;
  if (prev.pendingCapturePreview || next.pendingCapturePreview) return null;
  if (announcementKey(prev.actionAnnouncement) !== announcementKey(next.actionAnnouncement)) {
    return null;
  }

  const pi = prev.currentPlayerIndex;
  const prevHand = prev.players[pi]?.hand.length ?? 0;
  const nextHand = next.players[pi]?.hand.length ?? 0;
  if (prevHand !== nextHand) return null;

  const prevSlots = prev.tableSlots;
  const nextSlots = next.tableSlots;
  const limit = maxSlotIndex(prevSlots, nextSlots);

  let targetSlotIndex: number | null = null;
  for (let i = 0; i <= limit; i++) {
    const was = prevSlots[i] ?? null;
    const now = nextSlots[i] ?? null;
    if (now?.kind === 'build' && tableItemSignature(was) !== tableItemSignature(now)) {
      targetSlotIndex = i;
      break;
    }
  }
  if (targetSlotIndex == null) return null;

  const sourceFlights: { slotIndex: number; card: Card }[] = [];
  for (let i = 0; i <= limit; i++) {
    const was = prevSlots[i];
    if (!was) continue;
    const now = nextSlots[i] ?? null;
    if (now == null) {
      sourceFlights.push({ slotIndex: i, card: representativeCard(was) });
      continue;
    }
    if (i === targetSlotIndex && now.kind === 'build' && was.kind === 'card') {
      sourceFlights.push({ slotIndex: i, card: was.card });
    }
  }

  if (sourceFlights.length < 2) return null;

  const player = next.players[next.currentPlayerIndex];
  if (!player) return null;

  return {
    kind: 'table-only-group',
    playerId: player.id,
    targetSlotIndex,
    sourceFlights,
  };
}

export function detectCasinoPlayAnimIntent(
  prev: CasinoState,
  next: CasinoState,
): CasinoPlayAnimIntent | null {
  if (!prev.pendingCapturePreview && next.pendingCapturePreview) {
    const preview = next.pendingCapturePreview;
    return {
      kind: 'capture-preview-play',
      playerId: preview.playerId,
      playedCard: preview.playedCard,
      capturedSlotIndices: preview.capturedSlotIndices,
    };
  }

  const prevAnnKey = announcementKey(prev.actionAnnouncement);
  const nextAnnKey = announcementKey(next.actionAnnouncement);
  const newAnnouncement =
    next.actionAnnouncement != null && prevAnnKey !== nextAnnKey;

  if (prev.pendingCapturePreview && !next.pendingCapturePreview) {
    const preview = prev.pendingCapturePreview;
    const captureAnnouncement =
      next.actionAnnouncement?.kind === 'capture' ? next.actionAnnouncement : null;
    const outcome = getCaptureOutcomeFromPreview(prev, preview);
    if (!outcome && !captureAnnouncement) return null;
    const capturedCards = captureAnnouncement?.capturedCards ?? outcome!.capturedCards;
    const { slotFlights } = buildCaptureSlotFlights(
      prev.tableSlots,
      preview.capturedSlotIndices,
      preview.playedCard,
      capturedCards,
    );
    return {
      kind: 'capture-to-seat',
      playerId: preview.playerId,
      capturedCards,
      slotFlights,
      playedFromHand: null,
      playedFromPreview: {
        card: preview.playedCard,
        slotIndices: preview.capturedSlotIndices,
      },
    };
  }

  if (newAnnouncement && next.actionAnnouncement?.kind === 'capture' && !prev.pendingCapturePreview) {
    const ann = next.actionAnnouncement;
    const indices = prev.tableSlots
      .map((item, i) => (item ? i : -1))
      .filter(i => i >= 0);
    const playedCard = ann.capturedCards[0]!;
    const { slotFlights, playedFromHand } = buildCaptureSlotFlights(
      prev.tableSlots,
      indices,
      playedCard,
      ann.capturedCards,
    );
    return {
      kind: 'capture-to-seat',
      playerId: ann.playerId,
      capturedCards: ann.capturedCards,
      slotFlights,
      playedFromHand: playedFromHand ?? playedCard,
      playedFromPreview: null,
    };
  }

  if (newAnnouncement && next.actionAnnouncement) {
    const ann = next.actionAnnouncement;
    if (ann.kind === 'trail') {
      const target = findTrailTargetSlot(prev.tableSlots, next.tableSlots, ann.playedCard);
      if (target == null) return null;
      return {
        kind: 'announcement-hand-to-table',
        playerId: ann.playerId,
        playedCard: ann.playedCard,
        targetSlotIndex: target,
        announcementKind: 'trail',
      };
    }
    if (ann.kind === 'build') {
      const target = findBuildTargetSlot(prev.tableSlots, next.tableSlots, ann.playedCard);
      if (target == null) return null;
      return {
        kind: 'announcement-hand-to-table',
        playerId: ann.playerId,
        playedCard: ann.playedCard,
        targetSlotIndex: target,
        announcementKind: 'build',
      };
    }
    if (ann.kind === 'extend-build') {
      const target = findExtendBuildTargetSlot(prev.tableSlots, next.tableSlots, ann.playedCard);
      if (target == null) return null;
      return {
        kind: 'announcement-hand-to-table',
        playerId: ann.playerId,
        playedCard: ann.playedCard,
        targetSlotIndex: target,
        announcementKind: 'extend-build',
      };
    }
  }

  return detectTableOnlyGroupIntent(prev, next);
}
