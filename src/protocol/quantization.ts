const POS_SCALE = 100;
const VEL_SCALE = 500;
const ANGLE_SCALE = 65535 / 360;

export const quantizePos = (meters: number): number =>
  Math.max(-2_147_483_648, Math.min(2_147_483_647, Math.round(meters * POS_SCALE)));

export const dequantizePos = (fixed: number): number => fixed / POS_SCALE;

export const quantizeVel = (mps: number): number =>
  Math.max(-32768, Math.min(32767, Math.round(mps * VEL_SCALE)));

export const dequantizeVel = (fixed: number): number => fixed / VEL_SCALE;

export const quantizeHeading = (deg: number): number => {
  const normalized = ((deg % 360) + 360) % 360;
  return Math.round(normalized * ANGLE_SCALE) & 0xffff;
};

export const dequantizeHeading = (packed: number): number => (packed & 0xffff) / ANGLE_SCALE;
