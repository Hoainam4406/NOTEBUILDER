# Active Development State — Knowledge City

Cập nhật: 2026-11-06. Đọc cùng `AGENTS.md`; kiểm tra Git/source trước khi tiếp quản.

## Mục tiêu hiện tại / phạm vi session

- C02a đã có Web export thật và trang `/game.html` chơi thử tương tác; localhost
  tại `http://127.0.0.1:5050/game.html` (`npm run preview:game`).
- Tiếp theo C02b bridge auth/catalog/inventory/City API; C02c browser E2E sau đó.

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
- `Inventory.quantity` là lượng chưa đặt. Place trừ 1; move không đổi; remove
  hoàn 1. City + inventory + receipt cùng transaction. Replay trả state hiện tại,
  không tự dựng lại công trình đã thu hồi. Tối đa 256 instances/city.
- Web Preview là sandbox RAM, reset khi reload, chưa đồng bộ notes/account/city.
  Single-thread WebGL2; build staging bỏ MCP/editor tooling trong bản copy, không
  sửa project đang mở. Artifacts ignored; source pin ở `server/game-source.json`.

## Task state

| Task | Trạng thái / evidence |
|---|---|
| Foundation/auth/owner/CAS | Đã có code; HTTP/VM và MongoDB tests đạt |
| N02 | `7ea440a`: real MongoDB, hai tiến trình API, restart/concurrency/rollback |
| X01a | `5ed7cf0`: specification và policy XP/rewards có unit tests |
| X01b | `24c8330`: transaction note/XP/rewards/inventory, retry/idempotency |
| X01c | `64481cb`: dashboard/export dùng server; 62 regression + 17 DB tests đạt |
| H01 | `5293eb0`: handoff và roadmap C02a/b/c đã push |
| C01a | `dd7feaf` web, `0d1721a` game: spec/rules/native contract đã push |
| C01b | `abc7b8f`: read/catalog/place + transaction/CAS đã push |
| C01c | Move/remove/refund/restart/corrupt layout; 68 regression + 34 DB tests đạt |
| C02a game | `ddee89a` main đã push: Web preset/shell, move M, 5 native suites đạt |
| C02a web | `/game.html`, builder, preview server, loader tests/CI artifact; browser chơi thật |
| C02b | Chưa làm, sau C01+C02a: auth bridge, server entitlement, save/load city |
| C02c | Chưa làm: browser E2E account → note → XP → build → reload/login lại |
| L01/Q01/O01/AI01 | Chưa làm: review, quests/QOL, staging/backup/release, AI V2 |

C02a có thể làm preview sớm mà không chờ City API; preview phải được ghi rõ,
không tự cấp server XP/inventory. Bản tích hợp dữ liệu đầy đủ vẫn cần C01/C02b.

## Files và mục đích

- C01a: `docs/CITY_SPEC.md`, `server/data/city-catalog.v1.json`, `city-rules.js`,
  `server/test/city-rules.test.js`; geometry và contract trước City API.
- C01b/c: `server/city.js`, `models/City.js`, `models/CityMutation.js`, routes trong
  `app.js`, `server/test/integration/city.test.js`; CRUD placement/receipt/rollback.
- C02a web: `game.html`, `css/game.css`, `js/game.js`, navigation home/notes;
  `server/preview.js` (loopback, DB writes 503), `scripts/build-game.js` (staging/
  pinned source/atomic publish), `server/game-source.json`, CI Web artifact job.
  Tests mới `game-client.test.js`, `game-http.test.js`; spec `docs/WEB_GAME.md`.
- C02a game: `export_presets.cfg`, `web/preview-shell.html`, local move trong
  grid placement system, move regression/CI. Source game main đã commit.
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

- Windows editor safe-save fix (2026-11-06): `.godot` thuộc CodexSandboxOffline,
  Admin không nâng quyền bị từ chối mở ghi `editor/project_metadata.cfg`.
  Đã cấp Modify inheritable **chỉ cho Admin trong .godot**; giữ safe save.
  ACL trước sửa lưu local tại `.godot/acl-before-admin-fix.json` (ignored).
  Admin non-elevated đã mở ghi metadata và atomic replace probe thành công;
  Godot `--headless --editor --import --quit` hoàn tất, log mới không có ERROR,
  safe-save hoặc parent/popup errors. User đã xác nhận mọi thứ ổn trước C02a.
  Popup cũ nhiều khả năng là hệ quả báo lỗi lưu lặp; không sửa plugin/gameplay
  khi chưa có evidence lỗi độc lập. Cache/ACL là sửa local, không versioned.
- Chẩn đoán parser error (2026-11-06): checkout game gốc thiếu
  `Scenes/Knowledge/knowledge_validation.gd` và `.uid` vì local uncommitted
  deletions; không phải feature chờ C02. File đã có trong HEAD và game main.
  Đã chạy knowledge regression và startup headless 60 frames tại main worktree
  `0d1721a`: exit 0, không parser error. GUI interaction chưa kiểm tra ở lần này;
  Godot vẫn báo lỗi đọc certificate store trong sandbox như các lần trước.
  Để chạy bản phát triển, import `.worktrees/knowledge-main/project.godot`.
  Chẩn đoán này không khôi phục/xóa các local changes trong checkout gốc.
- Web export/iframe đã chạy thật; preview bật native sandbox catalog/debug
  unlock-all và local knowledge milestones, chưa phải server ownership/XP.
  C02b phải dùng 4-item authenticated catalog và coordinate contract C01.
- Landing page/README UI cũ có mô tả ý tưởng tương lai; lấy README root/spec làm
  chuẩn. Backend tests không xác nhận browser bridge hoạt động.
- C01a: 68/68 regression tests; native Godot catalog contract đạt (4 footprints,
  native tile size và chuyển axial→offset ở các mép/hàng chẵn lẻ). Contract phát
  hiện mapping ban đầu sai; đã sửa phép chuyển, không sửa game grid để lách test.
- C01c: 68/68 regression + 34/34 MongoDB 8.2.6 integration, syntax/diff đạt.
  17 city cases gồm auth/CSRF/owner, revision races hai tiến trình, same-key retry,
  invalid move, remove/refund, fault injection, API restart, corrupt layout,
  concurrent note reward, cross-operation key conflict và capacity 256.
- C02a: 74/74 regression và 34/34 MongoDB tests đạt, 5 native suites đạt.
  Export release từ pin ddee89a sạch; 4 artifact checksums và MIME đúng. Browser
  IAB Chromium đã thử select/place/Esc/M-move/camera/zoom/Delete; normal gameplay
  không warn/error. Missing manifest có kiểm soát báo lỗi; restore + Retry chạy
  được. Fullscreen/exit, canvas resize/focus đạt. Chưa test Safari/mobile.
  Ảnh kiểm chứng local: `.artifacts/web-preview.png` (ignored).
- Chưa xác nhận: CI remote, TTL worker xóa vật lý, failover/network partition,
  browser E2E account→XP→persisted city, public hosting, cross-device, staging/UAT,
  backup/restore. CI build mới cấu hình; chưa xác nhận remote Linux pass.

## Git / workspace

- Web repo `E:/NOTEBUILDER`, branch `websiteWorkandTest`, origin
  `https://github.com/Hoainam4406/NOTEBUILDER.git`.
- Baseline trước C02a: `4c6e839`, đã push; C01c ở `8197b7e`.
  Lấy hash checkpoint đang chứa snapshot bằng
  `git log -1 --oneline -- AGENTS.md AI_HANDOFF.md`. Không cần lịch sử chat.
- C02a chỉ commit source/docs/tests đã nêu; build và ảnh kiểm chứng ignored.
  Checkpoint này được commit/push trên branch web; lấy hash và xác nhận remote
  bằng các lệnh dưới đây, không coi snapshot tài liệu là bằng chứng push.
  Xác minh trạng thái hiện tại bằng `git status --short`; kiểm tra push bằng
  `git rev-parse HEAD` và `git ls-remote origin refs/heads/websiteWorkandTest`.
- Game worktree làm việc: `E:/isometric_building_game/.worktrees/knowledge-main`,
  branch `main`, HEAD `ddee89a`, origin `https://github.com/SubNhatSan/isometric_building_game.git`,
  C02a export + 5 suites đạt; main đã push và source pin đúng hash.
  Có untracked `tests/city_catalog_contract.gd.uid` do editor sinh, đã có trước
  task safe-save; chưa đưa vào commit, giữ nguyên.
- **Không sửa checkout game gốc để đổi branch:** `E:/isometric_building_game`
  đang ở `websiteWorkandTest` với user changes: README modified,
  `Scenes/Knowledge/knowledge_validation.gd` và `.uid` deleted. Phải giữ nguyên.
- GCM đã hoạt động; tự commit/push task đạt kiểm tra sau khi xác nhận đúng đích.
  Nếu auth lỗi, báo một lần với nguyên nhân; không lặp đăng nhập/force push/reset.

## Bước tiếp quản cụ thể

1. Đọc hai file root, kiểm tra Git/status/remote/diff ở cả repo cần sửa; đối chiếu
   specs và commit history nếu có khác biệt. Không chạy restore/reset để làm sạch.
2. C02b: viết bridge spec async; messages cần đúng origin/source/schema, không
   credential qua URL. Dùng session/CSRF cùng origin. Preview server cố ý chặn
   API; auth E2E cần backend replica set, không dùng preview server để test login.
3. Thêm authenticated game mode: render map v1/blocked cells, chỉ 4 reward items,
   chuyển axial→offset đúng; load city/revision trước tương tác.
4. Place/move/remove chỉ commit renderer sau backend success; retry giữ key/body,
   conflict reload không mất draft; xử lý expiry. C02c chạy E2E đăng ký→note→XP→
   xây→reload/login lại, hai tab và failure cases.
5. Sau mỗi checkpoint cập nhật file này, báo hash/push/tests; kết thúc session
   ghi rõ việc còn dở và không đánh dấu production/E2E khi chưa kiểm chứng.
