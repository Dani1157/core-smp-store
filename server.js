require('dotenv').config();
const express = require('express');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Required for Render's proxy to work with rate limiting
app.set('trust proxy', 1);

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

// Rate limiting to prevent spam/abuse
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: "Too many requests, please try again later."
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const TEBEX_API = "https://headless.tebex.io/api";
const TEBEX_PUBLIC = process.env.TEBEX_PUBLIC;
const TEBEX_PRIVATE = process.env.TEBEX_PRIVATE;

// FIX: Hardcoded site URL prevents phishing redirects via Referer header.
// You must set SITE_URL in your Render environment variables.
const SITE_URL = process.env.SITE_URL || "http://localhost:3000";

// 1. Fetch categories (Server to Tebex)
app.get('/api/categories', async (req, res) => {
  try {
    const auth = Buffer.from(`${TEBEX_PUBLIC}:${TEBEX_PRIVATE}`).toString('base64');
    const response = await axios.get(`${TEBEX_API}/accounts/${TEBEX_PUBLIC}/categories?includePackages=1`, {
      headers: { 'Authorization': `Basic ${auth}` }, 
      timeout: 10000
    });
    res.json(response.data);
  } catch (error) {
    console.error("Tebex Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch store data" });
  }
});

// 2. Secure Checkout with strict validation
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
    console.error("Checkout Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to create checkout" });
  }
});

app.listen(PORT, () => console.log(`🔒 Secure store running on http://localhost:${PORT}`));