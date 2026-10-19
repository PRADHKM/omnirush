const PII_PATTERNS = [
  { pattern: /email|e-mail/i, label: 'Email address' },
  { pattern: /phone|mobile|telephone/i, label: 'Phone number' },
  { pattern: /name|address|street/i, label: 'Personal identity' },
  { pattern: /ssn|aadhaar|passport|pan|national.?id/i, label: 'Government identifier' }
];

export function parseCsv(text, { maxBytes = 5 * 1024 * 1024 } = {}) {
  if (typeof text !== 'string' || text.trim() === '') throw new Error('The CSV is empty. Add a header row and at least one data row.');
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('This CSV is larger than the 5 MB supported limit.');
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(cell); cell = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = []; continue;
    }
    cell += char;
  }
  if (quoted) throw new Error('The CSV has an unterminated quoted field. Check the final quote.');
  if (cell !== '' || row.length) { row.push(cell); if (row.some(value => value.trim() !== '')) rows.push(row); }
  if (rows.length < 2) throw new Error('Add a CSV with a header row and at least one data row.');
  const seenHeaders = new Map();
  const headerWarnings = [];
  const headers = rows[0].map((header, index) => {
    const base = header.trim() || `Column ${index + 1}`;
    const seen = seenHeaders.get(base) ?? 0;
    seenHeaders.set(base, seen + 1);
    if (seen) headerWarnings.push(`Duplicate header “${base}” renamed to “${base} (${seen + 1})”.`);
    return seen ? `${base} (${seen + 1})` : base;
  });
  const dataRows = rows.slice(1);
  const malformed = dataRows.findIndex(values => values.length !== headers.length);
  if (malformed >= 0) throw new Error(`Row ${malformed + 2} has ${dataRows[malformed].length} fields; expected ${headers.length}. No rows were discarded.`);
  return { headers, rows: dataRows.map(values => headers.map((_, index) => values[index].trim())), headerWarnings };
}

function numericValues(values) {
  const parsed = values.map(value => value === '' ? null : Number(value));
  return parsed.every(value => value === null || Number.isFinite(value)) && parsed.some(value => value !== null) ? parsed : null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value);
}
function quartile(values, fraction) { const sorted = [...values].sort((a, b) => a - b); const position = (sorted.length - 1) * fraction; const lower = Math.floor(position); const upper = Math.ceil(position); return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower); }

export function analyzeDataset({ headers, rows, headerWarnings = [] }, purpose = 'research') {
  const findings = [];
  const columns = headers.map((name, index) => {
    const values = rows.map(row => row[index] ?? '');
    const missing = values.filter(value => value === '').length;
    const unique = new Set(values.filter(Boolean)).size;
    const numeric = numericValues(values);
    const pii = PII_PATTERNS.find(item => item.pattern.test(name));
    const column = { name, index, values, missing, unique, numeric, pii: pii?.label ?? null };
    if (missing > 0) {
      const percent = missing / rows.length * 100;
      findings.push({ id: `missing-${index}`, severity: percent >= 20 ? 'high' : 'medium', category: 'Completeness', title: `${name} has missing values`, evidence: `${formatNumber(missing)} of ${formatNumber(rows.length)} rows (${formatNumber(percent)}%) are blank.`, impact: percent >= 20 ? 'Results using this field may be biased or underpowered.' : 'Document how these records will be handled.', action: 'Review the pattern before imputing or filtering.' });
    }
    if (pii) findings.push({ id: `pii-${index}`, severity: 'medium', category: 'Privacy', title: `${name} may contain ${pii.label.toLowerCase()}`, evidence: `The column name matches a common ${pii.label.toLowerCase()} pattern.`, impact: 'Do not publish raw values unless you have a lawful basis and consent.', action: 'Exclude, mask or aggregate this column before sharing.' });
    if (numeric) {
      const present = numeric.filter(value => value !== null);
      const low = Math.min(...present), high = Math.max(...present), med = median(present), q1 = quartile(present, 0.25), q3 = quartile(present, 0.75), iqr = q3 - q1;
      const spread = iqr === 0 ? [] : present.filter(value => value < q1 - 1.5 * iqr || value > q3 + 1.5 * iqr);
      if (spread.length) findings.push({ id: `outlier-${index}`, severity: 'medium', category: 'Validity', title: `${name} contains unusual values`, evidence: `${spread.length} value(s) fall outside the Tukey 1.5×IQR fence (${formatNumber(q1 - 1.5 * iqr)}–${formatNumber(q3 + 1.5 * iqr)}); observed range is ${formatNumber(low)}–${formatNumber(high)}.`, impact: 'Extreme values can dominate averages and model behaviour.', action: 'Inspect the affected records; an outlier is not automatically an error.' });
      if (/age/i.test(name) && present.some(value => value < 0 || value > 120)) findings.push({ id: `range-${index}`, severity: 'high', category: 'Validity', title: `${name} contains impossible ages`, evidence: 'At least one value is below 0 or above 120.', impact: 'Invalid records can make summary statistics and conclusions unreliable.', action: 'Correct from source or mark as missing.' });
    }
    const present = values.filter(Boolean);
    const summary = numeric ? { min: Math.min(...numeric.filter(value => value !== null)), max: Math.max(...numeric.filter(value => value !== null)), mean: mean(numeric.filter(value => value !== null)) } : { top: present.sort((a, b) => values.filter(value => value === b).length - values.filter(value => value === a).length)[0] ?? null };
    return { ...column, type: numeric ? 'numeric' : 'categorical', summary };
  });

  const duplicateKeys = new Map();
  rows.forEach((row, index) => { const key = row.join('\u001f'); duplicateKeys.set(key, [...(duplicateKeys.get(key) ?? []), index + 2]); });
  const duplicateGroups = [...duplicateKeys.values()].filter(group => group.length > 1);
  if (duplicateGroups.length) findings.push({ id: 'duplicates', severity: 'high', category: 'Integrity', title: 'Duplicate records detected', evidence: `${duplicateGroups.length} identical record group(s) affect ${duplicateGroups.reduce((sum, group) => sum + group.length, 0)} rows.`, impact: 'Duplicates can inflate counts and make effects look stronger than they are.', action: 'Review duplicates and remove only when the source confirms they are accidental.' });

  const idColumn = columns.find(column => /(^id$|identifier|respondent|subject)/i.test(column.name));
  if (idColumn && idColumn.unique < rows.length) findings.push({ id: 'id-collisions', severity: 'medium', category: 'Integrity', title: `${idColumn.name} is not unique`, evidence: `${rows.length - idColumn.unique} repeated identifier value(s) were found.`, impact: 'Repeated subjects may break assumptions about independent observations.', action: 'Confirm whether repeated measurements are intentional.' });

  const groupColumn = columns.find(column => /region|group|category|cohort|class/i.test(column.name));
  const outcomeColumn = columns.find(column => /outcome|target|label|class|result/i.test(column.name));
  if (groupColumn) {
    const groupStats = [...new Set(groupColumn.values.filter(Boolean))].map(group => ({ group, total: rows.filter(row => row[groupColumn.index] === group).length, missing: rows.filter(row => row[groupColumn.index] === group && row.some(value => value === '')).length }));
    const largestGap = Math.max(...groupStats.map(stat => stat.total ? stat.missing / stat.total : 0)) - Math.min(...groupStats.map(stat => stat.total ? stat.missing / stat.total : 0));
    if (largestGap >= 0.2) findings.push({ id: 'subgroup-missingness', severity: 'high', category: 'Completeness', title: `Missingness differs by ${groupColumn.name}`, evidence: `The gap between subgroup missingness rates is ${(largestGap * 100).toFixed(1)} percentage points.`, impact: 'A cleaning rule that looks harmless overall may disproportionately change one subgroup.', action: 'Compare results by subgroup before filtering or imputing.' });
    if (groupStats.some(stat => stat.total < 3)) findings.push({ id: 'small-subgroups', severity: 'medium', category: 'Representativeness', title: 'Some subgroups have very few records', evidence: groupStats.filter(stat => stat.total < 3).map(stat => `${stat.group} (n=${stat.total})`).join(', '), impact: 'Small groups produce unstable descriptive comparisons.', action: 'Report subgroup counts and avoid over-interpreting differences.' });
  }
  if (outcomeColumn) {
    const counts = [...new Set(outcomeColumn.values.filter(Boolean))].map(value => rows.filter(row => row[outcomeColumn.index] === value).length);
    if (counts.length === 2 && Math.min(...counts) / Math.max(...counts) < 0.25) findings.push({ id: 'class-imbalance', severity: 'medium', category: 'Representativeness', title: `${outcomeColumn.name} is imbalanced`, evidence: `The smallest class has ${Math.min(...counts)} records versus ${Math.max(...counts)} in the largest class.`, impact: 'A model or summary can be dominated by the majority class.', action: 'Report class counts and choose evaluation metrics deliberately.' });
  }

  const score = Math.max(0, 100 - findings.reduce((total, finding) => total + (finding.severity === 'high' ? 16 : 7), 0));
  const high = findings.filter(finding => finding.severity === 'high').length;
  const gate = high ? 'Needs review' : findings.length ? 'Ready to explore' : 'Ready to model';
  headerWarnings.forEach((warning, index) => findings.push({ id: `header-${index}`, severity: 'medium', category: 'Structure', title: 'Duplicate column name normalized', evidence: warning, impact: 'Ambiguous headers can make analysis and exported reports difficult to interpret.', action: 'Rename columns in the source when possible.' }));
  return { headers, rows, columns, findings, score, gate, purpose, duplicateGroups, stressTest: buildStressTest({ headers, rows }) };
}

function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function direction(delta) { return delta === null ? 'insufficient data' : delta > 0.0001 ? 'Group A higher' : delta < -0.0001 ? 'Group B higher' : 'approximately equal'; }

function scenarioMeans(rows, groupIndex, metricIndex, groups, mode) {
  let working = rows;
  if (mode === 'dedupe') {
    const seen = new Set();
    working = rows.filter(row => { const key = row.join('\u001f'); if (seen.has(key)) return false; seen.add(key); return true; });
  }
  const numbers = working.map(row => Number(row[metricIndex])).filter(Number.isFinite);
  const replacement = median(numbers);
  return groups.map(group => {
    const values = working.filter(row => row[groupIndex] === group).map(row => {
      if (row[metricIndex] === '') return mode === 'impute' && replacement !== null ? replacement : null;
      return Number(row[metricIndex]);
    }).filter(value => value !== null && Number.isFinite(value));
    return { group, mean: mean(values), n: values.length };
  });
}

export function buildStressTest({ headers, rows }) {
  const groupIndex = headers.findIndex(header => /region|group|category|cohort/i.test(header));
  const metricIndex = headers.findIndex(header => /income|score|result|performance|value|amount/i.test(header));
  if (groupIndex < 0 || metricIndex < 0) return null;
  const groups = [...new Set(rows.map(row => row[groupIndex]).filter(Boolean))].slice(0, 2);
  if (groups.length < 2) return null;
  const scenarios = [
    { id: 'original', label: 'Original complete cases', note: 'Uses only rows where the comparison value is present.', mode: 'original' },
    { id: 'dedupe', label: 'Remove exact duplicates', note: 'Removes identical rows before calculating group means.', mode: 'dedupe' },
    { id: 'impute', label: 'Median imputation', note: 'Fills blank metric values with the global observed median.', mode: 'impute' }
  ].map(scenario => {
    const values = scenarioMeans(rows, groupIndex, metricIndex, groups, scenario.mode);
    const delta = values[0].mean !== null && values[1].mean !== null ? values[0].mean - values[1].mean : null;
    return { ...scenario, values, delta, direction: direction(delta) };
  });
  const directions = scenarios.filter(scenario => scenario.delta !== null).map(scenario => scenario.direction);
  const conclusionSensitive = new Set(directions).size > 1;
  return { groupColumn: headers[groupIndex], metricColumn: headers[metricIndex], groups, scenarios, conclusionSensitive, question: `Does ${groups[0]} have a higher average ${headers[metricIndex]} than ${groups[1]}?` };
}

export function buildCsv(headers, rows) {
  const escape = value => { const text = String(value ?? ''); return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
  return [headers, ...rows].map(row => row.map(escape).join(',')).join('\n');
}

export function cleanRows(rows, operation, metricIndex = -1) {
  if (operation === 'dedupe') {
    const seen = new Set();
    return rows.filter(row => { const key = row.join('\u001f'); if (seen.has(key)) return false; seen.add(key); return true; });
  }
  if (operation === 'trim') return rows.map(row => row.map(value => value.trim()));
  if (operation === 'exclude-missing' && metricIndex >= 0) return rows.filter(row => row[metricIndex] !== '');
  throw new Error('Unknown cleaning operation.');
}

export function buildAuditJson(result, metadata = {}) {
  return JSON.stringify({ tool: 'DataTrust Passport', version: '0.2.0', exportedAt: new Date().toISOString(), source: metadata, dimensions: { rows: result.rows.length, columns: result.headers.length }, columns: result.columns.map(column => ({ name: column.name, type: column.type, missing: column.missing, unique: column.unique, summary: column.summary })), findings: result.findings, conclusionStressTest: result.stressTest, limitations: ['Heuristics do not certify truth, causality, fairness or legal compliance.', 'Stress tests are descriptive sensitivity checks, not statistical significance tests.'] }, null, 2);
}

export function buildPassportReport(result) {
  const lines = [`# DataTrust Passport`, '', `- **Readiness:** ${result.gate}`, `- **Readiness score:** ${result.score}/100`, `- **Rows:** ${result.rows.length}`, `- **Columns:** ${result.headers.length}`, '', '## Findings', ''];
  if (!result.findings.length) lines.push('No automated findings. Review domain-specific assumptions before publication.');
  result.findings.forEach(finding => lines.push(`### ${finding.severity.toUpperCase()} · ${finding.title}`, `- **Evidence:** ${finding.evidence}`, `- **Why it matters:** ${finding.impact}`, `- **Suggested action:** ${finding.action}`, ''));
  if (result.stressTest) {
    lines.push('## Conclusion stress test', '', `**Question:** ${result.stressTest.question}`, '', `**Stability:** ${result.stressTest.conclusionSensitive ? 'Conclusion-sensitive — the direction changes under at least one scenario.' : 'Direction stayed consistent across the tested scenarios.'}`, '');
    result.stressTest.scenarios.forEach(scenario => lines.push(`### ${scenario.label}`, `- ${scenario.note}`, `- ${result.stressTest.groups[0]}: ${scenario.values[0].mean === null ? 'insufficient data' : scenario.values[0].mean.toFixed(1)}`, `- ${result.stressTest.groups[1]}: ${scenario.values[1].mean === null ? 'insufficient data' : scenario.values[1].mean.toFixed(1)}`, `- Direction: ${scenario.direction}`, ''));
  }
  lines.push('## Limitations', '', 'DataTrust identifies signals; it does not certify truth, causality, fairness or legal compliance. Review findings with a domain expert.');
  return lines.join('\n');
}

const demoCsvBase = `respondent_id,region,age,income,sleep_hours,outcome,email\nR-001,North,22,42000,7,1,asha@example.com\nR-002,South,31,,6,0,dev@example.com\nR-003,North,27,51000,8,1,lee@example.com\nR-003,North,27,51000,8,1,lee@example.com\nR-004,South,145,,4,0,\nR-005,South,42,39000,3,0,\nR-006,East,36,68000,7,1,\nR-007,East,29,,18,1,\nR-008,North,25,47000,7,1,\nR-009,South,39,,5,0,\nR-010,East,33,59000,6,0,\nR-011,East,41,70000,7,1,\nR-012,East,38,72000,8,1,\n`;
export const demoCsv = `respondent_id,region,age,income,sleep_hours,outcome,email\nR-001,North,22,42000,7,1,asha@example.com\nR-002,South,31,,6,0,dev@example.com\nR-003,North,27,51000,8,1,lee@example.com\nR-003,North,27,51000,8,1,lee@example.com\nR-004,South,145,,4,0,\nR-005,South,42,39000,3,0,\nR-006,East,36,68000,7,1,\nR-007,East,29,,18,1,\nR-008,North,25,47000,7,1,\nR-009,South,39,,5,0,\nR-010,East,33,59000,6,0,\nR-011,East,41,70000,7,1,\nR-012,East,38,72000,8,1,\nR-013,East,45,75000,7,1,\nR-014,East,44,76000,8,1,\nR-015,East,46,77000,7,1,\n`;
