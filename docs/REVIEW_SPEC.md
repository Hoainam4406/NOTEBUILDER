# L01 — Flashcards, phiên ôn tập và hướng dẫn nhập môn v1

## Phạm vi / quyết định

- Learning & Review theo blueprint mục 3/M07 và milestone 5; một concept city
  hiện có. Không thêm asset, AI, spaced-repetition scheduler hoặc quest.
- Flashcard mặt trước = title, mặt sau = content (Tóm tắt ý chính) của note.
  Canvas-only/title-only không đủ dữ liệu làm đáp án; UI hướng dẫn bổ sung tóm tắt.
- Hai mức tự đánh giá: `again` (Cần ôn lại), `remembered` (Đã nhớ). Đây là tự
  đánh giá, không là câu trả lời đúng do server chấm. Không trao XP/reward;
  không đổi XP policy v1 hoặc khóa review theo level.
- Chọn 1..20 notes, mỗi user tối đa một phiên active. Snapshot title/content/
  noteRevision từ owner notes trong transaction; sửa/xóa note sau đó không làm
  đổi bộ thẻ đang học. UI ghi rõ dùng nội dung lúc bắt đầu phiên.
- Giữ text chỉ trong phiên active. Khi completed/closed, xóa question/answer khỏi
  snapshot và giữ note ID/revision, rating/thời gian để xem tổng kết. Phiên active
  giữ snapshot cả khi note gốc bị xóa; không chia sẻ sang account khác.

## API `/api/reviews` (session, mutations cần CSRF)

| Method/path | Contract |
|---|---|
| GET `/notes` | Tối đa 100 notes mới cập nhật có content không trắng; `{notes:[{id,title,category,revision}],limit:100}`, không gửi canvas |
| GET `/` | `{active:session|null,recent:[summary]}`; tối đa 10 phiên closed/completed gần nhất |
| POST `/` | `{noteIds:[ObjectId...]}` + Idempotency-Key; trả `{session,replayed}`, 201 lần đầu/200 replay |
| GET `/:id` | `{session}` owner-only |
| POST `/:id/answers` | `{cardIndex,rating,revision}` + Idempotency-Key; trả `{session,replayed}` |
| POST `/:id/close` | `{revision}` + Idempotency-Key; kết thúc sớm, giữ ratings đã ghi |

`session={id,status,revision,nextIndex,cards:[{noteId,noteRevision,question,answer,
rating,reviewedAt}],createdAt,updatedAt}`. Summary có id/status/total/reviewed/
remembered/createdAt/updatedAt, không chứa text hoặc credentials/request hashes.
Server chỉ nhận IDs/rating/revision; không nhận câu hỏi/đáp án, owner hoặc XP.

## Persistence / retry

- `review_sessions`: unique(userId,createKey), partial unique userId khi active;
  cards embedded tối đa 20 và receipts embedded tối đa 21. Snapshot mỗi note tối
  đa 200 title / 100000 content theo note contract; không lưu canvas.
- Start trong transaction, note reads cùng snapshot; unique init races retry có
  giới hạn. Cùng key khác noteIds/order trả 409 IDEMPOTENCY_CONFLICT. Replay đọc
  lại phiên hiện tại, không reset thẻ đã đánh giá.
- Answer/close chỉ đổi một review document: atomic findOneAndUpdate với owner,
  revision, status, nextIndex. Receipt key/hash, rating/index, revision/status và
  text cleanup cùng update; không cần transaction khác vì không đổi XP/inventory.
- Mutation keys scope theo user/session, không tái dùng createKey cho answer/close.
  Replay tra receipt trước CAS và trả session hiện tại. Hai tab ghi revision cũ
  chỉ một thành công; không tự ghi lại lựa chọn trên state mới.
- Network/timeout/5xx giữ key/method/path/body; khóa edits tới explicit retry.
  409 REVIEW_CONFLICT reload cùng session, giữ lựa chọn chưa xác nhận để user xem
  nhưng không tự submit. 401/CSRF_INVALID xóa state, khóa tới login/reload mới.
- Bootstrap/lưu có AbortSignal + timeout 20s; pagehide abort/dispose, kết quả cũ
  không ghi vào UI mới. Không dùng localStorage cho nội dung/receipt/auth.

Errors `{error,code}`: 400 INVALID_INPUT; 401 AUTH_REQUIRED;
403 CSRF_INVALID; 404 REVIEW_NOT_FOUND/REVIEW_NOTE_NOT_FOUND;
409 REVIEW_ACTIVE/REVIEW_CONFLICT/IDEMPOTENCY_CONFLICT;
422 REVIEW_NOTE_EMPTY; 503 REVIEW_DATA_INVALID. Không lộ foreign note/session.

## UI / onboarding

- `/review.html`: session gate; chọn notes hoặc resume phiên active; progress,
  lật đáp án, tự đánh giá, retry/refresh/đóng phiên và tổng kết/history ngắn.
- Reload/resume mở thẻ chưa ghi kế tiếp; flip là UI state, không là evidence
  đủ điều kiện thưởng. Chỉ chuyển thẻ sau response server thành công.
- Empty/loading/saving/error/conflict/expiry có thông báo rõ. Selection/rating
  chưa xác nhận giữ trong RAM khi lỗi; không hiện completed nếu request lỗi.
- Semantic form/buttons/labels, aria-live, focus vào heading sau chuyển thẻ,
  keyboard Tab/Enter/Space và bố cục một cột trên mobile. Render textContent,
  không innerHTML từ note; nội dung note là untrusted data.
- Kho ghi chú có hướng dẫn ngắn không chặn editor: lưu note, XP có điều kiện,
  mở thành phố và ôn tập. Links review không phụ thuộc level hoặc công trình mới.

## Acceptance / evidence cần có

- REV-01: notes/session/answer/close auth+CSRF+owner; foreign/legacy notes ẩn.
- REV-02: start chọn đúng thứ tự/snapshot, một active/user; ID/input/empty bị chặn.
- REV-03: answer/close retry cùng key chỉ một lần, conflict key/payload/operation;
  hai processes cùng revision chỉ một thắng; không đổi XP/rewards/inventory.
- REV-04: reload/API restart khôi phục index/ratings; edit/delete note giữ snapshot;
  complete/close dọn text; snapshot sai trả lỗi kiểm soát.
- REV-05: UI mất mạng/5xx/timeout giữ request/lựa chọn; retry cùng body/key; conflict
  không tự grade; expiry/pagehide không dùng state tài khoản cũ.
- REV-06: browser chọn notes → flip → grade → reload/resume → complete/history;
  kiểm tra empty state, keyboard, narrow viewport và onboarding links.

Gate local: syntax + regression + MongoDB integration riêng + browser evidence +
diff review. Staging/UAT/CI remote là pending đến khi có evidence tương ứng.
