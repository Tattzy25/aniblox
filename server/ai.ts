import { GoogleGenAI, Type } from '@google/genai';
import type { BlockPart, WorldGenre } from '../src/types/aniblox.js';
import { getGatewayTokenFromEnv, getGatewayUrlFromEnv } from './cloudflare.js';

function getAiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY') return null;

  const headers: Record<string, string> = {
    'User-Agent': 'aistudio-build',
  };
  const aigToken = getGatewayTokenFromEnv();
  if (aigToken) {
    headers['cf-aig-authorization'] = `Bearer ${aigToken}`;
  }

  const gatewayUrl = getGatewayUrlFromEnv();
  const httpOptions: { headers: Record<string, string>; baseUrl?: string } = { headers };

  if (gatewayUrl && gatewayUrl.startsWith('https://gateway.ai.cloudflare.com/') && !gatewayUrl.endsWith('/compat')) {
    const base = gatewayUrl.replace(/\/(compat|google-ai-studio|openai|anthropic|workers-ai)(\/.*)?$/, '');
    httpOptions.baseUrl = `${base}/google-ai-studio`;
  }

  return new GoogleGenAI({
    apiKey: key,
    httpOptions,
  });
}

function getCompatEndpoint(gatewayUrl: string): string {
  if (gatewayUrl.endsWith('/chat/completions')) return gatewayUrl;
  if (gatewayUrl.endsWith('/compat')) return `${gatewayUrl}/chat/completions`;
  const base = gatewayUrl.replace(/\/(google-ai-studio|openai|anthropic|workers-ai)(\/.*)?$/, '');
  return `${base}/compat/chat/completions`;
}

async function runUniversalGateway(
  prompt: string,
  expectJson: boolean,
  requestedModel?: string
): Promise<string | null> {
  const gatewayUrl = getGatewayUrlFromEnv();
  const model = (requestedModel || process.env.AI_MODEL || '').trim();
  const aigToken = getGatewayTokenFromEnv();
  const cfApiToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
  const providerKey = (
    process.env.AI_PROVIDER_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    (process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' ? process.env.GEMINI_API_KEY : '') ||
    ''
  ).trim();

  // Case 1: Direct Workers AI REST endpoint (.../accounts/<id>/ai/run)
  if (gatewayUrl && gatewayUrl.includes('/ai/run')) {
    const token = cfApiToken || aigToken;
    if (!token) return null;
    const cleanedModel = model.replace(/^workers-ai\//, '');
    const workersModel = cleanedModel.startsWith('@cf/') ? cleanedModel : '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    const resp = await fetch(`${gatewayUrl.replace(/\/+$/, '')}/${workersModel}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: expectJson
              ? 'You are a 3D game world architect. Return ONLY valid raw JSON with no markdown fences.'
              : 'You are an expert Roblox/Aniblox Lua scripter. Return ONLY raw Lua code.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 2048,
      }),
    });
    if (!resp.ok) {
      throw new Error(`Workers AI request failed (${resp.status})`);
    }
    const data = (await resp.json()) as { result?: { response?: string } };
    return data.result?.response ? String(data.result.response).trim() : null;
  }

  // Case 2: Cloudflare AI Gateway Universal /compat endpoint (supports OpenAI, Anthropic, Workers AI, Groq, Gemini, etc.)
  const useCompat =
    gatewayUrl.startsWith('https://gateway.ai.cloudflare.com/') &&
    (gatewayUrl.endsWith('/compat') ||
      gatewayUrl.endsWith('/chat/completions') ||
      (model.includes('/') && !model.startsWith('google-ai-studio/gemini-4')));

  if (!useCompat) return null;

  const targetModel = model || (cfApiToken ? 'workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast' : 'google-ai-studio/gemini-2.5-flash');
  const endpoint = getCompatEndpoint(gatewayUrl);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (aigToken) {
    headers['cf-aig-authorization'] = `Bearer ${aigToken}`;
  }
  if (targetModel.startsWith('workers-ai/') && cfApiToken) {
    headers.Authorization = `Bearer ${cfApiToken}`;
  } else if (providerKey) {
    headers.Authorization = `Bearer ${providerKey}`;
  } else if (aigToken) {
    // Allow AI Gateway Stored Keys (BYOK) when only cf-aig-authorization is provided
    headers.Authorization = `Bearer ${aigToken}`;
  }

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: targetModel,
      messages: [
        {
          role: 'system',
          content: expectJson
            ? 'Return ONLY a valid JSON object matching the requested schema. No markdown fences or commentary.'
            : 'Return ONLY raw code with no markdown fences.',
        },
        { role: 'user', content: prompt },
      ],
      ...(expectJson ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`AI Gateway (${targetModel}) returned ${resp.status}: ${errText.slice(0, 140)}`);
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  return content ? String(content).trim() : null;
}

function stripJsonFences(text: string): string {
  return text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
}

export async function generateAiWorld(
  prompt: string,
  genre: WorldGenre,
  modelOverride?: string
): Promise<{
  title: string;
  skyColor: string;
  blocks: BlockPart[];
  scriptCode: string;
}> {
  const fullPrompt = `Design a playable 3D block-based Aniblox (Roblox-style) level for genre "${genre}".
User request: "${prompt}"
Coordinate rules:
- Spawn pad must be near [0, 0, 0] with role "spawn".
- Include 8 to 18 varied 3D blocks using shapes ("box", "wedge", "cylinder", "sphere"), materials ("plastic", "neon", "metal", "glass", "wood", "stone", "grass"), and roles ("solid", "spawn", "checkpoint", "hazard", "coin", "bounce", "portal").
- Keep all block positions within [-40, 40] X/Z and [-2, 24] Y so players can jump between them (max jump gap ~6 units, max jump height ~3.5 units unless using a bounce pad).
- Also generate clean Roblox-style Lua scriptCode using print(), Workspace:FindFirstChild(), .Touched:Connect(function(hit) ... end), GiveCoins(n), GiveXP(n), Notify(msg).
Return JSON with keys: title (string), skyColor (hex string), scriptCode (string), blocks (array of { name, shape, x, y, z, w, h, d, color, material, role, value }).`;

  let raw = '';
  try {
    const gwResult = await runUniversalGateway(fullPrompt, true, modelOverride);
    if (gwResult) raw = stripJsonFences(gwResult);
  } catch (gwErr) {
    if (!getAiClient()) throw gwErr;
  }

  if (!raw) {
    const ai = getAiClient();
    if (!ai) {
      throw new Error('Configure GEMINI_API_KEY or CF_AI_GATEWAY_URL in Settings -> Secrets.');
    }

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: fullPrompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            skyColor: { type: Type.STRING },
            scriptCode: { type: Type.STRING },
            blocks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  shape: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  z: { type: Type.NUMBER },
                  w: { type: Type.NUMBER },
                  h: { type: Type.NUMBER },
                  d: { type: Type.NUMBER },
                  color: { type: Type.STRING },
                  material: { type: Type.STRING },
                  role: { type: Type.STRING },
                  value: { type: Type.NUMBER },
                },
                required: ['name', 'shape', 'x', 'y', 'z', 'w', 'h', 'd', 'color', 'material', 'role'],
              },
            },
          },
          required: ['title', 'skyColor', 'blocks', 'scriptCode'],
        },
      },
    });
    raw = (response.text ?? '{}').trim();
  }

  const parsed = JSON.parse(raw) as {
    title?: string;
    skyColor?: string;
    scriptCode?: string;
    blocks?: Array<{
      name: string;
      shape: string;
      x: number;
      y: number;
      z: number;
      w: number;
      h: number;
      d: number;
      color: string;
      material: string;
      role: string;
      value?: number;
    }>;
  };

  const validShapes = new Set(['box', 'wedge', 'cylinder', 'sphere']);
  const validMats = new Set(['plastic', 'neon', 'metal', 'glass', 'wood', 'stone', 'grass']);
  const validRoles = new Set(['solid', 'spawn', 'checkpoint', 'hazard', 'coin', 'bounce', 'conveyor', 'dropper', 'portal']);

  const blocks: BlockPart[] = (parsed.blocks || []).slice(0, 24).map((b, idx) => {
    const role = validRoles.has(b.role) ? (b.role as BlockPart['role']) : 'solid';
    return {
      id: `ai_blk_${Date.now()}_${idx}`,
      name: String(b.name || `Part_${idx + 1}`).slice(0, 32),
      shape: validShapes.has(b.shape) ? (b.shape as BlockPart['shape']) : 'box',
      position: [Number(b.x) || 0, Number(b.y) || 0, Number(b.z) || 0],
      size: [
        Math.max(0.5, Math.min(40, Number(b.w) || 4)),
        Math.max(0.3, Math.min(20, Number(b.h) || 1)),
        Math.max(0.5, Math.min(40, Number(b.d) || 4)),
      ],
      rotation: [0, 0, 0],
      color: /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : '#3B82F6',
      material: validMats.has(b.material) ? (b.material as BlockPart['material']) : 'plastic',
      role,
      anchored: true,
      canCollide: role !== 'coin' && role !== 'portal',
      value: b.value ?? (role === 'coin' ? 25 : role === 'bounce' ? 24 : 1),
    };
  });

  if (!blocks.some((b) => b.role === 'spawn')) {
    blocks.unshift({
      id: `ai_spawn_${Date.now()}`,
      name: 'SpawnLocation',
      shape: 'box',
      position: [0, 0, 0],
      size: [10, 1.2, 10],
      rotation: [0, 0, 0],
      color: '#4B974B',
      material: 'grass',
      role: 'spawn',
      anchored: true,
      canCollide: true,
    });
  }

  return {
    title: parsed.title || 'AI Generated World',
    skyColor: /^#[0-9a-fA-F]{6}$/.test(parsed.skyColor || '') ? String(parsed.skyColor) : '#38BDF8',
    blocks,
    scriptCode: parsed.scriptCode || '-- Generated by Aniblox AI Builder\nprint("World loaded!")',
  };
}

export async function generateAiLuaScript(
  prompt: string,
  worldTitle: string,
  modelOverride?: string
): Promise<string> {
  const fullPrompt = `Write a clean, working Aniblox Lua script for the 3D world "${worldTitle}".
Task: "${prompt}"
Available Aniblox Lua APIs:
- print(msg)
- local part = Instance.new("Part") -- supports .Name, .Position = Vector3.new(x,y,z), .Size = Vector3.new(w,h,d), .Color = Color3.fromRGB(r,g,b)
- local obj = game.Workspace:FindFirstChild("PartName")
- obj.Touched:Connect(function(hit) ... end)
- GiveCoins(amount), GiveXP(amount), SetCheckpoint(num), Notify(text)
- for i = 1, 5 do ... end
Return ONLY raw Lua code with no markdown fences.`;

  try {
    const gwResult = await runUniversalGateway(fullPrompt, false, modelOverride);
    if (gwResult) return gwResult.replace(/```lua|```/g, '').trim();
  } catch (gwErr) {
    if (!getAiClient()) throw gwErr;
  }

  const ai = getAiClient();
  if (!ai) {
    throw new Error('Configure GEMINI_API_KEY or CF_AI_GATEWAY_URL in Settings -> Secrets.');
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: fullPrompt,
  });

  return (response.text || '-- Empty script').replace(/```lua|```/g, '').trim();
}

export async function modifyAiWorld(
  prompt: string,
  currentBlocks: BlockPart[],
  currentScript: string,
  genre: WorldGenre,
  modelOverride?: string
): Promise<{
  summary: string;
  blocks: BlockPart[];
  scriptCode: string;
}> {
  const compactBlocks = currentBlocks.slice(0, 40).map((b) => ({
    id: b.id,
    name: b.name,
    shape: b.shape,
    x: b.position[0],
    y: b.position[1],
    z: b.position[2],
    w: b.size[0],
    h: b.size[1],
    d: b.size[2],
    color: b.color,
    material: b.material,
    role: b.role,
    compositeType: b.compositeType || '',
    spinSpeed: b.spinSpeed || 0,
    patrolAxis: b.patrolAxis || '',
    patrolRange: b.patrolRange || 0,
  }));

  const fullPrompt = `You are the Aniblox Studio AI Agent. Modify/enhance the EXISTING "${genre}" 3D scene based on the user's request while preserving valid existing gameplay parts unless asked to replace them.
User request: "${prompt}"
Existing blocks JSON: ${JSON.stringify(compactBlocks)}
Existing Lua script:
${currentScript}

Rules:
- Keep existing IDs for unmodified blocks, and generate new unique IDs (e.g. "ai_mod_1") for newly added blocks.
- Available roles: "solid", "spawn", "checkpoint", "hazard", "coin", "bounce", "conveyor", "dropper", "portal", "crumble".
- Available compositeType (for 3D multi-part props): "" (normal block), "tree", "lollipop", "volcano", "blimp".
- Set spinSpeed > 0 for rotating obstacles/coins, and patrolAxis ("x"|"y"|"z") + patrolRange > 0 for moving platforms/blimps.
- Return JSON with summary (1-sentence string), scriptCode (string), and blocks (array of { id, name, shape, x, y, z, w, h, d, color, material, role, compositeType, spinSpeed, patrolAxis, patrolRange }).`;

  let raw = '';
  try {
    const gwResult = await runUniversalGateway(fullPrompt, true, modelOverride);
    if (gwResult) raw = stripJsonFences(gwResult);
  } catch (gwErr) {
    if (!getAiClient()) throw gwErr;
  }

  if (!raw) {
    const ai = getAiClient();
    if (!ai) {
      throw new Error('Configure GEMINI_API_KEY or CF_AI_GATEWAY_URL in Settings -> Secrets.');
    }

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: fullPrompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            scriptCode: { type: Type.STRING },
            blocks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  shape: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  z: { type: Type.NUMBER },
                  w: { type: Type.NUMBER },
                  h: { type: Type.NUMBER },
                  d: { type: Type.NUMBER },
                  color: { type: Type.STRING },
                  material: { type: Type.STRING },
                  role: { type: Type.STRING },
                  compositeType: { type: Type.STRING },
                  spinSpeed: { type: Type.NUMBER },
                  patrolAxis: { type: Type.STRING },
                  patrolRange: { type: Type.NUMBER },
                },
                required: ['name', 'shape', 'x', 'y', 'z', 'w', 'h', 'd', 'color', 'material', 'role'],
              },
            },
          },
          required: ['summary', 'blocks', 'scriptCode'],
        },
      },
    });
    raw = (response.text ?? '{}').trim();
  }

  const parsed = JSON.parse(raw) as {
    summary?: string;
    scriptCode?: string;
    blocks?: Array<Record<string, unknown>>;
  };

  const validShapes = new Set(['box', 'wedge', 'cylinder', 'sphere']);
  const validMats = new Set(['plastic', 'neon', 'metal', 'glass', 'wood', 'stone', 'grass']);
  const validRoles = new Set(['solid', 'spawn', 'checkpoint', 'hazard', 'coin', 'bounce', 'conveyor', 'dropper', 'portal', 'crumble']);
  const validComposites = new Set(['tree', 'lollipop', 'volcano', 'blimp']);

  const blocks: BlockPart[] = (parsed.blocks || []).slice(0, 48).map((b, idx) => {
    const role = validRoles.has(String(b.role)) ? (String(b.role) as BlockPart['role']) : 'solid';
    const comp = validComposites.has(String(b.compositeType)) ? (String(b.compositeType) as BlockPart['compositeType']) : undefined;
    const pAxis = ['x', 'y', 'z'].includes(String(b.patrolAxis)) ? (String(b.patrolAxis) as 'x' | 'y' | 'z') : undefined;
    return {
      id: String(b.id || `ai_mod_${Date.now()}_${idx}`),
      name: String(b.name || `Part_${idx + 1}`).slice(0, 32),
      shape: validShapes.has(String(b.shape)) ? (String(b.shape) as BlockPart['shape']) : 'box',
      position: [Number(b.x) || 0, Number(b.y) || 0, Number(b.z) || 0],
      size: [
        Math.max(0.5, Math.min(64, Number(b.w) || 4)),
        Math.max(0.3, Math.min(24, Number(b.h) || 1)),
        Math.max(0.5, Math.min(64, Number(b.d) || 4)),
      ],
      rotation: [0, 0, 0],
      color: /^#[0-9a-fA-F]{6}$/.test(String(b.color)) ? String(b.color) : '#3B82F6',
      material: validMats.has(String(b.material)) ? (String(b.material) as BlockPart['material']) : 'plastic',
      role,
      anchored: true,
      canCollide: role !== 'coin' && role !== 'portal' && !comp,
      value: role === 'coin' ? 25 : role === 'bounce' ? 24 : 1,
      compositeType: comp,
      spinSpeed: Number(b.spinSpeed) || undefined,
      patrolAxis: pAxis,
      patrolRange: Number(b.patrolRange) || undefined,
    };
  });

  return {
    summary: parsed.summary || 'Updated scene with AI Agent.',
    blocks: blocks.length > 0 ? blocks : currentBlocks,
    scriptCode: parsed.scriptCode || currentScript,
  };
}
