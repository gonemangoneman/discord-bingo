import { DiscordSDK } from '@discord/embedded-app-sdk';

const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID || '';

let discordSdk = null;
let auth = null;

export async function initDiscordSdk() {
  discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);
  await discordSdk.ready();

  // Authorize
  const { code } = await discordSdk.commands.authorize({
    client_id: DISCORD_CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'guilds'],
  });

  // Exchange code for access token via our backend
  const response = await fetch('/.proxy/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    // Fallback to direct /api/token path
    const fallbackResponse = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await fallbackResponse.json();
    auth = await discordSdk.commands.authenticate({ access_token: data.access_token });
  } else {
    const data = await response.json();
    auth = await discordSdk.commands.authenticate({ access_token: data.access_token });
  }

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
