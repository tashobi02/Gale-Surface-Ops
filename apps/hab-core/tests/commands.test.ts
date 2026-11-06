import { describe, it } from "vitest";

// docs/specs/02 §E.4, §E.6. TASK-23.
describe("handleCommand", () => {
  it.todo("rejects a command from a role without permission with FORBIDDEN_ROLE");
  it.todo("rejects an EVA command while that suit is unlinked with NO_LINK");
  it.todo("SUMMON_VEHICLE produces VEHICLE_DISPATCHED with a rendezvous");
  it.todo("SUMMON_VEHICLE with no rendezvous returns NO_RENDEZVOUS and leaves state unchanged");
});
