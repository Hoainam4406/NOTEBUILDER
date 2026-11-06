# X01 — XP, level và rewards MVP / policy v1

Quyết định triển khai từ blueprint v1.0; balance này versioned để playtest và
điều chỉnh có migration, không tự đổi phần thưởng đã cấp.

## Các task theo phụ thuộc

- X01a (sau N02): policy thuần + unit tests cho eligibility, fingerprint,
  daily cap, level và mọi mốc đi qua. Không có thay đổi XP cho người dùng ở task này.
- X01b: note creation idempotent + ledger/progress/rewards/inventory trong một
  MongoDB transaction; API progress/rewards và real-DB concurrency/rollback tests.
- X01c: UI/JSON export dùng progress backend, bỏ XP demo online; regression UI.
- Sau đó C01: catalog/footprint/inventory/city revision; C02: Godot bridge.

X01c: dashboard GET progress/rewards; khi lỗi hiển thị tiến trình chưa xác nhận,
không dùng số note thay thế. Godot export online đọc notes/progress/rewards trong
cùng transaction snapshot. `GodotBridge.getKnowledgeData()` / `exportJSONFile()`
trả Promise; caller phải await và xử lý lỗi. File-mode giữ prototype riêng.

## XP policy v1

- Title-only/canvas-only vẫn lưu note; nhận 0 XP. Nội dung plain text sau NFKC,
  trim, gộp whitespace cần ít nhất 80 Unicode code points để nhận +20 XP.
  Đây là heuristic chống nháp rỗng, không phải thước đo chất lượng học tập.
- SHA-256 của nội dung chuẩn hóa/lowercase là fingerprint; mỗi user chỉ nhận
  XP tạo note cho fingerprint đó một lần suốt đời, kể cả note gốc bị xóa.
- Tối đa 200 XP/ngày UTC từ tạo note. Event tạo note đủ dài nhưng gặp trùng/cap
  có amount 0, vẫn lưu decision. Fingerprint được giữ vĩnh viễn; không được
  chờ qua ngày rồi retry cùng nội dung để nhận thưởng.
- Sửa/lưu lại/xóa không cộng hoặc trừ XP. Note legacy không backfill XP.
- XP không nhận từ body client. Ledger chỉ ghi từ note creation service;
  không có public endpoint cấp XP. Review/quest chưa triển khai.

## Idempotent create contract

- POST `/api/notes` cần `Idempotency-Key` gồm 16..128 ký tự `[A-Za-z0-9_-]`.
  Client tạo key mới khi bắt đầu note; giữ key và payload cho retry khi mất phản hồi.
- Unique `(userId,eventKey)`, eventKey = `note:create:<key>`, không TTL.
- Cùng key + cùng payload validated: trả cùng note ID, 200 replay (201 lần đầu),
  không tạo thêm note/XP/reward. So sánh cả canvas/template/tags qua canonical hash.
- Cùng key khác payload: 409 IDEMPOTENCY_CONFLICT. Sau khi xóa note cũ, retry key
  đó trả 410 NOTE_DELETED; không hồi sinh note, không tái cấp XP.
- Sau create timeout, UI cần retry nguyên payload hoặc lưu bản sao với key mới;
  không tự sửa request cũ rồi gửi lại cùng key.

## Level / rewards

- Progress lưu totalXp và revision; level luôn derive từ totalXp trên server.
- Cấp đầu là 1. XP để lên từ L: `100 + 25*(L-1)`;
  tổng XP đạt L: `100*(L-1) + 25*(L-1)*(L-2)/2`.
- Response: `{totalXp,level,xpInLevel,xpToNextLevel,nextLevelTotalXp,revision}`.
- Mỗi reward policy v1 cấp một catalog item, quantity 1, một lần/user:
  level 1 `starter_apartment` → `bld_apartments_brickbrown_a`,
  level 2 `first_house` → `bld_house_small_brickred_a`,
  level 3 `pine_tree` → `prop_tree_pine_small`,
  level 5 `learning_cafe` → `bld_cafe_a`.
- Tất cả reward <= level hiện tại đều được kiểm tra/cấp trong transaction,
  kể cả vượt nhiều cấp hoặc khởi tạo progress lần đầu. Catalog IDs đối chiếu
  catalog Godot; chưa cấp quyền placement trước C01. Không khóa notes/search.
- Unique unlock `(userId,rewardId)`; inventory `(userId,catalogId)` quantity tăng
  đúng một lần khi reward được cấp. Xóa note không thu hồi unlock/inventory.

## Physical schema / transaction

- `progress`: userId unique, totalXp nonnegative safe integer, revision.
- `xp_events`: userId, eventKey, payloadHash, noteId, policyVersion, amount,
  reason (`awarded`, `draft`, `duplicate_content`, `daily_cap`), fingerprint,
  day UTC, createdAt; unique `(userId,eventKey)`.
- `xp_fingerprints`: unique `(userId,fingerprint)` giữ claim cho nội dung đủ dài.
- `unlocks`: userId, rewardId, catalogId, level, grantedAt; compound unique.
- `inventory`: userId, catalogId, quantity; compound unique. City sau này tiêu
  thụ inventory trong transaction khác; chưa có thao tác client thay quantity.
- Một transaction serialize theo progress user: cập nhật revision trước decision;
  note + ledger + fingerprint + totalXp + mọi unlock/inventory cùng commit/rollback.
  Daily cap tính sum ledger trong ngày bên trong transaction đã serialize.
- Driver retry transient transactions; unique-key races retry cả transaction
  có giới hạn. Request key cố định qua retry. Không retry lỗi validation/contract.
- Startup tạo indexes và kiểm tra replica set/sharded deployment; standalone
  trả lỗi khởi động rõ ràng thay vì nhận write có thể nửa chừng. Đọc progress/rewards
  yêu cầu auth, không đọc dữ liệu user khác; error 503 TRANSACTIONS_REQUIRED.

## Acceptance

XP-01..05, RWD-01..02: đúng một reward ledger cho note request retry; concurrent
same key/content; daily cap qua hai API processes; multi-level không bỏ mốc;
failure injection sau inventory rollback toàn bộ; edit/delete giữ nguyên XP;
account isolation, restart persistence. Unit test không thay thế real DB evidence.
