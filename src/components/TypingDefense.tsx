import React, { useState, useEffect, useRef } from 'react';
import type { Profile } from '../lib/supabase';
import { db } from '../lib/supabase';
import { playClick, playSelect } from '../lib/audio';
import { Shield, Play, RotateCcw, AlertTriangle, Cloud, Plus, Trash2, Key, Target } from 'lucide-react';
import { SpriteRenderer } from './SpriteRenderer';

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
  arrivalTime: number;   // timestamp when projectile reaches target
  word: string;
  color: string;
  hit: boolean;          // true = correct answer
  enemyId?: string;      // enemy to kill on arrival (if hit)
  firedBy: string;       // profile.id of the shooter
  startX: number;        // % board coords, from center
  startY: number;
  targetX: number;       // % board coords, enemy position at time of fire
  targetY: number;
}

interface Explosion {
  id: string;
  x: number;
  y: number;
  time: number;
  type: 'kill' | 'shatter'; // kill = enemy destroyed, shatter = wrong answer
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

// (WoodenStool removed per user request)

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

  // Track which lane every player is currently sitting in
  // key = profile.id, value = lane index
  const [playerLanes, setPlayerLanes] = useState<Record<string, number>>({
    [currentProfile.id]: 0
  });

  // Lists
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [explosions, setExplosions] = useState<Explosion[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);

  // Configurations
  const [config, setConfig] = useState<GameConfig>(() => {
    const defaultVal: GameConfig = {
      enemy_speed_base: 0.8,
      game_duration_seconds: 120,
      spawn_rate_per_second: 0.25,
      global_max_hp: 10,
      player_cooldown_seconds: 1.5,
      hafalan_weight: 40,
      math_weight: 30,
      typing_weight: 30
    };
    try {
      const saved = localStorage.getItem('siege_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaultVal, ...parsed };
      }
    } catch (e) {
      console.error('Failed to load saved config:', e);
    }
    return defaultVal;
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
  const nexusHpRef = useRef(nexusHp);
  const timeLeftRef = useRef(timeLeft);
  const lastStateSyncTime = useRef(0);
  // Track breached enemies to avoid repeated damage in same frame burst
  const breachedEnemyIds = useRef<Set<string>>(new Set());
  // Per-lane last spawn timestamp to prevent lane clustering
  const laneLastSpawnTime = useRef<number[]>(Array(8).fill(0));
  // Track projectile IDs that have already triggered kill/shatter (dedup)
  const handledProjectileIds = useRef<Set<string>>(new Set());
  // Ref for projectiles to read inside rAF without stale closure
  const projectilesRef = useRef(projectiles);
  // Ref for input field so we can re-focus after lane clicks
  const inputRef = useRef<HTMLInputElement>(null);
  // Core shake animation state
  const [coreShaking, setCoreShaking] = useState(false);

  // frameTick forces the component to re-render every animation frame
  // so enemy positions (computed from Date.now()) appear silky smooth.
  const [frameTick, setFrameTick] = useState(0);

  // Track active page viewers and visibility for dynamic host handoff
  const activeSiegePlayersRef = useRef<string[]>([]);
  const playerVisibilityRef = useRef<Record<string, boolean>>({});
  const lastActiveTimeRef = useRef<Record<string, number>>({});

  useEffect(() => {
    configRef.current = config;
    try {
      localStorage.setItem('siege_config', JSON.stringify(config));
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  }, [config]);
  useEffect(() => { enemiesRef.current = enemies; }, [enemies]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { nexusHpRef.current = nexusHp; }, [nexusHp]);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);
  useEffect(() => { projectilesRef.current = projectiles; }, [projectiles]);

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
  const checkHostStatus = () => {
    const now = Date.now();
    
    // Filter active list based on heartbeats (within 10 seconds)
    activeSiegePlayersRef.current = activeSiegePlayersRef.current.filter(id => {
      if (id === currentProfile.id) return true;
      const lastSeen = lastActiveTimeRef.current[id] || 0;
      return now - lastSeen < 10000;
    });

    // Make sure self is included
    const activeIds = Array.from(new Set([currentProfile.id, ...activeSiegePlayersRef.current]));
    
    // Prioritize visible players (foreground browser window/tab)
    const activeAndVisibleIds = activeIds.filter(id => {
      if (id === currentProfile.id) return !document.hidden;
      return playerVisibilityRef.current[id] !== false; // default to true
    });

    // Fallback to all active players if no one is visible
    const candidates = activeAndVisibleIds.length > 0 ? activeAndVisibleIds : activeIds;

    const activeProfiles = profiles.filter(p => candidates.includes(p.id));
    const sorted = [...activeProfiles].sort((a, b) => {
      const roleVal: Record<string, number> = { 'Director': 3, 'Manager': 2, 'Staff': 1 };
      if (roleVal[b.role] !== roleVal[a.role]) {
        return roleVal[b.role] - roleVal[a.role];
      }
      return a.id.localeCompare(b.id);
    });

    const isNewHost = sorted[0]?.id === currentProfile.id;
    if (isNewHost !== hostRef.current) {
      hostRef.current = isNewHost;
      setFrameTick(t => t + 1); // Trigger UI update to reflect host status
    }
  };

  // Heartbeat check for host status every 5 seconds
  useEffect(() => {
    checkHostStatus();
    // Periodically ping to refresh active lists
    db.broadcast('game_siege_ping', { playerId: currentProfile.id, visible: !document.hidden });

    const interval = setInterval(() => {
      checkHostStatus();
      db.broadcast('game_siege_ping', { playerId: currentProfile.id, visible: !document.hidden });
    }, 5000);
    return () => clearInterval(interval);
  }, [profiles, currentProfile.id]);

  // Broadcast my current lane when lockedLane changes during active game
  useEffect(() => {
    if (phase !== 'active') return;
    db.broadcast('game_player_lane', {
      playerId: currentProfile.id,
      lane: lockedLane
    });
    setPlayerLanes(prev => ({ ...prev, [currentProfile.id]: lockedLane }));
  }, [lockedLane, phase, currentProfile.id]);

  // On mount / game start: query other players' positions
  const broadcastMyLane = (lane: number) => {
    db.broadcast('game_player_lane', {
      playerId: currentProfile.id,
      lane
    });
  };

  // ── UI Calculations ─────────────────────────────────────────────────────────

  // Enemy position: sinusoidal wobble perpendicular to lane for a visually longer path.
  // Wobble amplitude decreases to zero as enemies approach center.
  const getEnemyPosition = (enemy: Enemy) => {
    const elapsedSeconds = (Date.now() - enemy.spawnTime) / 1000;
    const startDistance = 64; // Spawns further away (was 48)
    const speedMultiplier = 3.2; // Adjust speed so they take longer to arrive (was 8)
    
    // progress reaches 100 exactly when touching the Core outer boundary (distance = 10)
    const progress = Math.min(100, (elapsedSeconds * enemy.speed * speedMultiplier / (startDistance - 10)) * 100);
    const distance = Math.max(0, startDistance - elapsedSeconds * enemy.speed * speedMultiplier);
    
    const laneObj = LANES[enemy.lane];
    // Perpendicular vector for wobble
    const perpX = -laneObj.dy;
    const perpY = laneObj.dx;
    // Wobble: one full zigzag over the full travel, fading to 0 near core
    const wobbleAmplitude = 4 * (1 - progress / 100);
    const wobble = Math.sin((progress / 50) * Math.PI * 2) * wobbleAmplitude;
    return {
      x: 50 + laneObj.dx * distance + perpX * wobble,
      y: 50 + laneObj.dy * distance + perpY * wobble,
      progress // expose for opacity/scale calculations
    };
  };

  // Projectile position: linearly interpolates from startX/Y to targetX/Y
  const getProjectilePosition = (p: Projectile) => {
    const now = Date.now();
    const duration = p.arrivalTime - p.fireTime;
    const fraction = duration > 0 ? Math.min(1, (now - p.fireTime) / duration) : 1;
    return {
      x: p.startX + (p.targetX - p.startX) * fraction,
      y: p.startY + (p.targetY - p.startY) * fraction
    };
  };

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
        // Reset spawn tracking for fresh game
        lastSpawnTime.current = 0;
        laneLastSpawnTime.current = Array(8).fill(0);
        breachedEnemyIds.current.clear();
        handledProjectileIds.current.clear();
        setPhase('active');
        // Broadcast our starting lane position
        broadcastMyLane(0);
        setLockedLane(0);
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
          arrivalTime: payload.arrivalTime ?? (Date.now() + 800),
          word: payload.word,
          color: payload.firedBy === currentProfile.id ? '#ffdf00' : '#00ffff',
          hit: payload.hit,
          enemyId: payload.enemyId,
          firedBy: payload.firedBy ?? payload.playerId,
          startX: payload.startX ?? 50,
          startY: payload.startY ?? 50,
          targetX: payload.targetX ?? 50,
          targetY: payload.targetY ?? 50,
        };
        setProjectiles(prev => [...prev, newProj]);
      } else if (type === 'game_enemy_killed') {
        // Find enemy position to animate explosion
        setEnemies(prev => {
          const match = prev.find(e => e.id === payload.enemyId);
          if (match) {
            const pos = getEnemyPosition(match);
            const newExplosion: Explosion = {
              id: String(Math.random()),
              x: pos.x,
              y: pos.y,
              time: Date.now(),
              type: 'kill'
            };
            setExplosions(ex => [...ex, newExplosion]);
          }
          return prev.filter(e => e.id !== payload.enemyId);
        });
      } else if (type === 'game_nexus_damage') {
        setNexusHp(payload.newHp);
        setEnemies(prev => prev.filter(e => e.id !== payload.enemyId));
        // Shake the core to signal damage
        setCoreShaking(true);
        setTimeout(() => setCoreShaking(false), 500);
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
      } else if (type === 'game_player_lane') {
        // Another player changed their lane
        setPlayerLanes(prev => ({ ...prev, [payload.playerId]: payload.lane }));
      } else if (type === 'game_player_query') {
        // Another player joined or is asking for positions → respond with mine
        broadcastMyLane(lockedLane);
        
        // Host: if game is active, broadcast complete state for sync
        if (phaseRef.current === 'active') {
          if (hostRef.current) {
            db.broadcast('game_state_sync', {
              phase: phaseRef.current,
              config: configRef.current,
              enemies: enemiesRef.current,
              nexusHp: nexusHpRef.current,
              timeLeft: timeLeftRef.current
            });
          } else {
            // Non-host: if active, set a timeout to check if host responded.
            // If host didn't respond (i.e. host is off-page / just rejoining),
            // this active client will broadcast the sync to recover the game state.
            setTimeout(() => {
              if (Date.now() - lastStateSyncTime.current > 350 && phaseRef.current === 'active') {
                db.broadcast('game_state_sync', {
                  phase: phaseRef.current,
                  config: configRef.current,
                  enemies: enemiesRef.current,
                  nexusHp: nexusHpRef.current,
                  timeLeft: timeLeftRef.current
                });
              }
            }, 400);
          }
        }
      } else if (type === 'game_state_sync') {
        lastStateSyncTime.current = Date.now();
        // Synchronize full game state if active
        const syncData = payload;
        if (syncData.phase === 'active') {
          if (phaseRef.current !== 'active') {
            setProjectiles([]);
            setExplosions([]);
            setBlindLanes(Array(8).fill(false));
            breachedEnemyIds.current.clear();
            handledProjectileIds.current.clear();
          }
          setPhase('active');
          setConfig(syncData.config);
          setNexusHp(syncData.nexusHp);
          setTimeLeft(syncData.timeLeft);
          setEnemies(syncData.enemies);
        }
      } else if (type === 'game_reset_broadcast') {
        setPhase('lobby');
        setEnemies([]);
        setProjectiles([]);
        setExplosions([]);
        setBlindLanes(Array(8).fill(false));
        setNexusHp(configRef.current.global_max_hp);
        setTimeLeft(configRef.current.game_duration_seconds);
        // Clear host timer & spawn check intervals if host
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        breachedEnemyIds.current.clear();
        handledProjectileIds.current.clear();
        playClick();
      } else if (type === 'game_siege_join') {
        const pid = payload.playerId;
        if (pid) {
          activeSiegePlayersRef.current = Array.from(new Set([...activeSiegePlayersRef.current, pid]));
          playerVisibilityRef.current[pid] = payload.visible !== false;
          lastActiveTimeRef.current[pid] = Date.now();
          checkHostStatus();
        }
      } else if (type === 'game_siege_ping') {
        const pid = payload.playerId;
        if (pid) {
          activeSiegePlayersRef.current = Array.from(new Set([...activeSiegePlayersRef.current, pid]));
          playerVisibilityRef.current[pid] = payload.visible !== false;
          lastActiveTimeRef.current[pid] = Date.now();
          db.broadcast('game_siege_pong', { playerId: currentProfile.id, visible: !document.hidden });
          checkHostStatus();
        }
      } else if (type === 'game_siege_pong') {
        const pid = payload.playerId;
        if (pid) {
          activeSiegePlayersRef.current = Array.from(new Set([...activeSiegePlayersRef.current, pid]));
          playerVisibilityRef.current[pid] = payload.visible !== false;
          lastActiveTimeRef.current[pid] = Date.now();
          checkHostStatus();
        }
      } else if (type === 'game_siege_leave') {
        const pid = payload.playerId;
        if (pid) {
          activeSiegePlayersRef.current = activeSiegePlayersRef.current.filter(id => id !== pid);
          delete playerVisibilityRef.current[pid];
          delete lastActiveTimeRef.current[pid];
          checkHostStatus();
        }
      }
    });

    return () => unsubscribe();
  }, [currentProfile.id]);

  // On mount, broadcast a query so existing players respond with their lane
  // Also announce we joined the Siege page to establish host status dynamically
  useEffect(() => {
    db.broadcast('game_player_query', { playerId: currentProfile.id });
    db.broadcast('game_siege_join', { playerId: currentProfile.id, visible: !document.hidden });
    db.broadcast('game_siege_ping', { playerId: currentProfile.id, visible: !document.hidden });
    
    // Also register my starting lane
    setPlayerLanes(prev => ({ ...prev, [currentProfile.id]: lockedLane }));

    const handleVisibility = () => {
      db.broadcast('game_siege_join', { playerId: currentProfile.id, visible: !document.hidden });
      checkHostStatus();
    };
    
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      db.broadcast('game_siege_leave', { playerId: currentProfile.id });
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Host Gameplay Timer Tick
  useEffect(() => {
    if (phase !== 'active') return;

    timerIntervalRef.current = setInterval(() => {
      if (!hostRef.current) return;

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
      // spawn_rate_per_second is treated as interval in seconds (e.g. 0.25 = 250ms between spawns)
      // This is more intuitive: smaller number = faster spawn
      const spawnIntervalMs = configRef.current.spawn_rate_per_second * 1000;

      if (now - lastSpawnTime.current >= spawnIntervalMs) {
        lastSpawnTime.current = now;

        // Pick a lane that hasn't spawned recently — prevents clustering.
        // Per-lane cooldown: 1.5s (1500ms) to allow faster spawn in same lane
        const laneCooldown = 1500;
        const available = laneLastSpawnTime.current
          .map((t, i) => ({ i, t }))
          .filter(({ t }) => now - t >= laneCooldown);
        // If all lanes are on cooldown fall back to the lane with the oldest spawn
        const candidates = available.length > 0
          ? available
          : laneLastSpawnTime.current.map((t, i) => ({ i, t }));
        // Pick randomly from candidates (weighted toward older lanes)
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        const lane = pick.i;
        laneLastSpawnTime.current[lane] = now;

        const randomRoll = Math.random() * 100;
        let selectedType: 'hafalan' | 'math' | 'typing' = 'hafalan';

        if (randomRoll < configRef.current.hafalan_weight) {
          selectedType = 'hafalan';
        } else if (randomRoll < configRef.current.hafalan_weight + configRef.current.math_weight) {
          selectedType = 'math';
        } else {
          selectedType = 'typing';
        }

        let pool = questions;
        if (selectedType === 'math') {
          pool = questions.filter(q => q.soal.match(/[x+\-\/0-9]/));
        } else if (selectedType === 'typing') {
          pool = questions.filter(q => q.soal.length > 10);
        } else {
          pool = questions.filter(q => q.soal.length <= 15 && !q.soal.match(/[x+\-\/0-9]/));
        }

        if (pool.length === 0) pool = questions;
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        const enemyId = 'enemy_' + Date.now() + Math.random().toString(36).substring(2, 5);

        db.broadcast('game_enemy_spawn', {
          id: enemyId,
          lane,
          type: selectedType,
          soal: chosen.soal,
          jawaban: chosen.jawaban,
          spawnTime: now,
          speed: configRef.current.enemy_speed_base
        });
      }
    }, 200);

    return () => clearInterval(spawnCheckInterval);
  }, [phase, questions]);

  // Main Game Loop — runs at native display refresh rate (60fps)
  // setFrameTick forces React to re-render every frame so enemy
  // positions (computed live from Date.now()) appear silky smooth.
  useEffect(() => {
    let animationFrameId: number;

    const tick = () => {
      const now = Date.now();

      // Force position re-render every frame
      setFrameTick(t => t + 1);

      // ── Projectile collision detection ─────────────────────────────────
      // Check for any projectiles that have reached their target this frame.
      const arrivedProjs = projectilesRef.current.filter(p => now >= p.arrivalTime);
      if (arrivedProjs.length > 0) {
        arrivedProjs.forEach(p => {
          if (handledProjectileIds.current.has(p.id)) return;
          handledProjectileIds.current.add(p.id);

          // Show visual effect (all clients)
          setExplosions(ex => [...ex, {
            id: p.id + '_exp',
            x: p.targetX,
            y: p.targetY,
            time: now,
            type: p.hit ? 'kill' : 'shatter'
          }]);

          // Only the shooter broadcasts the kill
          if (p.hit && p.enemyId && p.firedBy === currentProfile.id) {
            db.broadcast('game_enemy_killed', { enemyId: p.enemyId, playerId: p.firedBy });
          }
        });
        // Remove arrived projectiles from the list
        setProjectiles(prev => prev.filter(p => !handledProjectileIds.current.has(p.id)));
      }

      // Cleanup very old projectiles (safety net) and faded explosions
      setProjectiles(prev => prev.filter(p => now - p.fireTime < 6000));
      setExplosions(prev => prev.filter(ex => now - ex.time < 700));

      // Host checks for breaches
      if (hostRef.current && phaseRef.current === 'active') {
        const currentEnemies = enemiesRef.current;

        currentEnemies.forEach(e => {
          // Skip already-breached enemies (dedup guard to avoid multi-damage per enemy)
          if (breachedEnemyIds.current.has(e.id)) return;

          const secondsActive = (now - e.spawnTime) / 1000;
          const startDistance = 64;
          const speedMultiplier = 3.2;
          const distance = startDistance - secondsActive * e.speed * speedMultiplier;

          // Breach triggers when entering Nexus Core radius (distance <= 10)
          if (distance <= 10) {
            breachedEnemyIds.current.add(e.id);
            const newHpVal = Math.max(0, nexusHpRef.current - 1);
            nexusHpRef.current = newHpVal; // update ref immediately to avoid double-count
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
  }, [currentProfile.id]);

  // Clean up breached set when enemies list updates
  useEffect(() => {
    const activeIds = new Set(enemies.map(e => e.id));
    breachedEnemyIds.current.forEach(id => {
      if (!activeIds.has(id)) breachedEnemyIds.current.delete(id);
    });
  }, [enemies]);

  // Cooldown countdown timer
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
    db.broadcast('game_start_broadcast', { config });
  };

  // Action: Reset Game back to Lobby
  const triggerGameReset = () => {
    playClick();
    db.broadcast('game_reset_broadcast', {});
  };

  // Handle lane click (replaces keyboard 1-8)
  // Re-focuses the input after lane click so player never needs to click the input again.
  const handleLaneClick = (idx: number) => {
    if (phase !== 'active') return;
    setLockedLane(idx);
    playClick();
    // Re-focus input so player can keep typing without clicking the input field
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // Handle Input Submission
  // Projectile flies toward enemy's position at time of firing.
  // On arrival: if correct → enemy killed. If wrong → shatter effect, enemy lives.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phase !== 'active') return;
    if (isCooldownActive) return;

    const answerAttempt = localInput.trim().toLowerCase();
    if (!answerAttempt) return;

    // Find oldest (closest to core) active enemy in lane
    const laneEnemies = enemies
      .filter(en => en.lane === lockedLane && en.status === 'active')
      .sort((a, b) => a.spawnTime - b.spawnTime); // oldest = closest to center
    const targetEnemy = laneEnemies[0];

    const isCorrect = !!(targetEnemy && targetEnemy.jawaban.toLowerCase() === answerAttempt);

    // Calculate target position (enemy pos at time of firing)
    let targetX = 50 + LANES[lockedLane].dx * 64;
    let targetY = 50 + LANES[lockedLane].dy * 64;
    if (targetEnemy) {
      const pos = getEnemyPosition(targetEnemy);
      targetX = pos.x;
      targetY = pos.y;
    }

    // Travel time: projectile covers ~100% board units at 80 units/s
    const dx = targetX - 50;
    const dy = targetY - 50;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const travelMs = Math.max(150, (dist / 80) * 1000);
    const now = Date.now();

    db.broadcast('game_projectile_fired', {
      lane: lockedLane,
      word: answerAttempt,
      playerId: currentProfile.id,
      firedBy: currentProfile.id,
      playerName: currentProfile.name,
      hit: isCorrect,
      enemyId: isCorrect && targetEnemy ? targetEnemy.id : undefined,
      startX: 50,
      startY: 50,
      targetX,
      targetY,
      arrivalTime: now + travelMs
    });

    setLocalInput('');
    // Keep focus on input after submission
    requestAnimationFrame(() => inputRef.current?.focus());

    if (isCorrect) {
      // Start cooldown immediately on fire (not on arrival)
      if (config.player_cooldown_seconds > 0) {
        setCooldownTime(config.player_cooldown_seconds);
        setIsCooldownActive(true);
      }
    } else {
      // Wrong answer flash
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
    db.broadcast('game_blind_lane', { targetPlayerId, laneIndex: targetBlindLane });
  };

  const handleClearBlindLane = () => {
    if (!targetPlayerId) return;
    playClick();
    db.broadcast('game_blind_lane_clear', { targetPlayerId, laneIndex: targetBlindLane });
  };

  // ── UI Calculations ─────────────────────────────────────────────────────────

  // Collect all players' lane assignments for rendering seats
  // Key: laneIdx → sorted list of [profileId]
  const getPlayersInLane = (laneIdx: number): string[] => {
    return Object.entries(playerLanes)
      .filter(([, ln]) => ln === laneIdx)
      .map(([pid]) => pid);
  };

  const isAdmin = currentProfile.role === 'Director' || currentProfile.role === 'Manager';
  const nexusHpPct = config.global_max_hp > 0 ? (nexusHp / config.global_max_hp) * 100 : 0;
  const hpColor = nexusHp <= config.global_max_hp * 0.3 ? '#ef4444' : nexusHp <= config.global_max_hp * 0.6 ? '#f59e0b' : '#22c55e';
  // frameTick is consumed here only to satisfy the reactive dependency; actual usage is via getEnemyPosition
  void frameTick;

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
              <strong className={`text-sm font-bold px-2 py-0.5 rounded border ${
                nexusHp <= config.global_max_hp * 0.3 
                  ? 'text-red-400 bg-red-950/50 border-red-800/40' 
                  : 'text-green-400 bg-green-950/50 border-green-800/40'
              }`}>
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

        {/* 8-WAY RADIAL GAME BOARD — fills available space, capped at 640px */}
        <div className="w-[min(100%,640px)] h-[min(100%,640px)] aspect-square relative mt-4 mb-4 select-none flex-shrink-0">
          
          {/* Circular Orbit Markers */}
          <div className="absolute inset-0 rounded-full border border-slate-900/60 pointer-events-none scale-25" />
          <div className="absolute inset-0 rounded-full border border-slate-900/40 pointer-events-none scale-50" />
          <div className="absolute inset-0 rounded-full border border-slate-900/20 pointer-events-none scale-75" />
          <div className="absolute inset-0 rounded-full border border-[#cca566]/10 pointer-events-none" />

          {/* LANE LINES & CLICK ZONES
              Each lane wrapper is pointer-events-none so they don't steal each other's clicks.
              The thick clickable hit zone on the lane line IS pointer-events-auto.
          */}
          {LANES.map((lane, idx) => {
            const isLocked = lockedLane === idx;
            const isBlind = blindLanes[idx];
            return (
              <div
                key={lane.label}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                {/* Thick clickable lane strip — pointer-events-auto */}
                <div
                  className={`absolute origin-center cursor-pointer group transition-all ${
                    isLocked
                      ? 'opacity-100 z-20'
                      : 'opacity-70 hover:opacity-90'
                  }`}
                  style={{
                    width: '45%',
                    height: '24px',
                    transform: `rotate(${lane.angle - 90}deg) translate(50%)`,
                    pointerEvents: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'stretch',
                  }}
                  onClick={() => handleLaneClick(idx)}
                >
                  {/* Visual lane line inside the hit zone */}
                  <div
                    className={`w-full transition-all ${
                      isLocked
                        ? 'h-[2px] bg-gradient-to-r from-transparent via-[#ffd700] to-[#ffd700] shadow-[0_0_12px_#ffae00]'
                        : 'h-[1px] bg-slate-800/40 group-hover:bg-[#cca566]/40'
                    }`}
                  />
                </div>

                {/* Outer Direction Label Button */}
                <div
                  className="absolute"
                  style={{
                    transform: `rotate(${lane.angle - 90}deg) translate(220px) rotate(${90 - lane.angle}deg)`,
                    pointerEvents: 'auto'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleLaneClick(idx)}
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
                      transform: `rotate(${lane.angle - 90}deg) translate(130px) rotate(${90 - lane.angle}deg)`,
                      pointerEvents: 'none'
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

          {/* SITTING PLAYERS — rendered per lane with perpendicular offset */}
          {LANES.map((lane, laneIdx) => {
            const playersHere = getPlayersInLane(laneIdx);
            const totalInLane = playersHere.length;
            return playersHere.map((playerId, slotIdx) => {
              // Center the group around the lane midpoint
              const centeredSlot = slotIdx - (totalInLane - 1) / 2;
              const seatPos = (() => {
                // Place characters very close to center — inside the enlarged core circle
                const SEAT_DIST = 8;
                const SLOT_SPACING = 5;
                const perpX = -lane.dy;
                const perpY = lane.dx;
                return {
                  x: 50 + lane.dx * SEAT_DIST + perpX * centeredSlot * SLOT_SPACING,
                  y: 50 + lane.dy * SEAT_DIST + perpY * centeredSlot * SLOT_SPACING
                };
              })();

              const profile = profiles.find(p => p.id === playerId) || (playerId === currentProfile.id ? currentProfile : null);
              if (!profile) return null;
              const isMe = playerId === currentProfile.id;

              return (
                <div
                  key={`player-${playerId}`}
                  className="absolute z-35 flex flex-col items-center pointer-events-none"
                  style={{
                    left: `${seatPos.x}%`,
                    top: `${seatPos.y}%`,
                    transform: 'translate(-50%, -50%)'
                  }}
                >
                  {/* Character — no rotation, always faces forward */}
                  <SpriteRenderer
                    base={profile.sprite_json?.base || 'base_1'}
                    hair={profile.sprite_json?.hair || 'hair_default'}
                    outfit={profile.sprite_json?.outfit || 'outfit_blue'}
                    accessory={profile.sprite_json?.accessory || 'none'}
                    petId={profile.pet_id || 'none'}
                    size={isMe ? 28 : 22}
                  />
                  {/* Name tag */}
                  <div className={`mt-0.5 px-1.5 py-0.5 rounded text-[7px] font-bold font-mono shadow-md border ${
                    isMe
                      ? 'bg-yellow-900/80 border-yellow-500/50 text-yellow-200'
                      : 'bg-slate-900/80 border-slate-600/30 text-slate-300'
                  }`}>
                    {isMe ? '★ ' : ''}{profile.name.split(' ')[0]}
                  </div>
                </div>
              );
            });
          })}

          {/* NEXUS CORE HP BAR — positioned above the bigger core */}
          <div
            className="absolute z-40 flex flex-col items-center pointer-events-none"
            style={{
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -155%)'
            }}
          >
            <div className="text-[8px] font-mono font-bold text-slate-400 mb-0.5 tracking-wider">
              CORE HP
            </div>
            <div className="w-28 h-3 bg-slate-900 border border-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${nexusHpPct}%`, backgroundColor: hpColor }}
              />
            </div>
            <div className="text-[9px] font-mono font-extrabold mt-0.5" style={{ color: hpColor }}>
              {nexusHp}/{config.global_max_hp}
            </div>
          </div>

          {/* The Nexus (Center Core) — enlarged so players can sit inside.
              coreShaking is triggered on nexus damage for tactile feedback. */}
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border-4 border-[#cca566] bg-slate-950 flex flex-col items-center justify-center shadow-xl shadow-black z-30 select-none transition-transform ${
            coreShaking ? 'animate-[shake_0.4s_ease-out]' : ''
          }`}>
            <div className={`absolute inset-1 rounded-full border border-dashed border-amber-500/40 animate-[spin_30s_linear_infinite]`}></div>
            <div className="z-10 flex flex-col items-center">
              <Shield className={`w-10 h-10 text-amber-500 ${phase === 'active' ? 'animate-pulse' : ''}`} />
              <span className="text-[8px] font-mono font-extrabold tracking-wider text-slate-400 mt-1">NEXUS</span>
            </div>
            {/* Health glow ring */}
            <div
              className="absolute inset-0 rounded-full transition-all duration-300"
              style={{
                boxShadow: `inset 0 0 25px rgba(${nexusHp < config.global_max_hp * 0.3 ? '220, 38, 38' : '34, 197, 94'}, 0.4)`,
                border: `2px solid rgba(${nexusHp < config.global_max_hp * 0.3 ? '220, 38, 38' : '34, 197, 94'}, 0.2)`
              }}
            />
          </div>

          {/* ENEMIES RENDER */}
          {enemies.map((e) => {
            const pos = getEnemyPosition(e);
            const progress = pos.progress ?? 0;
            const isLaneBlind = blindLanes[e.lane];
            const isTargeted = lockedLane === e.lane;
            // Warn player when enemy is very close — fade slightly as it enters core
            const nearCore = progress > 88;
            const fadeOpacity = nearCore ? Math.max(0.3, 1 - (progress - 88) / 20) : 1;
            
            return (
              <div
                key={e.id}
                className={`absolute -translate-x-1/2 -translate-y-1/2 group flex flex-col items-center cursor-default transition-opacity ${
                  isTargeted ? 'z-50 scale-105' : 'z-45 scale-95 hover:z-50 hover:opacity-100 hover:scale-100'
                } ${nearCore ? 'animate-pulse' : ''}`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%`, opacity: fadeOpacity }}
              >
                {/* Speech Bubble / Soal Text */}
                <div className={`relative px-2.5 py-1.5 rounded-lg border shadow-lg max-w-[160px] w-max text-center font-bold text-[9px] mb-1 font-mono transition-colors ${
                  nearCore
                    ? 'bg-red-950 border-red-500 text-red-300 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                    : isTargeted 
                      ? 'bg-slate-900 border-yellow-400 text-yellow-300 shadow-[0_0_8px_rgba(253,224,71,0.25)]' 
                      : 'bg-slate-950/90 border-[#cca566]/20 text-[#cca566]'
                }`}>
                  {isLaneBlind ? (
                    <span className="text-red-500 flex items-center gap-1 animate-pulse">
                      <Cloud size={10} className="text-stone-500 fill-stone-500/20" />
                      TANYA TEMAN!
                    </span>
                  ) : (
                    // Full soal — no truncation. Wider card handles long text.
                    <span>{e.soal}</span>
                  )}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900" />
                </div>

                {/* Enemy Sprite */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${
                  e.type === 'hafalan' ? 'bg-indigo-950/60 border-indigo-500 text-indigo-300' :
                  e.type === 'math' ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300' :
                  'bg-rose-950/60 border-rose-500 text-rose-300'
                } ${isTargeted ? 'ring-2 ring-yellow-400/50 scale-110' : ''}`}>
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
            const fraction = Math.min(1, (Date.now() - p.fireTime) / Math.max(1, p.arrivalTime - p.fireTime));
            return (
              <div
                key={p.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-25 flex items-center justify-center pointer-events-none"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                <div
                  className={`rounded-full shadow-[0_0_10px_currentColor] ${p.hit ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5 opacity-70'}`}
                  style={{ color: p.color, backgroundColor: p.color }}
                />
                {/* Word label fades out as projectile approaches target */}
                {fraction < 0.7 && (
                  <span className="absolute bottom-full mb-1 text-[8px] font-bold font-mono px-1 rounded bg-black/80 text-yellow-300 border border-yellow-400/20 shadow-md whitespace-nowrap">
                    {p.word}
                  </span>
                )}
              </div>
            );
          })}

          {/* EXPLOSIONS RENDER — kill (orange) and shatter (blue) */}
          {explosions.map((ex) => {
            const age = Date.now() - ex.time;
            const fadeOut = Math.max(0, 1 - age / 700);
            return (
              <div
                key={ex.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-25 pointer-events-none"
                style={{ left: `${ex.x}%`, top: `${ex.y}%`, opacity: fadeOut }}
              >
                {ex.type === 'shatter' ? (
                  // Wrong answer — blue shatter burst
                  <div className="relative flex items-center justify-center w-10 h-10">
                    <div className="absolute w-8 h-8 rounded-full border-2 border-blue-400 animate-ping" style={{ animationDuration: '0.5s' }} />
                    <span className="text-blue-300 text-sm font-black select-none">✕</span>
                  </div>
                ) : (
                  // Correct kill — orange/red explosion
                  <div className="w-12 h-12 rounded-full border-2 border-red-500/80 bg-red-600/30 animate-[ping_0.3s_ease-out_forwards] flex items-center justify-center">
                    <span className="text-red-400 text-xs font-black animate-pulse">💥</span>
                  </div>
                )}
              </div>
            );
          })}

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
                <span className="text-[9px] text-slate-500">Klik lintasan untuk pindah</span>
              </div>

              <div className="relative">
                <input
                  id="typing-defense-input"
                  ref={inputRef}
                  type="text"
                  autoFocus
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

                {isCooldownActive && (
                  <div className="absolute bottom-0 left-0 h-1 bg-amber-500 transition-all duration-100 rounded-b-lg"
                       style={{ width: `${(cooldownTime / config.player_cooldown_seconds) * 100}%` }} />
                )}
              </div>
            </form>
          ) : (
            <div className="text-center py-4 bg-slate-950/60 p-4 border border-[#cca566]/20 rounded-lg">
              {phase === 'lobby' && (
                <div>
                  <p className="text-[10px] text-slate-400 mb-3 font-mono leading-relaxed">
                    Siapkan tim Anda untuk bertahan! Klik lintasan di grid untuk memilih posisi duduk Anda. Parameter game diatur melalui Dashboard Administrasi di sebelah kanan.
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
                <label className="text-[9px] text-slate-400">KECEPATAN DASAR MUSUH:</label>
                <input
                  type="number" step="0.1" min="0.1" max="5"
                  value={config.enemy_speed_base}
                  onChange={(e) => setConfig(prev => ({ ...prev, enemy_speed_base: Number(e.target.value) }))}
                  className="bg-black/60 text-yellow-100 border border-[#cca566]/30 px-2.5 py-1.5 rounded focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400">DURASI PERMAINAN (detik):</label>
                <input
                  type="number" min="10" max="600"
                  value={config.game_duration_seconds}
                  onChange={(e) => setConfig(prev => ({ ...prev, game_duration_seconds: Number(e.target.value) }))}
                  className="bg-black/60 text-yellow-100 border border-[#cca566]/30 px-2.5 py-1.5 rounded focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400">INTERVAL SPAWN (detik) — misal 0.25 = spawn tiap 250ms:</label>
                <input
                  type="number" step="0.05" min="0.05" max="10"
                  value={config.spawn_rate_per_second}
                  onChange={(e) => setConfig(prev => ({ ...prev, spawn_rate_per_second: Number(e.target.value) }))}
                  className="bg-black/60 text-yellow-100 border border-[#cca566]/30 px-2.5 py-1.5 rounded focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400">KAPASITAS HP NEXUS:</label>
                <input
                  type="number" min="1" max="100"
                  value={config.global_max_hp}
                  onChange={(e) => setConfig(prev => ({ ...prev, global_max_hp: Number(e.target.value) }))}
                  className="bg-black/60 text-yellow-100 border border-[#cca566]/30 px-2.5 py-1.5 rounded focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400">COOLDOWN MENGETIK PEMAIN (detik):</label>
                <input
                  type="number" step="0.1" min="0" max="10"
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
                    type="range" min="0" max="100"
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
                <div className="flex flex-col gap-2">
                  <div className="bg-green-950/30 border border-green-800/40 p-2 rounded text-[8px] text-green-400 font-mono text-center select-none animate-pulse">
                    ✓ ANDA BERTINDAK SEBAGAI HOST (MENGELOLA SPAWNING DAN STATE GAME)
                  </div>
                  <button
                    type="button"
                    onClick={triggerGameReset}
                    className="w-full py-2 bg-red-950/60 hover:bg-red-900/60 border border-red-500/40 text-red-200 font-bold text-[10px] rounded transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider font-mono"
                  >
                    <RotateCcw size={12} className="text-red-400" />
                    RESET GAME KE LOBBY
                  </button>
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

            <form onSubmit={handleAddQuestion} className="flex flex-col gap-2 bg-black/40 p-2.5 border border-[#cca566]/20 rounded-lg">
              <div className="flex flex-col gap-0.5">
                <label className="text-[8px] text-slate-400 uppercase font-bold">Soal / Pertanyaan:</label>
                <input
                  type="text" required
                  placeholder="Contoh: Ibu kota jepang?"
                  value={newSoal}
                  onChange={(e) => setNewSoal(e.target.value)}
                  className="bg-black/60 text-yellow-100 border border-[#cca566]/30 px-2 py-1 rounded text-[9.5px] placeholder:text-stone-600"
                />
              </div>

              <div className="flex flex-col gap-0.5">
                <label className="text-[8px] text-slate-400 uppercase font-bold">Kunci Jawaban (1 Kata):</label>
                <input
                  type="text" required
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
