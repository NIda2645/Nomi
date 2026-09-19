import type { BudgetLedgerSummary } from "./productionRunTypes";

type BudgetEntryBase = {
  billingEntryId: string;
  occurredAt: string;
};

export type BudgetLedgerEntry =
  | (BudgetEntryBase & { kind: "authorize"; amount: number })
  | (BudgetEntryBase & { kind: "reserve"; reservationId: string; jobId: string; amount: number })
  | (BudgetEntryBase & { kind: "mark_unsettled"; reservationId: string })
  | (BudgetEntryBase & { kind: "settle"; reservationId: string; actualAmount: number })
  | (BudgetEntryBase & { kind: "release"; reservationId: string; providerSafe: boolean });

type Reservation = {
  reservationId: string;
  jobId: string;
  amount: number;
  status: "reserved" | "unsettled" | "settled" | "released";
  actualAmount: number;
};

export type BudgetLedger = {
  currency: string;
  authorized: number;
  entries: BudgetLedgerEntry[];
  reservations: Record<string, Reservation>;
};

/** Compensated addition prevents per-shot rounding from accumulating across a large batch. */
export function sumBudgetAmounts(amounts: readonly number[]): number {
  let sum = 0;
  let correction = 0;
  for (const amount of amounts) {
    const adjusted = amount - correction;
    const next = sum + adjusted;
    correction = (next - sum) - adjusted;
    sum = next;
  }
  return sum;
}

/** Compare at machine precision, without a currency-sized tolerance or rounding away real costs. */
export function budgetExceeds(amount: number, ceiling: number): boolean {
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

export function summarizeBudgetLedger(ledger: BudgetLedger): BudgetLedgerSummary {
  const reservations = Object.values(ledger.reservations);
  const reserved = sumBudgetAmounts(reservations.filter(item => item.status === "reserved").map(item => item.amount));
  const actual = sumBudgetAmounts(reservations.filter(item => item.status === "settled").map(item => item.actualAmount));
  const unsettled = sumBudgetAmounts(reservations.filter(item => item.status === "unsettled").map(item => item.amount));
  return { currency: ledger.currency, authorized: ledger.authorized, reserved, actual, unsettled };
}

export function availableBudget(summary: BudgetLedgerSummary): number {
  return summary.authorized - summary.reserved - summary.actual - summary.unsettled;
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
      assertAmount(entry.amount, "budget reservation");
      if (ledger.reservations[entry.reservationId]) throw new Error("Duplicate budget reservation");
      const summary = summarizeBudgetLedger(ledger);
      if (budgetExceeds(sumBudgetAmounts([summary.reserved, summary.actual, summary.unsettled, entry.amount]), ledger.authorized)) {
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
      if (entry.actualAmount > reservation.amount) throw new Error("Settlement exceeds reservation");
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
