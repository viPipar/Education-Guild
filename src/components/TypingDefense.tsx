import React, { useState, useEffect, useRef } from 'react';
import type { Profile } from '../lib/supabase';
import { db } from '../lib/supabase';
import { playClick, playSelect } from '../lib/audio';
import { Shield, Play, RotateCcw, AlertTriangle, Cloud, Plus, Trash2, Key, Target } from 'lucide-react';

interface TypingDefenseProps {
  currentProfile: Profile;
  profiles: Profile[];
}

interface Enemy {
  id: string;
  lane: number;
  type: 'hafalan' | 'math' | 'typing';
  soal: string;
  jawaban: string;
  spawnTime: number;
  speed: number;
  status: 'active' | 'dying';
}

interface Projectile {
  id: string;
  lane: number;
  fireTime: number;
  word: string;
  color: string;
}

interface Explosion {
  id: string;
  x: number;
  y: number;
  time: number;
}

interface GameConfig {
  enemy_speed_base: number;
  game_duration_seconds: number;
  spawn_rate_per_second: number;
  global_max_hp: number;
  player_cooldown_seconds: number;
  hafalan_weight: number;
  math_weight: number;
  typing_weight: number;
}

const LANES = [
  { label: 'NORTH', angle: 0, dx: 0, dy: -1, code: 'N' },
  { label: 'NORTH-EAST', angle: 45, dx: 0.7071, dy: -0.7071, code: 'NE' },
  { label: 'EAST', angle: 90, dx: 1, dy: 0, code: 'E' },
  { label: 'SOUTH-EAST', angle: 135, dx: 0.7071, dy: 0.7071, code: 'SE' },
  { label: 'SOUTH', angle: 180, dx: 0, dy: 1, code: 'S' },
  { label: 'SOUTH-WEST', angle: 225, dx: -0.7071, dy: 0.7071, code: 'SW' },
  { label: 'WEST', angle: 270, dx: -1, dy: 0, code: 'W' },
  { label: 'NORTH-WEST', angle: 315, dx: -0.7071, dy: -0.7071, code: 'NW' }
];

export const TypingDefense: React.FC<TypingDefenseProps> = ({ currentProfile, profiles }) => {
  const [phase, setPhase] = useState<'lobby' | 'active' | 'victory' | 'defeat'>('lobby');
  const [nexusHp, setNexusHp] = useState(10);
  const [timeLeft, setTimeLeft] = useState(120);
  const [lockedLane, setLockedLane] = useState<number>(0);
  const [localInput, setLocalInput] = useState('');
  const [cooldownTime, setCooldownTime] = useState(0);
  const [isCooldownActive, setIsCooldownActive] = useState(false);
  const [blindLanes, setBlindLanes] = useState<boolean[]>(Array(8).fill(false));
  const [inputFlashRed, setInputFlashRed] = useState(false);

  // Lists
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [explosions, setExplosions] = useState<Explosion[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);

  // Configurations
  const [config, setConfig] = useState<GameConfig>({
    enemy_speed_base: 0.8,
    game_duration_seconds: 120,
    spawn_rate_per_second: 0.25,
    global_max_hp: 10,
    player_cooldown_seconds: 1.5,
    hafalan_weight: 40,
    math_weight: 30,
    typing_weight: 30
  });

  // Admin CRUD states
  const [newSoal, setNewSoal] = useState('');
  const [newJawaban, setNewJawaban] = useState('');
  const [targetPlayerId, setTargetPlayerId] = useState('');
  const [targetBlindLane, setTargetBlindLane] = useState(0);

  // Refs for tracking active references in animation frames
  const configRef = useRef(config);
  const enemiesRef = useRef(enemies);
  const phaseRef = useRef(phase);
  const hostRef = useRef(false);
  const lastSpawnTime = useRef(0);
  const timerIntervalRef = useRef<any>(null);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    enemiesRef.current = enemies;
  }, [enemies]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Load questions
  const loadQuestions = async () => {
    try {
      const q = await db.getTypingQuestions();
      setQuestions(q);
    } catch (err) {
      console.error('Failed to load questions:', err);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  // Determine Host P2P
  const getOnlineProfiles = () => {
    const now = Date.now();
    return profiles.filter(p => p.last_seen && (now - new Date(p.last_seen).getTime() < 30000));
  };

  const checkHostStatus = () => {
    const online = getOnlineProfiles();
    if (online.length === 0) {
      hostRef.current = false;
      return;
    }
    const sorted = [...online].sort((a, b) => {
      const roleVal = { 'Director': 3, 'Manager': 2, 'Staff': 1 };
      if (roleVal[b.role] !== roleVal[a.role]) {
        return roleVal[b.role] - roleVal[a.role];
      }
      return a.id.localeCompare(b.id);
    });
    const isMeHost = sorted[0]?.id === currentProfile.id;
    hostRef.current = isMeHost;
  };

  // Heartbeat check for host status every 5 seconds
  useEffect(() => {
    checkHostStatus();
    const interval = setInterval(checkHostStatus, 5000);
    return () => clearInterval(interval);
  }, [profiles, currentProfile.id]);

  // Subscriptions for Realtime Broadcast Channels
  useEffect(() => {
    const unsubscribe = db.subscribe((msg) => {
      const { type, payload } = msg;

      if (type === 'typing_questions_update') {
        loadQuestions();
      } else if (type === 'game_start_broadcast') {
        const gameConfig = payload.config as GameConfig;
        setConfig(gameConfig);
        setNexusHp(gameConfig.global_max_hp);
        setTimeLeft(gameConfig.game_duration_seconds);
        setEnemies([]);
        setProjectiles([]);
        setExplosions([]);
        setBlindLanes(Array(8).fill(false));
        setPhase('active');
        playSelect();
      } else if (type === 'game_enemy_spawn') {
        const newEnemy: Enemy = {
          id: payload.id,
          lane: payload.lane,
          type: payload.type,
          soal: payload.soal,
          jawaban: payload.jawaban,
          spawnTime: payload.spawnTime,
          speed: payload.speed,
          status: 'active'
        };
        setEnemies(prev => [...prev, newEnemy]);
      } else if (type === 'game_projectile_fired') {
        const newProj: Projectile = {
          id: String(Date.now()) + Math.random(),
          lane: payload.lane,
          fireTime: Date.now(),
          word: payload.word,
          color: payload.playerId === currentProfile.id ? '#ffdf00' : '#00ffff'
        };
        setProjectiles(prev => [...prev, newProj]);
      } else if (type === 'game_enemy_killed') {
        // Find enemy position to animate explosion
        setEnemies(prev => {
          const match = prev.find(e => e.id === payload.enemyId);
          if (match) {
            const inwardDist = ((Date.now() - match.spawnTime) / 1000) * match.speed * 8;
            const pos = Math.max(15, 100 - inwardDist);
            const laneObj = LANES[match.lane];
            const x = 50 + laneObj.dx * pos * 0.45;
            const y = 50 + laneObj.dy * pos * 0.45;

            // Trigger local explosion
            const newExplosion: Explosion = {
              id: String(Math.random()),
              x,
              y,
              time: Date.now()
            };
            setExplosions(ex => [...ex, newExplosion]);
          }
          return prev.filter(e => e.id !== payload.enemyId);
        });
      } else if (type === 'game_nexus_damage') {
        setNexusHp(payload.newHp);
        // Visual shake or red flash can be triggered locally
        setEnemies(prev => prev.filter(e => e.id !== payload.enemyId));
      } else if (type === 'game_time_sync') {
        setTimeLeft(payload.timeLeft);
      } else if (type === 'game_over_broadcast') {
        setPhase(payload.result);
      } else if (type === 'game_blind_lane') {
        if (payload.targetPlayerId === currentProfile.id) {
          setBlindLanes(prev => {
            const updated = [...prev];
            updated[payload.laneIndex] = true;
            return updated;
          });
        }
      } else if (type === 'game_blind_lane_clear') {
        if (payload.targetPlayerId === currentProfile.id) {
          setBlindLanes(prev => {
            const updated = [...prev];
            updated[payload.laneIndex] = false;
            return updated;
          });
        }
      }
    });

    return () => unsubscribe();
  }, [currentProfile.id]);

  // Host Gameplay Spawner Tick Loop
  useEffect(() => {
    if (phase !== 'active') return;

    timerIntervalRef.current = setInterval(() => {
      if (!hostRef.current) return;

      // Decrement Timer
      setTimeLeft(prev => {
        const next = prev - 1;
        db.broadcast('game_time_sync', { timeLeft: next });
        if (next <= 0) {
          db.broadcast('game_over_broadcast', { result: 'victory' });
          setPhase('victory');
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timerIntervalRef.current);
  }, [phase]);

  // Spawner Engine (runs on Host client)
  useEffect(() => {
    if (phase !== 'active') return;

    const spawnCheckInterval = setInterval(() => {
      if (!hostRef.current) return;
      if (questions.length === 0) return;

      const now = Date.now();
      const spawnIntervalMs = 1000 / config.spawn_rate_per_second;

      if (now - lastSpawnTime.current >= spawnIntervalMs) {
        lastSpawnTime.current = now;

        // Choose random lane
        const lane = Math.floor(Math.random() * 8);

        // Select Question based on weights
        const randomRoll = Math.random() * 100;
        let selectedType: 'hafalan' | 'math' | 'typing' = 'hafalan';

        if (randomRoll < config.hafalan_weight) {
          selectedType = 'hafalan';
        } else if (randomRoll < config.hafalan_weight + config.math_weight) {
          selectedType = 'math';
        } else {
          selectedType = 'typing';
        }

        // Filter question bank by type
        let pool = questions;
        if (selectedType === 'math') {
          // Select numeric ones or general defaults
          pool = questions.filter(q => q.soal.match(/[x+\-\/0-9]/));
        } else if (selectedType === 'typing') {
          // Select long dexterous words
          pool = questions.filter(q => q.soal.length > 10);
        } else {
          // Hafalan/general
          pool = questions.filter(q => q.soal.length <= 15 && !q.soal.match(/[x+\-\/0-9]/));
        }

        if (pool.length === 0) pool = questions; // Fallback to all questions
        const chosen = pool[Math.floor(Math.random() * pool.length)];

        const enemyId = 'enemy_' + Date.now() + Math.random().toString(36).substring(2, 5);

        db.broadcast('game_enemy_spawn', {
          id: enemyId,
          lane,
          type: selectedType,
          soal: chosen.soal,
          jawaban: chosen.jawaban,
          spawnTime: now,
          speed: config.enemy_speed_base
        });
      }
    }, 200);

    return () => clearInterval(spawnCheckInterval);
  }, [phase, questions, config]);

  // Main Canvas & Math Coordinates Game Loop (60FPS requestAnimationFrame)
  useEffect(() => {
    let animationFrameId: number;

    const tick = () => {
      const now = Date.now();

      // Projectiles cleanup
      setProjectiles(prev => prev.filter(p => now - p.fireTime < 1500));

      // Explosions cleanup
      setExplosions(prev => prev.filter(ex => now - ex.time < 500));

      // Host checks for breaches & collisions
      if (hostRef.current && phaseRef.current === 'active') {
        const currentEnemies = enemiesRef.current;
        
        currentEnemies.forEach(e => {
          // Inward travel distance. speed * seconds.
          const secondsActive = (now - e.spawnTime) / 1000;
          const inwardProgress = secondsActive * e.speed * 8; // speed coefficient

          if (inwardProgress >= 100) {
            // Breach occurred!
            const newHpVal = Math.max(0, nexusHp - 1);
            setNexusHp(newHpVal);

            db.broadcast('game_nexus_damage', {
              enemyId: e.id,
              newHp: newHpVal
            });

            if (newHpVal <= 0) {
              db.broadcast('game_over_broadcast', { result: 'defeat' });
              setPhase('defeat');
            }
          }
        });
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [nexusHp]);

  // Cooldown countdown timer effect
  useEffect(() => {
    if (!isCooldownActive) return;

    const timer = setInterval(() => {
      setCooldownTime(prev => {
        if (prev <= 0.1) {
          setIsCooldownActive(false);
          clearInterval(timer);
          return 0;
        }
        return prev - 0.1;
      });
    }, 100);

    return () => clearInterval(timer);
  }, [isCooldownActive]);

  // Action: Launch Local Game Trigger (P2P Start)
  const triggerGameStart = () => {
    playClick();
    db.broadcast('game_start_broadcast', {
      config
    });
  };

  // Keyboard modifiers for lane selection
  // Pressing 1-8 keys or directional shortcuts can change target
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (phase !== 'active') return;
      if (document.activeElement?.tagName === 'INPUT' && document.activeElement !== document.getElementById('typing-defense-input')) {
        return; // Avoid triggering when typing in other inputs
      }

      // Check numbers 1-8 (0-based lane binding)
      const num = parseInt(e.key);
      if (num >= 1 && num <= 8) {
        setLockedLane(num - 1);
        playSelect();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase]);

  // Handle Input Submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phase !== 'active') return;
    if (isCooldownActive) return;

    const answerAttempt = localInput.trim().toLowerCase();
    if (!answerAttempt) return;

    // Find the closest active enemy in the currently locked lane
    const laneEnemies = enemies.filter(e => e.lane === lockedLane && e.status === 'active');
    
    // Sort by proximity (closest to center / highest spawn time)
    laneEnemies.sort((a, b) => b.spawnTime - a.spawnTime);
    const targetEnemy = laneEnemies[0];

    if (targetEnemy && targetEnemy.jawaban.toLowerCase() === answerAttempt) {
      // Correct!
      setLocalInput('');
      
      // Fire Projectile
      db.broadcast('game_projectile_fired', {
        lane: lockedLane,
        word: answerAttempt,
        playerId: currentProfile.id,
        playerName: currentProfile.name
      });

      // Kill Enemy
      db.broadcast('game_enemy_killed', {
        enemyId: targetEnemy.id,
        playerId: currentProfile.id
      });

      // Set Cooldown
      if (config.player_cooldown_seconds > 0) {
        setCooldownTime(config.player_cooldown_seconds);
        setIsCooldownActive(true);
      }
    } else {
      // Incorrect flash red
      setInputFlashRed(true);
      setTimeout(() => setInputFlashRed(false), 250);
    }
  };

  // Admin Actions
  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSoal.trim() || !newJawaban.trim()) return;
    playClick();

    await db.addTypingQuestion(newSoal.trim(), newJawaban.trim());
    setNewSoal('');
    setNewJawaban('');
  };

  const handleDeleteQuestion = async (id: string) => {
    playClick();
    await db.deleteTypingQuestion(id);
  };

  const handleTriggerBlindLane = () => {
    if (!targetPlayerId) return;
    playClick();
    db.broadcast('game_blind_lane', {
      targetPlayerId,
      laneIndex: targetBlindLane
    });
  };

  const handleClearBlindLane = () => {
    if (!targetPlayerId) return;
    playClick();
    db.broadcast('game_blind_lane_clear', {
      targetPlayerId,
      laneIndex: targetBlindLane
    });
  };

  // UI Calculations
  const getEnemyPosition = (enemy: Enemy) => {
    const elapsedSeconds = (Date.now() - enemy.spawnTime) / 1000;
    const progress = Math.min(100, elapsedSeconds * enemy.speed * 8); // 8 is a speed scale factor
    // Scale distance to viewport percentage
    const distance = Math.max(15, 100 - progress); 
    const laneObj = LANES[enemy.lane];
    
    return {
      x: 50 + laneObj.dx * distance * 0.45, // scale factor for circular layout
      y: 50 + laneObj.dy * distance * 0.45
    };
  };

  const getProjectilePosition = (p: Projectile) => {
    const elapsedSeconds = (Date.now() - p.fireTime) / 1000;
    const progress = Math.min(100, elapsedSeconds * 200); // bullet speed coefficient
    const laneObj = LANES[p.lane];
    
    return {
      x: 50 + laneObj.dx * progress * 0.45,
      y: 50 + laneObj.dy * progress * 0.45
    };
  };

  const isAdmin = currentProfile.role === 'Director' || currentProfile.role === 'Manager';

  return (
    <div className="p-4 flex flex-col xl:flex-row gap-6 min-h-[calc(100vh-140px)] bg-[#0d0d12] text-[#fef08a] font-sans">
      
      {/* LEFT COLUMN: THE GAME ARENA */}
      <div className="flex-1 flex flex-col items-center justify-between border-2 border-[#cca566]/30 bg-black/60 rounded-xl p-6 shadow-2xl relative overflow-hidden min-h-[600px]">
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(30,30,50,0.3)_0%,rgba(0,0,0,0.8)_100%)] opacity-80 pointer-events-none" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(20,15,10,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(20,15,10,0.15)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

        {/* HUD Game Status Bar */}
        <div className="w-full flex items-center justify-between z-10 bg-slate-950/80 border border-[#cca566]/20 px-4 py-2.5 rounded-lg font-mono text-xs">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <Shield className="text-amber-500 w-4.5 h-4.5 animate-pulse" />
              NEXUS CORE: 
              <strong className="text-green-400 text-sm font-bold bg-green-950/50 px-2 py-0.5 rounded border border-green-800/40">
                {nexusHp} / {config.global_max_hp} HP
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400">STATUS:</span>
            {phase === 'lobby' && <span className="text-blue-400 font-bold uppercase animate-pulse">Lobby</span>}
            {phase === 'active' && <span className="text-green-400 font-bold uppercase animate-pulse">🔴 PERTAHANAN AKTIF</span>}
            {phase === 'victory' && <span className="text-yellow-400 font-black uppercase">🏆 Kemenangan</span>}
            {phase === 'defeat' && <span className="text-red-500 font-black uppercase">💀 Kekalahan</span>}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">WAKTU:</span>
            <strong className="text-amber-400 text-sm font-mono">{timeLeft}s</strong>
          </div>
        </div>

        {/* 8-WAY RADIAL GAME BOARD */}
        <div className="w-[480px] h-[480px] md:w-[500px] md:h-[500px] relative mt-6 mb-6 select-none flex-shrink-0">
          
          {/* Circular Orbit Markers */}
          <div className="absolute inset-0 rounded-full border border-slate-900/60 pointer-events-none scale-25" />
          <div className="absolute inset-0 rounded-full border border-slate-900/40 pointer-events-none scale-50" />
          <div className="absolute inset-0 rounded-full border border-slate-900/20 pointer-events-none scale-75" />
          <div className="absolute inset-0 rounded-full border border-[#cca566]/10 pointer-events-none" />

          {/* Render 8 Lane Lines */}
          {LANES.map((lane, idx) => {
            const isLocked = lockedLane === idx;
            const isBlind = blindLanes[idx];
            return (
              <div
                key={lane.label}
                onClick={() => {
                  if (phase === 'active') {
                    setLockedLane(idx);
                    playClick();
                  }
                }}
                className="absolute inset-0 flex items-center justify-center cursor-pointer group pointer-events-auto"
              >
                {/* Lane line vector */}
                <div
                  className={`absolute origin-center transition-all ${
                    isLocked 
                      ? 'h-[2px] bg-gradient-to-r from-transparent via-[#ffd700] to-[#ffd700] shadow-[0_0_12px_#ffae00] opacity-100 z-20' 
                      : 'h-[1px] bg-slate-800/40 group-hover:bg-[#cca566]/40 opacity-70'
                  }`}
                  style={{
                    width: '45%',
                    transform: `rotate(${lane.angle - 90}deg) translate(50%)`,
                  }}
                />

                {/* Outer Direction Button Hitbox */}
                <div
                  className="absolute"
                  style={{
                    transform: `rotate(${lane.angle - 90}deg) translate(220px) rotate(${90 - lane.angle}deg)`
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLockedLane(idx);
                      playClick();
                    }}
                    className={`w-8 h-8 rounded-full border flex items-center justify-center font-mono font-bold text-[9px] transition-all shadow-md ${
                      isLocked
                        ? 'border-yellow-400 bg-yellow-500 text-black shadow-[0_0_10px_rgba(250,204,21,0.5)] scale-110'
                        : 'border-[#cca566]/30 bg-slate-950 text-[#cca566] hover:border-yellow-500/50 hover:text-yellow-400'
                    }`}
                  >
                    {lane.code}
                  </button>
                </div>

                {/* Blind Lane overlay cloud */}
                {isBlind && (
                  <div
                    className="absolute z-10 flex items-center justify-center text-red-500 font-bold"
                    style={{
                      transform: `rotate(${lane.angle - 90}deg) translate(130px) rotate(${90 - lane.angle}deg)`
                    }}
                  >
                    <div className="bg-black/90 border border-red-900/60 p-1.5 rounded-lg flex items-center gap-1 text-[8px] animate-pulse">
                      <Cloud className="w-3.5 h-3.5 text-stone-500" />
                      <span>KABUR (BLIND)</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* The Nexus (Center Core) */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border-4 border-[#cca566] bg-slate-950 flex flex-col items-center justify-center shadow-xl shadow-black z-30 select-none">
            <div className={`absolute inset-0.5 rounded-full border border-dashed border-amber-500/40 animate-[spin_30s_linear_infinite]`}></div>
            <div className="z-10 flex flex-col items-center">
              <Shield className={`w-6 h-6 text-amber-500 ${phase === 'active' ? 'animate-pulse' : ''}`} />
              <span className="text-[7.5px] font-mono font-extrabold tracking-wider text-slate-400 mt-1">CORE</span>
            </div>
            {/* Health Shield glow ring */}
            <div
              className="absolute inset-0 rounded-full transition-all duration-300"
              style={{
                boxShadow: `inset 0 0 15px rgba(${nexusHp < 3 ? '220, 38, 38' : '34, 197, 94'}, 0.4)`,
                border: `2px solid rgba(${nexusHp < 3 ? '220, 38, 38' : '34, 197, 94'}, 0.2)`
              }}
            />
          </div>

          {/* ENEMIES RENDER */}
          {enemies.map((e) => {
            const pos = getEnemyPosition(e);
            const isLaneBlind = blindLanes[e.lane];
            const isTargeted = lockedLane === e.lane;
            
            return (
              <div
                key={e.id}
                className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center transition-all ${
                  isTargeted ? 'scale-105' : 'scale-95 opacity-85'
                }`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                {/* Speech Bubble / Text Soal */}
                <div className={`relative px-2.5 py-1.5 rounded-lg border shadow-lg max-w-[130px] text-center font-bold text-[9px] mb-1 font-mono transition-colors ${
                  isTargeted 
                    ? 'bg-slate-900 border-yellow-400 text-yellow-300 shadow-[0_0_8px_rgba(253,224,71,0.25)]' 
                    : 'bg-slate-950/90 border-[#cca566]/20 text-[#cca566]'
                }`}>
                  {isLaneBlind ? (
                    <span className="text-red-500 flex items-center gap-1 animate-pulse">
                      <Cloud size={10} className="text-stone-500 fill-stone-500/20" />
                      TANYA TEMAN!
                    </span>
                  ) : (
                    <span>{e.soal}</span>
                  )}
                  {/* Speech bubble tail */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900" />
                </div>

                {/* Enemy Sprite & Badge */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${
                  e.type === 'hafalan' ? 'bg-indigo-950/60 border-indigo-500 text-indigo-300' :
                  e.type === 'math' ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300' :
                  'bg-rose-950/60 border-rose-500 text-rose-300'
                } ${isTargeted ? 'ring-2 ring-yellow-400/50 scale-110' : ''}`} title={`${e.type.toUpperCase()} - Klik lintasan untuk kunci`}>
                  {e.type === 'hafalan' && <span className="text-[10px]">📖</span>}
                  {e.type === 'math' && <span className="text-[10px]">🧮</span>}
                  {e.type === 'typing' && <span className="text-[10px]">⚡</span>}
                </div>
              </div>
            );
          })}

          {/* PROJECTILES RENDER */}
          {projectiles.map((p) => {
            const pos = getProjectilePosition(p);
            return (
              <div
                key={p.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-25 flex items-center justify-center pointer-events-none"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                {/* Visual Bolt */}
                <div
                  className="w-3 h-3 rounded-full shadow-[0_0_8px_currentColor] animate-ping"
                  style={{ color: p.color, backgroundColor: p.color }}
                />
                {/* Floating Answer Text */}
                <span className="absolute bottom-full mb-1 text-[8px] font-bold font-mono px-1 rounded bg-black/80 text-yellow-300 border border-yellow-400/20 shadow-md">
                  {p.word}
                </span>
              </div>
            );
          })}

          {/* EXPLOSIONS RENDER */}
          {explosions.map((ex) => (
            <div
              key={ex.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-25 pointer-events-none"
              style={{ left: `${ex.x}%`, top: `${ex.y}%` }}
            >
              {/* Explosion particle burst effect */}
              <div className="w-12 h-12 rounded-full border-2 border-red-500/80 bg-red-600/30 animate-[ping_0.3s_ease-out_forwards] flex items-center justify-center">
                <span className="text-red-400 text-xs font-black animate-pulse">💥</span>
              </div>
            </div>
          ))}

        </div>

        {/* LOCAL TYPING BOARD INPUT */}
        <div className="w-full max-w-md z-10">
          {phase === 'active' ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span className="flex items-center gap-1">
                  <Target size={11} className="text-yellow-400" />
                  MENARGETKAN LINTASAN: 
                  <strong className="text-yellow-400 font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-[#cca566]/20">
                    {LANES[lockedLane].label} ({LANES[lockedLane].code})
                  </strong>
                </span>
                <span>TEKAN [1-8] UNTUK GANTI CEPAT</span>
              </div>

              {/* Input wrapper with flash and cooldown indicator */}
              <div className="relative">
                <input
                  id="typing-defense-input"
                  type="text"
                  autoComplete="off"
                  disabled={isCooldownActive}
                  value={localInput}
                  onChange={(e) => setLocalInput(e.target.value)}
                  placeholder={isCooldownActive ? `Locked (Cooldown)...` : `Ketik jawaban soal di lintasan ${LANES[lockedLane].code} lalu [ENTER]`}
                  className={`w-full bg-slate-950/90 text-yellow-100 border-2 rounded-lg px-4 py-2.5 text-center text-xs font-bold font-mono focus:outline-none focus:border-amber-400 transition-all ${
                    inputFlashRed ? 'border-red-600 bg-red-950/20 text-red-400' :
                    isCooldownActive ? 'border-stone-800/80 text-stone-600 bg-stone-950 cursor-not-allowed' :
                    'border-[#cca566]/30 focus:shadow-[0_0_12px_rgba(251,191,36,0.15)]'
                  }`}
                />

                {/* Cooldown loading progress bar */}
                {isCooldownActive && (
                  <div className="absolute bottom-0 left-0 h-1 bg-amber-500 transition-all duration-100 rounded-b-lg"
                       style={{ width: `${(cooldownTime / config.player_cooldown_seconds) * 100}%` }} />
                )}
              </div>
            </form>
          ) : (
            /* Lobby or Ended screen triggers */
            <div className="text-center py-4 bg-slate-950/60 p-4 border border-[#cca566]/20 rounded-lg">
              {phase === 'lobby' && (
                <div>
                  <p className="text-[10px] text-slate-400 mb-3 font-mono leading-relaxed">
                    Siapkan tim Anda untuk bertahan! Anda memerlukan setidaknya 1 pemain untuk memulai. Parameter game diatur melalui Dashboard Administrasi di sebelah kanan.
                  </p>
                  <button
                    onClick={triggerGameStart}
                    className="px-6 py-2.5 bg-gradient-to-b from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 border border-amber-400 text-stone-950 font-black text-xs rounded transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
                  >
                    <Play size={14} className="fill-stone-950 text-stone-950" />
                    MULAI PERTAHANAN (START SIEGE)
                  </button>
                </div>
              )}

              {phase === 'victory' && (
                <div className="animate-[fadeIn_0.5s_ease-out]">
                  <h3 className="text-yellow-400 font-extrabold text-sm uppercase tracking-widest mb-1 select-none">🏆 VICTORY: Siege Survived</h3>
                  <p className="text-[10px] text-slate-400 mb-3 font-mono">Selamat! Tim Anda berhasil melindungi Nexus Core dari pengepungan.</p>
                  <button
                    onClick={triggerGameStart}
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 border border-[#cca566]/30 text-[#cca566] font-bold text-[10px] rounded transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
                  >
                    <RotateCcw size={12} />
                    Mulai Ulang Game (Reset Game)
                  </button>
                </div>
              )}

              {phase === 'defeat' && (
                <div className="animate-[fadeIn_0.5s_ease-out]">
                  <h3 className="text-red-500 font-extrabold text-sm uppercase tracking-widest mb-1 select-none">💀 DEFEAT: The Nexus Has Fallen</h3>
                  <p className="text-[10px] text-slate-400 mb-3 font-mono">Nexus Core hancur diserang musuh. Pertahanan Anda ditembus.</p>
                  <button
                    onClick={triggerGameStart}
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 border border-[#cca566]/30 text-[#cca566] font-bold text-[10px] rounded transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
                  >
                    <RotateCcw size={12} />
                    Coba Lagi (Retry Siege)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: ADMINISTRATIVE DASHBOARD & QUESTION CRUD */}
      {isAdmin && (
        <div className="w-full xl:w-[420px] flex flex-col gap-5 flex-shrink-0 animate-[fadeIn_0.3s_ease-out]">
          
          {/* Section 1: Dynamic Game Parameters Settings */}
          <div className="bg-[#1b1613] border-2 border-[#cca566]/40 p-4 rounded-xl shadow-xl flex flex-col gap-3.5">
            <h3 className="text-xs font-bold text-[#cca566] border-b border-[#cca566]/20 pb-2 uppercase tracking-wider font-mono flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-500" />
              Kontrol Mekanik Game (Host)
            </h3>

            <div className="flex flex-col gap-3 font-semibold text-[10px]">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400">KECEPATAN DASAR MUSUH (`enemy_speed_base`):</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="5"
                  value={config.enemy_speed_base}
                  onChange={(e) => setConfig(prev => ({ ...prev, enemy_speed_base: Number(e.target.value) }))}
                  className="bg-black/60 text-yellow-100 border border-[#cca566]/30 px-2.5 py-1.5 rounded focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400">DURASI PERMAINAN (`game_duration_seconds`):</label>
                <input
                  type="number"
                  min="10"
                  max="600"
                  value={config.game_duration_seconds}
                  onChange={(e) => setConfig(prev => ({ ...prev, game_duration_seconds: Number(e.target.value) }))}
                  className="bg-black/60 text-yellow-100 border border-[#cca566]/30 px-2.5 py-1.5 rounded focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400">FREKUENSI SPAWN PER DETIK (`spawn_rate_per_second`):</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.05"
                  max="5"
                  value={config.spawn_rate_per_second}
                  onChange={(e) => setConfig(prev => ({ ...prev, spawn_rate_per_second: Number(e.target.value) }))}
                  className="bg-black/60 text-yellow-100 border border-[#cca566]/30 px-2.5 py-1.5 rounded focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400">KAPASITAS HP NEXUS (`global_max_hp`):</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={config.global_max_hp}
                  onChange={(e) => setConfig(prev => ({ ...prev, global_max_hp: Number(e.target.value) }))}
                  className="bg-black/60 text-yellow-100 border border-[#cca566]/30 px-2.5 py-1.5 rounded focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400">COOLDOWN MENGETIK PEMAIN (`player_cooldown_seconds`):</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={config.player_cooldown_seconds}
                  onChange={(e) => setConfig(prev => ({ ...prev, player_cooldown_seconds: Number(e.target.value) }))}
                  className="bg-black/60 text-yellow-100 border border-[#cca566]/30 px-2.5 py-1.5 rounded focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Reactive Slider for spawn role weights */}
              <div className="border-t border-[#cca566]/20 pt-2 flex flex-col gap-2">
                <label className="text-[9px] text-slate-400 font-bold uppercase">Distribusi Role Spawn Musuh (Total: 100%):</label>
                
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-[8px] text-slate-400 font-mono">
                    <span>HAFALAN: {config.hafalan_weight}%</span>
                    <span>MATEMATIKA: {config.math_weight}%</span>
                    <span>KETIK CEPAT: {config.typing_weight}%</span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={config.hafalan_weight}
                    onChange={(e) => {
                      const hafalan = Number(e.target.value);
                      const remaining = 100 - hafalan;
                      const math = Math.round(remaining * 0.5);
                      const typing = remaining - math;
                      setConfig(prev => ({ ...prev, hafalan_weight: hafalan, math_weight: math, typing_weight: typing }));
                    }}
                    className="rpg-slider w-full"
                  />
                </div>
              </div>

              {phase === 'active' && hostRef.current && (
                <div className="bg-green-950/30 border border-green-800/40 p-2 rounded text-[8px] text-green-400 font-mono text-center select-none animate-pulse">
                  ✓ ANDA BERTINDAK SEBAGAI HOST (MENGELOLA SPAWNING DAN STATE GAME)
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Blind Lane Emergency Trigger Switch */}
          <div className="bg-[#1b1613] border-2 border-[#cca566]/40 p-4 rounded-xl shadow-xl flex flex-col gap-3">
            <h3 className="text-xs font-bold text-red-400 border-b border-[#cca566]/20 pb-2 uppercase tracking-wider font-mono flex items-center gap-2 animate-pulse">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Event Darurat: Blind Lane Trigger
            </h3>

            <div className="flex flex-col gap-2.5 font-semibold text-[10px]">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400">PILIH TARGET PEMAIN:</label>
                <select
                  value={targetPlayerId}
                  onChange={(e) => setTargetPlayerId(e.target.value)}
                  className="bg-black/60 text-[#cca566] border border-[#cca566]/30 px-2.5 py-1.5 rounded focus:outline-none focus:border-amber-500 font-bold"
                >
                  <option value="">-- Pilih Anggota Tim --</option>
                  {profiles.filter(p => p.id !== currentProfile.id).map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400">LINTASAN TARGET (BLIND PATH):</label>
                <select
                  value={targetBlindLane}
                  onChange={(e) => setTargetBlindLane(Number(e.target.value))}
                  className="bg-black/60 text-[#cca566] border border-[#cca566]/30 px-2.5 py-1.5 rounded focus:outline-none focus:border-amber-500 font-bold"
                >
                  {LANES.map((lane, idx) => (
                    <option key={lane.label} value={idx}>{lane.label} ({lane.code})</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2.5 pt-1.5">
                <button
                  type="button"
                  onClick={handleTriggerBlindLane}
                  disabled={!targetPlayerId}
                  className={`flex-1 py-2 rounded font-extrabold uppercase text-[9px] border flex items-center justify-center gap-1.5 transition-all shadow-md ${
                    targetPlayerId
                      ? 'bg-red-950 text-red-400 border-red-800 hover:bg-red-900 hover:text-white cursor-pointer active:scale-95'
                      : 'bg-stone-900 border-stone-800 text-stone-600 cursor-not-allowed'
                  }`}
                >
                  <Cloud className="w-3.5 h-3.5" />
                  Kirim Kabut (Blind)
                </button>

                <button
                  type="button"
                  onClick={handleClearBlindLane}
                  disabled={!targetPlayerId}
                  className={`flex-1 py-2 rounded font-extrabold uppercase text-[9px] border flex items-center justify-center gap-1.5 transition-all shadow-md ${
                    targetPlayerId
                      ? 'bg-slate-900 text-green-400 border-green-800/40 hover:bg-green-950 cursor-pointer active:scale-95'
                      : 'bg-stone-900 border-stone-800 text-stone-600 cursor-not-allowed'
                  }`}
                >
                  Hapus Kabut
                </button>
              </div>
            </div>
          </div>

          {/* Section 3: Question Bank CRUD Table */}
          <div className="bg-[#1b1613] border-2 border-[#cca566]/40 p-4 rounded-xl shadow-xl flex flex-col gap-3 flex-1 min-h-[300px]">
            <h3 className="text-xs font-bold text-[#cca566] border-b border-[#cca566]/20 pb-2 uppercase tracking-wider font-mono flex items-center gap-2">
              📖 Bank Soal & Jawaban
            </h3>

            {/* Input Form for new Questions */}
            <form onSubmit={handleAddQuestion} className="flex flex-col gap-2 bg-black/40 p-2.5 border border-[#cca566]/20 rounded-lg">
              <div className="flex flex-col gap-0.5">
                <label className="text-[8px] text-slate-400 uppercase font-bold">Soal / Pertanyaan:</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Ibu kota jepang?"
                  value={newSoal}
                  onChange={(e) => setNewSoal(e.target.value)}
                  className="bg-black/60 text-yellow-100 border border-[#cca566]/30 px-2 py-1 rounded text-[9.5px] placeholder:text-stone-600"
                />
              </div>

              <div className="flex flex-col gap-0.5">
                <label className="text-[8px] text-slate-400 uppercase font-bold">Kunci Jawaban (1 Kata):</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: tokyo"
                  value={newJawaban}
                  onChange={(e) => setNewJawaban(e.target.value)}
                  className="bg-black/60 text-yellow-100 border border-[#cca566]/30 px-2 py-1 rounded text-[9.5px] placeholder:text-stone-600 font-mono"
                />
              </div>

              <button
                type="submit"
                className="py-1.5 px-3 bg-amber-600 hover:bg-amber-500 text-stone-950 font-black rounded active:scale-95 transition-all cursor-pointer shadow-md text-[9px] flex items-center justify-center gap-1 mt-1.5"
              >
                <Plus size={12} />
                TAMBAH SOAL
              </button>
            </form>

            {/* Questions List Matrix */}
            <div className="flex-1 overflow-y-auto max-h-[200px] border border-[#cca566]/10 rounded bg-black/20 p-1 space-y-1.5 no-scrollbar">
              {questions.map((q) => (
                <div key={q.id} className="flex items-center justify-between p-2 bg-slate-900/50 hover:bg-slate-900/90 border border-[#cca566]/10 hover:border-[#cca566]/30 rounded transition-all text-[9.5px] font-mono group">
                  <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                    <span className="text-yellow-100 font-sans font-semibold truncate" title={q.soal}>Q: {q.soal}</span>
                    <span className="text-green-400 font-bold">A: {q.jawaban}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteQuestion(q.id)}
                    className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-950/20 rounded transition-colors"
                    title="Hapus Soal"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              {questions.length === 0 && (
                <div className="text-center py-6 text-[9.5px] text-slate-500 font-mono">
                  Bank Soal Kosong
                </div>
              )}
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
