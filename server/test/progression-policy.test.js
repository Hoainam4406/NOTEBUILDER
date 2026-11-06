const { test } = require('node:test');
const assert = require('node:assert/strict');
const { contentClaim, awardDecision, threshold, progressFor, rewardsFor } = require('../progression-policy');
test('XP eligibility uses normalized Unicode code points, not UTF-16 or whitespace padding', () => {
  assert.equal(contentClaim(' '.repeat(200)).eligible, false);
  assert.equal(contentClaim('x'.repeat(79)).eligible, false);
  assert.equal(contentClaim('x'.repeat(80)).eligible, true);
  assert.equal(contentClaim('😀'.repeat(40)).eligible, false);
  assert.equal(contentClaim('😀'.repeat(80)).eligible, true);
  assert.equal(contentClaim('e\u0301'.repeat(79)).eligible, false);
  assert.equal(contentClaim('   x'.repeat(20)).eligible, false);
});
test('fingerprint folds Unicode compatibility, whitespace and case for duplicate detection', () => {
  assert.equal(contentClaim('  ＨỌＣ\n vật\t lý ').fingerprint, contentClaim('học vật lý').fingerprint);
  assert.notEqual(contentClaim('Vật lý').fingerprint, contentClaim('Toán học').fingerprint);
});
test('daily cap, duplicates and drafts decide XP without client amounts', () => {
  assert.deepEqual(awardDecision({ eligible: true, duplicate: false, earnedToday: 180 }), { amount: 20, reason: 'awarded' });
  assert.deepEqual(awardDecision({ eligible: true, duplicate: false, earnedToday: 200 }), { amount: 0, reason: 'daily_cap' });
  assert.equal(awardDecision({ eligible: true, duplicate: true, earnedToday: 0 }).reason, 'duplicate_content');
  assert.equal(awardDecision({ eligible: false, duplicate: false, earnedToday: 0 }).reason, 'draft');
  assert.throws(() => awardDecision({ earnedToday: -1 }), RangeError);
});
test('XP-03 level boundaries use cumulative increasing costs and cover multiple levels', () => {
  assert.deepEqual(progressFor(0), { totalXp: 0, level: 1, xpInLevel: 0, xpToNextLevel: 100, nextLevelTotalXp: 100 });
  for (let level = 2; level <= 100; level++) {
    assert.equal(progressFor(threshold(level) - 1).level, level - 1);
    assert.equal(progressFor(threshold(level)).level, level);
    assert.equal(progressFor(threshold(level)).xpInLevel, 0);
    assert.equal(progressFor(threshold(level)).xpToNextLevel, 100 + 25 * (level - 1));
  }
  assert.equal(progressFor(550).level, 5);
  assert.equal(progressFor(Number.MAX_SAFE_INTEGER).level > 1000000, true);
  for (const xp of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => progressFor(xp), RangeError);
});
test('RWD-01 every reached milestone is included even when XP skips intermediate levels', () => {
  assert.deepEqual(rewardsFor(1).map(row => row.id), ['starter_apartment']);
  assert.deepEqual(rewardsFor(progressFor(550).level).map(row => row.id), ['starter_apartment', 'first_house', 'pine_tree', 'learning_cafe']);
  assert.equal(new Set(rewardsFor(100).map(row => row.catalogId)).size, 4);
});
