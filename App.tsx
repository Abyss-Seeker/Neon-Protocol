import React, { useState, useEffect, useCallback } from 'react';
import GameCanvas from './components/GameCanvas';
import MainMenu from './components/MainMenu';
import LoadoutMenu from './components/LoadoutMenu';
import TransitionLayer from './components/TransitionLayer';
import { audioService } from './services/audioService';
import { Difficulty, WeaponId, SpellCardId, BoosterId } from './types';
import { WEAPONS, SPELL_CARDS, BOOSTERS } from './constants';

enum AppView {
  MENU,
  LOADOUT,
  GAME,
  RESULT
}

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.MENU);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.NORMAL);
  const [unlockedInfinity, setUnlockedInfinity] = useState(false);
  const [clearedDifficulties, setClearedDifficulties] = useState<Difficulty[]>([]);
  
  // Transitions
  const [isIntro, setIsIntro] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [pendingView, setPendingView] = useState<AppView | null>(null);

  // Persistent Save Data
  const [dataFragments, setDataFragments] = useState(500);
  const [unlockedWeapons, setUnlockedWeapons] = useState<WeaponId[]>([WeaponId.PLASMA_CUTTER]);
  const [unlockedSpells, setUnlockedSpells] = useState<SpellCardId[]>([]);
  
  // Pity System
  const [pitySystemEnabled, setPitySystemEnabled] = useState(false);
  const [pityStacks, setPityStacks] = useState(0);

  // Levels: 1 = Base, 2 = Enhanced, 3 = Evolved
  const [weaponLevels, setWeaponLevels] = useState<Record<WeaponId, number>>({
    [WeaponId.PLASMA_CUTTER]: 1,
    [WeaponId.HOMING_NEEDLES]: 1,
    [WeaponId.SPREAD_SHOTGUN]: 1,
    [WeaponId.LASER_STREAM]: 1,
    [WeaponId.WAVE_MOTION]: 1,
    [WeaponId.ORBITING_ORBS]: 1,
    [WeaponId.ROCKET_BARRAGE]: 1,
    [WeaponId.CHAIN_LIGHTNING]: 1,
    [WeaponId.BACK_TURRET]: 1,
    [WeaponId.VORTEX_DRIVER]: 1,
    [WeaponId.GAUSS_CANNON]: 1,
    [WeaponId.PULSE_NOVA]: 1,
    [WeaponId.PHASE_BLADES]: 1
  });

  const [spellLevels, setSpellLevels] = useState<Record<SpellCardId, number>>({
    [SpellCardId.TIME_DILATOR]: 1,
    [SpellCardId.EMP_BLAST]: 1,
    [SpellCardId.OVERCLOCK]: 1,
    [SpellCardId.PHANTOM_DASH]: 1,
    [SpellCardId.ORBITAL_STRIKE]: 1,
    [SpellCardId.NANO_REPAIR]: 1,
    [SpellCardId.AEGIS_SHIELD]: 1,
    [SpellCardId.STASIS_FIELD]: 1
  });
  
  // Slots
  const [maxWeaponSlots, setMaxWeaponSlots] = useState(2);
  const [maxSpellSlots, setMaxSpellSlots] = useState(1);
  
  const [currentLoadout, setCurrentLoadout] = useState<{ weapons: WeaponId[], spells: SpellCardId[] }>({
    weapons: [WeaponId.PLASMA_CUTTER],
    spells: []
  });

  // Last Run Loadout
  const [lastLoadout, setLastLoadout] = useState<{ weapons: WeaponId[], spells: SpellCardId[] } | null>(null);

  // Shop Boosters (One-time use)
  const [activeBoosters, setActiveBoosters] = useState<Set<BoosterId>>(new Set());

  const [lastGameResult, setLastGameResult] = useState<{ score: number; win: boolean; fragments: number } | null>(null);

  // Cheat Code
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k') {
        setDataFragments(prev => prev + 1000);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Initialize Music on Mount and Auto-play fix
  useEffect(() => {
    // Attempt to start menu music on load.
    audioService.playMenuBGM();

    // Global listener to ensure audio context resumes on any interaction
    const resumeAudio = () => {
      audioService.resume();
    };
    
    window.addEventListener('mousedown', resumeAudio);
    window.addEventListener('keydown', resumeAudio);
    window.addEventListener('touchstart', resumeAudio);

    return () => {
       window.removeEventListener('mousedown', resumeAudio);
       window.removeEventListener('keydown', resumeAudio);
       window.removeEventListener('touchstart', resumeAudio);
    };
  }, []);

  // Handle View Change with Animation
  const changeView = (newView: AppView) => {
    // SFX
    if (newView === AppView.GAME) {
        audioService.playBattleStart();
    }
    
    // BGM Transitions based on target view
    if (newView === AppView.GAME) {
        audioService.playBattleBGM();
    } else if (newView === AppView.MENU || newView === AppView.LOADOUT || newView === AppView.RESULT) {
        audioService.playMenuBGM();
    }

    setPendingView(newView);
    setIsTransitioning(true);
  };

  const onTransitionComplete = useCallback(() => {
    if (pendingView !== null) {
      setView(pendingView);
      setPendingView(null);
    }
  }, [pendingView]);

  const onSequenceEnd = useCallback(() => {
    setIsTransitioning(false);
    setIsIntro(false);
  }, []);

  const handleSelectDifficulty = (diff: Difficulty) => {
    setDifficulty(diff);
    changeView(AppView.LOADOUT);
  };

  const handleStartGame = (weapons: WeaponId[], spells: SpellCardId[]) => {
    setCurrentLoadout({ weapons, spells });
    setLastLoadout({ weapons, spells });
    changeView(AppView.GAME);
  };

  const handleUnlockWeapon = (id: WeaponId) => {
    const cost = WEAPONS[id].unlockCost;
    if (dataFragments >= cost) {
      setDataFragments(prev => prev - cost);
      setUnlockedWeapons(prev => [...prev, id]);
    }
  };

  const handleUnlockSpell = (id: SpellCardId) => {
    const cost = SPELL_CARDS[id].unlockCost;
    if (dataFragments >= cost) {
      setDataFragments(prev => prev - cost);
      setUnlockedSpells(prev => [...prev, id]);
    }
  };

  const handleUpgradeWeapon = (id: WeaponId) => {
    const currentLevel = weaponLevels[id];
    if (currentLevel >= 3) return;

    const def = WEAPONS[id];
    const cost = currentLevel === 1 ? def.upgrades.lv2.cost : def.upgrades.lv3.cost;

    if (dataFragments >= cost) {
      setDataFragments(prev => prev - cost);
      setWeaponLevels(prev => ({ ...prev, [id]: currentLevel + 1 }));
    }
  };

  const handleUpgradeSpell = (id: SpellCardId) => {
    const currentLevel = spellLevels[id];
    if (currentLevel >= 3) return;

    const def = SPELL_CARDS[id];
    const cost = currentLevel === 1 ? def.upgrades.lv2.cost : def.upgrades.lv3.cost;

    if (dataFragments >= cost) {
      setDataFragments(prev => prev - cost);
      setSpellLevels(prev => ({ ...prev, [id]: currentLevel + 1 }));
    }
  };

  const handleUpgradeSlot = (type: 'weapon' | 'spell') => {
    if (type === 'weapon') {
      const cost = maxWeaponSlots === 2 ? 1000 : 2000;
      if (maxWeaponSlots < 4 && dataFragments >= cost) {
        setDataFragments(prev => prev - cost);
        setMaxWeaponSlots(prev => prev + 1);
      }
    } else {
      const cost = 1500;
      if (maxSpellSlots < 2 && dataFragments >= cost) {
        setDataFragments(prev => prev - cost);
        setMaxSpellSlots(prev => prev + 1);
      }
    }
  };

  const handleBuyBooster = (id: BoosterId) => {
    const cost = BOOSTERS[id].cost;
    if (dataFragments >= cost && !activeBoosters.has(id)) {
      setDataFragments(prev => prev - cost);
      setActiveBoosters(prev => new Set(prev).add(id));
    }
  };

  const handleGameOver = (score: number, win: boolean, fragments: number) => {
    setLastGameResult({ score, win, fragments });
    setDataFragments(prev => prev + fragments);
    setActiveBoosters(new Set()); // Clear boosters after run
    
    if (win) {
      // Reset Pity Stacks on Victory
      if (pitySystemEnabled) {
        setPityStacks(0);
      }

      if (!clearedDifficulties.includes(difficulty)) {
        const newCleared = [...clearedDifficulties, difficulty];
        setClearedDifficulties(newCleared);
        // Check Infinity Unlock
        if (newCleared.includes(Difficulty.EASY) && 
            newCleared.includes(Difficulty.NORMAL) && 
            newCleared.includes(Difficulty.HARD) &&
            newCleared.includes(Difficulty.EXTREME)) {
           setUnlockedInfinity(true);
        }
      }
    } else {
      // Increment Pity Stacks on Loss
      if (pitySystemEnabled) {
        setPityStacks(prev => Math.min(100, prev + 1));
      }
    }
    
    // Switch to Menu Music on Result Screen
    audioService.playMenuBGM();

    // Instant switch to result, no transition
    setView(AppView.RESULT);
    setPendingView(null);
    setIsTransitioning(false);
  };

  const renderResult = () => {
    if (!lastGameResult) return null;
    return (
       <div className="flex flex-col items-center justify-center h-screen bg-black/90 text-white font-mono">
          <h1 className={`text-6xl mb-4 font-bold ${lastGameResult.win ? 'text-green-500' : 'text-red-500'}`}>
             {lastGameResult.win ? 'MISSION COMPLETE' : 'MISSION FAILED'}
          </h1>
          <div className="text-2xl mb-2 text-cyan-300">SCORE: {lastGameResult.score}</div>
          <div className="text-xl mb-8 text-yellow-400">DATA FRAGMENTS ACQUIRED: +{lastGameResult.fragments}</div>
          {pitySystemEnabled && !lastGameResult.win && (
             <div className="text-lg text-purple-400 mb-4 animate-pulse">
                TACTICAL SUPPORT INCREASED (STACKS: {pityStacks + 1})
             </div>
          )}
          
          <button 
             onMouseEnter={() => audioService.playUiHover()}
             onClick={() => changeView(AppView.MENU)}
             className="px-8 py-3 bg-slate-800 border border-slate-600 hover:bg-slate-700 text-white font-bold"
          >
             RETURN TO MENU
          </button>
       </div>
    );
  };

  return (
    <div className="w-full h-full">
      <TransitionLayer 
         type={isIntro ? 'intro' : 'transition'} 
         active={isIntro || isTransitioning} 
         onAnimationComplete={onTransitionComplete} 
         onSequenceEnd={onSequenceEnd}
      />

      {view === AppView.MENU && (
        <MainMenu 
           onSelectDifficulty={handleSelectDifficulty} 
           unlockedInfinity={unlockedInfinity} 
           clearedDifficulties={clearedDifficulties}
           pitySystemEnabled={pitySystemEnabled}
           onTogglePity={() => setPitySystemEnabled(!pitySystemEnabled)}
           pityStacks={pityStacks}
           onResetPity={() => setPityStacks(0)}
        />
      )}
      
      {view === AppView.LOADOUT && (
        <LoadoutMenu 
           unlockedWeapons={unlockedWeapons}
           unlockedSpells={unlockedSpells}
           weaponLevels={weaponLevels}
           spellLevels={spellLevels}
           dataFragments={dataFragments}
           maxWeaponSlots={maxWeaponSlots}
           maxSpellSlots={maxSpellSlots}
           activeBoosters={activeBoosters}
           lastLoadout={lastLoadout}
           onStart={handleStartGame}
           onUnlockWeapon={handleUnlockWeapon}
           onUnlockSpell={handleUnlockSpell}
           onUpgradeWeapon={handleUpgradeWeapon}
           onUpgradeSpell={handleUpgradeSpell}
           onUpgradeSlot={handleUpgradeSlot}
           onBuyBooster={handleBuyBooster}
           onBack={() => changeView(AppView.MENU)}
        />
      )}
      
      {view === AppView.GAME && (
        <GameCanvas 
           difficulty={difficulty} 
           loadout={currentLoadout}
           weaponLevels={weaponLevels}
           spellLevels={spellLevels}
           activeBoosters={activeBoosters}
           onGameOver={handleGameOver}
           onExit={() => changeView(AppView.MENU)}
           pityStacks={pitySystemEnabled ? pityStacks : 0}
        />
      )}

      {view === AppView.RESULT && renderResult()}
    </div>
  );
};

export default App;