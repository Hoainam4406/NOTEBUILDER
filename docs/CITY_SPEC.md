# C01 — City backend MVP, layout/catalog v1

## Task / gate

1. C01a: specification + 4-item catalog + pure geometry tests; Godot contract test
   kiểm tra polygon/basis thực. Chưa nhúng game hay áp đặt map mới lên native mode.
2. C01b: authenticated catalog/city read và place API; transaction city/inventory,
   revision CAS, idempotent retry; CITY-01..04 và rollback/owner tests trên DB thật.
3. C01c: move/remove, refund đúng một lần, save/load qua API restart, dữ liệu sai
   không crash; CITY-05 và toàn bộ regression. Sau đó C02a Web export/embed.

## Map / geometry đã chốt

- `server/data/city-catalog.v1.json` là contract MVP version 1: chỉ 4 catalog IDs
  đang được policy XP cấp. Scene path và CollisionPolygon2D đối chiếu game `0f35952`.
- Grid 32×32; anchor x/y integer 0..31. Tile isometric 128×64; vị trí tương đối
  `px=64*(x-y), py=32*(x+y)` so với `map_to_local(Vector2i.ZERO)` trong Godot.
  Đây là tọa độ axial API. Lane native dùng stacked-offset: chuyển sang native
  cell `(floor((x-y)/2), x+y)` trước `map_to_local`; không đưa thẳng API x/y vào
  TileMap. Contract test kiểm tra phép chuyển này ở mép map và cả hàng chẵn/lẻ.
- Chỉ rotation 0; không đổi sprite/collision bằng rotation giả. Fractional snapping,
  roads/bridges/vehicles/support levels và nhiều hướng nằm ngoài subset này.
- Collision dùng polygon chân công trình thực, SAT cho convex polygons. Mép chạm
  nhau hợp lệ; overlap có diện tích bị từ chối. Không dùng kích thước sprite/roof.
- Toàn bộ footprint trong miền grid [-0.5,31.5] trên cả hai trục. Bốn cell
  (15,15), (15,16), (16,15), (16,16) là vùng cấm server-owned của map template v1.
  C02 phải render đúng template; đây là map sản phẩm mới, không sửa map native cũ.
- City tối đa 256 công trình, mỗi instance ID ObjectId server-generated. Catalog,
  map template và layout version không đổi âm thầm; thay đổi cần migration/spec.

## API contract (prefix /api)

Tất cả endpoints cần session. Mutation cần CSRF và `Idempotency-Key` 16..128
ký tự theo contract note. Owner lấy từ session, không từ body/query.

| Method | Path | Input / output |
|---|---|---|
| GET | `/city/catalog` | Catalog version, grid, blockedTiles, maxBuildings, items |
| GET | `/city` | `{city,inventory}` theo cùng transaction snapshot |
| POST | `/city/buildings` | `{catalogId,x,y,rotation?:0,revision}` |
| PATCH | `/city/buildings/:id` | `{x,y,rotation?:0,revision}`; không đổi catalog |
| DELETE | `/city/buildings/:id` | `{revision}`; thu hồi về inventory |

`city={layoutVersion:1,revision,buildings:[{id,catalogId,x,y,rotation:0}]}`.
User chưa xây nhận virtual city rỗng revision 0; GET không tự tạo DB records.
Mutation trả `{city,inventory,buildingId,replayed}`; place mới 201, replay 200;
move/remove 200. Body/query không cho thay width/blockedTiles/owner/quantity.

## Inventory / transaction / idempotency

- `Inventory.quantity` là lượng **chưa đặt**; tổng sở hữu = lượng chưa đặt + đang
  ở city. Place cần Unlock cùng catalog và quantity >=1, giảm đúng 1.
- Move không tiêu/refund; remove cộng đúng 1. Invalid move giữ nguyên vị trí cũ.
- `cities`: userId unique, layoutVersion=1, revision, bounded embedded buildings.
  Dùng document có giới hạn thay collection placed_buildings riêng ở MVP để
  serialize collision/layout theo user, tránh read-then-write giữa requests.
- `city_mutations`: unique(userId,key), requestHash gồm operation/id/body,
  buildingId, createdAt; giữ receipt không TTL. Snapshot city hiện tại không lưu
  lặp lại trong receipt. Không xóa receipt khi remove công trình.
- Transaction đọc receipt trước CAS. Replay cùng key/payload không áp dụng lại
  thao tác; trả city/inventory **hiện tại** và buildingId của lần thao tác đầu.
  Khác operation/id/body cùng key: 409 IDEMPOTENCY_CONFLICT. Client giữ nguyên
  request qua retry và dùng revision từ state trả về, không hồi sinh object đã xóa.
- City revision phải khớp trước mutation, tăng đúng 1 khi thành công. Tranh chấp
  cùng revision chỉ một thắng; transaction serialize mọi writes city của user.
- Layout + inventory + receipt cùng commit/rollback. Driver retry transient txn;
  unique-key init races retry toàn transaction có giới hạn. Không có public bulk
  save/import layout để bypass validation. Không dùng debug unlock-all backend.
- Đọc city kiểm tra layout version, IDs, catalog/coords/rotation và toàn bộ
  footprint. Dữ liệu DB không hợp lệ trả 503 CITY_DATA_INVALID, không tự sửa/xóa.

## Error contract / acceptance

`{error,code}`: 400 INVALID_INPUT; 401 AUTH_REQUIRED; 403 CSRF_INVALID/BUILDING_LOCKED;
404 BUILDING_NOT_FOUND; 409 CITY_CONFLICT/CITY_COLLISION/INVENTORY_EMPTY/CITY_FULL/
IDEMPOTENCY_CONFLICT; 422 CATALOG_ITEM_NOT_FOUND/OUT_OF_BOUNDS/BLOCKED_TILE;
503 CITY_DATA_INVALID. Lỗi nội bộ 500 che chi tiết, không thay đổi state.

- CITY-01: place hợp lệ lưu đúng coords/catalog, giảm một inventory, tăng revision.
- CITY-02: collision/bounds/blocked/invalid move không đổi city, inventory, receipt.
- CITY-03: thiếu unlock hoặc inventory, foreign IDs, anonymous/CSRF bị từ chối.
- CITY-04: hai API processes cùng revision/ô chỉ một thắng; retry không tiêu hoặc
  refund hai lần; concurrent note rewards và city writes không mất inventory.
- CITY-05: API restart/reload và tài khoản khác giữ đúng isolation/layout;
  remove retry không tăng inventory; corrupt DB trả lỗi kiểm soát.
- Fault injection sau city/inventory/receipt phải rollback mọi collection liên quan.
  Backend tests không thay thế browser E2E C02c hay staging/UAT.
