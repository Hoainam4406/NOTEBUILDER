# Nghiệm thu UI localhost thực — 2026-11-07

Kết quả: **PASS các luồng MVP được liệt kê bên dưới** trên source web `4899f98`,
Node24.14.0, MongoDB ứng dụng có transaction, hai exports game pin f1739c7.
Browser trước đó disabled đã hoạt động sau user mở lại ứng dụng. Không sửa runtime.

## Phạm vi và dữ liệu

- Express startup thật với .env ứng dụng, port tạm5062, AUTO_OPEN=false. Dùng
  Chromium in-app browser, desktop1280px và viewport390x844. Không seed/fixture
  fault controls trong ứng dụng; không sửa .env/MongoDB service/game repo.
- Tạo một account synthetic riêng qua UI, displayName `Nghiệm thu UI localhost`.
  Không truy cập hoặc xóa account/note có sẵn của user. Account test và dữ liệu
  được giữ để đối chiếu; cuối lượt đã logout. Credentials không ghi trong docs/Git.
- Restart đúng tiến trình app do agent mở, giữ cùng port; không dừng server user.
  Server tạm sau kiểm thử đã đóng/disconnect, viewport reset, tab test đã đóng.

## Evidence thao tác thật

| Luồng | Kết quả quan sát |
|---|---|
| Register/login | Account tạo qua UI, đăng nhập thấy kho rỗng/0XP |
| Autosave draft | Nhập title/tóm tắt, thêm Sticky Vàng; timer tự báo đã lưu, chưa xuất bản |
| Reload/restore | Nháp hiện trong danh sách, khôi phục đúng text và canvas Sticky |
| Publish | Ctrl+S xuất bản đúng1 note, dashboard20XP/1 công trình, draft được dọn |
| City WebGL/WASM | Mở Godot city thật; chọn inventory/đặt công trình, kho1→0 |
| Move/reload | Chọn chân công trình, M, đặt vị trí mới; reload/mở lại giữ vị trí |
| Refund/re-place | Delete thu hồi về kho1; chọn và đặt lại, kho0; không xóa note |
| Review | Chọn note/lật tóm tắt/đánh giá;3 phiên một thẻ hoàn tất, gồm1 again/2 remembered |
| Journey | Nhận first_note/first_review/first_city và2 daily quests; đều chuyển Đã nhận |
| Restart | Stop/restart API cùng MongoDB; reload Journey giữ đủ5 claims |
| Logout/login | Session mới giữ note/canvas,20XP,kho0,city,3 summaries và5 claims |
| Edit/search | Đổi title bằng editor/Ctrl+S, vẫn20XP; search không khớp hiện empty, Pitago tìm đúng note |
| Responsive | Journey390px một cột346.667px; notes/editor một cột270px; scrollWidth375 <390 |
| Console | Sau mở city và review/journey hậu restart/login không warn/error |

City kiểm chứng bằng input canvas thật (mouse/M/Delete), không inject JS/API để
đặt công trình. Không dùng canvas export hay GodotBridge JSON thay bằng chứng game.

## Snapshot DB chỉ đọc, chỉ account synthetic

- notes=1, drafts=0, XpEvent=1, totalXp=20.
- cityRevision=4, CityMutation receipts=4, buildings=1:
  bld_apartments_brickbrown_a tại axial(21,18), inventory quantity=0.
- ReviewSession=3, tất cả completed/nextIndex1; JourneyClaim=5.
- Snapshot sau restart/login/edit khớp UI; không in owner IDs/URI/password/stack.

## Screenshots local

Lưu ngoài repo để không commit artifacts:
`C:/Users/nhats/.codex/visualizations/2026/11/06/01a1b18d-42c6-7850-8a18-e759d4637b80/`

- acceptance-restored.png / acceptance-editor-after-login.png: canvas/text.
- acceptance-city-before-restart.png / acceptance-city-after-restart.png: city.
- acceptance-claims-after-login.png / acceptance-journey-390.png: claims/mobile.
- acceptance-notes-390.png: search/result ở viewport hẹp.

Một số fullPage screenshot tool không capture được; viewport screenshots đạt.
Đầu lượt có browser diagnostics/Statsig timeout và tab ERR_CONNECTION_REFUSED do
server chưa mở; sau start không có lỗi ứng dụng tương ứng. Tab lỗi ban đầu chỉ
là trang lỗi browser, không vượt URL policy để đọc nó; tab test thành công đã đóng.

## Giới hạn và bước sau

- Đây là nghiệm thu core loop UI localhost, không phải production/staging UAT,
  cross-device, Safari/mobile thật, Cmd+S/macOS hoặc kiểm toán accessibility đầy đủ.
- Các lỗi mạng/expiry/CAS/rollback đã có evidence fixture riêng trong TESTING.md;
  không gây lỗi giả hoặc destructive test trên database ứng dụng trong lượt này.
- Không chạy lại127/59 suites chỉ vì cập nhật docs; source runtime không đổi.
- Chốt user UAT/ưu tiên polish rồi O01 deploy/backup-restore/monitoring theo scope
  giai đoạn sau. Không suy ra mọi ý tưởng mở rộng blueprint đã được triển khai.
