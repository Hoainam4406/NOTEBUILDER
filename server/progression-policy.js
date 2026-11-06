const { createHash } = require('node:crypto');
const POLICY_VERSION = 1;
const NOTE_XP = 20;
const DAILY_CAP = 200;
const MIN_CONTENT_LENGTH = 80;
const REWARDS = Object.freeze([
  Object.freeze({ id: 'starter_apartment', level: 1, catalogId: 'bld_apartments_brickbrown_a', quantity: 1 }),
  Object.freeze({ id: 'first_house', level: 2, catalogId: 'bld_house_small_brickred_a', quantity: 1 }),
  Object.freeze({ id: 'pine_tree', level: 3, catalogId: 'prop_tree_pine_small', quantity: 1 }),
  Object.freeze({ id: 'learning_cafe', level: 5, catalogId: 'bld_cafe_a', quantity: 1 })
]);
const hash = value => createHash('sha256').update(value).digest('hex');
function normalizedContent(content = '') {
  return content.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}
function contentClaim(content) {
  const normalized = normalizedContent(content);
  return { eligible: [...normalized].length >= MIN_CONTENT_LENGTH, fingerprint: hash(normalized.toLowerCase()) };
}
function awardDecision({ eligible, duplicate, earnedToday }) {
  if (!Number.isSafeInteger(earnedToday) || earnedToday < 0) throw new RangeError('Invalid daily XP');
  if (!eligible) return { amount: 0, reason: 'draft' };
  if (duplicate) return { amount: 0, reason: 'duplicate_content' };
  if (earnedToday + NOTE_XP > DAILY_CAP) return { amount: 0, reason: 'daily_cap' };
  return { amount: NOTE_XP, reason: 'awarded' };
}
function threshold(level) {
  const steps = level - 1;
  return 100 * steps + 25 * steps * (steps - 1) / 2;
}
function progressFor(totalXp) {
  if (!Number.isSafeInteger(totalXp) || totalXp < 0) throw new RangeError('Invalid total XP');
  // Binary search avoids linear work and rounding drift at high levels.
  let low = 1, high = 2;
  while (threshold(high) <= totalXp) high *= 2;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (threshold(middle) <= totalXp) low = middle;
    else high = middle;
  }
  return { totalXp, level: low, xpInLevel: totalXp - threshold(low),
    xpToNextLevel: threshold(low + 1) - totalXp, nextLevelTotalXp: threshold(low + 1) };
}
function rewardsFor(level) { return REWARDS.filter(reward => reward.level <= level); }
module.exports = { POLICY_VERSION, NOTE_XP, DAILY_CAP, MIN_CONTENT_LENGTH, REWARDS,
  hash, normalizedContent, contentClaim, awardDecision, threshold, progressFor, rewardsFor };
