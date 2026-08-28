import type { ProfileKind } from "../catalog/types";
import type { CertificationMediaEvidence } from "../providerAdapter/certificationMedia";

export const CERTIFICATION_LEDGER_VERSION = 1 as const;
export const PROMOTION_JOURNAL_VERSION = 1 as const;
export const CERTIFICATION_SUBMISSION_STATES = ["idle", "submitting", "submitted", "unknown", "settled"] as const;
export const PROMOTION_JOURNAL_STATES = ["prepared", "catalog_committed", "committed", "aborted"] as const;
export const PROMOTION_TERMINAL_STAGES = ["completed", "partial"] as const;

/** Provider-declared capability only; Nomi still reconciles uncertainty and never claims remote exactly-once. */
export type RemoteIdempotencyCapability = "supported" | "unsupported" | "unknown";
export type CertificationSubmissionState = typeof CERTIFICATION_SUBMISSION_STATES[number];
export type CertificationCheckpoint =
  | "prepared"
  | "submitting"
  | "submitted"
  | "submission_unknown"
  | "settled"
  | "promotion_prepared"
  | "promotion_committed"
  | "finalized"
  | "cancelled"
  | "superseded";

export type CertificationChildRunRef = {
  runId: string;
  revisionDigest: string;
};

export type CertificationLease = {
  ownerId: string;
  token: string;
};

export type CertificationOperationRecord = {
  version: 1;
  revision: number;
  runId: string;
  contractDigest: string;
  idempotencyKey: string;
  lineageRootVendorKey: string;
  lease: CertificationLease;
  attempt: number;
  checkpoint: CertificationCheckpoint;
  operationKey?: string;
  providerIdempotency: RemoteIdempotencyCapability;
  submissionState: CertificationSubmissionState;
  remoteTaskId?: string;
  artifactEvidence: CertificationMediaEvidence[];
  childRunRef: CertificationChildRunRef;
  userAction?: "reconcile_or_contact_provider" | "review_newer_certification";
  createdAt: string;
  updatedAt: string;
};

export type CertificationOperationLedgerState = {
  version: 1;
  operations: CertificationOperationRecord[];
};

export type CertificationContractBinding = {
  contractDigest: string;
  idempotencyKey: string;
  remoteIdempotency: RemoteIdempotencyCapability;
};

export type PromotionJournalStateName = typeof PROMOTION_JOURNAL_STATES[number];
export type PromotionTerminalStage = typeof PROMOTION_TERMINAL_STAGES[number];

export type PromotionJournalEntry = {
  version: 1;
  revision: number;
  journalId: string;
  runId: string;
  lineageRootVendorKey: string;
  leaseToken: string;
  expectedActiveRevision?: string;
  proposedRevisionId: string;
  contractDigest: string;
  verifiedModes: Array<{ modelKey: string; taskKind: ProfileKind }>;
  childRunRef: CertificationChildRunRef;
  terminalStage?: PromotionTerminalStage;
  state: PromotionJournalStateName;
  userAction?: "review_newer_certification";
  runFinalizedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type PromotionJournalState = {
  version: 1;
  entries: PromotionJournalEntry[];
};
