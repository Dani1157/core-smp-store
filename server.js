require('dotenv').config();
const express = require('express');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

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
const SITE_URL = process.env.SITE_URL || "http://localhost:3000";

app.get('/api/categories', async (req, res) => {
  try {
    const auth = Buffer.from(`${TEBEX_PUBLIC}:${TEBEX_PRIVATE}`).toString('base64');
    const response = await axios.get(`${TEBEX_API}/accounts/${TEBEX_PUBLIC}/categories?includePackages=1`, {
      headers: { 'Authorization': `Basic ${auth}` }, timeout: 10000
    });
    res.json(response.data);
  } catch (error) {
    console.error("Tebex Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch store data" });
  }
});

app.get('/api/status', async (req, res) => {
  const addr = process.env.SERVER_IP || "core.lagless.games";
  const discordCode = process.env.DISCORD_CODE || "XGQ5DHdSfA";
  
  try {
    const [mc, dc] = await Promise.allSettled([
      axios.get(`https://api.mcstatus.io/v2/status/java/${addr}`, { timeout: 5000 }),
      axios.get(`https://discord.com/api/v9/invites/${discordCode}?with_counts=true`, { timeout: 5000 })
    ]);
    res.json({
      online: mc.status === 'fulfilled' ? !!mc.value.data.online : false,
      players: mc.status === 'fulfilled' ? (mc.value.data.players?.online ?? null) : null,
      members: dc.status === 'fulfilled' ? (dc.value.data.approximate_member_count ?? null) : null
    });
  } catch (error) {
    res.json({ online: false, players: null, members: null });
  }
});

app.get('/api/rates', async (req, res) => {
  try {
    const r = await axios.get('https://api.exchangerate-api.com/v4/latest/GBP', { timeout: 5000 });
    res.json({ GBP: 1, USD: r.data.rates.USD, EUR: r.data.rates.EUR });
  } catch (error) {
    res.status(502).json({ error: 'Rates unavailable' });
  }
});

app.post('/api/checkout', async (req, res) => {
  const { username, cart } = req.body;
  if (!username || typeof username !== 'string' || username.length > 20) return res.status(400).json({ error: "Invalid username" });
  if (!Array.isArray(cart) || cart.length === 0 || cart.length > 10) return res.status(400).json({ error: "Invalid cart" });
  
  for (const item of cart) {
    if (!Number.isInteger(item.id) || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10) return res.status(400).json({ error: "Invalid item" });
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

app.listen(PORT, () => console.log(`🔒 Secure store running on port ${PORT}`));