import { performance } from 'node:perf_hooks';
import {
  EntityKinematics,
  decodeWorldDeltaPacket,
  encodeWorldDeltaPacket,
} from '../protocol/delta-codec';
import { WorldSnapshotRing } from '../server/world-snapshot-ring';
import { PredictionReconciler, stepKinematicPhysics } from '../client/prediction-reconciler';

const runNetcodeBench = (): void => {
  const ENTITY_COUNT = 250;
  const TICKS = 1_000;
  const DT = 0.05;

  const ring = new WorldSnapshotRing(64);
  const scratch = new ArrayBuffer(16_384);

  const world: EntityKinematics[] = Array.from({ length: ENTITY_COUNT }, (_, id) => ({
    id,
    x: id * 12.5,
    y: id * -4.2,
    z: 31.4,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: (id * 17) % 360,
    flags: 1,
  }));

  let totalJsonBytes = 0;
  let totalDeltaBytes = 0;

  global.gc?.();
  const memBefore = process.memoryUsage().heapUsed;
  const t0 = performance.now();

  for (let tick = 1; tick <= TICKS; tick++) {
    for (let i = 0; i < ENTITY_COUNT; i++) {
      const e = world[i]!;
      if (i % 4 === 0) {
        e.vx = 4.5;
        e.x += e.vx * DT;
        e.heading = (e.heading + 1.5) % 360;
      }
    }

    const baseline = ring.getSnapshot(tick - 1) ?? new Map<number, EntityKinematics>();
    const binaryPacket = encodeWorldDeltaPacket(tick, world, baseline, scratch);
    totalDeltaBytes += binaryPacket.byteLength;

    if (tick === 1 || tick === TICKS) {
      decodeWorldDeltaPacket(binaryPacket);
    }

    totalJsonBytes += Buffer.byteLength(JSON.stringify({ tick, entities: world }), 'utf8');
    ring.commit(tick, world);
  }

  const encodeElapsedMs = performance.now() - t0;
  global.gc?.();
  const memAfter = process.memoryUsage().heapUsed;

  const serverTruth = { x: 0, y: 0, vx: 0, vy: 0 };
  const clientPred = new PredictionReconciler({ x: 0, y: 0, vx: 0, vy: 0 }, 0.02);

  for (let seq = 1; seq <= 20; seq++) {
    const cmd = { seq, dt: DT, accelX: 12, accelY: 4 };
    clientPred.applyLocalInput(cmd);

    if (seq <= 15) {
      const serverCmd = seq === 10 ? { ...cmd, accelX: 2 } : cmd;
      stepKinematicPhysics(serverTruth, serverCmd);
    }
  }

  const reconciliation = clientPred.reconcileWithAuthoritative(15, serverTruth);
  const bandwidthReductionPct = (
    (1 - totalDeltaBytes / totalJsonBytes) *
    100
  ).toFixed(2);

  console.log(
    JSON.stringify(
      {
        bandwidthAudit: {
          entitiesTracked: ENTITY_COUNT,
          simulatedTicks: TICKS,
          rawJsonBytes: totalJsonBytes,
          binaryDeltaBytes: totalDeltaBytes,
          bandwidthSavedPercent: Number(bandwidthReductionPct),
        },
        tickratePerformance: {
          totalEncodeMs: Number(encodeElapsedMs.toFixed(2)),
          avgTickEncodeMs: Number((encodeElapsedMs / TICKS).toFixed(4)),
          heapDeltaKb: Number(((memAfter - memBefore) / 1024).toFixed(2)),
        },
        rollbackReconciliationAudit: {
          triggeredRollback: reconciliation.rolledBack,
          desyncDetectedMeters: Number(reconciliation.errorDistanceMeters.toFixed(4)),
          replayedPendingInputs: reconciliation.replayedCommands,
        },
      },
      null,
      2
    )
  );
};

runNetcodeBench();
