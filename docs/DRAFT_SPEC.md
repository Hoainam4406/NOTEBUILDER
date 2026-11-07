# Q01b.2 — Autosave nháp editor và khôi phục

- Autosave sau 1 giây ngừng nhập/vẽ vào NoteDraft theo owner; không sửa Note,
  XP hoặc inventory. Chỉ khi bấm Lưu/Ctrl+S mới publish qua Notes API hiện có.
- Lưu title/content/category/tags dạng raw/template/canvasJSON và noteId/
  baseRevision gốc. Không dùng shared localStorage; file-mode vẫn prototype.
- Mỗi editor mới có UUID riêng. Danh sách 20 nháp gần nhất có khôi phục chủ động,
  không tự nhập vào notes. Khôi phục không tự đổi revision sang bản mới nhất.
- GET /api/drafts: metadata; GET /:id: data owner; PUT /:id {revision,data} CAS,
  revision 0 tạo mới. Retry cùng revision/body gần nhất trả record cũ; khác trả
  409 DRAFT_CONFLICT. Unique(owner,draftId). DELETE /:id {revision} CAS.
- data={noteId:null|ObjectId,baseRevision:null|integer,fields:{title,category,
  content,tags,template,canvasJSON},pending:null|{method,noteId,revision,key,payload}}.
  Fields giữ raw input; tags là chuỗi trong editor. Title tối đa 200, category100,
  content100000, tags2000, canvasJSON10000000/object JSON. Tổng data <=12 MiB
  để một document dưới giới hạn BSON, kể cả pending payload. Không silently trim.
- Pending publish được lưu/ACK trong draft trước gửi Notes API. POST giữ key/
  payload qua reload. PUT giữ noteId/revision/payload; retry 409 chỉ xác nhận khi
  GET đúng revision+1 và payload khớp, không tự overwrite phiên bản khác.
- Autosave có timeout20s/abort, owner check, serialized writes; uncertain giữ
  request cũ để retry. Conflict khóa autosave/publish, giữ nội dung RAM để sao chép.
  Đổi account/expiry xóa private editor/list và khóa. Không gửi tiếp account mới.
- Lưu final thành công: nếu nội dung thay đổi trong khi chờ, cập nhật ID/revision,
  giữ editor và autosave bản mới; nếu không đổi, xóa draft đã publish. Cleanup lỗi
  không báo lưu note thất bại; pending cũ vẫn cho replay an toàn khi khôi phục.
- Đóng editor flush nháp trước; lỗi không đóng. Không thay editor khi đang lưu.
  beforeunload cảnh báo nếu dirty/uncertain; pagehide abort. Offline/timeout không
  giả báo autosave thành công: dữ liệu mới chưa ACK chỉ còn RAM, chưa bảo đảm reload.
- Danh sách có xóa nháp chủ động sau confirm. Không TTL/xóa nháp tự động.
- QOL: labels/live status, focus/dialog Escape, responsive notes nav/editor và
  kiểm chứng journey hẹp; không đổi city assets hoặc toàn bộ thiết kế.

Acceptance DFT01 auth/CSRF/owner/input/size; DFT02 CAS/two-process/replay/restart,
no Note/XP mutation; DFT03 debounce/canvas/reload/pending POST/PUT recovery;
DFT04 network/conflict/expiry/pagehide/no late writes; DFT05 Chromium UI restore,
publish, edit/reload, shortcut, responsive/keyboard. Local verification tách
staging/UAT/deploy theo TESTING.md. Scope Q01 hoàn tất chức năng local, không
bao gồm mọi nice-to-have trong blueprint hoặc production acceptance.
