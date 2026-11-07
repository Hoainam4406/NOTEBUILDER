# Q01a — Thành tựu và nhiệm vụ học tập v1

## Scope / acceptance trước implementation

- M08/blueprint 3, 5.3: gallery thành tựu và daily learning quests, UI tương tác
  cùng origin. Không mở concept city, thêm assets, AI hoặc đổi XP policy v1.
- Phần thưởng bản này là huy hiệu/xác nhận hoàn thành. Không cộng XP, cấp thêm
  inventory hoặc khóa công cụ học tập. Q01b autosave/khôi phục nháp và audit QOL
  toàn app là checkpoint tiếp theo, không coi hoàn tất Q01 chỉ với gallery.
- Năm thành tựu lifetime: note đủ điều kiện đầu tiên, 5 notes đã nhận XP, 3 ngày
  UTC có note nhận XP, phiên review completed đầu tiên, lần lưu city đầu tiên.
- Hai quest mỗi ngày UTC: 1 note thực sự nhận XP; 3 thẻ được đánh giá (`again`
  hoặc `remembered`, kể cả phiên active/closed). Tự đánh giá không là điểm đúng/sai.
  Không phạt ngày nghỉ. Quest reset 00:00 UTC; không dùng timezone client.
- Nguồn sự thật: XpEvent amount>0 (không đếm draft/duplicate/cap), ReviewSession
  status completed + cards.reviewedAt, City revision>0. Không nhận counters từ UI.
  Ledger vẫn giữ note bị xóa; review giữ metadata sau hoàn tất; city revision
  không giảm khi remove. Dữ liệu cũ đủ điều kiện được tính, không import legacy.

## API / dữ liệu

- Session/owner cho tất cả `/api/journey`; mutations cần CSRF.
- GET `/api/journey`: snapshot nhất quán trong transaction, `{day,resetsAt,
  achievements:[entry],quests:[entry]}`. Day UTC do server xác định một lần/request.
- Entry: `{id,title,description,target,progress,eligible,claimedAt,href}`.
  Progress clamp tới target; claimedAt từ record owner, không gửi note/card text.
- PUT `/api/journey/achievements/:id` body `{}`; PUT `/api/journey/quests/:id`
  body `{day:"YYYY-MM-DD"}`; trả `{claim:{id,kind,period,claimedAt},replayed}`.
  Paths + owner + period xác định resource duy nhất; PUT vốn idempotent, không
  cần client event key. Không nhận XP/reward/progress/owner/claimedAt.
- Quest day khác ngày server hiện tại trả 409 QUEST_DAY_CHANGED, kể cả retry
  hôm qua; UI tải lại ngày mới và không tự claim. Replay achievement bất kỳ lúc
  nào, quest trong đúng ngày trả record/timestamp ban đầu.
- Claim transaction đọc evidence và ghi `JourneyClaim` cùng snapshot. Unique
  (userId,kind,period,entryId), retry bounded khi unique race. Snapshot/claim không
  ghi XP/notes/review/city/inventory. Không có reward claim công khai khác.
- Lưu 5 badge records + tối đa 2 quest records/ngày/account; response chỉ chứa
  5 lifetime + ngày hiện tại. Record có kind/period/entryId/claimedAt, không text.
- Errors `{error,code}`: 400 INVALID_INPUT, 401 AUTH_REQUIRED, 403 CSRF_INVALID,
  404 JOURNEY_NOT_FOUND, 409 JOURNEY_NOT_READY/QUEST_DAY_CHANGED;
  DB failures theo error contract hiện hữu, không lộ URI/stack/foreign data.

## UI và failure states

- `/journey.html`: ngày/reset UTC, progress/links tới notes/review/city, nhận huy
  hiệu/xác nhận quest, state chưa đạt/đủ điều kiện/đã nhận, empty/loading/error.
- Timeout 20s/abort; kiểm tra owner trước load/write/retry. Uncertain PUT giữ
  path/body, khóa edits tới explicit retry; không tô claimed trước server xác nhận.
  Confirmation PUT thành công nhưng GET tiếp theo lỗi vẫn ghi rõ đã nhận và cho
  tải lại, không gửi lại với resource/ngày mới. 409 reload, không tự claim.
- Hết hạn/account switch xóa private progress và pending; pagehide abort/dispose.
  Tab hiện trở lại cần refresh, không tự dựa ngày máy client hoặc set claim.
- Semantic buttons/progress, textContent, aria-live/focus, keyboard và narrow UI.
  Không localStorage cho progress/claim; không giả lưu local khi API lỗi.

## Test cases / gate local

- JRN-01 auth/CSRF/owner; invalid ID/body/day/injected progress, no data leak.
- JRN-02 count đúng awarded ledger, distinct UTC days, completed session, rating
  times/city; edit/delete/refund không gỡ huy hiệu hoặc giảm lịch sử thật.
- JRN-03 same claim concurrent qua hai API processes chỉ một record/timestamp;
  retries trả record cũ; không đổi XP/inventory/rewards. Not-ready không ghi gì.
- JRN-04 rollback trước commit, API restart, UTC rollover và stale day reject.
- JRN-05 UI literal data/loading, network/503/timeout identical retry, expired/
  owner switch/pagehide, confirmed write + secondary GET failure, no auto-claim.
- JRN-06 Chromium local: note → eligible → claim → reload, review quest, two-tab
  replay, mất phản hồi sau commit, expiry, keyboard và viewport hẹp.

Syntax/regression/DB integration riêng/browser/diff review trước commit và push.
Local verified chưa staging accepted. Không bao gồm deploy trong mốc localhost
user vừa xác nhận; staging/UAT/production vẫn có gate riêng.
