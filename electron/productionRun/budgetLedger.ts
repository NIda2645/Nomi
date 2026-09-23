import type { BudgetLedgerSummary } from "./productionRunTypes";

type BudgetEntryBase = {
  billingEntryId: string;
  occurredAt: string;
};

export type BudgetLedgerEntry =
  | (BudgetEntryBase & { kind: "authorize"; amount: number })
  /** `amount: null` = 目录算不出价（**不是 0 元**）。未知不占额度，只占一笔。 */
  | (BudgetEntryBase & { kind: "reserve"; reservationId: string; jobId: string; amount: number | null })
  | (BudgetEntryBase & { kind: "mark_unsettled"; reservationId: string })
  | (BudgetEntryBase & { kind: "settle"; reservationId: string; actualAmount: number })
  | (BudgetEntryBase & { kind: "release"; reservationId: string; providerSafe: boolean });

type Reservation = {
  reservationId: string;
  jobId: string;
  /** `null` = 价格未知。求和时跳过，绝不当 0。 */
  amount: number | null;
  status: "reserved" | "unsettled" | "settled" | "released";
  actualAmount: number;
};

export type BudgetLedger = {
  currency: string;
  authorized: number;
  entries: BudgetLedgerEntry[];
  reservations: Record<string, Reservation>;
};

/** One compensated pass for both complete totals and ordered budget prefixes. */
export function createBudgetAmountAccumulator(): (amount: number) => number {
  let sum = 0;
  let correction = 0;
  return (amount: number) => {
    if (!Number.isFinite(amount)) throw new Error("Budget amount must be finite");
    const adjusted = amount - correction;
    const next = sum + adjusted;
    if (!Number.isFinite(next)) throw new Error("Budget total must be finite");
    correction = (next - sum) - adjusted;
    sum = next;
    return sum;
  };
}

/** Compensated addition prevents per-shot rounding from accumulating across a large batch. */
export function sumBudgetAmounts(amounts: readonly number[]): number {
  const add = createBudgetAmountAccumulator();
  let sum = 0;
  for (const amount of amounts) {
    sum = add(amount);
  }
  return sum;
}

/** Compare at machine precision, without a currency-sized tolerance or rounding away real costs. */
export function budgetExceeds(amount: number, ceiling: number): boolean {
  if (!Number.isFinite(amount) || !Number.isFinite(ceiling)) throw new Error("Budget comparison must be finite");
  return amount > ceiling && amount - ceiling > 4 * Number.EPSILON * Math.max(Math.abs(amount), Math.abs(ceiling));
}

function assertAmount(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${label}`);
}

export function createBudgetLedger(currency: string): BudgetLedger {
  const normalized = currency.trim();
  if (!normalized) throw new Error("Budget currency is required");
  return { currency: normalized, authorized: 0, entries: [], reservations: {} };
}

/** 只取已知价那些笔。未知（`amount === null`）不参与任何求和。 */
function knownAmounts(reservations: readonly Reservation[], status: Reservation["status"]): number[] {
  return reservations
    .filter((item) => item.status === status && item.amount !== null)
    .map((item) => item.amount as number);
}

export function summarizeBudgetLedger(ledger: BudgetLedger): BudgetLedgerSummary {
  const reservations = Object.values(ledger.reservations);
  const reserved = sumBudgetAmounts(knownAmounts(reservations, "reserved"));
  const actual = sumBudgetAmounts(reservations.filter(item => item.status === "settled").map(item => item.actualAmount));
  const unsettled = sumBudgetAmounts(knownAmounts(reservations, "unsettled"));
  const unknownInFlight = reservations.filter(
    (item) => item.amount === null && (item.status === "reserved" || item.status === "unsettled"),
  ).length;
  return { currency: ledger.currency, authorized: ledger.authorized, reserved, actual, unsettled, unknownInFlight };
}

function withEntry(
  ledger: BudgetLedger,
  entry: BudgetLedgerEntry,
  patch: Partial<Pick<BudgetLedger, "authorized" | "reservations">>,
): BudgetLedger {
  return { ...ledger, ...patch, entries: [...ledger.entries, entry] };
}

export function applyBudgetEntry(ledger: BudgetLedger, entry: BudgetLedgerEntry): BudgetLedger {
  const existing = ledger.entries.find((item) => item.billingEntryId === entry.billingEntryId);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(entry)) throw new Error("Billing entry id conflict");
    return ledger;
  }

  switch (entry.kind) {
    case "authorize": {
      assertAmount(entry.amount, "budget authorization");
      const liability = summarizeBudgetLedger(ledger);
      if (budgetExceeds(sumBudgetAmounts([liability.reserved, liability.actual, liability.unsettled]), entry.amount)) {
        throw new Error("Budget authorization below current liability");
      }
      return withEntry(ledger, entry, { authorized: entry.amount });
    }
    case "reserve": {
      if (entry.amount !== null) assertAmount(entry.amount, "budget reservation");
      if (ledger.reservations[entry.reservationId]) throw new Error("Duplicate budget reservation");
      // 价格未知的一笔**不参与额度比较**：我们既不知道它花多少，也没资格替它编一个数。
      // 它能不能派出去由「这个 job 在不在人批过的那份信封里」决定（`unknownJobCount` 那根轴），
      // 不由金额决定。已知价那几笔的硬上限一个字没松。
      const summary = summarizeBudgetLedger(ledger);
      if (entry.amount !== null && budgetExceeds(sumBudgetAmounts([summary.reserved, summary.actual, summary.unsettled, entry.amount]), ledger.authorized)) {
        throw new Error("Budget authorization exceeded");
      }
      return withEntry(ledger, entry, {
        reservations: {
          ...ledger.reservations,
          [entry.reservationId]: {
            reservationId: entry.reservationId,
            jobId: entry.jobId,
            amount: entry.amount,
            status: "reserved",
            actualAmount: 0,
          },
        },
      });
    }
    case "mark_unsettled": {
      const reservation = ledger.reservations[entry.reservationId];
      if (!reservation || reservation.status !== "reserved") throw new Error("Active budget reservation not found");
      return withEntry(ledger, entry, {
        reservations: {
          ...ledger.reservations,
          [entry.reservationId]: { ...reservation, status: "unsettled" },
        },
      });
    }
    case "settle": {
      const reservation = ledger.reservations[entry.reservationId];
      if (!reservation || (reservation.status !== "reserved" && reservation.status !== "unsettled")) {
        throw new Error("Active budget reservation not found");
      }
      assertAmount(entry.actualAmount, "settlement amount");
      // 未知价那一笔没有上限可比——实付是我们**第一次**知道这笔花了多少，不是超支。
      if (reservation.amount !== null && entry.actualAmount > reservation.amount) throw new Error("Settlement exceeds reservation");
      return withEntry(ledger, entry, {
        reservations: {
          ...ledger.reservations,
          [entry.reservationId]: { ...reservation, status: "settled", actualAmount: entry.actualAmount },
        },
      });
    }
    case "release": {
      const reservation = ledger.reservations[entry.reservationId];
      if (!reservation || (reservation.status !== "reserved" && reservation.status !== "unsettled")) {
        throw new Error("Active budget reservation not found");
      }
      if (reservation.status === "unsettled" && !entry.providerSafe) throw new Error("Provider-safe release required");
      return withEntry(ledger, entry, {
        reservations: {
          ...ledger.reservations,
          [entry.reservationId]: { ...reservation, status: "released" },
        },
      });
    }
  }
}
