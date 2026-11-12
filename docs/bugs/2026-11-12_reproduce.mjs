// Read-only product probes. Run from the repository root; session logs go to /tmp.
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const req = createRequire(resolve(root, 'package.json'));
const source = (p) => import(pathToFileURL(resolve(root, p)).href);
const { readScenario } = await source('apps/hab-core/src/scenario.ts');
const { loadSession } = await source('apps/hab-core/src/session.ts');
const fixture = () => readScenario(resolve(root, 'apps/hab-core/tests/fixtures/fake-scenario'), {
  site_id: 'mock_site', data_version: 'mock_site-fixture', dir: null,
});
const mode = process.argv[2];
if (mode === 'session') {
  const loaded = fixture();
  console.log('VALIDATED scenario', loaded.scenario.scenario_id);
  loadSession(loaded, mkdtempSync('/tmp/marswalk-session-probe-'));
  console.log('LOADED');
} else if (mode === 'dedupe') {
  const loaded = fixture();
  // Explicit synthetic variant: omit tasks to isolate the independent seedTasks crash.
  loaded.scenario.stop_tasks = [];
  const session = loadSession(loaded, mkdtempSync('/tmp/marswalk-dedupe-probe-'));
  const command = { command_id: 'reload-once', role: 'ops', kind: 'LOAD_SCENARIO',
    args: { scenario_id: loaded.scenario.scenario_id } };
  for (let i = 0; i < 2; i++) {
    const out = session.apply(command, 'same-client');
    console.log('LOAD_DEDUPE', i + 1, JSON.stringify(out.result),
      session.snapshot([]).session.session_id, JSON.stringify(out.events.map(e => e.command_ref)));
  }
} else if (mode === 'event-log') {
  const React = req('react');
  const { installDom, mount, removeDom } = await source('apps/web/tests/ui/domHarness.ts');
  const { EventLog } = await source('apps/web/src/ui/ops/EventLog.tsx');
  // Declared synthetic UI event, not a science result or demo record.
  const events = [{ seq: 1, sim_time: '2024-05-20T00:00:00Z', kind: 'PLAN_REVISED',
    actor: 'ops', data: { plan_revision: 7 }, provenance: { 'data.plan_revision': 'simulated' },
    command_ref: null }];
  installDom();
  try {
    const mounted = await mount(React.createElement(EventLog, { events }));
    console.log('MOUNT SUCCESS');
    await mounted.unmount();
  } catch (error) {
    console.log('MOUNT FAILED:', error.message);
  }
  const stable = await mount(React.createElement(EventLog, { events,
    client: { events: () => events, subscribe: () => () => {} } }));
  console.log('STABLE ROW:', stable.container.querySelector('.event-row')?.textContent);
  console.log('SOURCE ATTRIBUTES:', stable.container.querySelectorAll('[data-source], [data-source-id]').length,
    'PROVENANCE:', stable.container.querySelectorAll('[data-provenance]').length);
  console.log('DECORATION', stable.container.querySelector('[aria-hidden=true]')?.getAttribute('style'));
  console.log('ACTIVE FILTER', stable.container.querySelector('[aria-pressed=true]')?.getAttribute('style'));
  await stable.unmount();
  removeDom();
} else {
  throw new Error('Usage: node --import tsx docs/bugs/2026-11-12_reproduce.mjs session|dedupe|event-log');
}
