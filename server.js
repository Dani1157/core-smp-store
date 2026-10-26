'use strict';
process.env.NODE_ENV = 'production';

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const helmet = require('helmet');
const rateLimitLib = require('express-rate-limit');
const rateLimit = rateLimitLib.rateLimit || rateLimitLib;
const ipKeyGenerator = rateLimitLib.ipKeyGenerator || ((ip) => ip);
const path = require('path');

const PORT = process.env.PORT || 3000;
const TEBEX_PUBLIC = process.env.TEBEX_PUBLIC;
const TEBEX_PRIVATE = process.env.TEBEX_PRIVATE;
const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';
const SERVER_IP = process.env.SERVER_IP || 'core.lagless.games';
const SERVER_PORT = process.env.SERVER_PORT || '';
const DISCORD_CODE = process.env.DISCORD_CODE || 'XGQ5DHdSfA';

if (!TEBEX_PUBLIC || !SITE_URL) {
  console.error(`Missing required env var: TEBEX_PUBLIC or SITE_URL`);
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// --- SECURITY HEADERS ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      // FIXED: Added https: to allow Tebex images (cloudfront.net) and any other https image
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://headless.tebex.io', 'https://discord.com', 'https://api.mcstatus.io', 'https://api.exchangerate-api.com', 'https://ipapi.co'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

const keyGenerator = (req) => ipKeyGenerator(req.ip, 64);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: { error: 'Too many requests, please try again later.' }
});

const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: { error: 'Too many checkout attempts, please wait a minute.' }
});

app.use('/api', apiLimiter);
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

// --- TEBEX CLIENT ---
const tebex = axios.create({
  baseURL: 'https://headless.tebex.io/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    ...(TEBEX_PRIVATE ? { Authorization: 'Basic ' + Buffer.from(`${TEBEX_PUBLIC}:${TEBEX_PRIVATE}`).toString('base64') } : {})
  }
});

// --- TINY CACHE ---
const cache = new Map();
function cached(key, ttlMs, loader) {
  const e = cache.get(key) || {};
  if (e.value !== undefined && Date.now() - e.at < ttlMs) return Promise.resolve(e.value);
  if (e.pending) return e.pending;
  const pending = loader()
    .then((value) => { cache.set(key, { at: Date.now(), value }); return value; })
    .catch((err) => {
      cache.set(key, { at: e.at, value: e.value });
      if (e.value !== undefined) return e.value;
      throw err;
    });
  cache.set(key, { ...e, pending });
  return pending;
}

const getCategories = () => cached('categories', 60 * 1000, async () => {
  const r = await tebex.get(`/accounts/${TEBEX_PUBLIC}/categories?includePackages=1`);
  return r.data;
});

// --- ROUTES ---
app.get('/api/categories', async (req, res) => {
  try {
    res.json(await getCategories());
  } catch (error) {
    console.error('Tebex Categories Error:', error.response?.status, error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch store data' });
  }
});

app.get('/api/status', async (req, res) => {
  const addr = SERVER_PORT ? `${SERVER_IP}:${SERVER_PORT}` : SERVER_IP;
  const data = await cached('status', 30 * 1000, async () => {
    const [mc, dc] = await Promise.allSettled([
      axios.get(`https://api.mcstatus.io/v2/status/java/${encodeURIComponent(addr)}`, { timeout: 5000 }),
      axios.get(`https://discord.com/api/v9/invites/${encodeURIComponent(DISCORD_CODE)}?with_counts=true`, { timeout: 5000 })
    ]);
    return {
      online: mc.status === 'fulfilled' ? !!mc.value.data.online : false,
      players: mc.status === 'fulfilled' ? (mc.value.data.players?.online ?? null) : null,
      members: dc.status === 'fulfilled' ? (dc.value.data.approximate_member_count ?? null) : null
    };
  }).catch(() => ({ online: false, players: null, members: null }));
  res.json(data);
});

app.get('/api/rates', async (req, res) => {
  try {
    const rates = await cached('rates', 60 * 60 * 1000, async () => {
      const r = await axios.get('https://api.exchangerate-api.com/v4/latest/GBP', { timeout: 5000 });
      return { GBP: 1, USD: r.data.rates.USD, EUR: r.data.rates.EUR };
    });
    res.json(rates);
  } catch (error) {
    res.status(502).json({ error: 'Rates unavailable' });
  }
});

const USERNAME_RE = /^(?:[A-Za-z0-9_]{3,16}|\.[A-Za-z0-9_ ]{1,16})$/;

app.post('/api/checkout', checkoutLimiter, async (req, res) => {
  const { username, cart } = req.body ?? {};

  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Invalid username' });
  }
  if (!Array.isArray(cart) || cart.length === 0 || cart.length > 10) {
    return res.status(400).json({ error: 'Cart must contain between 1 and 10 items.' });
  }
  for (const item of cart) {
    if (!item || !Number.isInteger(item.id) || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10) {
      return res.status(400).json({ error: 'Invalid cart item quantity.' });
    }
  }

  try {
    const catalog = await getCategories();
    const validIds = new Set(catalog.data.flatMap((c) => (c.packages || []).map((p) => p.id)));

    const merged = new Map();
    for (const { id, qty } of cart) {
      if (!validIds.has(id)) return res.status(400).json({ error: 'Unknown item in cart.' });
      merged.set(id, Math.min(10, (merged.get(id) || 0) + qty));
    }

    const basketRes = await tebex.post(`/accounts/${TEBEX_PUBLIC}/baskets`, {
      username,
      complete_url: SITE_URL + '?thanks=1',
      cancel_url: SITE_URL,
      complete_auto_redirect: true
    });
    const ident = basketRes.data.data.ident;

    for (const [id, qty] of merged) {
      await tebex.post(`/baskets/${ident}/packages`, { package_id: id, quantity: qty });
    }

    const checkoutRes = await tebex.get(`/accounts/${TEBEX_PUBLIC}/baskets/${ident}`);
    res.json({ url: checkoutRes.data.data.links.checkout });
  } catch (error) {
    console.error('Tebex Checkout Error:', error.response?.status, error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create checkout' });
  }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

process.on('unhandledRejection', (r) => console.error('Unhandled rejection:', r));

app.listen(PORT, () => console.log(`Store running in ${process.env.NODE_ENV} mode on port ${PORT}`));