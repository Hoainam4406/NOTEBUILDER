const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startInput, actionInput, publicSession } = require('../reviews');
const id = 'abcdef0123456789abcdef01';

test('review selection is bounded, preserves order, normalizes IDs and rejects owner/content injection', () => {
  assert.deepEqual(startInput({ noteIds: [id.toUpperCase()] }), { noteIds: [id] });
  for (const body of [null, [], {}, { noteIds: [] }, { noteIds: [1] }, { noteIds: [id, id.toUpperCase()] },
    { noteIds: [id], ownerId: id }, { noteIds: [id], content: 'forged' }, { noteIds: Array(21).fill(id) }, { noteIds: ['../notes'] }]) {
    assert.throws(() => startInput(body), { code: 'INVALID_INPUT' });
  }
});
test('review ratings require an exact validated body and never accept XP, skipped indices or fractional versions', () => {
  assert.deepEqual(actionInput('answer', { cardIndex: 0, rating: 'again', revision: 0 }), { cardIndex: 0, rating: 'again', revision: 0 });
  assert.deepEqual(actionInput('close', { revision: 2 }), { revision: 2 });
  for (const body of [{ cardIndex: -1, rating: 'again', revision: 0 }, { cardIndex: 20, rating: 'again', revision: 0 },
    { cardIndex: 0, rating: 'correct', revision: 0 }, { cardIndex: 0, rating: 'again', revision: 0.5 },
    { cardIndex: 0, rating: 'again', revision: 0, xp: 10 }, { cardIndex: 0, rating: 'again' }]) {
    assert.throws(() => actionInput('answer', body), { code: 'INVALID_INPUT' });
  }
  assert.throws(() => actionInput('close', { revision: 0, status: 'completed' }), { code: 'INVALID_INPUT' });
});
test('corrupt review snapshots fail closed rather than exposing or repairing invalid progress', () => {
  const row = { _id: id, status: 'active', revision: 0, nextIndex: 0, receipts: [], cards: [{ noteId: id, noteRevision: 0, question: 'Question', answer: 'Answer', rating: null, reviewedAt: null }] };
  assert.equal(publicSession(row).id, id);
  for (const patch of [{ nextIndex: 1 }, { revision: 1 }, { cards: [] }, { status: 'completed' }, { receipts: [null] }]) {
    assert.throws(() => publicSession({ ...row, ...patch }), { code: 'REVIEW_DATA_INVALID' });
  }
});
