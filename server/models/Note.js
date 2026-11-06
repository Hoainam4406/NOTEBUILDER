const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema(
  {
    // Legacy notes without an owner remain quarantined until an explicit migration.
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    revision: { type: Number, default: 0, min: 0 },
    template: {
      type: String,
      enum: ['1', '2', '3', '4'],
      default: '1',
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      default: 'Tri Thức',
      trim: true
    },
    content: {
      type: String,
      default: ''
    },
    tags: {
      type: [String],
      default: []
    },
    canvasImage: {
      type: String,
      default: null
    },
    canvasJSON: {
      type: String,
      default: null
    },
    createdAtCustom: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        // Định dạng ngày theo chuẩn VN (dd/mm/yyyy) nếu không có createdAtCustom
        if (!ret.createdAtCustom && ret.createdAt) {
          const d = new Date(ret.createdAt);
          ret.createdAt = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
        } else if (ret.createdAtCustom) {
          ret.createdAt = ret.createdAtCustom;
        }
        delete ret._id;
        delete ret.__v;
        delete ret.ownerId;
        return ret;
      }
    }
  }
);

// Index cho tìm kiếm văn bản nhanh
NoteSchema.index({ title: 'text', content: 'text', category: 'text' });

module.exports = mongoose.model('Note', NoteSchema);

