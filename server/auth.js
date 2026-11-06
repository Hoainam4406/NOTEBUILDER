const { randomBytes, scrypt: scryptCallback, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const User = require('./models/User');
const Session = require('./models/Session');
const AuthAttempt = require('./models/AuthAttempt');
const { InputError } = require('./validation');
const scrypt = promisify(scryptCallback);
const digest = value => createHash('sha256').update(value).digest('hex');
const randomToken = () => randomBytes(32).toString('hex');
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;

function credentials(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Dữ liệu tài khoản không hợp lệ');
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[\x21-\x7e]+$/.test(email) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new InputError('Email không hợp lệ');
  if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) {
    throw new InputError('Mật khẩu phải có 12..128 ký tự');
  }
  return { email, password: body.password };
}
function displayName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) throw new InputError('Tên hiển thị phải có 1..80 ký tự');
  return value.trim();
}
async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [, salt, key] = (stored || '').split(':');
  // Perform the same expensive derivation for a missing account.
  const actual = await scrypt(password, salt || '00000000000000000000000000000000', 64);
  const expected = Buffer.from(key || '00'.repeat(64), 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected) && Boolean(key);
}
const publicUser = user => ({ id: String(user._id), email: user.email, displayName: user.displayName });
function tokenFrom(req) {
  const value = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('kc_session='));
  const token = value?.slice('kc_session='.length);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

function createAuth({ UserModel = User, SessionModel = Session, AttemptModel = AuthAttempt,
  now = () => Date.now(), secure = process.env.NODE_ENV === 'production' } = {}) {
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure, path: '/' };
  async function rateLimit(req, res, next) {
    const timestamp = now();
    const bucket = Math.floor(timestamp / WINDOW_MS);
    const expiresAt = new Date((bucket + 1) * WINDOW_MS);
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
    for (const [scope, value, limit] of [['ip', req.ip, 30], ['email', email, 10]]) {
      const key = digest(`${scope}:${value}:${bucket}`);
      // The unique index is created before listening. Retry an upsert race as an update.
      let attempt;
      try {
        attempt = await AttemptModel.findOneAndUpdate({ key }, { $inc: { count: 1 }, $setOnInsert: { expiresAt } }, { upsert: true, new: true });
      } catch (error) {
        if (error.code !== 11000) throw error;
        attempt = await AttemptModel.findOneAndUpdate({ key }, { $inc: { count: 1 } }, { new: true });
      }
      if (attempt.count > limit) {
        res.set('Retry-After', String(Math.ceil((expiresAt.getTime() - timestamp) / 1000)));
        return res.status(429).json({ error: 'Thử quá nhiều lần; hãy thử lại sau', code: 'RATE_LIMITED' });
      }
    }
    next();
  }
  async function requireUser(req, res, next) {
    const token = tokenFrom(req);
    const session = token && await SessionModel.findOne({ tokenHash: digest(token), expiresAt: { $gt: new Date(now()) } });
    const user = session && await UserModel.findById(session.userId);
    if (!user) return res.status(401).json({ error: 'Vui lòng đăng nhập', code: 'AUTH_REQUIRED' });
    req.user = user;
    req.authSession = session;
    next();
  }
  function csrf(req, res, next) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-CSRF-Token') !== req.authSession.csrfToken) {
      return res.status(403).json({ error: 'Phiên yêu cầu không hợp lệ; hãy tải lại trang', code: 'CSRF_INVALID' });
    }
    next();
  }
  function mount(app) {
    app.post('/api/auth/register', rateLimit, async (req, res) => {
      const { email, password } = credentials(req.body);
      const name = displayName(req.body.displayName);
      const passwordHash = await hashPassword(password);
      try {
        const user = await UserModel.create({ email, passwordHash, displayName: name });
        res.status(201).json({ user: publicUser(user) });
      } catch (error) {
        if (error.code !== 11000) throw error;
        res.status(409).json({ error: 'Email đã được sử dụng', code: 'EMAIL_EXISTS' });
      }
    });
    app.post('/api/auth/login', rateLimit, async (req, res) => {
      const { email, password } = credentials(req.body);
      const user = await UserModel.findOne({ email }).select('+passwordHash');
      if (!await verifyPassword(password, user?.passwordHash)) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng', code: 'INVALID_CREDENTIALS' });
      const token = randomToken();
      const csrfToken = randomToken();
      await SessionModel.create({ tokenHash: digest(token), userId: user._id, csrfToken, expiresAt: new Date(now() + SESSION_MS) });
      res.cookie('kc_session', token, { ...cookieOptions, maxAge: SESSION_MS });
      res.json({ user: publicUser(user), csrfToken });
    });
    app.get('/api/auth/me', requireUser, (req, res) => res.json({ user: publicUser(req.user), csrfToken: req.authSession.csrfToken }));
    app.post('/api/auth/logout', requireUser, csrf, async (req, res) => {
      await SessionModel.deleteOne({ _id: req.authSession._id });
      res.clearCookie('kc_session', cookieOptions);
      res.sendStatus(204);
    });
    app.patch('/api/profile', requireUser, csrf, async (req, res) => {
      const user = await UserModel.findByIdAndUpdate(req.user._id, { $set: { displayName: displayName(req.body?.displayName) } }, { new: true });
      res.json({ user: publicUser(user) });
    });
  }
  return { mount, requireUser, csrf };
}
module.exports = { createAuth, hashPassword, verifyPassword, credentials, digest };
