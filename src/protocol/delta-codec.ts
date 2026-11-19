import {
  dequantizeHeading,
  dequantizePos,
  dequantizeVel,
  quantizeHeading,
  quantizePos,
  quantizeVel,
} from './quantization';

export const enum DeltaField {
  PosX = 1 << 0,
  PosY = 1 << 1,
  PosZ = 1 << 2,
  VelX = 1 << 3,
  VelY = 1 << 4,
  VelZ = 1 << 5,
  Heading = 1 << 6,
  StateFlags = 1 << 7,
}

export interface EntityKinematics {
  readonly id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heading: number;
  flags: number;
}

export interface DecodedEntityDelta {
  readonly id: number;
  readonly mask: number;
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly vx?: number;
  readonly vy?: number;
  readonly vz?: number;
  readonly heading?: number;
  readonly flags?: number;
}

const MAX_RECORD_BYTES = 26;

export const encodeWorldDeltaPacket = (
  tick: number,
  current: readonly EntityKinematics[],
  baseline: ReadonlyMap<number, EntityKinematics>,
  scratchBuffer: ArrayBuffer
): Uint8Array => {
  const view = new DataView(scratchBuffer);
  view.setUint32(0, tick >>> 0, true);

  let offset = 6;
  let writtenEntities = 0;

  for (let i = 0; i < current.length; i++) {
    const ent = current[i]!;
    if (offset + MAX_RECORD_BYTES > scratchBuffer.byteLength) break;

    const prev = baseline.get(ent.id);
    let mask = 0;

    const qx = quantizePos(ent.x);
    const qy = quantizePos(ent.y);
    const qz = quantizePos(ent.z);
    const qvx = quantizeVel(ent.vx);
    const qvy = quantizeVel(ent.vy);
    const qvz = quantizeVel(ent.vz);
    const qh = quantizeHeading(ent.heading);

    if (!prev || quantizePos(prev.x) !== qx) mask |= DeltaField.PosX;
    if (!prev || quantizePos(prev.y) !== qy) mask |= DeltaField.PosY;
    if (!prev || quantizePos(prev.z) !== qz) mask |= DeltaField.PosZ;
    if (!prev || quantizeVel(prev.vx) !== qvx) mask |= DeltaField.VelX;
    if (!prev || quantizeVel(prev.vy) !== qvy) mask |= DeltaField.VelY;
    if (!prev || quantizeVel(prev.vz) !== qvz) mask |= DeltaField.VelZ;
    if (!prev || quantizeHeading(prev.heading) !== qh) mask |= DeltaField.Heading;
    if (!prev || prev.flags !== ent.flags) mask |= DeltaField.StateFlags;

    if (mask === 0) continue;

    view.setUint16(offset, ent.id & 0xffff, true);
    offset += 2;
    view.setUint8(offset, mask);
    offset += 1;

    if (mask & DeltaField.PosX) {
      view.setInt32(offset, qx, true);
      offset += 4;
    }
    if (mask & DeltaField.PosY) {
      view.setInt32(offset, qy, true);
      offset += 4;
    }
    if (mask & DeltaField.PosZ) {
      view.setInt32(offset, qz, true);
      offset += 4;
    }
    if (mask & DeltaField.VelX) {
      view.setInt16(offset, qvx, true);
      offset += 2;
    }
    if (mask & DeltaField.VelY) {
      view.setInt16(offset, qvy, true);
      offset += 2;
    }
    if (mask & DeltaField.VelZ) {
      view.setInt16(offset, qvz, true);
      offset += 2;
    }
    if (mask & DeltaField.Heading) {
      view.setUint16(offset, qh, true);
      offset += 2;
    }
    if (mask & DeltaField.StateFlags) {
      view.setUint8(offset, ent.flags & 0xff);
      offset += 1;
    }

    writtenEntities++;
  }

  view.setUint16(4, writtenEntities, true);
  return new Uint8Array(scratchBuffer, 0, offset);
};

export const decodeWorldDeltaPacket = (
  packet: Uint8Array
): { readonly tick: number; readonly deltas: DecodedEntityDelta[] } => {
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const tick = view.getUint32(0, true);
  const count = view.getUint16(4, true);
  const deltas: DecodedEntityDelta[] = new Array(count);

  let offset = 6;

  for (let i = 0; i < count; i++) {
    const id = view.getUint16(offset, true);
    offset += 2;
    const mask = view.getUint8(offset);
    offset += 1;

    let x: number | undefined;
    let y: number | undefined;
    let z: number | undefined;
    let vx: number | undefined;
    let vy: number | undefined;
    let vz: number | undefined;
    let heading: number | undefined;
    let flags: number | undefined;

    if (mask & DeltaField.PosX) {
      x = dequantizePos(view.getInt32(offset, true));
      offset += 4;
    }
    if (mask & DeltaField.PosY) {
      y = dequantizePos(view.getInt32(offset, true));
      offset += 4;
    }
    if (mask & DeltaField.PosZ) {
      z = dequantizePos(view.getInt32(offset, true));
      offset += 4;
    }
    if (mask & DeltaField.VelX) {
      vx = dequantizeVel(view.getInt16(offset, true));
      offset += 2;
    }
    if (mask & DeltaField.VelY) {
      vy = dequantizeVel(view.getInt16(offset, true));
      offset += 2;
    }
    if (mask & DeltaField.VelZ) {
      vz = dequantizeVel(view.getInt16(offset, true));
      offset += 2;
    }
    if (mask & DeltaField.Heading) {
      heading = dequantizeHeading(view.getUint16(offset, true));
      offset += 2;
    }
    if (mask & DeltaField.StateFlags) {
      flags = view.getUint8(offset);
      offset += 1;
    }

    deltas[i] = {
      id,
      mask,
      ...(x !== undefined ? { x } : {}),
      ...(y !== undefined ? { y } : {}),
      ...(z !== undefined ? { z } : {}),
      ...(vx !== undefined ? { vx } : {}),
      ...(vy !== undefined ? { vy } : {}),
      ...(vz !== undefined ? { vz } : {}),
      ...(heading !== undefined ? { heading } : {}),
      ...(flags !== undefined ? { flags } : {}),
    };
  }

  return { tick, deltas };
};
