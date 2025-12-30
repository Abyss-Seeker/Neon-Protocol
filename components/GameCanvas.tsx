import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Player, Bullet, Enemy, Particle, WeaponId, SpellCardId, Difficulty, BoosterId } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, SPELL_CARDS } from '../constants';
import { audioService } from '../services/audioService';
import SettingsMenu from './SettingsMenu';

interface GameCanvasProps {
  difficulty: Difficulty;
  loadout: { weapons: WeaponId[], spells: SpellCardId[] };
  weaponLevels: Record<WeaponId, number>;
  spellLevels: Record<SpellCardId, number>;
  activeBoosters: Set<BoosterId>;
  onGameOver: (score: number, win: boolean, fragments: number) => void;
  onExit: () => void;
  pityStacks: number;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ 
    difficulty, loadout, weaponLevels, spellLevels, activeBoosters, onGameOver, onExit, pityStacks 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hudState, setHudState] = useState<{ hp: number; score: number; stage: number; bossName: string | null; dialogue: string | null; spellsReady: boolean[]; shield: number; revives: number }>({
    hp: 100, score: 0, stage: 1, bossName: null, dialogue: null, spellsReady: [], shield: 0, revives: 0
  });
  const [scale, setScale] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const availableWidth = window.innerWidth;
      const availableHeight = window.innerHeight;
      const scaleX = availableWidth / CANVAS_WIDTH;
      const scaleY = availableHeight / CANVAS_HEIGHT;
      const newScale = Math.min(scaleX, scaleY, 1.2); 
      setScale(newScale);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Calculate Boosts
  const hpMultiplier = 1 + (0.05 * pityStacks);
  const damageMultiplier = 1 + (0.02 * pityStacks);
  const cdrMultiplier = 1 + (0.02 * pityStacks); 
  const incomingDamageMultiplier = activeBoosters.has(BoosterId.DMG_RED) ? 0.66 : 1.0;

  // Game State Refs
  const gameState = useRef({
    player: {
      id: 'player',
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT - 100,
      width: 8,
      height: 8,
      vx: 0,
      vy: 0,
      color: '#00f0ff',
      dead: false,
      hp: 100 * hpMultiplier,
      maxHp: 100 * hpMultiplier,
      invulnerableTime: 0,
      framesSinceLastHit: 0,
      grazing: 0,
      focused: false,
      equippedWeapons: loadout.weapons,
      equippedSpells: loadout.spells,
      spellCooldowns: loadout.spells.map(() => 0),
      weaponLevels: weaponLevels,
      spellLevels: spellLevels,
      shield: 0,
      revives: activeBoosters.has(BoosterId.EXTRA_LIFE) ? 1 : 0,
      activeBuffs: {} as Record<string, number>
    } as Player,
    bullets: [] as Bullet[],
    enemies: [] as Enemy[],
    particles: [] as Particle[],
    keys: {} as Record<string, boolean>,
    frame: 0,
    score: 0,
    stage: 1,
    stageTimer: 0,
    bossActive: false,
    boss: null as Enemy | null,
    dataFragments: 0,
    difficulty: difficulty,
    timeScale: 1.0,
    dialogueTimer: 0,
    waveDelay: 0,
    isGameOver: false
  });

  const generateBoss = useCallback(async () => {
    const state = gameState.current;
    if (state.bossActive) return;

    state.bossActive = true;
    
    const variants: ('alpha' | 'beta' | 'gamma' | 'delta' | 'theta')[] = ['alpha', 'beta', 'gamma', 'delta', 'theta'];
    let variant = variants[Math.floor(Math.random() * variants.length)];
    
    if (state.difficulty === Difficulty.BOSS_RUSH || state.difficulty === Difficulty.BOSS_RUSH_EXTREME) {
        variant = variants[(state.stage - 1) % variants.length];
    }
    
    const variantName = variant === 'alpha' ? 'CONSTRUCT' : variant === 'beta' ? 'VIPER' : variant === 'gamma' ? 'TITAN' : variant === 'delta' ? 'SERAPH' : 'ORACLE';

    setHudState(prev => ({ ...prev, dialogue: "WARNING: MASSIVE SIGNAL DETECTED", bossName: `UNIT-0${state.stage}-${variantName} [${state.difficulty}]` }));
    state.dialogueTimer = 120; 

    let finalHp = 2500;

    if (state.difficulty === Difficulty.BOSS_RUSH) {
        const startHp = 5000;
        const endHp = 20000;
        const progress = Math.min(1, (state.stage - 1) / 14);
        finalHp = startHp + (endHp - startHp) * progress;
    } else if (state.difficulty === Difficulty.BOSS_RUSH_EXTREME) {
        const startHp = 10000;
        const endHp = 50000;
        const progress = Math.min(1, (state.stage - 1) / 14);
        finalHp = startHp + (endHp - startHp) * progress;
    } else {
        let bossHpBase = 2500;
        let multiplier = state.difficulty === Difficulty.EASY ? 0.6 : state.difficulty === Difficulty.HARD ? 1.5 : state.difficulty === Difficulty.EXTREME ? 2.0 : 1.0;
        
        if (state.difficulty === Difficulty.INFINITY) {
           multiplier = 2.0 * (1 + (state.stage * 0.5));
        }
        finalHp = bossHpBase * state.stage * multiplier;
    }

    if (variant === 'gamma') {
        finalHp *= 1.25;
    }

    const bossId = `boss_${Date.now()}`;

    state.boss = {
      id: bossId,
      x: CANVAS_WIDTH / 2,
      y: -100, 
      width: variant === 'gamma' ? 60 : 40,
      height: variant === 'gamma' ? 60 : 40,
      vx: 0,
      vy: 0,
      color: variant === 'alpha' ? '#ff0055' : variant === 'beta' ? '#ffff00' : variant === 'gamma' ? '#5500ff' : variant === 'theta' ? '#ffd700' : '#ffffff',
      dead: false,
      hp: finalHp,
      maxHp: finalHp,
      type: 'boss',
      variant: variant,
      scoreValue: 5000 * state.stage,
      patternTimer: 0,
      shotTimer: 0,
      state: 'entering'
    };
    
    if (variant === 'theta') {
       state.boss.shieldHp = 0; 
       state.boss.shieldMax = finalHp * 0.08;
       state.boss.shieldActive = false;
       state.boss.shieldTimer = 0;
    }

    state.enemies.push(state.boss);

    if (variant === 'delta') {
       const droneCount = 6;
       for (let i = 0; i < droneCount; i++) {
          state.enemies.push({
             id: `seraph_drone_${i}_${Date.now()}`,
             x: state.boss.x,
             y: state.boss.y,
             width: 15,
             height: 15,
             vx: 0, vy: 0,
             color: '#ccffff',
             dead: false,
             hp: finalHp * 0.25, 
             maxHp: finalHp * 0.25,
             type: 'seraph_drone',
             scoreValue: 500,
             patternTimer: 0,
             shotTimer: Math.random() * 60,
             parentId: bossId,
             orbitAngle: (Math.PI * 2 / droneCount) * i,
             orbitRadius: 100,
             orbitSpeed: 0.02
          });
       }
    }

  }, []);

  const spawnEnemy = (t: number) => {
    const state = gameState.current;
    
    if (state.difficulty === Difficulty.BOSS_RUSH || state.difficulty === Difficulty.BOSS_RUSH_EXTREME) {
       if (state.bossActive) return;
       if (state.waveDelay <= 0) {
          generateBoss();
       }
       return; 
    }

    if (state.bossActive) return;
    if (state.waveDelay > 0) return; 

    let spawnRate = state.difficulty === Difficulty.HARD ? 15 : state.difficulty === Difficulty.EASY ? 50 : 30;
    if (state.difficulty === Difficulty.EXTREME) spawnRate = 10;
    
    if (state.difficulty === Difficulty.INFINITY) {
       spawnRate = Math.max(5, 20 - state.stage * 2); 
    }
    
    if (t % spawnRate === 0) {
      const rand = Math.random();
      let type: 'drone' | 'tank' | 'interceptor' | 'seeker' | 'stealth' = 'drone';
      
      const tankChance = 0.85 - (state.stage * 0.05);
      
      if (rand > 0.9) type = 'stealth';
      else if (rand > 0.8) type = 'seeker';
      else if (rand > tankChance) type = 'tank';
      else if (rand > 0.45) type = 'interceptor';

      const x = Math.random() * (CANVAS_WIDTH - 40) + 20;
      
      const stats = {
        drone: { hp: 30, w: 12, score: 100, color: '#aa00ff' },
        interceptor: { hp: 60, w: 15, score: 300, color: '#00ffaa' },
        tank: { hp: 150, w: 22, score: 600, color: '#ffaa00' },
        seeker: { hp: 20, w: 10, score: 200, color: '#ff0000' },
        stealth: { hp: 80, w: 18, score: 500, color: '#444444' }
      };

      let hpMult = 1 + (state.stage * 0.2);
      if (state.difficulty === Difficulty.INFINITY) hpMult = 1 + (state.stage * 0.5);

      state.enemies.push({
        id: `enemy_${Date.now()}_${Math.random()}`,
        x,
        y: -30,
        width: stats[type].w,
        height: stats[type].w,
        vx: 0, 
        vy: 0, 
        color: stats[type].color,
        dead: false,
        hp: stats[type].hp * hpMult,
        maxHp: stats[type].hp * hpMult,
        type,
        scoreValue: stats[type].score,
        patternTimer: 0,
        shotTimer: Math.random() * 60
      });
    }

    if (state.stageTimer > 1800 && !state.bossActive) {
       generateBoss();
    }
  };

  const createExplosion = (x: number, y: number, radius: number, damage: number) => {
    const state = gameState.current;
    let finalDamage = activeBoosters.has(BoosterId.ATTACK_UP) ? damage * 1.25 : damage;
    finalDamage *= damageMultiplier; 

    for(let i=0; i<8; i++) {
       state.particles.push({
          id: `p_exp_${Math.random()}`, x, y, width: radius/2, height: radius/2,
          vx: (Math.random()-0.5)*10, vy: (Math.random()-0.5)*10,
          color: '#ff5500', life: 15, maxLife: 15, alpha: 1, dead: false
       });
    }
    state.enemies.forEach(e => {
       const dist = Math.sqrt(Math.pow(e.x - x, 2) + Math.pow(e.y - y, 2));
       if (dist < radius + e.width) {
          e.hp -= finalDamage;
       }
    });
  };

  const activateSpell = (index: number) => {
    const state = gameState.current;
    if (!state.player.equippedSpells[index]) return;
    
    if (state.player.spellCooldowns[index] <= 0) {
      const spellId = state.player.equippedSpells[index];
      const lvl = state.player.spellLevels[spellId];
      let cooldown = SPELL_CARDS[spellId].cooldown * 60;
      
      if (activeBoosters.has(BoosterId.CDR_UP)) cooldown *= 0.8;
      
      cooldown = cooldown / cdrMultiplier;

      if (spellId === SpellCardId.EMP_BLAST && lvl >= 2) cooldown -= 300; 
      if (spellId === SpellCardId.PHANTOM_DASH && lvl >= 3) cooldown -= 600;

      state.player.spellCooldowns[index] = Math.max(60, cooldown);
      audioService.playSpell();
      
      switch(spellId) {
        case SpellCardId.EMP_BLAST:
           state.bullets = state.bullets.filter(b => b.owner === 'player');
           if (lvl >= 3) {
              state.enemies.forEach(e => {
                  e.hp -= 200 * damageMultiplier;
                  createExplosion(e.x, e.y, 50, 0);
              });
           }
           break;
        case SpellCardId.TIME_DILATOR: {
          let duration = 300; 
          if (lvl >= 2) duration += 120;
          if (lvl >= 3) duration += 180;
          state.player.activeBuffs[SpellCardId.TIME_DILATOR] = duration;
          break;
        }
        case SpellCardId.OVERCLOCK: {
          let duration = 300; 
          if (lvl >= 2) duration += 120; 
          state.player.activeBuffs[SpellCardId.OVERCLOCK] = duration;
          break;
        }
        case SpellCardId.PHANTOM_DASH:
          let invuln = 240; 
          if (lvl >= 2) invuln += 60;
          state.player.invulnerableTime = invuln; 
          break;
        case SpellCardId.ORBITAL_STRIKE:
           let strikeDmg = 2000;
           let strikeRad = 100;
           if (lvl >= 2) strikeRad = 150;
           if (lvl >= 3) strikeDmg = 4000;
           state.enemies.forEach(e => {
              e.hp -= strikeDmg * damageMultiplier;
              createExplosion(e.x, e.y, strikeRad, 0);
           });
           break;
        case SpellCardId.NANO_REPAIR:
           const healPercent = lvl >= 2 ? 0.5 : 0.3;
           state.player.hp = Math.min(state.player.maxHp, state.player.hp + (state.player.maxHp * healPercent));
           if (lvl >= 3) {
             state.player.hp = Math.min(state.player.maxHp, state.player.hp + 20);
           }
           break;
        case SpellCardId.AEGIS_SHIELD:
           const shieldAmt = lvl >= 2 ? 80 : 50;
           state.player.shield = (state.player.shield || 0) + shieldAmt;
           break;
        case SpellCardId.STASIS_FIELD:
           const freezeDur = lvl >= 2 ? 300 : 180;
           state.enemies.forEach(e => {
             e.frozenTimer = freezeDur;
           });
           break;
      }
    }
  };

  const update = () => {
    if (isPaused) return;
    const state = gameState.current;
    if (state.isGameOver) return;

    state.frame++;
    state.stageTimer++;

    Object.keys(state.player.activeBuffs).forEach(key => {
        if (state.player.activeBuffs[key] > 0) state.player.activeBuffs[key]--;
        else delete state.player.activeBuffs[key];
    });

    if (state.player.activeBuffs[SpellCardId.TIME_DILATOR]) {
        state.timeScale = 0.2;
    } else {
        state.timeScale = 1.0;
    }

    if (state.dialogueTimer > 0) {
      state.dialogueTimer--;
      if (state.dialogueTimer <= 0) setHudState(prev => ({ ...prev, dialogue: null }));
    }

    if (state.waveDelay > 0) state.waveDelay--;

    const isShift = state.keys['ShiftLeft'] || state.keys['ShiftRight'];
    const isOverclocked = (state.player.activeBuffs[SpellCardId.OVERCLOCK] || 0) > 0;
    const speed = (isShift ? 2.5 : 5) * (isOverclocked ? 2 : 1); 
    
    state.player.focused = !!isShift;
    
    if (state.keys['KeyX']) activateSpell(0);
    if (state.keys['KeyC']) activateSpell(1);
    if (state.keys['KeyV']) activateSpell(2);

    state.player.spellCooldowns = state.player.spellCooldowns.map(cd => Math.max(0, cd - 1));

    state.player.framesSinceLastHit++;
    const regenThreshold = activeBoosters.has(BoosterId.REGEN_UP) ? 300 : 600; 
    if (state.player.framesSinceLastHit > regenThreshold) { 
       if (state.frame % 60 === 0 && state.player.hp < state.player.maxHp) {
          state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1);
       }
    }

    if (state.keys['ArrowUp'] || state.keys['KeyW']) state.player.y = Math.max(state.player.height, state.player.y - speed);
    if (state.keys['ArrowDown'] || state.keys['KeyS']) state.player.y = Math.min(CANVAS_HEIGHT - state.player.height, state.player.y + speed);
    if (state.keys['ArrowLeft'] || state.keys['KeyA']) state.player.x = Math.max(state.player.width, state.player.x - speed);
    if (state.keys['ArrowRight'] || state.keys['KeyD']) state.player.x = Math.min(CANVAS_WIDTH - state.player.width, state.player.x + speed);

    if (state.keys['KeyZ'] || state.keys['Space']) {
      const ocLevel = state.player.spellLevels[SpellCardId.OVERCLOCK];
      
      let baseFireRate = 6;
      if (isOverclocked) baseFireRate = ocLevel >= 3 ? 2 : 3;

      if (state.frame % baseFireRate === 0) {
        let dmgMult = activeBoosters.has(BoosterId.ATTACK_UP) ? 1.25 : 1.0;
        dmgMult *= damageMultiplier; 

        state.player.equippedWeapons.forEach(wId => {
          const p = state.player;
          const lvl = state.player.weaponLevels[wId];
          
          switch(wId) {
            case WeaponId.PLASMA_CUTTER: {
               const dmg = (lvl >= 2 ? 13 : 10) * dmgMult;
               state.bullets.push({ id: `b_${Math.random()}`, x: p.x, y: p.y - 10, width: 4, height: 12, vx: 0, vy: -15, color: '#00f0ff', dead: false, owner: 'player', damage: dmg, timer: 0, weaponId: wId });
               if (lvl >= 3) {
                  state.bullets.push({ id: `b_${Math.random()}`, x: p.x-8, y: p.y - 5, width: 3, height: 10, vx: -1, vy: -15, color: '#00f0ff', dead: false, owner: 'player', damage: dmg, timer: 0, weaponId: wId });
                  state.bullets.push({ id: `b_${Math.random()}`, x: p.x+8, y: p.y - 5, width: 3, height: 10, vx: 1, vy: -15, color: '#00f0ff', dead: false, owner: 'player', damage: dmg, timer: 0, weaponId: wId });
               }
               break;
            }
            case WeaponId.SPREAD_SHOTGUN: {
               const spreadCount = lvl >= 3 ? 3 : 2;
               const damage = (lvl >= 2 ? 8 : 6) * dmgMult;
               const piercing = lvl >= 3;
               for(let i = -spreadCount; i <= spreadCount; i++) {
                  state.bullets.push({ id: `b_${Math.random()}`, x: p.x, y: p.y, width: 3, height: 3, vx: i * 2, vy: -12, color: '#ff5500', dead: false, owner: 'player', damage: damage, timer: 0, weaponId: wId, piercing: piercing });
               }
               break;
            }
            case WeaponId.HOMING_NEEDLES: {
               const speedMult = lvl >= 2 ? 1.5 : 1;
               const count = lvl >= 3 ? 4 : 2;
               const damage = 4 * dmgMult;
               for(let i=0; i<count; i++) {
                  state.bullets.push({ id: `b_${Math.random()}`, x: p.x + (i*10 - (count*5)), y: p.y, width: 3, height: 6, vx: (Math.random()-0.5)*4, vy: -10 * speedMult, color: '#ff00aa', dead: false, owner: 'player', damage: damage, timer: 0, weaponId: wId });
               }
               break;
            }
            case WeaponId.LASER_STREAM: {
               const w = lvl >= 2 ? 10 : 6; 
               const d = (lvl >= 3 ? 45 : 30) * dmgMult;
               state.bullets.push({ id: `b_${Math.random()}`, x: p.x, y: p.y - 10, width: w, height: 40, vx: 0, vy: -25, color: '#aa00ff', dead: false, owner: 'player', damage: d, timer: 0, weaponId: wId, piercing: true, hitList: [] });
               break;
            }
            case WeaponId.WAVE_MOTION: {
               const dmg = 18 * dmgMult;
               state.bullets.push({ id: `b_${Math.random()}`, x: p.x, y: p.y, width: 8, height: 8, vx: 0, vy: -8, color: '#00ffaa', dead: false, owner: 'player', damage: dmg, timer: 0, weaponId: wId, initialX: p.x });
               if (lvl >= 3) {
                  state.bullets.push({ id: `b_${Math.random()}`, x: p.x, y: p.y, width: 8, height: 8, vx: 0, vy: -8, color: '#00ffaa', dead: false, owner: 'player', damage: dmg, timer: 0, weaponId: wId, initialX: p.x, splashRadius: 1 }); 
               }
               break;
            }
            case WeaponId.ROCKET_BARRAGE: {
               const radius = lvl >= 2 ? 90 : 60;
               const isCluster = lvl >= 3;
               const damage = 10 * dmgMult;
               state.bullets.push({ id: `b_${Math.random()}`, x: p.x, y: p.y, width: 8, height: 12, vx: (Math.random()-0.5)*2, vy: -4, color: '#ff0000', dead: false, owner: 'player', damage: damage, timer: 0, weaponId: wId, splashRadius: radius, chainCount: isCluster ? -1 : 0 });
               break;
            }
            case WeaponId.CHAIN_LIGHTNING: {
               const jumps = lvl >= 3 ? 8 : 4;
               const rangeMult = lvl >= 2 ? 2.0 : 1.2;
               const dmg = (lvl >= 2 ? 58 : 40) * dmgMult;
               state.bullets.push({ id: `b_${Math.random()}`, x: p.x, y: p.y, width: 4, height: 10, vx: 0, vy: -18, color: '#00aaff', dead: false, owner: 'player', damage: dmg, timer: 0, weaponId: wId, chainCount: jumps, orbitRadius: rangeMult });
               break;
            }
            case WeaponId.BACK_TURRET: {
               const damage = (lvl >= 2 ? 35 : 25) * dmgMult;
               state.bullets.push({ id: `b_${Math.random()}`, x: p.x, y: p.y + 10, width: 6, height: 10, vx: 0, vy: 12, color: '#aaaaaa', dead: false, owner: 'player', damage: damage, timer: 0, weaponId: wId });
               if (lvl >= 3) {
                  state.bullets.push({ id: `b_${Math.random()}`, x: p.x, y: p.y - 10, width: 6, height: 10, vx: 0, vy: -12, color: '#aaaaaa', dead: false, owner: 'player', damage: damage, timer: 0, weaponId: wId });
               }
               break;
            }
            case WeaponId.VORTEX_DRIVER: {
               if (state.frame % 53 === 0) { 
                 const strength = lvl >= 2 ? 1.5 : 1; 
                 const targetY = 100 + Math.random() * 120;
                 const dist = p.y - targetY;
                 const initialVy = -(dist * 0.042); 

                 state.bullets.push({ id: `b_${Math.random()}`, x: p.x, y: p.y, width: 12, height: 12, vx: 0, vy: initialVy, color: '#ffffff', dead: false, owner: 'player', damage: 5 * dmgMult, timer: 0, weaponId: wId, isVortex: true, orbitRadius: strength, chainCount: lvl >= 3 ? 1 : 0 });
               }
               break;
            }
            case WeaponId.ORBITING_ORBS: {
               const existingOrbs = state.bullets.filter(b => b.owner === 'player' && b.weaponId === WeaponId.ORBITING_ORBS && !b.dead).length;
               const maxOrbs = lvl === 1 ? 2 : lvl === 2 ? 3 : 4;
               const rad = lvl >= 3 ? 80 : 60;
               const speed = lvl >= 2 ? 0.3 : 0.15;
               const dmg = (lvl >= 2 ? 20 : 15) * dmgMult;
               
               if (existingOrbs < maxOrbs && state.frame % 10 === 0) {
                  state.bullets.push({ id: `b_${Math.random()}`, x: p.x, y: p.y, width: 10, height: 10, vx: 0, vy: 0, color: '#ffff00', dead: false, owner: 'player', damage: dmg, timer: 0, weaponId: wId, orbitAngle: (existingOrbs * (360/maxOrbs)) * (Math.PI/180), orbitRadius: rad, splashRadius: speed }); 
               }
               break;
            }
            case WeaponId.GAUSS_CANNON: {
               if (state.frame % 40 === 0) { 
                 const isRail = lvl >= 3;
                 const piercingCount = lvl >= 2 ? 3 : 1;
                 const dmg = 600 * dmgMult;
                 state.bullets.push({ id: `b_${Math.random()}`, x: p.x, y: p.y - 10, width: 5, height: 30, vx: 0, vy: -40, color: '#00ff00', dead: false, owner: 'player', damage: dmg, timer: 0, weaponId: wId, piercing: true, chainCount: isRail ? 99 : piercingCount }); 
               }
               break;
            }
            case WeaponId.PULSE_NOVA: {
               if (state.frame % 50 === 0) {
                 const size = lvl >= 3 ? 40 : 20;
                 const pulseRate = lvl >= 2 ? 10 : 20;
                 const damage = 68 * dmgMult;
                 state.bullets.push({ id: `b_${Math.random()}`, x: p.x, y: p.y, width: size, height: size, vx: 0, vy: -2, color: '#ff00ff', dead: false, owner: 'player', damage: damage, timer: 0, weaponId: wId, piercing: true, splashRadius: pulseRate }); 
               }
               break;
            }
            case WeaponId.PHASE_BLADES: {
               if (state.frame % 30 === 0) {
                  const count = lvl >= 2 ? 3 : 2;
                  const damage = 18 * dmgMult;
                  for(let i=0; i<count; i++) {
                     const b = { id: `b_${Math.random()}`, x: p.x + (Math.random()-0.5)*40, y: p.y, width: 8, height: 8, vx: (Math.random()-0.5)*5, vy: -10, color: '#ff8800', dead: false, owner: 'player', damage: damage, timer: 0, weaponId: wId };
                     state.bullets.push(b as Bullet);
                  }
               }
               break;
            }
          }
        });
        audioService.playShoot();
      }
    }

    spawnEnemy(state.frame);

    // Enemies
    state.enemies.forEach(e => {
      if (e.frozenTimer && e.frozenTimer > 0) {
          e.frozenTimer--;
          return; 
      }

      e.patternTimer++;
      e.shotTimer++;

      if (e.type === 'boss') {
         if (e.state === 'entering') {
             const targetY = 100;
             e.y += (targetY - e.y) * 0.02;
             if (Math.abs(e.y - targetY) < 1) {
                 e.state = 'fighting';
             }
             return; 
         }

         if (state.stage > 1) {
             const summonInterval = Math.max(180, 720 - ((state.stage - 2) * 120));
             if (state.frame % summonInterval === 0) {
                 const mobTypes: ('drone' | 'seeker' | 'tank')[] = ['drone', 'seeker', 'tank'];
                 const type = mobTypes[Math.floor(Math.random() * mobTypes.length)];
                 const stats = {
                    drone: { hp: 30, w: 12, score: 100, color: '#aa00ff' },
                    seeker: { hp: 20, w: 10, score: 200, color: '#ff0000' },
                    tank: { hp: 150, w: 22, score: 600, color: '#ffaa00' },
                 };
                 
                 for(let k=0; k<2; k++) {
                     state.enemies.push({
                        id: `summon_${Date.now()}_${k}`,
                        x: e.x + (Math.random() - 0.5) * 100,
                        y: e.y + 20,
                        width: stats[type].w, height: stats[type].w,
                        vx: 0, vy: 0, color: stats[type].color,
                        dead: false,
                        hp: stats[type].hp, maxHp: stats[type].hp,
                        type: type as any,
                        scoreValue: 0, 
                        patternTimer: 0, shotTimer: Math.random() * 60
                     });
                 }
             }
         }

         if (e.variant === 'beta') {
            e.x = CANVAS_WIDTH / 2 + Math.sin(state.frame * 0.04) * 200; 
            e.y = 100 + Math.cos(state.frame * 0.03) * 50;
         } else if (e.variant === 'gamma') {
            e.x = CANVAS_WIDTH / 2 + Math.sin(state.frame * 0.01) * 100;
            e.y = 80;
         } else if (e.variant === 'delta') {
            e.x = CANVAS_WIDTH / 2 + Math.sin(state.frame * 0.02) * 50;
            e.y = 120 + Math.sin(state.frame * 0.05) * 20;
         } else if (e.variant === 'theta') { 
            e.x = CANVAS_WIDTH / 2 + Math.sin(state.frame * 0.01) * 150;
            e.y = 100 + Math.sin(state.frame * 0.02) * 20;
         } else {
            const hoverY = 120 + Math.sin(state.frame * 0.03) * 30;
            e.x = CANVAS_WIDTH / 2 + Math.sin(state.frame * 0.015) * 180;
            e.y += (hoverY - e.y) * 0.05;
         }

         if (e.variant === 'theta') {
             if (e.shieldActive) {
                 e.shieldTimer = (e.shieldTimer || 0) + 1;
                 if (e.shieldTimer > 1200) { 
                     e.shieldActive = false;
                     e.shieldTimer = 0; 
                 }
                 if ((e.shieldHp || 0) <= 0) {
                     e.shieldActive = false;
                     e.shieldTimer = 0; 
                 }
             } else {
                 e.shieldTimer = (e.shieldTimer || 0) + 1;
                 if (e.shieldTimer > 480) {
                     e.shieldActive = true;
                     e.shieldHp = e.maxHp * 0.08;
                     e.shieldMax = e.maxHp * 0.08;
                     e.shieldTimer = 0; 
                 }
             }

             if (state.frame % 360 === 0) { 
                 if (e.hp > e.maxHp * 0.05) { 
                     
                     let currentOrbitCount = state.enemies.filter(en => en.type === 'oracle_minion' && en.variant === 'alpha').length;
                     let currentHorizCount = state.enemies.filter(en => en.type === 'oracle_minion' && en.variant === 'beta').length;

                     e.hp -= e.maxHp * 0.01; 
                     const minionHp = e.maxHp * 0.03; 
                     
                     for(let m=0; m<3; m++) {
                         let isOrbit = Math.random() > 0.3; 
                         
                         if (currentHorizCount >= 7) isOrbit = true;
                         if (currentOrbitCount >= 13) isOrbit = false;
                         
                         if (currentOrbitCount >= 13 && currentHorizCount >= 7) break;

                         const orbitAngle = isOrbit ? (Math.PI*2/3)*m : 0;
                         const orbitRadius = isOrbit ? 80 : 0;
                         const orbitSpeed = isOrbit ? 0.03 : 0;
                         const direction = Math.random() > 0.5 ? 1 : -1;
                         const vx = isOrbit ? 0 : (2 + Math.random()) * direction;
                         const vy = isOrbit ? 0 : 0.5; 
                         
                         const newMinion: Enemy = {
                            id: `oracle_minion_${Date.now()}_${m}`,
                            x: e.x, y: e.y,
                            width: 12, height: 12,
                            vx: vx, vy: vy,
                            color: '#ffd700',
                            dead: false,
                            hp: minionHp, maxHp: minionHp,
                            type: 'oracle_minion',
                            scoreValue: 500,
                            patternTimer: 0, shotTimer: Math.random() * 60,
                            parentId: e.id,
                            orbitAngle: orbitAngle,
                            orbitRadius: orbitRadius,
                            orbitSpeed: orbitSpeed,
                            variant: isOrbit ? 'alpha' : 'beta' 
                         };

                         state.enemies.push(newMinion);
                         
                         if (isOrbit) currentOrbitCount++;
                         else currentHorizCount++;
                     }
                 }
             }
         }

         let fireRate = state.difficulty === Difficulty.HARD || state.difficulty === Difficulty.BOSS_RUSH || state.difficulty === Difficulty.BOSS_RUSH_EXTREME ? 25 : state.difficulty === Difficulty.EASY ? 60 : state.difficulty === Difficulty.EXTREME ? 15 : 45;
         
         if (e.variant === 'gamma') {
            fireRate = Math.floor(fireRate * 0.75);
         }

         if (e.shotTimer > fireRate) {
            e.shotTimer = 0;
            
            const phase = Math.floor(state.frame / 600) % 3;

            if (e.variant === 'beta') {
                if (phase === 0) { 
                   const angle = Math.atan2(state.player.y - e.y, state.player.x - e.x);
                   for(let i=-1; i<=1; i++) {
                      state.bullets.push({ id: `eb_${Math.random()}`, x: e.x, y: e.y, width: 5, height: 5, vx: Math.cos(angle + i*0.3)*3, vy: Math.sin(angle + i*0.3)*3, color: '#ffff00', dead: false, owner: 'enemy', damage: 10, timer: 0 });
                   }
                } else if (phase === 1) { 
                   const t = (state.frame % 100) / 100;
                   const angle = Math.PI/2 + (t - 0.5);
                   state.bullets.push({ id: `eb_${Math.random()}`, x: e.x, y: e.y, width: 6, height: 6, vx: Math.cos(angle)*4, vy: Math.sin(angle)*4, color: '#ffff00', dead: false, owner: 'enemy', damage: 10, timer: 0 });
                   state.bullets.push({ id: `eb_${Math.random()}`, x: e.x, y: e.y, width: 6, height: 6, vx: Math.cos(angle + Math.PI)*4, vy: Math.sin(angle + Math.PI)*4, color: '#ffff00', dead: false, owner: 'enemy', damage: 10, timer: 0 });
                } else { 
                   const b: Bullet = { id: `eb_${Math.random()}`, x: e.x, y: e.y, width: 8, height: 8, vx: (Math.random()-0.5)*5, vy: (Math.random()-0.5)*5, color: '#ffff00', dead: false, owner: 'enemy', damage: 15, timer: 0 };
                   state.bullets.push(b);
                }
            } else if (e.variant === 'gamma') {
                if (phase === 0) { 
                   const arms = 8;
                   for(let i=0; i<arms; i++) {
                      const angle = (state.frame * 0.05) + (i * (Math.PI * 2 / arms));
                      state.bullets.push({ id: `eb_${Math.random()}`, x: e.x, y: e.y, width: 12, height: 12, vx: Math.cos(angle)*1.5, vy: Math.sin(angle)*1.5, color: '#5500ff', dead: false, owner: 'enemy', damage: 25, timer: 0 });
                   }
                } else if (phase === 1) { 
                   const offset = (state.frame % 200) < 100 ? 0 : 20;
                   state.bullets.push({ id: `eb_${Math.random()}`, x: offset + (state.frame%20)*30, y: 0, width: 8, height: 20, vx: 0, vy: 3, color: '#5500ff', dead: false, owner: 'enemy', damage: 20, timer: 0 });
                } else { 
                   const angle = Math.atan2(state.player.y - e.y, state.player.x - e.x);
                   state.bullets.push({ id: `eb_${Math.random()}`, x: e.x, y: e.y, width: 20, height: 20, vx: Math.cos(angle)*1, vy: Math.sin(angle)*1, color: '#5500ff', dead: false, owner: 'enemy', damage: 30, timer: 0 });
                }
            } else if (e.variant === 'delta') { 
               if (phase === 0) { 
                  if (state.frame % 3 === 0) {
                     state.bullets.push({ id: `eb_${Math.random()}`, x: e.x, y: e.y, width: 40, height: 10, vx: 0, vy: 5, color: '#ffffff', dead: false, owner: 'enemy', damage: 20, timer: 0 });
                  }
               } else if (phase === 1) { 
                  for(let k=0; k<2; k++) {
                    const angle = Math.PI/2 + (Math.random()-0.5);
                    state.bullets.push({ id: `eb_${Math.random()}`, x: e.x, y: e.y, width: 6, height: 12, vx: Math.cos(angle)*3, vy: Math.sin(angle)*3, color: '#ffffff', dead: false, owner: 'enemy', damage: 15, timer: 0 });
                  }
               } else { 
                  state.bullets.push({ id: `eb_${Math.random()}`, x: e.x-50, y: e.y, width: 8, height: 8, vx: -1, vy: 3, color: '#ffffff', dead: false, owner: 'enemy', damage: 15, timer: 0 });
                  state.bullets.push({ id: `eb_${Math.random()}`, x: e.x+50, y: e.y, width: 8, height: 8, vx: 1, vy: 3, color: '#ffffff', dead: false, owner: 'enemy', damage: 15, timer: 0 });
                  state.bullets.push({ id: `eb_${Math.random()}`, x: e.x-25, y: e.y+10, width: 8, height: 8, vx: -0.5, vy: 3, color: '#ffffff', dead: false, owner: 'enemy', damage: 15, timer: 0 });
                  state.bullets.push({ id: `eb_${Math.random()}`, x: e.x+25, y: e.y+10, width: 8, height: 8, vx: 0.5, vy: 3, color: '#ffffff', dead: false, owner: 'enemy', damage: 15, timer: 0 });
               }
            } else if (e.variant === 'theta') { 
               const angle = Math.random() * Math.PI * 2;
               state.bullets.push({ 
                   id: `fb_${Math.random()}`, x: e.x, y: e.y, width: 10, height: 10, 
                   vx: Math.cos(angle)*5, vy: Math.sin(angle)*5, 
                   color: '#ffd700', dead: false, owner: 'enemy', damage: 20, timer: 0, 
                   isFirework: true 
               });
            } else {
                if (phase === 0) { 
                   const arms = 6;
                   for(let i=0; i<arms; i++) {
                      const angle = (state.frame * 0.1) + (i * (Math.PI * 2 / arms));
                      state.bullets.push({ id: `eb_${Math.random()}`, x: e.x, y: e.y, width: 8, height: 8, vx: Math.cos(angle)*2.0, vy: Math.sin(angle)*2.0, color: '#ff0055', dead: false, owner: 'enemy', damage: 15, timer: 0 });
                   }
                } else if (phase === 1) { 
                   const angle = Math.atan2(state.player.y - e.y, state.player.x - e.x);
                   for(let i=-1; i<=1; i++) {
                     state.bullets.push({ id: `eb_${Math.random()}`, x: e.x, y: e.y, width: 6, height: 6, vx: Math.cos(angle + i*0.1)*3, vy: Math.sin(angle + i*0.1)*3, color: '#ff0055', dead: false, owner: 'enemy', damage: 15, timer: 0 });
                   }
                } else { 
                   state.bullets.push({ id: `eb_${Math.random()}`, x: e.x + (Math.random()-0.5)*100, y: e.y, width: 10, height: 10, vx: (Math.random()-0.5)*2.0, vy: (Math.random()+0.5)*1.5, color: '#ff0055', dead: false, owner: 'enemy', damage: 15, timer: 0 });
                }
            }
         }

      } else if (e.type === 'seraph_drone') {
          if (e.parentId) {
             const parent = state.enemies.find(p => p.id === e.parentId);
             if (parent && !parent.dead) {
                 e.orbitAngle = (e.orbitAngle || 0) + (e.orbitSpeed || 0.05);
                 e.x = parent.x + Math.cos(e.orbitAngle) * (e.orbitRadius || 100);
                 e.y = parent.y + Math.sin(e.orbitAngle) * (e.orbitRadius || 100);
                 
                 if (e.shotTimer > 120) {
                    e.shotTimer = 0;
                    const angle = Math.atan2(state.player.y - e.y, state.player.x - e.x);
                    state.bullets.push({ 
                       id: `db_${Math.random()}`, x: e.x, y: e.y, width: 4, height: 4, 
                       vx: Math.cos(angle)*2, vy: Math.sin(angle)*2, 
                       color: '#ccffff', dead: false, owner: 'enemy', damage: 8, timer: 0 
                    });
                 }
             } else {
                 e.dead = true; 
             }
          }
      } else if (e.type === 'oracle_minion') {
          const parent = state.enemies.find(p => p.id === e.parentId);

          if (e.variant === 'alpha') {
              if (parent && !parent.dead) {
                 e.orbitAngle = (e.orbitAngle || 0) + (e.orbitSpeed || 0.03);
                 e.x = parent.x + Math.cos(e.orbitAngle) * (e.orbitRadius || 80);
                 e.y = parent.y + Math.sin(e.orbitAngle) * (e.orbitRadius || 80);
              } else {
                 e.x += Math.cos(e.orbitAngle || 0) * 1;
                 e.y += Math.sin(e.orbitAngle || 0) * 1;
              }

              if (e.shotTimer > 120) {
                  e.shotTimer = 0;
                  const targetPlayer = Math.random() > 0.5;
                  let angle;
                  if (targetPlayer) {
                      angle = Math.atan2(state.player.y - e.y, state.player.x - e.x);
                  } else {
                      angle = Math.random() * Math.PI * 2;
                  }
                  state.bullets.push({
                      id: `omb_${Math.random()}`, x: e.x, y: e.y, width: 4, height: 4,
                      vx: Math.cos(angle) * 3, vy: Math.sin(angle) * 3,
                      color: '#ffaa00', dead: false, owner: 'enemy', damage: 8, timer: 0
                  });
              }
          } 
          else {
              e.x += e.vx;
              e.y += e.vy;
              if (e.x < 10 || e.x > CANVAS_WIDTH - 10) e.vx *= -1;

              if (e.shotTimer > 60) {
                  e.shotTimer = 0;
                  state.bullets.push({
                      id: `omb_bomb_${Math.random()}`, x: e.x, y: e.y, width: 6, height: 6,
                      vx: 0, vy: 4, 
                      color: '#ff5500', dead: false, owner: 'enemy', damage: 10, timer: 0
                  });
              }
          }
      } else {
         if (e.type === 'drone') {
            e.y += 2 * state.timeScale;
            e.x += Math.sin(e.patternTimer * 0.05) * 3 * state.timeScale;
            if (e.shotTimer > 120) {
               e.shotTimer = 0;
               const angle = Math.atan2(state.player.y - e.y, state.player.x - e.x);
               state.bullets.push({ id: `eb_${Math.random()}`, x: e.x, y: e.y, width: 5, height: 5, vx: Math.cos(angle)*2, vy: Math.sin(angle)*2, color: '#ff00aa', dead: false, owner: 'enemy', damage: 10, timer: 0 });
            }
         } else if (e.type === 'tank') {
            e.y += 0.8 * state.timeScale;
            if (e.shotTimer > 90) {
               e.shotTimer = 0;
               for(let i=-1; i<=1; i++) {
                  state.bullets.push({ id: `eb_${Math.random()}`, x: e.x, y: e.y, width: 8, height: 8, vx: i*1.5, vy: 3, color: '#ffaa00', dead: false, owner: 'enemy', damage: 15, timer: 0 });
               }
            }
         } else if (e.type === 'interceptor') {
            if (e.patternTimer < 60) {
               e.y += 3 * state.timeScale;
            } else {
               if (e.vx === 0) e.vx = (state.player.x > e.x ? 1 : -1) * 4;
               e.x += e.vx * state.timeScale;
               e.y += 4 * state.timeScale;
            }
         } else if (e.type === 'seeker') {
            const angle = Math.atan2(state.player.y - e.y, state.player.x - e.x);
            e.x += Math.cos(angle) * 3 * state.timeScale;
            e.y += Math.sin(angle) * 3 * state.timeScale;
         } else if (e.type === 'stealth') {
            e.y += 1.5 * state.timeScale;
            if (e.shotTimer > 150) {
               e.shotTimer = 0;
               state.bullets.push({ id: `eb_${Math.random()}`, x: e.x, y: e.y, width: 6, height: 6, vx: 0, vy: 5, color: '#444444', dead: false, owner: 'enemy', damage: 20, timer: 0 });
            }
         }
      }

      if (e.y > CANVAS_HEIGHT + 50 || e.x < -50 || e.x > CANVAS_WIDTH + 50) e.dead = true;
    });

    state.bullets.forEach(b => {
      b.timer++;
      
      if (b.owner === 'player') {
         if (b.weaponId === WeaponId.WAVE_MOTION && b.initialX !== undefined) {
             const isDoubleHelix = b.splashRadius === 1; 
             const offset = isDoubleHelix ? Math.PI : 0;
             b.x = b.initialX + Math.sin(b.timer * 0.2 + offset) * 40;
         } else if (b.weaponId === WeaponId.ORBITING_ORBS) {
            if (b.orbitAngle !== undefined && b.orbitRadius !== undefined) {
               const speed = b.splashRadius || 0.1; 
               b.orbitAngle += speed;
               b.x = state.player.x + Math.cos(b.orbitAngle) * b.orbitRadius;
               b.y = state.player.y + Math.sin(b.orbitAngle) * b.orbitRadius;
               
               if (b.orbCooldown && b.orbCooldown > 0) {
                   b.orbCooldown--;
                   b.color = '#ffffe0'; 
               } else {
                   b.color = '#ffff00';
               }
            }
         } else if (b.homingTargetId || (b.weaponId === WeaponId.PHASE_BLADES && b.timer > 10)) {
             let target = state.enemies.find(e => e.id === b.homingTargetId);
             
             if (!target && b.weaponId === WeaponId.PHASE_BLADES) {
                 target = state.enemies.reduce((nearest, e) => {
                    const d = Math.pow(e.x - b.x, 2) + Math.pow(e.y - b.y, 2);
                    return d < nearest.dist ? {e, dist: d} : nearest;
                 }, {e: null as Enemy | null, dist: Infinity}).e || undefined;
                 if (target) b.homingTargetId = target.id;
             }

             if (target && !target.dead) {
                if (b.weaponId === WeaponId.PHASE_BLADES && state.player.weaponLevels[WeaponId.PHASE_BLADES] >= 3 && b.timer % 30 === 0) {
                   b.x = target.x; b.y = target.y;
                } else {
                   const dx = target.x - b.x;
                   const dy = target.y - b.y;
                   const dist = Math.sqrt(dx*dx + dy*dy);
                   const homingStrength = b.weaponId === WeaponId.PHASE_BLADES ? 2 : 1;
                   b.vx += (dx/dist) * homingStrength;
                   b.vy += (dy/dist) * homingStrength;
                   const maxV = b.weaponId === WeaponId.PHASE_BLADES ? 15 : 10;
                   const v = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
                   if (v > maxV) { b.vx = (b.vx/v)*maxV; b.vy = (b.vy/v)*maxV; }
                }
             }
         } else if (b.weaponId === WeaponId.HOMING_NEEDLES && !b.homingTargetId) {
             const target = state.enemies.reduce((nearest, e) => {
                const d = Math.pow(e.x - b.x, 2) + Math.pow(e.y - b.y, 2);
                return d < nearest.dist ? {e, dist: d} : nearest;
             }, {e: null as Enemy | null, dist: Infinity}).e;
             if (target) b.homingTargetId = target.id;
         }

         if (b.isVortex) {
            b.vy *= 0.96;
            if (Math.abs(b.vy) < 0.2) {
                b.vy = 0;
                b.minSpeedReached = true;
            }
            
            if (b.minSpeedReached) {
                b.minSpeedTimer = (b.minSpeedTimer || 0) + 1;
                if (b.minSpeedTimer > 180) b.dead = true;
            }

            const pullStrength = b.orbitRadius || 1; 
            const hasDot = b.chainCount === 1; 
            const pullRadius = b.minSpeedReached ? 225 : 150; 
            
            state.enemies.forEach(e => {
               if (e.type === 'boss') return;
               const dx = b.x - e.x;
               const dy = b.y - e.y;
               const dist = Math.sqrt(dx*dx + dy*dy);
               if (dist < pullRadius) {
                  const normalizedDist = dist / pullRadius;
                  const intensity = Math.pow(Math.max(0, 1 - normalizedDist), 2);
                  const force = intensity * 10 * pullStrength; 
                  
                  e.x += (dx/dist) * force;
                  e.y += (dy/dist) * force;
                  
                  if (hasDot && state.frame % 10 === 0) e.hp -= 4;
               }
            });
         }
      } else {
         if (state.boss?.variant === 'beta' && b.vx === 0 && b.vy === 0 && b.timer > 60) {
            const angle = Math.atan2(state.player.y - b.y, state.player.x - b.x);
            b.vx = Math.cos(angle)*6;
            b.vy = Math.sin(angle)*6;
         }
      }

      if (b.weaponId !== WeaponId.ORBITING_ORBS) {
         b.x += b.vx * (b.owner === 'enemy' ? state.timeScale : 1);
         b.y += b.vy * (b.owner === 'enemy' ? state.timeScale : 1);
      }
      
      if (b.isFirework && !b.dead) {
         if (b.x < 0 || b.x > CANVAS_WIDTH || b.y > CANVAS_HEIGHT || b.y < -50) {
             b.dead = true;
             for (let k = 0; k < 6; k++) {
                 const angle = (Math.PI * 2 / 6) * k + (Math.random() * 0.5);
                 state.bullets.push({
                     id: `shatter_${Math.random()}`,
                     x: Math.max(0, Math.min(CANVAS_WIDTH, b.x)),
                     y: Math.max(0, Math.min(CANVAS_HEIGHT, b.y)),
                     width: 4, height: 4,
                     vx: Math.cos(angle) * 3, vy: Math.sin(angle) * 3,
                     color: '#ffff00', dead: false, owner: 'enemy', damage: 10, timer: 0
                 });
             }
         }
      } else {
          if (b.y < -50 || b.y > CANVAS_HEIGHT + 50 || b.x < -50 || b.x > CANVAS_WIDTH + 50) b.dead = true;
      }
    });

    state.bullets.filter(b => b.owner === 'player').forEach(b => {
      if (b.isVortex) return;

      state.enemies.forEach(e => {
        if (e.dead || b.dead) return;
        if (b.hitList && b.hitList.includes(e.id)) return; 

        if (e.type === 'boss' && e.variant === 'theta' && e.shieldActive && (e.shieldHp || 0) > 0) {
            const dist = Math.sqrt(Math.pow(b.x - e.x, 2) + Math.pow(b.y - e.y, 2));
            if (dist < 80) {
                if (e.shieldHp) e.shieldHp -= b.damage;
                state.particles.push({
                     id: `p_${Math.random()}`, x: b.x, y: b.y, width: 2, height: 2, vx: (Math.random()-0.5)*5, vy: (Math.random()-0.5)*5, color: '#00ffff', life: 5, maxLife: 5, alpha: 1, dead: false
                });
                b.dead = true; 
                return;
            }
        }

        const dist = Math.sqrt(Math.pow(b.x - e.x, 2) + Math.pow(b.y - e.y, 2));
        if (dist < e.width + b.width) {
          
          const frozenBonus = (e.frozenTimer && e.frozenTimer > 0 && state.player.spellLevels[SpellCardId.STASIS_FIELD] >= 3) ? 1.5 : 1.0;
          e.hp -= b.damage * frozenBonus;
          
          state.particles.push({
             id: `p_${Math.random()}`, x: b.x, y: b.y, width: 2, height: 2, vx: (Math.random()-0.5)*5, vy: (Math.random()-0.5)*5, color: '#fff', life: 5, maxLife: 5, alpha: 1, dead: false
          });

          if (b.weaponId === WeaponId.PULSE_NOVA) {
             const pulseRate = b.splashRadius || 20;
             if (b.timer % pulseRate === 0) {
                createExplosion(b.x, b.y, 60, b.damage / 2);
             }
          }

          if (b.splashRadius && b.weaponId !== WeaponId.ORBITING_ORBS && b.weaponId !== WeaponId.PULSE_NOVA && b.weaponId !== WeaponId.WAVE_MOTION) {
             createExplosion(b.x, b.y, b.splashRadius, b.damage);
             if (b.chainCount === -1) {
                for(let i=0; i<3; i++) {
                   createExplosion(b.x + (Math.random()-0.5)*40, b.y + (Math.random()-0.5)*40, 30, b.damage/2);
                }
             }
             b.dead = true;
          } else if (b.chainCount && b.chainCount > 0 && b.weaponId !== WeaponId.PULSE_NOVA) {
             b.chainCount--;
             b.hitList = [...(b.hitList || []), e.id];
             const rangeMult = b.orbitRadius || 1; 
             const nextTarget = state.enemies.find(ne => ne.id !== e.id && !ne.dead && Math.sqrt(Math.pow(ne.x - e.x, 2) + Math.pow(ne.y - e.y, 2)) < 200 * rangeMult);
             if (nextTarget) {
                const angle = Math.atan2(nextTarget.y - b.y, nextTarget.x - b.x);
                b.vx = Math.cos(angle) * 20;
                b.vy = Math.sin(angle) * 20;
                b.x = e.x; b.y = e.y; 
             } else {
                b.dead = true;
             }
          } else if (b.piercing) {
             if (!b.hitList) b.hitList = [];
             b.hitList.push(e.id);
             if (b.weaponId === WeaponId.GAUSS_CANNON) {
                if (b.chainCount !== undefined) {
                   b.chainCount--;
                   if (b.chainCount <= 0) b.dead = true;
                }
             }
          } else if (b.weaponId !== WeaponId.ORBITING_ORBS && b.weaponId !== WeaponId.PULSE_NOVA) {
             b.dead = true;
          }

          if (e.hp <= 0 && !e.dead) {
             e.dead = true;
             state.score += e.scoreValue;
             
             const diffMult = state.difficulty === Difficulty.EASY ? 3 : state.difficulty === Difficulty.NORMAL ? 2 : 1.5;
             const bossRushMult = (state.difficulty === Difficulty.BOSS_RUSH || state.difficulty === Difficulty.BOSS_RUSH_EXTREME) ? 2 : 1;
             const boosterMult = activeBoosters.has(BoosterId.LOOT_UP) ? 2 : 1;
             const baseFragments = Math.floor(Math.random() * 5) + 1;
             state.dataFragments += Math.ceil(baseFragments * diffMult * bossRushMult * boosterMult); 
             
             if (b.weaponId === WeaponId.PULSE_NOVA && state.player.weaponLevels[WeaponId.PULSE_NOVA] >= 3) {
                createExplosion(e.x, e.y, 100, 50);
             }

             audioService.playExplosion();
             if (e.type === 'boss') {
               state.bossActive = false;
               state.boss = null;
               state.waveDelay = 120;
               state.stage++;
               state.stageTimer = 0;
               state.score += 10000;
               
               const isBossRush = state.difficulty === Difficulty.BOSS_RUSH || state.difficulty === Difficulty.BOSS_RUSH_EXTREME;
               const maxStages = isBossRush ? 16 : 6; 
               
               if (state.stage >= maxStages && state.difficulty !== Difficulty.INFINITY) {
                  onGameOver(state.score, true, state.dataFragments);
               }
             }
          }
        }
      });
    });

    if (state.player.invulnerableTime > 0) {
       state.player.invulnerableTime--;
    } else {
       const checkHit = (entityX: number, entityY: number, size: number) => {
          const dist = Math.sqrt(Math.pow(entityX - state.player.x, 2) + Math.pow(entityY - state.player.y, 2));
          if (dist < size + 4) {
             if (state.player.shield && state.player.shield > 0) {
                state.player.shield -= 20 * incomingDamageMultiplier; 
                if (state.player.spellLevels[SpellCardId.AEGIS_SHIELD] >= 3) {
                   createExplosion(state.player.x, state.player.y, 150, 100);
                }
                state.player.invulnerableTime = 30;
             } else {
               state.player.hp -= 20 * incomingDamageMultiplier; 
               state.player.framesSinceLastHit = 0; 
               audioService.playExplosion(); 
               
               if (state.player.hp <= 0) {
                  if (state.player.revives > 0) {
                      state.player.revives--;
                      state.player.hp = state.player.maxHp;
                      state.player.invulnerableTime = 120; 
                      createExplosion(state.player.x, state.player.y, 200, 500);
                  } else {
                      state.isGameOver = true;
                      onGameOver(state.score, false, state.dataFragments);
                  }
               } else {
                  state.player.invulnerableTime = 60; 
               }
             }
             return true;
          } else if (dist < 20) {
             state.player.grazing++;
             state.score += 10;
          }
          return false;
       }

       state.bullets.filter(b => b.owner === 'enemy').forEach(b => {
          if (state.player.equippedWeapons.includes(WeaponId.ORBITING_ORBS)) {
             const orbs = state.bullets.filter(pb => pb.owner === 'player' && pb.weaponId === WeaponId.ORBITING_ORBS);
             for (const orb of orbs) {
                if (orb.orbCooldown && orb.orbCooldown > 0) continue; 

                const d = Math.sqrt(Math.pow(orb.x - b.x, 2) + Math.pow(orb.y - b.y, 2));
                if (d < orb.width + b.width) {
                   if (state.player.weaponLevels[WeaponId.ORBITING_ORBS] >= 3) {
                        b.dead = true;
                        orb.orbCooldown = 240; 
                        return;
                   }
                }
             }
          }

          if (checkHit(b.x, b.y, b.width)) b.dead = true;
       });

       state.enemies.forEach(e => {
         checkHit(e.x, e.y, e.width + 5);
       });
    }

    state.bullets = state.bullets.filter(b => !b.dead);
    state.enemies = state.enemies.filter(e => !e.dead);
    state.particles.forEach(p => {
       p.x += p.vx;
       p.y += p.vy;
       p.life--;
       p.alpha = p.life / p.maxLife;
       if (p.life <= 0) p.dead = true;
    });
    state.particles = state.particles.filter(p => !p.dead);

    setHudState(prev => ({
       ...prev,
       hp: state.player.hp,
       score: state.score,
       stage: state.stage,
       spellsReady: state.player.spellCooldowns.map(cd => cd <= 0),
       shield: state.player.shield || 0,
       revives: state.player.revives
    }));
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const state = gameState.current;
    
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    const gridOffset = (state.frame * 2) % 40;
    for (let i = 0; i < CANVAS_WIDTH; i+=40) {
       ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, CANVAS_HEIGHT); ctx.stroke();
    }
    for (let i = 0; i < CANVAS_HEIGHT; i+=40) {
       ctx.beginPath(); ctx.moveTo(0, i + gridOffset); ctx.lineTo(CANVAS_WIDTH, i + gridOffset); ctx.stroke();
    }

    state.bullets.filter(b => b.isVortex).forEach(b => {
        ctx.save();
        const pullRadius = b.minSpeedReached ? 225 : 150;
        
        const gradient = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, pullRadius);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(b.x, b.y, pullRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 5;
        ctx.shadowColor = '#ffffff';
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.width, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    state.particles.forEach(p => {
       ctx.globalAlpha = p.alpha;
       ctx.fillStyle = p.color;
       ctx.fillRect(p.x, p.y, p.width, p.height);
    });
    ctx.globalAlpha = 1;

    state.enemies.forEach(e => {
       ctx.save();
       ctx.translate(e.x, e.y);
       ctx.shadowBlur = 10;
       ctx.shadowColor = e.color;
       ctx.fillStyle = e.color;
       
       if (e.frozenTimer && e.frozenTimer > 0) {
           ctx.shadowColor = '#00ffff';
           ctx.strokeStyle = '#00ffff';
           ctx.lineWidth = 2;
           ctx.strokeRect(-e.width/2 - 2, -e.height/2 - 2, e.width + 4, e.height + 4);
       }

       if (e.type === 'stealth') {
          ctx.globalAlpha = 0.5 + Math.sin(state.frame * 0.1) * 0.4; 
       }
       if (e.state === 'entering') {
           ctx.globalAlpha = 0.5 + Math.sin(state.frame * 0.5) * 0.5; 
       }

       if (e.type === 'boss') {
          if (e.variant === 'theta' && e.shieldActive) {
              ctx.save();
              ctx.strokeStyle = '#00ffff';
              ctx.lineWidth = 2;
              ctx.shadowBlur = 10;
              ctx.shadowColor = '#00ffff';
              ctx.globalAlpha = 0.5 + Math.sin(state.frame * 0.1) * 0.2;
              ctx.beginPath();
              ctx.arc(0, 0, 80, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();
          }

          if (e.variant === 'beta') {
             ctx.beginPath();
             ctx.moveTo(0, 30);
             ctx.lineTo(-20, -20);
             ctx.lineTo(20, -20);
             ctx.fill();
          } else if (e.variant === 'gamma') {
             ctx.fillRect(-e.width/2, -e.height/2, e.width, e.height);
          } else if (e.variant === 'delta') {
             ctx.fillRect(-5, -30, 10, 60);
             ctx.fillRect(-30, -5, 60, 10);
          } else if (e.variant === 'theta') { 
             ctx.beginPath();
             ctx.arc(0, 0, 30, 0, Math.PI*2);
             ctx.fill();
             ctx.strokeStyle = '#fff';
             ctx.beginPath();
             ctx.arc(0, 0, 40, state.frame*0.1, state.frame*0.1 + Math.PI);
             ctx.stroke();
          } else {
             ctx.beginPath();
             for (let i = 0; i < 6; i++) ctx.lineTo(e.width * Math.cos(i * Math.PI / 3), e.width * Math.sin(i * Math.PI / 3));
             ctx.closePath();
             ctx.fill();
          }
          ctx.globalAlpha = 1; 
          ctx.fillStyle = 'red';
          ctx.fillRect(-30, -50, 60 * (e.hp / e.maxHp), 5);
          if (e.shieldActive && e.shieldMax) {
              ctx.fillStyle = '#00ffff';
              ctx.fillRect(-30, -58, 60 * ((e.shieldHp||0) / e.shieldMax), 3);
          }

       } else if (e.type === 'seraph_drone') {
          ctx.beginPath();
          ctx.moveTo(10, 0);
          ctx.lineTo(-5, 5);
          ctx.lineTo(-5, -5);
          ctx.fill();
       } else if (e.type === 'oracle_minion') {
          ctx.beginPath();
          ctx.arc(0, 0, 6, 0, Math.PI*2);
          ctx.fill();
       } else {
          if (e.type === 'seeker') {
             ctx.beginPath();
             ctx.arc(0, 0, e.width, 0, Math.PI * 2);
             ctx.fill();
          } else {
             ctx.beginPath();
             ctx.moveTo(0, e.height);
             ctx.lineTo(-e.width/2, -e.height);
             ctx.lineTo(e.width/2, -e.height);
             ctx.fill();
          }
       }
       ctx.restore();
    });

    state.bullets.filter(b => !b.isVortex).forEach(b => {
       ctx.save();
       ctx.shadowBlur = 5;
       ctx.shadowColor = b.color;
       ctx.fillStyle = b.color;
       
       if (b.weaponId === WeaponId.LASER_STREAM || b.weaponId === WeaponId.GAUSS_CANNON) {
         ctx.fillRect(b.x - b.width/2, b.y, b.width, b.height);
       } else if (b.weaponId === WeaponId.PHASE_BLADES) {
         ctx.translate(b.x, b.y);
         ctx.rotate(state.frame * 0.5);
         ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(4, 4); ctx.lineTo(-4, 4); ctx.fill();
       } else {
         ctx.beginPath();
         ctx.arc(b.x, b.y, b.width, 0, Math.PI * 2);
         ctx.fill();
       }
       ctx.restore();
    });

    const p = state.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.invulnerableTime > 0 && Math.floor(state.frame / 4) % 2 === 0) ctx.globalAlpha = 0.5;
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f0ff';
    ctx.fillStyle = '#00f0ff';
    
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(-10, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(10, 10);
    ctx.fill();

    if (p.shield && p.shield > 0) {
       ctx.strokeStyle = '#0088ff';
       ctx.lineWidth = 2;
       ctx.beginPath();
       ctx.arc(0, 0, 20, 0, Math.PI * 2);
       ctx.stroke();
    }

    if (p.focused) {
       ctx.fillStyle = '#fff';
       ctx.beginPath();
       ctx.arc(0, 0, 4, 0, Math.PI * 2);
       ctx.fill();
    }
    if (p.framesSinceLastHit > 600) {
       ctx.strokeStyle = '#00ff00';
       ctx.lineWidth = 1;
       ctx.beginPath();
       ctx.arc(0, 0, 15 + Math.sin(state.frame * 0.1) * 2, 0, Math.PI * 2);
       ctx.stroke();
    }
    ctx.restore();

    if (isPaused) {
       ctx.fillStyle = 'rgba(0,0,0,0.7)';
       ctx.fillRect(0,0,CANVAS_WIDTH, CANVAS_HEIGHT);
       ctx.fillStyle = '#fff';
       ctx.font = '40px Rajdhani';
       ctx.textAlign = 'center';
       ctx.fillText("PAUSED", CANVAS_WIDTH/2, CANVAS_HEIGHT/2);
       ctx.font = '20px Mono';
       ctx.fillText("PRESS ESC TO RESUME", CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 40);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let lastTime = 0;
    let accumulator = 0;
    const STEP = 1000 / 90; 

    const loop = (time: number) => {
      if (lastTime === 0) lastTime = time;
      const deltaTime = time - lastTime;
      lastTime = time;

      if (!gameStarted) {
          setGameStarted(true);
          audioService.playBattleStart();
      }

      if (!isPaused) {
          accumulator += Math.min(deltaTime, 100); 
          while (accumulator >= STEP) {
              update();
              accumulator -= STEP;
          }
      }
      
      draw(ctx);
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);

    const handleKeyDown = (e: KeyboardEvent) => { 
        if (e.key === 'Escape') {
            setIsPaused(prev => !prev);
        }
        gameState.current.keys[e.code] = true; 
    };
    const handleKeyUp = (e: KeyboardEvent) => { gameState.current.keys[e.code] = false; };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPaused, gameStarted]);

  return (
    <div className="relative flex justify-center items-center h-full w-full bg-black overflow-hidden">
      <div style={{ transform: `scale(${scale})` }} className="relative origin-center shadow-[0_0_50px_rgba(0,0,0,0.8)]">
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex justify-center z-10">
          <div className="w-[600px] h-[800px] relative">
            <div className="absolute top-4 left-4 text-cyan-400 font-mono text-xl drop-shadow-md bg-black/40 px-2 rounded">
               SCORE: {hudState.score.toString().padStart(8, '0')}
            </div>
            <div className="absolute top-4 right-4 text-red-500 font-mono text-xl drop-shadow-md bg-black/40 px-2 rounded flex flex-col items-end">
               <span>HP: {Math.max(0, Math.floor(hudState.hp))}%</span>
               {hudState.shield > 0 && <span className="text-blue-400 text-sm">SHIELD: {hudState.shield}</span>}
               {hudState.revives > 0 && <span className="text-green-400 text-sm">REVIVES: {hudState.revives}</span>}
               {pityStacks > 0 && (
                  <span className="text-purple-400 text-xs mt-1 animate-pulse">
                     TAC. SUPPORT: {pityStacks}
                  </span>
               )}
            </div>
            
            <div className="absolute bottom-4 left-4 font-mono text-lg drop-shadow-md bg-black/40 px-2 rounded flex flex-col items-start gap-1">
               {loadout.spells.map((spell, idx) => (
                  <div key={idx} className={`${hudState.spellsReady[idx] ? 'text-yellow-400' : 'text-gray-600'}`}>
                     [{idx === 0 ? 'X' : idx === 1 ? 'C' : 'V'}] {SPELL_CARDS[spell].name}: {hudState.spellsReady[idx] ? 'READY' : 'WAIT'}
                  </div>
               ))}
               {loadout.spells.length === 0 && <div className="text-gray-600">NO SPELLS EQUIPPED</div>}
            </div>

            {hudState.bossName && (
               <div className="absolute top-16 left-0 w-full text-center">
                  <h2 className="text-3xl font-bold text-red-600 tracking-widest bg-black/50 inline-block px-4 border border-red-600 transform -skew-x-12">
                     WARNING: {hudState.bossName}
                  </h2>
               </div>
            )}
            {hudState.dialogue && (
               <div className="absolute bottom-32 left-10 right-10 bg-black/80 border border-cyan-500 p-4 text-cyan-300 font-mono text-lg animate-pulse">
                  <span className="text-xs text-gray-500 block mb-1">INCOMING TRANSMISSION...</span>
                  &gt; {hudState.dialogue}
               </div>
            )}
            <div className="absolute inset-0 crt-overlay"></div>
          </div>
        </div>
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="border-2 border-slate-800 shadow-[0_0_30px_rgba(0,240,255,0.1)] bg-black block" />
        
        {/* PAUSE / SETTINGS OVERLAY */}
        {isPaused && (
           <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-auto">
              <SettingsMenu onClose={() => setIsPaused(false)} />
           </div>
        )}
      </div>
      <button onClick={onExit} className="absolute top-4 left-4 z-50 bg-red-900/50 text-white px-3 py-1 border border-red-500 hover:bg-red-800 cursor-pointer text-xs sm:text-base">
         ABORT
      </button>
    </div>
  );
};

export default GameCanvas;