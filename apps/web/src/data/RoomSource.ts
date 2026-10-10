/** Everything the room page needs to compute a verdict, before any calculation. */
export interface RoomInput {
  readonly roomId: string;
  readonly roomName: string;
  readonly asOf: string;
  readonly insidePm25: number | null;
  readonly insideObservedAt: string | null;
  readonly rhPct: number | null;
  readonly outsidePm25: number | null;
  readonly outsideObservedAt: string | null;
  readonly lastSeenMinutes: number | null;
  /** True when the numbers are sample data, so the screen can say so. */
  readonly simulated: boolean;
}

/** Where a room's readings come from. The app depends on this interface, not a particular unit. */
export interface RoomSource {
  load(roomId: string): Promise<RoomInput>;
}
