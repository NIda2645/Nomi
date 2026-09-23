# Core A integrated semantic review

Current reviewed base: `96d368c26c2e5c1f0534861be9b9100630275097`; HEAD: `15195e2f9e516adfca52f9021f2b170a716d9e3c`; tree: `30aaa144ea821efb0830997f9289798ec921de42`.

The reviewed snapshot contains 368 changed files / 790 hunks. All have explicit semantic records in semantic-audit.json; this is static review, not a runtime or delivery verdict.

## Provenance and limitations

331 files / 720 hunks reused from v3 only when baseBlob, currentBlob and patchSha256 all match. The remaining 37 files / 70 hunks were reconciled explicitly with current source and the prior delta narrative. The v5 report was used only for source identity, never as semantic approval. A subsequent two-file drift was reviewed separately; 366 files / 788 hunks strictly match the integrated ledger.

Historical integrated snapshot `da576630f3254b1a1595ebfc250821d56ffb13ea` retains **366 correct / 2 incorrect files, 788 correct / 2 incorrect hunks**: the paid oracle/verify-only issue and journal test type issue. Current exact replacements resolve them. No historical failure was erased.

The ledger itself, future docs/screenshots and subsequent edits are outside the recorded tree. Copying this artifact into the PR does not make its own new blob self-reviewed. Same model pool review is not independent cross-model review. No suite, GUI or supplier request was run by this audit.

The parent full-suite log /private/tmp/nomi-core-a-unit-integrated-v6.log was read: 1516 Vitest files and 13954 tests passed, 3 skipped; SDK 482, janitor 13 and stats 8 passed. That execution predates the final two script/test edits and is not restamped as a new execution. Parent owns final focused/build/package/paid receipts. Earlier v5 timeout, unknown deletion evidence and Windows gaps remain distinct.

## Nine overlapping files

Each hunk below compares current integrated task delta against the refreshed upstream baseline. Upstream shot identities and media measurement remain in the original owners; original editor → rowActions → original runner remains the execution chain.

### docs/roadmap/TODO.md

Base blob: `be55c6b3f100e4b57c00bc9b5a0a32b6a922f8ed`; current blob: `0adf2f54c2b8a686b4bbbc2d02dfb4d051cc95ac`; patch SHA-256: `b0f1790115bad53033319ab29141cfee1e7ca526b69f6a28746d954706aeeafd`.

- **49.1: correct / not-a-defect**
  - Prior: T-DS-01 lists remaining sidebar work alongside completed T-CV-06/T-CV-15 upstream work.
  - Current: Records the user-deferred sidebar redesign, retaining the existing #808 behavior and upstream completed work.
  - Reason: Deferral accurately limits scope and does not authorize a new width, horizontal scroll or replacement page.
  - Evidence: Compared integrated patches/0049.patch and merge-parent delta 436982196..15195e2f9; completed media-geometry and numbering items remain. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

### electron/shared/agentCapabilities/canvasRead.ts

Base blob: `56c716785d11507ab4647ce4cdb46783eb3f8e6e`; current blob: `1e6a32912b518b85773dafb5e93e5f58acf2b4e8`; patch SHA-256: `8722b85751a235c37caef78ab4a30d0e3ecae6befd202f186aeda39f6c385ba5`.

- **158.1: correct / not-a-defect**
  - Prior: Canvas read has no canonical task-reference schema import.
  - Current: Imports taskReferenceSchema from the shared task vocabulary.
  - Reason: Uses the existing strict task type rather than defining a renderer-specific task identity.
  - Evidence: patches/0158.patch hunk 1; electron/shared/agentCapabilities/taskReference.ts; canonical schema consumer in canvasReadNodeSchema. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

- **158.2: correct / not-a-defect**
  - Prior: Strict read-node projection omits taskRef.
  - Current: Adds optional taskRef with the canonical schema.
  - Reason: Legacy unbound nodes remain valid; supplied task identity is validated, not accepted as arbitrary metadata.
  - Evidence: patches/0158.patch hunk 2; projectNode emits only generation-domain references. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

- **158.3: correct / not-a-defect**
  - Prior: projectNode exposes canonical shot identity but no production task binding.
  - Current: Derives taskRef from trimmed meta.productionRunId while retaining upstream shotRole/shotOwnerNodeIds and positive shotIndex.
  - Reason: A canvas node id is never passed as a job id. Shared resolveShotIdentities continues to distinguish keyframe owners; this is read-only projection.
  - Evidence: projectNode in canvasRead.ts; electron/shared/canvas/shotNumbering.ts resolveShotIdentities; patches/0158.patch hunk 3. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

### electron/shared/agentCapabilities/canvasReadCompact.ts

Base blob: `676eb8da2c8ac07d59711e48b9e54b2561716066`; current blob: `f3ec5298dfd2729aababe89fd7fe409da12667fa`; patch SHA-256: `7262afe96eaa7d4184825108f3070efaf87323df72a429796bb0962d789f8a8a`.

- **159.1: correct / not-a-defect**
  - Prior: Bounded node text reports upstream shot number, role and owner without a canonical task reference.
  - Current: Appends serialized taskRef when the validated projection provides one.
  - Reason: The compact output preserves upstream first-frame/numbering semantics and exposes the same identity used by task tools.
  - Evidence: patches/0159.patch; formatCanvasForAgent still formats shotRole and shotOwnerNodeIds before taskRef; canvasRead.ts owns validation. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

### scripts/boundary-owners-ledger.json

Base blob: `4102a3de41812bb14d35f54ff04e7d1e6bdc7275`; current blob: `b024002e697f9611ee105acf1e8366d491e71000`; patch SHA-256: `9893be11166f1b55114d732d6bd063770e35ca367b47156bffbdca462f463558`.

- **194.1: correct / not-a-defect**
  - Prior: Upstream ledger records media-measurement extraction; shared storyboard functions still require relocation provenance.
  - Current: Adds storyboardShotScope and storyboardPromptCompiler relocation records while preserving the upstream useNodeMediaMeasurement owner entry.
  - Reason: Ledger describes actual shared owners; it does not legitimize duplicate implementations or new persistence.
  - Evidence: patches/0194.patch; renderer storyboard re-export paths in prior v3 semantic audit; BaseGenerationNode uses useNodeMediaMeasurement and its callbacks. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

### src/design/AnchoredPopover.tsx

Base blob: `2e5974adb6ca56d25ebed4c9d7e42361cafed6de`; current blob: `30c092d7fb18ed937fb694f59432f17aaf05032a`; patch SHA-256: `04be40e3a542dcd204150cf95b781227d5a53b128dfab509587bec8552b7693a`.

- **201.1: correct / not-a-defect**
  - Prior: Upstream imports its Escape dismissal helper.
  - Current: Uses shared getSettingsEscapeOwnership, hasOpenPopupAbove and isInsidePopupAbove.
  - Reason: The three shared queries distinguish keyboard ownership, live child popup state and outside pointer clicks; no new overlay layer is added.
  - Evidence: patches/0201.patch hunk 1; overlayLayers.ts:112 getSettingsEscapeOwnership and :169 hasOpenPopupAbove. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

- **201.2: correct / not-a-defect**
  - Prior: No event-identity snapshot is retained through target handlers.
  - Current: Retains the exact native event and whether a delegated owner was open at capture.
  - Reason: Snapshot prevents a child synchronously closing from making the same Escape close its parent after bubbling.
  - Evidence: patches/0201.patch hunk 2; capturedEscapeRef is read only for matching nativeEvent and cleared on consumption or a microtask. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

- **201.3: correct / not-a-defect**
  - Prior: Upstream capture dismissal protects the node but can preempt descendants that consume Escape later.
  - Current: Capture only snapshots ownership; anchor/portal bubble consumes ordinary Escape, delegates child events, uses nokey to protect React Flow, and keeps document fallback/outside pointer semantics.
  - Reason: IME/defaultPrevented events cannot deselect; higher dialogs and document-bubble children receive the original event. The first child dialog is the surface baseline, avoiding self-classification as a higher dialog. Existing anchor nokey is restored correctly on cleanup.
  - Evidence: Read AnchoredPopover.ts consumeEscape/snapshotEscapeOwner/onDown, overlayLayers.ts and composerLifecycle.test.mjs:73–153 (anchor/portal/button/input, IME, select, document child, higher dialog, fallback, no-popover deselection); no test execution in this audit. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

### src/workbench/generationCanvas/agent/applyCanvasToolCall.ts

Base blob: `e527d3b6ce072804709ca9f764e0ef0f2336e99e`; current blob: `1f2d92a7bcaa330e0510017bee24abe860dd74f3`; patch SHA-256: `90df614632012cb182de91847f2099d25c9640cd38ccab6be271bc1f92ed52cb`.

- **273.1: correct / not-a-defect**
  - Prior: Proposal application lacks the undo-journal generation stamp import.
  - Current: Imports the existing undo journal generation reader.
  - Reason: Reads the canonical reset/undo stamp and creates no parallel cancellation owner.
  - Evidence: patches/0273.patch hunk 1; proposal branch captures and compares getUndoJournalGeneration. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

- **273.2: correct / not-a-defect**
  - Prior: Callers can pass cancellation and captured document/design ids but no asynchronous target guard.
  - Current: Adds optional assertTargetCurrent argument.
  - Reason: Existing callers remain source compatible; bound author actions can now carry their existing identity check to the actual canvas write.
  - Evidence: patches/0273.patch hunk 2; materializationStamp.test.ts invokes seventh argument in target-wait concurrency case. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

- **273.3: correct / not-a-defect**
  - Prior: Plan normalization can await the model catalog before choosing fallback active document; command discriminator is sent to strict author parsing.
  - Current: Captures document/design references and journal stamp before await, removes operation from author content, then rejects changed identities before storage.
  - Reason: Async completion cannot silently retarget to a later active document; missing document still returns obsolete. Parsing command metadata outside author content preserves strict author schema.
  - Evidence: patches/0273.patch hunk 3; applyCanvasToolCall.ts:293–341; document/sourceDesign capture precedes listAvailableModelsForAgent and store write follows stamp checks. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

- **273.4: correct / not-a-defect**
  - Prior: Stamp lookup precedes model/target waits, so concurrent retries can both see no node.
  - Current: Completes model read and target assertion before one synchronous lookup/create segment, rechecking turn writability.
  - Reason: JavaScript cannot interleave a second retry between post-wait stamp lookup and creation; exact target is checked at mutation entry.
  - Evidence: patches/0273.patch hunk 4; materializationStamp.test.ts:96 tests concurrent repeated placement across both catalog and target waits, one batch/edge. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

- **273.5: correct / not-a-defect**
  - Prior: Model lookup awaited after filtering already-materialized nodes.
  - Current: Removes the later await because model lookup now occurs before stamp lookup.
  - Reason: This is the necessary counterpart to the previous hunk: no new async gap is reintroduced after the idempotence check. Loading from requested nodes may perform an unnecessary catalog read for a replay but does not create duplicates.
  - Evidence: patches/0273.patch hunk 5; scanned create_canvas_nodes from stamp lookup through generationCanvasTools.create_nodes for awaits. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

- **273.6: correct / not-a-defect**
  - Prior: Input normalization proceeds directly to create_nodes.
  - Current: Rechecks writable state immediately before create_nodes.
  - Reason: Cancellation capability remains enforced at the actual owner call; mapping reused nodes and edge creation continue through original flow. Manual keyframe-number copying removed by integration is correctly replaced by shared first_frame identity.
  - Evidence: patches/0273.patch hunk 6; merge delta 436982196..15195e2f9 removes manual shotIndex copying; resolveShotIdentities derives keyframe labels from first_frame edges. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

### src/workbench/generationCanvas/components/batchPlanPreview.ts

Base blob: `fc7950b223477d36d4b0f4756c6f32d4a54ca83d`; current blob: `f4881c097464be31f5ada367ff7d39a6708ecb88`; patch SHA-256: `6f66d8e526dfcb62fba849c1b9de49b59badb414561aa1f856ec0dd521b17e48`.

- **284.1: correct / not-a-defect**
  - Prior: Batch confirmation checks only captured project, not captured storyboard content/target.
  - Current: Accepts optional assertCurrent, composes it with project validation during mint, checks again after mint and forwards it to runPlanWithToasts.
  - Reason: Human approval cannot license changed author content. Empty plans still only report blocked feedback; no paid execution or new confirmation owner is introduced.
  - Evidence: patches/0284.patch hunk 1; original rowActions passes the same host guard; confirmAndMintGrant remains the owner. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

- **284.2: correct / not-a-defect**
  - Prior: Batch executor options omit the author guard.
  - Current: Forwards the composed author/project guard into runGenerationNodesByPlan.
  - Reason: The original executor can reject stale identity before attempts rather than checking only at UI time.
  - Evidence: patches/0284.patch hunk 2; generationRunController original assertCurrent boundaries reviewed in prior delta report. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

- **284.3: correct / not-a-defect**
  - Prior: Failure action retries without the original author assertion.
  - Current: Retry reuses confirmAndRunPlan with the captured guard.
  - Reason: Retry must obtain a new confirmation and pass the same target contract. Upstream successful-node shot identity filtering remains via resolveShotIdentities, not stored shotIndex.
  - Evidence: patches/0284.patch hunk 3; batchPlanPreview.ts failure action and success filtering; electron/shared/canvas/shotNumbering.ts. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

### src/workbench/generationCanvas/nodes/BaseGenerationNode.tsx

Base blob: `e68623f6b81855b2db2f733fbc59321a94b17cb5`; current blob: `9514c8e20d87c6612a8cfbaee04aa312e968fa6a`; patch SHA-256: `02da52ea25c8f27b4d178cf9d195655e735103cec8ebacd5c03e94099209ba16`.

- **291.1: correct / not-a-defect**
  - Prior: Node imports local stack component without shared parent history owner or skeleton.
  - Current: Imports nodeHasResultStack/useNodeResultHistory and NomiSkeleton.
  - Reason: Availability and open intent share one owner; skeleton uses existing design primitive. Upstream relationship/media-measurement imports remain present.
  - Evidence: patches/0291.patch hunk 1; useNodeResultHistory.ts and useNodeMediaMeasurement.ts. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

- **291.2: correct / not-a-defect**
  - Prior: Lazy composer failure lacks a localized component label and local loading fallback.
  - Current: Adds generationCommon.composer.chunkLabel and NomiSkeleton to the existing lazy recovery wrapper.
  - Reason: Uses the existing local retry boundary and does not reload the app or create another composer.
  - Evidence: patches/0291.patch hunk 2; existing lazy recovery controlled test in composerLifecycle.test.mjs retains exact input node on retry. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

- **291.3: correct / not-a-defect**
  - Prior: Base node cannot coordinate composer lifetime with history-open state.
  - Current: Computes canonical history availability and owns open intent keyed by id/kind/selection/availability.
  - Reason: History intent invalidates on unavailable result, changed identity or deselection; prompt data is not part of this state.
  - Evidence: patches/0291.patch hunk 3; useNodeResultHistory.ts open = selected && available && openedFor===identity. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

- **291.4: correct / not-a-defect**
  - Prior: Inline history eligibility duplicates ordinary/production result counting.
  - Current: Removes inline predicate in favor of nodeHasResultStack.
  - Reason: Shared predicate preserves exclusions for cards/text/panorama, requires a media result URL, and allows one result only for production-bound nodes.
  - Evidence: patches/0291.patch hunk 4; useNodeResultHistory.ts nodeHasResultStack; upstream useShotIdentity still drives ShotPreviewOverlays. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

- **291.5: correct / not-a-defect**
  - Prior: NodeResultStack owns open state independently of parent composer.
  - Current: Supplies controlled open and onOpenChange from the parent history owner.
  - Reason: Stack visibility and composer visibility now share the same state; node/readOnly/selected inputs remain.
  - Evidence: patches/0291.patch hunk 5; NodeResultStack controlled props consumer. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

- **291.6: correct / not-a-defect**
  - Prior: ReadOnly prevents mounting and opening history can lose the composer input subtree.
  - Current: Mounts composer for any single selected eligible node, passes readOnly, and hides the still-mounted subtree while history is open.
  - Reason: Input session survives history toggling while NodeWriteAccess still governs edits. Multi-select exclusion remains. Upstream media callbacks onLoadedMetadata/onLoad still use mediaMeasurement at lines 537/550, preserving result identity and measurement-only options.
  - Evidence: patches/0291.patch hunk 6; BaseGenerationNode.ts:609; useNodeMediaMeasurement validates captured result id/url and uses MEDIA_DIMENSION_UPDATE_OPTIONS; controlled T7 coverage and actual-app coverage remain separately scoped. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

### tests/ux/_composerFixedFooter.mjs

Base blob: `efced3a70b8ae75fde992a29d00ceb51bb2d6082`; current blob: `edc8fb8f16613eca0674efc3d4051af2cd9fe29b`; patch SHA-256: `445aefbed8dd8357f33eb0b578cf2f1907e60c768b7d1effe1029dd9fe58e518`.

- **344.1: correct / not-a-defect**
  - Prior: Default click uses the full tall editor center, which can be outside the scrollport.
  - Current: Computes visible editor/scrollport intersection, verifies elementFromPoint and focus, then uses real mouse and keyboard.
  - Reason: Fixes a test actionability oracle while retaining footer/geometry checks; no force, timeout increase or product-layout patch.
  - Evidence: patches/0344.patch hunk 1; prior failed smoke and visible-editor correction recorded in /private/tmp/nomi-core-a-final-delta-review.md. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

- **344.2: correct / not-a-defect**
  - Prior: Escape test verifies footer/composer visibility and selection.
  - Current: Also proves the original effect trigger regains focus and retains the upstream selected-node assertion.
  - Reason: Stronger postcondition detects accidental host deselection without changing dismissal behavior or skipping popover checks.
  - Evidence: patches/0344.patch hunk 2; integrated upstream selected class assertion plus effectTrigger.toBeFocused. | Final drift reconciliation: baseBlob/currentBlob/patchSha256 all unchanged from the integrated frozen review.

## Final two-file drift

### electron/productionRun/productionRunJournalAcceptance.test.ts

Base blob: `absent`; current blob: `342e22f211e87df45f698d1bff1e54fff165aef1`; patch SHA-256: `46bf5974ed74262fa79379430285563a48852efa2cae87c9d8eec2ce71b32217`.

**143.1: correct / not-a-defect**

Prior: Baseline has no journal validation work acceptance; frozen task test dereferences optional payload in two mutation checks and its parse counter has no positive control.

Current: Keeps all real disk rewrite/truncate/replace/unterminated-line/isolation/delete/restore/same-size-time-rewrite/independent-repository/EACCES cases. Wraps the original JSON.parse, counts decoded event objects, proves a cold repository decodes at least 13 historical events, resets the counter, then retains <=1 read, <=1 new-command and <=2 idempotent-replay limits. Mutates returned event.payload as a whole object.

Reason: The positive control fails if the counter stops observing event decoding. Warm work bounds remain unchanged, so no performance assertion is weakened. Assigning the whole optional payload avoids unsafe dereference while still testing that caller mutation cannot poison the repository index. Tests continue to check actual disk authority and preserved corrupt bytes rather than only an implementation-shaped mock.

Evidence: Read exact two-hunk post-15195e2f9 delta through blob 342e22f211e87df45f698d1bff1e54fff165aef1 and the full frozen 109-line test. Cold makeRepository().read occurs after spy installation; original repo index was warmed before it; counters reset independently before each original bound. afterEach restores spies. Type/test-waits gate and focused execution are parent-owned, not rerun here.

### tests/ux/core-a-storyboard.paid.mjs

Base blob: `absent`; current blob: `40699bbb17ff2fd78eae9a58bb096eda34988885`; patch SHA-256: `8a67ca34c37f7635a6acfea5f07f21bb30f5228bb4178d19ecb845df9815b7bc`.

**355.1: correct / not-a-defect**

Prior: Baseline has no paid original-editor journey. Frozen task script preserves real UI/runner/receipts but contains an unsupported exact-480-pixel oracle, self-derived expected keyframe prompt, and a verify-only missing-original-image path that can reach batch approval.

Current: Current original-editor acceptance preserves two image plus first-frame/video scope, receipt equality, real file probing, dependency/version proof, duration and no-audio checks, and hot/cold reopen. It uses a fixed authored keyframe prompt; checks 480p/duration=4/audio=false/fast-model in candidate, editorial and result provenance; records actual dimensions and exactShortEdgeMatch without asserting undocumented pixel mapping; records matching renderer/main build stamps for each source-app launch. Verify-only requires both original images before flow continues, approve rejects verify-only, and firstFrameJourney rejects verify-only.

Reason: The test no longer fixes an oracle by changing correct production code or hiding the observed 864x496 output. A preset/provenance match is explicitly not a supplier exact-pixel compliance claim. The fixed prompt provides an independent expectation. The missing-image branch now fails before it can submit work, while both payment entrypoints also reject verify-only. Build-stamp equality proves bundle coherence and records build identity; it does not by itself prove current HEAD or the whole packaged app. No actual final GUI/supplier run is claimed by this static review.

Evidence: Read frozen v5-to-integrated delta and complete post-15195e2f9 diff through blob 40699bbb17ff2fd78eae9a58bb096eda34988885. start(): captured actual appPath equals repoRoot then dist/dist-electron build stamps must match. approve(): explicit false verification flag; firstFrameJourney(): same rejection before draft creation/direct approval. Resumed branch: completedCount must be 2 for verify-only before remaining-image path. verifyFirstFrameResults(): fixed keyframePrompt, candidate/editorial/provenance params, first_frame edge and refSnapshot version, actual ffprobe and no-audio/duration. Parent-provided official source https://docs.apimart.ai/en/api-reference/videos/seedance-2-0/generation.md saved at /private/tmp/nomi-seedance2-official-generation.md:466–473 defines preset names, not exact pixel mapping. Frozen failed v8 evidence is preserved separately.

## Handoff

semantic-audit.json is the complete repository-ready ledger with per-file identity and per-hunk original/current/reason/evidence/attribution. semantic-reviews.json was produced for the one-off audit-core-a-changes.mjs applyReviews helper, which does not ship to main (see this directory README). drift-reviews.json contains only the final two changes. The original inventory report.json remains unmodified as raw capture.
