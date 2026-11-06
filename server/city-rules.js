const source = require('./data/city-catalog.v1.json');
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const CATALOG = freeze(source);
const items = new Map(CATALOG.items.map(item => [item.id, item]));
class CityError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function invalid(message) { throw new CityError(400, 'INVALID_INPUT', message); }
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) invalid('revision phải là số nguyên hợp lệ');
  return value;
}
function buildingId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/.test(value)) invalid('ID công trình không hợp lệ');
  return value;
}
function mutationInput(operation, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('City request phải là object');
  const allowed = operation === 'place' ? ['catalogId', 'x', 'y', 'rotation', 'revision']
    : operation === 'move' ? ['x', 'y', 'rotation', 'revision'] : ['revision'];
  if (Object.keys(body).some(key => !allowed.includes(key))) invalid('City request chứa field không được hỗ trợ');
  const result = { revision: revision(body.revision) };
  if (operation !== 'remove') {
    if (!Number.isSafeInteger(body.x) || !Number.isSafeInteger(body.y)) invalid('x và y phải là số nguyên');
    const rotation = body.rotation === undefined ? 0 : body.rotation;
    if (rotation !== 0) invalid('MVP chỉ hỗ trợ rotation 0');
    Object.assign(result, { x: body.x, y: body.y, rotation });
  }
  if (operation === 'place') {
    if (typeof body.catalogId !== 'string') invalid('catalogId phải là chuỗi');
    catalogItem(body.catalogId);
    result.catalogId = body.catalogId;
  }
  return result;
}
function catalogItem(id) {
  const item = items.get(id);
  if (!item) throw new CityError(422, 'CATALOG_ITEM_NOT_FOUND', 'Công trình không thuộc catalog MVP');
  return item;
}
function footprint(placement) {
  const { tileWidth, tileHeight } = CATALOG.grid;
  const centerX = tileWidth / 2 * (placement.x - placement.y);
  const centerY = tileHeight / 2 * (placement.x + placement.y);
  return catalogItem(placement.catalogId).footprint.map(([x, y]) => [x + centerX, y + centerY]);
}
function nativeCell(x, y) { return { x: Math.floor((x - y) / 2), y: x + y }; }
function polygonsOverlap(a, b) {
  // All catalog footprints are convex. A separating axis or shared edge means
  // no positive-area overlap; sprite/roof dimensions never enter this check.
  for (const polygon of [a, b]) {
    for (let index = 0; index < polygon.length; index++) {
      const point = polygon[index], next = polygon[(index + 1) % polygon.length];
      const axis = [-(next[1] - point[1]), next[0] - point[0]];
      const project = vertices => vertices.map(([x, y]) => x * axis[0] + y * axis[1]);
      const projectedA = project(a), projectedB = project(b);
      if (Math.min(...projectedA) >= Math.max(...projectedB) - 1e-9
        || Math.min(...projectedB) >= Math.max(...projectedA) - 1e-9) return false;
    }
  }
  return true;
}
function assertPlacement(placement, buildings, ignoreId = null) {
  mutationInput('place', { catalogId: placement.catalogId, x: placement.x, y: placement.y, rotation: placement.rotation, revision: 0 });
  const { width, height, tileWidth, tileHeight } = CATALOG.grid;
  if (placement.x < 0 || placement.x >= width || placement.y < 0 || placement.y >= height) {
    throw new CityError(422, 'OUT_OF_BOUNDS', 'Công trình nằm ngoài bản đồ');
  }
  const polygon = footprint(placement);
  for (const [x, y] of polygon) {
    const gridX = x / tileWidth + y / tileHeight;
    const gridY = y / tileHeight - x / tileWidth;
    if (gridX < -0.5 || gridX > width - 0.5 || gridY < -0.5 || gridY > height - 0.5) {
      throw new CityError(422, 'OUT_OF_BOUNDS', 'Footprint vượt biên bản đồ');
    }
  }
  for (const [x, y] of CATALOG.blockedTiles) {
    if (polygonsOverlap(polygon, footprint({ catalogId: CATALOG.items[0].id, x, y }))) {
      throw new CityError(422, 'BLOCKED_TILE', 'Vị trí thuộc vùng cấm xây dựng');
    }
  }
  for (const building of buildings) {
    if (ignoreId !== null && building.id === ignoreId) continue;
    if (polygonsOverlap(polygon, footprint(building))) throw new CityError(409, 'CITY_COLLISION', 'Footprint công trình chồng lấn');
  }
}
module.exports = { CATALOG, CityError, revision, buildingId, mutationInput, catalogItem, footprint, nativeCell, polygonsOverlap, assertPlacement };
