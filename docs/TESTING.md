# Kiểm thử local và CI

## Windows editor / shared cache

Khi agent và người dùng chạy Godot bằng hai tài khoản Windows khác nhau, kiểm tra
ACL `.godot` nếu editor báo safe-save failed. Cache do sandbox tạo có thể cho user
tạo temp file nhưng không thay được metadata cũ; không kết luận antivirus từ thông báo.
Chỉ sửa quyền Modify cho đúng editor user trong cache, không cấp Everyone/FullControl
toàn ổ đĩa và không tắt safe save để che lỗi. Lưu snapshot ACL local trước khi sửa.

2026-11-06: main worktree đã sửa quyền inheritable cho Admin; xác minh dưới Admin
không nâng quyền: mở ghi metadata cũ, atomic replacement probe và Godot headless
editor import/quit đạt; log không có ERROR/safe-save/parent-popup. Không suy diễn
đã kiểm thử GUI tương tác hoặc plugin dialogs từ headless. Không commit cache/ACL.

## Commands

```text
npm ci --prefix server
npm run check
npm test
npm run test:integration
git diff --check
```

`npm test`: HTTP/model giả, policy XP và VM frontend, nhanh và không cần mongod.
`test:integration`: MongoDB **8.2.6** thật, replica set một node WiredTiger,
được quản lý bởi dev dependency `mongodb-memory-server-core` 11.3.0.
Lần đầu cần tải binary từ MongoDB; cache trong `server/node_modules/.cache`,
không commit binary hoặc dữ liệu DB. Không cần cài dịch vụ MongoDB trên máy.

Suite không đọc `.env` hoặc `MONGODB_URI`, tự tạo database test trên loopback và
cổng ngẫu nhiên. Mọi xóa dữ liệu chỉ chạy trong instance test do suite sở hữu;
teardown dừng API/mongod và dọn dữ liệu tạm. Không nhận URI database bên ngoài.

## N02 acceptance evidence

7 integration cases đã chạy local trên Windows/Node 24.14.0:

- Unique email index: hai tiến trình đăng ký đồng thời chỉ tạo một tài khoản.
- Note và session được đọc lại từ tiến trình API khởi động lại.
- Owner isolation thực ở DB, bao gồm search/export và notes legacy không owner.
- 12 request cùng revision qua hai tiến trình: đúng một thành công, 11 conflict.
- 20 login đồng thời chia sẻ DB counter: 10 bị từ chối credentials, 10 rate limit.
- TTL indexes được kiểm tra; expiry bị từ chối ở middleware, logout thu hồi ngay.
- Transaction bị lỗi giữa chừng rollback note: hạ tầng cho X01.

Không đợi TTL background worker để xác nhận xóa vật lý. Chưa kiểm thử replica-set
failover nhiều node, browser E2E, staging/UAT hoặc restore production backup.
CI Linux chạy cả hai suite; kết quả local không thay thế kết quả CI remote.

API fixture là tiến trình test riêng, không dùng startup/seed của ứng dụng.
Tham khảo API replica-set của thư viện:
[MongoMemoryReplSet](https://typegoose.github.io/mongodb-memory-server/docs/api/classes/mongo-memory-replset/).

## X01b evidence

Thêm 9 case real-DB cho XP-01..05/RWD-01..02: 12 retries cùng key qua hai tiến
trình, payload conflict, retry note đã xóa, duplicate fingerprint, daily cap và
rollover UTC, toàn bộ milestone còn thiếu, fault sau ledger/inventory, edit/delete
giữ XP và owner isolation. Tổng 16 integration tests đạt. Fixture multi-level seed
530 XP rồi nhận 20 XP để kiểm tra phục hồi đủ mốc tới level 5; public API không
cho gửi số XP tùy ý. Chưa mô phỏng network partition hoặc primary failover.

## C01 evidence

6 geometry/catalog unit tests nâng regression lên 68. Godot main có
`tests/city_catalog_contract.gd` đối chiếu 4 polygon thực, tile size và phép chuyển
axial API sang native stacked-offset; hai bản JSON contract phải giống hệt nhau.
Native contract và placement audit 498 scenes đạt. Không đổi native grid để lách test.

17 city integration cases (tổng suite 34) dùng MongoDB thật và hai tiến trình API:
CITY-01..05 backend, auth/CSRF/owner, invalid placement/move, same-key và revision
races, idempotent refund, fault sau inventory/city/receipt, process restart,
corrupt saved layouts, concurrent note rewards, giới hạn 256 buildings. Test full
city và thêm owned copy dùng fixture DB có kiểm soát; không có public endpoint
tự cấp inventory/XP. Browser/E2E/hosting vẫn cần C02 và chưa được xác nhận.
