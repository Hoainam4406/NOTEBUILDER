# Persistent Project Context — Knowledge City

Áp dụng cho Codex, Google Antigravity và agent khác trong repository này.
Đầu mỗi session đọc file này và `AI_HANDOFF.md`, rồi đối chiếu Git/source thực tế.

## Mục tiêu và kiến trúc

Knowledge City kết hợp ghi chú học tập với thành phố cá nhân:
note → XP → level → reward/inventory → xây thành phố → quay lại học.
MVP ưu tiên vòng lặp hoàn chỉnh, bảo vệ dữ liệu và khả năng phục hồi.

- Web: `notegame-web/`, HTML/CSS/JavaScript và Fabric.js; Express phục vụ cùng origin.
- Backend: `server/`, Node 24.14.0, CommonJS, Express 5, Mongoose/MongoDB.
  Modular monolith; replica set hoặc sharded cluster là điều kiện transaction.
- Game companion: repository `D:/isometric-grid-building-game/isometric_building_game`, Godot 4.7.2, renderer
  isometric/grid. Game local chưa đồng nghĩa game đã nhúng vào website.
- Giữ stack hiện có; không tự chuyển Next.js/PostgreSQL hoặc thay toàn bộ UI.

## Modules và quan hệ

| Module | Source chính | Quan hệ / bất biến |
|---|---|---|
| Auth/profile | `server/auth.js`, `models/User.js`, `Session.js`, `AuthAttempt.js` | Session cookie, CSRF, shared DB rate limit; xác định owner |
| Notes/API | `server/app.js`, `validation.js`, `models/Note.js` | Mọi query theo owner; revision CAS chống mất cập nhật |
| Progression | `server/progression-policy.js`, `progression.js` | Note + ledger + fingerprint + XP + unlock/inventory cùng transaction |
| Persistence | `server/models/`, `server/index.js` | Unique indexes và kiểm tra transaction trước khi listen |
| Web UI | `notegame-web/js/notes.js`, `auth.js`, `account.js` | Online đọc XP từ server; lỗi lưu giữ bản nháp |
| City API | `server/city.js`, `city-rules.js`, `models/City.js`, `CityMutation.js` | Layout/inventory/receipt atomic; revision CAS; catalog/map ở `server/data/` |
| Godot | Companion `Scenes/City/`, `Scenes/Buildings/`, `World/` | C02a preview riêng; C02b authenticated + C02c local Chromium đạt, chưa staging/CI browser |

## Quy tắc kỹ thuật

- Theo conventions của file hiện hữu: CommonJS/async-await ở server; không thêm
  dependency, abstraction hoặc thay đổi format hàng loạt khi không cần thiết.
- Blueprint là định hướng; viết acceptance criteria/specification trước feature.
  Tham chiếu `docs/IMPLEMENTATION_PLAN.md`, `AUTH_NOTES_SPEC.md`,
  `PROGRESSION_SPEC.md`, `CITY_SPEC.md`, `TESTING.md` (các file sau nằm trong `docs/`).
- Backend xác thực ownership, XP, reward và placement; không tin giá trị client.
- Note create cần `Idempotency-Key`; retry giữ key/payload. Update/delete cần
  revision. Không bỏ owner filter, CSRF, unique constraints hoặc transaction.
- Không tự gán notes legacy chưa có owner, không tự seed/import shared storage.
- Không báo save/export thành công khi request lỗi. Offline file-mode là prototype.
- Giữ API error contract `{error,code}`, không lộ secrets/URI/stack/password.
- Không coi JSON export/`GodotBridge` là bằng chứng game chạy trong browser.
  C02 phải có Web export thật, trang chơi tương tác và browser verification.

## Workflow, kiểm thử và Git

1. Chia task nhỏ theo phụ thuộc, xác định acceptance/test trước khi code.
2. Kiểm tra `git status`, diff và instructions; không ghi đè việc của agent/user khác.
3. Test phù hợp, review diff và `git diff --check`; thất bại thì sửa, không commit lỗi.
4. Trước **mỗi commit và mỗi push**, xác nhận `git rev-parse --show-toplevel`,
   `git branch --show-current`, `git remote -v` và status đúng đích:
   - Web: `D:/NOTEBUILDER`, branch `websiteWorkandTest`, remote
     `https://github.com/Hoainam4406/NOTEBUILDER.git`.
   - Game: chỉ branch `main`, remote
     `https://github.com/SubNhatSan/isometric_building_game.git`;
     kiểm tra worktree ở `AI_HANDOFF.md` trước khi sửa.
5. Task đã đạt kiểm tra: commit riêng Conventional Commits và tự động push đúng
   branch. User đã cấp quyền; dùng Git Credential Manager hiện có, không hỏi chọn
   tài khoản nếu hoạt động. Lỗi auth: báo nguyên nhân, không lặp đăng nhập.
6. Không force push, reset, rebase, ghi đè thay đổi chưa commit; không commit `.env`,
   credentials, dependencies, Godot imports/cache hoặc build/export artifacts.
7. Báo checkpoint: task, evidence, commit hash, push status và bước tiếp theo.

Web checks: `npm run check`, `npm test`, `npm run test:integration`, `git diff --check`.
Integration tự tạo mongod test riêng; không trỏ test phá dữ liệu vào DB ứng dụng.
Godot checks và giới hạn verification xem `AI_HANDOFF.md` / `docs/TESTING.md`.
Web preview build/host và pinned game source xem `docs/WEB_GAME.md`; không sửa
project đang mở khi export, không commit WASM/PCK hoặc đổi pin chưa kiểm chứng.
Không đánh đồng unit/local pass với CI remote, browser E2E, staging hoặc UAT.

## Handoff giữa agents

- Sau task/checkpoint và trước khi kết thúc session, cập nhật `AI_HANDOFF.md`:
  scope, quyết định, trạng thái task, file/mục đích, lỗi, tests, Git và next steps.
- Chỉ đánh dấu hoàn thành khi có evidence; phân biệt verified / pending / blocked.
- Trước khi tiếp quản, so Git/source với handoff. Nếu khác, tìm nguyên nhân trong
  diff/history; không tự suy đoán hoặc xoá thay đổi để khớp tài liệu.
- Tránh hai agents sửa cùng file. Ghi rõ phạm vi đang làm khi bàn giao; chỉ tiếp
  tục phần độc lập nếu thấy thay đổi đang diễn ra. Không tự tạo policy approval mới.
- Giữ hai file ngắn, độc lập với lịch sử chat; link spec thay vì chép lại toàn bộ.
