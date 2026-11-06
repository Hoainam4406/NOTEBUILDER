# Active Development State — Knowledge City

Cập nhật: 2026-11-06. Đọc cùng `AGENTS.md`; kiểm tra Git/source trước khi tiếp quản.

## Mục tiêu hiện tại / phạm vi session

- C01 đang triển khai theo thứ tự a→b→c. C01a đã chốt catalog/geometry/map/API
  specification và có contract test đối chiếu Godot. C01b place API tiếp theo.
- Game tương tác trên web vẫn **chưa triển khai**; C02a/b/c sau City API.

## Quyết định đang có hiệu lực

- Giữ HTML/JS/Fabric + Express/Mongoose; Node 24.14.0, MongoDB replica set/sharded.
- Auth cookie HttpOnly/SameSite Strict, CSRF, rate limit lưu DB; mọi note theo owner.
- Note create idempotent; update/delete revision CAS; legacy unowned notes giữ ẩn,
  không gán tự động. Không dùng `.env`/DB ứng dụng trong integration tests.
- XP v1: +20 khi content chuẩn hóa >=80 Unicode code points; fingerprint/user
  chống trùng vĩnh viễn; cap 200/ngày UTC; edit/delete không đổi XP.
- Level derive từ total XP; note/ledger/rewards/inventory cùng transaction.
- Dashboard và JSON export online đọc server; export dùng cùng DB snapshot.
  `GodotBridge.getKnowledgeData()` và `exportJSONFile()` trả Promise.
- JSON export không phải game embed. Web export/host/loading/input/camera/placement
  phải được kiểm chứng trong browser; không commit binary build vào source.
- Chi tiết contract/balance: `docs/AUTH_NOTES_SPEC.md`, `docs/PROGRESSION_SPEC.md`.
- City v1: `docs/CITY_SPEC.md`; 4 reward items, grid axial 32×32, polygon native,
  rotation 0, 4 blocked cells. Lane Godot dùng offset cells; chuyển API (x,y)
  thành native `(floor((x-y)/2),x+y)` rồi map_to_local. Không đưa thẳng API x/y.

## Task state

| Task | Trạng thái / evidence |
|---|---|
| Foundation/auth/owner/CAS | Đã có code; HTTP/VM và MongoDB tests đạt |
| N02 | `7ea440a`: real MongoDB, hai tiến trình API, restart/concurrency/rollback |
| X01a | `5ed7cf0`: specification và policy XP/rewards có unit tests |
| X01b | `24c8330`: transaction note/XP/rewards/inventory, retry/idempotency |
| X01c | `64481cb`: dashboard/export dùng server; 62 regression + 17 DB tests đạt |
| H01 | `5293eb0`: handoff và roadmap C02a/b/c đã push |
| C01a | Spec/catalog/rules + 6 geometry tests và native Godot contract đạt |
| C01b | Tiếp theo: authenticated city/catalog read, place API và transaction/CAS |
| C01c | Chưa làm: move/remove/refund/restart/invalid-save và regression |
| C02a | Chưa làm: Godot Web export + trang game nhúng tương tác trong website |
| C02b | Chưa làm, sau C01+C02a: auth bridge, server entitlement, save/load city |
| C02c | Chưa làm: browser E2E account → note → XP → build → reload/login lại |
| L01/Q01/O01/AI01 | Chưa làm: review, quests/QOL, staging/backup/release, AI V2 |

C02a có thể làm preview sớm mà không chờ City API; preview phải được ghi rõ,
không tự cấp server XP/inventory. Bản tích hợp dữ liệu đầy đủ vẫn cần C01/C02b.

## Files và mục đích

- C01a: `docs/CITY_SPEC.md`, `server/data/city-catalog.v1.json`, `city-rules.js`,
  `server/test/city-rules.test.js`; geometry và contract trước City API.
- Game: `tests/city_catalog_contract.gd`, `tests/fixtures/city-catalog.v1.json`,
  `.github/workflows/ci.yml`, `docs/KNOWLEDGE_CITY.md`; kiểm tra catalog/mapping.
  Hai bản catalog phải byte-identical; native source không bị đổi để khớp test.
- Code baseline: `server/auth.js`, `app.js`, `validation.js`, `models/` lo identity,
  owner/CAS; `progression-policy.js`, `progression.js` lo transaction/progression;
  `index.js` kiểm tra replica set/indexes trước listen.
- `notegame-web/js/notes.js` lo editor/retry/dashboard/export; `auth.js`,
  `account.js`, `account.html` lo tài khoản. Tests ở `server/test/`;
  `.github/workflows/ci.yml` chạy syntax, regression và integration trên Linux.

## Known gaps và verification

- Chưa có Godot Web export preset/artifacts, trang embed/canvas/iframe hoặc City
  API. Game native có debug unlock-all và local knowledge milestones; chưa phải
  quyền sở hữu backend. Không báo game đã tích hợp chỉ vì có `GodotBridge`.
- Landing page/README UI cũ có mô tả ý tưởng tương lai; lấy README root/spec làm
  chuẩn. Chưa có City API hay browser bridge ở checkpoint C01a.
- Baseline `64481cb`: 62/62 regression, 17/17 MongoDB 8.2.6 integration,
  syntax/diff đạt (checkpoint X01c). Game `0f35952`: knowledge/support và placement
  audit 498 scenes đạt ở session trước. Không suy diễn đã chạy lại game ở H01.
- C01a: 68/68 regression tests; native Godot catalog contract đạt (4 footprints,
  native tile size và chuyển axial→offset ở các mép/hàng chẵn lẻ). Contract phát
  hiện mapping ban đầu sai; đã sửa phép chuyển, không sửa game grid để lách test.
- Chưa xác nhận: CI remote, TTL worker xóa vật lý, failover/network partition,
  browser E2E, web export/hosting, cross-device, staging/UAT, backup/restore.

## Git / workspace

- Web repo `E:/NOTEBUILDER`, branch `websiteWorkandTest`, origin
  `https://github.com/Hoainam4406/NOTEBUILDER.git`.
- Baseline trước C01: `5293eb0`, push đã xác nhận; source X01 ở `64481cb`.
  Lấy hash checkpoint đang chứa snapshot bằng
  `git log -1 --oneline -- AGENTS.md AI_HANDOFF.md`. Không cần lịch sử chat.
- Web checkout sạch khi bắt đầu C01; chỉ các file C01 nêu trên được sửa.
  Xác minh trạng thái hiện tại bằng `git status --short`; kiểm tra push bằng
  `git rev-parse HEAD` và `git ls-remote origin refs/heads/websiteWorkandTest`.
- Game worktree làm việc: `E:/isometric_building_game/.worktrees/knowledge-main`,
  branch `main`, HEAD `0d1721a`, origin `https://github.com/SubNhatSan/isometric_building_game.git`,
  C01a contract + placement 498 scenes đạt; commit main đã push.
- **Không sửa checkout game gốc để đổi branch:** `E:/isometric_building_game`
  đang ở `websiteWorkandTest` với user changes: README modified,
  `Scenes/Knowledge/knowledge_validation.gd` và `.uid` deleted. Phải giữ nguyên.
- GCM đã hoạt động; tự commit/push task đạt kiểm tra sau khi xác nhận đúng đích.
  Nếu auth lỗi, báo một lần với nguyên nhân; không lặp đăng nhập/force push/reset.

## Bước tiếp quản cụ thể

1. Đọc hai file root, kiểm tra Git/status/remote/diff ở cả repo cần sửa; đối chiếu
   specs và commit history nếu có khác biệt. Không chạy restore/reset để làm sạch.
2. Tiếp tục C01b theo CITY_SPEC: models City/CityMutation, authenticated read/place,
   transaction serialize city revision + inventory decrement + receipt. Không
   đánh dấu C01 hoàn tất trước khi move/remove/refund/restart C01c được kiểm thử.
3. Real-DB tests hai API processes cho revision race/same key, ownership/collision,
   idempotency và failure injection trước commit/push.
4. Khi làm game chơi thử, dùng C02a trong implementation plan: export/host thật,
   trang vào game và browser interaction. Sau C01 nối C02b rồi chạy C02c.
5. Sau mỗi checkpoint cập nhật file này, báo hash/push/tests; kết thúc session
   ghi rõ việc còn dở và không đánh dấu production/E2E khi chưa kiểm chứng.
