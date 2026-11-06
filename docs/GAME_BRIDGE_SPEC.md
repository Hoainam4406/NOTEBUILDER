# C02b — authenticated bridge v1

## Checkpoints và acceptance

- C02b.1: transport phía parent, VM tests và contract này. Chưa nối preview UI
  hoặc đổi game source pin; chưa được coi là authenticated game chạy được.
- C02b.2: Godot authenticated renderer và host lifecycle, map/catalog v1,
  load trước input, chỉ commit visual sau API success. Không dùng debug unlock-all.
- C02b.3: export pin đã kiểm chứng, browser verification; C02c kiểm tra core loop.

## Transport

`KnowledgeCityBridge.create({frame})` chỉ dùng cho authenticated frame cùng origin
được parent sở hữu. Parent dùng `KnowledgeAuth.request`, cookie/CSRF chỉ ở parent;
không truyền token, cookie, user ID hay credential qua message hoặc URL.
Preview vẫn dùng channel riêng và sandbox RAM. Chỉ attach bridge cho bản game
authenticated đã kiểm chứng; không attach vào preview hiện tại.

Frame gửi object có đúng keys `{channel:'knowledge-city',version:1,requestId,
type,payload?}`. `requestId` là số nguyên dương tăng đơn điệu trong lifetime
bridge; duplicate/old IDs bị bỏ qua. Origin phải bằng location.origin và source
phải bằng frame.contentWindow. Payload/type sai bị bỏ qua, không gọi API.

| type | payload |
|---|---|
| initialize, refresh, retry | Không có |
| place | `{catalogId,x,y}` |
| move | `{buildingId,x,y}` |
| remove | `{buildingId}` |

IDs catalog chỉ thuộc catalog server trả về; buildingId là ObjectId hex 24 ký tự.
x/y integer trong grid server, rotation luôn 0 do parent thêm. Parent lấy revision
từ snapshot hiện tại, sinh UUID idempotency, không nhận key/revision từ frame.
Backend tiếp tục xác thực ownership, collision, bounds, entitlement và CSRF.

Một command chạy mỗi lần; request mới trong lúc bận nhận BRIDGE_BUSY. Phản hồi
`{channel,version,requestId,type:'result',ok,...}` chỉ gửi tới origin cụ thể.
Success có `state={catalog,progress,unlocks,city,inventory}`; mutation bổ sung
`buildingId,replayed`. Lỗi có `code,error,retryable,draft?` và snapshot hiện tại
nếu còn hợp lệ. Không forward raw exception/stack/server error text.

Initialize gọi /auth/me lấy CSRF, sau đó đọc catalog/progress/rewards và /city.
Parent giữ owner ID trong RAM, kiểm tra /auth/me trước mỗi mutation/retry và khi
refresh; đổi tài khoản khóa bridge cũ, không gửi pending write sang owner mới.
City/inventory chỉ lấy từ cùng snapshot /city; progress/unlocks là thông tin UI
có thể thay đổi giữa các GET, không là quyền cấp thưởng hay cho phép placement.
Renderer load map 32×32 + blocked cells và chuyển axial sang native offset theo
CITY_SPEC trước mở input. Chỉ render state server trả về, kể cả replay.

## Lỗi và lifecycle

- Network/5xx/mất JSON response: giữ chính xác method/path/key/body và draft,
  chỉ `retry` gửi lại. Chặn mutation mới và refresh khi kết quả còn chưa rõ.
  Mỗi API call timeout sau 20 giây, abort khi dispose; timeout write vẫn uncertain.
- 409 CITY_CONFLICT: bỏ request đã bị từ chối, đọc lại /city, trả lỗi kèm draft
  để người dùng chọn lại. Không tự replay draft với revision mới. Nếu reload lỗi,
  khóa mutation tới khi refresh thành công.
- Các 4xx khác: giữ draft trong phản hồi, không đổi renderer thành công giả.
- 401 hoặc CSRF_INVALID: hủy snapshot/request pending, khóa bridge tới khi parent
  dispose và tạo bridge/frame mới sau login. Không retry request tài khoản cũ.
- Parent phải gọi dispose trước logout/account switch/restart/frame replacement;
  kết quả async sau dispose bị bỏ, không message vào frame mới. Backend request
  đã gửi có thể đã commit; lần login sau luôn đọc state server.
- Child giữ ghost/draft khi lỗi, chỉ thay layout chính sau success; nút retry
  dùng command retry, không tạo place mới. Draft không được lưu shared storage.

VM acceptance C02b.1: forged origin/source/schema không gọi API; bootstrap không
lộ CSRF; mutation serialize, revision server; lost response retry byte-identical;
conflict reload giữ draft; expiry/account switch khóa bridge; dispose chặn late replies.
VM/HTTP tests không chứng minh Godot renderer hoặc browser E2E hoạt động.

## C02b.2 renderer/host acceptance

- `/city.html` yêu cầu session trước tạo iframe, dùng artifact `game-city-build`
  riêng (manifest preview=false, bridgeVersion=1), giữ `/game.html` sandbox.
- Preset Web City dùng scene ServerCity trong staging; không đổi native main scene,
  KnowledgeManager hoặc native placement. Chỉ instantiate 4 scene paths cố định.
- Dựng TileMapLayer axial→stacked-offset, 32×32 cells và tô 4 blocked cells.
  Camera WASD/zoom; chọn inventory → click place, chọn footprint → M/move hoặc
  Delete/thu hồi. Ghost không thay layout chính trước API success.
- Chưa load/đang gửi/uncertain/expired khóa input ghi. Retry giữ draft, conflict
  render snapshot reload và giữ ghost, không tự submit lại. Refresh đọc lại rewards.
- Shell gọi JavaScriptBridge callback bằng JSON string; chỉ chuyển reply đúng
  parent/origin/requestId/schema. Parent dispose trước unload/restart.
- Native regression xác minh authoritative render/retry/conflict/expiry và map;
  web VM/HTTP kiểm tra host/lifecycle. Export/browser phải có evidence riêng C02b.3.
