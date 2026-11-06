# A01 / N01 — specification triển khai MVP

Nguồn định hướng: blueprint Knowledge City v1.0; stack hiện tại được giữ nguyên.
Các quyết định bên dưới áp dụng cho auth và notes, chưa chốt XP/schema city.

## Task và acceptance criteria

1. S01: ghi specification này, kiểm tra baseline 31 tests và diff; commit riêng.
2. A01: register/login/logout/me/profile, session bền vững và form tài khoản.
   AUTH-01..03: email unique không phân biệt hoa thường, mật khẩu hash scrypt,
   sai login không lộ tài khoản; giới hạn request lưu MongoDB, cookie HttpOnly,
   session hết hạn và logout vô hiệu ngay; mutation cần CSRF token.
3. N01: tất cả note routes và Godot export yêu cầu session; filter owner ở DB,
   không nhận owner từ client; user khác nhận 404. PATCH/PUT/DELETE cần revision;
   stale revision trả 409 và không đổi dữ liệu. UI giữ nội dung khi lỗi/xung đột.
   Note cũ chưa có owner được giữ nguyên và không tự gán cho ai. Import local
   tự động bị tắt để tránh gán dữ liệu của thiết bị dùng chung vào tài khoản.
4. G01 (game, main): đưa foundation đã kiểm thử sang main bằng fast-forward,
   bật CI cho main; chạy knowledge, placement và support regressions.
5. Tiếp theo: integration MongoDB thật/concurrency, XP ledger transaction,
   catalog/inventory/city API, bridge và core-loop E2E; không triển khai XP bằng
   bộ đếm notes. Staging/backup/UAT vẫn là gate riêng.

## Identity contract

- API prefix `/api/auth`: POST register `{email,password,displayName}`, POST login
  `{email,password}`, POST logout, GET me; PATCH `/api/profile` `{displayName}`.
- Email ASCII 3..254, trim/lowercase; password 12..128 ký tự, không trim;
  displayName trim 1..80. Password không bao giờ có trong response/log.
- Register trả 201 profile, không tự login; email trùng trả 409 EMAIL_EXISTS.
- Login trả `{user,csrfToken}`; GET me trả cùng shape; logout trả 204.
- Cookie `kc_session`: random 32 bytes, DB chỉ lưu SHA-256; TTL 7 ngày,
  HttpOnly, SameSite=Strict, Path=/; Secure khi NODE_ENV=production.
- CSRF token random lưu cùng session, header `X-CSRF-Token` bắt buộc cho
  mutation sau login. Auth routes login/register không dùng session để đổi dữ liệu.
- Rate limit cố định 15 phút: tối đa 30 auth requests/IP và 10/email;
  key SHA-256, Mongo atomic counter + TTL; 429 RATE_LIMITED và Retry-After.
  Không tin X-Forwarded-For khi chưa cấu hình trusted proxy.
- Session tra DB mỗi request, kiểm tra expiry trực tiếp (không phụ thuộc TTL job).
- User unique email; Session unique tokenHash, userId FK logic; AuthAttempt unique
  key, expiresAt TTL. Không xoá dữ liệu người dùng cũ khi tạo index mới.
- Lỗi `{error,code}`: 400 input, 401 AUTH_REQUIRED/INVALID_CREDENTIALS,
  403 CSRF_INVALID, 404 NOTE_NOT_FOUND, 409 NOTE_CONFLICT/EMAIL_EXISTS, 429,
  503 DB unavailable; 500 không lộ chi tiết.

## Note contract

- `ownerId: ObjectId`, `revision: integer >=0`, mặc định 0 cho note mới.
- GET/list/export chỉ trả owner hiện tại, không trả ownerId trong JSON.
- POST bỏ qua ownerId/revision client; server khởi tạo revision 0.
- PUT/PATCH body gồm revision đã đọc; filter `_id,ownerId,revision` và `$inc`
  cùng một findOneAndUpdate. DELETE filter tương tự. Không dùng read-then-save.
- Filter owner áp dụng cả search và import; endpoint import legacy tắt (410),
  đến khi có import idempotent và xác nhận rõ phạm vi dữ liệu.
- Health public chỉ trạng thái DB, không công khai tổng số note toàn hệ thống.

## Validation evidence

HTTP tests dùng fake repositories xác minh contract/auth/owner/CAS và UI VM
regressions. Không coi các test này là bằng chứng unique index/TTL/transaction
MongoDB thực, multi-process concurrency, cross-device, staging hoặc production.
