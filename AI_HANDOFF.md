# Active Development State — Knowledge City

Cập nhật 2026-11-07. Đọc cùng AGENTS.md; đối chiếu Git/source trước khi sửa.

## Checkpoint hiện tại

- User đã yêu cầu tiếp tục sau audit blueprint. Baseline web sạch `1349478`;
  blueprint user commit `95db3fa`, audit `docs/BLUEPRINT_ALIGNMENT.md` vẫn giữ
  scope một concept city/assets. Không làm lại auth/notes/XP/city đã có evidence.
- L01 đã triển khai và verified local: flashcards từ title/content, phiên owner
  snapshot, resume/retry/CAS, tổng kết/history và onboarding trong kho ghi chú.
  Spec/acceptance: `docs/REVIEW_SPEC.md`; evidence: `docs/TESTING.md`.
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
  GAME_BRIDGE_SPEC.md, REVIEW_SPEC.md. Build/host: docs/WEB_GAME.md.

## Task state

| Task | Evidence / trạng thái |
|---|---|
| Foundation/A01/N01/N02 | Auth/owner/CAS; multi-process MongoDB/restart/rollback đạt |
| X01a/b/c | Policy/transaction XP/rewards/dashboard/export server đã có |
| C01a/b/c | Catalog/native contract/place/move/remove/refund/CAS/idempotency; 34 DB cases baseline đạt |
| C02a | Preview WASM chơi thật; không lưu account |
| C02b/c | Auth city/renderer, 6 native suites, hai exports pin f1739c7, core loop/faults local Chromium đạt |
| L01 | Implemented/local verified: spec, backend, UI, onboarding, 104 regression/46 DB tổng suite, browser; chưa staging-accepted |
| Q01 | Chưa làm: achievements/quests/QOL; ưu tiên feature tiếp theo, cần spec/acceptance trước code |
| O01 | Chưa làm: staging, backup/restore, rollback, monitoring |
| AI01 | V2 sau O01, không là điều kiện MVP |

## Files của checkpoint L01

- `server/reviews.js`, `models/ReviewSession.js`: owner selection/snapshots,
  indexes one-active/create-key, CAS/receipts, replay, cleanup, controlled errors.
  `server/app.js` mount auth/CSRF API; startup gate tự init model indexes.
- `notegame-web/review.html`, `css/review.css`, `js/review.js`: chọn/resume/flip/
  rating, retry/conflict/expiry, progress/history. Reveal toggle giữ keyboard focus;
  selection checkbox được clear sau start. Render textContent, không note HTML.
- `notes.html`/`css/notes.css`: hướng dẫn bốn bước không chặn editor; links review
  thêm ở home/notes/city. Không đổi toàn bộ UI hoặc gameplay/assets.
- Tests mới review-rules/review-client/integration/reviews; game-http kiểm tra
  semantic page/onboarding. Fixture browser-server thêm fault review + serialized
  stdin queue để inspections không đua với teardown. Faults không vào app thật.
- Docs/spec/instructions/plan/README cập nhật; product blueprint nguyên bản giữ nguyên.

## Verification và giới hạn

- Node 24.14.0 từ npm cache, không đổi Node hệ thống; dependencies theo lockfile,
  không thêm package. Syntax + 104 regression + 46 MongoDB 8.2.6 integration đạt;
  sau client/fault-helper fixes chạy lại syntax/104 regression và diff check đạt.
- 12 DB cases L01 mới kiểm tra owner/CSRF, bounds/snapshot, two-process races,
  identical replay/key conflicts, CAS, restart/corrupt/rollback, no XP mutation.
- Chromium local fixture riêng: empty → onboarding → hai note (40 XP/1 starter)
  → flip/grade → lost-response sau commit → retry → reload/resume → complete.
  Completed rev2/index2/2 receipts, text stripped, XP40/inventory1 không đổi.
- Hai tab stale conflict không auto-grade; expiry xóa private state; login lại
  resume đúng thẻ; early-close 1/2 rev2/2 receipts/text stripped. Keyboard Enter/
  Tab đạt; review responsive 390x844 không overflow; normal console không lỗi.
  Screenshots ignored `.artifacts/review-*.png`; fixture đã dừng. Chạy pipe ba
  commands snapshot/snapshot/stop sau sửa queue teardown đạt exit 0.
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

1. Đối chiếu Git/source; đọc blueprint/alignment/plan. Q01 cần spec acceptance
   achievement/quest/QOL bền vững trước code; không tự thêm review XP, scheduler,
   AI hoặc Subject District/multi-theme. L01 đã có evidence, không triển khai lại.
2. Vận hành O01 còn độc lập: cần replica set/HTTPS, staging, backup/restore và
   rollback/monitoring trước release. Không gọi local verified là staging accepted.
3. Browser regression dùng fixture riêng không .env/seed; xem docs/TESTING.md.
   Không đưa fault controls vào app hoặc chạy destructive test trên DB người dùng.
4. Sau task cập nhật handoff, checks/review, Conventional Commit và tự push đúng
   repo/branch; xác minh đích trước mỗi commit/push.
