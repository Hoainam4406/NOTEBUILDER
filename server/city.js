const mongoose = require('mongoose');
const City = require('./models/City');
const CityMutation = require('./models/CityMutation');
const Unlock = require('./models/Unlock');
const Inventory = require('./models/Inventory');
const { idempotencyKey } = require('./progression');
const { hash } = require('./progression-policy');
const { CATALOG, CityError, buildingId, assertPlacement } = require('./city-rules');
const transactionOptions = { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } };
const conflict = () => new CityError(409, 'CITY_CONFLICT', 'Thành phố đã thay đổi; hãy tải trạng thái mới trước khi thử lại');
const corrupt = () => new CityError(503, 'CITY_DATA_INVALID', 'Dữ liệu thành phố không hợp lệ; cần kiểm tra dữ liệu đã lưu');

function checkedLayout(row) {
  if (!row) return { layoutVersion: 1, revision: 0, buildings: [] };
  try {
    if (row.layoutVersion !== 1 || !Number.isSafeInteger(row.revision) || row.revision < 0
      || !Array.isArray(row.buildings) || row.buildings.length > CATALOG.maxBuildings) throw corrupt();
    const buildings = [], ids = new Set();
    for (const entry of row.buildings) {
      buildingId(entry.id);
      if (ids.has(entry.id) || entry.rotation !== 0) throw corrupt();
      const placement = { id: entry.id, catalogId: entry.catalogId, x: entry.x, y: entry.y, rotation: entry.rotation };
      assertPlacement(placement, buildings);
      ids.add(entry.id); buildings.push(placement);
    }
    return { layoutVersion: 1, revision: row.revision, buildings };
  } catch { throw corrupt(); }
}
function createCityService({ connection = mongoose.connection, now = () => new Date(), afterWrite = async () => {} } = {}) {
  async function state(userId, session) {
    const city = checkedLayout(await City.findOne({ userId }).session(session).lean());
    const rows = await Inventory.find({ userId }).sort({ catalogId: 1 }).session(session).lean();
    if (rows.some(row => typeof row.catalogId !== 'string' || !Number.isSafeInteger(row.quantity) || row.quantity < 0)) throw corrupt();
    return { city, inventory: rows.map(row => ({ catalogId: row.catalogId, quantity: row.quantity })) };
  }
  async function getCity(userId) { return connection.transaction(session => state(userId, session), transactionOptions); }
  async function place(userId, input, key) {
    const owner = new mongoose.Types.ObjectId(String(userId));
    idempotencyKey(key);
    const requestHash = hash(JSON.stringify({ operation: 'place', input }));
    const id = new mongoose.Types.ObjectId().toString();
    const createdAt = now();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await connection.transaction(async session => {
          const receipt = await CityMutation.findOne({ userId: owner, key }).session(session);
          if (receipt) {
            if (receipt.requestHash !== requestHash) throw new CityError(409, 'IDEMPOTENCY_CONFLICT', 'Request key đã được dùng cho thao tác khác');
            return { ...await state(owner, session), buildingId: receipt.buildingId, replayed: true };
          }
          const row = await City.findOne({ userId: owner }).session(session).lean();
          const layout = checkedLayout(row);
          if (layout.revision !== input.revision) throw conflict();
          if (!row) await City.create([{ userId: owner, layoutVersion: 1, revision: 0, buildings: [] }], { session });
          const locked = await City.findOneAndUpdate({ userId: owner, revision: input.revision }, { $inc: { revision: 1 } }, { session, returnDocument: 'after' });
          if (!locked) throw conflict();
          if (layout.buildings.length >= CATALOG.maxBuildings) throw new CityError(409, 'CITY_FULL', 'Thành phố đã đạt giới hạn công trình');
          if (!await Unlock.exists({ userId: owner, catalogId: input.catalogId }).session(session)) throw new CityError(403, 'BUILDING_LOCKED', 'Bạn chưa mở khóa công trình này');
          const placement = { id, catalogId: input.catalogId, x: input.x, y: input.y, rotation: input.rotation };
          assertPlacement(placement, layout.buildings);
          const inventory = await Inventory.findOneAndUpdate({ userId: owner, catalogId: input.catalogId, quantity: { $gte: 1 } },
            { $inc: { quantity: -1 } }, { session, returnDocument: 'after' });
          if (!inventory) throw new CityError(409, 'INVENTORY_EMPTY', 'Không còn công trình này trong kho');
          await afterWrite('inventory');
          await City.updateOne({ _id: locked._id }, { $set: { buildings: [...layout.buildings, placement] } }, { session, runValidators: true });
          await afterWrite('city');
          await CityMutation.create([{ userId: owner, key, requestHash, buildingId: id, createdAt }], { session });
          await afterWrite('receipt');
          return { ...await state(owner, session), buildingId: id, replayed: false };
        }, transactionOptions);
      } catch (error) {
        if (error.code === 11000 && attempt < 4) continue;
        throw error;
      }
    }
  }
  return { getCity, place };
}
module.exports = { createCityService, checkedLayout };
