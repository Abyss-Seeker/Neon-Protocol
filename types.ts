export enum Difficulty {
  EASY = 'PROTOCOL_INIT',
  NORMAL = 'STANDARD_OP',
  HARD = 'CATASTROPHE',
  EXTREME = 'ARMAGEDDON',
  INFINITY = 'SINGULARITY',
  BOSS_RUSH = 'EXECUTION_MODE',
  BOSS_RUSH_EXTREME = 'EXECUTION_MODE_EXTREME'
}

export enum WeaponId {
  PLASMA_CUTTER = 'plasma_cutter',
  HOMING_NEEDLES = 'homing_needles',
  SPREAD_SHOTGUN = 'spread_shotgun',
  LASER_STREAM = 'laser_stream',
  WAVE_MOTION = 'wave_motion',
  ORBITING_ORBS = 'orbiting_orbs',
  ROCKET_BARRAGE = 'rocket_barrage',
  CHAIN_LIGHTNING = 'chain_lightning',
  BACK_TURRET = 'back_turret',
  VORTEX_DRIVER = 'vortex_driver',
  GAUSS_CANNON = 'gauss_cannon',
  PULSE_NOVA = 'pulse_nova',
  PHASE_BLADES = 'phase_blades'
}

export enum SpellCardId {
  TIME_DILATOR = 'time_dilator',
  EMP_BLAST = 'emp_blast',
  OVERCLOCK = 'overclock',
  PHANTOM_DASH = 'phantom_dash',
  ORBITAL_STRIKE = 'orbital_strike',
  NANO_REPAIR = 'nano_repair',
  AEGIS_SHIELD = 'aegis_shield',
  STASIS_FIELD = 'stasis_field'
}

export enum BoosterId {
  EXTRA_LIFE = 'extra_life',
  ATTACK_UP = 'attack_up',
  REGEN_UP = 'regen_up',
  CDR_UP = 'cdr_up',
  LOOT_UP = 'loot_up',
  EXTRA_WEAPON = 'extra_weapon',
  EXTRA_SPELL = 'extra_spell',
  DMG_RED = 'dmg_red'
}

export interface BoosterDef {
  id: BoosterId;
  name: string;
  description: string;
  cost: number;
}

export interface UpgradeStage {
  cost: number;
  description: string;
}

export interface StatBlock {
  label: string;
  value: number; // 1-10 scale for visual bar
  text: string; // Actual value text
  color: string; // Bar color
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  description: string;
  color: string;
  unlockCost: number;
  stats: StatBlock[];
  upgrades: {
    lv2: UpgradeStage; // Stat boost
    lv3: UpgradeStage; // Evolution
  };
}

export interface SpellCardDef {
  id: SpellCardId;
  name: string;
  description: string;
  cooldown: number; // seconds
  color: string;
  unlockCost: number;
  stats: StatBlock[];
  upgrades: {
    lv2: UpgradeStage;
    lv3: UpgradeStage;
  };
}

export interface Entity {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  color: string;
  dead: boolean;
}

export interface Player extends Entity {
  hp: number;
  maxHp: number;
  invulnerableTime: number;
  framesSinceLastHit: number; // For regen
  grazing: number;
  focused: boolean;
  equippedWeapons: WeaponId[];
  equippedSpells: SpellCardId[];
  spellCooldowns: number[];
  weaponLevels: Record<WeaponId, number>; // 1, 2, or 3
  spellLevels: Record<SpellCardId, number>; // 1, 2, or 3
  shield?: number; // For Aegis Shield spell
  revives: number;
  activeBuffs: Record<string, number>; // buffId -> frames remaining
}

export interface Enemy extends Entity {
  hp: number;
  maxHp: number;
  type: 'drone' | 'tank' | 'interceptor' | 'seeker' | 'stealth' | 'boss' | 'seraph_drone' | 'oracle_minion';
  variant?: 'alpha' | 'beta' | 'gamma' | 'delta' | 'theta';
  scoreValue: number;
  patternTimer: number;
  shotTimer: number;
  state?: 'entering' | 'fighting';
  frozenTimer?: number;
  
  // For orbiting drones
  parentId?: string;
  orbitAngle?: number;
  orbitRadius?: number;
  orbitSpeed?: number;

  // For Oracle Boss
  shieldHp?: number;
  shieldMax?: number;
  shieldActive?: boolean;
  shieldTimer?: number; // Tracks duration or cooldown
}

export interface Bullet extends Entity {
  owner: 'player' | 'enemy';
  damage: number;
  angle?: number;
  weaponId?: WeaponId;
  timer: number;
  
  // Weapon specific properties
  piercing?: boolean;
  hitList?: string[]; // IDs of entities already hit (for piercing)
  
  homingTargetId?: string;
  
  initialX?: number; // For wave motion
  
  orbitAngle?: number; // For orbs
  orbitRadius?: number; 
  
  splashRadius?: number; // For rockets
  
  chainCount?: number; // For lightning
  
  isVortex?: boolean;
  minSpeedReached?: boolean; // For Vortex Driver
  minSpeedTimer?: number;    // For Vortex Driver
  
  orbCooldown?: number; // For Aegis Orbs deletion cooldown
  
  isFirework?: boolean; // For Oracle bullets
}

export interface Particle extends Entity {
  life: number;
  maxLife: number;
  alpha: number;
}

export interface GameState {
  score: number;
  stage: number;
  difficulty: Difficulty;
  dataFragments: number; // Currency
  isPaused: boolean;
  gameOver: boolean;
  victory: boolean;
  unlockedWeapons: WeaponId[];
  unlockedSpells: SpellCardId[];
  bossDialogue: string | null;
}