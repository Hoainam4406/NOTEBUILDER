# NOTEBUILDER - Gamified Knowledge Hub & Godot Integration

Dự án website ghi chú kiến thức cho học sinh, kết nối với thế giới game Godot. 
- **Ý tưởng:** Giúp học sinh ghi chép có hệ thống; mỗi mốc tri thức đạt được sẽ nhận điểm XP, nâng cấp cấp bậc và mở khóa asset / không gian game 3D/2D lộng lẫy hơn trong Godot.
- **Phong cách thiết kế:** Tông màu Đen - Vàng Gold hiện đại, bố cục chuẩn theo mẫu thiết kế (`template_web.png`).

---

## 📁 Cấu Trúc Dự Án

```
F:\WEB2\notebuilder-web\
├── index.html                  # Landing Page (Nền đen, NOTEBUILDER vàng, element laptop tri thức)
├── notes.html                  # Kho Ghi Chú Kiến Thức (Lưu trữ, lọc, tìm kiếm, nâng cấp Level)
├── assets/                     # Thư mục hình ảnh & template mẫu
│   ├── element_background.png  # Hình gốc element laptop tri thức
│   ├── element_hero_trans.png  # Phiên bản tách nền trong suốt tối ưu cho Landing Page
│   ├── note1.png               # Mẫu 1: Cuộn giấy cổ phong
│   ├── note2.png               # Mẫu 2: Giấy note dán băng dính (Tape)
│   ├── note3.png               # Mẫu 3: Giấy note ghim đính tường (Pin)
│   ├── note4.png               # Mẫu 4: Bản thảo cổ nhăn
│   └── template_web.png        # Ảnh template web mẫu đối chiếu
├── css/
│   ├── style.css               # Phong cách chung & Landing Page (Dark hero, Yellow accents)
│   └── notes.css               # Phong cách bảng ghim ghi chú, thẻ bài & dashboard
└── js/
    ├── main.js                 # Hiệu ứng cuộn, menu và thống kê nhanh
    └── notes.js                # Quản lý ghi chú (CRUD), LocalStorage, Level XP & Godot Bridge
```

---

## 🚀 Cách Mở Website

Bạn có thể mở trực tiếp bằng bất kỳ trình duyệt nào:
- Cách 1: Click đúp vào file `F:\WEB2\notebuilder-web\index.html` để vào **Landing Page**.
- Cách 2: Click vào nút **"Kho Ghi Chú"** trên thanh menu hoặc nút **"Mở Kho Ghi Chú"** để chuyển sang trang lưu trữ note (`notes.html`).

---

## ✨ Tính Năng Nổi Bật

1. **Landing Page (`index.html`):**
   - **Hero Section:** Nền màu đen huyền bí kết hợp dòng chữ **NOTEBUILDER** màu vàng nổi bật ở bên trái.
   - **Element bên phải:** Hình ảnh laptop tri thức isometric (`assets/element_hero_trans.png`) với hiệu ứng bay lơ lửng (float animation) và vầng hào quang vàng.
   - **Bố cục chuẩn mẫu:** Các section "Về NOTEBUILDER" (có hình khối organic vàng), "Tính Năng Cốt Lõi" (3 vòng tròn vàng), "4 Mẫu Ghi Chú" và "Các Cấp Độ Không Gian Game".

2. **Kho Ghi Chú (`notes.html`):**
   - **Hệ thống hóa bài học:** Hỗ trợ tạo ghi chú kèm Tiêu đề, Môn học/Chủ đề, Luận điểm và Thẻ Tags.
   - **4 Mẫu Giấy Note độc bản:**
     - `Mẫu 1 (Cuộn giấy cổ)`: Dành cho công thức, định lý toán học.
     - `Mẫu 2 (Dán Tape)`: Dành cho to-do list, checklist bài tập.
     - `Mẫu 3 (Ghim đính)`: Dành cho định nghĩa, từ vựng ngắn gọn.
     - `Mẫu 4 (Bản thảo nhăn)`: Dành cho tóm tắt chương sách, kiến thức lịch sử, khoa học.
   - **Gamification & Cấp bậc tri thức:**
     - Mỗi note tạo mới nhận ngay **+50 XP**.
     - Đạt đủ XP sẽ tự động lên cấp (Level 1: Tập Sự -> Level 2: Nghiên Cứu -> Level 3: Hoàng Gia -> Level 4: Không Gian Vô Cực).
   - **Lưu trữ vĩnh viễn:** Tự động lưu vào `localStorage` của trình duyệt, đóng trình duyệt mở lại vẫn còn đầy đủ dữ liệu.
   - **Tìm kiếm & Bộ lọc tức thì:** Tìm theo từ khóa hoặc lọc theo từng loại giấy note.

3. **Cầu Nối Với Godot Engine (`window.GodotBridge`):**
   - Trong `js/notes.js`, đã xây dựng sẵn đối tượng `window.GodotBridge.getKnowledgeData()`.
   - Khi bạn xuất game Godot ra bản Web (HTML5/WebAssembly) hoặc dùng `JavaScriptBridge` trong Godot GDScript, bạn chỉ cần gọi `JavaScriptBridge.eval("window.GodotBridge.getKnowledgeData()")` là game Godot sẽ nhận ngay toàn bộ Level, XP và danh sách bài học để nâng cấp asset 3D tương ứng!
   - Nút **"Xuất Cho Godot"** trên trang note cho phép tải file JSON bất cứ lúc nào.
