import { analyzeDataset, buildAuditJson, buildCsv, buildPassportReport, buildStressTest, cleanRows, demoCsv, parseCsv } from './analysis.js';

const app = document.querySelector('#app');
let state = { result: null, originalData: null, fileName: 'No dataset loaded', purpose: 'research', reviewed: new Set(), operations: [], fingerprint: '', sourceBytes: 0, busy: false };

function download(name, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

function esc(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function count(severity) { return state.result?.findings.filter(finding => finding.severity === severity).length ?? 0; }
async function fingerprint(text) { const bytes = new TextEncoder().encode(text); const digest = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
function analyzeCurrent(rows) { const result = analyzeDataset({ headers: state.originalData.headers, rows }, state.purpose); result.stressTest = buildStressTest({ headers: state.originalData.headers, rows: state.originalData.rows }); return result; }

function render() {
  const result = state.result;
  app.innerHTML = `
    <header class="topbar"><div class="brand"><span class="brand-mark">✦</span><span>DataTrust <b>Passport</b></span></div><div class="top-meta"><span class="local-dot"></span> Runs locally · no upload</div></header>
    <main class="shell">
      <section class="hero"><div><p class="eyebrow">RESEARCH DATA WORKBENCH</p><h1>Make your dataset<br /><em>defensible.</em></h1><p class="lede">DataTrust turns a messy CSV into a transparent evidence trail — so you can see what might invalidate your analysis before it does.</p></div><div class="hero-note"><span>01</span><p>Numbers are computed locally.<br /><strong>You review. Nothing edits silently.</strong></p></div></section>
      <section class="control-row"><label class="upload dropzone" id="dropzone"><input id="file-input" type="file" accept=".csv,text/csv" /><span class="upload-icon">↑</span><span><b>Upload or drop a CSV</b><small>Private by design · stays in your browser · max 5 MB</small></span></label><button class="button secondary" id="demo-button">Load demo dataset</button><label class="purpose"><span>Intent</span><select id="purpose"><option value="research" ${state.purpose === 'research' ? 'selected' : ''}>Research analysis</option><option value="ml" ${state.purpose === 'ml' ? 'selected' : ''}>Machine learning</option><option value="survey" ${state.purpose === 'survey' ? 'selected' : ''}>Survey data</option></select></label></section>
      ${result ? renderPassport(result) : renderEmpty()}
    </main>`;
  document.querySelector('#file-input').addEventListener('change', onFile);
  const dropzone = document.querySelector('#dropzone');
  ['dragenter', 'dragover'].forEach(eventName => dropzone.addEventListener(eventName, event => { event.preventDefault(); dropzone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(eventName => dropzone.addEventListener(eventName, event => { event.preventDefault(); dropzone.classList.remove('dragging'); }));
  dropzone.addEventListener('drop', event => { const file = event.dataTransfer.files[0]; if (file) readFile(file); });
  document.querySelector('#demo-button').addEventListener('click', () => loadData(demoCsv, 'research-demo.csv'));
  document.querySelector('#purpose').addEventListener('change', event => { state.purpose = event.target.value; if (state.result) { state.result = analyzeCurrent(state.result.rows); render(); } });
  if (result) wireResultActions();
}

function renderEmpty() {
  return `<section class="empty-state"><div class="empty-orbit">✦</div><h2>Start with a dataset</h2><p>Upload a CSV or explore the synthetic research survey. You will get findings, evidence, suggested actions and a reproducible passport.</p><div class="mini-list"><span>01 <b>Profile structure</b></span><span>02 <b>Surface research risks</b></span><span>03 <b>Export decisions</b></span></div></section>`;
}

function renderPassport(result) {
  const reviewed = state.reviewed.size;
  const visible = result.findings.filter(finding => !state.reviewed.has(finding.id));
  return `<section class="passport-head"><div><p class="eyebrow">DATA PASSPORT / ${esc(state.fileName)}</p><h2>${esc(result.gate)}</h2><p class="muted">${result.rows.length.toLocaleString()} rows · ${result.headers.length} columns · ${state.sourceBytes.toLocaleString()} bytes · SHA-256 ${state.fingerprint.slice(0, 16)}…</p><p class="muted">A signal-based review for ${esc(state.purpose)}. Not a certification of truth.</p></div><div class="score"><div class="score-number">${result.score}</div><div><span>/100</span><small>review status</small></div></div></section>
    <section class="metrics"><div><span>ROWS</span><strong>${result.rows.length.toLocaleString()}</strong></div><div><span>FIELDS</span><strong>${result.headers.length}</strong></div><div><span>HIGH RISK</span><strong class="${count('high') ? 'danger' : ''}">${count('high')}</strong></div><div><span>REVIEWED</span><strong>${reviewed}/${result.findings.length}</strong></div></section>
    <section class="passport-grid"><div class="main-column"><div class="section-heading"><div><p class="eyebrow">EVIDENCE LEDGER</p><h3>What needs your attention</h3></div><span class="finding-count">${visible.length} open finding${visible.length === 1 ? '' : 's'}</span></div>${visible.length ? visible.map(renderFinding).join('') : `<div class="success-card"><span>✓</span><div><strong>All findings reviewed</strong><p>You have acknowledged every automated signal. The final decision still belongs to the researcher.</p></div></div>`}${renderStressTest(result.stressTest)}${renderCleaningStudio(result)}<div class="section-heading table-heading"><div><p class="eyebrow">DATA PREVIEW</p><h3>Current data · first 6 records</h3></div><button class="text-button" id="reset-review">Reset review</button></div><div class="table-wrap">${renderTable(result.headers, result.rows.slice(0, 6))}</div></div><aside class="side-column"><div class="side-card"><p class="eyebrow">REPRODUCIBILITY</p><h3>Take the evidence with you.</h3><p class="muted">Export the current approved data state, findings, operations and limitations.</p><button class="button primary" id="download-report">↓ Download passport</button><button class="button outline" id="download-json">↓ Download audit JSON</button><button class="button outline" id="download-csv">↓ Download current CSV</button></div><div class="side-card"><p class="eyebrow">READINESS GATES</p>${gate('Explore', !count('high'), 'Structure and quality signals are visible')}${gate('Model', !count('high') && !result.findings.some(finding => finding.category === 'Integrity'), 'No unresolved integrity blockers')}${gate('Publish', visible.length === 0 && !result.stressTest?.conclusionSensitive, 'Findings reviewed and conclusion stable')}</div><div class="side-card limitation"><span>ⓘ</span><p><strong>Honest limitation</strong><br />DataTrust finds signals. It cannot prove causality, fairness, accuracy or legal compliance.</p></div></aside></section>`;
}

function gate(label, pass, detail) { return `<div class="gate"><span class="gate-icon ${pass ? 'pass' : ''}">${pass ? '✓' : '—'}</span><div><strong>${label}</strong><small>${detail}</small></div></div>`; }
function renderFinding(finding) { return `<article class="finding ${finding.severity}"><div class="finding-top"><span class="severity">${finding.severity}</span><span class="category">${esc(finding.category)}</span></div><h4>${esc(finding.title)}</h4><div class="evidence"><span>Evidence</span><p>${esc(finding.evidence)}</p></div><div class="finding-bottom"><div><span>WHY IT MATTERS</span><p>${esc(finding.impact)}</p></div><div><span>SUGGESTED ACTION</span><p>${esc(finding.action)}</p></div></div><button class="review-button" data-review="${esc(finding.id)}">Mark as reviewed →</button></article>`; }
function renderStressTest(stressTest) {
  if (!stressTest) return '';
  const max = Math.max(...stressTest.scenarios.flatMap(scenario => scenario.values.map(value => value.mean ?? 0)), 1);
  return `<section class="stress-test"><div class="stress-header"><div><p class="eyebrow">CONCLUSION STRESS TEST</p><h3>Would your conclusion survive cleaning?</h3><p class="muted">${esc(stressTest.question)} We test the direction under three transparent assumptions.</p></div><span class="stability ${stressTest.conclusionSensitive ? 'sensitive' : 'stable'}">${stressTest.conclusionSensitive ? '⚠ CONCLUSION-SENSITIVE' : '✓ DIRECTION STABLE'}</span></div><div class="scenario-chart">${stressTest.scenarios.map(scenario => `<div class="scenario-row"><div class="scenario-label"><strong>${esc(scenario.label)}</strong><small>${esc(scenario.note)}</small></div><div class="bars">${scenario.values.map((value, index) => `<div class="bar-line"><span>${esc(value.group)} (n=${value.n})</span><div class="bar-track"><i style="width:${value.mean === null ? 0 : Math.max(4, value.mean / max * 100)}%"></i></div><b>${value.mean === null ? '—' : formatMetric(value.mean)}</b></div>`).join('')}</div><span class="direction">${esc(scenario.comparisonLabel)}</span></div>`).join('')}</div><div class="stress-foot"><span>Illustrative scenario comparison, not statistical significance.</span><strong>${stressTest.conclusionSensitive ? 'Review assumptions before reporting this result.' : 'The observed direction stayed consistent in this test.'}</strong></div></section>`;
}
function formatMetric(value) { return Number.isInteger(value) ? value.toLocaleString('en-IN') : value.toLocaleString('en-IN', { maximumFractionDigits: 1 }); }
function renderCleaningStudio(result) { const hasIncome = result.headers.some(header => /income/i.test(header)); return `<section class="cleaning-studio"><div class="section-heading"><div><p class="eyebrow">CLEANING STUDIO</p><h3>Approve reversible changes</h3></div><span class="finding-count">${state.operations.length} operation${state.operations.length === 1 ? '' : 's'}</span></div><p class="muted">Nothing changes until you approve it. Every operation is applied to a copy and can be undone.</p><div class="clean-actions"><button class="button outline" data-clean="dedupe">Remove exact duplicates</button><button class="button outline" data-clean="trim">Standardize whitespace</button>${hasIncome ? '<button class="button outline" data-clean="exclude-missing">Exclude rows missing income</button>' : ''}<button class="button outline" id="undo-clean" ${state.operations.length ? '' : 'disabled'}>Undo previous</button><button class="button outline" id="reset-clean" ${state.operations.length ? '' : 'disabled'}>Reset to original</button></div>${state.operations.length ? `<div class="operation-log">${state.operations.map(operation => `<span>✓ ${esc(operation.label)} · ${operation.affected} row(s)</span>`).join('')}</div>` : ''}</section>`; }
function renderTable(headers, rows) { return `<table><thead><tr>${headers.map(header => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell || '—')}</td>`).join('')}</tr>`).join('')}</tbody></table>`; }

function wireResultActions() {
  document.querySelectorAll('[data-review]').forEach(button => button.addEventListener('click', () => { state.reviewed.add(button.dataset.review); render(); }));
  document.querySelector('#reset-review').addEventListener('click', () => { state.reviewed.clear(); render(); });
  document.querySelector('#download-report').addEventListener('click', () => download('datatrust-passport.md', buildPassportReport(state.result), 'text/markdown'));
  document.querySelector('#download-json').addEventListener('click', () => download('datatrust-audit.json', buildAuditJson(state.result, { fileName: state.fileName, sha256: state.fingerprint, bytes: state.sourceBytes, operations: state.operations }), 'application/json'));
  document.querySelector('#download-csv').addEventListener('click', () => download('datatrust-cleaned.csv', buildCsv(state.result.headers, state.result.rows), 'text/csv'));
  document.querySelectorAll('[data-clean]').forEach(button => button.addEventListener('click', () => applyClean(button.dataset.clean)));
  document.querySelector('#undo-clean').addEventListener('click', undoClean);
  document.querySelector('#reset-clean').addEventListener('click', resetClean);
}
function applyClean(operation) { const metricIndex = state.result.headers.findIndex(header => /income/i.test(header)); const nextRows = cleanRows(state.result.rows, operation, metricIndex); const labels = { dedupe: 'Remove exact duplicates', trim: 'Standardize whitespace', 'exclude-missing': 'Exclude rows missing income' }; state.operations.push({ label: labels[operation], operation, affected: state.result.rows.length - nextRows.length }); state.result = analyzeCurrent(nextRows); state.reviewed.clear(); render(); }
function undoClean() { if (!state.operations.length) return; state.operations.pop(); const rows = state.operations.reduce((current, operation) => cleanRows(current, operation.operation, state.result.headers.findIndex(header => /income/i.test(header))), state.originalData.rows); state.result = analyzeCurrent(rows); state.reviewed.clear(); render(); }
function resetClean() { state.operations = []; state.result = analyzeCurrent(state.originalData.rows); state.reviewed.clear(); render(); }
async function loadData(text, fileName) { try { const parsed = parseCsv(text); state.originalData = parsed; state.result = analyzeCurrent(parsed.rows); state.fileName = fileName; state.sourceBytes = new TextEncoder().encode(text).byteLength; state.fingerprint = await fingerprint(text); state.operations = []; state.reviewed.clear(); render(); } catch (error) { alert(error.message); } }
function readFile(file) { if (!file.name.toLowerCase().endsWith('.csv')) { alert('Please choose a CSV file.'); return; } const reader = new FileReader(); reader.onload = () => loadData(reader.result, file.name); reader.onerror = () => alert('The file could not be read.'); reader.readAsText(file); }
function onFile(event) { const file = event.target.files[0]; if (file) readFile(file); }

render();
