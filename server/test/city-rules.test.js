const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CATALOG, mutationInput, catalogItem, footprint, nativeCell, polygonsOverlap, assertPlacement } = require('../city-rules');
const { REWARDS } = require('../progression-policy');
const apartment = { id: 'a', catalogId: 'bld_apartments_brickbrown_a', x: 0, y: 0, rotation: 0 };
test('MVP catalog covers every reward with convex native footprints and read-only configuration', () => {
  for (const reward of REWARDS) assert.equal(catalogItem(reward.catalogId).id, reward.catalogId);
  assert.equal(CATALOG.items.length, 4);
  assert.ok(Object.isFrozen(CATALOG.items[0].footprint[0]));
  assert.throws(() => catalogItem('constructor'), error => error.code === 'CATALOG_ITEM_NOT_FOUND');
});
test('CITY-01 isometric basis and bounds allow every legal edge cell', () => {
  assert.deepEqual(footprint({ ...apartment, x: 1, y: 0 })[0], [64, 0]);
  assert.deepEqual(nativeCell(1, 0), { x: 0, y: 1 });
  assert.deepEqual(nativeCell(0, 1), { x: -1, y: 1 });
  assert.deepEqual(nativeCell(31, 31), { x: 0, y: 62 });
  for (const [x, y] of [[0, 0], [31, 0], [0, 31], [31, 31]]) assert.doesNotThrow(() => assertPlacement({ ...apartment, x, y }, []));
  for (const [x, y] of [[-1, 0], [0, -1], [32, 0], [0, 32], [Number.MAX_SAFE_INTEGER, 0]]) {
    assert.throws(() => assertPlacement({ ...apartment, x, y }, []), error => error.code === 'OUT_OF_BOUNDS');
  }
});
test('CITY-02 footprint contact is allowed but positive-area intersections are rejected', () => {
  assert.doesNotThrow(() => assertPlacement({ ...apartment, x: 1 }, [apartment]));
  assert.throws(() => assertPlacement(apartment, [apartment]), error => error.code === 'CITY_COLLISION');
  const polygon = footprint(apartment);
  assert.equal(polygonsOverlap(polygon, polygon.map(([x, y]) => [x + 128, y])), false);
  assert.equal(polygonsOverlap(polygon, polygon.map(([x, y]) => [x + 127, y])), true);
  assert.equal(polygonsOverlap(polygon, footprint({ ...apartment, catalogId: 'prop_tree_pine_small' })), true);
});
test('blocked tiles reject buildings and props while adjacent edge contact remains valid', () => {
  for (const item of CATALOG.items) assert.throws(() => assertPlacement({ ...apartment, catalogId: item.id, x: 15, y: 15 }, []), error => error.code === 'BLOCKED_TILE');
  assert.doesNotThrow(() => assertPlacement({ ...apartment, x: 14, y: 15 }, []));
});
test('move excludes only its original footprint and validation never changes the old layout', () => {
  const layout = [apartment, { ...apartment, id: 'b', x: 2 }];
  const before = JSON.stringify(layout);
  assert.doesNotThrow(() => assertPlacement(apartment, layout, 'a'));
  assert.throws(() => assertPlacement({ ...apartment, x: 2 }, layout, 'a'), error => error.code === 'CITY_COLLISION');
  assert.equal(JSON.stringify(layout), before);
});
test('city inputs reject fractional coordinates, unsupported rotations, revisions and injected fields', () => {
  const valid = { catalogId: apartment.catalogId, x: 0, y: 0, revision: 0 };
  assert.equal(mutationInput('place', valid).rotation, 0);
  for (const input of [{ ...valid, x: 0.5 }, { ...valid, rotation: 90 }, { ...valid, revision: -1 }, { ...valid, revision: '0' }, { ...valid, ownerId: 'attacker' }, [], null]) {
    assert.throws(() => mutationInput('place', input), error => error.code === 'INVALID_INPUT');
  }
  assert.throws(() => mutationInput('move', { x: 0, y: 0, revision: 0, catalogId: apartment.catalogId }));
});
