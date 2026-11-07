# Nghiệm thu localhost

Mốc user: đủ chức năng/UI tương tác và backend, chưa tính polish thẩm mỹ/deploy.
Q01 local đạt; bước tiếp theo xác minh cấu hình ứng dụng và toàn bộ core loop.

## Smoke cấu hình thực

Tại root NOTEBUILDER, Node 24.14.0:

```text
npm run check:local
```

Lệnh dùng .env ứng dụng và startup thật (transaction/index gate), cổng tạm, không
mở browser. Kiểm tra pages/health, API anonymous isolation, hai game exports đúng
pin/checksum và WASM/PCK MIME. Không seed, không tạo/xóa account/note/XP/draft/city;
startup có thể tạo schema indexes còn thiếu như khởi động app bình thường. Không
in URI/credentials/stack. Exit0 nếu đạt; export thiếu/sai pin báo lỗi và xem WEB_GAME.md.
Không chạy song song với thay đổi cấu hình/export. Không cần admin hoặc thay MongoDB service.

## Evidence 2026-11-07

- Node24.14.0 kết nối MongoDB ứng dụng: hỗ trợ transactions, writable primary.
- Startup thật trên cổng tạm đạt, health200/online; home/notes/review/journey/city/
  account200. Anonymous notes/drafts/journey401. Server đã đóng, không data writes.
- Kết quả command check:local và giới hạn thêm xem TESTING.md.

## Gate tương tác bản cuối còn lại

1. Chạy `npm run dev`, đăng nhập bằng account kiểm thử do user chọn; không tự dùng
   dữ liệu thật làm fixture phá hủy. Nếu cần account mới, tạo qua UI bình thường.
2. Note/canvas → autosave → reload/restore → publish → XP/inventory đúng → city
   place/move/remove → reload/login lại giữ state → review → quests/claims.
3. Restart API rồi xác nhận persistence, thử expiry/two tabs/uncertain writes bằng
   fixture riêng; không đưa fault controls vào ứng dụng thật.
4. Rà soát desktop/390px, keyboard/focus/loading/errors; ghi riêng browser/thiết bị
   đã thử. CI local, DB suite, smoke startup không tự chứng minh gate này.

Chỉ gọi 100% localhost khi các gate còn lại đạt và blocker đã sửa. Deploy/staging/
backup/restore/monitoring thuộc O01 riêng; không bỏ khỏi backlog.
