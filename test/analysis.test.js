import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDataset, buildAuditJson, buildCsv, buildPassportReport, buildStressTest, cleanRows, parseCsv } from '../src/analysis.js';

const csv = 'id,region,age,email\nA,North,22,a@example.com\nA,North,22,a@example.com\nB,South,145,\nC,South,,c@example.com';

test('parses quoted commas and line breaks', () => {
  const result = parseCsv('name,note\nAda,"hello, world"\nBob,"two\nlines"');
  assert.deepEqual(result.headers, ['name', 'note']);
  assert.equal(result.rows[0][1], 'hello, world');
  assert.equal(result.rows[1][1], 'two\nlines');
});

test('detects research-relevant evidence, not only totals', () => {
  const result = analyzeDataset(parseCsv(csv));
  assert.ok(result.findings.some(finding => finding.id === 'duplicates'));
  assert.ok(result.findings.some(finding => finding.id === 'range-2'));
  assert.ok(result.findings.some(finding => finding.category === 'Privacy'));
  assert.equal(result.gate, 'Needs review');
});

test('CSV export round-trips safely', () => {
  const result = parseCsv('name,note\nAda,"hello, world"');
  assert.deepEqual(parseCsv(buildCsv(result.headers, result.rows)), result);
});

test('passport report is honest and contains evidence', () => {
  const report = buildPassportReport(analyzeDataset(parseCsv(csv)));
  assert.match(report, /DataTrust Passport/);
  assert.match(report, /Evidence/);
  assert.match(report, /does not certify truth/);
});

test('stress test compares conclusions across cleaning assumptions', () => {
  const result = analyzeDataset(parseCsv('id,region,income\n1,North,42000\n2,North,51000\n3,North,47000\n3,North,47000\n4,South,39000\n5,South,\n6,South,\n7,East,68000\n8,East,59000\n9,East,70000\n10,East,72000\n11,East,75000\n12,East,76000\n13,East,77000'));
  const stress = buildStressTest(result);
  assert.equal(stress.question, 'Does North have a higher average income than South?');
  assert.equal(stress.scenarios.length, 3);
  assert.equal(stress.scenarios[0].values[0].mean, 46750);
  assert.equal(stress.scenarios[0].values[1].mean, 39000);
  assert.equal(stress.scenarios[0].comparisonLabel, 'North higher');
  assert.equal(stress.scenarios[1].values[0].mean, 46666.666666666664);
  assert.equal(stress.scenarios[1].values[1].mean, 39000);
  assert.equal(stress.scenarios[1].comparisonLabel, 'North higher');
  assert.equal(stress.scenarios[2].observedMedian, 63500);
  assert.equal(stress.scenarios[2].values[0].mean, 46750);
  assert.equal(stress.scenarios[2].values[1].mean, 55333.333333333336);
  assert.equal(stress.scenarios[2].comparisonLabel, 'South higher');
  assert.equal(stress.conclusionSensitive, true);
  assert.match(buildPassportReport(result), /Conclusion stress test/);
});

test('scenario counts and independent copies remain stable', () => {
  const rows = [];
  for (let index = 0; index < 38; index += 1) rows.push([`A-${index}`, 'A', String(40000 + index)]);
  for (let index = 0; index < 12; index += 1) rows.push([`A-${index}`, 'A', String(40000 + index)]);
  for (let index = 0; index < 30; index += 1) rows.push([`B-${index}`, 'B', String(50000 + index)]);
  const original = rows.map(row => [...row]);
  const stress = buildStressTest({ headers: ['id', 'region', 'income'], rows });
  assert.deepEqual(rows, original);
  assert.equal(stress.scenarios[0].values[0].n, 50);
  assert.equal(stress.scenarios[0].values[1].n, 30);
  assert.equal(stress.scenarios[1].values[0].n, 38);
  assert.equal(stress.scenarios[1].values[1].n, 30);
  assert.equal(stress.scenarios[2].values[0].n, 50);
  assert.equal(stress.scenarios[2].values[1].n, 30);
});

test('equal means produce an explicit neutral conclusion', () => {
  const stress = buildStressTest(parseCsv('id,region,income\n1,A,10\n2,A,20\n3,B,15\n4,B,15'));
  assert.equal(stress.scenarios[0].comparisonLabel, 'Neither group higher');
  assert.equal(stress.conclusionSensitive, false);
});

test('conclusion-sensitive warning reflects a real direction change', () => {
  const stress = buildStressTest(parseCsv('id,region,income\n1,A,10\n2,A,100\n2,A,100\n3,B,60\n4,B,60'));
  assert.equal(stress.scenarios[0].comparisonLabel, 'A higher');
  assert.equal(stress.scenarios[1].comparisonLabel, 'B higher');
  assert.equal(stress.conclusionSensitive, true);
});

test('median imputation uses the original scenario median, not deduplicated data', () => {
  const stress = buildStressTest(parseCsv('id,region,income\n1,A,10\n1,A,10\n2,A,20\n3,B,100\n4,B,'));
  const imputed = stress.scenarios.find(scenario => scenario.id === 'impute');
  const deduped = stress.scenarios.find(scenario => scenario.id === 'dedupe');
  assert.equal(imputed.observedMedian, 15);
  assert.equal(deduped.values[0].n, 2);
  assert.equal(imputed.values[0].mean, 13.333333333333334);
  assert.equal(imputed.values[1].mean, 57.5);
});

test('rejects malformed rows without discarding them', () => {
  assert.throws(() => parseCsv('a,b\n1,2,3'), /Row 2 has 3 fields/);
  assert.throws(() => parseCsv('a,b\n"unterminated,2'), /unterminated/);
});

test('normalizes duplicate headers and protects the audit record', () => {
  const parsed = parseCsv('value,value\n1,2');
  assert.deepEqual(parsed.headers, ['value', 'value (2)']);
  assert.equal(analyzeDataset(parsed).findings.some(finding => finding.category === 'Structure'), true);
});

test('cleaning operations are deterministic and audit JSON is structured', () => {
  const rows = [['  a ', '1'], ['  a ', '1'], ['b', '']];
  assert.deepEqual(cleanRows(rows, 'dedupe'), [['  a ', '1'], ['b', '']]);
  assert.deepEqual(cleanRows(rows, 'trim')[0], ['a', '1']);
  assert.deepEqual(cleanRows(rows, 'exclude-missing', 1), [['  a ', '1'], ['  a ', '1']]);
  const audit = JSON.parse(buildAuditJson(analyzeDataset(parseCsv('a,b\n1,2')), { sha256: 'abc' }));
  assert.equal(audit.source.sha256, 'abc');
  assert.equal(audit.dimensions.rows, 1);
});
