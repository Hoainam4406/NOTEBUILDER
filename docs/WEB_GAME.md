# C02a — Godot Web preview

## Phạm vi và acceptance

1. Export source trên game `main`: preset Web single-thread, Compatibility/WebGL 2,
   custom HTML loader; không đổi native project settings hay tắt safe-save.
2. Web host: trang `/game.html`, navigation từ home/notes, start/loading/error/retry,
   resize/focus/fullscreen và chỉ nhận postMessage đúng frame/origin/schema.
3. Kiểm chứng WASM chạy thật trong browser: chọn/đặt, M để move, cancel, camera,
   wheel zoom và xóa fixture thử. Không dùng JSON export thay cho game chạy thật.

C02a là sandbox preview tự do, bố cục nằm trong RAM và mất khi reload/chơi lại.
Không cấp server XP/rewards, không đọc/sửa city tài khoản. C02b sẽ nối City API và
4-item authenticated catalog; C02c mới xác nhận browser core loop hoàn chỉnh.

## Build và chạy local

```powershell
npm ci --prefix server
$env:GODOT_BIN = 'E:\Godot_v4.7.2-stable_win64.exe\Godot_v4.7.2-stable_win64_console.exe'
# Nếu checkout game ở đường dẫn khác, đặt GODOT_PROJECT_PATH tới game main.
npm run build:game
npm run preview:game
```

Mở `http://127.0.0.1:5050/game.html`. `preview:game` chỉ bind loopback, không đọc
`.env`, không kết nối/seed DB và mọi API mutation bị chặn 503. Website chạy bằng
`npm start` cũng phục vụ cùng trang/artifact khi đã có MongoDB replica set.

Yêu cầu Godot 4.7.2.stable và matching Web export templates. Mặc định source là
`E:/isometric_building_game/.worktrees/knowledge-main`, phải ở main. Build không
ghi vào project đang mở: copy runtime Assets/Scenes/World vào staging ignored,
bỏ editor plugin/autoload MCP trong bản copy, import rồi export release.

Artifact `notegame-web/game-build/` bị gitignore; cần tạo lại sau clone hoặc lấy
từ CI. Build kiểm tra HTML/JS/WASM/PCK không rỗng và SHA-256 trước khi publish;
export cũ giữ trong cache nếu có, publish lỗi sẽ rollback thư mục cũ. Manifest
`build.json` ghi engine, game commit và sourceDirty; release phải build từ source
đã commit. Cache/staging ở `server/node_modules/.cache/godot-web/`.

`server/game-source.json` pin companion commit đã kiểm thử. Build từ sai commit
sẽ từ chối; cập nhật pin chỉ sau khi checkpoint game main đạt checks và đã push.
GitHub Actions có job `web-preview-build`: fetch đúng commit, dùng Godot/template
chính thức, export runtime staging và upload artifact `knowledge-city-web-preview`.
Artifact gồm website static + game-build, có thể phục vụ bằng static hosting với
MIME types đúng. Job này không deploy hay kết nối database production; kết quả
local không thay thế kết quả Actions Linux remote.

## Hosting

- Giữ nguyên tên `index.html`, `index.js`, `index.wasm`, `index.pck` và các icon
  do exporter sinh; host cả folder cạnh game.html. Không phục vụ qua file://.
- `.wasm`: `application/wasm`; `.pck`: `application/octet-stream`. Express hiện
  đã trả đúng hai MIME types này; không dùng SPA HTML fallback cho asset thiếu.
- Single-thread (`variant/thread_support=false`), không bật PWA/service worker.
  Cấu hình này không cần thêm COOP/COEP cho toàn website. Dùng HTTPS khi host thật.
- Loader event chỉ là lifecycle preview, không là nguồn quyền sở hữu/XP.
  `ready` = engine khởi động; `loading/error/exit` điều khiển UI. Chỉ tin message
  từ iframe hiện tại, cùng origin và channel/version đúng.
- Chưa cấu hình deploy công khai/staging, chưa xác nhận Safari/mobile hoặc C02b/c.

Tham khảo chính thức: [Web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html),
[custom HTML shell](https://docs.godotengine.org/en/stable/tutorials/platform/web/customizing_html5_shell.html).
