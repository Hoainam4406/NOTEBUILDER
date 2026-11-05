/**
 * NOTEBUILDER - Notes Hub & Fabric.js Interactive Canvas Studio
 * Supports drawing directly on paper templates, text mode, sticky notes, and gamification
 */

// API & Backend Configuration
const API_BASE_URL = (window.location.protocol.startsWith('http') && window.location.port === '5050') 
  ? '' 
  : 'http://localhost:5050';

let isMongoConnected = false;

// Initial Seed Data with default canvas mockups
const DEFAULT_SAMPLE_NOTES = [
  {
    id: 'seed-1',
    template: '1', // Scroll (note1.png)
    title: 'Định Lý Pitago & Hình Học Không Gian',
    category: 'Toán Học',
    content: '1. Tam giác vuông: c² = a² + b².\n2. Ý nghĩa hình học: Diện tích hình vuông cạnh huyền bằng tổng diện tích hai hình vuông góc vuông.\n3. Ứng dụng: Tính khoảng cách điểm trong không gian Godot (Vector2.distance_to).',
    tags: ['Toán', 'HìnhHọc', 'GodotMath'],
    createdAt: '31/10/2026',
    canvasImage: null,
    canvasJSON: null
  },
  {
    id: 'seed-2',
    template: '2', // Sticky Tape (note2.png)
    title: 'Kiến Trúc Scene & Node trong Godot 4',
    category: 'Lập Trình Godot',
    content: '• Mọi thực thể trong Godot đều kế thừa từ Node.\n• Tree-based structure: Gốc là SceneTree, các node con truyền tín hiệu (Signals) lên node cha.\n• Tối ưu: Dùng CharacterBody3D cho nhân vật chính di chuyển trong phòng tri thức.',
    tags: ['Godot4', 'GameDev', 'GDScript'],
    createdAt: '31/10/2026',
    canvasImage: null,
    canvasJSON: null
  },
  {
    id: 'seed-3',
    template: '3', // Pinned (note3.png)
    title: 'Phương Pháp Ghi Chú Feynman',
    category: 'Phương Pháp Học',
    content: 'Bước 1: Chọn một chủ đề cần học.\nBước 2: Dạy lại kiến thức đó cho người khác bằng từ ngữ đơn giản.\nBước 3: Xác định lỗ hổng kiến thức và tra cứu lại tài liệu.\nBước 4: Đơn giản hóa và hệ thống hóa thành sơ đồ mindmap.',
    tags: ['Feynman', 'TuDuy', 'HeThong'],
    createdAt: '31/10/2026',
    canvasImage: null,
    canvasJSON: null
  },
  {
    id: 'seed-4',
    template: '4', // Parchment (note4.png)
    title: 'Định Luật Vạn Vật Hấp Dẫn Newton',
    category: 'Vật Lý',
    content: 'F = G * (m1 * m2) / r²\n- G = 6.674 × 10⁻¹¹ N·m²/kg²\n- Lực hấp dẫn tác động lên mọi vật thể có khối lượng trong vũ trụ.\n- Trong Godot: Có thể mô phỏng trường trọng lực tùy chỉnh bằng Area3D Gravity.',
    tags: ['VatLy', 'Newton', 'Simulation'],
    createdAt: '31/10/2026',
    canvasImage: null,
    canvasJSON: null
  }
];

// App State
let notes = [];
let currentFilter = 'all';
let editingNoteId = null;

// Paper Template Images
const TEMPLATE_IMAGES = {
  '1': 'assets/note1.png',
  '2': 'assets/note2.png',
  '3': 'assets/note3.png',
  '4': 'assets/note4.png'
};

const TEMPLATE_NAMES = {
  '1': 'Cuộn giấy cổ',
  '2': 'Giấy dán Tape',
  '3': 'Ghim bảng',
  '4': 'Bản thảo nhăn'
};

// Fabric.js Canvas State
let fabricCanvas = null;
let currentPenColor = '#1a1a1a';
let currentPenWidth = 4;
let isPenMode = true;
let canvasUndoStack = [];
let isUndoAction = false;

// DOM Elements
const notesGrid = document.getElementById('notesGrid');
const searchInput = document.getElementById('searchInput');
const noteModal = document.getElementById('noteModal');
const noteForm = document.getElementById('noteForm');
const btnOpenCreateModal = document.getElementById('btnOpenCreateModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelModal = document.getElementById('btnCancelModal');
const btnExportGodot = document.getElementById('btnExportGodot');
const toast = document.getElementById('toastMsg');
const toastText = document.getElementById('toastText');

// Canvas Control DOM
const btnModePen = document.getElementById('btnModePen');
const btnModeText = document.getElementById('btnModeText');
const btnAddText = document.getElementById('btnAddText');
const btnAddStickyYellow = document.getElementById('btnAddStickyYellow');
const btnAddStickyBlue = document.getElementById('btnAddStickyBlue');
const btnUndoCanvas = document.getElementById('btnUndoCanvas');
const btnDeleteSelected = document.getElementById('btnDeleteSelected');
const btnClearCanvas = document.getElementById('btnClearCanvas');
const brushSizeSelect = document.getElementById('brushSizeSelect');

// Gamification Dashboard DOM
const statLevelNum = document.getElementById('statLevelNum');
const statLevelTitle = document.getElementById('statLevelTitle');
const statXpText = document.getElementById('statXpText');
const statProgressFill = document.getElementById('statProgressFill');
const godotAssetStatus = document.getElementById('godotAssetStatus');

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await checkDatabaseConnection();
  await autoMigrateLocalStorage();
  await loadNotes();
});

// Check MongoDB Connection via Backend API
async function checkDatabaseConnection() {
  const dbBadge = document.getElementById('dbStatusBadge');
  const dbText = document.getElementById('dbStatusText');
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      isMongoConnected = true;
      if (dbBadge && dbText) {
        dbBadge.classList.remove('offline');
        dbText.textContent = '🍃 MongoDB Connected';
        dbBadge.title = `Đã kết nối cơ sở dữ liệu MongoDB (${data.totalNotes} ghi chú)`;
      }
      return true;
    }
  } catch (err) {
    console.warn('Backend server chưa chạy. Sử dụng chế độ Offline LocalStorage.');
  }

  isMongoConnected = false;
  if (dbBadge && dbText) {
    dbBadge.classList.add('offline');
    dbText.textContent = '💾 Offline LocalStorage';
    dbBadge.title = 'Đang lưu trữ cục bộ trên trình duyệt (Chạy server Node.js để kết nối MongoDB)';
  }
  return false;
}

// Auto migrate LocalStorage to MongoDB
async function autoMigrateLocalStorage() {
  if (!isMongoConnected) return;
  const migratedFlag = localStorage.getItem('notebuilder_migrated_to_mongo');
  const saved = localStorage.getItem('notebuilder_notes');

  if (saved && !migratedFlag) {
    try {
      const localNotes = JSON.parse(saved);
      // Chỉ migrate ghi chú thực tế của người dùng
      const userCustomNotes = localNotes.filter(n => n.id && !n.id.startsWith('seed-'));
      if (userCustomNotes.length > 0) {
        console.log(`Đang tự động di chuyển ${userCustomNotes.length} ghi chú lên MongoDB...`);
        const res = await fetch(`${API_BASE_URL}/api/notes/migrate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: userCustomNotes })
        });
        if (res.ok) {
          localStorage.setItem('notebuilder_migrated_to_mongo', 'true');
          showToast(`Đã đồng bộ ${userCustomNotes.length} ghi chú lên MongoDB thành công! 🍃`);
        }
      } else {
        localStorage.setItem('notebuilder_migrated_to_mongo', 'true');
      }
    } catch (e) {
      console.error('Lỗi khi migrate LocalStorage:', e);
    }
  }
}

// Load notes from MongoDB (with fallback to localStorage)
async function loadNotes() {
  if (isMongoConnected) {
    try {
      const url = currentFilter !== 'all' 
        ? `${API_BASE_URL}/api/notes?template=${currentFilter}`
        : `${API_BASE_URL}/api/notes`;
      const res = await fetch(url);
      if (res.ok) {
        notes = await res.json();
        updateGamification();
        renderNotes();
        return;
      }
    } catch (e) {
      console.error('Lỗi tải từ MongoDB, chuyển sang LocalStorage:', e);
    }
  }

  // Fallback to localStorage
  const saved = localStorage.getItem('notebuilder_notes');
  if (saved) {
    try {
      notes = JSON.parse(saved);
    } catch (e) {
      notes = [...DEFAULT_SAMPLE_NOTES];
    }
  } else {
    notes = [...DEFAULT_SAMPLE_NOTES];
    saveNotesToStorage();
  }
  updateGamification();
  renderNotes();
}

function saveNotesToStorage() {
  localStorage.setItem('notebuilder_notes', JSON.stringify(notes));
}

/* =======================================================
   FABRIC.JS INTERACTIVE CANVAS INITIALIZATION & METHODS
   ======================================================= */
function initFabricCanvas() {
  if (fabricCanvas) return;

  const canvasEl = document.getElementById('noteCanvas');
  if (!canvasEl) return;

  fabricCanvas = new fabric.Canvas('noteCanvas', {
    isDrawingMode: true,
    selection: false,
    backgroundColor: '#ffffff'
  });

  // Setup Free Drawing Brush
  fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
  fabricCanvas.freeDrawingBrush.color = currentPenColor;
  fabricCanvas.freeDrawingBrush.width = currentPenWidth;

  // History tracking for undo
  fabricCanvas.on('object:added', () => {
    if (!isUndoAction) saveCanvasState();
  });
  fabricCanvas.on('object:modified', () => {
    if (!isUndoAction) saveCanvasState();
  });

  setupCanvasControls();
}

// Set Background Image of the Canvas based on Selected Paper Template
function setCanvasPaperBackground(templateId, callback) {
  if (!fabricCanvas) return;
  const imgUrl = TEMPLATE_IMAGES[templateId] || TEMPLATE_IMAGES['1'];

  fabric.Image.fromURL(imgUrl, (img) => {
    if (!img) return;
    const canvasWidth = fabricCanvas.getWidth();
    const canvasHeight = fabricCanvas.getHeight();

    // Scale template image to fit canvas perfectly
    img.set({
      originX: 'left',
      originY: 'top',
      scaleX: canvasWidth / img.width,
      scaleY: canvasHeight / img.height,
      selectable: false,
      evented: false
    });

    fabricCanvas.setBackgroundImage(img, () => {
      fabricCanvas.renderAll();
      if (callback) callback();
    });
  });
}

// Switch between Pen Mode and Text Mode
function setPenMode(active) {
  isPenMode = active;
  if (!fabricCanvas) return;

  if (active) {
    fabricCanvas.isDrawingMode = true;
    fabricCanvas.selection = false;
    fabricCanvas.freeDrawingBrush.color = currentPenColor;
    fabricCanvas.freeDrawingBrush.width = currentPenWidth;

    btnModePen?.classList.add('active');
    btnModeText?.classList.remove('active');
  } else {
    fabricCanvas.isDrawingMode = false;
    fabricCanvas.selection = true;

    btnModeText?.classList.add('active');
    btnModePen?.classList.remove('active');
  }
}

// Canvas UI Events Setup
function setupCanvasControls() {
  // Mode toggles
  btnModePen?.addEventListener('click', () => setPenMode(true));
  btnModeText?.addEventListener('click', () => setPenMode(false));

  // Color Palette Dots
  const colorDots = document.querySelectorAll('.color-dot');
  colorDots.forEach(dot => {
    dot.addEventListener('click', () => {
      colorDots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      currentPenColor = dot.getAttribute('data-color') || '#1a1a1a';
      if (fabricCanvas && fabricCanvas.freeDrawingBrush) {
        fabricCanvas.freeDrawingBrush.color = currentPenColor;
      }
      // If currently on text mode, switch to pen mode on color select
      setPenMode(true);
    });
  });

  // Brush Size
  brushSizeSelect?.addEventListener('change', (e) => {
    currentPenWidth = parseInt(e.target.value, 10) || 4;
    if (fabricCanvas && fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush.width = currentPenWidth;
    }
  });

  // Add Text Box
  btnAddText?.addEventListener('click', () => {
    if (!fabricCanvas) return;
    setPenMode(false);

    const text = new fabric.IText('Nhấp đúp để gõ kiến thức...', {
      left: 70,
      top: 140,
      fontSize: 18,
      fontFamily: 'Montserrat, sans-serif',
      fill: currentPenColor.includes('rgba') ? '#1a1a1a' : currentPenColor,
      fontWeight: '600',
      editable: true
    });

    fabricCanvas.add(text);
    fabricCanvas.setActiveObject(text);
    text.enterEditing();
    text.selectAll();
    fabricCanvas.renderAll();
  });

  // Add Yellow Sticky Memo Note
  btnAddStickyYellow?.addEventListener('click', () => {
    createStickyMemo('#fef9c3', '#713f12', 'Ghi chú nhớ:\n• Luận điểm quan trọng\n• Công thức áp dụng');
  });

  // Add Blue Sticky Memo Note
  btnAddStickyBlue?.addEventListener('click', () => {
    createStickyMemo('#e0f2fe', '#0369a1', 'Ghi chú nhanh:\n• Mẹo ghi nhớ\n• Câu hỏi cần giải đáp');
  });

  // Delete Selected Object
  btnDeleteSelected?.addEventListener('click', () => {
    if (!fabricCanvas) return;
    const activeObjects = fabricCanvas.getActiveObjects();
    if (activeObjects && activeObjects.length > 0) {
      activeObjects.forEach(obj => fabricCanvas.remove(obj));
      fabricCanvas.discardActiveObject();
      fabricCanvas.renderAll();
      saveCanvasState();
    }
  });

  // Undo Action
  btnUndoCanvas?.addEventListener('click', () => {
    undoCanvasState();
  });

  // Clear Canvas (keep background template)
  btnClearCanvas?.addEventListener('click', () => {
    if (!fabricCanvas) return;
    if (confirm('Bạn có muốn xóa toàn bộ nét vẽ và chữ trên tờ giấy này?')) {
      const selectedTemplate = document.querySelector('input[name="noteTemplate"]:checked')?.value || '1';
      fabricCanvas.clear();
      setCanvasPaperBackground(selectedTemplate);
      canvasUndoStack = [];
    }
  });
}

// Create a Sticky Memo note onto canvas
function createStickyMemo(bgColor, textColor, defaultText) {
  if (!fabricCanvas) return;
  setPenMode(false);

  const rect = new fabric.Rect({
    width: 220,
    height: 140,
    fill: bgColor,
    stroke: 'rgba(0,0,0,0.12)',
    strokeWidth: 1,
    rx: 8,
    ry: 8,
    shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.2)', blur: 10, offsetX: 3, offsetY: 5 })
  });

  const text = new fabric.IText(defaultText, {
    fontSize: 14,
    fontFamily: 'Montserrat, sans-serif',
    fill: textColor,
    left: 14,
    top: 14,
    width: 190,
    editable: true
  });

  const group = new fabric.Group([rect, text], {
    left: 80,
    top: 160,
    subTargetCheck: true
  });

  fabricCanvas.add(group);
  fabricCanvas.setActiveObject(group);
  fabricCanvas.renderAll();
  saveCanvasState();
}

// History Stack for Undo
function saveCanvasState() {
  if (!fabricCanvas || isUndoAction) return;
  const json = JSON.stringify(fabricCanvas.toJSON());
  if (canvasUndoStack.length > 25) canvasUndoStack.shift();
  canvasUndoStack.push(json);
}

function undoCanvasState() {
  if (!fabricCanvas || canvasUndoStack.length <= 1) return;
  isUndoAction = true;
  canvasUndoStack.pop(); // Pop current
  const prevState = canvasUndoStack[canvasUndoStack.length - 1];
  fabricCanvas.loadFromJSON(prevState, () => {
    fabricCanvas.renderAll();
    isUndoAction = false;
  });
}

/* =======================================================
   GENERAL APP & MODAL SETUP
   ======================================================= */
function setupEventListeners() {
  // Open Create Modal
  btnOpenCreateModal?.addEventListener('click', () => {
    openModal();
  });

  // Close Modal
  btnCloseModal?.addEventListener('click', closeModal);
  btnCancelModal?.addEventListener('click', closeModal);

  noteModal?.addEventListener('click', (e) => {
    if (e.target === noteModal) closeModal();
  });

  // Template selector click handler -> updates canvas background
  const radioLabels = document.querySelectorAll('.template-radio-label');
  radioLabels.forEach(label => {
    label.addEventListener('click', () => {
      radioLabels.forEach(l => l.classList.remove('selected'));
      label.classList.add('selected');
      const radio = label.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        setCanvasPaperBackground(radio.value);
      }
    });
  });

  // Form submit (create or update)
  noteForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveNoteFromForm();
  });

  // Search input
  searchInput?.addEventListener('input', () => {
    renderNotes();
  });

  // Template filter buttons
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter') || 'all';
      renderNotes();
    });
  });

  // Export to Godot
  btnExportGodot?.addEventListener('click', () => {
    window.GodotBridge.exportJSONFile();
    showToast('Đã tải tệp JSON sẵn sàng kết nối với Godot Engine!');
  });
}

// Update Level, XP and Godot Asset tier
function updateGamification() {
  const noteCount = notes.length;
  const xpPerNote = 50;
  const totalXp = noteCount * xpPerNote;
  
  // Level calculation: 100 XP per level
  const level = Math.floor(totalXp / 100) + 1;
  const xpInCurrentLevel = totalXp % 100;
  const progressPercent = Math.min(100, Math.max(8, xpInCurrentLevel));

  let tierName = 'Tập Sự Tri Thức';
  let godotAsset = 'Bàn Học Cơ Bản (Asset Tier 1)';

  if (level >= 5) {
    tierName = 'Đại Bậc Thầy Vũ Trụ';
    godotAsset = 'Không Gian Đa Chiều Siêu Cấp (Asset Tier 5)';
  } else if (level >= 4) {
    tierName = 'Kiến Trúc Sư Tri Thức';
    godotAsset = 'Vũ Trụ Sáng Tạo Vô Cực (Asset Tier 4)';
  } else if (level >= 3) {
    tierName = 'Học Giả Không Gian';
    godotAsset = 'Thư Viện Ma Thuật Hoàng Gia (Asset Tier 3)';
  } else if (level >= 2) {
    tierName = 'Nhà Nghiên Cứu Trẻ';
    godotAsset = 'Phòng Thí Nghiệm Hiện Đại (Asset Tier 2)';
  }

  if (statLevelNum) statLevelNum.textContent = level;
  if (statLevelTitle) statLevelTitle.textContent = `Cấp ${level}: ${tierName}`;
  if (statXpText) statXpText.textContent = `${totalXp} XP (${xpInCurrentLevel}/100 để lên cấp)`;
  if (statProgressFill) statProgressFill.style.width = `${progressPercent}%`;
  if (godotAssetStatus) godotAssetStatus.textContent = godotAsset;
}

// Render Notes Grid
function renderNotes() {
  if (!notesGrid) return;

  const searchTerm = (searchInput?.value || '').toLowerCase().trim();

  // Filter notes
  const filtered = notes.filter(n => {
    if (currentFilter !== 'all' && n.template !== currentFilter) return false;
    if (searchTerm) {
      const matchTitle = (n.title || '').toLowerCase().includes(searchTerm);
      const matchContent = (n.content || '').toLowerCase().includes(searchTerm);
      const matchCat = (n.category || '').toLowerCase().includes(searchTerm);
      const matchTags = (n.tags || []).some(t => t.toLowerCase().includes(searchTerm));
      return matchTitle || matchContent || matchCat || matchTags;
    }
    return true;
  });

  if (filtered.length === 0) {
    notesGrid.innerHTML = `
      <div class="empty-notes-state">
        <div class="empty-icon">📝</div>
        <h3>Không tìm thấy ghi chú nào</h3>
        <p>Hãy bấm nút "+ Viết Note Mới" để vẽ và viết bài học đầu tiên của bạn!</p>
      </div>
    `;
    return;
  }

  notesGrid.innerHTML = filtered.map(note => {
    const templateName = TEMPLATE_NAMES[note.template] || 'Ghi chú';
    const tagsHtml = (note.tags || []).map(tag => `<span class="tag-item">#${escapeHtml(tag)}</span>`).join('');

    // If note has a rendered canvas thumbnail artwork
    let thumbnailHtml = '';
    if (note.canvasImage) {
      thumbnailHtml = `
        <div class="note-canvas-thumbnail-box" onclick="openEditModal('${note.id}')" title="Nhấp để phóng to và vẽ tiếp">
          <img src="${note.canvasImage}" alt="${escapeHtml(note.title)}">
        </div>
      `;
    }

    return `
      <article class="note-item note-style-${note.template}" data-id="${note.id}">
        <div class="note-inner-frame">
          <header class="note-header">
            <span class="note-category-tag">${escapeHtml(note.category || 'Chung')}</span>
            <span class="note-type-badge">${templateName}</span>
          </header>
          
          <h3 class="note-title" onclick="openEditModal('${note.id}')" style="cursor:pointer;">
            ${escapeHtml(note.title)}
          </h3>

          ${thumbnailHtml}
          
          ${note.content ? `<div class="note-content-body">${escapeHtml(note.content)}</div>` : ''}
          
          ${tagsHtml ? `<div class="note-tags-list">${tagsHtml}</div>` : ''}
          
          <footer class="note-footer">
            <span class="note-date">${note.createdAt || 'Gần đây'}</span>
            <div class="note-actions">
              <button class="btn-note-action" onclick="openEditModal('${note.id}')" title="Vẽ & Chỉnh sửa">
                ✏️ Viết Tiếp
              </button>
              <button class="btn-note-action btn-delete" onclick="deleteNote('${note.id}')" title="Xóa">
                🗑️
              </button>
            </div>
          </footer>
        </div>
      </article>
    `;
  }).join('');
}

// Modal Actions
function openModal(noteToEdit = null) {
  editingNoteId = noteToEdit ? noteToEdit.id : null;
  const modalTitle = document.getElementById('modalTitle');
  noteModal?.classList.add('active');

  // Initialize Fabric.js if not yet ready
  setTimeout(() => {
    initFabricCanvas();

    if (noteToEdit) {
      if (modalTitle) modalTitle.textContent = 'Xưởng Ghi Chú - Vẽ & Chỉnh Sửa Bài Học';
      document.getElementById('noteTitleInput').value = noteToEdit.title;
      document.getElementById('noteCategoryInput').value = noteToEdit.category || '';
      document.getElementById('noteContentInput').value = noteToEdit.content || '';
      document.getElementById('noteTagsInput').value = (noteToEdit.tags || []).join(', ');

      // Select template radio
      const radio = document.querySelector(`input[name="noteTemplate"][value="${noteToEdit.template}"]`);
      if (radio) {
        radio.checked = true;
        document.querySelectorAll('.template-radio-label').forEach(l => l.classList.remove('selected'));
        radio.closest('.template-radio-label')?.classList.add('selected');
      }

      // Load saved canvas state or initialize paper
      if (noteToEdit.canvasJSON) {
        fabricCanvas.loadFromJSON(noteToEdit.canvasJSON, () => {
          setCanvasPaperBackground(noteToEdit.template);
          fabricCanvas.renderAll();
          canvasUndoStack = [JSON.stringify(fabricCanvas.toJSON())];
        });
      } else {
        fabricCanvas.clear();
        setCanvasPaperBackground(noteToEdit.template);
        canvasUndoStack = [];
      }
    } else {
      if (modalTitle) modalTitle.textContent = 'Xưởng Ghi Chú - Tạo Bài Học Mới';
      noteForm.reset();

      // Default select template 1
      const defaultRadio = document.querySelector('input[name="noteTemplate"][value="1"]');
      if (defaultRadio) {
        defaultRadio.checked = true;
        document.querySelectorAll('.template-radio-label').forEach(l => l.classList.remove('selected'));
        defaultRadio.closest('.template-radio-label')?.classList.add('selected');
      }

      fabricCanvas.clear();
      setCanvasPaperBackground('1');
      canvasUndoStack = [];
    }

    // Default to Pen Mode
    setPenMode(true);
  }, 100);
}

function closeModal() {
  noteModal?.classList.remove('active');
  editingNoteId = null;
}

// Save or Update Note
async function saveNoteFromForm() {
  const title = document.getElementById('noteTitleInput').value.trim();
  const category = document.getElementById('noteCategoryInput').value.trim() || 'Tri Thức';
  const content = document.getElementById('noteContentInput').value.trim();
  const rawTags = document.getElementById('noteTagsInput').value.trim();
  const selectedTemplate = document.querySelector('input[name="noteTemplate"]:checked')?.value || '1';

  if (!title) {
    alert('Vui lòng nhập tiêu đề cho bài học ghi chú.');
    return;
  }

  const tags = rawTags ? rawTags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean) : [];
  const today = new Date();
  const dateFormatted = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;

  // Export Canvas Thumbnail and Canvas JSON state
  let canvasThumbnail = null;
  let canvasJSON = null;

  if (fabricCanvas) {
    canvasThumbnail = fabricCanvas.toDataURL({
      format: 'png',
      quality: 0.95
    });
    canvasJSON = JSON.stringify(fabricCanvas.toJSON());
  }

  const notePayload = {
    title,
    category,
    content,
    tags,
    template: selectedTemplate,
    canvasImage: canvasThumbnail,
    canvasJSON: canvasJSON,
    createdAt: dateFormatted
  };

  // Lưu vào MongoDB nếu đang kết nối
  if (isMongoConnected) {
    try {
      if (editingNoteId) {
        const res = await fetch(`${API_BASE_URL}/api/notes/${editingNoteId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notePayload)
        });
        if (res.ok) {
          showToast('Đã lưu bài học vào MongoDB! 🍃');
          await loadNotes();
          closeModal();
          return;
        }
      } else {
        const res = await fetch(`${API_BASE_URL}/api/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notePayload)
        });
        if (res.ok) {
          showToast('Đã lưu ghi chú mới vào MongoDB! (+50 XP) 🌟');
          await loadNotes();
          closeModal();
          return;
        }
      }
    } catch (e) {
      console.warn('Lỗi kết nối MongoDB khi lưu, chuyển sang lưu máy cục bộ:', e);
    }
  }

  // Fallback LocalStorage
  if (editingNoteId) {
    const index = notes.findIndex(n => n.id === editingNoteId);
    if (index !== -1) {
      notes[index] = {
        ...notes[index],
        ...notePayload,
        canvasImage: canvasThumbnail || notes[index].canvasImage,
        canvasJSON: canvasJSON || notes[index].canvasJSON
      };
      showToast('Đã lưu bài học vào máy cục bộ!');
    }
  } else {
    const newNote = {
      id: 'note_' + Date.now(),
      ...notePayload
    };
    notes.unshift(newNote);
    showToast('Đã lưu ghi chú mới! Bạn nhận được +50 XP Tri Thức 🌟');
  }

  saveNotesToStorage();
  updateGamification();
  renderNotes();
  closeModal();
}

// Global functions for inline HTML buttons
window.openEditModal = async function(id) {
  let note = notes.find(n => n.id === id);
  // Nếu có MongoDB, fetch chi tiết để lấy canvasJSON mới nhất
  if (isMongoConnected && id) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/notes/${id}`);
      if (res.ok) {
        note = await res.json();
      }
    } catch (e) {
      console.warn('Không lấy được chi tiết từ DB, sử dụng dữ liệu cục bộ:', e);
    }
  }
  if (note) openModal(note);
};

window.deleteNote = async function(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa ghi chú này?')) return;

  if (isMongoConnected) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/notes/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast('Đã xóa ghi chú khỏi MongoDB 🍃');
        await loadNotes();
        return;
      }
    } catch (e) {
      console.warn('Lỗi kết nối MongoDB khi xóa, xóa cục bộ:', e);
    }
  }

  // Fallback LocalStorage
  notes = notes.filter(n => n.id !== id);
  saveNotesToStorage();
  updateGamification();
  renderNotes();
  showToast('Đã xóa ghi chú.');
};

// Toast notification
function showToast(msg) {
  if (!toast || !toastText) return;
  toastText.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// Utility: Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* =======================================================
   GODOT ENGINE BRIDGE
   Ready for integration with Godot HTML5 / WebAssembly export
   ======================================================= */
window.GodotBridge = {
  getKnowledgeData: function() {
    const totalXp = notes.length * 50;
    const level = Math.floor(totalXp / 100) + 1;
    return JSON.stringify({
      level: level,
      totalXp: totalXp,
      notesCount: notes.length,
      categories: [...new Set(notes.map(n => n.category))],
      notes: notes
    });
  },

  exportJSONFile: function() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(this.getKnowledgeData());
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', 'notebuilder_knowledge_data.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }
};
