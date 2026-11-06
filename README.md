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
git diff --check
```

31 tests dùng HTTP thật trên cổng loopback ngẫu nhiên với Note model thay thế,
và VM chạy mã frontend để kiểm tra lỗi save/delete. Tests không kết nối MongoDB
thật và không chứng minh transaction, authorization hay persistence cross-device.
GitHub Actions chạy syntax/tests trên Linux khi push feature branch hoặc mở PR.

## Trạng thái

- Đã có notes CRUD/canvas, search, export Godot ở mức prototype.
- Nền tảng mới: validation, error contract, testable app factory, health 503 khi
  DB disconnected, không log connection URI, không tự seed khi startup.
- Lưu/xóa online thất bại giữ editor/list, không giả báo thành công local.
- XP hiển thị vẫn là phép tính demo theo số note. Chưa có XP ledger/reward atomic.
- **Chưa sẵn sàng production:** chưa có auth, ownership, conflict version, city API,
  backup/restore, staging/UAT. Không triển khai công khai dữ liệu người dùng ở trạng thái này.

Kế hoạch task, acceptance criteria và quyết định còn phải chốt:
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).
Tài liệu UI cũ trong `notegame-web/README.md` mô tả prototype trước batch nền tảng;
quy trình startup/test và giới hạn hiện tại lấy README này làm tham chiếu.
