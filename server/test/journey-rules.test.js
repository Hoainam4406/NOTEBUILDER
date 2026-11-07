const { test } = require('node:test');
const assert = require('node:assert/strict');
const { claimInput, definition } = require('../journey');
test('journey claim bodies cannot inject progress, owner, XP or invalid calendar days', () => {
  assert.deepEqual(claimInput('achievement', {}), {});
  assert.deepEqual(claimInput('quest', { day: '2028-02-29' }), { day: '2028-02-29' });
  for (const body of [null, [], { xp: 10 }, { ownerId: 'forged' }]) assert.throws(() => claimInput('achievement', body), { code: 'INVALID_INPUT' });
  for (const day of ['2026-02-29', '2026-13-01', 'yesterday', null, { $gt: '' }]) assert.throws(() => claimInput('quest', { day }), { code: 'INVALID_INPUT' });
  assert.throws(() => definition('quest', 'first_note'), { code: 'JOURNEY_NOT_FOUND' });
});
