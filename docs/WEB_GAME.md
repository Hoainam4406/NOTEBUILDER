# C02 — Godot Web preview và thành phố tài khoản

## Phạm vi và acceptance

1. Export source trên game `main`: preset Web single-thread, Compatibility/WebGL 2,
   custom HTML loader; không đổi native project settings hay tắt safe-save.
2. Web host: trang `/game.html`, navigation từ home/notes, start/loading/error/retry,
   resize/focus/fullscreen và chỉ nhận postMessage đúng frame/origin/schema.
3. Kiểm chứng WASM chạy thật trong browser: chọn/đặt, M để move, cancel, camera,
   wheel zoom và xóa fixture thử. Không dùng JSON export thay cho game chạy thật.

C02a là sandbox preview tự do, bố cục nằm trong RAM và mất khi reload/chơi lại.
Không cấp server XP/rewards, không đọc/sửa city tài khoản.
`/city.html` là mode tài khoản C02b: session/CSRF, 4-item catalog, city/inventory
server và renderer riêng. Contract ở [GAME_BRIDGE_SPEC.md](GAME_BRIDGE_SPEC.md).
C02c đã kiểm chứng core loop trên Chromium local; xem TESTING.md, chưa là staging.

## Build và chạy local

```powershell
npm ci --prefix server
$env:GODOT_BIN = 'D:\NOTEBUILDER\.artifacts\tools\godot\Godot_v4.7.2-stable_win64_console.exe'
# Hoặc executable Godot 4.7.2 đã cài trên máy của bạn.
# Nếu checkout game ở đường dẫn khác, đặt GODOT_PROJECT_PATH tới game main.
npm run build:game
npm run build:game:city
npm run preview:game
```

Mở `http://127.0.0.1:5050/game.html`. `preview:game` chỉ bind loopback, không đọc
`.env`, không kết nối/seed DB và mọi API mutation bị chặn 503. Website chạy bằng
`npm start` cũng phục vụ cùng trang/artifact khi đã có MongoDB replica set.
Mode tài khoản cần backend đó; preview server không dùng để login/xây có lưu.
Test độc lập: `node server/test/helpers/browser-server.js` (console tương tác),
mở `/account.html` tại port được in; dùng replica set test riêng và không đọc .env.

Yêu cầu Godot 4.7.2.stable và matching Web export templates. Mặc định source là
`D:/isometric-grid-building-game/isometric_building_game`, phải ở main. Build không
ghi vào project đang mở: copy runtime Assets/Scenes/World vào staging ignored,
bỏ editor plugin/autoload MCP trong bản copy, import rồi export release.

Artifacts `notegame-web/game-build/` và `game-city-build/` bị gitignore; cần tạo lại sau clone hoặc lấy
từ CI. Build kiểm tra HTML/JS/WASM/PCK không rỗng và SHA-256 trước khi publish;
export cũ giữ trong cache nếu có, publish lỗi sẽ rollback thư mục cũ. Manifest
`build.json` ghi engine, game commit và sourceDirty; release phải build từ source
đã commit. Cache/staging ở `server/node_modules/.cache/godot-web/`.
City manifest có `preview:false,bridgeVersion:1`; host từ chối preview/dirty build.
Web City preset đổi main_scene và tắt debug unlock-all chỉ trong staging copy.

`server/game-source.json` pin companion commit đã kiểm thử. Build từ sai commit
sẽ từ chối; cập nhật pin chỉ sau khi checkpoint game main đạt checks và đã push.
GitHub Actions có job `web-preview-build`: fetch đúng commit, dùng Godot/template
chính thức, export cả hai modes và upload artifact `knowledge-city-web-preview`.
Artifact gồm website static + hai game builds; preview có thể phục vụ static,
city cần backend cùng origin. Job này không deploy/kết nối DB production; kết quả
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
- Chưa cấu hình deploy công khai/staging hoặc Safari/mobile. C02b/c local Chromium
  đạt, không có automated browser job trong CI hiện tại.

Tham khảo chính thức: [Web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html),
[custom HTML shell](https://docs.godotengine.org/en/stable/tutorials/platform/web/customizing_html5_shell.html).
[JavaScriptBridge](https://docs.godotengine.org/en/4.7/classes/class_javascriptbridge.html)
được dùng cho callback JSON giữa shell và GDScript, không truyền credential.
