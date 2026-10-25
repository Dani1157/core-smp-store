require('dotenv').config();
const express = require('express');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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
  crossOriginEmbedderPolicy: false
}));

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: "Too many requests, please try again later."
});
app.use('/api/', limiter);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TEBEX_API = "https://headless.tebex.io/api";
const TEBEX_PUBLIC = process.env.TEBEX_PUBLIC;
const TEBEX_PRIVATE = process.env.TEBEX_PRIVATE;

// 1. Fetch categories (Server to Tebex)
app.get('/api/categories', async (req, res) => {
  try {
    const auth = Buffer.from(`${TEBEX_PUBLIC}:${TEBEX_PRIVATE}`).toString('base64');
    const response = await axios.get(`${TEBEX_API}/accounts/${TEBEX_PUBLIC}/categories?includePackages=1`, {
      headers: { 'Authorization': `Basic ${auth}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error("Tebex Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch store data" });
  }
});

// 2. Secure Checkout (Frontend sends cart to Server -> Server sends to Tebex)
app.post('/api/checkout', async (req, res) => {
  const { username, cart } = req.body;
  if (!username || !cart || cart.length === 0) return res.status(400).json({ error: "Invalid request" });

  try {
    const auth = Buffer.from(`${TEBEX_PUBLIC}:${TEBEX_PRIVATE}`).toString('base64');
    const headers = { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' };

    const base = req.headers.referer || "http://localhost:3000";
    
    // Create basket
    const basketRes = await axios.post(`${TEBEX_API}/accounts/${TEBEX_PUBLIC}/baskets`, {
      username: username,
      complete_url: base + "?thanks=1",
      cancel_url: base,
      complete_auto_redirect: true
    }, { headers });

    const ident = basketRes.data.data.ident;

    // Add each item to the basket
    for (const item of cart) {
      await axios.post(`${TEBEX_API}/baskets/${ident}/packages`, {
        package_id: item.id,
        quantity: item.qty
      }, { headers });
    }

    // Get the final secure checkout URL
    const checkoutRes = await axios.get(`${TEBEX_API}/accounts/${TEBEX_PUBLIC}/baskets/${ident}`, { headers });
    const url = checkoutRes.data.data.links.checkout;

    res.json({ url });
  } catch (error) {
    console.error("Checkout Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to create checkout" });
  }
});

app.listen(PORT, () => console.log(`🔒 Secure store running on http://localhost:${PORT}`));