# Active Development State — Knowledge City

Cập nhật 2026-11-07. Đọc cùng AGENTS.md; đối chiếu Git/source trước khi sửa.

## Checkpoint hiện tại

- Q01b.1 checkpoint nhỏ theo ngân sách user: Ctrl/Cmd+S lưu editor active và
  single-flight guard cho mọi submit. Spec `docs/EDITOR_SHORTCUT_SPEC.md`;
  VM/local checks đạt, browser/OS shortcut smoke chưa chạy. Baseline sạch `026cf70`.
  Autosave/khôi phục nháp chưa triển khai; không mở thêm task trong lượt này.
- User đã yêu cầu tiếp tục sau audit blueprint. Baseline Q01a web sạch `cf8bfdc`;
  blueprint user commit `95db3fa`, audit `docs/BLUEPRINT_ALIGNMENT.md` vẫn giữ
  scope một concept city/assets. Không làm lại auth/notes/XP/city đã có evidence.
- L01 đã triển khai và verified local: flashcards từ title/content, phiên owner
  snapshot, resume/retry/CAS, tổng kết/history và onboarding trong kho ghi chú.
  Spec/acceptance: `docs/REVIEW_SPEC.md`; evidence: `docs/TESTING.md`.
- Q01a đã có 5 thành tựu/2 UTC daily quests, claims bền vững và UI journey;
  desktop local verified, mobile pending (tool resize không đổi viewport thật).
  `docs/JOURNEY_SPEC.md` chốt scope; Q01b autosave/khôi phục nháp còn chưa làm.
- User chốt 100% là bản localhost đầy đủ logic/backend/UI tương tác, chưa tính
  thẩm mỹ/deploy. Ước lượng trước Q01a ~80%, sau ~84% (±5%, không metric đo):
  `docs/LOCAL_PROGRESS.md`. Không đồng nhất với staging/production readiness.
- C02b/c vẫn local verified, chưa staging/UAT hoặc browser CI tự động.
  `/city.html` lưu account; `/game.html` sandbox RAM riêng. Không sửa game repo
  trong checkpoint L01; pin web giữ full hash `f1739c7` ở `server/game-source.json`.
- Hash checkpoint lấy bằng `git log -1 --oneline -- AI_HANDOFF.md`. Xác minh push
  bằng HEAD/ls-remote, không suy ra push thành công từ snapshot tài liệu này.

## Quyết định có hiệu lực

- HTML/JS/Fabric + Express/Mongoose modular monolith, Node 24.14.0; MongoDB
  replica set/sharded bắt buộc transaction. Không tự đổi stack/UI hàng loạt.
- Cookie HttpOnly/SameSite Strict, CSRF, shared DB rate limit; dữ liệu theo owner.
  Notes create idempotent, update/delete CAS. Legacy unowned ẩn, không tự import/
  gán owner. Lưu lỗi giữ draft; không giả thành công hoặc fallback shared storage.
- XP v1: +20 cho content chuẩn hóa >=80 Unicode code points, fingerprint/user
  vĩnh viễn, cap 200/ngày UTC; edit/delete không đổi XP. Note/ledger/rewards/
  inventory atomic. Dashboard/export online đọc server, export cùng DB snapshot.
- Review tự đánh giá `again`/`remembered`, không chấm đúng/sai hoặc cấp XP/reward.
  Chọn 1..20 notes có content, một active/user. Start snapshot transaction;
  answer/close dùng atomic CAS + receipts. Replay trả state hiện tại.
  Active giữ text kể cả note gốc bị sửa/xóa; complete/close xóa snapshot text.
- Journey progress từ awarded XpEvent/ReviewSession metadata/City revision,
  không từ counters client. Claim transaction + unique(owner,kind,period,entryId),
  PUT resource idempotent; quest day UTC server, stale day không tự claim hôm mới.
  Phần thưởng là badge/xác nhận, không đổi XP/inventory. Không phạt ngày nghỉ.
- Review/bridge: owner check trước write/retry, timeout 20s/abort; uncertain write
  chỉ retry key/body cũ. Conflict không tự gửi lại lựa chọn; expiry/account switch
  xóa private state/khóa. Không localStorage cho nội dung phiên/receipts/auth.
- City v1: 4 reward IDs, axial 32x32, rotation 0, 4 blocked cells, tối đa 256
  instances. Native cell `(floor((x-y)/2),x+y)` rồi map_to_local; polygon/SAT.
  Inventory.quantity là lượng chưa đặt: place -1, move 0, remove +1; layout/
  inventory/receipt transaction. Replay không hồi sinh building cũ.
- Parent bridge kiểm tra origin/source/schema/requestId; không truyền credentials
  qua URL/message. Renderer chỉ áp server snapshot; giữ ghost/original khi lỗi.
  Hai Web exports single-thread/WebGL2, chỉ staging city đổi main_scene/tắt debug
  unlock-all; native World/preview giữ local progression. Không sửa game đang mở
  để export, không commit WASM/PCK/cache hoặc đổi pin chưa kiểm chứng.
- Specs: docs/AUTH_NOTES_SPEC.md, PROGRESSION_SPEC.md, CITY_SPEC.md,
  GAME_BRIDGE_SPEC.md, REVIEW_SPEC.md, JOURNEY_SPEC.md. Build/host: docs/WEB_GAME.md.

## Task state

| Task | Evidence / trạng thái |
|---|---|
| Foundation/A01/N01/N02 | Auth/owner/CAS; multi-process MongoDB/restart/rollback đạt |
| X01a/b/c | Policy/transaction XP/rewards/dashboard/export server đã có |
| C01a/b/c | Catalog/native contract/place/move/remove/refund/CAS/idempotency; 34 DB cases baseline đạt |
| C02a | Preview WASM chơi thật; không lưu account |
| C02b/c | Auth city/renderer, 6 native suites, hai exports pin f1739c7, core loop/faults local Chromium đạt |
| L01 | Implemented/local verified: spec, backend, UI, onboarding, 104 regression/46 DB tổng suite, browser; chưa staging-accepted |
| Q01a | Implemented/desktop local verified: achievements/UTC quests/claims, 113 regression/53 DB tổng suite; mobile/Accepted pending |
| Q01b | Q01b.1 shortcut/single-flight đạt VM; autosave/khôi phục nháp và QA QOL còn pending |
| O01 | Chưa làm: staging, backup/restore, rollback, monitoring |
| AI01 | V2 sau O01, không là điều kiện MVP |

## Files của checkpoint Q01a

- `server/journey.js`, `models/JourneyClaim.js`: evidence snapshot/read-only GET,
  strict input, owner/UTC/eligibility, transaction claim/replay. `app.js` thêm auth/
  CSRF endpoints. ReviewSession thêm index user/cards.reviewedAt cho daily query.
- `journey.html`, `css/journey.css`, `js/journey.js`: progress/claim/UTC, immutable
  retry, expiry, keyboard focus. Links ở notes/home/review; không sửa gameplay.
- Tests journey-client/journey-rules/integration/journey, game-http; fixture thêm
  fault PUT journey + snapshot metadata. Không có fault controls trong app thật.
- Docs/JOURNEY_SPEC.md, LOCAL_PROGRESS.md và docs/instructions/handoff cập nhật;
  blueprint nguyên bản, XP policy và game pin giữ nguyên.

## Verification và giới hạn

- Q01b.1: Node 24.14.0 syntax + 115 regression/53 DB đạt, diff check đạt;
  thêm 2 VM cases shortcut scope/repeat và concurrent save/failure/identical retry.
  Chỉ notes.js, tooltip/aria shortcut nút lưu, client tests và docs đổi; không DB/
  game/XP/storage changes. Chưa browser/OS shortcut smoke; xem TESTING.md.
- Node 24.14.0 từ npm cache, không đổi Node hệ thống; dependencies theo lockfile,
  không thêm package. Syntax + 113 regression + 53 MongoDB 8.2.6 integration đạt;
  sau client focus fix chạy lại 113 regression/diff check đạt.
- 7 DB cases Q01a mới: auth/CSRF/owner, strict input, ledger/rating/city evidence,
  two-process claims một record/timestamp, no XP/rewards, restart/UTC/rollback.
- Chromium desktop fixture: register/note → badge/quest eligible → lost-response
  sau commit → peer tab replay + retry → reload đúng claim. 3 rating UI (gồm again)
  → review quest + first_review. Cuối: 4 claims, XP20/inventory1 không đổi.
- 503 qua Enter đưa focus tới retry; retry Enter đạt. Expiry xóa private progress;
  normal console sau reload không warn/error. Ảnh `.artifacts/journey-desktop.png`,
  journey-retry.png, journey-expiry.png ignored. Fixture teardown exit 0.
- Mobile journey pending: tool resize báo thành công nhưng DOM vẫn 1280px,
  không coi ảnh tên journey-mobile.png là evidence mobile. CSS responsive có,
  cần kiểm chứng Q01b; desktop local verified chưa Accepted toàn phần.
- L01 browser/restart/CAS/cleanup evidence giữ ở docs/TESTING.md; không làm lại.
- Game 6 native suites/hai exports/Chromium city core loop là evidence C02 trước;
  không chạy lại hoặc khẳng định kiểm chứng mới game trong task L01.
- Pending: CI remote Linux/browser CI, Safari/mobile thật, cross-device, staging/
  UAT/production, TTL cleanup vật lý/failover/network partition, backup/restore.
  DoD blueprint 9.5 chưa Accepted toàn phần. Autosave, accessibility/responsive
  toàn ứng dụng và đo tác động giáo dục vẫn cần theo dõi; L01 chỉ kiểm tra review.

## Git / môi trường

- Web `D:/NOTEBUILDER`, websiteWorkandTest, origin
  https://github.com/Hoainam4406/NOTEBUILDER.git.
- Game `D:/isometric-grid-building-game/isometric_building_game`, main, origin
  https://github.com/SubNhatSan/isometric_building_game.git. Pin `f1739c7` đã push
  ở checkpoint trước, parent `16721be`; user commit `c39347f` không bị ghi đè.
- App MongoDB local từng báo standalone/khởi động không được. Task này không đổi
  service/cấu hình/.env hoặc dữ liệu ứng dụng. Test dùng replica set riêng tự tạo;
  local test đạt không chứng minh `npm run dev` đã chạy trên DB ứng dụng.
- Không tái tạo dirty worktree/đường dẫn E: cũ bằng reset/restore. Không sửa cache/
  ACL/editor game khi chưa có evidence lỗi mới. GCM hiện có dùng commit/push đúng
  branch; lỗi auth báo một lần, không lặp đăng nhập.

## Tiếp quản tiếp theo

1. Đối chiếu Git/source; đọc blueprint/alignment/plan và LOCAL_PROGRESS.md.
   Tiếp theo Q01b: spec autosave/khôi phục nháp account/CAS/canvas/retry trước code,
   kiểm chứng mobile journey và audit UI toàn app. Không tự thêm review/quest XP,
   scheduler, AI hoặc Subject District/multi-theme; L01/Q01a không triển khai lại.
2. Vận hành O01 còn độc lập: cần replica set/HTTPS, staging, backup/restore và
   rollback/monitoring trước release. Không gọi local verified là staging accepted.
3. Browser regression dùng fixture riêng không .env/seed; xem docs/TESTING.md.
   Không đưa fault controls vào app hoặc chạy destructive test trên DB người dùng.
4. Sau task cập nhật handoff, checks/review, Conventional Commit và tự push đúng
   repo/branch; xác minh đích trước mỗi commit/push.
