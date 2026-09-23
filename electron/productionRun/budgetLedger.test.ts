import { describe, expect, it } from "vitest";

import {
  applyBudgetEntry,
  budgetExceeds,
  sumBudgetAmounts,
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
    expect(summarizeBudgetLedger(ledger)).toEqual({ currency: "CNY", authorized: 20, reserved: 8, actual: 0, unsettled: 0, unknownInFlight: 0 });

    ledger = applyBudgetEntry(ledger, entry({
      billingEntryId: "settle-1",
      kind: "settle",
      reservationId: "reservation-1",
      actualAmount: 6,
    }));
    expect(summarizeBudgetLedger(ledger)).toEqual({ currency: "CNY", authorized: 20, reserved: 0, actual: 6, unsettled: 0, unknownInFlight: 0 });
  });

  // 2026-09-21 未知价开闸：`amount: null` = 目录算不出价。它不占额度、不参与比较，
  // 但要在账本上**数得出来**——绝不当 0 混进 reserved（那会读成「这几笔不花钱」）。
  it("books an unknown-price reservation as a counted liability instead of a fabricated zero", () => {
    let ledger = createBudgetLedger("CNY");
    ledger = applyBudgetEntry(ledger, entry({ billingEntryId: "auth-1", kind: "authorize", amount: 5 }));
    ledger = applyBudgetEntry(ledger, entry({
      billingEntryId: "reserve-known",
      kind: "reserve",
      reservationId: "reservation-known",
      jobId: "job-known",
      amount: 5,
    }));
    // 已知那笔已经把额度用满；未知那笔仍然进得来（它不参与金额比较）。
    ledger = applyBudgetEntry(ledger, entry({
      billingEntryId: "reserve-unknown",
      kind: "reserve",
      reservationId: "reservation-unknown",
      jobId: "job-unknown",
      amount: null,
    }));
    expect(summarizeBudgetLedger(ledger)).toEqual({
      currency: "CNY", authorized: 5, reserved: 5, actual: 0, unsettled: 0, unknownInFlight: 1,
    });
    // 已知价的硬上限一个字没松：再来一分钱的已知预留仍然被拒。
    expect(() => applyBudgetEntry(ledger, entry({
      billingEntryId: "reserve-over",
      kind: "reserve",
      reservationId: "reservation-over",
      jobId: "job-over",
      amount: 0.01,
    }))).toThrow("Budget authorization exceeded");
    // 实付是我们**第一次**知道这笔花了多少，不是超支——未知那笔没有上限可比。
    ledger = applyBudgetEntry(ledger, entry({
      billingEntryId: "settle-unknown",
      kind: "settle",
      reservationId: "reservation-unknown",
      actualAmount: 12.5,
    }));
    const summary = summarizeBudgetLedger(ledger);
    expect(summary.actual).toBe(12.5);
    expect(summary.unknownInFlight).toBe(0);
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

    expect(summarizeBudgetLedger(ledger)).toEqual({ currency: "CNY", authorized: 10, reserved: 0, actual: 0, unsettled: 7, unknownInFlight: 0 });
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


it("rejects finite reservation inputs whose cumulative liability overflows without mutating the ledger", () => {
  let ledger = applyBudgetEntry(createBudgetLedger("CNY"), entry({ billingEntryId: "max-auth", kind: "authorize", amount: Number.MAX_VALUE }));
  ledger = applyBudgetEntry(ledger, entry({ billingEntryId: "max-first", kind: "reserve", reservationId: "first", jobId: "first", amount: Number.MAX_VALUE }));
  const before = structuredClone(ledger);
  expect(() => applyBudgetEntry(ledger, entry({ billingEntryId: "max-extra", kind: "reserve", reservationId: "extra", jobId: "extra", amount: Number.MAX_VALUE }))).toThrow();
  expect(ledger).toEqual(before);
  expect(summarizeBudgetLedger(ledger).reserved).toBe(Number.MAX_VALUE);
});

it("rejects nonfinite amounts at both the shared aggregation and comparison boundaries", () => {
  expect(() => sumBudgetAmounts([Number.MAX_VALUE, Number.MAX_VALUE, 1])).toThrow();
  for (const invalid of [Infinity, -Infinity, NaN]) {
    expect(() => sumBudgetAmounts([invalid])).toThrow();
    expect(() => budgetExceeds(invalid, 1)).toThrow();
    expect(() => budgetExceeds(1, invalid)).toThrow();
  }
  expect(sumBudgetAmounts([Number.MAX_VALUE])).toBe(Number.MAX_VALUE);
  expect(budgetExceeds(Number.MAX_VALUE, Number.MAX_VALUE)).toBe(false);
});
