# Canvas Edge Label Focus

Date: 2026-08-08

## Scope

- Collapse typed edge labels by default while retaining the idle relationship line.
- Restore full label emphasis when the pointer is over that edge or when either connected node is the single selected node.
- Keep the active edge menu fully emphasized.
- Extend the existing real Electron canvas walkthrough to cover the three states.

## Non-goals

- Do not change edge modes, graph persistence, connection geometry, selection behavior, or menu actions.
- Do not change untyped reference edges or node card styling.
- Do not add design tokens or global CSS.

## Rollback

Revert the component class-state change and the matching walkthrough assertions. No persisted data migration is involved.

## Acceptance

1. With no node or edge focused, a typed label is fully hidden and does not intercept pointer input.
2. Hovering its edge makes both the edge and label fully emphasized.
3. Selecting either connected asset/node makes the corresponding edge and label fully emphasized.
4. Moving away and clearing selection restores the muted state.
5. The edge mode menu remains reachable, and existing disconnect/change-mode behavior is unchanged.
