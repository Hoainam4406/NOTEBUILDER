# Kiểm thử local và CI

## C02b/C02c — authenticated city, 2026-11-06

- Node 24.14.0: syntax, 92 regression tests và 34 MongoDB integration tests.
  Bridge/host tests thêm strict envelope, origin/source, owner switch, timeout,
  identical retry, conflict reload, obsolete async load/pagehide và dispose.
  Editor form reset/fill trước khi hiện modal; delayed canvas init không được
  xóa text vừa gõ hoặc khởi tạo lại editor đã đóng/thay thế (bug thấy khi E2E).
- Game `f1739c7` main: 6 suites đạt (5 cũ + server_city_regression). Suite mới
  kiểm tra 1024 cells/4 blocked, axial→native, 4 items, không optimistic commit,
  retry/conflict/draft, remove và expiry. JSON numeric types được chuẩn hóa khi
  so ô cấm. Sandbox certificate-store warning không phải parser failure.
- Export thật cả Web Preview/Web City từ source pin sạch; mỗi build có 4 SHA-256,
  WASM/PCK MIME đúng. City dùng main_scene riêng trong staging, không sửa World.
- Chromium desktop local: UI đăng ký/login → note hợp lệ → 20 XP + 1 starter →
  place → move → reload và logout/login lại vẫn đúng layout/XP. Final export
  được kiểm tra thêm place → reload sau session mới.
- Fault fixture: 503 ở move giữ original + ghost và khóa edits; retry thành công.
  Hai tab cùng revision: remove ở A, move stale ở B nhận conflict; B render city
  rỗng mới, giữ ghost và nhận đúng 1 refund trong kho. Place vào ô cấm không
  trừ kho. Thu hồi session test khiến frame xóa layout/inventory riêng và khóa ghi.
- Snapshot sau place/move/remove: revision 3, 3 receipts, inventory=1, XP=20.
  Sau đặt lại/reload: revision 4, 4 receipts, 1 building, inventory=0, XP=20.
  Preview riêng khởi động/đặt được; normal gameplay không warn/error trong console.
- Ảnh local ignored: `.artifacts/city-persisted.png`, `city-retry.png`,
  `city-conflict.png`, `city-expiry.png`. Test servers/replica sets đã dừng.

Chạy browser fixture trong console tương tác:

```text
node server/test/helpers/browser-server.js
```

Fixture tự tạo replica set/port loopback, không đọc .env/URI ứng dụng, không seed.
Tạo account/note qua UI hoặc API bình thường. stdin commands chỉ thuộc fixture:
`fail-next-city` (503 trước write), `drop-next-city-response` (mất response sau
commit; browser có thể tự retry HTTP), `expire-sessions`, `snapshot`, `stop`.
Không có fault endpoints trong ứng dụng. Dùng `stop`/Ctrl+C để teardown.

Đây là browser verification local qua tool, chưa có automated browser CI job.
CI remote, Safari/mobile, cross-device, public hosting, staging/UAT và backup/
restore vẫn pending; không coi 92 VM/HTTP tests là bằng chứng các mục đó.

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
tự cấp inventory/XP. Authenticated browser E2E/hosting vẫn cần C02b/c.

## C02a evidence

74 regression tests: thêm loader VM (origin/source/schema, stale iframe, network/
missing build, timeout) và HTTP preview không DB/không ghi dữ liệu. Tổng 34 MongoDB
integration vẫn đạt. Godot knowledge/catalog/move/placement/support đều đạt.

Đã export release thật từ game pin `ddee89a`, kiểm tra 4 artifact SHA-256/MIME,
sourceDirty=false. IAB Chromium đã click play, chọn/đặt/Esc/M-move, camera D, wheel
zoom, Delete fixture; normal gameplay không warn/error. Resize và fullscreen/exit
đạt. Missing build thử bằng manifest tạm đổi tên trên loopback cho lỗi rõ ràng;
manifest khôi phục, Retry mở game thành công. Build artifacts/cache không commit.
Đây là preview browser smoke; chưa chứng minh persisted account/city loop C02c,
Safari/mobile, deploy công khai hoặc CI remote job mới đã pass.
