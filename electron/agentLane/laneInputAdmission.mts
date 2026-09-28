import { withAbortSignal, withCancel, type Context } from '@earendil-works/pi-agent-core/harness/context';

/** Only pre-admission cancellation. Inputs, queues and accepted operations remain owned by pi. */
export function createLaneInputAdmission(parent: Context) {
  let pending = withCancel(parent);
  return {
    capture: (signal?: AbortSignal): Context => signal ? withAbortSignal(signal, pending.context) : pending.context,
    cancel: () => {
      pending.cancel(new Error('agent_lane_input_cancelled'));
      pending = withCancel(parent);
    },
  };
}
