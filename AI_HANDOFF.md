# Active Development State — Knowledge City

Cập nhật: 2026-11-06. Đọc cùng `AGENTS.md`; kiểm tra Git/source trước khi tiếp quản.

## Mục tiêu hiện tại / phạm vi session

- H01: thiết lập handoff Codex ↔ Google Antigravity và làm rõ việc nhúng Godot.
- Kết quả rà soát: game tương tác trên web **chưa được triển khai**. C02 đã có
  trong roadmap nhưng mô tả thiếu chi tiết; nay tách C02a/b/c rõ ràng.
- Session này chỉ sửa tài liệu; không bắt đầu City API hay export/nhúng game.

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

## Task state

| Task | Trạng thái / evidence |
|---|---|
| Foundation/auth/owner/CAS | Đã có code; HTTP/VM và MongoDB tests đạt |
| N02 | `7ea440a`: real MongoDB, hai tiến trình API, restart/concurrency/rollback |
| X01a | `5ed7cf0`: specification và policy XP/rewards có unit tests |
| X01b | `24c8330`: transaction note/XP/rewards/inventory, retry/idempotency |
| X01c | `64481cb`: dashboard/export dùng server; 62 regression + 17 DB tests đạt |
| H01 | Hai file handoff và roadmap/README đã cập nhật; verification xem dưới |
| C01 | Chưa làm: spec map/catalog/footprint/rotation/inventory/revision và City API |
| C02a | Chưa làm: Godot Web export + trang game nhúng tương tác trong website |
| C02b | Chưa làm, sau C01+C02a: auth bridge, server entitlement, save/load city |
| C02c | Chưa làm: browser E2E account → note → XP → build → reload/login lại |
| L01/Q01/O01/AI01 | Chưa làm: review, quests/QOL, staging/backup/release, AI V2 |

C02a có thể làm preview sớm mà không chờ City API; preview phải được ghi rõ,
không tự cấp server XP/inventory. Bản tích hợp dữ liệu đầy đủ vẫn cần C01/C02b.

## Files và mục đích

- H01: `AGENTS.md` (context/quy tắc bền vững), `AI_HANDOFF.md` (snapshot này),
  `docs/IMPLEMENTATION_PLAN.md` (C02a/b/c và acceptance), `README.md` (game chưa
  embed và điểm vào handoff), `notegame-web/README.md` (sửa hướng dẫn bridge cũ).
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
  chuẩn. Chưa có bằng chứng bug blocker mới trong code ở session tài liệu này.
- Baseline `64481cb`: 62/62 regression, 17/17 MongoDB 8.2.6 integration,
  syntax/diff đạt (checkpoint X01c). Game `0f35952`: knowledge/support và placement
  audit 498 scenes đạt ở session trước. Không suy diễn đã chạy lại game ở H01.
- H01: đã rà soát Git/source; 5 tài liệu Markdown đọc được, 8 liên kết local
  resolve; `git diff --check` đạt. Không chạy lại bộ tests code vì chỉ sửa tài liệu.
- Chưa xác nhận: CI remote, TTL worker xóa vật lý, failover/network partition,
  browser E2E, web export/hosting, cross-device, staging/UAT, backup/restore.

## Git / workspace

- Web repo `E:/NOTEBUILDER`, branch `websiteWorkandTest`, origin
  `https://github.com/Hoainam4406/NOTEBUILDER.git`.
- Code baseline HEAD: `64481cb28d88be879e6b319b0b4ddabc5c4db7ad`, push đã xác nhận.
  H01 là commit tài liệu sau baseline; lấy hash snapshot bằng
  `git log -1 --oneline -- AGENTS.md AI_HANDOFF.md`. Không cần lịch sử chat.
- Web checkout sạch khi bắt đầu H01; chỉ các file H01 nêu trên được sửa.
  Xác minh trạng thái hiện tại bằng `git status --short`; kiểm tra push bằng
  `git rev-parse HEAD` và `git ls-remote origin refs/heads/websiteWorkandTest`.
- Game worktree làm việc: `E:/isometric_building_game/.worktrees/knowledge-main`,
  branch `main`, HEAD `0f35952`, origin `https://github.com/SubNhatSan/isometric_building_game.git`,
  push đã xác nhận ở checkpoint trước; worktree sạch khi rà soát H01.
- **Không sửa checkout game gốc để đổi branch:** `E:/isometric_building_game`
  đang ở `websiteWorkandTest` với user changes: README modified,
  `Scenes/Knowledge/knowledge_validation.gd` và `.uid` deleted. Phải giữ nguyên.
- GCM đã hoạt động; tự commit/push task đạt kiểm tra sau khi xác nhận đúng đích.
  Nếu auth lỗi, báo một lần với nguyên nhân; không lặp đăng nhập/force push/reset.

## Bước tiếp quản cụ thể

1. Đọc hai file root, kiểm tra Git/status/remote/diff ở cả repo cần sửa; đối chiếu
   specs và commit history nếu có khác biệt. Không chạy restore/reset để làm sạch.
2. Mặc định tiếp tục C01: đối chiếu `Scenes/Buildings/building_catalog.json` và
   placement source trong game main; chốt subset MVP, footprint/rotation/bounds,
   blocked cells, inventory consumption/refund và city revision/error contract.
3. Viết `docs/CITY_SPEC.md` với CITY-01..05 acceptance; triển khai C01 theo task
   nhỏ, real-DB concurrency/rollback/save-load tests trước commit/push.
4. Khi làm game chơi thử, dùng C02a trong implementation plan: export/host thật,
   trang vào game và browser interaction. Sau C01 nối C02b rồi chạy C02c.
5. Sau mỗi checkpoint cập nhật file này, báo hash/push/tests; kết thúc session
   ghi rõ việc còn dở và không đánh dấu production/E2E khi chưa kiểm chứng.
