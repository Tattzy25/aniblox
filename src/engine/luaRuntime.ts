import type { BlockPart } from '../types/aniblox';

export interface LuaExecutionResult {
  logs: string[];
  spawnedParts: BlockPart[];
  touchedCallbacks: Map<string, Array<() => void>>;
  errors: string[];
}

export interface LuaRuntimeContext {
  existingBlocks: BlockPart[];
  onGiveCoins: (amount: number) => void;
  onGiveXP: (amount: number) => void;
  onSetCheckpoint: (cp: number) => void;
  onNotify: (msg: string) => void;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

// Clean, safe Lua-to-JS transpiler for Roblox/Aniblox Lua syntax
function transpileLuaToJs(lua: string): string {
  const lines = lua.split('\n');
  const out: string[] = [];

  for (let raw of lines) {
    // Strip single-line Lua comments
    const commentIdx = raw.indexOf('--');
    if (commentIdx >= 0) {
      // Check if inside string
      const before = raw.slice(0, commentIdx);
      const quoteCount = (before.match(/"/g) || []).length;
      if (quoteCount % 2 === 0) {
        raw = before;
      }
    }

    let line = raw.trim();
    if (!line) continue;

    // Method call colon syntax: obj:Method( -> obj.Method(
    line = line.replace(/([a-zA-Z0-9_.)]+):([a-zA-Z0-9_]+)\(/g, '$1.$2(');

    // Lua ~= to !==
    line = line.replace(/~=/g, '!==');
    // Lua == stays ===
    line = line.replace(/(?<![=!<>])==(?!=)/g, '===');
    // Lua logical operators
    line = line.replace(/\band\b/g, '&&').replace(/\bor\b/g, '||').replace(/\bnot\s+/g, '!');
    // nil -> null
    line = line.replace(/\bnil\b/g, 'null');
    // String concatenation .. -> +
    line = line.replace(/\.\./g, '+');

    // Control flow
    if (/^local\s+function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/.test(line)) {
      line = line.replace(/^local\s+function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/, 'let $1 = function($2) {');
    } else if (/^function\s+([a-zA-Z0-9_.]+)\s*\(([^)]*)\)/.test(line)) {
      line = line.replace(/^function\s+([a-zA-Z0-9_.]+)\s*\(([^)]*)\)/, 'function $1($2) {');
    } else if (/^local\s+/.test(line)) {
      line = line.replace(/^local\s+/, 'let ');
    } else if (/^if\s+(.+)\s+then$/.test(line)) {
      line = line.replace(/^if\s+(.+)\s+then$/, 'if ($1) {');
    } else if (/^elseif\s+(.+)\s+then$/.test(line)) {
      line = line.replace(/^elseif\s+(.+)\s+then$/, '} else if ($1) {');
    } else if (line === 'else') {
      line = '} else {';
    } else if (/^for\s+([a-zA-Z0-9_]+)\s*=\s*([^,]+),\s*([^,]+)(?:,\s*(.+))?\s+do$/.test(line)) {
      line = line.replace(
        /^for\s+([a-zA-Z0-9_]+)\s*=\s*([^,]+),\s*([^,]+)(?:,\s*(.+))?\s+do$/,
        (_, v, start, stop, step) => {
          const st = step || '1';
          return `for (let ${v} = ${start}; (${st}) >= 0 ? ${v} <= (${stop}) : ${v} >= (${stop}); ${v} += (${st})) {`;
        }
      );
    } else if (/^while\s+(.+)\s+do$/.test(line)) {
      line = line.replace(/^while\s+(.+)\s+do$/, 'let __guard = 0; while (($1) && ++__guard < 500) {');
    } else if (line === 'end') {
      line = '}';
    } else if (line === 'end)') {
      line = '})';
    }

    // Anonymous function(...) inside Connect
    line = line.replace(/function\s*\(([^)]*)\)(?!\s*\{)/g, 'function($1) {');

    out.push(line);
  }

  return out.join('\n');
}

export function executeAnibloxLua(
  luaCode: string,
  ctx: LuaRuntimeContext
): LuaExecutionResult {
  const logs: string[] = [];
  const spawnedParts: BlockPart[] = [];
  const touchedCallbacks = new Map<string, Array<() => void>>();
  const errors: string[] = [];

  const partProxies = new Map<string, Record<string, unknown>>();

  function wrapPart(block: BlockPart, isNew = false) {
    const proxy: Record<string, unknown> = {
      _block: block,
      Name: block.name,
      Position: { x: block.position[0], y: block.position[1], z: block.position[2] },
      Size: { x: block.size[0], y: block.size[1], z: block.size[2] },
      Color: block.color,
      Touched: {
        Connect: (fn: () => void) => {
          const list = touchedCallbacks.get(block.name) || [];
          list.push(fn);
          touchedCallbacks.set(block.name, list);
        },
      },
    };

    const reactive = new Proxy(proxy, {
      set(target, prop, value) {
        target[String(prop)] = value;
        if (prop === 'Name' && typeof value === 'string') {
          block.name = value;
        } else if (prop === 'Position' && value && typeof value === 'object') {
          const v = value as { x: number; y: number; z: number };
          block.position = [Number(v.x) || 0, Number(v.y) || 0, Number(v.z) || 0];
        } else if (prop === 'Size' && value && typeof value === 'object') {
          const v = value as { x: number; y: number; z: number };
          block.size = [Math.max(0.4, Number(v.x) || 2), Math.max(0.4, Number(v.y) || 1), Math.max(0.4, Number(v.z) || 2)];
        } else if (prop === 'Color' && typeof value === 'string') {
          block.color = value;
        }
        return true;
      },
    });

    if (isNew) {
      partProxies.set(block.id, reactive);
    }
    return reactive;
  }

  const workspaceObj = {
    FindFirstChild: (name: string) => {
      const found =
        ctx.existingBlocks.find((b) => b.name === name) ||
        spawnedParts.find((b) => b.name === name);
      return found ? wrapPart(found) : null;
    },
  };

  const sandboxEnv = {
    print: (...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    },
    Instance: {
      new: (className: string) => {
        if (className === 'Part') {
          const part: BlockPart = {
            id: `lua_part_${Date.now()}_${spawnedParts.length}`,
            name: `ScriptedPart_${spawnedParts.length + 1}`,
            shape: 'box',
            position: [0, 2, -6],
            size: [4, 1, 4],
            rotation: [0, 0, 0],
            color: '#3B82F6',
            material: 'plastic',
            role: 'solid',
            anchored: true,
            canCollide: true,
          };
          spawnedParts.push(part);
          return wrapPart(part, true);
        }
        return {};
      },
    },
    Vector3: {
      new: (x = 0, y = 0, z = 0) => ({ x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0 }),
    },
    Color3: {
      fromRGB: (r = 255, g = 255, b = 255) => rgbToHex(Number(r), Number(g), Number(b)),
    },
    game: {
      Workspace: workspaceObj,
      Players: {
        LocalPlayer: { Name: 'Player' },
      },
    },
    Workspace: workspaceObj,
    GiveCoins: (n: number) => ctx.onGiveCoins(Number(n) || 0),
    GiveXP: (n: number) => ctx.onGiveXP(Number(n) || 0),
    SetCheckpoint: (cp: number) => ctx.onSetCheckpoint(Number(cp) || 0),
    Notify: (msg: string) => ctx.onNotify(String(msg || '')),
    math: Math,
    tostring: String,
    tonumber: Number,
  };

  try {
    const jsCode = transpileLuaToJs(luaCode);
    const keys = Object.keys(sandboxEnv);
    const vals = Object.values(sandboxEnv);
    const runner = new Function(...keys, `"use strict";\n${jsCode}`);
    runner(...vals);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return { logs, spawnedParts, touchedCallbacks, errors };
}
