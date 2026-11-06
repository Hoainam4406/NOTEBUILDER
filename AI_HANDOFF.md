# Active Development State — Knowledge City

Cập nhật 2026-11-06. Đọc cùng AGENTS.md; đối chiếu Git/source trước khi sửa.

## Checkpoint hiện tại

- User yêu cầu tạm dừng feature để audit blueprint; không tự tiếp tục L01.
  Đã đọc đủ 14 mục trong `docs/Knowledge_City_Product_Blueprint_14_Muc.md`
  (user commit `95db3fa`). Kết luận/đối chiếu từng mục: `docs/BLUEPRINT_ALIGNMENT.md`.
  Chỉ một concept city/assets hiện có; nhiều theme/Subject District khác concept
  ngoài scope, không tự xếp lại V2. Audit chỉ đổi docs/instructions, không code.
- C02b đã có thành phố tài khoản thật tại `/city.html`, renderer Godot riêng,
  session/CSRF + catalog/progress/unlocks/city/inventory qua async parent bridge.
- C02c local Chromium đã kiểm chứng core loop và failure cases; chưa có browser
  CI tự động, chưa staging/UAT/production. `/game.html` vẫn sandbox RAM riêng.
- Game main đã push `16721be` (renderer/preset/shell) và `f1739c7` (QA fixes).
  Pin web hiện là full hash f1739c7 trong `server/game-source.json`.
- Web baseline tiếp quản `5631105`; checkpoint mới lấy hash bằng
  `git log -1 --oneline -- AI_HANDOFF.md`. Xác minh push bằng HEAD và ls-remote,
  không suy ra push thành công chỉ từ snapshot tài liệu này.

## Quyết định có hiệu lực

- Giữ HTML/JS/Fabric + Express/Mongoose modular monolith; Node 24.14.0,
  MongoDB replica set/sharded bắt buộc transaction; không đổi stack/UI hàng loạt.
- Cookie HttpOnly/SameSite Strict, CSRF, shared DB rate limit; mọi dữ liệu theo
  owner. Notes create idempotent, update/delete revision CAS. Legacy unowned ẩn,
  không tự gán/import shared storage; save lỗi giữ draft, không giả thành công.
- XP v1: +20 nếu content chuẩn hóa >=80 Unicode code points; fingerprint/user
  vĩnh viễn, cap 200/ngày UTC; edit/delete không đổi XP. Note/ledger/reward/
  inventory atomic. Dashboard/export online đọc server; export cùng DB snapshot.
- City v1 chỉ 4 reward IDs, axial 32x32, rotation 0, 4 blocked cells; native cell
  `(floor((x-y)/2),x+y)` trước map_to_local. Polygon native/SAT, tối đa 256 instances.
- Inventory.quantity là lượng chưa đặt: place -1, move 0, remove +1; city/inventory/
  receipt cùng transaction. Replay trả state hiện tại, không hồi sinh building cũ.
- Bridge không chuyển credentials qua URL/message; origin/source/schema/requestId
  đúng mới xử lý. Parent giữ revision/key/body, check owner trước mutation/retry.
  20s API timeout; uncertain write chỉ retry request cũ. Conflict reload giữ ghost;
  expiry/account switch khóa bridge. Dispose/abort trước restart/pagehide.
- Renderer chính chỉ áp server snapshot; ghost/original giữ khi chờ/lỗi. Refresh
  kho giữ draft chưa gửi. Chỉ dùng 4 native scenes cố định, không debug entitlement.
- Hai Web exports single-thread/WebGL2; staging copy bỏ editor tooling. Chỉ City
  staging đổi main_scene/tắt unlock-all. Không sửa project đang mở khi export,
  không commit WASM/PCK/cache. Native World và preview giữ local progression.
- Spec: docs/AUTH_NOTES_SPEC.md, PROGRESSION_SPEC.md, CITY_SPEC.md,
  GAME_BRIDGE_SPEC.md; build/host: docs/WEB_GAME.md; evidence: docs/TESTING.md.

## Task state

| Task | Evidence / trạng thái |
|---|---|
| Foundation/A01/N01/N02 | Auth/owner/CAS; multi-process MongoDB/restart/rollback đạt |
| X01a/b/c | Policy, transaction XP/rewards, dashboard/export server đã có |
| C01a/b/c | Catalog/native contract + place/move/remove/refund/CAS/idempotency; 34 DB cases đạt |
| C02a | Preview WASM chơi thật, loader/lifecycle/input; vẫn không lưu account |
| C02b.1 | `5631105`: spec/parent transport; checkpoint mới thêm timeout/abort |
| C02b.2/.3 | `/city.html`, renderer riêng, hai exports pin f1739c7; local đạt |
| C02c | Local Chromium core loop + 503/retry/blocked/two-tabs/expiry/refund đạt |
| L01 | Chưa làm: review/flashcards/onboarding; ưu tiên tiếp theo, viết spec trước |
| Q01 | Chưa làm: achievements/quests/QOL, sau L01 |
| O01 | Chưa làm: staging, backup/restore, rollback, monitoring |
| AI01 | V2, sau O01; không là điều kiện MVP |

## Files của checkpoint

- Web: `city.html`, navigation home/notes/preview, `js/game.js` host cả hai modes,
  `js/city-bridge.js`, `auth.js` nhận AbortSignal. Pagehide/obsolete async load không
  được khôi phục frame cũ; loader có timeout cả giai đoạn auth/manifest.
- Notes UI bỏ nhãn +50 XP cũ; kho trống nhưng đã unlock không báo chưa nhận starter.
  Sửa reset form sau 100 ms xóa tiêu đề nhập sớm: form fill/reset đồng bộ trước
  khi hiện modal, guard delayed init khi đóng/thay editor; 2 VM regression cases.
- Builder hỗ trợ `npm run build:game:city`, artifact `game-city-build/` ignored;
  chỉ release source committed đúng pin. CI build cả preview/city, chưa xác nhận remote.
- Tests mới/mở rộng: `city-bridge.test.js`, `game-client.test.js`, `game-http.test.js`,
  `client.test.js`; `test/helpers/browser-server.js` chạy DB riêng, fault qua stdin,
  không có fault endpoints/seed/URI ứng dụng. Console tương tác; gõ stop để teardown.
- Game: `Scenes/City/server_city.gd/.tscn`, `web/city-shell.html`, Web City preset,
  `tests/server_city_regression.gd`, docs và CI suite thứ sáu. Native main không đổi.

## Verification và giới hạn

- Node pin 24.14.0 dùng từ npm cache; Node hệ thống 26.13.0 không bị đổi. Dependencies
  theo lockfile, không thêm package. Syntax, 92 regression + 34 MongoDB 8.2.6 cases đạt.
- 6 native suites đạt; sau QA fixes chạy lại server_city regression đạt. Sandbox
  vẫn cảnh báo root certificate store; không có parser/test failures. Không lặp
  ACL/editor-cache fix lịch sử; chưa có evidence lỗi editor mới độc lập.
- Hai exports từ f1739c7, sourceDirty=false; 4 checksums/build và WASM/PCK MIME đạt.
- Chromium local: UI register/login → note → 20 XP/1 starter → place/move → reload/
  logout/login đúng city. 503 giữ ghost/original, retry thành công; two-tab conflict
  reload giữ draft; blocked không trừ kho; expiry xóa private state/khóa frame.
- DB snapshot sau place/move/remove: revision=3, receipts=3, inventory=1, XP=20;
  sau đặt lại/reload: revision=4, receipts=4, 1 building, inventory=0, XP=20.
- Preview vẫn start/place được. Normal console không warn/error. Ảnh ignored tại
  `.artifacts/city-persisted.png`, city-retry.png, city-conflict.png, city-expiry.png.
  Browser tabs/viewport đã dọn; các fixture servers/replica sets đã dừng.
- Pending: browser CI tự động, CI remote Linux, Safari/mobile, cross-device,
  public hosting, staging/UAT, TTL physical cleanup, failover/network partition,
  backup/restore. Không đánh đồng local/browser smoke với các gate này.
- DoD blueprint 9.5 cần staging xác nhận: C02b/C02c đang ở mức implemented/local
  verified, chưa Accepted/Done toàn phần. Autosave chưa có; responsive/accessibility,
  review/onboarding và đo tác động giáo dục vẫn là khoảng trống cần theo dõi.

## Git / môi trường / thay đổi ngoài scope

- Web `D:/NOTEBUILDER`, branch websiteWorkandTest, origin
  https://github.com/Hoainam4406/NOTEBUILDER.git.
- Game `D:/isometric-grid-building-game/isometric_building_game`, main, origin
  https://github.com/SubNhatSan/isometric_building_game.git. f1739c7 đã push; parent
  16721be; trước đó user commit c39347f sửa Godot AI, không bị ghi đè.
- Blueprint đã được user commit trong `95db3fa`; audit giữ nguyên nội dung file.
  Trước audit working tree web sạch. Tên tương tự từng xuất hiện untracked ở game
  nhưng không còn tại kiểm tra cuối session trước; agent không thao tác file đó.
  Audit chỉ đối chiếu source web/cập nhật docs, không sửa hoặc xác nhận mới repo game.
- Đường dẫn E: và dirty checkout/worktree cũ trong lịch sử là môi trường trước;
  không restore/reset để tái tạo chúng. Game sandbox ownership mismatch có thể dùng
  git -c safe.directory=<đúng repo> cho read, không thêm global safe.directory.
- GCM hoạt động, tự commit/push đúng branch sau checks; auth lỗi báo một lần.

## Tiếp quản tiếp theo

1. Đang tạm dừng theo yêu cầu user. Đọc instructions/handoff, blueprint và audit;
   chỉ tiếp tục feature khi user yêu cầu. Không tự thực hiện Subject District/
   multi-theme hoặc đổi stack theo bảng gợi ý.
2. Khi được tiếp tục L01: viết acceptance/spec review/flashcards/onboarding; review events cần ID và
   retry an toàn, không tự dùng edit/delete để cấp XP hoặc đổi XP policy v1.
3. Browser regression có thể tái chạy bằng helper riêng; cần backend replica set,
   không dùng preview server để test auth. Không đưa fault controls vào app thật.
4. Sau checkpoint cập nhật handoff, check/diff review, commit Conventional Commits
   và push đúng repo/branch. Không đánh dấu CI remote/staging khi chưa có evidence.
