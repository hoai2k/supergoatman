import type { Board } from "./Board";
import { VolcanoBoard } from "./VolcanoBoard";
import { BalloonBoard } from "./BalloonBoard";
import { UnderwaterBoard } from "./UnderwaterBoard";
import { BridgeBoard } from "./BridgeBoard";
import { CastleBoard } from "./CastleBoard";
import { TidepoolsBoard } from "./TidepoolsBoard";
import { TundraBoard } from "./TundraBoard";
import { FarmBoard } from "./FarmBoard";
import { GeometryBoard } from "./GeometryBoard";
import { VoxelBoard } from "./VoxelBoard";
import { DungeonBoard } from "./DungeonBoard";

export interface BoardEntry {
  id: string;
  make: () => Board;
  accent: number;
}

export const BOARDS: BoardEntry[] = [
  { id: "balloon", make: () => new BalloonBoard(), accent: 0x5fb7ef },
  { id: "castle", make: () => new CastleBoard(), accent: 0xff5fa2 },
  { id: "bridge", make: () => new BridgeBoard(), accent: 0xe08a4e },
  { id: "farm", make: () => new FarmBoard(), accent: 0x8fd94b },
  { id: "tidepools", make: () => new TidepoolsBoard(), accent: 0x3fd0d9 },
  { id: "underwater", make: () => new UnderwaterBoard(), accent: 0x1f86a8 },
  { id: "tundra", make: () => new TundraBoard(), accent: 0x9db8ff },
  { id: "voxel", make: () => new VoxelBoard(), accent: 0x7ec850 },
  { id: "geometry", make: () => new GeometryBoard(), accent: 0xb07bff },
  { id: "dungeon", make: () => new DungeonBoard(), accent: 0xd96b3f },
  { id: "volcano", make: () => new VolcanoBoard(), accent: 0xd8631f },
];

export function boardById(id: string): Board {
  return (BOARDS.find((b) => b.id === id) ?? BOARDS[0]).make();
}
