# Checkpoints nền tảng

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
