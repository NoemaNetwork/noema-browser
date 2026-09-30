import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RunUiJournal, compactRunUiSnapshotForPersist, runUiUnavailableBeforeSeq } from '../src/run-ui-journal.js';

test('acknowledged progress remains replayable after panel replacement', () => {
  const journal = new RunUiJournal();
  journal.begin(1, 'request');
  journal.record(1, 'request', 'tool_call', { name: 'read_page', args: {} });
  journal.record(1, 'request', 'tool_result', { name: 'read_page', result: { success: true } });
  const snapshot = journal.acknowledge(1, 'request', 2);
  const persisted = compactRunUiSnapshotForPersist(snapshot);
  assert.deepEqual(persisted.events.map(event => event.seq), [1, 2]);
  assert.equal(runUiUnavailableBeforeSeq(persisted), 0);
  assert.equal(journal.acknowledge(1, 'another-request', 2), null);
});

test('real bounded-journal losses and legacy pruned snapshots remain visible', () => {
  const journal = new RunUiJournal({ eventLimit: 2 });
  journal.begin(1, 'request');
  for (let i = 0; i < 3; i++) journal.record(1, 'request', 'text', { content: String(i) });
  const snapshot = journal.acknowledge(1, 'request', 3);
  assert.equal(snapshot.events.length, 2);
  assert.equal(runUiUnavailableBeforeSeq(snapshot), 1);
  assert.equal(runUiUnavailableBeforeSeq({ ackedSeq: 4, events: [] }), 4);
  assert.equal(runUiUnavailableBeforeSeq({ ackedSeq: 4, events: [{ seq: 5 }] }), 4);
});
