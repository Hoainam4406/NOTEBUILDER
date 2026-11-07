# Đối chiếu blueprint 14 mục với implementation

Ngày 2026-11-06. Đã đọc toàn bộ
[Product Blueprint v1.0](Knowledge_City_Product_Blueprint_14_Muc.md), được user
thêm trong commit `95db3fa`. Đối chiếu web `37489c6`, game pin `f1739c7`, source
và specs hiện tại. Đây là audit tài liệu; không triển khai feature mới.

Cập nhật 2026-11-07: user đã yêu cầu tiếp tục. L01/M07 flashcards, phiên review
và onboarding đã triển khai, verified local; xem [REVIEW_SPEC.md](REVIEW_SPEC.md)
và evidence mới trong [TESTING.md](TESTING.md) (104 regression/46 integration).
Các bảng dưới giữ mốc audit 2026-11-06, không phải trạng thái L01 mới nhất.
Scope một concept city và giới hạn staging vẫn có hiệu lực.

Checkpoint Q01a cùng ngày: gallery/UTC daily quests + idempotent claims đã có
implementation/desktop local verification; M08 không còn hoàn toàn chưa làm.
Q01b autosave/QOL và responsive toàn app còn pending. User chốt mốc 100% localhost
chưa tính deploy/thẩm mỹ: [LOCAL_PROGRESS.md](LOCAL_PROGRESS.md). Audit bên dưới
vẫn giữ mốc 2026-11-06; evidence mới: 113 regression/53 integration, TESTING.md.

## Kết luận và cách sử dụng

Hướng sản phẩm, core loop và thứ tự triển khai đang khớp blueprint. Không có cơ sở
phải làm lại auth/notes/XP/city hoặc đổi stack. Các task vừa qua triển khai phần
MVP của blueprint, không đồng nghĩa toàn bộ sản phẩm/Definition of Done đã đạt.

Agent đọc AGENTS.md + AI_HANDOFF.md, blueprint này, rồi implementation plan/spec
của task. Blueprint mô tả mục tiêu tổng quan; các bảng ghi rõ gợi ý/tham khảo/mẫu
không tự thay thế quyết định kiến trúc và policy đã chốt. Code thực tế xác định
hiện trạng; khi lệch yêu cầu phải báo/đối chiếu, không coi code là lý do bỏ yêu cầu.

## Scope user vừa xác nhận

- Chỉ một concept thành phố với bộ assets city builder hiện có.
- Ngoài scope: nhiều loại/theme/concept thành phố, các bộ assets mới phục vụ
  Science/Literature/Mathematics District ở mục 5.1. Không tự đưa trở lại ở V2;
  chờ user chủ động mở scope.
- Mỗi tài khoản vẫn có thành phố cá nhân; nhiều tài khoản không phải nhiều concept.
  `/game.html` sandbox và `/city.html` authenticated là hai chế độ dữ liệu,
  không phải hai concept thành phố.
- Phân môn/tag/review trong website vẫn phù hợp. Liên kết công trình hiện có với
  chức năng học tập không mặc nhiên yêu cầu mở concept/asset mới; chưa triển khai.
- Tạm dừng audit ngày 2026-11-06 đã kết thúc theo yêu cầu tiếp tục ngày 2026-11-07.

## Đối chiếu 14 mục

| Mục blueprint | Source/spec và nhận định |
|---|---|
| 1. Ý tưởng/phạm vi | Notes → XP → level → unlock/inventory → city đã có trong MVP. Notes không bị khóa theo level. Review/polish thuộc V1; AI là V2. |
| 2. Workflow | `server/progression.js` lưu note/ledger/XP/unlocks/inventory cùng transaction; `server/city.js` xác thực placement và trả snapshot. Bridge/renderer chỉ áp trạng thái server; retry/CAS/expiry phù hợp luồng ngoại lệ. |
| 3. Modules | M01–M06 đã có implementation, không phải mọi chi tiết profile/UX đều xong. M07 review, M08 quests và M09 AI chưa làm; M10 mới có một phần nền tảng (health/error/startup checks), thiếu vận hành đầy đủ. |
| 4. Game logic | +20 XP và công thức level khớp ví dụ. Policy v1 thêm ngưỡng 80 code points, fingerprint, cap 200/ngày; edit/delete không đổi XP. Bảng XP/rewards trong blueprint là tham khảo/mẫu, chưa phải yêu cầu áp mọi action/mốc. 4 rewards dùng assets hiện có. |
| 5. Mở rộng | Subject District với assets/concept khác nằm ngoài scope theo chỉ đạo mới. Knowledge Buildings, quests, repair, milestones… là ý tưởng/backlog, chưa được coi là feature đã có hoặc cần làm ngay. |
| 6. Must-have/QOL | Phần auth/notes/progression/city cơ bản có code và evidence local. Autosave chưa có; giữ draft khi save lỗi không tương đương autosave/offline draft bền vững. Responsive/accessibility còn cần audit, không nên chờ unlock. Production checklist chưa đạt. |
| 7. Kiến trúc | Modular monolith phù hợp. Khác bảng gợi ý: HTML/JS/Fabric + Godot + Express/Mongoose/MongoDB thay Next/Tiptap/Pixi/PostgreSQL. Đây là quyết định đã ghi trong AGENTS/plan; không tự migration. `/api` prefix và bounded embedded buildings là contract/thiết kế vật lý hiện hành, không sai logical model vì khác tên/bố trí collection. |
| 8. Quy trình | Foundation → Auth/Profile → Notes → XP/Rewards → City → E2E local khớp mục 8.3. Có specs/acceptance trước feature, tests/review/docs/commit. Sửa reset form và thông báo kho trong E2E phục vụ bảo vệ dữ liệu/đúng trạng thái, không mở gameplay mới. Staging/UAT còn pending. |
| 9. Kiểm thử/DoD | Evidence gần nhất: 92 VM/HTTP regression, 34 MongoDB integration, 6 native suites và browser local; xem TESTING.md. E2E qua browser tool chưa là browser CI tự động. NOTE-04 mới kiểm chứng lỗi save thủ công, chưa chứng minh autosave. Mục 9.5 yêu cầu staging: chưa được gắn nhãn Accepted/Done toàn phần. |
| 10. Deployment | Chưa xác nhận staging/domain HTTPS/cookie, backup/restore, monitoring/alerts, rollback hoặc production smoke. Build sạch và localhost pass không thay các gate này. |
| 11. Roadmap | Đã tới implementation/integration local của milestone 4. L01 tương ứng milestone 5, chưa bắt đầu. Milestone 6/điều kiện release chưa đạt. AI đặt sau vận hành/release MVP phù hợp phạm vi V2 và mục 14.1; không bắt AI trở thành gate MVP vì chuỗi ví dụ 8.3. |
| 12. Tài liệu | Đã có specs phẳng trong docs thay cây thư mục gợi ý. Trước audit thiếu đường dẫn đọc bắt buộc tới blueprint mới; bổ sung vào AGENTS/handoff. Không cần di chuyển hàng loạt docs hay tạo đủ mọi tên file mẫu. |
| 13. Dự thi | Có evidence khả thi kỹ thuật local. Chưa có UAT/đo hiệu quả học tập, onboarding hoặc tỷ lệ quay lại; không thể khẳng định educational impact chỉ từ số tests. Công trình truy cập learning tools chưa triển khai. |
| 14. Hoàn thành tổng thể | Backend-authoritative, core-loop-first và AI tùy chọn đều khớp. Review, đổi thiết bị, staging và khả năng vận hành/phục hồi vẫn chưa đủ bằng chứng; chưa đạt tiêu chí hoàn thành sản phẩm tổng thể. |

## Những khác biệt cần giữ rõ

1. **Kiến trúc:** bảng tech stack 7.2 là gợi ý; giữ stack hiện hữu theo quyết định
   đã chốt. MongoDB phải hỗ trợ transactions; không thay bằng standalone.
2. **Balance:** [PROGRESSION_SPEC.md](PROGRESSION_SPEC.md) là policy v1 hiện hành;
   [CITY_SPEC.md](CITY_SPEC.md) chốt catalog/map/inventory. Thêm XP edit/review hoặc
   thay reward cần đặc tả riêng, không tự lấy bảng mẫu làm migration.
3. **Workflow UI:** blueprint vẽ khởi tạo city khi đăng ký; implementation trả
   virtual city rỗng revision 0 và chỉ ghi document ở mutation đầu tiên. Đây là
   lazy initialization đã đặc tả, vẫn cung cấp thành phố cá nhân từ đầu.
4. **Mức hoàn thành:** “C02b/C02c local đạt” là implementation/local verification;
   chưa là staging-accepted theo DoD 9.5, càng chưa là production-ready.
5. **Chất lượng còn thiếu:** autosave, responsive/accessibility, review/onboarding
   và vận hành phải được theo dõi; không gom thành Done chỉ vì core loop đã chạy.

Tham chiếu: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md),
[GAME_BRIDGE_SPEC.md](GAME_BRIDGE_SPEC.md), [TESTING.md](TESTING.md),
[WEB_GAME.md](WEB_GAME.md). Audit không chạy lại suites vì không đổi runtime code;
các số tests trên là evidence checkpoint trước, không phải kết quả chạy mới.
