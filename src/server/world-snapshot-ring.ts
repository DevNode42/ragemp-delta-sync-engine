import { EntityKinematics } from '../protocol/delta-codec';

interface SnapshotSlot {
  tick: number;
  entities: Map<number, EntityKinematics>;
}

export class WorldSnapshotRing {
  private readonly slots: SnapshotSlot[];
  private readonly capacity: number;

  constructor(capacity = 64) {
    this.capacity = capacity;
    this.slots = Array.from({ length: capacity }, () => ({
      tick: -1,
      entities: new Map(),
    }));
  }

  commit(tick: number, entities: readonly EntityKinematics[]): void {
    const slot = this.slots[tick % this.capacity]!;
    slot.tick = tick;
    slot.entities.clear();

    for (let i = 0; i < entities.length; i++) {
      const e = entities[i]!;
      slot.entities.set(e.id, { ...e });
    }
  }

  getSnapshot(tick: number): ReadonlyMap<number, EntityKinematics> | undefined {
    const slot = this.slots[tick % this.capacity];
    if (!slot || slot.tick !== tick) return undefined;
    return slot.entities;
  }

  sampleInterpolated(
    entityId: number,
    targetTickFloat: number
  ): EntityKinematics | undefined {
    const tickA = Math.floor(targetTickFloat);
    const tickB = tickA + 1;
    const alpha = targetTickFloat - tickA;

    const snapA = this.getSnapshot(tickA)?.get(entityId);
    const snapB = this.getSnapshot(tickB)?.get(entityId);

    if (!snapA) return snapB;
    if (!snapB) return snapA;

    return {
      id: entityId,
      x: snapA.x + (snapB.x - snapA.x) * alpha,
      y: snapA.y + (snapB.y - snapA.y) * alpha,
      z: snapA.z + (snapB.z - snapA.z) * alpha,
      vx: snapA.vx + (snapB.vx - snapA.vx) * alpha,
      vy: snapA.vy + (snapB.vy - snapA.vy) * alpha,
      vz: snapA.vz + (snapB.vz - snapA.vz) * alpha,
      heading: snapA.heading + (snapB.heading - snapA.heading) * alpha,
      flags: alpha < 0.5 ? snapA.flags : snapB.flags,
    };
  }
}
