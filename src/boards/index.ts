import type { Board } from "./Board";
import { VolcanoBoard } from "./VolcanoBoard";
import { BalloonBoard } from "./BalloonBoard";
import { UnderwaterBoard } from "./UnderwaterBoard";
import { BridgeBoard } from "./BridgeBoard";

export interface BoardEntry {
  id: string;
  make: () => Board;
  accent: number;
}

export const BOARDS: BoardEntry[] = [
  { id: "balloon", make: () => new BalloonBoard(), accent: 0x5fb7ef },
  { id: "bridge", make: () => new BridgeBoard(), accent: 0xe08a4e },
  { id: "underwater", make: () => new UnderwaterBoard(), accent: 0x1f86a8 },
  { id: "volcano", make: () => new VolcanoBoard(), accent: 0xd8631f },
];

export function boardById(id: string): Board {
  return (BOARDS.find((b) => b.id === id) ?? BOARDS[0]).make();
}
