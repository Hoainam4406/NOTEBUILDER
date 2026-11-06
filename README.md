# Knowledge City / NOTEBUILDER

Website ghi chú HTML/JavaScript/Fabric với Express 5 và MongoDB; city renderer nằm
ở repository `isometric_building_game` (Godot 4.7.2).

**Đã có Godot chơi thử nhúng tại `/game.html` (C02a).** Sau build, dùng
`npm run preview:game` và mở `http://127.0.0.1:5050/game.html`. Bản này xây thử tự
do, chưa lưu city vào tài khoản; C02b nối City API và C02c xác nhận browser E2E.
Hướng dẫn export/host: [docs/WEB_GAME.md](docs/WEB_GAME.md). Artifacts không nằm
trong Git; cần build local hoặc lấy artifact CI khi triển khai.

Agent tiếp quản: đọc [AGENTS.md](AGENTS.md) và [AI_HANDOFF.md](AI_HANDOFF.md)
trước khi làm việc. Snapshot trạng thái, Git và bước tiếp theo nằm trong handoff.

## Chạy local

1. Dùng Node 24.14.0 (xem `.nvmrc`).
2. `npm ci --prefix server`.
3. Sao chép `server/.env.example` thành `server/.env`, cấu hình MongoDB replica set
   local/test (ví dụ `rs0`) hoặc cluster hỗ trợ transaction. MongoDB standalone
   không còn đủ để chạy app; startup kiểm tra và từ chối trước khi mở cổng.
4. `npm run dev` hoặc `npm start`, mở URL server in ra (mặc định cổng 5000).
5. Nếu cần dữ liệu demo: `npm run seed`. Server không tự nạp seed khi khởi động.

Frontend được phục vụ cùng origin với API; không cần hardcode cổng khi deploy.
Khi mở file HTML trực tiếp, chế độ localStorage vẫn là prototype offline riêng.

## Kiểm tra

```text
npm run check
npm test
npm run test:integration
git diff --check
```

74 tests dùng HTTP thật trên cổng loopback ngẫu nhiên với model thay thế,
và VM chạy mã frontend để kiểm tra lỗi save/delete, revision và khởi động session.
Tests kiểm tra auth/CSRF/owner isolation ở tầng HTTP nhưng không kết nối MongoDB
thật. Thêm 34 integration tests chạy MongoDB 8.2.6 replica set cục bộ riêng để
kiểm tra indexes, auth/owner/CAS giữa hai tiến trình, restart API và rollback.
Xem [docs/TESTING.md](docs/TESTING.md); chưa xác nhận persistence cross-device.
GitHub Actions chạy syntax/tests trên Linux khi push feature branch hoặc mở PR.

## Trạng thái

- Đã có notes CRUD/canvas, search, export Godot ở mức prototype.
- Nền tảng mới: validation, error contract, testable app factory, health 503 khi
  DB disconnected, không log connection URI, không tự seed khi startup.
- Lưu/xóa online thất bại giữ editor/list, không giả báo thành công local.
- XP ledger/rewards/inventory đã commit cùng note bằng transaction; +20 XP/note
  đủ điều kiện, chống trùng và cap ngày. API `/api/progress`, `/api/rewards` chỉ
  đọc trạng thái của tài khoản hiện tại. Chi tiết: `docs/PROGRESSION_SPEC.md`.
- POST note cần `Idempotency-Key`; UI giữ request key/payload khi mất phản hồi,
  retry trả cùng note. Bản nháp thay đổi trong lúc chờ vẫn mở sau khi xác nhận
  lần lưu cũ. Key được giữ trong bộ nhớ của editor hiện tại, không lưu shared storage.
- Dashboard online và JSON export dùng XP/rewards của backend; xóa note không
  làm mất XP đã nhận. Export đọc notes/progress/rewards trong cùng DB snapshot.
  `await GodotBridge.getKnowledgeData()` và `await GodotBridge.exportJSONFile()`
  là async. File-mode export đánh dấu prototype và không xuất XP có thẩm quyền.
- Auth/session/profile: mở `/account.html`; mật khẩu 12..128 ký tự, session cookie
  HttpOnly, CSRF token và rate limit lưu MongoDB. Startup tạo unique indexes trước
  khi mở cổng. Đặt `NODE_ENV=production` khi dùng HTTPS để cookie có Secure.
- Notes online yêu cầu đăng nhập, lọc owner ở DB; update/delete cần `revision`.
  Hai tab sửa cùng note: bản lưu cũ nhận 409, giữ nguyên editor để người dùng
  sao chép bản nháp và mở lại phiên bản mới. Không có merge nội dung tự động.
- Notes MongoDB cũ chưa có owner được giữ nguyên, ẩn khỏi mọi tài khoản;
  không tự gán dữ liệu cũ. Import localStorage tự động đã tắt; file HTML mở trực
  tiếp vẫn là prototype offline riêng, không đồng bộ lên tài khoản.
- City backend C01: GET `/api/city/catalog`, GET `/api/city`, POST
  `/api/city/buildings`, PATCH/DELETE `/api/city/buildings/:id`; session/CSRF,
  ownership, polygon collision, revision CAS, idempotent debit/refund và save/load.
  Xem `docs/CITY_SPEC.md`. Web preview đã có; sync tài khoản/city còn chờ C02b.
- **Chưa sẵn sàng production:** còn thiếu authenticated Web integration,
  backup/restore, staging/UAT. Không triển khai công khai dữ liệu người dùng ở trạng thái này.

Kế hoạch task, acceptance criteria và quyết định còn phải chốt:
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).
Specification auth/notes: [docs/AUTH_NOTES_SPEC.md](docs/AUTH_NOTES_SPEC.md).
Tài liệu UI cũ trong `notegame-web/README.md` mô tả prototype trước batch nền tảng;
quy trình startup/test và giới hạn hiện tại lấy README này làm tham chiếu.
