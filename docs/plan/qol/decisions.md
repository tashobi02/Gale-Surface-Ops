# QoL pass: decisions

Small choices made while implementing [README.md](README.md). Every row: **decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 13 Nov 2026**. Proposed until the QoL branches are merged.

## Q3: crew ride a pressurized rover to a stop

| Id | Decision | Why |
| --- | --- | --- |
| Q3-1 | **Boarding distance = the same routing-grid cell** as the vehicle. The ParamSets (`pr1-assumed`, `ur1-assumed`) hold no boarding distance, so none is invented; the README's own wording is "same cell". Without a terrain grid the command is `INVALID` (there is no vehicle route either). | No number without a source. `ingress_min` (5 min, 02 §D.8) is a time, not a distance, and is not applied here (as for a summon's sheltering, BD-58), so the ride time is exactly the drive time. |
| Q3-2 | **"Or the vehicle is summoned first" is not offered as a ride start.** A summon is the contingency flow: on arrival the crew member is sheltered in the vehicle (`CREW_SHELTERED`), which ends their walk. So the rider must be in the vehicle's cell (at the hab at the start, or holding beside it after a ride). The tablet button is enabled for an available rover and the Hab Core's refusal reason ("not at PR1") is shown. | Keeps the summon and the ride separate; a pick-up leg (vehicle drives to the crew member, then on) is a later extension, not in Q3. |
| Q3-3 | The vehicle must be `PARKED` (else `BUSY`); a rider already aboard is `BUSY`. After `CREW_DISMOUNTED` the vehicle is `PARKED` at the stop, so it can be summoned or ridden again. | One ride at a time per vehicle; no new vehicle state. |
| Q3-4 | The stop may be any **later** stop of the plan in force (`stop_index` above the rider's last stop), with a leg that ends at it. Stops skipped on the way get no `ARRIVED_STOP`; their tasks stay open. | The command names `to_stop_id`; the tablet sends the next stop. |
| Q3-5 | On arrival the rider gets `CREW_DISMOUNTED` **and** `ARRIVED_STOP` (system), so stop timing, tasks, the report and the event log see an ordinary arrival; the rider then dwells at the stop and walks on from the next leg. | `ARRIVED_STOP` is what the report and the ops log read. |
| Q3-6 | While `RIDING` the shielding is the `pressurized_rover` factor and no suit O2 is used (the cabin is pressurized), as for a crew member sheltered in the vehicle. The rider is not a radio node and has no haven clock while aboard. A plan revision that sends the rider `TO_HAVEN` mid-ride is not specially handled: the vehicle finishes its drive and stays `ARRIVED`. | Reuses existing, sourced factors. Edge case noted; contingency while riding is out of scope for Q3. |
