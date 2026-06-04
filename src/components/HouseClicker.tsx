import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Profile } from '../lib/supabase';
import { db } from '../lib/supabase';
import { SpriteRenderer } from './SpriteRenderer';
import { playClick, playSelect } from '../lib/audio';
import {
  MousePointer2, Users, TrendingUp, Bot,
  Dices, X, Star, Wrench,
  UserPlus, Sparkles, RefreshCw,
} from 'lucide-react';

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────
interface ClickerUpgrades {
  click_power: number;
  intern_squad: number;
  project_manager: number;
  opal_bot: number;
}

interface ClickerSaveState {
  silver: number;
  legacy_points: number;
  upgrades: ClickerUpgrades;
  owned_companions: string[];
  equipped_companion_id: string | null;
}

interface CompanionDef {
  id: string;
  name: string;
  rarity: 'basic' | 'common' | 'uncommon' | 'rare' | 'epic';
  abilityName: string;
  abilityDesc: string;
  color: string;
  glowColor: string;
  pullWeight: number;
}

// ─────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────
const PRESTIGE_THRESHOLD = 100_000_000;
const PULL_COST = 5_000;
const JACKPOT_DURATION_MS = 10_000;
const JACKPOT_CHANCE = 0.01;
const FAB_RADIUS = 68;

const UPGRADE_DEFS = [
  { id: 'click_power'      as const, name: 'Daya Klik',       baseCost: 10,    mult: 1.12, Icon: MousePointer2, color: '#fbbf24', desc: '+1/klik',  detailFn: (l: number) => `Total: +${l}/klik` },
  { id: 'intern_squad'     as const, name: 'Staf Magang',     baseCost: 50,    mult: 1.15, Icon: UserPlus,      color: '#34d399', desc: '+1/dtk',   detailFn: (l: number) => `Total: +${l}/dtk` },
  { id: 'project_manager'  as const, name: 'Manajer Proyek',  baseCost: 500,   mult: 1.18, Icon: TrendingUp,    color: '#60a5fa', desc: '+8/dtk',   detailFn: (l: number) => `Total: +${l * 8}/dtk` },
  { id: 'opal_bot'         as const, name: 'Asisten AI',      baseCost: 5_000, mult: 1.22, Icon: Bot,           color: '#c084fc', desc: '+50/dtk',  detailFn: (l: number) => `Total: +${l * 50}/dtk` },
];

const COMPANIONS: CompanionDef[] = [
  { id: 'knight_boy',   name: 'Knight Boy',   rarity: 'basic',    abilityName: "Squire's Training", abilityDesc: '+2 CPC flat ke semua klik',                  color: '#a8a29e', glowColor: 'rgba(168,162,158,0.35)', pullWeight: 30 },
  { id: 'pinky_girl',   name: 'Pinky Girl',   rarity: 'basic',    abilityName: 'Cheerful Spirit',   abilityDesc: '+5 CPS flat pasif',                           color: '#f9a8d4', glowColor: 'rgba(249,168,212,0.35)', pullWeight: 20 },
  { id: 'red_devil',    name: 'Red Devil',    rarity: 'common',   abilityName: 'Fiendish Greed',    abilityDesc: '5% chance per klik, earn 10x CPC',            color: '#f87171', glowColor: 'rgba(248,113,113,0.35)', pullWeight: 25 },
  { id: 'knight_cat',   name: 'Knight Cat',   rarity: 'uncommon', abilityName: 'Neko-nomics',       abilityDesc: '-5% biaya semua upgrade',                     color: '#86efac', glowColor: 'rgba(134,239,172,0.35)', pullWeight: 15 },
  { id: 'silver_viking',name: 'Silver Viking',rarity: 'rare',     abilityName: 'The Great Raid',    abilityDesc: 'x1.25 multiplier Total CPS',                  color: '#93c5fd', glowColor: 'rgba(147,197,253,0.45)', pullWeight: 8  },
  { id: 'clown',        name: 'Clown',        rarity: 'epic',     abilityName: 'Chaos Jackpot',     abilityDesc: '1% chance/dtk, x5 earnings selama 10 detik', color: '#d946ef', glowColor: 'rgba(217,70,239,0.5)',   pullWeight: 2  },
];

const RARITY_STYLE: Record<string, { label: string; textColor: string; bg: string; border: string }> = {
  basic:    { label: 'Basic',    textColor: '#a8a29e', bg: 'rgba(120,113,108,0.2)',  border: '#78716c' },
  common:   { label: 'Common',   textColor: '#94a3b8', bg: 'rgba(100,116,139,0.2)',  border: '#64748b' },
  uncommon: { label: 'Uncommon', textColor: '#4ade80', bg: 'rgba(34,197,94,0.15)',   border: '#22c55e' },
  rare:     { label: 'Rare',     textColor: '#60a5fa', bg: 'rgba(59,130,246,0.15)',  border: '#3b82f6' },
  epic:     { label: 'Epic',     textColor: '#d946ef', bg: 'rgba(217,70,239,0.15)',  border: '#d946ef' },
};

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
function formatSilver(n: number): string {
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(2)}T`;
  if (n >= 1_000_000_000)     return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)         return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)             return `${(n / 1_000).toFixed(2)}K`;
  return Math.floor(n).toString();
}

function upgradeCost(baseCost: number, mult: number, level: number, disc = 1.0): number {
  return Math.floor(baseCost * Math.pow(mult, level) * disc);
}

function arcPos(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(rad) * r, y: -Math.sin(rad) * r };
}

function loadState(uid: string): ClickerSaveState {
  try {
    const raw = localStorage.getItem(`house_clicker_${uid}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { silver: 0, legacy_points: 0, upgrades: { click_power: 0, intern_squad: 0, project_manager: 0, opal_bot: 0 }, owned_companions: [], equipped_companion_id: null };
}

function saveState(uid: string, s: ClickerSaveState) {
  try { localStorage.setItem(`house_clicker_${uid}`, JSON.stringify(s)); } catch { /* ignore */ }
}

// ─────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────
export const HouseClicker: React.FC<{ currentProfile: Profile }> = ({ currentProfile }) => {
  // ── Game state ────────────────────────────────────────────────────────────
  const [silver,             setSilver]             = useState(() => loadState(currentProfile.id).silver);
  const [legacyPoints,       setLegacyPoints]       = useState(() => loadState(currentProfile.id).legacy_points);
  const [upgrades,           setUpgrades]           = useState<ClickerUpgrades>(() => loadState(currentProfile.id).upgrades);
  const [ownedCompanions,    setOwnedCompanions]    = useState<string[]>(() => loadState(currentProfile.id).owned_companions);
  const [equippedId,         setEquippedId]         = useState<string | null>(() => loadState(currentProfile.id).equipped_companion_id);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [clickAnim,          setClickAnim]          = useState(false);
  const [floatingNums,       setFloatingNums]       = useState<{ id: number; v: string; x: number | string; y: number; color?: string }[]>([]);
  const floatId = useRef(0);

  const [isJackpot,          setIsJackpot]          = useState(false);
  const jackpotUntil = useRef(0);

  const [lastPull,           setLastPull]           = useState<CompanionDef | null>(null);
  const [showPullToast,      setShowPullToast]      = useState(false);

  const [upgradeFabOpen,     setUpgradeFabOpen]     = useState(false);
  const [gachaFabOpen,       setGachaFabOpen]       = useState(false);
  const [hoveredBtn,         setHoveredBtn]         = useState<string | null>(null);
  const [showCompanionModal, setShowCompanionModal] = useState(false);
  const [showPrestigeMenu,   setShowPrestigeMenu]   = useState(false);

  const [companionImages,    setCompanionImages]    = useState<Record<string, string>>({});

  // ── Stable ref ───────────────────────────────────────────────────────────
  const ref = useRef({ silver, legacyPoints, upgrades, equippedId, isJackpot });
  useEffect(() => { ref.current = { silver, legacyPoints, upgrades, equippedId, isJackpot }; },
    [silver, legacyPoints, upgrades, equippedId, isJackpot]);

  // ── Load / Save ───────────────────────────────────────────────────────────
  useEffect(() => {
    saveState(currentProfile.id, { silver, legacy_points: legacyPoints, upgrades, owned_companions: ownedCompanions, equipped_companion_id: equippedId });
  }, [silver, legacyPoints, upgrades, ownedCompanions, equippedId, currentProfile.id]);

  // ── Companion images ──────────────────────────────────────────────────────
  useEffect(() => {
    db.getAssets().then(assets => {
      const map: Record<string, string> = {};
      for (const c of COMPANIONS) {
        const hit = assets.find(a => {
          const n = a.name.toLowerCase().trim();
          return n === c.name.toLowerCase() || n === c.id || n === c.id.replace(/_/g, ' ');
        });
        if (hit?.image_url) map[c.id] = hit.image_url;
      }
      setCompanionImages(map);
    }).catch(() => {});
  }, []);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const disc = equippedId === 'knight_cat' ? 0.95 : 1.0;

  const computeCPC = useCallback((u: ClickerUpgrades, eq: string | null) =>
    (1 + u.click_power) + (eq === 'knight_boy' ? 2 : 0), []);

  const computeCPS = useCallback((u: ClickerUpgrades, eq: string | null, lp: number, jp: boolean) => {
    const raw = 1 + u.intern_squad * 1 + u.project_manager * 8 + u.opal_bot * 50 + (eq === 'pinky_girl' ? 5 : 0);
    return raw * (eq === 'silver_viking' ? 1.25 : 1) * (jp ? 5 : 1) * (1 + lp * 0.10);
  }, []);

  const cpc = computeCPC(upgrades, equippedId);
  const cps = computeCPS(upgrades, equippedId, legacyPoints, isJackpot);
  const equippedDef = COMPANIONS.find(c => c.id === equippedId) ?? null;
  const earnedLegacy = Math.floor(silver / PRESTIGE_THRESHOLD);
  const canPrestige = silver >= PRESTIGE_THRESHOLD;

  // ── Game loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      const { upgrades: u, equippedId: eq, legacyPoints: lp, isJackpot: jp } = ref.current;
      if (jp && Date.now() > jackpotUntil.current) setIsJackpot(false);
      const curJp = jp && Date.now() <= jackpotUntil.current;
      const totalCPS = computeCPS(u, eq, lp, curJp);
      if (totalCPS > 0) {
        setSilver(p => p + totalCPS);
        
        // Spawn green floating number for automatic CPS
        const label = `+${formatSilver(totalCPS)}`;
        const id = floatId.current++;
        const fx = `calc(50% + ${Math.round(Math.random() * 60 - 30)}px)`;
        const fy = 140 + Math.random() * 40;
        setFloatingNums(p => [...p, { id, v: label, x: fx, y: fy, color: '#4ade80' }]);
        setTimeout(() => setFloatingNums(p => p.filter(n => n.id !== id)), 1100);
      }
      if (eq === 'clown' && !curJp && Math.random() < JACKPOT_CHANCE) {
        setIsJackpot(true); jackpotUntil.current = Date.now() + JACKPOT_DURATION_MS;
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [computeCPS]);

  // ── Click handler ─────────────────────────────────────────────────────────
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    playClick();
    const rect = e.currentTarget.getBoundingClientRect();
    let earned = computeCPC(ref.current.upgrades, ref.current.equippedId);
    let label = `+${formatSilver(earned)}`;
    if (ref.current.equippedId === 'red_devil' && Math.random() < 0.05) { earned *= 10; label = `x10  +${formatSilver(earned)}`; }
    if (ref.current.isJackpot && Date.now() <= jackpotUntil.current) { earned *= 5; label = `x5  +${formatSilver(earned)}`; }
    setSilver(p => p + earned);
    const id = floatId.current++;
    const fx = e.clientX - rect.left, fy = e.clientY - rect.top;
    setFloatingNums(p => [...p, { id, v: label, x: fx, y: fy }]);
    setTimeout(() => setFloatingNums(p => p.filter(n => n.id !== id)), 1100);
    setClickAnim(true); setTimeout(() => setClickAnim(false), 120);
  }, [computeCPC]);

  // ── Buy upgrade ───────────────────────────────────────────────────────────
  const handleBuy = useCallback((id: keyof ClickerUpgrades) => {
    const def = UPGRADE_DEFS.find(d => d.id === id)!;
    const cost = upgradeCost(def.baseCost, def.mult, upgrades[id], disc);
    if (silver < cost) return;
    playSelect();
    setSilver(p => p - cost);
    setUpgrades(p => ({ ...p, [id]: p[id] + 1 }));
  }, [silver, upgrades, disc]);

  // ── Pull companion ────────────────────────────────────────────────────────
  const handlePull = useCallback(() => {
    if (silver < PULL_COST) return;
    playClick();
    const total = COMPANIONS.reduce((s, c) => s + c.pullWeight, 0);
    let r = Math.random() * total;
    let pulled = COMPANIONS[0];
    for (const c of COMPANIONS) { r -= c.pullWeight; if (r <= 0) { pulled = c; break; } }
    const dup = ownedCompanions.includes(pulled.id);
    setSilver(p => p - (dup ? Math.round(PULL_COST * 0.8) : PULL_COST));
    if (!dup) setOwnedCompanions(p => [...p, pulled.id]);
    setLastPull(pulled); setShowPullToast(true);
    setGachaFabOpen(false);
    setTimeout(() => setShowPullToast(false), 3500);
  }, [silver, ownedCompanions]);

  // ── Equip companion ───────────────────────────────────────────────────────
  const handleEquip = useCallback((id: string) => {
    playSelect();
    setEquippedId(p => p === id ? null : id);
  }, []);

  // ── Prestige ──────────────────────────────────────────────────────────────
  const handlePrestige = useCallback(() => {
    if (!canPrestige) return;
    setLegacyPoints(p => p + earnedLegacy);
    setSilver(0);
    setUpgrades({ click_power: 0, intern_squad: 0, project_manager: 0, opal_bot: 0 });
    setShowPrestigeMenu(false);
    playClick();
  }, [canPrestige, earnedLegacy]);

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className="relative select-none w-full">



      {/* ── MAIN CLICKER PANEL (Cozy Room style) ── */}
      <div
        className="rpg-panel-stone relative w-full"
        style={{
          minHeight: '360px',
          overflow: 'visible',
          background: 'linear-gradient(to bottom, #2b1f1a 0%, #17110e 100%)',
          backgroundImage: 'radial-gradient(#4e3629 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      >

        {/* Jackpot glow overlay */}
        {isJackpot && (
          <div className="absolute inset-0 pointer-events-none rounded animate-pulse"
            style={{ background: 'radial-gradient(ellipse at center, rgba(217,70,239,0.18) 0%, transparent 70%)' }} />
        )}

        {/* TOP-LEFT: Plaque */}
        <div className="rpg-plaque absolute top-3 left-3 text-[9px] z-10">
          COZY ROOM
        </div>

        {/* TOP-CENTER: Silver stats */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center text-center">
          <div className="text-[7px] rpg-font-retro text-amber-500/80 mb-0.5 tracking-wider">KEPING PERAK</div>
          <div className="text-base font-bold text-yellow-300 font-mono leading-none tracking-tight">{formatSilver(silver)}</div>
          <div className="flex gap-2.5 mt-1 bg-black/35 px-2 py-0.5 rounded border border-[#cca566]/10">
            <span className="text-[8px] text-amber-300/90 font-mono">+{formatSilver(cpc)}/klik</span>
            <span className="text-[8px] text-green-300/90 font-mono">+{formatSilver(cps)}/dtk</span>
          </div>
          {legacyPoints > 0 && (
            <div className="text-[7px] text-purple-400 font-mono mt-0.5">Rebirth: {legacyPoints} (+{legacyPoints * 10}%)</div>
          )}
        </div>

        {/* TOP-RIGHT: Rebirth button & popup */}
        <div className="absolute top-3 right-3 z-20">
          <button
            onClick={() => { setShowPrestigeMenu(p => !p); setUpgradeFabOpen(false); setGachaFabOpen(false); }}
            className="w-7 h-7 rounded-full flex items-center justify-center border transition-all hover:scale-105 active:scale-95 cursor-pointer"
            style={{
              borderColor: canPrestige ? '#f59e0b' : '#3a2e22',
              background: canPrestige ? 'rgba(120,60,0,0.35)' : 'rgba(0,0,0,0.3)',
              color: canPrestige ? '#fbbf24' : '#4a3c2a',
              boxShadow: canPrestige ? '0 0 8px rgba(251,191,36,0.4)' : 'none',
            }}
            title="Rebirth"
          >
            <RefreshCw size={11} className={canPrestige ? 'animate-spin-slow' : ''} />
          </button>

          {/* Rebirth dropdown */}
          {showPrestigeMenu && (
            <div className="absolute top-full right-0 mt-1.5 rpg-panel-stone p-3 w-52 border border-amber-700/40 z-30 animate-fade-in text-left">
              <div className="text-[8px] rpg-font-retro text-amber-400 mb-2">REBIRTH</div>
              <div className="space-y-1 text-[8px] text-slate-300 mb-3">
                <div className="flex justify-between">
                  <span>Poin didapat</span>
                  <span className="text-purple-300 font-bold">+{earnedLegacy}</span>
                </div>
                <div className="flex justify-between">
                  <span>Syarat</span>
                  <span className="font-mono">{formatSilver(PRESTIGE_THRESHOLD)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Keping perak</span>
                  <span className={`font-mono font-bold ${canPrestige ? 'text-green-400' : 'text-red-400'}`}>{formatSilver(silver)}</span>
                </div>
              </div>
              <div className="text-[7px] text-slate-400 mb-2.5 leading-snug">Reset keping dan upgrade Anda untuk mendapatkan bonus CPS permanen (+10% per poin). Companion Anda akan tetap disimpan.</div>
              {canPrestige ? (
                <div className="flex gap-1">
                  <button onClick={handlePrestige}
                    className="rpg-btn-game flex-1 py-1 text-[8px]"
                    style={{ color: '#fca5a5', borderColor: '#ef4444' }}>
                    Konfirmasi
                  </button>
                  <button onClick={() => setShowPrestigeMenu(false)} className="rpg-btn-game py-1 px-2 text-[8px]">
                    <X size={10} />
                  </button>
                </div>
              ) : (
                <div className="text-[7px] text-slate-500 text-center font-semibold">
                  Butuh {formatSilver(Math.max(0, PRESTIGE_THRESHOLD - silver))} lagi
                </div>
              )}
            </div>
          )}
        </div>

        {/* Window decoration (top-right area, same as Cozy Room) */}
        <div className="absolute top-10 right-8 w-16 h-12 border-2 border-[#5a3d28] bg-cyan-950/60 rounded flex items-center justify-center shadow-inner">
          <div className="w-[1px] h-full bg-[#5a3d28]" />
          <div className="h-[1px] w-full bg-[#5a3d28] absolute" />
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-cyan-400/20 to-transparent pointer-events-none" />
        </div>

        {/* Bookshelf decoration (top-left, same as Cozy Room) */}
        <div className="absolute top-14 left-6 w-20 h-10 bg-red-950 border border-red-900 rounded-s-sm flex items-center justify-end">
          <div className="w-6 h-full bg-amber-100 rounded-s-xs border-r border-red-950" />
        </div>

        {/* Shadow ellipse under character */}
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-32 h-16 bg-[#3a2215]/80 rounded-full border border-[#5a3d28]/30 -z-10" />

        {/* Jackpot label */}
        {isJackpot && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[8px] rpg-font-retro text-white z-10 border border-purple-400"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#9333ea)', boxShadow: '0 0 10px rgba(124,58,237,0.6)' }}>
            JACKPOT x5
          </div>
        )}

        {/* CENTER: Clickable character */}
        <div
          onClick={handleClick}
          className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer z-10"
          style={{ paddingBottom: '48px', paddingTop: '64px' }}
        >
          <div
            className="transition-transform duration-75"
            style={{ transform: clickAnim ? 'scale(1.18) translateY(-6px)' : 'scale(1)' }}
          >
            <SpriteRenderer
              base={currentProfile.sprite_json.base}
              hair={currentProfile.sprite_json.hair}
              outfit={currentProfile.sprite_json.outfit}
              accessory={currentProfile.sprite_json.accessory}
              petId={currentProfile.pet_id}
              size={96}
            />
          </div>

          {/* Status bubble */}
          {currentProfile.current_status && (
            <div className="mt-2 bg-[#fdf6e2] text-stone-900 border-2 border-[#5a3d28] px-3 py-0.5 rounded text-[9px] font-bold shadow-md max-w-[180px] text-center relative pointer-events-none">
              {currentProfile.current_status}
              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#fdf6e2] border-t-2 border-l-2 border-[#5a3d28] rotate-45"></div>
            </div>
          )}

          {/* Floating click numbers */}
          {floatingNums.map(fn => (
            <div key={fn.id} className="absolute pointer-events-none font-bold text-sm"
              style={{
                left: fn.x, top: fn.y - 20,
                color: fn.v.includes('x') ? '#d946ef' : '#fbbf24',
                textShadow: '0 0 6px rgba(0,0,0,0.9)',
                zIndex: 100,
                animation: 'floatUp 1.1s ease-out forwards',
                whiteSpace: 'nowrap',
              }}>
              {fn.v}
            </div>
          ))}
        </div>

        {/* COMPANION SPRITE IN COZY ROOM */}
        {equippedId && (
          <>
            <div className="absolute bottom-14 left-[65%] -translate-x-1/2 w-14 h-4 bg-[#3a2215]/60 rounded-full -z-10 pointer-events-none" />
            <div className="absolute bottom-16 left-[65%] -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none">
              {companionImages[equippedId] ? (
                <img
                  src={companionImages[equippedId]}
                  alt={equippedDef?.name}
                  className="w-12 h-12 object-contain animate-bounce"
                  style={{
                    imageRendering: 'pixelated',
                    animationDuration: '2.5s',
                    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
                  }}
                />
              ) : (
                <div className="w-10 h-10 rounded-full flex items-center justify-center border-2 animate-bounce bg-[#1a1510]/95"
                  style={{
                    animationDuration: '2.5s',
                    borderColor: equippedDef?.color || '#cca566',
                    color: equippedDef?.color || '#cca566',
                    boxShadow: `0 0 8px ${equippedDef?.glowColor || 'rgba(0,0,0,0.3)'}`,
                  }}
                >
                  <Star size={16} />
                </div>
              )}
              <div className="bg-black/75 px-1.5 py-0.5 rounded text-[5px] font-mono font-bold text-slate-300 mt-1 uppercase tracking-wider border border-[#cca566]/20">
                {equippedDef?.name}
              </div>
            </div>
          </>
        )}

        {/* Pull result toast (modal card) */}
        {showPullToast && lastPull && (
          <div
            onClick={() => setShowPullToast(false)}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-3 rounded-lg border text-center animate-fade-in cursor-pointer z-30 shadow-2xl flex flex-col items-center gap-1 min-w-[150px]"
            style={{
              background: 'linear-gradient(to bottom, #241a14 0%, #160f0b 100%)',
              borderColor: RARITY_STYLE[lastPull.rarity].border,
              boxShadow: `0 0 15px ${lastPull.glowColor}`,
            }}
          >
            <div className="text-[7px] rpg-font-retro text-amber-500/80 mb-0.5">COMPANION DIDAPAT!</div>
            <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-1 overflow-hidden"
              style={{ background: `${lastPull.color}15`, border: `1px solid ${lastPull.color}40` }}>
              {companionImages[lastPull.id] ? (
                <img src={companionImages[lastPull.id]} alt={lastPull.name} className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
              ) : (
                <Star size={20} style={{ color: lastPull.color }} />
              )}
            </div>
            <div className="text-xs font-bold text-white leading-none">{lastPull.name}</div>
            <div className="text-[8px] font-bold tracking-wider" style={{ color: RARITY_STYLE[lastPull.rarity].textColor }}>
              {RARITY_STYLE[lastPull.rarity].label.toUpperCase()}
            </div>
          </div>
        )}

        {/* BOTTOM FOOTER (same style as Cozy Room) */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-[#cca566]/20 bg-black/50 px-3 py-1.5 flex justify-between items-center text-[8px] rounded-b">
          <span className="font-mono" style={{ color: equippedDef ? equippedDef.color : '#3a3020' }}>
            {equippedDef ? equippedDef.name : 'Belum ada companion'}
          </span>
          <span className="text-slate-400 font-mono">{currentProfile.role}</span>
        </div>

        {/* ── LEFT FAB: Upgrade ── */}
        <div className="absolute z-[19]" style={{ bottom: '40px', left: '16px' }}>
          {/* Sub-buttons fan out */}
          {UPGRADE_DEFS.map((def, i) => {
            const angle = 90 - i * 28;
            const pos = arcPos(angle, FAB_RADIUS);
            const level = upgrades[def.id];
            const cost = upgradeCost(def.baseCost, def.mult, level, disc);
            const afford = silver >= cost;

            return (
              <div
                key={def.id}
                style={{
                  position: 'absolute',
                  bottom: '4px',
                  left: '4px',
                  transform: upgradeFabOpen
                    ? `translate(${pos.x}px, ${pos.y}px) scale(1)`
                    : 'translate(0, 0) scale(0)',
                  opacity: upgradeFabOpen ? 1 : 0,
                  pointerEvents: upgradeFabOpen ? 'auto' : 'none',
                  transition: `transform 0.22s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.04}s, opacity 0.18s ease ${i * 0.04}s`,
                  zIndex: 21,
                }}
              >
                {/* Tooltip */}
                {hoveredBtn === def.id && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#1c1510] border border-[#cca566]/30 text-white rounded px-2 py-1 text-[8px] leading-tight whitespace-nowrap z-50 text-center shadow-lg pointer-events-none">
                    <div className="font-bold text-yellow-300">{def.name}</div>
                    <div className="font-mono text-[7px] text-amber-200/90">{def.detailFn(level)} ({def.desc})</div>
                    <div className="text-[7px] font-mono mt-0.5 font-bold" style={{ color: afford ? '#4ade80' : '#f87171' }}>
                      Harga: {formatSilver(cost)} perak
                    </div>
                  </div>
                )}
                <button
                  onClick={() => { handleBuy(def.id); }}
                  onMouseEnter={() => setHoveredBtn(def.id)}
                  onMouseLeave={() => setHoveredBtn(null)}
                  disabled={!afford}
                  className="w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all hover:scale-110 active:scale-95 cursor-pointer"
                  style={{
                    background: `${def.color}18`,
                    borderColor: afford ? def.color : '#3a2e22',
                    color: afford ? def.color : '#3a2e22',
                  }}
                >
                  <def.Icon size={14} />
                </button>

                {/* Price label below the button */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 bg-black/85 px-1 py-0.5 rounded text-[5px] font-mono font-bold border pointer-events-none whitespace-nowrap"
                  style={{
                    color: afford ? '#4ade80' : '#f87171',
                    borderColor: afford ? '#4ade8030' : '#f8717130',
                  }}
                >
                  {formatSilver(cost)}
                </div>
              </div>
            );
          })}

          {/* Main upgrade FAB */}
          <button
            onClick={() => { setUpgradeFabOpen(p => !p); setGachaFabOpen(false); setShowPrestigeMenu(false); }}
            className="w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            style={{
              position: 'relative', zIndex: 22,
              background: upgradeFabOpen ? '#92400e' : 'rgba(28,21,16,0.95)',
              borderColor: '#92400e',
              color: upgradeFabOpen ? '#fff' : '#fbbf24',
              transform: upgradeFabOpen ? 'rotate(45deg)' : 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
            }}
            title="Upgrade"
          >
            <Wrench size={18} />
          </button>
        </div>

        {/* ── RIGHT FAB: Gacha ── */}
        <div className="absolute z-[19]" style={{ bottom: '40px', right: '16px' }}>
          {/* Sub-buttons */}
          {(['companion', 'pull'] as const).map((action, i) => {
            const angle = action === 'companion' ? 155 : 115;
            const pos = arcPos(angle, FAB_RADIUS);
            const isPull = action === 'pull';
            const canPull = silver >= PULL_COST;
            const label = isPull ? 'Tarik Companion' : 'Companion Inventory';
            const color = isPull ? '#a78bfa' : '#60a5fa';
            const Icon = isPull ? Dices : Users;

            return (
              <div
                key={action}
                style={{
                  position: 'absolute',
                  bottom: '4px',
                  right: '4px',
                  transform: gachaFabOpen
                    ? `translate(${pos.x}px, ${pos.y}px) scale(1)`
                    : 'translate(0, 0) scale(0)',
                  opacity: gachaFabOpen ? 1 : 0,
                  pointerEvents: gachaFabOpen ? 'auto' : 'none',
                  transition: `transform 0.22s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.05}s, opacity 0.18s ease ${i * 0.05}s`,
                  zIndex: 21,
                }}
              >
                {/* Tooltip */}
                {hoveredBtn === `g_${action}` && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#1c1510] border border-[#cca566]/30 text-white rounded px-2 py-1 text-[8px] leading-tight whitespace-nowrap z-50 text-center shadow-lg pointer-events-none">
                    <div className="font-bold text-yellow-300">{label}</div>
                    {isPull ? (
                      <div className="text-[7px] font-mono mt-0.5 font-bold" style={{ color: canPull ? '#4ade80' : '#f87171' }}>
                        Harga: {formatSilver(PULL_COST)} perak
                      </div>
                    ) : (
                      <div className="text-[7px] text-slate-400 font-mono mt-0.5">Lihat & pasang companion</div>
                    )}
                  </div>
                )}
                <button
                  onClick={() => {
                    if (isPull) { handlePull(); }
                    else { setShowCompanionModal(true); setGachaFabOpen(false); }
                  }}
                  onMouseEnter={() => setHoveredBtn(`g_${action}`)}
                  onMouseLeave={() => setHoveredBtn(null)}
                  disabled={isPull && !canPull}
                  className="w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all hover:scale-110 active:scale-95 cursor-pointer"
                  style={{
                    background: `${color}18`,
                    borderColor: isPull && !canPull ? '#3a2e22' : color,
                    color: isPull && !canPull ? '#3a2e22' : color,
                  }}
                >
                  <Icon size={14} />
                </button>

                {/* Price label below the button for Gacha Pull */}
                {isPull && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 bg-black/85 px-1 py-0.5 rounded text-[5px] font-mono font-bold border pointer-events-none whitespace-nowrap"
                    style={{
                      color: canPull ? '#4ade80' : '#f87171',
                      borderColor: canPull ? '#4ade8030' : '#f8717130',
                    }}
                  >
                    {formatSilver(PULL_COST)}
                  </div>
                )}
              </div>
            );
          })}

          {/* Main gacha FAB */}
          <button
            onClick={() => { setGachaFabOpen(p => !p); setUpgradeFabOpen(false); setShowPrestigeMenu(false); }}
            className="w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            style={{
              position: 'relative', zIndex: 22,
              background: gachaFabOpen ? '#6d28d9' : 'rgba(28,21,16,0.95)',
              borderColor: '#6d28d9',
              color: gachaFabOpen ? '#fff' : '#a78bfa',
              transform: gachaFabOpen ? 'rotate(45deg)' : 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
            }}
            title="Gacha Companion"
          >
            <Sparkles size={18} />
          </button>
        </div>

      </div>{/* end main panel */}

      {/* ── COMPANION MODAL ── */}
      {showCompanionModal && (
        <div
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
          onClick={() => setShowCompanionModal(false)}
        >
          <div
            className="rpg-panel-stone w-full max-w-md max-h-[80vh] overflow-y-auto p-4 relative text-left"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="rpg-font-retro text-[9px] text-amber-500">COMPANION INVENTORY</span>
              <button
                onClick={() => setShowCompanionModal(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center border border-slate-600 text-slate-400 hover:border-slate-400 cursor-pointer"
              >
                <X size={11} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {COMPANIONS.map(c => {
                const owned   = ownedCompanions.includes(c.id);
                const equipped = equippedId === c.id;
                const img     = companionImages[c.id];

                return (
                  <div
                    key={c.id}
                    className={`p-3 rounded-lg border-2 flex flex-col gap-2 transition-all ${!owned ? 'opacity-30 saturate-0' : ''}`}
                    style={{
                      background: owned ? RARITY_STYLE[c.rarity].bg : 'rgba(28,21,16,0.6)',
                      borderColor: equipped ? c.color : RARITY_STYLE[c.rarity].border,
                      boxShadow: equipped ? `0 0 10px ${c.glowColor}` : 'none',
                    }}
                  >
                    {/* Header */}
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center"
                        style={{ background: `${c.color}15`, border: `1px solid ${c.color}40` }}>
                        {img
                          ? <img src={img} alt={c.name} className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
                          : <Star size={16} style={{ color: c.color }} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[9px] font-bold text-yellow-100 truncate">{c.name}</div>
                        <div className="text-[7px] font-bold" style={{ color: RARITY_STYLE[c.rarity].textColor }}>{RARITY_STYLE[c.rarity].label}</div>
                      </div>
                    </div>

                    {/* Ability */}
                    <div className="text-[7px] text-slate-400 leading-snug">
                      <span className="font-bold" style={{ color: c.color }}>{c.abilityName}: </span>{c.abilityDesc}
                    </div>

                    {/* Action */}
                    {owned
                      ? <button
                          onClick={() => handleEquip(c.id)}
                          className="rpg-btn-game w-full py-1 text-[8px] font-bold cursor-pointer"
                          style={equipped ? { background: c.color, color: '#000', borderColor: c.color } : {}}
                        >
                          {equipped ? 'LEPAS' : 'PASANG'}
                        </button>
                      : <div className="text-[7px] text-slate-600 text-center font-bold">BELUM DIMILIKI</div>
                    }
                  </div>
                );
              })}
            </div>

            {/* Drop rates */}
            <div className="mt-3 pt-3 border-t border-slate-700/40">
              <div className="text-[7px] rpg-font-retro text-slate-500 mb-1.5">PELUANG GACHA</div>
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { label: 'Basic 50%',     color: '#a8a29e' },
                  { label: 'Common 25%',    color: '#94a3b8' },
                  { label: 'Uncommon 15%',  color: '#4ade80' },
                  { label: 'Rare 8%',       color: '#60a5fa' },
                  { label: 'Epic 2%',       color: '#d946ef' },
                ].map(r => (
                  <span key={r.label} className="text-[7px] font-bold px-1.5 py-0.5 rounded border"
                    style={{ color: r.color, borderColor: `${r.color}40`, background: `${r.color}10` }}>
                    {r.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
