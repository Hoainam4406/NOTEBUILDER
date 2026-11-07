# Kiểm thử local và CI

## Local startup/artifacts smoke, 2026-11-07

- Thêm `npm run check:local` / scripts/check-local.js và LOCAL_ACCEPTANCE.md.
  Chạy Node24.14.0 với .env ứng dụng thực: MongoDB kết nối, transaction-capable/
  writable primary. Startup transaction/index gate đạt, cổng tạm, không browser.
- Command exit0: sáu pages200, health200/online, năm API anonymous401; cả preview/
  city manifest đúng pin f1739c7/clean/engine, 8 file checksums, HTTP/MIME đạt.
  Không seed hoặc account/note/draft/XP/city writes; startup có thể init indexes.
  Server/disconnect dọn sau chạy. Không log secrets/URI/stack.
- Đây là smoke startup/host với database ứng dụng, không thay thế authenticated
  browser core loop/UAT trên bản cuối. Q01 browser evidence ở fixture vẫn giữ riêng.

## Q01b.2 — hoàn tất Q01 chức năng local, 2026-11-07

- Spec/acceptance trước code: [DRAFT_SPEC.md](DRAFT_SPEC.md). Server drafts theo
  owner, revision CAS/last-hash replay, document <=12MiB, raw fields/canvas,
  pending publish bền vững. Không autosave vào Note/XP; không localStorage online.
- Node 24.14.0: syntax, **127 regression + 58 MongoDB 8.2.6 integration tests**
  đạt; diff check đạt. 11 VM draft tests + 1 static HTTP mới, 5 DB cases mới.
  Sau response validation/focus/status fixes chạy lại syntax/127 regression đạt.
- DB tests: auth/CSRF/owner, raw/blank input/size/canvas validation, list chỉ
  metadata, two-process same-body replay/changed-body CAS winner, API restart
  giữ pending/canvas; autosave không Note/XP; replay publish một note/event;
  xóa nháp CAS độc lập. Tất cả dùng DB test riêng, không đọc .env ứng dụng.
- VM: debounce/no publish, canvas restore, uncertain/malformed CAS identical
  retry trước input mới, POST pending lưu trước Notes API và khôi phục cùng key,
  typing during save giữ editor, PUT chỉ xác nhận revision+1/payload khớp,
  conflict/owner switch/expiry, pagehide/abort/late results, invalid input sửa lại.
- Chromium desktop fixture: nhập tóm tắt + Sticky Vàng → autosave → reload →
  restore vẫn có text/canvas. Trước publish: 0 notes/events. Ctrl+S create response
  bị cắt sau commit → reload/restore/retry đúng request: 1 note/event, XP20/kho1.
  Edit title → mất response PUT sau commit → reload/restore/retry, xác nhận đúng
  revision/payload và dọn draft; vẫn 1 note/event, XP20/kho1.
- Hai tab cùng draft: A ghi revision mới; B 409 giữ title riêng và không overwrite
  server. Snapshot cuối chỉ title A ở revision2; không đổi Note/XP. Thu hồi session
  rồi retry A xóa editor fields/canvas/list riêng. Fixture teardown exit0.
- Responsive: dùng `agent.browsers.get('2').capabilities.get('viewport')` qua CUA,
  set390x844 làm DOM width thực390 (wrapper cua browser cũ không tác động đúng).
  Notes/editor: scrollWidth375, grid một cột270px, canvas box270px/footer318px.
  Escape flush rồi đóng an toàn. Journey: grid346.667px/scroll375; claim huy hiệu
  qua UI thành công. Screenshot viewport (`fullPage:false`) đạt; fullPage hẹp
  tool không capture được. Đây là Chromium responsive, chưa mobile/Safari thật.
- Dialog inactive inert, focus vào title/giữ Tab trong editor/trả focus khi đóng;
  tooltip/aria Ctrl/Cmd+S. Browser kiểm chứng Ctrl+S; Cmd+S chỉ VM, chưa macOS.
- Ảnh ignored `.artifacts/draft-restored.png` (canvas Sticky), draft-conflict.png,
  draft-expiry.png, journey-mobile-verified.png. Không dùng ảnh journey-mobile.png
  cũ làm evidence. Browser tabs/viewport và fixture DB đã dọn.
- Q01 local implemented/verified trong scope specs, chưa staging Accepted.
  Không gồm mọi nice-to-have (themes, city undo/presets, AI, import...); không có
  offline draft bền vững khi write chưa ACK. QA sản phẩm cuối/cross-device,
  staging/UAT, performance/load, TTL/failover/backup/restore vẫn cần gate riêng.

## Q01b.1 — phím tắt lưu editor, 2026-11-07

- Scope nhỏ theo yêu cầu tiết kiệm ngân sách: EDITOR_SHORTCUT_SPEC.md.
  Ctrl/Cmd+S chỉ khi editor active; giữ HTML validation qua requestSubmit.
  Single-flight guard chung cho shortcut/button; finally mở khóa để retry.
- Hai VM regression mới: active/modifiers/composition/repeat và concurrent save
  chỉ gửi một request, sau 503 retry cùng key/body và success mở khóa.
- Node 24.14.0: syntax, **115 regression + 53 MongoDB integration tests** đạt;
  diff check đạt. Không sửa backend/dependencies/game/XP/storage.
- Chưa chạy browser/OS shortcut smoke; VM không thay thế evidence này. Autosave,
  phục hồi nháp, mobile journey và các giới hạn Q01b còn nguyên; chưa Accepted.

## Q01a — achievements/UTC daily quests, 2026-11-07

- [JOURNEY_SPEC.md](JOURNEY_SPEC.md) có acceptance trước implementation.
  Node 24.14.0: syntax, 113 regression và 53 MongoDB 8.2.6 integration tests đạt;
  diff check đạt. Sau UI focus fix chạy lại 113 regression đạt. Không thêm dependency.
- 7 DB cases mới: auth/CSRF/owner, body/day injection, only awarded ledger,
  delete note không mất progress, confirmed ratings active/closed/completed,
  two-process concurrent claims (chỉ một record/timestamp), no XP/inventory
  mutation, API restart, UTC boundary/stale day, claim rollback, persisted city.
- 7 client VM cases + input rules + static HTTP: literal data, safe links,
  uncertain PUT identical retry, UTC conflict không auto-claim, confirmed PUT
  rồi GET lỗi vẫn là đã nhận, expiry/owner switch, timeout/pagehide/late result,
  visibility refresh không tự retry. Focus sau lỗi chuyển tới nút retry.
- Chromium desktop 1280px, DB fixture riêng: account → note đủ điều kiện (20 XP,
  1 starter) → gallery/quest eligible → claim → lost-response sau commit → tab
  thứ hai replay → explicit retry → reload giữ huy hiệu. Server chỉ một first_note.
  Quest note được nhận; 3 phiên một thẻ qua UI (gồm `again`) làm quest review đủ
  3/3; nhận first_review và daily_review. Snapshot cuối: 4 claims (2 badge,
  2 quest), XP vẫn 20, inventory vẫn 1. Không có grant endpoint/debug trong app.
- 503 fixture: Enter claim → focus nút retry → Enter retry thành công. Refresh
  sau thu hồi session xóa gallery/progress riêng, hiện login link. Console normal
  sau reload không warn/error. Fixture server/replica set teardown exit 0.
- Screenshots ignored `.artifacts/journey-desktop.png`, journey-retry.png,
  journey-expiry.png. Thử resize 390x844 qua tool không đổi viewport thật
  (DOM vẫn 1280px); **không xác nhận mobile**. CSS một cột đã có nhưng cần kiểm
  chứng sau ở Q01b. File ảnh tên journey-mobile.png chỉ là lần thử resize, không
  được dùng làm evidence mobile.
- Staging/UAT/CI remote/browser CI/cross-device pending; Q01a desktop verified
  chưa là Accepted toàn phần, Q01b autosave/QOL chưa làm. Game pin không đổi.

## L01 — review/flashcards/onboarding, 2026-11-07

- Spec/acceptance REV-01..06: [REVIEW_SPEC.md](REVIEW_SPEC.md). Node 24.14.0:
  `npm run check`, 104 regression và 46 MongoDB 8.2.6 integration tests đạt;
  `git diff --check` đạt. Không thêm dependency hoặc đổi game pin `f1739c7`.
- 12 integration cases mới dùng replica set riêng/hai API processes: auth/CSRF/
  owner, foreign/legacy/empty notes, tối đa 100 choices và 20 cards, snapshots
  đúng thứ tự sau edit/delete, same-key starts/ratings, one-active races,
  CAS winner, key/payload/operation conflict, early close, restart, corrupt data
  và rollback. XP/reward/inventory không thay đổi khi tự đánh giá.
- VM client kiểm tra text literal, reveal gate, immutable retry sau timeout/
  network/503/malformed response, conflict không tự grade, owner switch/expiry
  xóa private state, summary/history, abort/pagehide và late async results.
- Chromium local, fixture DB riêng: empty state → onboarding → tạo hai notes
  qua UI (40 XP, 1 starter) → chọn/flip/grade → reload đúng thẻ → complete/history.
  Response rating bị cắt sau commit: UI giữ thẻ/lựa chọn, explicit retry đúng
  request chuyển đúng một thẻ. Snapshot completed: revision=2, receipts=2,
  nextIndex=2; không còn text trong session. XP vẫn 40, inventory vẫn 1.
- Hai tab: tab stale nhận 409, tải thẻ mới và giữ nhãn lựa chọn chưa xác nhận,
  không tự gửi lại. Expire session: khóa và xóa nội dung riêng; login lại resume
  đúng thẻ. Kết thúc sớm 1/2: closed, revision=2, receipts=2, không còn text.
- Keyboard reveal bằng Enter rồi Tab tới rating; đã sửa reveal toggle giữ focus.
  Viewports 1280x900 và 390x844, trang review không tràn ngang; console bình
  thường không warn/error. Đây là responsive Chromium, chưa test Safari/mobile thật.
- Screenshots ignored: `.artifacts/review-desktop.png`, `review-mobile.png`,
  `review-retry.png`, `review-conflict.png`, `review-expiry.png`, `review-summary.png`.
- Fixture thêm stdin `fail-next-review`, `drop-next-review-response` (partial
  response sau commit để browser không che lỗi bằng HTTP retry), `review-snapshot`.
  Command queue được tuần tự hóa để snapshot không chạy đồng thời teardown;
  pipe review-snapshot/snapshot/stop đạt exit 0 sau sửa. Không đọc app .env/DB.
- L01 implemented/local verified; CI remote, browser CI tự động, staging/UAT,
  cross-device và tác động học tập chưa được xác nhận. Không có XP tự đánh giá,
  AI, scheduler spaced repetition hoặc quest trong scope L01.

## C02b/C02c — authenticated city, 2026-11-06

- Node 24.14.0: syntax, 92 regression tests và 34 MongoDB integration tests.
  Bridge/host tests thêm strict envelope, origin/source, owner switch, timeout,
  identical retry, conflict reload, obsolete async load/pagehide và dispose.
  Editor form reset/fill trước khi hiện modal; delayed canvas init không được
  xóa text vừa gõ hoặc khởi tạo lại editor đã đóng/thay thế (bug thấy khi E2E).
- Game `f1739c7` main: 6 suites đạt (5 cũ + server_city_regression). Suite mới
  kiểm tra 1024 cells/4 blocked, axial→native, 4 items, không optimistic commit,
  retry/conflict/draft, remove và expiry. JSON numeric types được chuẩn hóa khi
  so ô cấm. Sandbox certificate-store warning không phải parser failure.
- Export thật cả Web Preview/Web City từ source pin sạch; mỗi build có 4 SHA-256,
  WASM/PCK MIME đúng. City dùng main_scene riêng trong staging, không sửa World.
- Chromium desktop local: UI đăng ký/login → note hợp lệ → 20 XP + 1 starter →
  place → move → reload và logout/login lại vẫn đúng layout/XP. Final export
  được kiểm tra thêm place → reload sau session mới.
- Fault fixture: 503 ở move giữ original + ghost và khóa edits; retry thành công.
  Hai tab cùng revision: remove ở A, move stale ở B nhận conflict; B render city
  rỗng mới, giữ ghost và nhận đúng 1 refund trong kho. Place vào ô cấm không
  trừ kho. Thu hồi session test khiến frame xóa layout/inventory riêng và khóa ghi.
- Snapshot sau place/move/remove: revision 3, 3 receipts, inventory=1, XP=20.
  Sau đặt lại/reload: revision 4, 4 receipts, 1 building, inventory=0, XP=20.
  Preview riêng khởi động/đặt được; normal gameplay không warn/error trong console.
- Ảnh local ignored: `.artifacts/city-persisted.png`, `city-retry.png`,
  `city-conflict.png`, `city-expiry.png`. Test servers/replica sets đã dừng.

Chạy browser fixture trong console tương tác:

```text
node server/test/helpers/browser-server.js
```

Fixture tự tạo replica set/port loopback, không đọc .env/URI ứng dụng, không seed.
Tạo account/note qua UI hoặc API bình thường. stdin commands chỉ thuộc fixture:
`fail-next-city` (503 trước write), `drop-next-city-response` (mất response sau
commit; browser có thể tự retry HTTP), `expire-sessions`, `snapshot`, `stop`.
Không có fault endpoints trong ứng dụng. Dùng `stop`/Ctrl+C để teardown.

Đây là browser verification local qua tool, chưa có automated browser CI job.
CI remote, Safari/mobile, cross-device, public hosting, staging/UAT và backup/
restore vẫn pending; không coi 92 VM/HTTP tests là bằng chứng các mục đó.

## Windows editor / shared cache

Khi agent và người dùng chạy Godot bằng hai tài khoản Windows khác nhau, kiểm tra
ACL `.godot` nếu editor báo safe-save failed. Cache do sandbox tạo có thể cho user
tạo temp file nhưng không thay được metadata cũ; không kết luận antivirus từ thông báo.
Chỉ sửa quyền Modify cho đúng editor user trong cache, không cấp Everyone/FullControl
toàn ổ đĩa và không tắt safe save để che lỗi. Lưu snapshot ACL local trước khi sửa.

2026-11-06: main worktree đã sửa quyền inheritable cho Admin; xác minh dưới Admin
không nâng quyền: mở ghi metadata cũ, atomic replacement probe và Godot headless
editor import/quit đạt; log không có ERROR/safe-save/parent-popup. Không suy diễn
đã kiểm thử GUI tương tác hoặc plugin dialogs từ headless. Không commit cache/ACL.

## Commands

```text
npm ci --prefix server
npm run check
npm test
npm run test:integration
git diff --check
```

`npm test`: HTTP/model giả, policy XP và VM frontend, nhanh và không cần mongod.
`test:integration`: MongoDB **8.2.6** thật, replica set một node WiredTiger,
được quản lý bởi dev dependency `mongodb-memory-server-core` 11.3.0.
Lần đầu cần tải binary từ MongoDB; cache trong `server/node_modules/.cache`,
không commit binary hoặc dữ liệu DB. Không cần cài dịch vụ MongoDB trên máy.

Suite không đọc `.env` hoặc `MONGODB_URI`, tự tạo database test trên loopback và
cổng ngẫu nhiên. Mọi xóa dữ liệu chỉ chạy trong instance test do suite sở hữu;
teardown dừng API/mongod và dọn dữ liệu tạm. Không nhận URI database bên ngoài.

## N02 acceptance evidence

7 integration cases đã chạy local trên Windows/Node 24.14.0:

- Unique email index: hai tiến trình đăng ký đồng thời chỉ tạo một tài khoản.
- Note và session được đọc lại từ tiến trình API khởi động lại.
- Owner isolation thực ở DB, bao gồm search/export và notes legacy không owner.
- 12 request cùng revision qua hai tiến trình: đúng một thành công, 11 conflict.
- 20 login đồng thời chia sẻ DB counter: 10 bị từ chối credentials, 10 rate limit.
- TTL indexes được kiểm tra; expiry bị từ chối ở middleware, logout thu hồi ngay.
- Transaction bị lỗi giữa chừng rollback note: hạ tầng cho X01.

Không đợi TTL background worker để xác nhận xóa vật lý. Chưa kiểm thử replica-set
failover nhiều node, browser E2E, staging/UAT hoặc restore production backup.
CI Linux chạy cả hai suite; kết quả local không thay thế kết quả CI remote.

API fixture là tiến trình test riêng, không dùng startup/seed của ứng dụng.
Tham khảo API replica-set của thư viện:
[MongoMemoryReplSet](https://typegoose.github.io/mongodb-memory-server/docs/api/classes/mongo-memory-replset/).

## X01b evidence

Thêm 9 case real-DB cho XP-01..05/RWD-01..02: 12 retries cùng key qua hai tiến
trình, payload conflict, retry note đã xóa, duplicate fingerprint, daily cap và
rollover UTC, toàn bộ milestone còn thiếu, fault sau ledger/inventory, edit/delete
giữ XP và owner isolation. Tổng 16 integration tests đạt. Fixture multi-level seed
530 XP rồi nhận 20 XP để kiểm tra phục hồi đủ mốc tới level 5; public API không
cho gửi số XP tùy ý. Chưa mô phỏng network partition hoặc primary failover.

## C01 evidence

6 geometry/catalog unit tests nâng regression lên 68. Godot main có
`tests/city_catalog_contract.gd` đối chiếu 4 polygon thực, tile size và phép chuyển
axial API sang native stacked-offset; hai bản JSON contract phải giống hệt nhau.
Native contract và placement audit 498 scenes đạt. Không đổi native grid để lách test.

17 city integration cases (tổng suite 34) dùng MongoDB thật và hai tiến trình API:
CITY-01..05 backend, auth/CSRF/owner, invalid placement/move, same-key và revision
races, idempotent refund, fault sau inventory/city/receipt, process restart,
corrupt saved layouts, concurrent note rewards, giới hạn 256 buildings. Test full
city và thêm owned copy dùng fixture DB có kiểm soát; không có public endpoint
tự cấp inventory/XP. Authenticated browser E2E/hosting vẫn cần C02b/c.

## C02a evidence

74 regression tests: thêm loader VM (origin/source/schema, stale iframe, network/
missing build, timeout) và HTTP preview không DB/không ghi dữ liệu. Tổng 34 MongoDB
integration vẫn đạt. Godot knowledge/catalog/move/placement/support đều đạt.

Đã export release thật từ game pin `ddee89a`, kiểm tra 4 artifact SHA-256/MIME,
sourceDirty=false. IAB Chromium đã click play, chọn/đặt/Esc/M-move, camera D, wheel
zoom, Delete fixture; normal gameplay không warn/error. Resize và fullscreen/exit
đạt. Missing build thử bằng manifest tạm đổi tên trên loopback cho lỗi rõ ràng;
manifest khôi phục, Retry mở game thành công. Build artifacts/cache không commit.
Đây là preview browser smoke; chưa chứng minh persisted account/city loop C02c,
Safari/mobile, deploy công khai hoặc CI remote job mới đã pass.
