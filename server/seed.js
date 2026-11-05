const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const Note = require('./models/Note');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/notebuilder_db';

const SEED_NOTES = [
  {
    template: '1',
    title: 'Định Lý Pitago & Hình Học Không Gian',
    category: 'Toán Học',
    content: '1. Tam giác vuông: c² = a² + b².\n2. Ý nghĩa hình học: Diện tích hình vuông cạnh huyền bằng tổng diện tích hai hình vuông góc vuông.\n3. Ứng dụng: Tính khoảng cách điểm trong không gian Godot (Vector2.distance_to).',
    tags: ['Toán', 'HìnhHọc', 'GodotMath'],
    createdAtCustom: '31/10/2026',
    canvasImage: null,
    canvasJSON: null
  },
  {
    template: '2',
    title: 'Kiến Trúc Scene & Node trong Godot 4',
    category: 'Lập Trình Godot',
    content: '• Mọi thực thể trong Godot đều kế thừa từ Node.\n• Tree-based structure: Gốc là SceneTree, các node con truyền tín hiệu (Signals) lên node cha.\n• Tối ưu: Dùng CharacterBody3D cho nhân vật chính di chuyển trong phòng tri thức.',
    tags: ['Godot4', 'GameDev', 'GDScript'],
    createdAtCustom: '31/10/2026',
    canvasImage: null,
    canvasJSON: null
  },
  {
    template: '3',
    title: 'Phương Pháp Ghi Chú Feynman',
    category: 'Phương Pháp Học',
    content: 'Bước 1: Chọn một chủ đề cần học.\nBước 2: Dạy lại kiến thức đó cho người khác bằng từ ngữ đơn giản.\nBước 3: Xác định lỗ hổng kiến thức và tra cứu lại tài liệu.\nBước 4: Đơn giản hóa và hệ thống hóa thành sơ đồ mindmap.',
    tags: ['Feynman', 'TuDuy', 'HeThong'],
    createdAtCustom: '31/10/2026',
    canvasImage: null,
    canvasJSON: null
  },
  {
    template: '4',
    title: 'Định Luật Vạn Vật Hấp Dẫn Newton',
    category: 'Vật Lý',
    content: 'F = G * (m1 * m2) / r²\n- G = 6.674 × 10⁻¹¹ N·m²/kg²\n- Lực hấp dẫn tác động lên mọi vật thể có khối lượng trong vũ trụ.\n- Trong Godot: Có thể mô phỏng trường trọng lực tùy chỉnh bằng Area3D Gravity.',
    tags: ['VatLy', 'Newton', 'Simulation'],
    createdAtCustom: '31/10/2026',
    canvasImage: null,
    canvasJSON: null
  }
];

async function runSeed() {
  try {
    console.log('Connecting to MongoDB at:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB.');

    const count = await Note.countDocuments();
    if (count > 0) {
      console.log(`ℹ️ Database already has ${count} notes. Clearing before re-seeding...`);
      await Note.deleteMany({});
    }

    const inserted = await Note.insertMany(SEED_NOTES);
    console.log(`🎉 Successfully seeded ${inserted.length} sample notes into MongoDB!`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

runSeed();
