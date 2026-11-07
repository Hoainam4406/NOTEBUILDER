# Knowledge City: kế hoạch triển khai

Nguồn: Knowledge_City_Product_Blueprint_14_Muc.md, phiên bản 1.0.
Blueprint là định hướng sản phẩm. Tài liệu này phân biệt hành vi hiện tại,
quyết định triển khai và công việc chưa hoàn thành.

## Hiện trạng và ranh giới

- NOTEBUILDER: Express 5, Mongoose/MongoDB, giao diện HTML/JS và Fabric canvas.
- isometric_building_game: Godot 4.7.2, catalog/placement/collision, ghi chú gắn với công trình.
- Đã có auth/session/profile, owner isolation và revision CAS ở tầng code/HTTP tests.
  N02 đã kiểm chứng auth/owner/CAS trên MongoDB thật giữa hai API processes.
- X01 đã có ledger/progress/rewards/inventory atomic và dashboard/export đọc
  backend; xem PROGRESSION_SPEC.md. C01 City API đã có backend tests;
  C02a preview và C02b authenticated city đã chạy thật; C02c local Chromium đạt.
- Game local vẫn unlock theo số kiến thức đang tồn tại; chưa đồng bộ entitlement.
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
| A01 | Đăng ký/login/logout, session và profile | F02 | Code + HTTP tests đạt; cần gate MongoDB thật |
| N01 | Owner isolation, note version, search, migration | A01 | Code + HTTP/VM tests đạt; legacy import tắt, note chung không tự gán |
| X01 | XP ledger, level và rewards atomic | N01 | X01a/b/c code + unit/DB concurrency/rollback đạt; E2E browser còn chờ city |
| C01 | City API, inventory và version | X01 | C01a/b/c local đạt: catalog/native contract, place/move/remove, owner/CAS/rollback/restart; chờ browser C02 |
| C02a | Godot Web export và trang game nhúng tương tác | Game main | Local đạt: WASM/WebGL, camera/zoom/place/move/delete, loader/retry/fullscreen; CI remote chưa xác nhận |
| C02b | Bridge tài khoản và lưu/tải city qua API | C01 + C02a | Local đạt: city.html, renderer riêng, auth/CAS/idempotency, 6 native suites, 2 exports pin f1739c7 |
| C02c | Browser E2E vòng lặp đầy đủ | C02b | Local Chromium đạt: account→note→XP→build→reload/login lại; 503/retry, ô cấm, hai tab, expiry/refund. CI browser/staging chưa có |
| L01 | Review, flashcards, onboarding | C02 | Local đạt 2026-11-07: REVIEW_SPEC.md, snapshot/session ID, CAS/receipts, resume/retry, keyboard/mobile và onboarding; chưa staging |
| Q01 | Achievement, quest và QOL | L01 | Progress bền vững, không cấp thưởng trùng |
| O01 | Staging, backup/restore, rollback, monitoring | C02 | DEP-01..02 và release checklist |
| AI01 | AI có quota và kiểm soát đầu ra | O01 | V2; không là điều kiện MVP |

Mỗi task phải test/review, commit Conventional Commits và push websiteWorkandTest.
Không đánh dấu staging/UAT hoặc test DB concurrency đạt khi mới chạy unit test.

## C02 — game Godot chạy trong website

`GodotBridge` vẫn là data export. C02a đã có Web preset/custom shell, staging
builder và `/game.html` iframe preview; xem `WEB_GAME.md` để build/host.
C02b/c đã có evidence local ở TESTING.md; preview vẫn là sandbox riêng.
C02a/b/c là phần tách chi tiết của C02 cũ; L01 đã local đạt, tiếp theo Q01;
chưa là staging/UAT. Q01 cần acceptance/spec trước code, không tự thêm phần
thưởng review hoặc đổi XP policy v1.

- **C02a — chơi thử trên web:** cấu hình Web export Godot 4.7.2; xác minh export
  templates, cấu hình threaded/non-threaded và yêu cầu hosting/header/MIME thực tế.
  Build artifact do pipeline/deployment quản lý, không commit build vào source.
  Có trang/đường dẫn vào game từ website, canvas hoặc iframe, loading/error/retry,
  resize/focus và hướng dẫn điều khiển. Acceptance: mở từ web, di chuyển camera,
  chọn/đặt/di chuyển/xóa công trình bằng input thật; kiểm tra trên browser mục tiêu.
  Có thể triển khai preview trước C01; ghi rõ preview/local, chưa đồng bộ tài khoản.
- **C02b — tích hợp dữ liệu:** chọn và đặc tả bridge async, lifecycle và xử lý lỗi;
  nếu dùng message giữa frames phải xác thực origin/message schema. Đọc progress,
  inventory/catalog và city của user hiện tại; mọi mutation qua API có auth,
  validation/revision; retry không nhân thưởng hoặc tiêu inventory hai lần.
  Không dùng client XP hay local/debug unlock làm entitlement server.
- **C02c — xác nhận sản phẩm:** browser E2E đăng ký/đăng nhập → note hợp lệ → XP →
  mở game → xây → reload/đăng nhập lại thấy đúng city; thử placement sai, save lỗi,
  session hết hạn và hai tab ghi đồng thời. Lưu evidence browser và smoke hosting.

Handoff vận hành: đọc `AGENTS.md` và `AI_HANDOFF.md` ở root trước mỗi session.

## Specification của batch nền tảng

Batch identity/notes bổ sung và thay thế hành vi anonymous/migration bên dưới:
xem [AUTH_NOTES_SPEC.md](AUTH_NOTES_SPEC.md). PUT/PATCH/DELETE cần revision,
mọi note/export cần session, migration cũ trả 410.

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

## Quyết định X01 đã chốt / C01 còn phải chốt

- X01 policy v1: +20 với content >=80 Unicode code points chuẩn hóa, một lần/note;
  fingerprint cùng user để chặn trùng nội dung; cap 200 XP/ngày theo UTC.
- Save/edit/delete không tự thưởng/thu hồi XP ở MVP; review có event ID riêng.
- XP_next(L)=100+25*(L-1), milestone cấp qua nhiều level phải được cấp đủ.
- Auth user ID là khóa ownership cho notes/progress/events/unlocks/inventory/city.
- Unique event(user,eventKey), unique unlock(user,rewardId), city revision CAS.
- Đã giữ MongoDB và bắt buộc replica set/transaction, có real-DB tests và startup
  gate. Hosting staging/production phải hỗ trợ cấu hình này trước khi deploy.
- Catalog ID/footprint phải thống nhất với catalog Godot; server là nguồn xác thực cuối.
- Grid bounds, blocked tiles, rotation, inventory count và chính sách thu hồi cần ticket C01.

## Ma trận test blueprint

24 case AUTH-01..04, NOTE-01..05, XP-01..05, RWD-01..02, CITY-01..05,
E2E-01, DEP-01..02 được phân vào các ticket ở trên. Trạng thái ban đầu: **chưa xác nhận**.
Test mới trong batch chỉ chứng minh validation/error handling và kiến thức local;
không thay thế các case auth, transaction, cross-device và staging.
