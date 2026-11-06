# Knowledge City: kế hoạch triển khai

Nguồn: Knowledge_City_Product_Blueprint_14_Muc.md, phiên bản 1.0.
Blueprint là định hướng sản phẩm. Tài liệu này phân biệt hành vi hiện tại,
quyết định triển khai và công việc chưa hoàn thành.

## Hiện trạng và ranh giới

- NOTEBUILDER: Express 5, Mongoose/MongoDB, giao diện HTML/JS và Fabric canvas.
- isometric_building_game: Godot 4.7.2, catalog/placement/collision, ghi chú gắn với công trình.
- Chưa có auth, owner isolation, XP ledger hay city backend. Không được coi demo là production.
- XP hiện tại = số note x 50; game unlock theo số kiến thức đang tồn tại.
  Hai cơ chế này chỉ là prototype, chưa đồng bộ và chưa chống farm.
- Giữ stack hiện tại trong MVP; việc chuyển PostgreSQL/Next.js là quyết định kiến trúc riêng,
  cần migration và kiểm thử dữ liệu, không phải điều kiện để bắt đầu sửa nền tảng.

## Các task theo phụ thuộc

| ID | Phạm vi | Phụ thuộc | Acceptance / kiểm thử |
|---|---|---|---|
| F01 | Git hygiene, specification và backlog | Không | Không track env/dependencies mới; diff check |
| F02 | Tách Express app khỏi startup; validation và error contract | F01 | HTTP tests không khởi động DB thật; dữ liệu sai trả 400, DB lỗi trả 503 |
| F03 | Giao diện lưu/xóa trung thực khi API lỗi | F02 | Network/4xx/5xx giữ editor và dữ liệu; không báo lưu thành công giả |
| F04 | Kiến thức Godot hợp lệ trước khi đổi unlock | F01 | Rỗng/quá dài/preview bị từ chối; sửa/xóa không reset unlock |
| F05 | CI Linux cho kiểm tra nền tảng | F02-F04 | Syntax + automated tests, không dùng DB production |
| A01 | Đăng ký/login/logout, session và profile | F02 | AUTH-01..03; password hash, cookie HttpOnly, CSRF, rate limit |
| N01 | Owner isolation, note version, search, migration | A01 | AUTH-04, NOTE-01..05; migration không tự gán note chung cho tài khoản |
| X01 | XP ledger, level và rewards atomic | N01 | XP-01..05, RWD-01..02 với DB transaction/concurrency thật |
| C01 | City API, inventory và version | X01 | CITY-01..05; ownership/collision/rollback/save-load |
| C02 | Godot bridge và vòng lặp liên ứng dụng | C01 | E2E-01; frontend không tự cấp XP hay quyền sở hữu |
| L01 | Review, flashcards, onboarding | C02 | Phiên ôn tập có ID, retry an toàn, accessibility |
| Q01 | Achievement, quest và QOL | L01 | Progress bền vững, không cấp thưởng trùng |
| O01 | Staging, backup/restore, rollback, monitoring | C02 | DEP-01..02 và release checklist |
| AI01 | AI có quota và kiểm soát đầu ra | O01 | V2; không là điều kiện MVP |

Mỗi task phải test/review, commit Conventional Commits và push websiteWorkandTest.
Không đánh dấu staging/UAT hoặc test DB concurrency đạt khi mới chạy unit test.

## Specification của batch nền tảng

- API giữ prefix `/api` và response note hiện có để tương thích Fabric editor.
- `POST /api/notes`: title bắt buộc 1..200 ký tự sau trim; content tối đa 100000,
  category tối đa 100, tối đa 20 tags (mỗi tag 1..50), template 1..4.
- Note chỉ có title vẫn là nháp hợp lệ cho canvas; **không suy ra quyền nhận XP**.
- Canvas image tối đa 10000000 ký tự; canvas JSON tối đa 10000000 và phải là JSON object.
- `PUT`/`PATCH /api/notes/:id`: các field tùy chọn nhưng không cho title rỗng.
- ID phải là chuỗi ObjectId hex 24 ký tự; search literal, tối đa 200 ký tự.
- Error body `{ error: string, code: string }`; không lộ database URI/stack/password.
- 400: input/JSON sai; 404: không tồn tại; 413: payload quá lớn; 503: DB chưa sẵn sàng;
  500: lỗi nội bộ đã che chi tiết. Health trả 503 khi DB disconnected.
- Migration kiểm tra toàn bộ batch (1..100 note) trước ghi; chưa có transaction/idempotency,
  không tuyên bố đã giải quyết retry migration hoặc XP.
- Online save/delete lỗi: giữ trạng thái cho người dùng thử lại, không âm thầm fallback.
- Godot: title 1..200, content 1..100000 sau trim; subject 1..100.
  Chỉ công trình thật nhận kiến thức. Lưu lỗi không đổi dữ liệu/unlock và không emit saved.

## Các quyết định phải chốt trước X01/C01

- XP tạo note dự kiến +20 với content >=80 ký tự chuẩn hóa, một lần/note;
  fingerprint cùng user để chặn trùng nội dung; cap 200 XP/ngày theo UTC.
- Save/edit/delete không tự thưởng/thu hồi XP ở MVP; review có event ID riêng.
- XP_next(L)=100+25*(L-1), milestone cấp qua nhiều level phải được cấp đủ.
- Auth user ID là khóa ownership cho notes/progress/events/unlocks/inventory/city.
- Unique event(user,eventKey), unique unlock(user,rewardId), city revision CAS.
- MongoDB cần replica set và transaction note+ledger+rewards; xác nhận hosting hỗ trợ
  trước khi chọn giữ MongoDB hay migration PostgreSQL.
- Catalog ID/footprint phải thống nhất với catalog Godot; server là nguồn xác thực cuối.
- Grid bounds, blocked tiles, rotation, inventory count và chính sách thu hồi cần ticket C01.

## Ma trận test blueprint

24 case AUTH-01..04, NOTE-01..05, XP-01..05, RWD-01..02, CITY-01..05,
E2E-01, DEP-01..02 được phân vào các ticket ở trên. Trạng thái ban đầu: **chưa xác nhận**.
Test mới trong batch chỉ chứng minh validation/error handling và kiến thức local;
không thay thế các case auth, transaction, cross-device và staging.
