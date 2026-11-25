import { ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const DEFAULT_ACCOUNT_ID = '115868cccd088ee294b2c810c578f12d';
const DEFAULT_TURN_TOKEN_ID = '7f8cb0eface733ecea06e470a8329906';
const DEFAULT_CALLS_APP_ID = '4de98d9d58890383e3ac941ced57d84e';
const DEFAULT_R2_BUCKET = 'anibloxbucket';
const DEFAULT_R2_PUBLIC_URL = 'https://bucket.anigok.com';

const FALLBACK_STUN_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:443'] },
  { urls: ['stun:stun.l.google.com:19302'] },
];

export interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export function getGatewayUrlFromEnv(): string {
  return (
    process.env.CF_AI_GATEWAY_URL ||
    process.env.AI_GATEWAY_URL ||
    process.env.CLOUDFLARE_AI_GATEWAY_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '');
}

export function getGatewayTokenFromEnv(): string {
  return (
    process.env.CF_AIG_TOKEN ||
    process.env.CLOUDFLARE_AIG_TOKEN ||
    process.env.AI_GATEWAY_TOKEN ||
    ''
  )
    .trim()
    .replace(/^Bearer\s+/i, '');
}

export function getCloudflareCapabilities() {
  return {
    turnConfigured: Boolean(process.env.CLOUDFLARE_TURN_API_TOKEN),
    sfuConfigured: Boolean(process.env.CLOUDFLARE_CALLS_APP_SECRET),
    r2Configured: Boolean(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY),
    workersAiConfigured: Boolean(process.env.CLOUDFLARE_API_TOKEN),
    aiGatewayConfigured: Boolean(getGatewayUrlFromEnv()),
  };
}

// ---------- CLOUDFLARE TURN SERVER ----------
export async function generateTurnIceServers(): Promise<{
  iceServers: RTCIceServer[];
  turnEnabled: boolean;
  sfuEnabled: boolean;
}> {
  const turnTokenId = (process.env.CLOUDFLARE_TURN_TOKEN_ID || DEFAULT_TURN_TOKEN_ID).trim();
  const turnApiToken = (process.env.CLOUDFLARE_TURN_API_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
  const sfuEnabled = Boolean((process.env.CLOUDFLARE_CALLS_APP_SECRET || '').trim());

  if (!turnApiToken) {
    return {
      iceServers: FALLBACK_STUN_SERVERS,
      turnEnabled: false,
      sfuEnabled,
    };
  }

  try {
    const resp = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(turnTokenId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${turnApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: 86400 }),
      }
    );

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.warn(`Cloudflare TURN error (${resp.status}): ${detail}`);
      return { iceServers: FALLBACK_STUN_SERVERS, turnEnabled: false, sfuEnabled };
    }

    const data = (await resp.json()) as { iceServers?: RTCIceServer[] };
    if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
      return {
        iceServers: data.iceServers,
        turnEnabled: true,
        sfuEnabled,
      };
    }
  } catch (err) {
    console.warn('Failed to fetch Cloudflare TURN ICE servers:', err);
  }

  return { iceServers: FALLBACK_STUN_SERVERS, turnEnabled: false, sfuEnabled };
}

// ---------- CLOUDFLARE CALLS SERVERLESS SFU ----------
function getCallsConfig() {
  const appId = (process.env.CLOUDFLARE_CALLS_APP_ID || DEFAULT_CALLS_APP_ID).trim();
  const appSecret = (process.env.CLOUDFLARE_CALLS_APP_SECRET || '').trim().replace(/^Bearer\s+/i, '');
  return { appId, appSecret };
}

export function isValidCallsSessionId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{8,128}$/.test(id);
}

export async function callsCreateSession(): Promise<unknown> {
  const { appId, appSecret } = getCallsConfig();
  if (!appSecret) {
    throw new Error('CLOUDFLARE_CALLS_APP_SECRET is not configured.');
  }

  const resp = await fetch(`https://rtc.live.cloudflare.com/v1/apps/${encodeURIComponent(appId)}/sessions/new`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${appSecret}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Cloudflare Calls create session failed (${resp.status})`);
  }
  return data;
}

export async function callsAddTracks(sessionId: string, payload: unknown): Promise<unknown> {
  if (!isValidCallsSessionId(sessionId)) {
    throw new Error('Invalid Calls session ID');
  }
  const { appId, appSecret } = getCallsConfig();
  if (!appSecret) {
    throw new Error('CLOUDFLARE_CALLS_APP_SECRET is not configured.');
  }

  const resp = await fetch(
    `https://rtc.live.cloudflare.com/v1/apps/${encodeURIComponent(appId)}/sessions/${encodeURIComponent(sessionId)}/tracks/new`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Cloudflare Calls tracks/new failed (${resp.status})`);
  }
  return data;
}

export async function callsRenegotiateSession(sessionId: string, payload: unknown): Promise<unknown> {
  if (!isValidCallsSessionId(sessionId)) {
    throw new Error('Invalid Calls session ID');
  }
  const { appId, appSecret } = getCallsConfig();
  if (!appSecret) {
    throw new Error('CLOUDFLARE_CALLS_APP_SECRET is not configured.');
  }

  const resp = await fetch(
    `https://rtc.live.cloudflare.com/v1/apps/${encodeURIComponent(appId)}/sessions/${encodeURIComponent(sessionId)}/renegotiate`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${appSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Cloudflare Calls renegotiate failed (${resp.status})`);
  }
  return data;
}

// ---------- CLOUDFLARE R2 OBJECT STORAGE ----------
let cachedS3Client: S3Client | null = null;
let cachedKeyFingerprint = '';

function getR2Client(): { client: S3Client; bucket: string; publicUrl: string } | null {
  const accountId = (process.env.R2_ACCOUNT_ID || DEFAULT_ACCOUNT_ID).trim();
  const bucket = (process.env.R2_BUCKET_NAME || DEFAULT_R2_BUCKET).trim();
  const publicUrl = (process.env.R2_PUBLIC_URL || process.env.R2_PUBLIC_BUCKET_URL || DEFAULT_R2_PUBLIC_URL)
    .trim()
    .replace(/\/+$/, '');
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  const fingerprint = `${accountId}:${accessKeyId}`;
  if (!cachedS3Client || cachedKeyFingerprint !== fingerprint) {
    cachedS3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    cachedKeyFingerprint = fingerprint;
  }

  return { client: cachedS3Client, bucket, publicUrl };
}

export async function uploadWorldThumbnailToR2(
  worldId: string,
  imageDataUrl: string
): Promise<{ url: string; key: string } | null> {
  const r2 = getR2Client();
  if (!r2) return null;

  const match = /^data:image\/(webp|jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/.exec(imageDataUrl.trim());
  if (!match) {
    throw new Error('Invalid image format. Expected base64 WebP, JPEG, or PNG.');
  }

  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const contentType = match[1] === 'jpg' ? 'image/jpeg' : `image/${match[1]}`;
  const buffer = Buffer.from(match[2], 'base64');

  if (buffer.byteLength === 0 || buffer.byteLength > 2 * 1024 * 1024) {
    throw new Error('Thumbnail image must be under 2MB.');
  }

  const safeWorldId = worldId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'world';
  const key = `worlds/${safeWorldId}/cover-${Date.now()}.${ext}`;

  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return {
    key,
    url: `${r2.publicUrl}/${key}`,
  };
}

export async function uploadWorldSnapshotToR2(worldId: string, worldJson: unknown): Promise<string | null> {
  const r2 = getR2Client();
  if (!r2) return null;

  const safeWorldId = worldId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'world';
  const key = `worlds/${safeWorldId}/scene.json`;
  const body = JSON.stringify(worldJson);

  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
      CacheControl: 'public, max-age=60',
    })
  );

  return `${r2.publicUrl}/${key}`;
}

// ---------- CLOUDFLARE WORKERS AI CHAT SAFETY ----------
export async function checkMessageWithWorkersAi(text: string): Promise<{ unsafe: boolean; reason?: string } | null> {
  const apiToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
  if (!apiToken) return null;

  const accountId = (process.env.R2_ACCOUNT_ID || DEFAULT_ACCOUNT_ID).trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2200);

  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/@cf/meta/llama-guard-3-8b`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: text.slice(0, 260) }],
        }),
        signal: controller.signal,
      }
    );

    if (!resp.ok) return null;
    const data = (await resp.json()) as { result?: { response?: string } };
    const output = String(data.result?.response || '').trim().toLowerCase();
    if (output.startsWith('unsafe')) {
      return { unsafe: true, reason: output };
    }
    return { unsafe: false };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyAllCloudflareServices() {
  const knownKeys = [
    'GEMINI_API_KEY',
    'R2_ACCOUNT_ID',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_URL',
    'R2_PUBLIC_BUCKET_URL',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'CLOUDFLARE_TURN_TOKEN_ID',
    'CLOUDFLARE_TURN_API_TOKEN',
    'CLOUDFLARE_CALLS_APP_ID',
    'CLOUDFLARE_CALLS_APP_SECRET',
    'CF_AI_GATEWAY_URL',
    'AI_GATEWAY_URL',
    'CLOUDFLARE_AI_GATEWAY_URL',
    'CF_AIG_TOKEN',
    'CLOUDFLARE_API_TOKEN',
    'AI_MODEL',
    'AI_PROVIDER_API_KEY',
    'TURNSTILE_SECRET_KEY',
    'VITE_TURNSTILE_SITE_KEY',
  ];

  const configuredKeys = knownKeys.filter((k) => Boolean((process.env[k] || '').trim()));

  // 1. Verify R2 S3 read + public custom domain reachability
  let r2Status: { ok: boolean; bucket: string; publicUrl: string; publicDomainReachable: boolean; detail: string };
  const r2 = getR2Client();
  if (!r2) {
    r2Status = {
      ok: false,
      bucket: (process.env.R2_BUCKET_NAME || DEFAULT_R2_BUCKET).trim(),
      publicUrl: (process.env.R2_PUBLIC_URL || process.env.R2_PUBLIC_BUCKET_URL || DEFAULT_R2_PUBLIC_URL).trim(),
      publicDomainReachable: false,
      detail: 'R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY missing',
    };
  } else {
    let s3Ok = false;
    let s3Detail = '';
    try {
      await r2.client.send(new ListObjectsV2Command({ Bucket: r2.bucket, MaxKeys: 1 }));
      s3Ok = true;
      s3Detail = 'Authenticated S3 API read succeeded';
    } catch (err) {
      s3Detail = err instanceof Error ? err.message : 'S3 list failed';
    }

    let domainOk = false;
    try {
      const head = await fetch(r2.publicUrl, { method: 'HEAD' });
      domainOk = head.status < 500;
    } catch {
      domainOk = false;
    }

    r2Status = {
      ok: s3Ok,
      bucket: r2.bucket,
      publicUrl: r2.publicUrl,
      publicDomainReachable: domainOk,
      detail: s3Detail,
    };
  }

  // 2. Verify TURN Server
  const turnRes = await generateTurnIceServers();
  const turnStatus = {
    ok: turnRes.turnEnabled,
    iceServerCount: turnRes.iceServers.length,
    detail: turnRes.turnEnabled ? 'Live Cloudflare TURN credentials issued' : 'TURN token missing or rejected',
  };

  // 3. Verify Calls Serverless SFU
  let sfuStatus: { ok: boolean; detail: string };
  if (!process.env.CLOUDFLARE_CALLS_APP_SECRET) {
    sfuStatus = { ok: false, detail: 'CLOUDFLARE_CALLS_APP_SECRET missing' };
  } else {
    try {
      const sess = (await callsCreateSession()) as { sessionId?: string };
      sfuStatus = {
        ok: Boolean(sess.sessionId),
        detail: sess.sessionId ? 'Live SFU session created' : 'Unexpected SFU response',
      };
    } catch (err) {
      sfuStatus = { ok: false, detail: err instanceof Error ? err.message : 'SFU check failed' };
    }
  }

  // 4. Verify Workers AI
  let workersAiStatus: { ok: boolean; detail: string };
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    workersAiStatus = { ok: false, detail: 'CLOUDFLARE_API_TOKEN missing' };
  } else {
    const mod = await checkMessageWithWorkersAi('hello world');
    workersAiStatus = {
      ok: mod !== null,
      detail: mod !== null ? 'Workers AI Llama Guard responded 200 OK' : 'Workers AI call failed (check token permissions)',
    };
  }

  // 5. Verify AI Gateway config
  const gwUrl = getGatewayUrlFromEnv();
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  const aiStatus = {
    geminiConfigured: Boolean(geminiKey && geminiKey !== 'MY_GEMINI_API_KEY'),
    gatewayUrlConfigured: Boolean(gwUrl),
    gatewayHost: gwUrl ? (() => { try { return new URL(gwUrl).hostname + new URL(gwUrl).pathname; } catch { return 'invalid-url'; } })() : null,
    gatewayAuthConfigured: Boolean(getGatewayTokenFromEnv()),
  };

  return {
    configuredKeys,
    configuredCount: configuredKeys.length,
    r2: r2Status,
    turn: turnStatus,
    sfu: sfuStatus,
    workersAi: workersAiStatus,
    ai: aiStatus,
  };
}
