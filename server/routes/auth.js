const express = require('express');
const router = express.Router();

// POST /api/token — Exchange Discord OAuth2 code for access token
router.post('/token', async (req, res) => {
  console.log('[Auth] Token exchange request received');
  const { code } = req.body;
  if (!code) {
    console.error('[Auth] Missing authorization code in request body');
    return res.status(400).json({ error: 'Missing authorization code' });
  }
  console.log('[Auth] Exchanging code:', code?.slice(0, 10) + '...');

  try {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Auth] Token exchange failed:', data);
      return res.status(response.status).json(data);
    }

    res.json({ access_token: data.access_token });
  } catch (err) {
    console.error('[Auth] Error:', err);
    res.status(500).json({ error: 'Token exchange failed' });
  }
});

module.exports = router;
