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
  assert.equal(stress.conclusionSensitive, true);
  assert.match(buildPassportReport(result), /Conclusion stress test/);
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
