# Active Development State — Knowledge City

Cập nhật 2026-11-07. Đọc cùng AGENTS.md; đối chiếu Git/source trước sửa.

## Checkpoint hiện tại

- Q01 đã commit/push `2ffc07c` (127 regression/58 DB). Game main f1739c7 sạch,
  chỉ read Git, không sửa trong lượt này.
- Bắt đầu nghiệm thu localhost: `npm run check:local` mới đạt exit0 với .env ứng
  dụng thật. MongoDB transaction-capable/primary; startup/index gate, sáu pages/
  health, năm anonymous API guards, hai game pins/checksums/MIME đều đạt. Không
  seed/domain writes. Xem LOCAL_ACCEPTANCE.md/TESTING.md; ước lượng mới90% ±5%.
- User yêu cầu làm nốt Q01. Baseline web sạch `80a159c`; đã hoàn tất Q01 trong
  scope specs ở mức implemented/local verified, chưa staging-accepted.
- Q01a: 5 achievements/2 UTC daily quests, server evidence + unique claims, không
  thêm XP/inventory. Q01b.1 Ctrl/Cmd+S/single-flight. Q01b.2 server autosave drafts,
  restore canvas, durable pending publish/retry qua reload, editor QOL/responsive.
- Spec mới `docs/DRAFT_SPEC.md`; evidence `docs/TESTING.md`. Không coi mọi ý tưởng
  nice-to-have blueprint là yêu cầu Q01; không mở themes/Subject District/AI.
- Mốc 100% user: localhost đủ chức năng/backend/UI tương tác, chưa tính polish
  thẩm mỹ/deploy. Ước lượng ~89% ±5% sau Q01, không phải metric đo hay thời gian
  còn lại; xem `docs/LOCAL_PROGRESS.md`. Nghiệm thu localhost cuối vẫn pending.
- L01 và C02b/c local verified đã có evidence, không làm lại. `/city.html` lưu
  account, `/game.html` sandbox. Game pin full hash `f1739c7` giữ nguyên; task Q01
  không sửa game repo/build. Hash checkpoint: `git log -1 --oneline -- AI_HANDOFF.md`.

## Quyết định / bất biến

- HTML/JS/Fabric + Express/Mongoose modular monolith, Node24.14.0; replica set/
  sharded để transaction. Giữ stack. Auth cookie/CSRF/owner/CAS như AGENTS.md.
- XP v1 +20/content chuẩn hóa>=80 codepoints, fingerprint/user vĩnh viễn,
  cap200/ngày UTC; edit/delete/review/quest không cấp thêm XP. Note/ledger/
  rewards/inventory atomic. Server là nguồn XP; không tự gán notes legacy.
- Draft autosave riêng server owner, UUID/editor, CAS + lastHash replay, <=12MiB.
  Không lưu online drafts vào localStorage, không tự import/publish. Chỉ bấm Lưu
  mới gọi Notes API; lưu pending request vào draft/ACK trước Notes API.
- Pending POST giữ key/payload qua reload. Pending PUT giữ revision/payload;
  409 chỉ xác nhận khi GET revision+1 và payload đúng. Conflict khác giữ nháp,
  không đổi baseRevision hoặc tự overwrite. Typing during save giữ editor.
- Draft timeout20s/abort/owner check, immutable uncertain CAS retry, pagehide
  bỏ late callbacks. Chưa ACK khi mất mạng chỉ còn RAM: không bảo đảm reload.
  Close flush nháp trước; fail không đóng. Account switch/expiry xóa private UI.
  File-mode vẫn prototype. Nháp không TTL/xóa tự động; xóa chủ động qua CAS.
- Review owner snapshots 1..20, một active/user, CAS/receipts; complete/close
  xóa snapshot text. Tự đánh giá không chấm đúng/sai hay cấp thưởng.
- City v1 4 reward IDs, axial32x32/4 blocked/rotation0/max256; native conversion
  `(floor((x-y)/2),x+y)` rồi map_to_local, polygon/SAT. Inventory chưa đặt:
  place-1/move0/remove+1, layout/inventory/receipt transaction; replay state mới.
- Bridge origin/source/schema/requestId, không credentials qua URL/message;
  parent giữ revision/key/body, renderer chỉ áp server state; expiry/dispose khóa.
- Specs trong docs: AUTH_NOTES_SPEC, PROGRESSION_SPEC, CITY_SPEC, GAME_BRIDGE_SPEC,
  REVIEW_SPEC, JOURNEY_SPEC, EDITOR_SHORTCUT_SPEC, DRAFT_SPEC. Build: WEB_GAME.md.

## Task state

| Task | Trạng thái |
|---|---|
| Foundation/A01/N01/N02 | Local verified auth/owner/CAS/DB races/restart/rollback |
| X01/C01 | XP/rewards/inventory/City API local verified |
| C02a/b/c | Web export thật/account city/core loop + faults local Chromium đạt; game6 suites baseline |
| L01 | Review/flashcards/onboarding local verified |
| Q01a/b | Local verified scope specs; 127 regression/58 DB, browser drafts/replay/conflict/expiry/390px |
| Nghiệm thu localhost cuối | DB ứng dụng/startup/artifact smoke đạt; authenticated full run/restart/QA tổng thể pending |
| O01 | Staging/backup-restore/rollback/monitoring pending; deploy sau theo user |
| AI01 | V2 sau O01; không gate MVP |

## Files / evidence checkpoint Q01b.2

- `server/drafts.js`, `models/NoteDraft.js`, `app.js`: auth/CSRF API list/get/PUT/
  DELETE, raw fields/canvas/pending validation, indexes/owner/CAS/replay.
- `js/editor-drafts.js`, `js/notes.js`: debounce/restore/frozen publish, owner/abort,
  note revision confirmation, no lost edits, close flush; status và focus/dialog.
- notes.html/css, game.css: account draft list, dialog inactive inert, Tab/Escape,
  nav wrap/editor canvas scroll, touch-targets; package check thêm module draft.
- Node24.14.0 syntax +127 regression +58 MongoDB8.2.6 integration đạt. 11 VM draft
  +1 static HTTP mới, 5 DB mới. Sau client response validation chạy lại syntax/
  regression đạt; backend unchanged sau full DB suite. Diff check đạt.
- Chromium fixture riêng: text +Sticky Vàng autosave→reload→restore; trước
  publish0 notes/events. Ctrl+S POST lost-response→reload/retry:1 note/event.
  PUT lost-response→reload/retry xác nhận đúng revision/payload, dọn draft.
  Cuối XP20/inventory1 vẫn nguyên. Tab A draft rev2; tab B409 giữ title riêng,
  không overwrite. Expire session→retry xóa fields/canvas/list riêng.
- 390x844 thực: dùng CUA `agent.browsers.get('2')` viewport capability. Notes
  scroll375/editor một cột270px, footer318px; journey một cột346.667px, claim đạt.
  Wrapper browser cũ set không tác động; không lặp kết luận mobile chưa test.
  Screenshot narrow dùng fullPage:false; fullPage hẹp tool lỗi capture.
- Ảnh ignored `.artifacts/draft-restored.png`, draft-conflict.png, draft-expiry.png,
  journey-mobile-verified.png. Tabs/viewport/fixture DB đã dọn, server exit0.
- Chưa mobile/Safari thật/macOS Cmd+S, browser CI/CI remote, cross-device,
  staging/UAT, load/performance/failover/backup/restore. Q01 local chưa Accepted
  theo staging DoD9.5; QA toàn sản phẩm cuối không suy ra từ Q01 tests.

## Git / môi trường

- Web `D:/NOTEBUILDER`, websiteWorkandTest, origin
  https://github.com/Hoainam4406/NOTEBUILDER.git. Xác minh root/branch/remote/status
  trước mỗi commit/push, Conventional Commit rồi tự push; không force/reset/restore.
- Game `D:/isometric-grid-building-game/isometric_building_game`, main, origin
  https://github.com/SubNhatSan/isometric_building_game.git; f1739c7/16721be đã push
  từ checkpoint C02; user c39347f không bị ghi đè. Không sửa repo game trong Q01.
- App MongoDB từng standalone/startup lỗi; hiện transactions/primary và startup
  thật đạt qua check:local. Không đổi service/.env/domain data. Không đồng nhất
  smoke startup với dev watcher/authenticated browser nghiệm thu.
- Không tái tạo worktree/đường dẫn E:/ACL/cache cũ. GCM dùng account hiện hữu;
  auth lỗi báo một lần, không lặp đăng nhập. Không commit env/dependencies/artifacts.

## Tiếp theo

1. Nghiệm thu localhost cuối theo LOCAL_PROGRESS.md/LOCAL_ACCEPTANCE.md: cấu hình
   MongoDB/startup/artifacts smoke đã đạt, tiếp theo core loop đầy đủ/restart/failure.
   Giữ dữ liệu hiện hữu; không tự seed hoặc destructive test lên DB người dùng.
2. Không triển khai lại Q01/L01; nếu gặp lỗi mới tạo task nhỏ/repro/test trước sửa.
3. O01/deploy giai đoạn sau; staging/production gate vẫn nguyên. Không tự mở
   multi-theme/Subject District/AI hoặc đổi XP balance.
4. Sau checkpoint cập nhật handoff/test evidence, check/diff review, commit/push
   đúng repo/branch. Push status kiểm tra HEAD/remote, không suy ra từ tài liệu này.
