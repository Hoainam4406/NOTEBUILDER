const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Note = require('./models/Note');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/notebuilder_db';

// 1. Middlewares
app.use(cors());
// Hỗ trợ body payload lớn cho ảnh canvas Base64
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve frontend static files
const frontendPath = path.join(__dirname, '..', 'notegame-web');
app.use(express.static(frontendPath));

// 2. REST API Routes

// Health check & DB status
app.get('/api/health', async (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  const count = isDbConnected ? await Note.countDocuments() : 0;
  res.json({
    status: 'online',
    database: isDbConnected ? 'MongoDB Connected' : 'Disconnected',
    totalNotes: count,
    timestamp: new Date().toISOString()
  });
});

// GET /api/notes - Lấy danh sách ghi chú (hỗ trợ lọc và tìm kiếm)
app.get('/api/notes', async (req, res) => {
  try {
    const { template, search } = req.query;
    let query = {};

    if (template && template !== 'all') {
      query.template = template;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: regex },
        { content: regex },
        { category: regex },
        { tags: { $in: [regex] } }
      ];
    }

    // Sắp xếp mới nhất lên đầu
    const notes = await Note.find(query).sort({ createdAt: -1 });
    res.json(notes.map(n => n.toJSON()));
  } catch (error) {
    console.error('Lỗi khi lấy danh sách ghi chú:', error);
    res.status(500).json({ error: 'Không thể tải danh sách ghi chú từ MongoDB' });
  }
});

// GET /api/notes/:id - Lấy chi tiết 1 ghi chú (kèm canvasJSON để mở xưởng vẽ)
app.get('/api/notes/:id', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ error: 'Không tìm thấy ghi chú' });
    }
    res.json(note.toJSON());
  } catch (error) {
    console.error('Lỗi khi lấy chi tiết ghi chú:', error);
    res.status(500).json({ error: 'Lỗi server khi tìm ghi chú' });
  }
});

// POST /api/notes - Tạo ghi chú mới
app.post('/api/notes', async (req, res) => {
  try {
    const { title, category, content, tags, template, canvasImage, canvasJSON, createdAt } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Tiêu đề ghi chú không được để trống' });
    }

    const newNote = new Note({
      title: title.trim(),
      category: category ? category.trim() : 'Tri Thức',
      content: content ? content.trim() : '',
      tags: Array.isArray(tags) ? tags : [],
      template: template || '1',
      canvasImage: canvasImage || null,
      canvasJSON: canvasJSON || null,
      createdAtCustom: createdAt || null
    });

    const saved = await newNote.save();
    res.status(201).json(saved.toJSON());
  } catch (error) {
    console.error('Lỗi khi tạo ghi chú:', error);
    res.status(500).json({ error: 'Không thể lưu ghi chú vào MongoDB' });
  }
});

// PUT /api/notes/:id - Cập nhật ghi chú
app.put('/api/notes/:id', async (req, res) => {
  try {
    const { title, category, content, tags, template, canvasImage, canvasJSON } = req.body;

    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ error: 'Không tìm thấy ghi chú để cập nhật' });
    }

    if (title !== undefined) note.title = title.trim();
    if (category !== undefined) note.category = category.trim();
    if (content !== undefined) note.content = content.trim();
    if (tags !== undefined) note.tags = Array.isArray(tags) ? tags : [];
    if (template !== undefined) note.template = template;
    if (canvasImage !== undefined) note.canvasImage = canvasImage;
    if (canvasJSON !== undefined) note.canvasJSON = canvasJSON;

    const updated = await note.save();
    res.json(updated.toJSON());
  } catch (error) {
    console.error('Lỗi khi cập nhật ghi chú:', error);
    res.status(500).json({ error: 'Không thể cập nhật ghi chú' });
  }
});

// DELETE /api/notes/:id - Xóa ghi chú
app.delete('/api/notes/:id', async (req, res) => {
  try {
    const deleted = await Note.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Ghi chú không tồn tại' });
    }
    res.json({ success: true, message: 'Đã xóa ghi chú thành công' });
  } catch (error) {
    console.error('Lỗi khi xóa ghi chú:', error);
    res.status(500).json({ error: 'Không thể xóa ghi chú' });
  }
});

// POST /api/notes/migrate - Đồng bộ toàn bộ ghi chú từ localStorage lên MongoDB
app.post('/api/notes/migrate', async (req, res) => {
  try {
    const { notes } = req.body;
    if (!Array.isArray(notes) || notes.length === 0) {
      return res.status(400).json({ error: 'Không có dữ liệu hợp lệ để đồng bộ' });
    }

    let insertedCount = 0;
    for (const n of notes) {
      // Bỏ qua id cũ hoặc id dạng seed-x để MongoDB tự sinh _id mới
      const newDoc = new Note({
        title: n.title,
        category: n.category || 'Tri Thức',
        content: n.content || '',
        tags: n.tags || [],
        template: n.template || '1',
        canvasImage: n.canvasImage || null,
        canvasJSON: n.canvasJSON || null,
        createdAtCustom: n.createdAt || null
      });
      await newDoc.save();
      insertedCount++;
    }

    res.json({
      success: true,
      migratedCount: insertedCount,
      message: `Đã đồng bộ thành công ${insertedCount} ghi chú từ LocalStorage lên MongoDB!`
    });
  } catch (error) {
    console.error('Lỗi migrate dữ liệu:', error);
    res.status(500).json({ error: 'Quá trình đồng bộ dữ liệu gặp sự cố' });
  }
});

// GET /api/godot/export - Dữ liệu xuất cho Godot Engine
app.get('/api/godot/export', async (req, res) => {
  try {
    const notes = await Note.find().sort({ createdAt: -1 });
    const formattedNotes = notes.map(n => n.toJSON());

    const totalXp = formattedNotes.length * 50;
    const level = Math.floor(totalXp / 100) + 1;
    const categories = [...new Set(formattedNotes.map(n => n.category))];

    res.json({
      level: level,
      totalXp: totalXp,
      notesCount: formattedNotes.length,
      categories: categories,
      source: 'NOTEBUILDER MongoDB Backend',
      exportedAt: new Date().toISOString(),
      notes: formattedNotes
    });
  } catch (error) {
    console.error('Lỗi xuất dữ liệu Godot:', error);
    res.status(500).json({ error: 'Không thể xuất dữ liệu Godot' });
  }
});

// Hàm mở trình duyệt tự động
function openBrowser(url) {
  const startCmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : (process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`);
  exec(startCmd, (err) => {
    if (err) console.log(`ℹ️ Bạn có thể truy cập website tại: ${url}`);
  });
}

// 3. Khởi động kết nối MongoDB và Server
async function startServer() {
  try {
    console.log('🔄 Đang kết nối tới MongoDB:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('🍃 Kết nối MongoDB thành công!');

    // Tự động kiểm tra: Nếu db trống thì tạo seed data
    const count = await Note.countDocuments();
    if (count === 0) {
      console.log('ℹ️ Database đang trống, tiến hành nạp dữ liệu mẫu ban đầu...');
      const seedScript = require('./seed');
    }

    app.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(`🚀 NOTEBUILDER Server đang chạy tại:`);
      console.log(`👉 http://localhost:${PORT}`);
      console.log(`👉 http://localhost:${PORT}/notes.html`);
      console.log(`👉 API Health: http://localhost:${PORT}/api/health`);
      console.log(`===============================================`);

      if (process.argv.includes('--open') || process.env.AUTO_OPEN === 'true') {
        const url = `http://localhost:${PORT}`;
        console.log(`🌐 Đang tự động mở website trên trình duyệt: ${url}`);
        openBrowser(url);
      }
    });
  } catch (error) {
    console.error('❌ Không thể kết nối MongoDB:', error.message);
    process.exit(1);
  }
}

startServer();
