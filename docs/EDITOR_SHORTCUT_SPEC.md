# Q01b.1 — Phím tắt lưu note

Scope nhỏ theo yêu cầu tiết kiệm ngân sách 2026-11-07; chưa triển khai autosave.
Theo blueprint 6.2 Keyboard shortcuts và Q01b trong IMPLEMENTATION_PLAN.md.

- Ctrl+S hoặc Cmd+S khi modal editor active: chặn Save Page của browser và gọi
  form.requestSubmit để dùng HTML validation + handler lưu hiện có.
  Nút lưu có tooltip và aria-keyshortcuts để mô tả thao tác.
- Ngoài modal, Alt/Shift modifier hoặc đang composition: không can thiệp.
  Giữ phím (repeat) không submit lại. Phím tắt không tự mở/tạo note.
- Một lần lưu đang chạy chặn mọi lần submit tiếp theo (button hoặc shortcut);
  finally mở khóa sau thành công/thất bại để retry bình thường.
- Không đổi payload/idempotency/revision, XP, backend, storage hoặc canvas.
  Lỗi giữ editor theo behavior hiện có. Đây không phải autosave/phục hồi nháp.

Acceptance: VM kiểm tra shortcut phạm vi/modifiers/repeat/HTML submit; hai lần
save đồng thời chỉ một request; sau lỗi retry vẫn giữ create key/payload cũ.
Chạy syntax, regression, integration riêng và diff check theo project. Browser
OS shortcut smoke chưa được suy ra từ VM; ghi rõ mức verification trong handoff.
