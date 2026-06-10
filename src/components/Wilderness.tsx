import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Profile, WildernessRaidState, RaiderState, RaidComment, BossConfig } from '../lib/supabase';
import type { Seat } from '../lib/supabase';
import { db } from '../lib/supabase';
import { SpriteRenderer } from './SpriteRenderer';

import {
  Sword, Heart, Zap, Trophy, Clock, Upload,
  Save, RotateCcw, Shield, X, MessageSquare,
  Users, Skull, Swords
} from 'lucide-react';
import { playClick, playSelect, playLevelUp, playVote } from '../lib/audio';

// ─── Constants ────────────────────────────────────────────────────────────────
const RAIDER_MAX_HP = 100;
const ENERGY_PER_COMMENT = 10;
const ATTACK_COST = 10;
const HEAL_COST = 20;
const DEBUFF_COST = 50;
const ATTACK_BOSS_DAMAGE = 10;
const HEAL_AMOUNT = 10;
const DEBUFF_DURATION_SEC = 25;
const COMMENT_COOLDOWN_MS = 2000;

const DEFAULT_BOSS_CONFIG: BossConfig = {
  name: 'Dragon of Stagnation',
  gifBase64: '',
  question: 'Apa ide kreatif kalian untuk proyek workshop selanjutnya?',
  maxHp: 300,
  damage: 20,
  attackSpeed: 5,
  raidDuration: 300,
  winLevelReward: 1,
  lossCoinPenalty: 10,
};

interface BossPreset {
  id: string;
  presetName: string;
  config: BossConfig;
}

interface WildernessProps {
  currentProfile: Profile;
  profiles: Profile[];
  onUpdateProfile: (updates: Partial<Profile>) => void;
  onSeatClick?: (seatId: string, isLeave: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export const Wilderness: React.FC<WildernessProps> = ({
  currentProfile,
  profiles,
  onUpdateProfile,
  onSeatClick,
}) => {
  // State
  const [raidState, setRaidState] = useState<WildernessRaidState | null>(null);
  const seats = React.useMemo(() => db.getSeatsSync('wilderness', profiles), [profiles]);

  const autoSeatRef = useRef(false);
  useEffect(() => {
    if (profiles.length > 0 && !autoSeatRef.current && currentProfile) {
      autoSeatRef.current = true;
      const myProfile = profiles.find(p => p.id === currentProfile.id);
      const currentSeat = myProfile?.current_seat_id;
      const isSeatedInThisRoom = currentSeat && currentSeat.startsWith('wilderness');
      
      if (!isSeatedInThisRoom) {
        const chairs = seats;
        const availableChairs = chairs.filter(s => !s.user_id);
        
        if (availableChairs.length > 0) {
          const randomSeat = availableChairs[Math.floor(Math.random() * availableChairs.length)];
          if (onSeatClick) {
            onSeatClick(randomSeat.id, false);
          } else {
            db.claimSeat('wilderness', randomSeat.id, currentProfile.id);
          }
        } else {
          const overflowSeatId = `wilderness_overflow_${currentProfile.id}`;
          if (onSeatClick) {
            onSeatClick(overflowSeatId, false);
          } else {
            db.claimSeat('wilderness', overflowSeatId, currentProfile.id);
          }
        }
      }
    }
  }, [profiles, currentProfile]);

  const [comments, setComments] = useState<RaidComment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [commentCooldown, setCommentCooldown] = useState(false);
  const [bossGifDisplay, setBossGifDisplay] = useState<string>('');

  // Config form state (Director/Manager)
  const [editConfig, setEditConfig] = useState<BossConfig>(DEFAULT_BOSS_CONFIG);
  const [presets, setPresets] = useState<BossPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [gifUploadError, setGifUploadError] = useState('');

  // Refs (prevent stale closures)
  const raidStateRef = useRef<WildernessRaidState | null>(null);
  const currentProfileRef = useRef(currentProfile);
  const onUpdateProfileRef = useRef(onUpdateProfile);
  const cachedGifRef = useRef<string>('');
  const bossAttackIntervalRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);
  const lastCommentTimeRef = useRef<number>(0);
  const raidEndedRef = useRef(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Keep refs fresh
  useEffect(() => { currentProfileRef.current = currentProfile; }, [currentProfile]);
  useEffect(() => { onUpdateProfileRef.current = onUpdateProfile; }, [onUpdateProfile]);

  // Computed helpers
  const isDirectorOrManager = currentProfile.role === 'Director' || currentProfile.role === 'Manager';
  
  const seatedManagers = React.useMemo(() => {
    return seats
      .filter(s => s.user_id !== null)
      .map(s => profiles.find(p => p.id === s.user_id))
      .filter((p): p is Profile => !!p && (p.role === 'Director' || p.role === 'Manager'))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [seats, profiles]);

  const isBossHost = seatedManagers.length > 0 && seatedManagers[0].id === currentProfile.id;
  const isBossHostRef = useRef(false);
  useEffect(() => {
    isBossHostRef.current = isBossHost;
  }, [isBossHost]);

  const phase = raidState?.phase ?? 'lobby';
  const myRaider = raidState?.raiders.find(r => r.profileId === currentProfile.id);
  const amISitting = seats.some(s => s.user_id === currentProfile.id);
  const amIRaider = !!myRaider;
  const amIAlive = myRaider?.alive ?? false;
  const myEnergy = myRaider?.energy ?? 0;
  const isDebuffed = (raidState?.bossDebuffUntil ?? 0) > Date.now();

  // Action cost checks
  const canAttack = amIAlive && myEnergy >= ATTACK_COST;
  const canHeal = amIAlive && myEnergy >= HEAL_COST;
  const canDebuff = amIAlive && myEnergy >= DEBUFF_COST;

  // Auto-scroll comments
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  // ─── Apply reward to current user ─────────────────────────────────────────
  const applyRewardToSelf = useCallback((
    result: 'win' | 'lose' | 'draw',
    raiders: RaiderState[],
    bossConfig: Omit<BossConfig, 'gifBase64'>
  ) => {
    const profile = currentProfileRef.current;
    const myRaiderResult = raiders.find(r => r.profileId === profile.id);
    if (!myRaiderResult) return; // not a participant

    if (result === 'win') {
      const sorted = [...raiders].sort((a, b) => b.commentCount - a.commentCount);
      const rank = sorted.findIndex(r => r.profileId === profile.id);
      const multiplier = rank === 0 ? 3 : rank === 1 ? 2 : rank === 2 ? 1.5 : 1;
      const levelGain = Math.round(bossConfig.winLevelReward * multiplier);
      onUpdateProfileRef.current({ level: profile.level + levelGain });
      playLevelUp();
    } else if (result === 'lose') {
      const newCoins = Math.max(0, (profile.coins || 0) - bossConfig.lossCoinPenalty);
      onUpdateProfileRef.current({ coins: newCoins });
    } else {
      const drawLevel = Math.floor(bossConfig.winLevelReward / 3);
      if (drawLevel > 0) {
        onUpdateProfileRef.current({ level: profile.level + drawLevel });
      }
    }
  }, []);

  // ─── Initial load ─────────────────────────────────────────────────────────
  const loadInitialData = useCallback(async () => {
    const [stateData, commentsData] = await Promise.all([
      db.getRaidState(),
      db.getRaidComments(),
    ]);

    if (stateData) {
      if (stateData.bossConfig.gifBase64) {
        cachedGifRef.current = stateData.bossConfig.gifBase64;
        setBossGifDisplay(stateData.bossConfig.gifBase64);
      }
      setRaidState(stateData);
      raidStateRef.current = stateData;
      setEditConfig(stateData.bossConfig);
      if (stateData.phase === 'active') {
        setTimeRemaining(Math.max(0, Math.floor((stateData.endsAt - Date.now()) / 1000)));
      }
      if (stateData.phase === 'ended') setShowResult(true);
    }
    setComments(commentsData);

    const presetsData: BossPreset[] = JSON.parse(localStorage.getItem('rpg_boss_presets') || '[]');
    setPresets(presetsData);
  }, []);

  // ─── Broadcast subscription ────────────────────────────────────────────────
  useEffect(() => {
    loadInitialData().then(() => {
      if (raidStateRef.current?.phase === 'active') {
        db.broadcast('wilderness_request_sync', {});
      }
    });

    const unsubscribe = db.subscribe((msg) => {
      if (msg.type === 'wilderness_request_sync') {
        if (isBossHostRef.current && raidStateRef.current) {
          db.broadcast('wilderness_sync', { state: raidStateRef.current });
        }
      }

      else if (msg.type === 'wilderness_sync') {
        const incoming = msg.payload.state as WildernessRaidState;
        if (incoming && incoming.phase === 'active') {
          const merged: WildernessRaidState = {
            ...incoming,
            bossConfig: { ...incoming.bossConfig, gifBase64: cachedGifRef.current || incoming.bossConfig.gifBase64 },
          };
          setRaidState(merged);
          raidStateRef.current = merged;
          setTimeRemaining(Math.max(0, Math.floor((merged.endsAt - Date.now()) / 1000)));
        }
      }

      // When Director starts raid — fetch full state (with GIF) from DB
      else if (msg.type === 'wilderness_start') {
        db.getRaidState().then(state => {
          if (!state) return;
          if (state.bossConfig.gifBase64) {
            cachedGifRef.current = state.bossConfig.gifBase64;
            setBossGifDisplay(state.bossConfig.gifBase64);
          }
          setRaidState(state);
          raidStateRef.current = state;
          raidEndedRef.current = false;
          setShowResult(false);
          setTimeRemaining(Math.max(0, Math.floor((state.endsAt - Date.now()) / 1000)));
        });
      }

      // Lightweight state sync (no GIF in payload) — merge with cached GIF
      else if (msg.type === 'wilderness_state_update') {
        const incoming = msg.payload.state;
        const merged: WildernessRaidState = {
          ...incoming,
          bossConfig: { ...incoming.bossConfig, gifBase64: cachedGifRef.current },
        };
        setRaidState(merged);
        raidStateRef.current = merged;
      }

      // New comment: add to list + award energy
      else if (msg.type === 'wilderness_comment_add') {
        const comment = msg.payload.comment as RaidComment;
        setComments(prev =>
          prev.some(c => c.id === comment.id) ? prev : [...prev, comment]
        );
        if (raidStateRef.current?.phase === 'active') {
          setRaidState(prev => {
            if (!prev) return prev;
            const newState: WildernessRaidState = {
              ...prev,
              raiders: prev.raiders.map(r =>
                r.profileId === comment.authorId
                  ? { ...r, energy: r.energy + ENERGY_PER_COMMENT, commentCount: r.commentCount + 1 }
                  : r
              ),
            };
            raidStateRef.current = newState;
            return newState;
          });
        }
      }

      else if (msg.type === 'wilderness_comments_clear') {
        setComments([]);
      }

      // Player action (attack / heal / debuff) — all clients apply
      else if (msg.type === 'wilderness_action') {
        const { type, profileId, energyCost } = msg.payload;
        setRaidState(prev => {
          if (!prev || prev.phase !== 'active') return prev;
          const now = Date.now();
          const debuffed = prev.bossDebuffUntil > now;
          const attackDmg = debuffed ? ATTACK_BOSS_DAMAGE * 2 : ATTACK_BOSS_DAMAGE;

          let newBossHp = prev.bossHp;
          let newRaiders = prev.raiders;
          let newDebuffUntil = prev.bossDebuffUntil;

          if (type === 'attack') {
            newBossHp = Math.max(0, prev.bossHp - attackDmg);
          } else if (type === 'heal') {
            newRaiders = prev.raiders.map(r => ({
              ...r, hp: r.alive ? Math.min(RAIDER_MAX_HP, r.hp + HEAL_AMOUNT) : r.hp,
            }));
          } else if (type === 'debuff') {
            newDebuffUntil = now + DEBUFF_DURATION_SEC * 1000;
          }

          // Deduct energy from acting player
          newRaiders = newRaiders.map(r =>
            r.profileId === profileId ? { ...r, energy: Math.max(0, r.energy - energyCost) } : r
          );

          const newState = { ...prev, bossHp: newBossHp, raiders: newRaiders, bossDebuffUntil: newDebuffUntil };
          raidStateRef.current = newState;
          return newState;
        });
      }

      // Boss attacks — all clients reduce raider HP
      else if (msg.type === 'wilderness_boss_attack') {
        const { damage } = msg.payload;
        setRaidState(prev => {
          if (!prev || prev.phase !== 'active') return prev;
          const newRaiders = prev.raiders.map(r => {
            if (!r.alive) return r;
            const newHp = Math.max(0, r.hp - damage);
            return { ...r, hp: newHp, alive: newHp > 0 };
          });
          const newState = { ...prev, raiders: newRaiders };
          raidStateRef.current = newState;
          return newState;
        });
      }

      // Game over — all clients receive result
      else if (msg.type === 'wilderness_end') {
        const { result, raiders, bossConfig } = msg.payload;
        clearInterval(bossAttackIntervalRef.current);
        clearInterval(timerIntervalRef.current);
        setRaidState(prev => {
          const finalState: WildernessRaidState = {
            ...(prev ?? {
              phase: 'ended', bossHp: 0, bossDebuffUntil: 0,
              startedAt: 0, endsAt: 0, raiders,
              bossConfig: { ...bossConfig, gifBase64: cachedGifRef.current },
            }),
            phase: 'ended',
            result,
            raiders,
            bossConfig: { ...bossConfig, gifBase64: cachedGifRef.current },
          };
          raidStateRef.current = finalState;
          return finalState;
        });
        setShowResult(true);
        applyRewardToSelf(result, raiders, bossConfig);
      }

      // Reset to lobby
      else if (msg.type === 'wilderness_reset') {
        clearInterval(bossAttackIntervalRef.current);
        clearInterval(timerIntervalRef.current);
        setRaidState(null);
        raidStateRef.current = null;
        raidEndedRef.current = false;
        setShowResult(false);
        setTimeRemaining(0);
      }
    });

    return () => {
      unsubscribe();
      clearInterval(bossAttackIntervalRef.current);
      clearInterval(timerIntervalRef.current);
    };
  }, [loadInitialData, applyRewardToSelf]);

  // ─── Timer countdown ───────────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(timerIntervalRef.current);
    if (raidState?.phase !== 'active' || !raidState.endsAt) return;
    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining(Math.max(0, Math.floor((raidState.endsAt - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(timerIntervalRef.current);
  }, [raidState?.phase, raidState?.endsAt]);

  // ─── Boss attack interval (Authoritative Boss Host only) ───────────────────
  useEffect(() => {
    clearInterval(bossAttackIntervalRef.current);
    if (raidState?.phase !== 'active' || !isBossHost) return;
    const speedMs = Math.max(1000, (raidState.bossConfig.attackSpeed || 5) * 1000);
    bossAttackIntervalRef.current = setInterval(() => {
      if (raidStateRef.current?.phase !== 'active') {
        clearInterval(bossAttackIntervalRef.current);
        return;
      }
      db.broadcast('wilderness_boss_attack', { damage: raidStateRef.current.bossConfig.damage });
    }, speedMs);
    return () => clearInterval(bossAttackIntervalRef.current);
  }, [raidState?.phase, isBossHost]);

  // ─── Win check (boss HP ≤ 0) ──────────────────────────────────────────────
  useEffect(() => {
    if (!raidState || raidState.phase !== 'active' || !isBossHost) return;
    if (raidState.bossHp <= 0) sendEndRaid('win');
  }, [raidState?.bossHp, isBossHost]);

  // ─── Lose check (all raiders dead) ────────────────────────────────────────
  useEffect(() => {
    if (!raidState || raidState.phase !== 'active' || !isBossHost) return;
    if (raidState.raiders.length > 0 && raidState.raiders.every(r => !r.alive)) sendEndRaid('lose');
  }, [raidState?.raiders, isBossHost]);

  // ─── Draw check (timer expired) ───────────────────────────────────────────
  useEffect(() => {
    if (!raidState || raidState.phase !== 'active' || !isBossHost) return;
    if (timeRemaining <= 0 && raidState.endsAt > 0 && Date.now() >= raidState.endsAt) sendEndRaid('draw');
  }, [timeRemaining, isBossHost]);

  // ─── Send end-of-raid event (Director/Manager only, runs once) ────────────
  const sendEndRaid = async (result: 'win' | 'lose' | 'draw') => {
    if (!raidStateRef.current || raidStateRef.current.phase !== 'active') return;
    if (raidEndedRef.current) return;
    raidEndedRef.current = true;

    clearInterval(bossAttackIntervalRef.current);
    clearInterval(timerIntervalRef.current);

    const finalState: WildernessRaidState = { ...raidStateRef.current, phase: 'ended', result };
    await db.saveRaidState(finalState);

    const { gifBase64: _g, ...configNoGif } = finalState.bossConfig;
    db.broadcast('wilderness_end', { result, raiders: finalState.raiders, bossConfig: configNoGif });
  };

  // ─── Start Raid ───────────────────────────────────────────────────────────
  const handleStartRaid = async () => {
    if (!isDirectorOrManager) return;
    const seated = seats.filter(s => s.user_id !== null);
    if (seated.length === 0) {
      alert('Belum ada raider yang duduk! Minta staf duduk di kursi Wilderness terlebih dahulu.');
      return;
    }
    playVote();

    const raiders: RaiderState[] = seated.map(s => ({
      profileId: s.user_id!,
      hp: RAIDER_MAX_HP,
      energy: 0,
      commentCount: 0,
      alive: true,
    }));

    const now = Date.now();
    const newState: WildernessRaidState = {
      phase: 'active',
      bossConfig: { ...editConfig },
      bossHp: editConfig.maxHp,
      bossDebuffUntil: 0,
      raiders,
      startedAt: now,
      endsAt: now + editConfig.raidDuration * 1000,
    };

    cachedGifRef.current = editConfig.gifBase64;
    setBossGifDisplay(editConfig.gifBase64);
    raidEndedRef.current = false;
    setRaidState(newState);
    raidStateRef.current = newState;
    setTimeRemaining(editConfig.raidDuration);

    await db.saveRaidState(newState);
    db.broadcast('wilderness_start', {}); // signals other clients to load from DB
  };

  // ─── Reset to lobby ───────────────────────────────────────────────────────
  const handleResetRaid = async () => {
    if (!isDirectorOrManager) return;
    playClick();
    clearInterval(bossAttackIntervalRef.current);
    clearInterval(timerIntervalRef.current);

    const lobbyState: WildernessRaidState = {
      phase: 'lobby',
      bossConfig: { ...editConfig },
      bossHp: editConfig.maxHp,
      bossDebuffUntil: 0,
      raiders: [],
      startedAt: 0,
      endsAt: 0,
    };

    setRaidState(lobbyState);
    raidStateRef.current = lobbyState;
    raidEndedRef.current = false;
    setShowResult(false);

    await db.saveRaidState(lobbyState);
    db.broadcast('wilderness_reset', {});
  };

  // ─── Player action ────────────────────────────────────────────────────────
  const handleAction = (type: 'attack' | 'heal' | 'debuff') => {
    if (!raidState || raidState.phase !== 'active' || !amISitting || !amIAlive) return;
    const costMap = { attack: ATTACK_COST, heal: HEAL_COST, debuff: DEBUFF_COST };
    const energyCost = costMap[type];
    if (myEnergy < energyCost) return;
    playClick();
    db.broadcast('wilderness_action', { type, profileId: currentProfile.id, energyCost });
  };

  // ─── Send comment ─────────────────────────────────────────────────────────
  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = commentInput.trim();
    if (!text) return;
    const now = Date.now();
    if (now - lastCommentTimeRef.current < COMMENT_COOLDOWN_MS) return;
    lastCommentTimeRef.current = now;

    setCommentInput('');
    setCommentCooldown(true);
    setTimeout(() => setCommentCooldown(false), COMMENT_COOLDOWN_MS);

    await db.addRaidComment(text, currentProfile.id, currentProfile.name);
    playSelect();
  };

  // ─── Seat click ───────────────────────────────────────────────────────────
  const handleSeatClick = async (seat: Seat) => {
    if (raidState?.phase === 'active') return;
    playSelect();
    const isLeave = seat.user_id === currentProfile.id;
    if (onSeatClick) {
      onSeatClick(seat.id, isLeave);
    } else {
      if (isLeave) {
        await db.leaveSeat(currentProfile.id);
      } else if (!seat.user_id) {
        await db.claimSeat('wilderness', seat.id, currentProfile.id);
      }
    }
  };

  // ─── Quick join/leave ─────────────────────────────────────────────────────
  const handleQuickSeat = async () => {
    if (raidState?.phase === 'active') return;
    if (amISitting) {
      if (onSeatClick) {
        const mySeat = seats.find(s => s.user_id === currentProfile.id);
        if (mySeat) onSeatClick(mySeat.id, true);
      } else {
        await db.leaveSeat(currentProfile.id);
      }
    } else {
      const empty = seats.find(s => !s.user_id);
      if (empty) {
        if (onSeatClick) {
          onSeatClick(empty.id, false);
        } else {
          await db.claimSeat('wilderness', empty.id, currentProfile.id);
        }
      }
    }
  };

  // ─── GIF Upload ───────────────────────────────────────────────────────────
  const handleGifUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGifUploadError('');
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setGifUploadError('GIF terlalu besar! Maksimal 4MB untuk pixel art.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const b64 = evt.target?.result as string;
      setEditConfig(p => ({ ...p, gifBase64: b64 }));
      cachedGifRef.current = b64;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ─── Preset management ────────────────────────────────────────────────────
  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    playClick();
    const np: BossPreset = { id: Date.now().toString(), presetName: presetName.trim(), config: { ...editConfig } };
    const updated = [...presets, np];
    setPresets(updated);
    localStorage.setItem('rpg_boss_presets', JSON.stringify(updated));
    setPresetName('');
  };
  const handleLoadPreset = (id: string) => {
    const p = presets.find(x => x.id === id);
    if (!p) return;
    playSelect();
    setEditConfig({ ...p.config });
    if (p.config.gifBase64) cachedGifRef.current = p.config.gifBase64;
  };
  const handleDeletePreset = (id: string) => {
    playClick();
    const updated = presets.filter(x => x.id !== id);
    setPresets(updated);
    localStorage.setItem('rpg_boss_presets', JSON.stringify(updated));
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };
  const getProfile = (id: string) => profiles.find(p => p.id === id);

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-[#120505] text-white animate-fade-in" style={{ minHeight: '100%' }}>

      {/* ─ Header ─ */}
      <div className="flex items-center justify-between px-5 py-3 bg-[#0d0202] border-b-2 border-[#3a1010] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-red-955/40 border border-red-800/40 flex items-center justify-center">
            <Swords className="text-red-400" size={18} />
          </div>
          <div>
            <h2 className="rpg-font-retro text-amber-500 text-sm leading-none">WILDERNESS</h2>
            <p className="text-xs text-red-400 font-mono mt-1">
              {phase === 'lobby' && 'LOBBY — Duduk untuk bergabung sebagai raider'}
              {phase === 'active' && `RAID AKTIF — Boss: ${raidState?.bossConfig.name}`}
              {phase === 'ended' && `RAID SELESAI — ${raidState?.result === 'win' ? 'MENANG' : raidState?.result === 'lose' ? 'KALAH' : 'SERI'}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {phase === 'active' && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-base font-bold ${
              timeRemaining < 60
                ? 'text-red-400 border-red-750 bg-red-955/45 animate-pulse'
                : 'text-amber-400 border-amber-800 bg-amber-955/40'
            }`}>
              <Clock size={14} />
              {formatTime(timeRemaining)}
            </div>
          )}
          {phase !== 'active' && (
            <button
              onClick={handleQuickSeat}
              className={`rpg-btn-game text-xs px-3 py-1.5 flex items-center gap-1.5 ${
                amISitting ? 'border-red-700 text-red-400 hover:bg-red-950/40' : 'border-amber-705 text-amber-400 hover:bg-amber-950/40'
              }`}
            >
              {amISitting ? <><X size={12} /> Tinggalkan</> : <><Users size={12} /> Bergabung</>}
            </button>
          )}
          {isDirectorOrManager && phase !== 'lobby' && (
            <button onClick={handleResetRaid} className="rpg-btn-game text-xs px-3 py-1.5 flex items-center gap-1.5 border-red-700 text-red-400 hover:bg-red-950/40">
              <RotateCcw size={12} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* ─ Boss Zone (active phase only) ─ */}
      {phase === 'active' && raidState && (
        <div className="flex-shrink-0 bg-gradient-to-b from-[#2d0909] to-[#1a0505] border-b-2 border-red-900/60 px-5 py-4 flex items-center gap-6 animate-fade-in">
          {/* Boss GIF */}
          <div className="w-28 h-28 flex-shrink-0 rounded-lg border-2 border-red-700/60 bg-black/60 overflow-hidden flex items-center justify-center relative shadow-inner">
            {bossGifDisplay
              ? <img src={bossGifDisplay} alt="Boss" className="w-full h-full object-contain" />
              : <Skull className="text-red-600 animate-pulse" size={56} />
            }
            {isDebuffed && (
              <div className="absolute inset-0 bg-purple-650/45 animate-pulse pointer-events-none" />
            )}
          </div>

          {/* Boss info */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="rpg-font-retro text-red-400 text-xl uppercase tracking-wide">{raidState.bossConfig.name}</span>
              {isDebuffed && (
                <span className="text-xs text-purple-200 font-mono font-bold bg-purple-955/80 border border-purple-650/50 rounded-full px-2.5 py-0.5 shadow animate-pulse">
                  ⚡ DEBUFF AKTIF — DMG 2×
                </span>
              )}
            </div>
            {/* HP bar */}
            <div>
              <div className="flex justify-between text-sm font-mono mb-1">
                <span className="text-red-400 font-bold">HP BOSS</span>
                <span className="text-red-200 font-bold">{raidState.bossHp} / {raidState.bossConfig.maxHp}</span>
              </div>
              <div className="w-full h-5 bg-red-950/70 rounded-full overflow-hidden border border-red-900/50 shadow-inner">
                <div
                  className="h-full transition-all duration-500 relative"
                  style={{
                    width: `${Math.max(0, (raidState.bossHp / raidState.bossConfig.maxHp) * 100)}%`,
                    background: 'linear-gradient(to right, #7f1d1d, #dc2626, #ef4444)',
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
                </div>
              </div>
            </div>
            {/* Question */}
            <div className="bg-black/40 border border-red-900/60 rounded-lg px-4 py-2.5 shadow-inner">
              <span className="text-sm text-amber-500 font-mono font-bold block mb-0.5">PERTANYAAN BOSS: </span>
              <span className="text-base text-slate-100 italic leading-relaxed">"{raidState.bossConfig.question}"</span>
            </div>
          </div>

          {/* Boss stats */}
          <div className="flex-shrink-0 text-right space-y-1 text-xs font-mono border-l border-red-900/30 pl-4">
            <div className="text-red-400">DAMAGE: <span className="text-red-200 font-bold">{raidState.bossConfig.damage}</span>/atk</div>
            <div className="text-slate-400">SPEED: {raidState.bossConfig.attackSpeed}s</div>
            <div className="text-slate-500 font-bold">
              {raidState.raiders.filter(r => r.alive).length}/{raidState.raiders.length} ALIVE
            </div>
          </div>
        </div>
      )}

      {/* ─ Main 3-column grid ─ */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden lg:h-[550px]" style={{ minHeight: 0 }}>

        {/* Left: Config / Lobby info / Raider List */}
        <div className="lg:col-span-3 bg-[#0d0202] border-r border-[#3a1010] flex flex-col overflow-y-auto no-scrollbar">

          {/* Director/Manager lobby config */}
          {phase === 'lobby' && isDirectorOrManager && (
            <div className="flex-1 p-4 space-y-3.5">
              <p className="text-xs font-mono text-red-500 font-bold uppercase tracking-wider border-b border-red-900/30 pb-2">
                Konfigurasi Boss
              </p>

              {/* Presets */}
              {presets.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500 font-bold">Preset Tersimpan:</label>
                  <div className="space-y-1 max-h-24 overflow-y-auto no-scrollbar">
                    {presets.map(p => (
                      <div key={p.id} className="flex items-center gap-1.5 bg-[#170606] border border-red-955 rounded px-2 py-1 shadow-sm">
                        <button onClick={() => handleLoadPreset(p.id)}
                          className="flex-1 text-left text-xs text-red-300 hover:text-red-100 truncate">{p.presetName}</button>
                        <button onClick={() => handleDeletePreset(p.id)} className="text-red-505 hover:text-red-450 flex-shrink-0">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Config fields */}
              <div className="space-y-2 text-xs">
                <div>
                  <label className="text-slate-550 font-semibold block mb-1">Nama Boss:</label>
                  <input value={editConfig.name} onChange={e => setEditConfig(p => ({ ...p, name: e.target.value }))}
                    className="w-full bg-[#170606] text-slate-100 border border-red-955 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-red-800 text-xs shadow-inner"
                    placeholder="Dragon of Stagnation" />
                </div>

                {/* GIF Upload */}
                <div>
                  <label className="text-slate-550 font-semibold block mb-1">GIF Boss (pixel art, maks 4MB):</label>
                  <div className="flex items-center gap-2">
                    <label className="flex-1 flex items-center justify-center gap-1.5 cursor-pointer bg-[#170606] border border-dashed border-red-900/50 hover:border-red-600 rounded-lg px-2.5 py-2 text-xs text-red-400 hover:text-red-200 transition-colors shadow-inner">
                      <Upload size={12} />
                      {editConfig.gifBase64 ? 'Ganti GIF' : 'Upload GIF'}
                      <input type="file" accept="image/gif" className="hidden" onChange={handleGifUpload} />
                    </label>
                    {editConfig.gifBase64 && (
                      <>
                        <div className="w-10 h-10 rounded border border-red-900/40 overflow-hidden bg-black/40 flex-shrink-0 flex items-center justify-center">
                          <img src={editConfig.gifBase64} alt="preview" className="w-full h-full object-contain" />
                        </div>
                        <button onClick={() => setEditConfig(p => ({ ...p, gifBase64: '' }))} className="text-red-500 hover:text-red-400">
                          <X size={12} />
                        </button>
                      </>
                    )}
                  </div>
                  {gifUploadError && <p className="text-xs text-red-400 mt-1">{gifUploadError}</p>}
                </div>

                {/* Question */}
                <div>
                  <label className="text-slate-400 font-semibold block mb-1">Pertanyaan Boss:</label>
                  <textarea value={editConfig.question}
                    onChange={e => setEditConfig(p => ({ ...p, question: e.target.value }))}
                    rows={3}
                    className="w-full bg-[#170606] text-slate-100 border border-red-900 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-red-800 text-xs resize-none shadow-inner"
                    placeholder="Masukkan pertanyaan brainstorming..." />
                </div>

                {/* Numeric grid */}
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['HP Boss', 'maxHp', 50, 9999],
                    ['Damage Boss', 'damage', 1, 999],
                    ['Attack Speed (dtk)', 'attackSpeed', 2, 60],
                    ['Durasi Raid (dtk)', 'raidDuration', 30, 3600],
                    ['Reward Level (menang)', 'winLevelReward', 0, 10],
                    ['Penalti Koin (kalah)', 'lossCoinPenalty', 0, 9999],
                  ] as [string, keyof BossConfig, number, number][]).map(([label, key, min, max]) => (
                    <div key={key}>
                      <label className="text-slate-400 font-semibold block mb-0.5 leading-tight">{label}:</label>
                      <input
                        type="number" min={min} max={max}
                        value={editConfig[key] as number}
                        onChange={e => setEditConfig(p => ({ ...p, [key]: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-[#170606] text-slate-100 border border-red-900 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-red-800 text-xs shadow-inner"
                      />
                    </div>
                  ))}
                </div>

                {/* Save preset */}
                <div className="flex gap-2 pt-2 border-t border-red-900/60">
                  <input value={presetName} onChange={e => setPresetName(e.target.value)}
                    placeholder="Nama preset..."
                    className="flex-1 bg-[#170606] text-slate-100 border border-red-900 rounded-lg px-2 py-1 text-xs focus:outline-none" />
                  <button onClick={handleSavePreset} disabled={!presetName.trim()}
                    className="rpg-btn-game px-3 py-1 text-xs text-red-400 border-red-900 flex items-center gap-1 disabled:opacity-30">
                    <Save size={10} /> Simpan
                  </button>
                </div>

                {/* Start Raid */}
                <button onClick={handleStartRaid}
                  className="w-full py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all hover:brightness-110 active:translate-y-px mt-2"
                  style={{ background: 'linear-gradient(to bottom, #8b1a1a, #4a0d0d)', border: '2px solid #b91c1c', boxShadow: '0 4px 0 #3a0404, 0 0 20px rgba(185,28,28,0.25)' }}>
                  <Sword size={14} className="text-red-300 animate-pulse" />
                  <span className="text-red-100 uppercase tracking-wider font-extrabold">MULAI RAID</span>
                </button>
              </div>
            </div>
          )}

          {/* Staff lobby info */}
          {phase === 'lobby' && !isDirectorOrManager && (
            <div className="flex-1 p-4 space-y-4 animate-fade-in">
              <div className="bg-[#170606] border border-red-900 rounded-xl p-4 text-center space-y-3 shadow-md">
                <Shield className="mx-auto text-red-500" size={32} />
                <p className="rpg-font-retro text-amber-500 text-base">WILDERNESS LOBBY</p>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Duduk di kursi yang tersedia (klik + atau klik Bergabung) untuk bersiap sebagai raider.
                </p>
                <div className="text-left text-sm text-slate-400 space-y-2 border-t border-red-900/60 pt-3 mt-3">
                  <p className="text-red-400 font-bold mb-1 uppercase tracking-wide text-xs">Panduan Aksi:</p>
                  <p>⚔️ <b>Serang</b> ({ATTACK_COST}⚡) — Boss -10 HP</p>
                  <p>💙 <b>Heal</b> ({HEAL_COST}⚡) — Semua raider +10 HP</p>
                  <p>⚡ <b>Debuff</b> ({DEBUFF_COST}⚡) — Boss terima 2× DMG ({DEBUFF_DURATION_SEC}s)</p>
                  <p>💬 <b>Komentar</b> — +{ENERGY_PER_COMMENT}⚡ energi per jawaban</p>
                  <p className="text-slate-400 text-xs pt-1">Komentar cooldown: {COMMENT_COOLDOWN_MS / 1000} detik</p>
                </div>
              </div>
              <p className="text-center text-sm font-mono text-slate-400">
                {seats.filter(s => s.user_id).length} / {seats.length} kursi terisi
              </p>
            </div>
          )}

          {/* Active Phase: Raider List & Status */}
          {phase === 'active' && raidState && (
            <div className="flex-1 p-4 space-y-4 animate-fade-in">
              <p className="text-sm font-mono text-amber-500 font-bold uppercase tracking-wider border-b border-[#3a1010] pb-2">
                Daftar Raider ({raidState.raiders.filter(r => r.alive).length}/{raidState.raiders.length} Hidup)
              </p>
              
              <div className="space-y-2.5 max-h-[350px] overflow-y-auto no-scrollbar">
                {raidState.raiders.map(raider => {
                  const occupant = getProfile(raider.profileId);
                  if (!occupant) return null;
                  
                  return (
                    <div key={raider.profileId} className="bg-[#150808] border border-[#3a1010] rounded-lg p-2.5 flex items-center gap-2.5 shadow-sm">
                      <div className={`relative flex-shrink-0 ${!raider.alive ? 'opacity-40 grayscale saturate-0' : ''}`}>
                        <SpriteRenderer 
                          base={occupant.sprite_json.base} 
                          hair={occupant.sprite_json.hair}
                          outfit={occupant.sprite_json.outfit} 
                          accessory={occupant.sprite_json.accessory}
                          petId="none" 
                          cosmeticId={occupant.sprite_json.cosmetic_id}
                          size={28} 
                        />
                        {!raider.alive && (
                          <div className="absolute inset-0 flex items-center justify-center text-xs">☠</div>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-0.5">
                          <span 
                            className="text-sm font-bold truncate"
                            style={{ color: occupant.sprite_json.nameColor || '#e2e8f0' }}
                          >
                            {occupant.name.split(' ')[0]}
                          </span>
                          <span className="text-xs font-mono text-amber-500">{raider.energy}⚡</span>
                        </div>
                        
                        {/* HP bar */}
                        <div className="w-full h-2.5 bg-red-950 rounded-full overflow-hidden border border-red-900/30 shadow-inner">
                          <div
                            className="h-full transition-all duration-300"
                            style={{
                              width: `${(raider.hp / RAIDER_MAX_HP) * 100}%`,
                              background: raider.hp > 50 ? '#16a34a' : raider.hp > 25 ? '#ca8a04' : '#dc2626'
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-xs font-mono text-slate-400 mt-0.5">
                          <span>HP: {raider.hp}</span>
                          <span>💬 {raider.commentCount}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ended */}
          {phase === 'ended' && (
            <div className="flex-1 p-4 flex items-center justify-center">
              <button onClick={() => setShowResult(true)}
                className="rpg-btn-game px-4 py-2 text-xs text-yellow-355 border-yellow-800 flex items-center gap-1.5">
                <Trophy size={12} /> Lihat Hasil
              </button>
            </div>
          )}
        </div>

        {/* Center: Arena */}
        <div 
          className="lg:col-span-6 relative overflow-hidden h-[400px] lg:h-full border-2 border-[#3a1010]"
          style={{
            backgroundImage: 'url(/assets/rooms/wilderness_bg.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            imageRendering: 'pixelated'
          }}
        >

          {/* Boss area indicator (lobby only) */}
          {phase === 'lobby' && (
            <div className="absolute top-0 left-0 right-0 flex items-center justify-center pointer-events-none" style={{ height: '47%' }}>
              <div className="text-center opacity-10">
                <Skull className="mx-auto text-red-500 mb-1" size={56} />
                <p className="text-xs font-mono text-red-500 font-bold uppercase tracking-widest">ZONA BOSS</p>
              </div>
            </div>
          )}

          {/* Dashed divider removed */}

          {/* Seats */}
          <div className="absolute inset-0">
            {seats.map((seat) => {
              const occupant = profiles.find(p => p.id === seat.user_id);
              const raider = raidState?.raiders.find(r => r.profileId === seat.user_id);
              const isMe = seat.user_id === currentProfile.id;

              return (
                <div
                  key={seat.id}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center animate-fade-in"
                  style={{ left: `${seat.x}%`, top: `${seat.y}%`, zIndex: Math.round(seat.y) }}
                >
                  {occupant && phase === 'active' && raider ? (
                    /* Active raid: sprite + HP + energy */
                    <div className="flex flex-col items-center gap-1 bg-black/40 p-1.5 rounded-lg border border-red-900/25 backdrop-blur-[1px] shadow-md">
                      {/* HP */}
                      <div className="w-11 h-2 bg-red-950 rounded-full overflow-hidden border border-red-900/40 shadow-inner">
                        <div className="h-full transition-all duration-500"
                          style={{
                            width: `${(raider.hp / RAIDER_MAX_HP) * 100}%`,
                            background: raider.hp > 50 ? '#16a34a' : raider.hp > 25 ? '#ca8a04' : '#dc2626'
                          }} />
                      </div>
                      {/* Sprite */}
                      <div className={`relative ${!raider.alive ? 'opacity-40 grayscale saturate-0' : ''} transition-all`}>
                        <SpriteRenderer base={occupant.sprite_json.base} hair={occupant.sprite_json.hair}
                          outfit={occupant.sprite_json.outfit} accessory={occupant.sprite_json.accessory}
                          petId="none" cosmeticId={occupant.sprite_json.cosmetic_id} size={32} />
                        {!raider.alive && (
                          <div className="absolute inset-0 flex items-center justify-center font-bold text-red-500 drop-shadow shadow-black">
                            <span className="text-base">☠</span>
                          </div>
                        )}
                        {isMe && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-amber-600 animate-pulse shadow" />
                        )}
                      </div>
                      {/* Energy + name */}
                      <div className="text-xs font-mono text-amber-500 font-bold leading-none">{raider.energy}⚡</div>
                      <div 
                        className="text-xs font-mono truncate max-w-[60px] leading-tight text-center font-bold"
                        style={{ color: occupant.sprite_json.nameColor || '#d1d5db' }}
                      >
                        {occupant.name.split(' ')[0]}
                      </div>
                    </div>
                  ) : occupant ? (
                    /* Lobby: sprite only */
                    <div className={`flex flex-col items-center gap-1 cursor-pointer hover:scale-115 transition-all p-1 bg-black/30 rounded-lg border border-transparent ${isMe ? 'border-amber-500 bg-amber-955/20 ring-1 ring-amber-500/30 shadow' : ''}`}
                      onClick={() => handleSeatClick(seat)}>
                      <SpriteRenderer base={occupant.sprite_json.base} hair={occupant.sprite_json.hair}
                        outfit={occupant.sprite_json.outfit} accessory={occupant.sprite_json.accessory}
                        petId="none" cosmeticId={occupant.sprite_json.cosmetic_id} size={32} />
                      <div 
                        className="text-xs font-mono truncate max-w-[60px] leading-tight text-center"
                        style={{ color: occupant.sprite_json.nameColor || '#d1d5db' }}
                      >
                        {occupant.name.split(' ')[0]}
                      </div>
                    </div>
                  ) : (
                    /* Empty seat */
                    phase !== 'active' && (
                      <div
                        className="w-10 h-10 rounded-full border-2 border-dashed border-red-900/40 bg-red-955/5 cursor-pointer hover:border-red-700 hover:bg-red-955/20 transition-all flex items-center justify-center shadow-inner group shadow"
                        onClick={() => handleSeatClick(seat)}
                        title="Duduk di sini"
                      >
                        <span className="text-base text-red-900 group-hover:text-red-500 group-hover:scale-125 transition-all font-bold">+</span>
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>

            {/* Overflow Characters Container (Bottom Right) */}
            <div className="absolute bottom-3 right-4 z-40 flex flex-col items-end gap-1 pointer-events-auto">
              {profiles.filter(p => p.current_seat_id === `wilderness_overflow_${p.id}`).length > 0 && (
                <div className="bg-slate-950/85 border-2 border-[#3a1010]/40 p-2 rounded-xl flex flex-wrap gap-2 max-w-[180px] justify-end shadow-xl shadow-black/80">
                  <span className="text-[6.5px] text-red-500 font-extrabold uppercase tracking-widest block w-full text-right select-none font-mono">
                    OVERFLOW (KURSI PENUH)
                  </span>
                  {profiles.filter(p => p.current_seat_id === `wilderness_overflow_${p.id}`).map(occupant => (
                    <div key={occupant.id} className="relative flex flex-col items-center group cursor-pointer">
                      <div className="w-9 h-9 flex items-center justify-center relative hover:scale-110 transition-transform">
                        <SpriteRenderer
                          base={occupant.sprite_json.base}
                          hair={occupant.sprite_json.hair}
                          outfit={occupant.sprite_json.outfit}
                          accessory={occupant.sprite_json.accessory}
                          petId="none"
                          cosmeticId={occupant.sprite_json.cosmetic_id}
                          size={32}
                        />
                        {occupant.id === currentProfile.id && (
                          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-green-500 rounded-full border border-white animate-bounce z-50"></div>
                        )}
                      </div>
                      <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center bg-slate-950/95 border border-[#3a1010]/50 px-2 py-0.5 rounded text-[8px] font-bold max-w-[100px] text-center shadow-lg pointer-events-none z-50">
                        <span style={{ color: occupant.sprite_json.nameColor || '#fef08a' }}>
                          {occupant.name.split(' ')[0]}
                        </span>
                        <span className="block text-[6px] text-slate-400 mt-0.5 leading-none">{occupant.current_status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Raider count bottom-left */}
            <div className="absolute bottom-3 left-4 text-xs font-mono text-red-900/60 font-bold">
              {phase === 'active'
                ? `${raidState?.raiders.filter(r => r.alive).length}/${raidState?.raiders.length} ALIVE`
                : `${seats.filter(s => s.user_id).length}/${seats.length} RAIDERS READY`}
            </div>
          </div>

        {/* Right: Comments */}
        <div className="lg:col-span-3 bg-[#0d0202] border-l border-[#3a1010] flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-red-955/40 flex justify-between items-center flex-shrink-0">
            <span className="text-xs font-mono text-red-400 font-bold flex items-center gap-1.5">
              <MessageSquare size={12} /> BRAINSTORM ({comments.length})
            </span>
            {currentProfile.role === 'Director' && (
              <button
                onClick={() => { if (window.confirm('Hapus semua komentar?')) { playClick(); db.clearRaidComments(); } }}
                className="text-xs text-red-500 hover:text-red-455 font-bold transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Question reminder during active */}
          {phase === 'active' && raidState && (
            <div className="px-3.5 py-2.5 bg-[#250d0d] border-b border-red-955/40 flex-shrink-0 animate-fade-in">
              <p className="text-[10px] text-amber-500 font-mono font-bold">PERTANYAAN BOSS:</p>
              <p className="text-xs text-slate-200 italic leading-relaxed break-words">"{raidState.bossConfig.question}"</p>
            </div>
          )}

          {/* Comment list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 no-scrollbar max-h-[300px] lg:max-h-[360px]">
            {comments.length === 0 ? (
              <div className="text-center py-12 text-slate-650 italic text-xs">Belum ada komentar...</div>
            ) : (
              comments.map(c => (
                <div key={c.id} className="bg-[#170606] border border-red-955/40 rounded-lg p-2.5 shadow-sm">
                  <div className="flex justify-between items-center mb-1">
                    {(() => {
                      const author = profiles.find(p => p.id === c.authorId);
                      return (
                        <span 
                          className="text-xs font-bold truncate max-w-[120px]"
                          style={{ color: author?.sprite_json?.nameColor || '#f87171' }}
                        >
                          {c.authorName.split(' ')[0]}
                        </span>
                      );
                    })()}
                    <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">
                      {new Date(c.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-350 break-words leading-relaxed">{c.text}</p>
                </div>
              ))
            )}
            <div ref={commentsEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-red-955/40 flex-shrink-0">
            <form onSubmit={handleComment} className="flex gap-2">
              <input
                value={commentInput}
                onChange={e => setCommentInput(e.target.value)}
                placeholder={commentCooldown ? 'Tunggu sebentar...' : 'Jawab pertanyaan boss...'}
                disabled={commentCooldown}
                maxLength={200}
                className="flex-1 min-w-0 bg-[#170606] text-slate-100 border border-red-955 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-800 disabled:opacity-40 shadow-inner"
              />
              <button type="submit" disabled={commentCooldown || !commentInput.trim()}
                className="rpg-btn-game px-3 py-2 text-red-400 border-red-900 flex-shrink-0 flex items-center justify-center disabled:opacity-30">
                <MessageSquare size={13} />
              </button>
            </form>
            {phase === 'active' && amIRaider && (
              <p className="text-[10px] text-red-900/60 mt-1 font-mono">+{ENERGY_PER_COMMENT}⚡ energi per komentar (cooldown {COMMENT_COOLDOWN_MS / 1000}s)</p>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Bottom Actions Bar (only for active seated raiders) */}
      {phase === 'active' && amISitting && myRaider && (
        <div className="bg-[#0f0303] border-t-2 border-[#3a1010] p-4 flex-shrink-0 animate-slide-up shadow-2xl z-10">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Raider Status (HP & Energy) */}
            <div className="w-full md:w-1/3 space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-red-400 font-bold flex items-center gap-1">❤️ HP SAYA:</span>
                <span className={`font-bold text-sm ${myRaider.hp > 30 ? 'text-green-400' : 'text-red-500'}`}>
                  {myRaider.hp}/{RAIDER_MAX_HP}
                </span>
              </div>
              <div className="w-full h-3 bg-red-955/60 rounded-full overflow-hidden border border-red-900/30">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${(myRaider.hp / RAIDER_MAX_HP) * 100}%`,
                    background: myRaider.hp > 50 ? 'linear-gradient(to right, #16a34a, #4ade80)' : myRaider.hp > 25 ? 'linear-gradient(to right, #ca8a04, #fbbf24)' : 'linear-gradient(to right, #991b1b, #ef4444)'
                  }}
                />
              </div>
              
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-amber-400 font-bold flex items-center gap-1">⚡ ENERGI SAYA:</span>
                <span className="text-amber-300 font-bold text-sm">{myEnergy}⚡</span>
              </div>
              <div className="w-full h-3 bg-amber-955/60 rounded-full overflow-hidden border border-amber-900/30">
                <div
                  className="h-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (myEnergy / 100) * 100)}%`, background: 'linear-gradient(to right, #92400e, #f59e0b)' }}
                />
              </div>
            </div>

            {/* Action Buttons (Large at Bottom) */}
            <div className="w-full md:w-2/3">
              {amIAlive ? (
                <div className="grid grid-cols-3 gap-3">
                  {/* Attack Button */}
                  <button
                    onClick={() => handleAction('attack')}
                    disabled={!canAttack}
                    className="py-3 px-4 rounded-lg text-sm font-extrabold flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 active:translate-y-px text-white shadow-lg cursor-pointer"
                    style={{
                      background: canAttack ? 'linear-gradient(to bottom, #8b1e1e, #4c0d0d)' : '#2a1212',
                      border: '2px solid #b91c1c',
                      boxShadow: canAttack ? '0 4px 0 #3a0808, 0 10px 15px -3px rgba(185, 28, 28, 0.4)' : 'none'
                    }}
                  >
                    <Sword size={20} className="text-red-200 animate-pulse" />
                    <span>SERANG ({ATTACK_COST}⚡)</span>
                    <span className="text-[10px] font-normal text-red-300">-{isDebuffed ? ATTACK_BOSS_DAMAGE * 2 : ATTACK_BOSS_DAMAGE} HP Boss</span>
                  </button>

                  {/* Heal Button */}
                  <button
                    onClick={() => handleAction('heal')}
                    disabled={!canHeal}
                    className="py-3 px-4 rounded-lg text-sm font-extrabold flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 active:translate-y-px text-white shadow-lg cursor-pointer"
                    style={{
                      background: canHeal ? 'linear-gradient(to bottom, #1e40af, #1e3a8a)' : '#121b2d',
                      border: '2px solid #3b82f6',
                      boxShadow: canHeal ? '0 4px 0 #111e3b, 0 10px 15px -3px rgba(59, 130, 246, 0.4)' : 'none'
                    }}
                  >
                    <Heart size={20} className="text-blue-200 animate-pulse" />
                    <span>HEAL TEAM ({HEAL_COST}⚡)</span>
                    <span className="text-[10px] font-normal text-blue-300">+{HEAL_AMOUNT} HP Semua</span>
                  </button>

                  {/* Debuff Button */}
                  <button
                    onClick={() => handleAction('debuff')}
                    disabled={!canDebuff}
                    className="py-3 px-4 rounded-lg text-sm font-extrabold flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 active:translate-y-px text-white shadow-lg cursor-pointer"
                    style={{
                      background: canDebuff ? 'linear-gradient(to bottom, #6d28d9, #4c1d95)' : '#1e112d',
                      border: '2px solid #7c3aed',
                      boxShadow: canDebuff ? '0 4px 0 #2e0854, 0 10px 15px -3px rgba(124, 58, 237, 0.4)' : 'none'
                    }}
                  >
                    <Zap size={20} className="text-purple-200 animate-pulse" />
                    <span>DEBUFF BOSS ({DEBUFF_COST}⚡)</span>
                    <span className="text-[10px] font-normal text-purple-300">2× DMG ({DEBUFF_DURATION_SEC}s)</span>
                  </button>
                </div>
              ) : (
                <div className="bg-red-955/40 border border-red-900/50 rounded-lg p-3 text-center">
                  <Skull className="mx-auto text-red-500 animate-bounce mb-1" size={32} />
                  <p className="text-sm text-red-400 font-bold uppercase tracking-wider">Karaktermu Gugur dalam Pertempuran!</p>
                  <p className="text-xs text-slate-400 mt-1">Kamu masih bisa membantu tim dengan mengirimkan komentar jawaban untuk memberi energi kepada raider yang tersisa.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─ Result Modal ─ */}
      {showResult && raidState?.phase === 'ended' && raidState.result && (() => {
        const result = raidState.result!;
        const sortedRaiders = [...raidState.raiders].sort((a, b) => b.commentCount - a.commentCount);
        const medals = ['🥇', '🥈', '🥉'];
        const multipliers = [3, 2, 1.5];

        const headerColor = result === 'win' ? 'text-yellow-350' : result === 'lose' ? 'text-red-400' : 'text-slate-350';
        const borderColor = result === 'win' ? 'border-yellow-700' : result === 'lose' ? 'border-red-800' : 'border-slate-700';
        const glowColor = result === 'win' ? '#f59e0b30' : result === 'lose' ? '#ef444430' : '#64748b20';

        return (
          <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[9999] p-4">
            <div
              className={`max-w-md w-full rounded-xl border-2 ${borderColor} flex flex-col gap-5 p-6 text-center shadow-2xl`}
              style={{ background: 'linear-gradient(to bottom, #1a0606, #090202)', boxShadow: `0 0 60px ${glowColor}, 0 0 120px rgba(0,0,0,0.9)` }}
            >
              {/* Icon */}
              {result === 'win' && <Trophy className="mx-auto text-yellow-400" size={52} />}
              {result === 'lose' && <Skull className="mx-auto text-red-500" size={52} />}
              {result === 'draw' && <Clock className="mx-auto text-slate-400" size={52} />}

              {/* Title */}
              <div>
                <h3 className={`rpg-font-retro text-xl ${headerColor}`}>
                  {result === 'win' ? 'KEMENANGAN!' : result === 'lose' ? 'KEKALAHAN!' : 'SERI!'}
                </h3>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  {result === 'win' && `Boss ${raidState.bossConfig.name} berhasil dikalahkan!`}
                  {result === 'lose' && `Semua raider gugur melawan ${raidState.bossConfig.name}.`}
                  {result === 'draw' && 'Waktu habis — pertarungan berakhir seri.'}
                </p>
              </div>

              {/* Leaderboard / reward info */}
              <div className="text-left space-y-1.5 text-xs">
                {result === 'win' && (
                  <>
                    <p className="text-yellow-400 font-bold text-center mb-2">Leaderboard Kontribusi:</p>
                    {sortedRaiders.slice(0, 3).map((r, i) => {
                      const prof = getProfile(r.profileId);
                      const gain = Math.round(raidState.bossConfig.winLevelReward * (multipliers[i] || 1));
                      return (
                        <div key={r.profileId} className="flex justify-between items-center bg-black/20 border border-red-955 rounded px-2.5 py-1.5 shadow-sm">
                          <span className="text-slate-350">{medals[i]} {prof?.name.split(' ')[0] || 'Raider'}</span>
                          <span>
                            <span className="text-yellow-400 font-bold">+{gain} LV</span>
                            <span className="text-slate-500 text-[10px] ml-1.5">({r.commentCount} komentar)</span>
                          </span>
                        </div>
                      );
                    })}
                    {sortedRaiders.length > 3 && (
                      <p className="text-center text-slate-550 text-[10px]">
                        Raider lainnya: +{raidState.bossConfig.winLevelReward} LV
                      </p>
                    )}
                  </>
                )}
                {result === 'lose' && (
                  <div className="bg-red-955/30 border border-red-900/30 rounded p-3 text-center shadow-inner">
                    <p className="text-red-300">Setiap raider dikenai penalti:</p>
                    <p className="text-red-400 font-bold text-lg mt-1">-{raidState.bossConfig.lossCoinPenalty} 🪙</p>
                  </div>
                )}
                {result === 'draw' && (
                  <div className="bg-slate-900/30 border border-slate-700/30 rounded p-3 text-center shadow-inner">
                    <p className="text-slate-400">Semua raider yang bertahan mendapat:</p>
                    <p className="text-slate-200 font-bold text-lg mt-1">
                      +{Math.floor(raidState.bossConfig.winLevelReward / 3)} LV
                    </p>
                    <p className="text-slate-555 text-[10px] mt-1">(1/3 dari reward kemenangan)</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-center">
                <button onClick={() => setShowResult(false)}
                  className="rpg-btn-game px-4 py-2 text-xs text-slate-400 border-slate-750">
                  Tutup
                </button>
                {isDirectorOrManager && (
                  <button onClick={handleResetRaid}
                    className="rpg-btn-game px-4 py-2 text-xs text-red-400 border-red-800 flex items-center gap-1.5">
                    <RotateCcw size={12} /> Reset Lobby
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}


    </div>
  );
};
