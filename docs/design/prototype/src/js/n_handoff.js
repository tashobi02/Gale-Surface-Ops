'use strict';
/* ===== HANDOFF NOTES page (same data as docs/design/mockup-handoff.md) ===== */
function pageHandoff() {
  const H = FX.handoff, tb = (heads, rows) => `<table class="sp"><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
  const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
  const matrix = SCR_ORDER.filter(id => SCREENS[id]).map(id => { const S = SCREENS[id]; return [`<b>${id}</b> ${esc(S.name)}<br><span class="code">${esc(S.route)} · ${S.mode.toUpperCase()} · ${S.tier}</span>`, S.states.map(([k, l]) => `<a href="#${ROUTER.hashFor(id, k, S.orientToggle ? 'landscape' : null)}">${esc(l)}</a>`).join(' · ')]; });
  return { title: 'Handoff notes', route: '(prototype shell)', html: `<h1>Handoff notes</h1><p class="lead">Full text: <code>docs/design/mockup-handoff.md</code>. This page shows the same tables, generated from the same data.</p>
    <h2>Deviations from spec</h2>${tb(['ID', 'Item', 'Spec says', 'Prototype / proposal', 'Status'], H.deviations.map(r => r.map(md)))}
    <h2>Draft replacement text</h2><p class="lead"><b>04 §F Responsive row:</b></p><pre class="cut cut-s" style="--fill:#14181D;padding:10px 14px;font:12px/1.5 var(--f-mono);white-space:pre-wrap">${esc(H.patch_f)}</pre><p class="lead"><b>01 FR-32 acceptance, first bullet:</b></p><pre class="cut cut-s" style="--fill:#14181D;padding:10px 14px;font:12px/1.5 var(--f-mono);white-space:pre-wrap">${esc(H.patch_fr32)}</pre><p class="lead">04 §E.5 landscape layout and SCR-14 landscape text: see the handoff document, section “Draft patch text”.</p>
    <h2>Conflicts and gaps (never resolved silently)</h2>${tb(['ID', 'Where', 'Conflict', 'Handling'], H.gaps.map(r => r.map(md)))}
    <h2>Unresolved items (continuing from U-29)</h2>${tb(['ID', 'Item', 'Owner', 'Due'], H.unresolved.map(r => r.map(md)))}
    <h2>State matrix (screen × state → prototype hash)</h2>${tb(['Screen', 'States'], matrix)}
    <h2>Component inventory → proposed React components in apps/web</h2>${tb(['Component', 'Path', 'Props', 'States', 'Tokens', 'Spec'], H.components.map(r => r.map(md)))}
    <h2>Interaction specs</h2>${tb(['Interaction', 'Spec', 'Behaviour'], H.interactions.map(r => r.map(md)))}
    <h2>Accessibility notes</h2><ul style="list-style:disc;padding-left:20px;max-width:100ch">${H.a11y.map(x => `<li style="margin:4px 0">${md(x)}</li>`).join('')}</ul>
    <h2>Fixture schema → entities and messages</h2>${tb(['Fixture key', 'Maps to', 'Notes'], H.fixture_map.map(r => r.map(md)))}
    <h2>Usability test script (04 §F.1, TASK-15) with the landscape glove test</h2>${tb(['ID', 'Task', 'Pass', 'Source'], H.usability.map(r => r.map(md)))}`, mount() { } };
}
