import { describe, expect, it } from "vitest";

import {
  applyBudgetEntry,
  availableBudget,
  createBudgetLedger,
  summarizeBudgetLedger,
  type BudgetLedgerEntry,
} from "./budgetLedger";

type WithoutTimestamp<T> = T extends unknown ? Omit<T, "occurredAt"> : never;
function entry(value: WithoutTimestamp<BudgetLedgerEntry>): BudgetLedgerEntry {
  return { ...value, occurredAt: "2026-08-08T08:00:00.000Z" } as BudgetLedgerEntry;
}

describe("budget ledger", () => {
  it("reserves before spend, deduplicates billing entries, and settles actual cost", () => {
    let ledger = createBudgetLedger("CNY");
    ledger = applyBudgetEntry(ledger, entry({ billingEntryId: "auth-1", kind: "authorize", amount: 20 }));
    const reserve = entry({
      billingEntryId: "reserve-1",
      kind: "reserve",
      reservationId: "reservation-1",
      jobId: "job-1",
      amount: 8,
    });
    ledger = applyBudgetEntry(ledger, reserve);
    expect(applyBudgetEntry(ledger, reserve)).toEqual(ledger);
    expect(summarizeBudgetLedger(ledger)).toEqual({ currency: "CNY", authorized: 20, reserved: 8, actual: 0, unsettled: 0 });

    ledger = applyBudgetEntry(ledger, entry({
      billingEntryId: "settle-1",
      kind: "settle",
      reservationId: "reservation-1",
      actualAmount: 6,
    }));
    expect(summarizeBudgetLedger(ledger)).toEqual({ currency: "CNY", authorized: 20, reserved: 0, actual: 6, unsettled: 0 });
    expect(availableBudget(summarizeBudgetLedger(ledger))).toBe(14);
  });

  it("rejects a reservation that would exceed the authorized ceiling", () => {
    let ledger = createBudgetLedger("CNY");
    ledger = applyBudgetEntry(ledger, entry({ billingEntryId: "auth-1", kind: "authorize", amount: 5 }));
    expect(() => applyBudgetEntry(ledger, entry({
      billingEntryId: "reserve-1",
      kind: "reserve",
      reservationId: "reservation-1",
      jobId: "job-1",
      amount: 6,
    }))).toThrow("Budget authorization exceeded");
  });

  it("retains liability for an unknown submission until a provider-safe release", () => {
    let ledger = createBudgetLedger("CNY");
    ledger = applyBudgetEntry(ledger, entry({ billingEntryId: "auth-1", kind: "authorize", amount: 10 }));
    ledger = applyBudgetEntry(ledger, entry({
      billingEntryId: "reserve-1",
      kind: "reserve",
      reservationId: "reservation-1",
      jobId: "job-1",
      amount: 7,
    }));
    ledger = applyBudgetEntry(ledger, entry({
      billingEntryId: "unknown-1",
      kind: "mark_unsettled",
      reservationId: "reservation-1",
    }));

    expect(summarizeBudgetLedger(ledger)).toEqual({ currency: "CNY", authorized: 10, reserved: 0, actual: 0, unsettled: 7 });
    expect(() => applyBudgetEntry(ledger, entry({
      billingEntryId: "release-unsafe",
      kind: "release",
      reservationId: "reservation-1",
      providerSafe: false,
    }))).toThrow("Provider-safe release required");

    ledger = applyBudgetEntry(ledger, entry({
      billingEntryId: "release-safe",
      kind: "release",
      reservationId: "reservation-1",
      providerSafe: true,
    }));
    expect(summarizeBudgetLedger(ledger).unsettled).toBe(0);
  });

  it("does not settle more than the reserved maximum liability", () => {
    let ledger = createBudgetLedger("CNY");
    ledger = applyBudgetEntry(ledger, entry({ billingEntryId: "auth-1", kind: "authorize", amount: 10 }));
    ledger = applyBudgetEntry(ledger, entry({
      billingEntryId: "reserve-1",
      kind: "reserve",
      reservationId: "reservation-1",
      jobId: "job-1",
      amount: 7,
    }));
    expect(() => applyBudgetEntry(ledger, entry({
      billingEntryId: "settle-1",
      kind: "settle",
      reservationId: "reservation-1",
      actualAmount: 8,
    }))).toThrow("Settlement exceeds reservation");
  });
});

it("admits the exact 33-shot decimal total and rejects a real micro-unit overspend", () => {
  let ledger = applyBudgetEntry(createBudgetLedger("CNY"), entry({ billingEntryId: "auth", kind: "authorize", amount: 9.9 }));
  for (let i = 0; i < 33; i++) {
    ledger = applyBudgetEntry(ledger, { billingEntryId: `reserve-${i}`, kind: "reserve", reservationId: `r${i}`, jobId: `j${i}`, amount: 0.3, occurredAt: "now" });
    ledger = applyBudgetEntry(ledger, { billingEntryId: `settle-${i}`, kind: "settle", reservationId: `r${i}`, actualAmount: 0.3, occurredAt: "now" });
  }
  expect(summarizeBudgetLedger(ledger).actual).toBeCloseTo(9.9, 12);
  expect(() => applyBudgetEntry(ledger, { billingEntryId: "extra", kind: "reserve", reservationId: "extra", jobId: "extra", amount: 0.000001, occurredAt: "now" })).toThrow("Budget authorization exceeded");
});
