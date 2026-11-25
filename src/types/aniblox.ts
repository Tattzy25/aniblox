export type BlockShape = 'box' | 'wedge' | 'cylinder' | 'sphere';

export type BlockMaterial =
  | 'plastic'
  | 'neon'
  | 'metal'
  | 'glass'
  | 'wood'
  | 'stone'
  | 'grass';

export type BlockRole =
  | 'solid'
  | 'spawn'
  | 'checkpoint'
  | 'hazard'
  | 'coin'
  | 'bounce'
  | 'conveyor'
  | 'dropper'
  | 'portal'
  | 'crumble';

export type CompositePropType = 'tree' | 'lollipop' | 'volcano' | 'blimp';

export interface BlockPart {
  id: string;
  name: string;
  shape: BlockShape;
  position: [number, number, number];
  size: [number, number, number];
  rotation: [number, number, number];
  color: string;
  material: BlockMaterial;
  role: BlockRole;
  anchored: boolean;
  canCollide: boolean;
  scriptTag?: string;
  value?: number;
  spinSpeed?: number;
  patrolAxis?: 'x' | 'y' | 'z';
  patrolRange?: number;
  compositeType?: CompositePropType;
}

export type WorldGenre = 'obby' | 'tycoon' | 'simulator' | 'arena' | 'sandbox' | 'social';

export interface WorldData {
  id: string;
  creatorId: string;
  creatorName: string;
  title: string;
  description: string;
  genre: WorldGenre;
  thumbnailUrl: string;
  skyColor: string;
  blocks: BlockPart[];
  scriptCode: string;
  maxPlayers: number;
  plays: number;
  likes: number;
  isPublished: boolean;
  updatedAt: string;
}

export type FaceStyle = 'happy' | 'cool' | 'hyper' | 'ninja';
export type AnimPack = 'classic' | 'ninja' | 'hero' | 'levitate';

export interface AvatarConfig {
  skinColor: string;
  torsoColor: string;
  leftArmColor: string;
  rightArmColor: string;
  leftLegColor: string;
  rightLegColor: string;
  faceStyle: FaceStyle;
  animPack: AnimPack;
  scale: number;
  accessories: string[];
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarConfig: AvatarConfig;
  anibux: number;
  xp: number;
  level: number;
  elo: number;
  battlePassTier: number;
  battlePassPremium: boolean;
  claimedPassTiers: number[];
  dailyStreak: number;
  lastDailyClaim: string | null;
  role: 'player' | 'creator' | 'moderator';
  tutorialStep: number;
  matchesPlayed: number;
  wins: number;
  blocksPlaced: number;
  isGuest?: boolean;
}

export interface WorldSave {
  userId: string;
  worldId: string;
  checkpoint: number;
  coins: number;
  tycoonStage: number;
  bestTimeMs: number | null;
  score: number;
  updatedAt: string;
}

export type MarketplaceCategory = 'hat' | 'wings' | 'gear' | 'aura' | 'model';

export interface MarketplaceItem {
  id: string;
  creatorId: string;
  creatorName: string;
  name: string;
  description: string;
  category: MarketplaceCategory;
  price: number;
  color: string;
  accentColor: string;
  assetKey: string;
  sales: number;
  owned?: boolean;
  createdAt: string;
}

export interface FriendEntry {
  id: string;
  username: string;
  displayName: string;
  elo: number;
  level: number;
  status: 'pending_in' | 'pending_out' | 'accepted';
  online: boolean;
  currentWorldId?: string;
  currentWorldTitle?: string;
  avatarConfig: AvatarConfig;
}

export interface FeedPost {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  worldId: string;
  worldTitle: string;
  content: string;
  statHighlight: string;
  likes: number;
  createdAt: string;
}

export interface ReportTicket {
  id: string;
  reporterId: string;
  reporterName: string;
  targetUserId: string;
  targetUsername: string;
  reason: string;
  chatExcerpt: string;
  worldId: string;
  status: 'open' | 'actioned' | 'dismissed';
  actionTaken: string;
  createdAt: string;
}

export interface AntiCheatLog {
  id: string;
  userId: string;
  username: string;
  worldId: string;
  violationType: string;
  details: string;
  severity: 'low' | 'medium' | 'high';
  createdAt: string;
}

export interface PrivateServerInfo {
  id: string;
  code: string;
  worldId: string;
  worldTitle: string;
  ownerId: string;
  ownerName: string;
  name: string;
  maxPlayers: number;
  activePlayers: number;
  createdAt: string;
}

export interface RemotePlayerState {
  id: string;
  username: string;
  displayName: string;
  avatarConfig: AvatarConfig;
  position: [number, number, number];
  yaw: number;
  anim: 'idle' | 'walk' | 'run' | 'jump' | 'dance';
  speaking: boolean;
  score: number;
  elo: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  text: string;
  filtered: boolean;
  system?: boolean;
  timestamp: string;
}
