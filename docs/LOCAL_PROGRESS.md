# Tiến độ sản phẩm localhost — 2026-11-07

## Mốc 100% theo user

Một sản phẩm hoàn chỉnh chạy localhost, có đầy đủ UI tương tác và logic/backend
cho MVP Knowledge City một concept city. Hoàn thiện thẩm mỹ UI và deploy ở giai
đoạn sau. Không tính AI V2, Subject District/multi-theme hay toàn bộ ý tưởng mở
rộng trong blueprint. Không đổi Definition of Done staging/production thành local.

## Ước lượng hiện tại

Đầu checkpoint Q01a (`cf8bfdc`): khoảng **80% ±5%**. Sau implementation và desktop
verification Q01a: khoảng **84% ±5%**. Đây là ước lượng kỹ thuật có trọng số,
không phải metric tự đo, số tests hoặc cam kết thời gian còn lại.

| Hạng mục | Trọng số | Trước Q01a | Sau Q01a | Căn cứ / phần còn lại |
|---|---:|---:|---:|---|
| Auth/profile/ownership | 10 | 9 | 9 | Session/CSRF/owner đạt; còn nghiệm thu toàn app |
| Notes/editor/persistence | 20 | 17 | 17 | CRUD/canvas/search/save/export có; autosave/khôi phục nháp còn thiếu |
| XP/level/rewards/inventory | 15 | 14 | 14 | Policy/atomicity/replay/local core loop đạt |
| City tương tác/persistence | 25 | 23 | 23 | Web export/bridge/account layout đạt local; cần nghiệm thu bản localhost cuối |
| Review/onboarding | 10 | 9 | 9 | L01 local đạt; còn QA tổng thể |
| Achievements/quests/QOL | 10 | 2 | 6 | Gallery/quests/backend đạt desktop; Q01b QOL và mobile journey pending |
| Nghiệm thu localhost dùng hằng ngày | 10 | 6 | 6 | Cần xác nhận DB ứng dụng/startup, full run/restart, responsive/a11y toàn app |
| Tổng | 100 | 80 | 84 | Không tính deploy hoặc polish thẩm mỹ |

## Các việc đưa sản phẩm tới 100% localhost

1. Q01b: đặc tả/triển khai autosave hoặc phục hồi nháp an toàn theo account,
   không ghi đè note khi conflict, không làm mất canvas hoặc nhân note/XP khi retry.
2. Rà soát UI tương tác/responsive/accessibility toàn ứng dụng và luồng chuyển
   notes ↔ review ↔ journey ↔ city/account; mobile journey chưa có evidence thật.
3. Xác minh MongoDB ứng dụng hỗ trợ transactions và startup `npm run dev` trên
   cấu hình localhost thực. Test replica set riêng không thay bằng chứng này.
4. Nghiệm thu bản localhost cuối: auth → notes → XP/rewards → city → review →
   quests, save/reload/logout/login/restart, lỗi mạng và hai tab, không mất dữ liệu.
   Khắc phục mọi blocker phát hiện trước khi gọi 100%.

Evidence hiện hành: [TESTING.md](TESTING.md), [AI_HANDOFF.md](../AI_HANDOFF.md).
Deploy/staging/HTTPS/monitoring/backup/rollback vẫn trong O01, không bị xóa khỏi
backlog vì không tính vào phần trăm localhost này.
