import type { AvatarConfig, BlockPart, MarketplaceItem, WorldData, WorldGenre } from '../types/aniblox.js';

export const DEFAULT_AVATAR: AvatarConfig = {
  skinColor: '#F5CD30',
  torsoColor: '#0D69AC',
  leftArmColor: '#F5CD30',
  rightArmColor: '#F5CD30',
  leftLegColor: '#4B974B',
  rightLegColor: '#4B974B',
  faceStyle: 'happy',
  animPack: 'classic',
  scale: 1,
  accessories: ['visor_cyber'],
};

export const THUMBNAILS: Record<WorldGenre, string> = {
  obby: '/src/assets/images/world_sky_obby_1795572888912.jpg',
  tycoon: '/src/assets/images/world_tycoon_island_1795572889371.jpg',
  simulator: '/src/assets/images/world_crystal_sim_1795572890112.jpg',
  arena: '/src/assets/images/world_combat_arena_1795572890091.jpg',
  social: '/src/assets/images/world_social_plaza_1795572891066.jpg',
  sandbox: '/src/assets/images/world_sky_obby_1795572888912.jpg',
};

export const BASEPLATE_BLOCKS: BlockPart[] = [
  { id: 'bp_floor', name: 'Baseplate', shape: 'box', position: [0, -0.5, 0], size: [64, 1, 64], rotation: [0, 0, 0], color: '#475569', material: 'plastic', role: 'solid', anchored: true, canCollide: true },
  { id: 'bp_spawn', name: 'SpawnLocation', shape: 'box', position: [0, 0.25, 0], size: [6, 0.5, 6], rotation: [0, 0, 0], color: '#10B981', material: 'plastic', role: 'spawn', anchored: true, canCollide: true },
];

export const BASEPLATE_LUA = `-- Blank Baseplate Starter Script
print("Baseplate initialized. Use Toolbox or AI Agent to build your world!")`;

export const OBBY_BLOCKS: BlockPart[] = [
  // Stage 1: Tropical Island (Above the Clouds)
  { id: 'ob_spawn', name: 'TropicalIsland', shape: 'box', position: [0, 0, 0], size: [14, 1.8, 14], rotation: [0, 0, 0], color: '#4B974B', material: 'grass', role: 'spawn', anchored: true, canCollide: true },
  { id: 'ob_sand', name: 'ShoreDeck', shape: 'box', position: [0, 0.2, -5.5], size: [12, 1.5, 4], rotation: [0, 0, 0], color: '#FDE68A', material: 'plastic', role: 'solid', anchored: true, canCollide: true },
  { id: 'ob_palm1', name: 'PalmTree_L', shape: 'cylinder', position: [-5, 3.8, -2], size: [2, 6, 2], rotation: [0, 0, 0], color: '#16A34A', material: 'wood', role: 'solid', anchored: true, canCollide: false, compositeType: 'tree' },
  { id: 'ob_palm2', name: 'PalmTree_R', shape: 'cylinder', position: [5, 3.8, 3], size: [2, 6, 2], rotation: [0, 0, 0], color: '#16A34A', material: 'wood', role: 'solid', anchored: true, canCollide: false, compositeType: 'tree' },
  { id: 'ob_blimp', name: 'SkyBlimp', shape: 'box', position: [14, 14, -28], size: [6, 4, 12], rotation: [0, 0.3, 0], color: '#38BDF8', material: 'plastic', role: 'solid', anchored: true, canCollide: false, compositeType: 'blimp', patrolAxis: 'x', patrolRange: 8 },

  { id: 'ob_t1', name: 'CoralStep_1', shape: 'box', position: [0, 0.9, -11], size: [4.5, 0.8, 4.5], rotation: [0, 0, 0], color: '#06B6D4', material: 'plastic', role: 'solid', anchored: true, canCollide: true },
  { id: 'ob_coin1', name: 'IslandCoin_1', shape: 'cylinder', position: [0, 2.3, -11], size: [1.4, 0.4, 1.4], rotation: [Math.PI / 2, 0, 0], color: '#FBBF24', material: 'neon', role: 'coin', anchored: true, canCollide: false, value: 25, spinSpeed: 2.5 },
  { id: 'ob_t2', name: 'CoralStep_2', shape: 'box', position: [3.5, 1.9, -17], size: [4.5, 0.8, 4.5], rotation: [0, 0, 0], color: '#F59E0B', material: 'plastic', role: 'solid', anchored: true, canCollide: true },
  { id: 'ob_coin2', name: 'IslandCoin_2', shape: 'cylinder', position: [3.5, 3.3, -17], size: [1.4, 0.4, 1.4], rotation: [Math.PI / 2, 0, 0], color: '#FBBF24', material: 'neon', role: 'coin', anchored: true, canCollide: false, value: 25, spinSpeed: 2.5 },
  { id: 'ob_mover1', name: 'LagoonFerry', shape: 'box', position: [0, 2.5, -24], size: [5, 0.8, 4.2], rotation: [0, 0, 0], color: '#38BDF8', material: 'neon', role: 'solid', anchored: true, canCollide: true, patrolAxis: 'x', patrolRange: 4.5 },

  // Stage 2: Candy World (Crumbling Platforms & Moving Bars)
  { id: 'ob_cp1', name: 'CandyGate_CP1', shape: 'box', position: [0, 3.1, -32], size: [9, 1.2, 8], rotation: [0, 0, 0], color: '#EC4899', material: 'plastic', role: 'checkpoint', anchored: true, canCollide: true, value: 1 },
  { id: 'ob_lolli1', name: 'GiantLollipop_L', shape: 'cylinder', position: [-3.8, 6.2, -32], size: [2, 5, 2], rotation: [0, 0, 0], color: '#F472B6', material: 'plastic', role: 'solid', anchored: true, canCollide: false, compositeType: 'lollipop' },
  { id: 'ob_lolli2', name: 'GiantLollipop_R', shape: 'cylinder', position: [3.8, 6.2, -32], size: [2, 5, 2], rotation: [0, 0, 0], color: '#34D399', material: 'plastic', role: 'solid', anchored: true, canCollide: false, compositeType: 'lollipop' },
  { id: 'ob_crumble1', name: 'SugarWafer_1', shape: 'box', position: [-2.5, 3.5, -39], size: [4.2, 0.8, 4.2], rotation: [0, 0, 0], color: '#F9A8D4', material: 'plastic', role: 'crumble', anchored: true, canCollide: true },
  { id: 'ob_coin3', name: 'CandyCoin_3', shape: 'cylinder', position: [-2.5, 4.9, -39], size: [1.4, 0.4, 1.4], rotation: [Math.PI / 2, 0, 0], color: '#FBBF24', material: 'neon', role: 'coin', anchored: true, canCollide: false, value: 25, spinSpeed: 2.5 },
  { id: 'ob_crumble2', name: 'MintWafer_2', shape: 'box', position: [2.5, 4.2, -45], size: [4.2, 0.8, 4.2], rotation: [0, 0, 0], color: '#6EE7B7', material: 'plastic', role: 'crumble', anchored: true, canCollide: true },
  { id: 'ob_coin4', name: 'CandyCoin_4', shape: 'cylinder', position: [2.5, 5.6, -45], size: [1.4, 0.4, 1.4], rotation: [Math.PI / 2, 0, 0], color: '#FBBF24', material: 'neon', role: 'coin', anchored: true, canCollide: false, value: 25, spinSpeed: 2.5 },
  { id: 'ob_candy_bridge', name: 'GummyBridge', shape: 'box', position: [0, 4.8, -52], size: [5.5, 0.9, 6], rotation: [0, 0, 0], color: '#C084FC', material: 'plastic', role: 'solid', anchored: true, canCollide: true },

  // Stage 3: Lava Volcano (Rotating Laser Hazards, Bounce Pad & Summit)
  { id: 'ob_cp2', name: 'VolcanoBase_CP2', shape: 'box', position: [0, 5.2, -60], size: [9, 1.2, 8], rotation: [0, 0, 0], color: '#10B981', material: 'stone', role: 'checkpoint', anchored: true, canCollide: true, value: 2 },
  { id: 'ob_lava_base', name: 'BasaltBridge', shape: 'box', position: [0, 5.2, -71], size: [6.5, 0.9, 12], rotation: [0, 0, 0], color: '#27272A', material: 'stone', role: 'solid', anchored: true, canCollide: true },
  { id: 'ob_lava_1', name: 'SpinningMagmaBar', shape: 'box', position: [0, 6.2, -71], size: [7.5, 0.55, 0.75], rotation: [0, 0, 0], color: '#EF4444', material: 'neon', role: 'hazard', anchored: true, canCollide: true, spinSpeed: 1.5 },
  { id: 'ob_coin5', name: 'MagmaCoin_5', shape: 'cylinder', position: [0, 7.6, -71], size: [1.4, 0.4, 1.4], rotation: [Math.PI / 2, 0, 0], color: '#FBBF24', material: 'neon', role: 'coin', anchored: true, canCollide: false, value: 35, spinSpeed: 2.8 },
  { id: 'ob_bounce', name: 'GeyserJumpPad', shape: 'cylinder', position: [0, 5.8, -81], size: [4.2, 0.65, 4.2], rotation: [0, 0, 0], color: '#F43F5E', material: 'neon', role: 'bounce', anchored: true, canCollide: true, value: 26 },
  { id: 'ob_volcano_prop', name: 'LavaVolcanoPeak', shape: 'cylinder', position: [-14, 10, -94], size: [12, 16, 12], rotation: [0, 0, 0], color: '#3F3F46', material: 'stone', role: 'solid', anchored: true, canCollide: false, compositeType: 'volcano' },
  { id: 'ob_high', name: 'VolcanoSummit', shape: 'box', position: [0, 11.4, -92], size: [11, 1.4, 11], rotation: [0, 0, 0], color: '#18181B', material: 'stone', role: 'checkpoint', anchored: true, canCollide: true, value: 3 },
  { id: 'ob_coin6', name: 'SummitCrownCoin', shape: 'sphere', position: [0, 13.8, -92], size: [2, 2, 2], rotation: [0, 0, 0], color: '#FACC15', material: 'neon', role: 'coin', anchored: true, canCollide: false, value: 100, spinSpeed: 1.8 },
  { id: 'ob_finish', name: 'VictoryPortal', shape: 'box', position: [0, 14.2, -96], size: [4.5, 4.8, 0.9], rotation: [0, 0, 0], color: '#38BDF8', material: 'neon', role: 'portal', anchored: true, canCollide: false, scriptTag: 'FinishObby' },
];

export const OBBY_LUA = `-- 3-World Adventure Obby: Tropical -> Candy -> Volcano
local Workspace = game.Workspace
print("Welcome to Skyward 3-World Obby! Reach the Volcano Summit.")

local portal = Workspace:FindFirstChild("VictoryPortal")
if portal then
  portal.Touched:Connect(function(hit)
    GiveCoins(50)
    GiveXP(150)
    Notify("Course Complete! +50 Anibux & +150 XP")
  end)
end`;

export const TYCOON_BLOCKS: BlockPart[] = [
  { id: 'ty_base', name: 'IslandGround', shape: 'box', position: [0, -0.5, 0], size: [34, 1, 34], rotation: [0, 0, 0], color: '#4B974B', material: 'grass', role: 'spawn', anchored: true, canCollide: true },
  { id: 'ty_ocean', name: 'OceanFloor', shape: 'box', position: [0, -1.3, 0], size: [90, 0.6, 90], rotation: [0, 0, 0], color: '#0284C7', material: 'glass', role: 'solid', anchored: true, canCollide: true },
  { id: 'ty_pad', name: 'FactoryFloor', shape: 'box', position: [0, 0.1, -6], size: [18, 0.4, 14], rotation: [0, 0, 0], color: '#475569', material: 'stone', role: 'solid', anchored: true, canCollide: true },
  { id: 'ty_conveyor', name: 'MainConveyor', shape: 'box', position: [0, 0.5, -6], size: [12, 0.4, 3], rotation: [0, 0, 0], color: '#18181B', material: 'metal', role: 'conveyor', anchored: true, canCollide: true, value: 8 },
  { id: 'ty_dropper1', name: 'OreDropper_Mk1', shape: 'box', position: [-5, 2.2, -6], size: [2.4, 3.2, 2.4], rotation: [0, 0, 0], color: '#06B6D4', material: 'metal', role: 'dropper', anchored: true, canCollide: true, value: 15, scriptTag: 'Dropper1' },
  { id: 'ty_dropper2', name: 'PlasmaDropper_Mk2', shape: 'box', position: [-5, 2.2, -10], size: [2.4, 3.2, 2.4], rotation: [0, 0, 0], color: '#F59E0B', material: 'neon', role: 'dropper', anchored: true, canCollide: true, value: 30, scriptTag: 'Dropper2' },
  { id: 'ty_collector', name: 'CashCollector', shape: 'box', position: [6.5, 1.2, -6], size: [2.8, 2.2, 4], rotation: [0, 0, 0], color: '#10B981', material: 'neon', role: 'checkpoint', anchored: true, canCollide: true, value: 1, scriptTag: 'CollectCash' },
  { id: 'ty_upg1', name: 'UpgradePad_Speed', shape: 'cylinder', position: [6, 0.5, 4], size: [3, 0.4, 3], rotation: [0, 0, 0], color: '#22C55E', material: 'neon', role: 'coin', anchored: true, canCollide: false, value: 40, scriptTag: 'BuyUpgrade' },
  { id: 'ty_hq', name: 'HQTower', shape: 'box', position: [-10, 3, 6], size: [6, 6, 6], rotation: [0, 0, 0], color: '#E2E8F0', material: 'plastic', role: 'solid', anchored: true, canCollide: true },
  { id: 'ty_roof', name: 'HQRoof', shape: 'wedge', position: [-10, 7, 6], size: [6.4, 2, 6.4], rotation: [0, 0, 0], color: '#EF4444', material: 'plastic', role: 'solid', anchored: true, canCollide: true },
];

export const TYCOON_LUA = `-- Tropical Tycoon Island Automation
local collector = game.Workspace:FindFirstChild("CashCollector")
print("Tycoon automation online!")

if collector then
  collector.Touched:Connect(function(hit)
    GiveCoins(35)
    GiveXP(25)
    Notify("Collected +35 Tycoon Credits!")
  end)
end`;

export const SIMULATOR_BLOCKS: BlockPart[] = [
  { id: 'sim_ground', name: 'ValleyFloor', shape: 'box', position: [0, -0.5, 0], size: [42, 1, 42], rotation: [0, 0, 0], color: '#3F8E47', material: 'grass', role: 'spawn', anchored: true, canCollide: true },
  { id: 'sim_cliff1', name: 'CrystalRidge', shape: 'box', position: [0, 3, -15], size: [24, 7, 8], rotation: [0, 0, 0], color: '#64748B', material: 'stone', role: 'solid', anchored: true, canCollide: true },
  { id: 'sim_crys1', name: 'EmeraldNode_1', shape: 'box', position: [-5, 1.5, -8], size: [1.8, 2.8, 1.8], rotation: [0.2, 0.4, 0.1], color: '#10B981', material: 'neon', role: 'coin', anchored: true, canCollide: false, value: 20, spinSpeed: 1.4 },
  { id: 'sim_crys2', name: 'AmethystNode_2', shape: 'box', position: [4, 1.5, -8], size: [1.8, 2.8, 1.8], rotation: [-0.2, 0.8, 0.1], color: '#A855F7', material: 'neon', role: 'coin', anchored: true, canCollide: false, value: 35, spinSpeed: 1.6 },
  { id: 'sim_crys3', name: 'SolarCrystal_3', shape: 'sphere', position: [0, 8.2, -15], size: [2.4, 2.4, 2.4], rotation: [0, 0, 0], color: '#F59E0B', material: 'neon', role: 'coin', anchored: true, canCollide: false, value: 75, spinSpeed: 2.0 },
  { id: 'sim_cabin', name: 'MinerCabin', shape: 'box', position: [-12, 2, 4], size: [7, 4.5, 6], rotation: [0, 0, 0], color: '#92400E', material: 'wood', role: 'solid', anchored: true, canCollide: true },
  { id: 'sim_sell', name: 'SellRing', shape: 'cylinder', position: [10, 0.3, 4], size: [4.5, 0.5, 4.5], rotation: [0, 0, 0], color: '#FBBF24', material: 'neon', role: 'checkpoint', anchored: true, canCollide: false, value: 1 },
  { id: 'sim_ramp', name: 'HillRamp', shape: 'wedge', position: [9, 3, -11], size: [4, 6, 8], rotation: [0, 0, 0], color: '#78716C', material: 'stone', role: 'solid', anchored: true, canCollide: true },
];

export const SIMULATOR_LUA = `-- Crystal Cavern Simulator Harvest Script
print("Crystal Cavern nodes spawned.")
local sellRing = game.Workspace:FindFirstChild("SellRing")
if sellRing then
  sellRing.Touched:Connect(function(hit)
    GiveCoins(25)
    GiveXP(40)
    Notify("Refined crystals sold for +25 Anibux!")
  end)
end`;

export const ARENA_BLOCKS: BlockPart[] = [
  { id: 'ar_floor', name: 'ArenaFloor', shape: 'box', position: [0, -0.5, 0], size: [40, 1, 40], rotation: [0, 0, 0], color: '#18181B', material: 'stone', role: 'spawn', anchored: true, canCollide: true },
  { id: 'ar_bridge', name: 'CenterBridge', shape: 'box', position: [0, 3.2, 0], size: [6, 0.8, 28], rotation: [0, 0, 0], color: '#27272A', material: 'metal', role: 'solid', anchored: true, canCollide: true },
  { id: 'ar_ramp_n', name: 'NorthRamp', shape: 'wedge', position: [0, 1.5, -16], size: [6, 3.2, 5], rotation: [0, 0, 0], color: '#06B6D4', material: 'plastic', role: 'solid', anchored: true, canCollide: true },
  { id: 'ar_ramp_s', name: 'SouthRamp', shape: 'wedge', position: [0, 1.5, 16], size: [6, 3.2, 5], rotation: [0, Math.PI, 0], color: '#EF4444', material: 'plastic', role: 'solid', anchored: true, canCollide: true },
  { id: 'ar_cover_l', name: 'CyanBarrier', shape: 'box', position: [-10, 1.4, -6], size: [2, 2.8, 7], rotation: [0, 0, 0], color: '#06B6D4', material: 'neon', role: 'solid', anchored: true, canCollide: true },
  { id: 'ar_cover_r', name: 'CrimsonBarrier', shape: 'box', position: [10, 1.4, 6], size: [2, 2.8, 7], rotation: [0, 0, 0], color: '#DC2626', material: 'neon', role: 'solid', anchored: true, canCollide: true },
  { id: 'ar_power', name: 'OverdriveOrb', shape: 'sphere', position: [0, 5.2, 0], size: [1.8, 1.8, 1.8], rotation: [0, 0, 0], color: '#10B981', material: 'neon', role: 'coin', anchored: true, canCollide: false, value: 50, spinSpeed: 3 },
  { id: 'ar_jump1', name: 'FlankBounceL', shape: 'cylinder', position: [-14, 0.3, 0], size: [3.2, 0.5, 3.2], rotation: [0, 0, 0], color: '#F43F5E', material: 'neon', role: 'bounce', anchored: true, canCollide: false, value: 24 },
  { id: 'ar_jump2', name: 'FlankBounceR', shape: 'cylinder', position: [14, 0.3, 0], size: [3.2, 0.5, 3.2], rotation: [0, 0, 0], color: '#F43F5E', material: 'neon', role: 'bounce', anchored: true, canCollide: false, value: 24 },
];

export const ARENA_LUA = `-- Colosseum Blox Arena Ranked Match Logic
print("Ranked Match Ruleset Active: Anti-Cheat Verified")
local orb = game.Workspace:FindFirstChild("OverdriveOrb")
if orb then
  orb.Touched:Connect(function(hit)
    GiveXP(60)
    Notify("Overdrive Orb captured! +60 Arena XP")
  end)
end`;

export const SOCIAL_BLOCKS: BlockPart[] = [
  { id: 'soc_plaza', name: 'PlazaTileFloor', shape: 'box', position: [0, -0.5, 0], size: [44, 1, 44], rotation: [0, 0, 0], color: '#CBD5E1', material: 'stone', role: 'spawn', anchored: true, canCollide: true },
  { id: 'soc_fountain', name: 'FountainBase', shape: 'cylinder', position: [0, 0.6, -4], size: [7, 1.2, 7], rotation: [0, 0, 0], color: '#94A3B8', material: 'stone', role: 'solid', anchored: true, canCollide: true },
  { id: 'soc_water', name: 'FountainWater', shape: 'cylinder', position: [0, 1.3, -4], size: [5.4, 0.4, 5.4], rotation: [0, 0, 0], color: '#38BDF8', material: 'neon', role: 'solid', anchored: true, canCollide: true },
  { id: 'soc_spire', name: 'FountainSpire', shape: 'cylinder', position: [0, 3.2, -4], size: [1.4, 4, 1.4], rotation: [0, 0, 0], color: '#60A5FA', material: 'glass', role: 'solid', anchored: true, canCollide: true },
  { id: 'soc_stage', name: 'ConcertStage', shape: 'box', position: [0, 0.7, -17], size: [14, 1.4, 7], rotation: [0, 0, 0], color: '#18181B', material: 'metal', role: 'solid', anchored: true, canCollide: true },
  { id: 'soc_screen', name: 'StageScreen', shape: 'box', position: [0, 4.6, -20], size: [12, 6, 0.6], rotation: [0, 0, 0], color: '#10B981', material: 'neon', role: 'solid', anchored: true, canCollide: true },
  { id: 'soc_cafe', name: 'BlockCafe', shape: 'box', position: [-14, 2.5, 2], size: [8, 5, 10], rotation: [0, 0, 0], color: '#B45309', material: 'wood', role: 'solid', anchored: true, canCollide: true },
  { id: 'soc_cafe_roof', name: 'CafeAwning', shape: 'wedge', position: [-14, 6, 2], size: [8.6, 2, 10.6], rotation: [0, 0, 0], color: '#EF4444', material: 'plastic', role: 'solid', anchored: true, canCollide: true },
  { id: 'soc_portal_obby', name: 'ObbyPortal', shape: 'box', position: [14, 2.4, 2], size: [3.6, 4.4, 0.8], rotation: [0, -0.4, 0], color: '#10B981', material: 'neon', role: 'portal', anchored: true, canCollide: false, value: 1 },
];

export const SOCIAL_LUA = `-- Nexus Social Plaza Interactive Hub
print("Welcome to Nexus Social Plaza! Press T for Voice or open Chat.")
local stage = game.Workspace:FindFirstChild("ConcertStage")
if stage then
  stage.Touched:Connect(function(hit)
    Notify("On Stage! Express yourself with Emotes or Voice Chat.")
  end)
end`;

export const STARTER_WORLDS: WorldData[] = [
  {
    id: 'world_sky_obby',
    creatorId: 'creator_aniblox',
    creatorName: 'AnibloxCore',
    title: 'Skyward Stud Obby',
    description: 'Leap across glowing stud platforms, dodge rotating laser bars, hit checkpoints, and launch off bounce pads high above the clouds.',
    genre: 'obby',
    thumbnailUrl: THUMBNAILS.obby,
    skyColor: '#38BDF8',
    blocks: OBBY_BLOCKS,
    scriptCode: OBBY_LUA,
    maxPlayers: 24,
    plays: 14820,
    likes: 4120,
    isPublished: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'world_tycoon_island',
    creatorId: 'creator_aniblox',
    creatorName: 'BuilderKai',
    title: 'Tropical Tycoon Island',
    description: 'Build an automated stud-brick factory, collect dropper income, upgrade conveyor speed, and expand your island HQ.',
    genre: 'tycoon',
    thumbnailUrl: THUMBNAILS.tycoon,
    skyColor: '#0EA5E9',
    blocks: TYCOON_BLOCKS,
    scriptCode: TYCOON_LUA,
    maxPlayers: 12,
    plays: 9340,
    likes: 2890,
    isPublished: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'world_crystal_sim',
    creatorId: 'creator_luna',
    creatorName: 'LunaVoxel',
    title: 'Crystal Cavern Simulator',
    description: 'Harvest emerald, amethyst, and solar crystals across voxel hills and cash them in at the golden refinery ring.',
    genre: 'simulator',
    thumbnailUrl: THUMBNAILS.simulator,
    skyColor: '#60A5FA',
    blocks: SIMULATOR_BLOCKS,
    scriptCode: SIMULATOR_LUA,
    maxPlayers: 16,
    plays: 11250,
    likes: 3410,
    isPublished: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'world_combat_arena',
    creatorId: 'creator_aniblox',
    creatorName: 'ArenaMaster',
    title: 'Colosseum Blox Arena',
    description: 'Competitive Elo-ranked 3D colosseum with elevated steel bridges, overdrive orbs, and server-authoritative anti-cheat.',
    genre: 'arena',
    thumbnailUrl: THUMBNAILS.arena,
    skyColor: '#09090B',
    blocks: ARENA_BLOCKS,
    scriptCode: ARENA_LUA,
    maxPlayers: 16,
    plays: 8650,
    likes: 2540,
    isPublished: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'world_social_plaza',
    creatorId: 'creator_aniblox',
    creatorName: 'AnibloxCore',
    title: 'Nexus Social Plaza',
    description: 'Cross-platform social hangout hub featuring live WebRTC voice chat, concert stage, Block Cafe, and world portals.',
    genre: 'social',
    thumbnailUrl: THUMBNAILS.social,
    skyColor: '#09090B',
    blocks: SOCIAL_BLOCKS,
    scriptCode: SOCIAL_LUA,
    maxPlayers: 40,
    plays: 22410,
    likes: 6910,
    isPublished: true,
    updatedAt: new Date().toISOString(),
  },
];

export const STARTER_MARKETPLACE: MarketplaceItem[] = [
  { id: 'visor_cyber', creatorId: 'creator_aniblox', creatorName: 'AnibloxCore', name: 'Cobalt Cyber Visor', description: 'Translucent tactical visor with glowing edge trim.', category: 'hat', price: 0, color: '#38BDF8', accentColor: '#0284C7', assetKey: 'visor', sales: 8420, createdAt: new Date().toISOString() },
  { id: 'crown_studs', creatorId: 'creator_aniblox', creatorName: 'AnibloxCore', name: 'Golden Crown of Studs', description: 'Royal 4-point crown forged from pure Anibux gold.', category: 'hat', price: 250, color: '#FBBF24', accentColor: '#F59E0B', assetKey: 'crown', sales: 3120, createdAt: new Date().toISOString() },
  { id: 'valkyrie_helm', creatorId: 'creator_luna', creatorName: 'LunaVoxel', name: 'Emerald Valkyrie Helm', description: 'Winged championship helmet for top ranked builders.', category: 'hat', price: 400, color: '#10B981', accentColor: '#34D399', assetKey: 'valkyrie', sales: 1940, createdAt: new Date().toISOString() },
  { id: 'jetpack_neon', creatorId: 'creator_aniblox', creatorName: 'BuilderKai', name: 'Thruster Jetpack', description: 'Twin-nozzle back rig with cobalt plasma cores.', category: 'wings', price: 320, color: '#475569', accentColor: '#38BDF8', assetKey: 'jetpack', sales: 2780, createdAt: new Date().toISOString() },
  { id: 'wings_mech', creatorId: 'creator_luna', creatorName: 'LunaVoxel', name: 'Valkyrie Wing Rig', description: 'Articulated angular wings mounted to the upper torso.', category: 'wings', price: 500, color: '#F8FAFC', accentColor: '#3B82F6', assetKey: 'wings', sales: 1450, createdAt: new Date().toISOString() },
  { id: 'cape_shadow', creatorId: 'creator_aniblox', creatorName: 'ArenaMaster', name: 'Crimson Guardian Cape', description: 'Broad-shouldered cloth mantle for arena champions.', category: 'wings', price: 180, color: '#DC2626', accentColor: '#991B1B', assetKey: 'cape', sales: 4210, createdAt: new Date().toISOString() },
  { id: 'blade_plasma', creatorId: 'creator_aniblox', creatorName: 'ArenaMaster', name: 'Stud Plasma Blade', description: 'Right-hand mounted energy sword for combat arenas.', category: 'gear', price: 350, color: '#06B6D4', accentColor: '#09090B', assetKey: 'blade', sales: 2990, createdAt: new Date().toISOString() },
  { id: 'aura_halo', creatorId: 'creator_luna', creatorName: 'LunaVoxel', name: 'Solar Halo Ring', description: 'Floating luminous ring hovering above the character rig.', category: 'aura', price: 450, color: '#FDE047', accentColor: '#F59E0B', assetKey: 'halo', sales: 1620, createdAt: new Date().toISOString() },
];

export const BATTLE_PASS_REWARDS = [
  { tier: 1, xpRequired: 0, freeReward: '100 Anibux', premiumReward: 'Cobalt Cyber Visor', anibux: 100, itemId: 'visor_cyber' },
  { tier: 2, xpRequired: 200, freeReward: '150 Anibux', premiumReward: 'Crimson Guardian Cape', anibux: 150, itemId: 'cape_shadow' },
  { tier: 3, xpRequired: 500, freeReward: '200 Anibux', premiumReward: 'Golden Crown of Studs', anibux: 200, itemId: 'crown_studs' },
  { tier: 4, xpRequired: 900, freeReward: '250 Anibux', premiumReward: 'Thruster Jetpack', anibux: 250, itemId: 'jetpack_neon' },
  { tier: 5, xpRequired: 1400, freeReward: '350 Anibux', premiumReward: 'Stud Plasma Blade', anibux: 350, itemId: 'blade_plasma' },
  { tier: 6, xpRequired: 2000, freeReward: '500 Anibux', premiumReward: 'Valkyrie Wing Rig', anibux: 500, itemId: 'wings_mech' },
];

export const DAILY_REWARDS = [
  { day: 1, anibux: 50, xp: 50, label: 'Day 1' },
  { day: 2, anibux: 75, xp: 80, label: 'Day 2' },
  { day: 3, anibux: 100, xp: 120, label: 'Day 3' },
  { day: 4, anibux: 150, xp: 150, label: 'Day 4' },
  { day: 5, anibux: 200, xp: 200, label: 'Day 5' },
  { day: 6, anibux: 300, xp: 250, label: 'Day 6' },
  { day: 7, anibux: 500, xp: 400, label: 'Day 7 Jackpot' },
];
