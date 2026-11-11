/** 英文：任务上游观测（taskObservability） */

export const enAdminTaskObservability = {
  taskObs: {
    notRecorded: "Not recorded",
    billing: {
      none: "No hold · not settled",
      frozen: "Held · not settled",
      settled: "Settled",
      skipped: "Hold skipped · not settled",
      unknown: "Billing status not recorded",
    },
    state: {
      queued: "Upstream queued",
      running: "Upstream generating",
      done: "Upstream finished",
      failed: "Upstream failed",
      cancelled: "Upstream cancelled",
    },
    hasTaskNoHttp: "Upstream task exists · HTTP not recorded",
    noRequests: "No upstream request recorded yet",
    phase: {
      started: "Request started",
      accepted: "Upstream responded",
      failed: "Request failed",
      poll: "Poll result",
      simulated: "Local simulation · parameters recorded",
    },
    durSeconds: "{s}s",
    durMinutes: "{m}m {s}s",
    durHours: "{h}h {m}m",
    upstreamStatus: "Upstream status: {status}",
  },
} as const;
