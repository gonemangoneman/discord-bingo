import { DiscordSDK } from '@discord/embedded-app-sdk';

const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID || '';

let discordSdk = null;
let auth = null;

export async function initDiscordSdk() {
  console.log('[Discord] Initializing SDK with client ID:', DISCORD_CLIENT_ID);

  if (!DISCORD_CLIENT_ID) {
    throw new Error('DISCORD_CLIENT_ID is not set. Check your .env and rebuild.');
  }

  discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);

  console.log('[Discord] Waiting for SDK ready...');
  await discordSdk.ready();
  console.log('[Discord] SDK ready. Guild:', discordSdk.guildId, 'Channel:', discordSdk.channelId);

  // Authorize
  console.log('[Discord] Requesting authorization...');
  const { code } = await discordSdk.commands.authorize({
    client_id: DISCORD_CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'guilds'],
  });
  console.log('[Discord] Got authorization code:', code?.slice(0, 10) + '...');

  // Exchange code for access token via our backend
  console.log('[Discord] Exchanging code for token...');
  const response = await fetch('/.proxy/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  let data;
  if (!response.ok) {
    console.warn('[Discord] /.proxy/api/token failed, status:', response.status);
    // Fallback to direct /api/token path
    const fallbackResponse = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!fallbackResponse.ok) {
      const errText = await fallbackResponse.text();
      throw new Error(`Token exchange failed (${fallbackResponse.status}): ${errText}`);
    }
    data = await fallbackResponse.json();
  } else {
    data = await response.json();
  }

  console.log('[Discord] Got access token, authenticating...');
  auth = await discordSdk.commands.authenticate({ access_token: data.access_token });
  console.log('[Discord] Authenticated as:', auth?.user?.username);

  return { discordSdk, auth };
}

export function getUser() {
  return auth?.user;
}

export function getGuildId() {
  return discordSdk?.guildId;
}

export function getChannelId() {
  return discordSdk?.channelId;
}

export function getInstanceId() {
  return discordSdk?.instanceId;
}
