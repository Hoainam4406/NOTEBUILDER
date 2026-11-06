# Kiểm thử local và CI

## Commands

```text
npm ci --prefix server
npm run check
npm test
npm run test:integration
git diff --check
```

`npm test`: 50 tests HTTP/model giả và VM frontend, nhanh và không cần mongod.
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
