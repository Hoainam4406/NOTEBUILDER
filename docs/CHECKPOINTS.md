# Checkpoints nền tảng

## Batch identity / notes (2026-11-06)

- S01: `4cc4a07`, specification `AUTH_NOTES_SPEC.md`, baseline 31/31 tests;
  push websiteWorkandTest thành công.
- A01: `6c5055f`, push websiteWorkandTest thành công;
  register/login/logout/me/profile và trang `account.html`; hash scrypt,
  session MongoDB 7 ngày, CSRF, auth rate limits. 39/39 tests và syntax đạt.
  HTTP tests dùng model giả, chưa kiểm thử unique index/TTL trên MongoDB thật.
- N01: owner isolation, revision CAS và tích hợp tài khoản vào notes; 50/50
  tests, syntax checks đạt. Legacy notes giữ nguyên không gán owner, import tắt.
- Tiếp theo: kiểm thử MongoDB thật (unique/TTL/CAS và restart), X01 ledger atomic.
  Chưa có MongoDB local sẵn sàng trong môi trường này; không gọi fake tests là
  DB integration hoặc xác nhận persistence cross-device.

## N02 — MongoDB integration (2026-11-06)

- Đã vượt qua gate DB trước đây: 7/7 tests dùng MongoDB 8.2.6 replica set thật,
  hai tiến trình API; indexes, owner isolation, CAS, login counters, expiry/logout,
  API restart và rollback transaction đạt. 50/50 tests cũ vẫn đạt.
- CI chạy suite integration; binary/cache/data không track. Không dùng `.env`
  hoặc database ứng dụng. Chi tiết: `TESTING.md`.
- Tiếp theo: X01 specification -> ledger/rewards transaction -> UI server progress.

| Task | Commit | Kiểm tra local | Push |
|---|---|---|---|
| F01: kế hoạch, Git hygiene | f98e056 | diff check; env/dependencies giữ trên máy | Chưa xác nhận; CLI thiếu credential |
| F02: API validation/app factory | 1f2d6eb | 22 HTTP tests, syntax | Chưa xác nhận; CLI thiếu credential |
| F03: trạng thái save/delete trung thực | abd34fd | Tổng 31 tests, syntax | Chưa xác nhận; CLI thiếu credential |
| F05 web: CI Linux và runtime | e90c06f | Tổng 31 tests, syntax; workflow chưa chạy remote | Chưa xác nhận; CLI thiếu credential |

Game companion: F04 đã có regression knowledge/editor, placement (498 scene),
support level đạt trên Godot 4.7.2. Xem docs/KNOWLEDGE_CITY.md trong repo game.

Thứ tự tiếp theo: A01 auth/session/profile -> N01 note owner/version/migration ->
X01 XP ledger/rewards -> C01 city backend -> C02 bridge/E2E -> L01 -> Q01 -> O01.
Chưa đánh dấu 24 acceptance cases của blueprint hoàn thành. CI remote, staging,
UAT và production là các gate độc lập chưa xác nhận.
