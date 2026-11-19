export interface PlayerInputCommand {
  readonly seq: number;
  readonly dt: number;
  readonly accelX: number;
  readonly accelY: number;
}

export interface PredictedBodyState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const DAMPING = 0.92;

export const stepKinematicPhysics = (
  state: PredictedBodyState,
  cmd: PlayerInputCommand
): void => {
  state.vx = (state.vx + cmd.accelX * cmd.dt) * DAMPING;
  state.vy = (state.vy + cmd.accelY * cmd.dt) * DAMPING;
  state.x += state.vx * cmd.dt;
  state.y += state.vy * cmd.dt;
};

export interface ReconciliationReport {
  readonly rolledBack: boolean;
  readonly errorDistanceMeters: number;
  readonly replayedCommands: number;
}

export class PredictionReconciler {
  private readonly unackedInputs: PlayerInputCommand[] = [];
  private readonly state: PredictedBodyState;
  private readonly snapThresholdSq: number;

  constructor(initial: PredictedBodyState, snapThresholdMeters = 0.05) {
    this.state = { ...initial };
    this.snapThresholdSq = snapThresholdMeters * snapThresholdMeters;
  }

  get currentState(): Readonly<PredictedBodyState> {
    return this.state;
  }

  applyLocalInput(cmd: PlayerInputCommand): void {
    this.unackedInputs.push(cmd);
    stepKinematicPhysics(this.state, cmd);
  }

  reconcileWithAuthoritative(
    ackedSeq: number,
    authoritative: Readonly<PredictedBodyState>
  ): ReconciliationReport {
    while (this.unackedInputs.length > 0 && this.unackedInputs[0]!.seq <= ackedSeq) {
      this.unackedInputs.shift();
    }

    const simulated: PredictedBodyState = { ...authoritative };
    for (let i = 0; i < this.unackedInputs.length; i++) {
      stepKinematicPhysics(simulated, this.unackedInputs[i]!);
    }

    const dx = simulated.x - this.state.x;
    const dy = simulated.y - this.state.y;
    const distSq = dx * dx + dy * dy;

    if (distSq <= this.snapThresholdSq) {
      return {
        rolledBack: false,
        errorDistanceMeters: Math.sqrt(distSq),
        replayedCommands: 0,
      };
    }

    this.state.x = simulated.x;
    this.state.y = simulated.y;
    this.state.vx = simulated.vx;
    this.state.vy = simulated.vy;

    return {
      rolledBack: true,
      errorDistanceMeters: Math.sqrt(distSq),
      replayedCommands: this.unackedInputs.length,
    };
  }
}
