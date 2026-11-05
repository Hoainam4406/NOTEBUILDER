# NOTEBUILDER - Gamified Knowledge Hub & Godot Integration

Dự án website ghi chú kiến thức cho học sinh, kết nối với thế giới game Godot. 
- **Ý tưởng:** Giúp học sinh ghi chép có hệ thống; mỗi mốc tri thức đạt được sẽ nhận điểm XP, nâng cấp cấp bậc và mở khóa asset / không gian game 3D/2D lộng lẫy hơn trong Godot.
- **Phong cách thiết kế:** Tông màu Đen - Vàng Gold hiện đại, bố cục chuẩn theo mẫu thiết kế (`template_web.png`).

---

## 📁 Cấu Trúc Dự Án

```
E:\NOTEBUILDER\
├── notegame-web/               # Giao diện Frontend Web
│   ├── index.html              # Landing Page (Nền đen, NOTEBUILDER vàng, element laptop tri thức)
│   ├── notes.html              # Kho Ghi Chú Kiến Thức (Lưu trữ, lọc, tìm kiếm, nâng cấp Level)
│   ├── assets/                 # Thư mục hình ảnh, 4 mẫu giấy note & template mẫu
│   ├── css/
│   │   ├── style.css           # Phong cách chung & Landing Page (Dark hero, Yellow accents)
│   │   └── notes.css           # Phong cách bảng ghim ghi chú, thẻ bài & dashboard
│   └── js/
│       ├── fabric.min.js       # Thư viện Canvas Studio vẽ tự do
│       ├── main.js             # Hiệu ứng cuộn, menu và thống kê nhanh
│       └── notes.js            # Quản lý ghi chú (CRUD), API MongoDB, Fallback LocalStorage, Level XP & Godot Bridge
│
├── server/                     # BACKEND API MONGODB (Node.js + Express + Mongoose)
│   ├── index.js                # Server REST API & Static File Server
│   ├── seed.js                 # Script nạp dữ liệu mẫu ban đầu vào MongoDB
│   ├── models/Note.js          # Mongoose Schema quản lý Ghi chú & Canvas Fabric.js
│   ├── .env                    # Cấu hình PORT=5050 & MONGODB_URI
│   └── package.json            # Dependencies: express, mongoose, cors, dotenv
```

---

## 🚀 Cách Khởi Chạy Website Với MongoDB

### Cách 1: Chạy Fullstack Với MongoDB (Khuyên Dùng)
1. Đảm bảo dịch vụ MongoDB trên máy của bạn đang chạy (cổng mặc định `27017`).
2. Mở terminal và khởi động backend server:
   ```powershell
   cd e:\NOTEBUILDER\server
   npm start
   ```
3. Mở trình duyệt truy cập:
   - **Trang chủ:** `http://localhost:5050`
   - **Kho ghi chú:** `http://localhost:5050/notes.html`
   - **Kiểm tra trạng thái DB:** `http://localhost:5050/api/health`

### Cách 2: Chạy Tĩnh Offline (Fallback)
Nếu server Node.js chưa bật, website vẫn hoạt động bình thường bằng cách mở trực tiếp file `notegame-web/index.html` hoặc `notegame-web/notes.html`. Hệ thống sẽ tự động chuyển sang chế độ **Offline LocalStorage** và khi bật lại server, dữ liệu sẽ được tự động đồng bộ lên MongoDB!

---

## 🍃 Các API MongoDB Sẵn Sàng Kết Nối
- `GET /api/health`: Kiểm tra trạng thái kết nối MongoDB.
- `GET /api/notes`: Lấy danh sách ghi chú (hỗ trợ `?template=1` và `?search=...`).
- `GET /api/notes/:id`: Lấy chi tiết 1 ghi chú (kèm dữ liệu vector `canvasJSON` để vẽ tiếp).
- `POST /api/notes`: Tạo ghi chú mới (+50 XP).
- `PUT /api/notes/:id`: Cập nhật ghi chú và nét vẽ canvas.
- `DELETE /api/notes/:id`: Xóa ghi chú.
- `POST /api/notes/migrate`: Đồng bộ dữ liệu từ `localStorage` lên MongoDB.
- `GET /api/godot/export`: Xuất dữ liệu đồng bộ cho game engine Godot.

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
