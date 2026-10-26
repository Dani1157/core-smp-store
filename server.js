// Set production mode BEFORE requiring express
process.env.NODE_ENV = 'production';

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust the first proxy (Render's load balancer)
app.set('trust proxy', 1);

// Hide the Express signature header
app.disable('x-powered-by');

// --- SECURITY MIDDLEWARE ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://headless.tebex.io", "https://discord.com", "https://api.mcsrvstat.us", "https://api.mcstatus.io", "https://api.exchangerate-api.com", "https://ipapi.co"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true },
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

// FIX: Normalize IPv6 to /64 prefix so attackers can't rotate addresses
function normalizeIp(ip) {
  if (!ip) return 'unknown';
  // Strip IPv4-mapped IPv6
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  // If IPv6, group into /64
  if (ip.includes(':')) {
    const parts = ip.split(':');
    // Handle :: shorthand
    const expanded = ip.includes('::') ? expandIPv6(ip) : parts;
    return expanded.slice(0, 4).join(':') + '::/64';
  }
  return ip;
}

function expandIPv6(ip) {
  const [head, tail] = ip.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const missing = 8 - headParts.length - tailParts.length;
  return [...headParts, ...Array(missing).fill('0'), ...tailParts];
}

// Rate limiting: keyed by normalized IP, blocks spam and abuse
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: "Too many requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  // FIX: Use normalized IPv6 so rotating addresses doesn't reset the limit
  keyGenerator: (req) => {
    return normalizeIp(req.ip);
  }
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const TEBEX_API = "https://headless.tebex.io/api";
const TEBEX_PUBLIC = process.env.TEBEX_PUBLIC;
const TEBEX_PRIVATE = process.env.TEBEX_PRIVATE;
const SITE_URL = process.env.SITE_URL || "http://localhost:3000";

// 1. Fetch categories
app.get('/api/categories', async (req, res) => {
  try {
    const auth = Buffer.from(`${TEBEX_PUBLIC}:${TEBEX_PRIVATE}`).toString('base64');
    const response = await axios.get(`${TEBEX_API}/accounts/${TEBEX_PUBLIC}/categories?includePackages=1`, {
      headers: { 'Authorization': `Basic ${auth}` }, 
      timeout: 10000
    });
    res.json(response.data);
  } catch (error) {
    // FIX: Never leak the error details to the client
    console.error("Tebex Categories Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch store data" });
  }
});

// 2. Secure Checkout
app.post('/api/checkout', async (req, res) => {
  const { username, cart } = req.body;
  
  if (!username || typeof username !== 'string' || username.length > 20) {
    return res.status(400).json({ error: "Invalid username" });
  }
  if (!Array.isArray(cart) || cart.length === 0 || cart.length > 10) {
    return res.status(400).json({ error: "Cart must contain between 1 and 10 items." });
  }
  for (const item of cart) {
    if (!Number.isInteger(item.id) || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10) {
      return res.status(400).json({ error: "Invalid cart item quantity." });
    }
  }

  try {
    const auth = Buffer.from(`${TEBEX_PUBLIC}:${TEBEX_PRIVATE}`).toString('base64');
    const headers = { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' };

    const basketRes = await axios.post(`${TEBEX_API}/accounts/${TEBEX_PUBLIC}/baskets`, {
      username: username,
      complete_url: SITE_URL + "?thanks=1",
      cancel_url: SITE_URL,
      complete_auto_redirect: true
    }, { headers, timeout: 10000 });

    const ident = basketRes.data.data.ident;

    for (const item of cart) {
      await axios.post(`${TEBEX_API}/baskets/${ident}/packages`, {
        package_id: item.id,
        quantity: item.qty
      }, { headers, timeout: 10000 });
    }

    const checkoutRes = await axios.get(`${TEBEX_API}/accounts/${TEBEX_PUBLIC}/baskets/${ident}`, { headers, timeout: 10000 });
    res.json({ url: checkoutRes.data.data.links.checkout });
  } catch (error) {
    // FIX: Never leak the error details to the client
    console.error("Tebex Checkout Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to create checkout" });
  }
});

// 3. FIX: Sanitized error handler for anything that slips through
app.use((err, req, res, next) => {
  // Log the full error server-side for debugging
  console.error("Unhandled error:", err.message);
  // Send a generic message to the client — no stack traces, no file paths
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

// 4. Catch-all for unknown API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => console.log(`🔒 Secure store running in ${process.env.NODE_ENV} mode on http://localhost:${PORT}`));