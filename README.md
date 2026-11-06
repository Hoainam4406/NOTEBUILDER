# Knowledge City / NOTEBUILDER

Website ghi chú HTML/JavaScript/Fabric với Express 5 và MongoDB; city renderer nằm
ở repository `isometric_building_game` (Godot 4.7.2).

## Chạy local

1. Dùng Node 24.14.0 (xem `.nvmrc`).
2. `npm ci --prefix server`.
3. Sao chép `server/.env.example` thành `server/.env`, cấu hình MongoDB local/test.
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

50 tests dùng HTTP thật trên cổng loopback ngẫu nhiên với model thay thế,
và VM chạy mã frontend để kiểm tra lỗi save/delete, revision và khởi động session.
Tests kiểm tra auth/CSRF/owner isolation ở tầng HTTP nhưng không kết nối MongoDB
thật. Thêm 7 integration tests chạy MongoDB 8.2.6 replica set cục bộ riêng để
kiểm tra indexes, auth/owner/CAS giữa hai tiến trình, restart API và rollback.
Xem [docs/TESTING.md](docs/TESTING.md); chưa xác nhận persistence cross-device.
GitHub Actions chạy syntax/tests trên Linux khi push feature branch hoặc mở PR.

## Trạng thái

- Đã có notes CRUD/canvas, search, export Godot ở mức prototype.
- Nền tảng mới: validation, error contract, testable app factory, health 503 khi
  DB disconnected, không log connection URI, không tự seed khi startup.
- Lưu/xóa online thất bại giữ editor/list, không giả báo thành công local.
- XP hiển thị vẫn là phép tính demo theo số note. Chưa có XP ledger/reward atomic.
- Auth/session/profile: mở `/account.html`; mật khẩu 12..128 ký tự, session cookie
  HttpOnly, CSRF token và rate limit lưu MongoDB. Startup tạo unique indexes trước
  khi mở cổng. Đặt `NODE_ENV=production` khi dùng HTTPS để cookie có Secure.
- Notes online yêu cầu đăng nhập, lọc owner ở DB; update/delete cần `revision`.
  Hai tab sửa cùng note: bản lưu cũ nhận 409, giữ nguyên editor để người dùng
  sao chép bản nháp và mở lại phiên bản mới. Không có merge nội dung tự động.
- Notes MongoDB cũ chưa có owner được giữ nguyên, ẩn khỏi mọi tài khoản;
  không tự gán dữ liệu cũ. Import localStorage tự động đã tắt; file HTML mở trực
  tiếp vẫn là prototype offline riêng, không đồng bộ lên tài khoản.
- **Chưa sẵn sàng production:** còn thiếu XP ledger/rewards atomic, city API,
  backup/restore, staging/UAT. Không triển khai công khai dữ liệu người dùng ở trạng thái này.

Kế hoạch task, acceptance criteria và quyết định còn phải chốt:
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).
Specification auth/notes: [docs/AUTH_NOTES_SPEC.md](docs/AUTH_NOTES_SPEC.md).
Tài liệu UI cũ trong `notegame-web/README.md` mô tả prototype trước batch nền tảng;
quy trình startup/test và giới hạn hiện tại lấy README này làm tham chiếu.
