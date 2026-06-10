import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Profile, WerewolfRoomState, WerewolfPlayer, WerewolfRole, WerewolfAwakeRole } from '../lib/supabase';
import { db } from '../lib/supabase';
import { SpriteRenderer } from './SpriteRenderer';
import { playClick, playSelect } from '../lib/audio';
import { ArrowLeft, Moon, Sun, Shuffle, RotateCcw, Send, Skull, Crown } from 'lucide-react';

// ============================================================
// CONSTANTS & HELPERS
// ============================================================
const ROOM_ID = 'werewolf_main';
const MAX_PLAYER_SLOTS = 20;


const ROLE_LABELS: Record<WerewolfRole, { label: string; color: string; icon: string; desc: string }> = {
  villager:  { label: 'Villager',  color: '#78c17a', icon: '🧑‍🌾', desc: 'Warga desa biasa. Temukan serigala!' },
  werewolf:  { label: 'Werewolf',  color: '#ef4444', icon: '🐺', desc: 'Makan villager setiap malam!' },
  seer:      { label: 'Seer',      color: '#a78bfa', icon: '🔮', desc: 'Lihat peran pemain lain setiap malam.' },
  guardian:  { label: 'Guardian',  color: '#60a5fa', icon: '🛡️', desc: 'Lindungi satu pemain setiap malam.' },
  hunter:    { label: 'Hunter',    color: '#fb923c', icon: '🏹', desc: 'Tembak seseorang saat dieliminasi.' },
  cupid:     { label: 'Cupid',     color: '#f472b6', icon: '💘', desc: 'Tentukan sepasang kekasih di awal game.' },
};

const AWAKE_ROLE_INFO: Record<WerewolfAwakeRole, { label: string; bg: string }> = {
  none:      { label: 'Semua Tidur',        bg: '#1e1e2e' },
  werewolf:  { label: 'Werewolf Bangun',    bg: '#7f1d1d' },
  seer:      { label: 'Seer Bangun',        bg: '#2e1065' },
  guardian:  { label: 'Guardian Bangun',    bg: '#1e3a5f' },
};

function getCircularPosition(index: number, total: number, cx: number, cy: number, rx: number, ry: number) {
  const angle = (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
  return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
}

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDefaultState(): WerewolfRoomState {
  return {
    room_id: ROOM_ID,
    status: 'lobby',
    moderator_id: null,
    game_phase: 'day',
    active_awake_role: 'none',
    players: [],
    role_config: { werewolves: 2, guardians: 1, seers: 1, has_hunter: false, has_cupid: false },
  };
}

// ============================================================
// PROPS
// ============================================================
interface WerewolfGameProps {
  currentProfile: Profile;
  profiles: Profile[];
  onExit: () => void;
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export const WerewolfGame: React.FC<WerewolfGameProps> = ({ currentProfile, profiles: _profiles, onExit }) => {
  const [gameState, setGameState] = useState<WerewolfRoomState>(buildDefaultState());
  const [loading, setLoading] = useState(true);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Moderator cursor
  const [modCursor, setModCursor] = useState<{ x: number; y: number } | null>(null);
  const modCursorRef = useRef<{ x: number; y: number } | null>(null);
  const lastCursorBroadcastRef = useRef(0);

  // Moderator "/" chat bubble
  const [showModChat, setShowModChat] = useState(false);
  const [modChatInput, setModChatInput] = useState('');
  const [modChatBubble, setModChatBubble] = useState<{ text: string; x: number; y: number } | null>(null);
  const modChatTimerRef = useRef<any>(null);

  // Ghost chat
  const [ghostChatMessages, setGhostChatMessages] = useState<{ id: string; name: string; text: string }[]>([]);
  const [ghostChatInput, setGhostChatInput] = useState('');
  const ghostChatEndRef = useRef<HTMLDivElement>(null);

  // Pointing states
  const [isPointing, setIsPointing] = useState(false);
  const [pointingTargetId, setPointingTargetId] = useState<string | null>(null);
  const [localMouseCoords, setLocalMouseCoords] = useState<{ x: number; y: number } | null>(null);
  const [pointingMap, setPointingMap] = useState<Record<string, { pointing_to: string | null; x: number | null; y: number | null } | null>>({});
  const lastPointingBroadcastRef = useRef(0);

  // Pointing canvas & dimensions
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 700, height: 500 });

  // Generate stable stars once to prevent visual vibration/re-positioning on re-render
  const stars = useMemo(() => {
    return Array.from({ length: 80 }).map((_, i) => ({
      id: i,
      width: Math.random() * 2 + 0.5,
      height: Math.random() * 2 + 0.5,
      left: Math.random() * 100,
      top: Math.random() * 100,
      opacity: Math.random() * 0.5 + 0.05,
      animDuration: Math.random() * 4 + 2,
    }));
  }, []);

  const blackoutStars = useMemo(() => {
    return Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      width: Math.random() * 1.5 + 1.5,
      height: Math.random() * 1.5 + 1.5,
      left: Math.random() * 100,
      top: Math.random() * 100,
      opacity: Math.random() * 0.5 + 0.1,
      animDuration: Math.random() * 2 + 2,
    }));
  }, []);

  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // Derived: moderator / player status
  const isModerator = gameState.moderator_id === currentProfile.id;
  // Find myself by player_id (not array index)
  const myPlayer = gameState.players.find(p => p.player_id === currentProfile.id) ?? null;
  const isPlayer = myPlayer !== null;
  const isAlive = myPlayer?.is_alive ?? true;
  const isGhost = isPlayer && !isAlive;
  const myRole = myPlayer?.role ?? null;

  // My seat index (the slot number I'm sitting in)
  const mySeatIndex: number = myPlayer?.seat_index ?? -1;


  // Can see through night blackout?
  const canSeeThrough = isModerator || isGhost;


  const isBlackedOut = !canSeeThrough
    && gameState.status === 'playing'
    && gameState.game_phase === 'night'
    && (() => {
      if (gameState.active_awake_role === 'none') return true;
      if (!myRole) return true;
      return gameState.active_awake_role !== myRole;
    })();

  // ──────────────────────────────────────────────────────────
  // LOAD STATE ON MOUNT
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    db.getWerewolfState(ROOM_ID).then(saved => {
      if (saved) setGameState(saved);
      setLoading(false);
    });
  }, []);

  // ──────────────────────────────────────────────────────────
  // REALTIME SUBSCRIBE
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = db.subscribe((msg) => {
      if (msg.type === 'werewolf_state_sync') {
        if (msg.payload.roomId === ROOM_ID) setGameState(msg.payload.state);
      } else if (msg.type === 'werewolf_cursor_sync') {
        setModCursor({ x: msg.payload.x, y: msg.payload.y });
        modCursorRef.current = { x: msg.payload.x, y: msg.payload.y };
      } else if (msg.type === 'werewolf_mod_chat') {
        const { text, x, y } = msg.payload;
        setModChatBubble({ text, x, y });
        clearTimeout(modChatTimerRef.current);
        modChatTimerRef.current = setTimeout(() => setModChatBubble(null), 4000);
      } else if (msg.type === 'werewolf_ghost_chat') {
        const { id, name, text } = msg.payload;
        setGhostChatMessages(prev => prev.some(m => m.id === id) ? prev : [...prev, { id, name, text }]);
      } else if (msg.type === 'werewolf_pointing_sync') {
        const { from, pointing_to, x, y } = msg.payload;
        setPointingMap(prev => ({ ...prev, [from]: { pointing_to, x, y } }));
      }
    });
    return () => { unsub(); clearTimeout(modChatTimerRef.current); };
  }, []);

  useEffect(() => {
    if (gameState.status === 'lobby') {
      setPointingMap({});
      setIsPointing(false);
      setPointingTargetId(null);
      setLocalMouseCoords(null);
      setGhostChatMessages([]);
      setModCursor(null);
      setModChatBubble(null);
    }
  }, [gameState.status, gameState.players.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      setDimensions({
        width: container.clientWidth,
        height: container.clientHeight
      });
    });
    observer.observe(container);
    // Initial size trigger
    setDimensions({
      width: container.clientWidth,
      height: container.clientHeight
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => { ghostChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [ghostChatMessages]);

  // ──────────────────────────────────────────────────────────
  // POINTING VECTORS CANVAS
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const state = gameStateRef.current;
    if (state.status !== 'playing') return;
    const total = state.players.length;
    if (total === 0) return;

    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    const rx = Math.min(canvas.width, canvas.height) * 0.36;
    const ry = rx * 0.75;

    const drawArm = (c: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, isMe: boolean) => {
      const dx = toX - fromX;
      const dy = toY - fromY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 15) return;

      const angle = Math.atan2(dy, dx);

      c.save();
      
      // Outline of the arm (black)
      c.strokeStyle = '#1e1e2e'; 
      c.lineWidth = isMe ? 14 : 10;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(fromX, fromY);
      c.lineTo(toX, toY);
      c.stroke();

      // Inner color of the arm (sleeve color)
      c.strokeStyle = isMe ? '#f59e0b' : '#64748b'; 
      c.lineWidth = isMe ? 8 : 5;
      c.beginPath();
      c.moveTo(fromX, fromY);
      
      const stopDist = isMe ? 22 : 16;
      const armEndX = fromX + (dist - stopDist) * Math.cos(angle);
      const armEndY = fromY + (dist - stopDist) * Math.sin(angle);
      c.lineTo(armEndX, armEndY);
      c.stroke();

      // Wrist/Cuff (White shirt edge)
      c.strokeStyle = '#ffffff';
      c.lineWidth = isMe ? 8 : 5;
      c.beginPath();
      c.moveTo(armEndX, armEndY);
      const cuffEndX = fromX + (dist - stopDist + 4) * Math.cos(angle);
      const cuffEndY = fromY + (dist - stopDist + 4) * Math.sin(angle);
      c.lineTo(cuffEndX, cuffEndY);
      c.stroke();

      // Hand/Skin section
      c.strokeStyle = '#fed7aa'; 
      c.lineWidth = isMe ? 6 : 4;
      c.beginPath();
      c.moveTo(cuffEndX, cuffEndY);
      c.lineTo(toX, toY);
      c.stroke();

      // Pointing hand emoji
      c.translate(toX, toY);
      c.rotate(angle);
      
      c.fillStyle = '#ffffff';
      c.font = isMe ? '24px serif' : '16px serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('👉', isMe ? -12 : -8, 0);

      c.restore();
    };

    // 1. Draw other players' lines (from pointingMap)
    Object.entries(pointingMap).forEach(([fromId, data]) => {
      if (fromId === currentProfile.id && isPointing) return; // drawn locally below
      if (!data) return;

      const { pointing_to, x, y } = data;
      if (!pointing_to && (x === null || y === null)) return;

      const fromIdx = state.players.findIndex(p => p.player_id === fromId);
      if (fromIdx === -1) return;

      const sender = state.players[fromIdx];
      if (!sender.is_alive) return;

      // Night phase filter
      if (state.game_phase === 'night') {
        if (!canSeeThrough) {
          const activeAwake = state.active_awake_role;
          if (activeAwake === 'none') return;
          if (sender.role !== activeAwake || myRole !== activeAwake) return;
        }
      }

      const from = getCircularPosition(fromIdx, total, cx, cy, rx, ry);
      let toX = 0;
      let toY = 0;

      if (pointing_to) {
        const toIdx = state.players.findIndex(p => p.player_id === pointing_to);
        if (toIdx !== -1) {
          const target = state.players[toIdx];
          if (target.is_alive) {
            const toPos = getCircularPosition(toIdx, total, cx, cy, rx, ry);
            toX = toPos.x;
            toY = toPos.y;
          }
        }
      } else if (x !== null && y !== null) {
        toX = cx + x * rx;
        toY = cy + y * ry;
      }

      if (toX !== 0 && toY !== 0) {
        drawArm(ctx, from.x, from.y, toX, toY, false);
      }
    });

    // 2. Draw my own local line (if actively pointing)
    if (isPointing) {
      const myIdx = state.players.findIndex(p => p.player_id === currentProfile.id);
      if (myIdx !== -1) {
        const from = getCircularPosition(myIdx, total, cx, cy, rx, ry);
        let toX = 0;
        let toY = 0;
        
        if (pointingTargetId) {
          const targetIdx = state.players.findIndex(p => p.player_id === pointingTargetId);
          if (targetIdx !== -1) {
            const targetPos = getCircularPosition(targetIdx, total, cx, cy, rx, ry);
            toX = targetPos.x;
            toY = targetPos.y;
          }
        } else if (localMouseCoords) {
          toX = localMouseCoords.x;
          toY = localMouseCoords.y;
        }
        
        if (toX !== 0 && toY !== 0) {
          drawArm(ctx, from.x, from.y, toX, toY, true);
        }
      }
    }
  }, [
    gameState.players,
    gameState.game_phase,
    gameState.active_awake_role,
    gameState.status,
    canSeeThrough,
    myRole,
    pointingMap,
    isPointing,
    pointingTargetId,
    localMouseCoords,
    currentProfile.id,
    dimensions.width,
    dimensions.height
  ]);

  // ──────────────────────────────────────────────────────────
  // MOD CURSOR TRACKING
  // ──────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isModerator) return;
    const now = Date.now();
    if (now - lastCursorBroadcastRef.current < 50) return;
    lastCursorBroadcastRef.current = now;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    db.broadcast('werewolf_cursor_sync', {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top)  / rect.height) * 100,
    });
  }, [isModerator]);

  // ──────────────────────────────────────────────────────────
  // MOD "/" KEY CHAT
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isModerator) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !showModChat) { e.preventDefault(); setShowModChat(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isModerator, showModChat]);

  const sendModChat = () => {
    const text = modChatInput.trim();
    if (!text) return;
    const cur = modCursorRef.current ?? { x: 50, y: 50 };
    db.broadcast('werewolf_mod_chat', { text, x: cur.x, y: cur.y });
    setModChatInput('');
    setShowModChat(false);
  };

  // ──────────────────────────────────────────────────────────
  // STATE UPDATER
  // ──────────────────────────────────────────────────────────
  const updateAndSaveState = (updater: (prev: WerewolfRoomState) => WerewolfRoomState) => {
    const next = updater(gameStateRef.current);
    gameStateRef.current = next;
    setGameState(next);
    db.saveWerewolfState(ROOM_ID, next);
  };
  const updateState = updateAndSaveState;

  // ──────────────────────────────────────────────────────────
  // SEAT ACTIONS
  // ──────────────────────────────────────────────────────────

  /** Claim / release the Moderator throne.
   *  If currently a player, auto-leave the player seat first. */
  const claimModSeat = () => {
    // Release mod seat
    if (isModerator) {
      playClick();
      updateState(prev => ({ ...prev, moderator_id: null }));
      return;
    }
    // Mod seat taken by someone else
    if (gameState.moderator_id !== null) return;
    playClick();
    // Auto-leave player seat if occupied
    updateState(prev => ({
      ...prev,
      moderator_id: currentProfile.id,
      players: prev.players.filter(p => p.player_id !== currentProfile.id),
    }));
  };

  /** Sit in (or leave) a specific player slot 0..MAX_PLAYER_SLOTS-1. */
  const claimPlayerSeat = (slotIndex: number) => {
    const occupant = gameState.players.find(p => p.seat_index === slotIndex);

    // My own seat → leave
    if (occupant?.player_id === currentProfile.id) {
      playSelect();
      updateState(prev => ({
        ...prev,
        players: prev.players.filter(p => p.player_id !== currentProfile.id),
      }));
      return;
    }
    // Occupied by someone else → ignore
    if (occupant) return;
    // Moderator can't sit as player
    if (isModerator) return;
    playSelect();

    const newPlayer: WerewolfPlayer = {
      player_id: currentProfile.id,
      name: currentProfile.name.split(' ')[0],
      avatar: currentProfile.sprite_json,
      seat_index: slotIndex,
      role: 'villager',
      is_alive: true,
      pointing_to: null,
    };

    updateState(prev => ({
      ...prev,
      // Remove existing seat (if any) then add new one
      players: [...prev.players.filter(p => p.player_id !== currentProfile.id), newPlayer],
    }));
  };


  // ──────────────────────────────────────────────────────────
  // ROLE CONFIG (Moderator only)
  // ──────────────────────────────────────────────────────────
  const adjustRole = (field: 'werewolves' | 'guardians' | 'seers', delta: number) => {
    updateState(prev => ({
      ...prev,
      role_config: { ...prev.role_config, [field]: Math.max(0, prev.role_config[field] + delta) },
    }));
  };

  const toggleBool = (field: 'has_hunter' | 'has_cupid') => {
    updateState(prev => ({
      ...prev,
      role_config: { ...prev.role_config, [field]: !prev.role_config[field] },
    }));
  };

  const totalSpecial = () => {
    const rc = gameState.role_config;
    return rc.werewolves + rc.guardians + rc.seers + (rc.has_hunter ? 1 : 0) + (rc.has_cupid ? 1 : 0);
  };

  const isConfigValid = () => totalSpecial() <= gameState.players.length && gameState.players.length >= 2;


  // ──────────────────────────────────────────────────────────
  // START GAME — Fisher-Yates shuffle
  // ──────────────────────────────────────────────────────────
  const startGame = () => {
    if (!isModerator || !isConfigValid()) return;
    playClick();
    const rc = gameState.role_config;
    const roles: WerewolfRole[] = [
      ...Array(rc.werewolves).fill('werewolf'),
      ...Array(rc.guardians).fill('guardian'),
      ...Array(rc.seers).fill('seer'),
      ...(rc.has_hunter ? ['hunter' as WerewolfRole] : []),
      ...(rc.has_cupid  ? ['cupid'  as WerewolfRole] : []),
    ];
    while (roles.length < gameState.players.length) roles.push('villager');
    // Build roles list sorted by seat_index so consistent assignment
    const sortedPlayers = [...gameState.players].sort((a, b) => (a.seat_index ?? 99) - (b.seat_index ?? 99));
    const shuffled = fisherYatesShuffle(roles);

    updateState(prev => ({
      ...prev,
      status: 'playing',
      game_phase: 'day',
      active_awake_role: 'none',
      players: sortedPlayers.map((p, i) => ({ ...p, role: shuffled[i], is_alive: true, pointing_to: null })),
    }));
  };


  // ──────────────────────────────────────────────────────────
  // MODERATOR CONTROLS
  // ──────────────────────────────────────────────────────────
  const setPhase = (phase: 'day' | 'night') => {
    playClick();
    updateState(prev => ({ ...prev, game_phase: phase, active_awake_role: phase === 'day' ? 'none' : prev.active_awake_role }));
  };

  const setAwakeRole = (role: WerewolfAwakeRole) => {
    playClick();
    updateState(prev => ({ ...prev, active_awake_role: role }));
  };

  const eliminatePlayer = (playerId: string) => {
    playClick();
    updateState(prev => ({
      ...prev,
      players: prev.players.map(p => p.player_id === playerId ? { ...p, is_alive: false, pointing_to: null } : p)
    }));
  };

  const revivePlayer = (playerId: string) => {
    playClick();
    updateState(prev => ({
      ...prev,
      players: prev.players.map(p => p.player_id === playerId ? { ...p, is_alive: true } : p)
    }));
  };

  // ──────────────────────────────────────────────────────────
  // POINTING INTERACTIONS (CLICK & DRAG / HOVER)
  // ──────────────────────────────────────────────────────────
  const getMousePos = (e: React.MouseEvent | React.TouchEvent) => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    
    let clientX = 0;
    let clientY = 0;
    
    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const findHoveredPlayerId = (mouseX: number, mouseY: number) => {
    const state = gameStateRef.current;
    if (state.status !== 'playing') return null;
    const total = state.players.length;
    if (total === 0) return null;
    
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    const rx = Math.min(canvas.width, canvas.height) * 0.36;
    const ry = rx * 0.75;
    
    for (let i = 0; i < total; i++) {
      const player = state.players[i];
      if (player.player_id === currentProfile.id || !player.is_alive) continue;
      
      const pos = getCircularPosition(i, total, cx, cy, rx, ry);
      const dx = mouseX - pos.x;
      const dy = mouseY - pos.y;
      const distSq = dx * dx + dy * dy;
      
      if (distSq < 32 * 32) {
        return player.player_id;
      }
    }
    return null;
  };

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    if (gameState.status !== 'playing' || !isPlayer || !isAlive || isModerator) return;
    e.preventDefault();
    const pos = getMousePos(e);
    if (!pos) return;
    
    setIsPointing(true);
    setLocalMouseCoords(pos);
    
    const hoveredId = findHoveredPlayerId(pos.x, pos.y);
    setPointingTargetId(hoveredId);
    
    const container = containerRef.current;
    let xRel = 0;
    let yRel = 0;
    if (container) {
      const width = container.clientWidth;
      const height = container.clientHeight;
      const cx = width * 0.5;
      const cy = height * 0.5;
      const rx = Math.min(width, height) * 0.36;
      const ry = rx * 0.75;
      xRel = rx !== 0 ? (pos.x - cx) / rx : 0;
      yRel = ry !== 0 ? (pos.y - cy) / ry : 0;
    }
    
    lastPointingBroadcastRef.current = Date.now();
    db.broadcast('werewolf_pointing_sync', {
      from: currentProfile.id,
      pointing_to: hoveredId,
      x: hoveredId ? null : xRel,
      y: hoveredId ? null : yRel
    });
  };

  const handleContainerMouseMove = (e: React.MouseEvent) => {
    if (!isPointing) return;
    e.preventDefault();
    const pos = getMousePos(e);
    if (!pos) return;
    
    setLocalMouseCoords(pos);
    
    const hoveredId = findHoveredPlayerId(pos.x, pos.y);
    setPointingTargetId(hoveredId);
    
    const now = Date.now();
    if (now - lastPointingBroadcastRef.current > 60 || hoveredId !== pointingTargetId) {
      lastPointingBroadcastRef.current = now;
      
      const container = containerRef.current;
      let xRel = 0;
      let yRel = 0;
      if (container) {
        const width = container.clientWidth;
        const height = container.clientHeight;
        const cx = width * 0.5;
        const cy = height * 0.5;
        const rx = Math.min(width, height) * 0.36;
        const ry = rx * 0.75;
        xRel = rx !== 0 ? (pos.x - cx) / rx : 0;
        yRel = ry !== 0 ? (pos.y - cy) / ry : 0;
      }
      
      db.broadcast('werewolf_pointing_sync', {
        from: currentProfile.id,
        pointing_to: hoveredId,
        x: hoveredId ? null : xRel,
        y: hoveredId ? null : yRel
      });
    }
  };

  const handleContainerMouseUp = () => {
    if (!isPointing) return;
    setIsPointing(false);
    setPointingTargetId(null);
    setLocalMouseCoords(null);
    
    db.broadcast('werewolf_pointing_sync', {
      from: currentProfile.id,
      pointing_to: null,
      x: null,
      y: null
    });
  };

  const handleContainerMouseLeave = () => {
    handleContainerMouseUp();
  };

  const handleContainerTouchStart = (e: React.TouchEvent) => {
    if (gameState.status !== 'playing' || !isPlayer || !isAlive || isModerator) return;
    const pos = getMousePos(e);
    if (!pos) return;
    
    setIsPointing(true);
    setLocalMouseCoords(pos);
    
    const hoveredId = findHoveredPlayerId(pos.x, pos.y);
    setPointingTargetId(hoveredId);
    
    const container = containerRef.current;
    let xRel = 0;
    let yRel = 0;
    if (container) {
      const width = container.clientWidth;
      const height = container.clientHeight;
      const cx = width * 0.5;
      const cy = height * 0.5;
      const rx = Math.min(width, height) * 0.36;
      const ry = rx * 0.75;
      xRel = rx !== 0 ? (pos.x - cx) / rx : 0;
      yRel = ry !== 0 ? (pos.y - cy) / ry : 0;
    }
    
    lastPointingBroadcastRef.current = Date.now();
    db.broadcast('werewolf_pointing_sync', {
      from: currentProfile.id,
      pointing_to: hoveredId,
      x: hoveredId ? null : xRel,
      y: hoveredId ? null : yRel
    });
  };

  const handleContainerTouchMove = (e: React.TouchEvent) => {
    if (!isPointing) return;
    if (e.cancelable) e.preventDefault();
    const pos = getMousePos(e);
    if (!pos) return;
    
    setLocalMouseCoords(pos);
    
    const hoveredId = findHoveredPlayerId(pos.x, pos.y);
    setPointingTargetId(hoveredId);
    
    const now = Date.now();
    if (now - lastPointingBroadcastRef.current > 60 || hoveredId !== pointingTargetId) {
      lastPointingBroadcastRef.current = now;
      
      const container = containerRef.current;
      let xRel = 0;
      let yRel = 0;
      if (container) {
        const width = container.clientWidth;
        const height = container.clientHeight;
        const cx = width * 0.5;
        const cy = height * 0.5;
        const rx = Math.min(width, height) * 0.36;
        const ry = rx * 0.75;
        xRel = rx !== 0 ? (pos.x - cx) / rx : 0;
        yRel = ry !== 0 ? (pos.y - cy) / ry : 0;
      }
      
      db.broadcast('werewolf_pointing_sync', {
        from: currentProfile.id,
        pointing_to: hoveredId,
        x: hoveredId ? null : xRel,
        y: hoveredId ? null : yRel
      });
    }
  };

  // ──────────────────────────────────────────────────────────
  // GHOST CHAT
  // ──────────────────────────────────────────────────────────
  const sendGhostChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = ghostChatInput.trim();
    if (!text) return;
    const msg = { id: `${currentProfile.id}_${Date.now()}`, name: currentProfile.name.split(' ')[0], text };
    db.broadcast('werewolf_ghost_chat', msg);
    setGhostChatInput('');
  };

  // ──────────────────────────────────────────────────────────
  // EXIT GUARDRAIL
  // ──────────────────────────────────────────────────────────
  const handleExitClick = () => {
    playClick();
    if (gameState.status === 'playing' && myPlayer?.is_alive) {
      setShowExitConfirm(true);
    } else {
      doExit();
    }
  };

  const doExit = () => {
    if (myPlayer?.is_alive && gameState.status === 'playing') eliminatePlayer(currentProfile.id);
    if (isModerator) updateState(prev => ({ ...prev, moderator_id: null }));
    onExit();
  };

  // ──────────────────────────────────────────────────────────
  // RESET SESSION
  // ──────────────────────────────────────────────────────────
  const resetSession = () => {
    if (!isModerator) return;
    playClick();
    updateState(() => ({ ...buildDefaultState(), moderator_id: currentProfile.id }));
    setGhostChatMessages([]);
  };

  // ──────────────────────────────────────────────────────────
  // LAYOUT — always show 20 seat slots in lobby
  // ──────────────────────────────────────────────────────────
  const TOTAL_SLOTS = MAX_PLAYER_SLOTS;


  // ──────────────────────────────────────────────────────────
  // LOADING
  // ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#0b0b14] flex items-center justify-center z-[100]">
        <div className="text-amber-400 rpg-font-retro text-lg animate-pulse">Membuka Pintu Werewolf...</div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────
  // BLACKOUT OVERLAY
  // ──────────────────────────────────────────────────────────
  const renderBlackout = () => {
    if (!isBlackedOut) return null;
    return (
      <div
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none overflow-hidden"
        style={{ background: '#000' }}
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        {/* Stars */}
        {blackoutStars.map((star) => (
          <div
            key={star.id}
            className="absolute rounded-full bg-white"
            style={{
              width: `${star.width}px`,
              height: `${star.height}px`,
              left: `${star.left}%`,
              top: `${star.top}%`,
              opacity: star.opacity,
              animation: `pulse ${star.animDuration}s ease-in-out infinite`
            }}
          />
        ))}
        <div className="flex flex-col items-center gap-6 z-10">
          <div className="text-[100px] leading-none" style={{ filter: 'drop-shadow(0 0 30px rgba(120,60,220,0.7))' }}>😴</div>
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold tracking-widest" style={{ color: '#c084fc', textShadow: '0 0 20px rgba(192,132,252,0.8)', fontFamily: 'serif' }}>
              Malam Telah Tiba
            </h2>
            <p className="text-purple-300 text-lg font-semibold">Tutup Mata Anda!</p>
            <p className="text-purple-600 text-sm font-mono mt-4">✨ Tunggu Instruksi Moderator ✨</p>
          </div>
        </div>
      </div>
    );
  };

  // ──────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[100] overflow-hidden select-none"
      style={{ background: 'radial-gradient(ellipse at 50% 40%, #13112a 0%, #0a0a12 100%)', touchAction: 'none' }}
      onMouseMove={handleMouseMove}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* Starfield */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {stars.map((star) => (
          <div
            key={star.id}
            className="absolute rounded-full bg-white"
            style={{
              width: `${star.width}px`,
              height: `${star.height}px`,
              left: `${star.left}%`,
              top: `${star.top}%`,
              opacity: star.opacity,
              animation: `pulse ${star.animDuration}s ease-in-out infinite`
            }}
          />
        ))}
      </div>

      {/* ── TOP LEFT: Back ── */}
      <button
        onClick={handleExitClick}
        className="absolute top-4 left-4 z-[10000] flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-slate-600 bg-black/70 text-slate-300 hover:border-amber-500 hover:text-amber-400 transition-all cursor-pointer text-sm font-bold backdrop-blur-sm"
      >
        <ArrowLeft size={16} /> Kembali
      </button>

      {/* ── TOP CENTER: Title ── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[10000] text-center pointer-events-none">
        <div className="text-amber-400 font-bold text-xl tracking-widest" style={{ fontFamily: 'serif', textShadow: '0 0 15px rgba(251,191,36,0.5)' }}>🐺 WEREWOLF</div>
        <div className="text-slate-500 text-[10px] font-mono tracking-widest mt-0.5">SEMI-MANUAL PARTY ENGINE</div>
      </div>

      {/* ── TOP RIGHT: Phase indicator ── */}
      <div className="absolute top-4 right-4 z-[10000] flex flex-col items-end gap-2">
        {gameState.status === 'playing' && (
          <>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border-2 font-bold text-sm ${gameState.game_phase === 'night' ? 'border-purple-700 bg-purple-950/80 text-purple-300' : 'border-amber-600 bg-amber-950/80 text-amber-300'}`}>
              {gameState.game_phase === 'night' ? <Moon size={14} /> : <Sun size={14} />}
              <span className="uppercase tracking-widest text-xs">{gameState.game_phase === 'night' ? 'Malam' : 'Siang'}</span>
            </div>
            {gameState.game_phase === 'night' && (
              <div className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest" style={{ background: AWAKE_ROLE_INFO[gameState.active_awake_role].bg, color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.15)' }}>
                {AWAKE_ROLE_INFO[gameState.active_awake_role].label}
              </div>
            )}
          </>
        )}
        <div className="text-slate-600 text-[10px] font-mono">{gameState.players.filter(p => p.is_alive).length}/{gameState.players.length} Hidup</div>
      </div>

      {/* ── MAIN CANVAS AREA ── */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ paddingTop: 64, paddingBottom: 90 }}
        onMouseDown={handleContainerMouseDown}
        onMouseMove={handleContainerMouseMove}
        onMouseUp={handleContainerMouseUp}
        onMouseLeave={handleContainerMouseLeave}
        onTouchStart={handleContainerTouchStart}
        onTouchMove={handleContainerTouchMove}
        onTouchEnd={handleContainerMouseUp}
      >
        {/* Pointing vectors canvas */}
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }} />

        {/* ═══════════════════════════════════════════════════
            LOBBY VIEW — Seat Selection UI
        ═══════════════════════════════════════════════════ */}
        {gameState.status === 'lobby' && (
          <div className="w-full h-full flex flex-col lg:flex-row gap-4 px-4 items-center justify-center" style={{ zIndex: 2 }}>

            {/* LEFT: Seat ring */}
            <div className="flex-shrink-0 relative" style={{ width: 420, height: 420 }}>
              <svg className="absolute inset-0 pointer-events-none" width="420" height="420">
                <circle cx={210} cy={210} r={158} fill="none" stroke="rgba(251,191,36,0.08)" strokeWidth="1" strokeDasharray="4 6" />
              </svg>

              {/* Moderator Throne (top, outside circle) */}
              <div className="absolute" style={{ left: '50%', top: 0, transform: 'translate(-50%, -8px)' }}>
                <button
                  onClick={claimModSeat}
                  disabled={gameState.moderator_id !== null && !isModerator}
                  title={
                    isModerator ? 'Klik untuk melepas kursi Moderator' :
                    gameState.moderator_id !== null ? 'Sudah ada Moderator' :
                    isPlayer ? 'Kamu akan otomatis keluar dari kursi pemain' :
                    'Duduk sebagai Moderator'
                  }
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border-2 transition-all cursor-pointer
                    ${
                      isModerator
                        ? 'border-amber-400 bg-amber-900/60 shadow-[0_0_20px_rgba(251,191,36,0.4)]'
                        : gameState.moderator_id !== null
                          ? 'border-amber-800/50 bg-amber-950/40 opacity-70 cursor-not-allowed'
                          : 'border-amber-600/60 bg-amber-950/30 hover:border-amber-400 hover:bg-amber-900/40 hover:shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                    }
                  `}
                >
                  <Crown size={20} className={isModerator ? 'text-amber-300' : 'text-amber-600'} />
                  {isModerator ? (
                    <div className="text-center">
                      <div className="text-amber-300 text-[9px] font-bold">KAMU (Mod)</div>
                      <div className="text-amber-600 text-[8px] font-mono">klik utk lepas</div>
                    </div>
                  ) : gameState.moderator_id !== null ? (
                    <div className="text-center">
                      <div className="text-amber-500 text-[9px] font-bold">👑 Terisi</div>
                      <div className="text-amber-700 text-[8px] font-mono">Moderator</div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-amber-500 text-[9px] font-bold">{isPlayer ? '⚠ Akan Pindah' : '🪑 Kosong'}</div>
                      <div className="text-amber-700 text-[8px] font-mono">Moderator</div>
                    </div>
                  )}
                </button>
              </div>

              {/* Player seats in circle — always 20 slots */}
              {Array.from({ length: TOTAL_SLOTS }).map((_, slotIdx) => {
                const angle = (slotIdx / TOTAL_SLOTS) * 2 * Math.PI - Math.PI / 2;
                const px = 210 + 158 * Math.cos(angle);
                const py = 210 + 158 * Math.sin(angle);
                // Look up by seat_index field
                const occupant = gameState.players.find(p => p.seat_index === slotIdx);
                const isMySlot = occupant?.player_id === currentProfile.id;
                const isEmpty = !occupant;
                const canSit = !isModerator && isEmpty;

                return (
                  <div
                    key={slotIdx}
                    className="absolute"
                    style={{ left: px, top: py, transform: 'translate(-50%, -50%)', zIndex: 3 }}
                  >
                    <button
                      onClick={() => claimPlayerSeat(slotIdx)}
                      disabled={!isMySlot && !canSit}
                      title={isModerator ? 'Moderator tidak bisa duduk sebagai pemain' : isEmpty ? `Duduk di kursi ${slotIdx + 1}` : isMySlot ? 'Klik untuk berdiri' : `Ditempati ${occupant?.name}`}
                      className={`flex flex-col items-center gap-0.5 transition-all rounded-full
                        ${isEmpty && !isModerator
                          ? 'cursor-pointer hover:scale-110 active:scale-95'
                          : isMySlot
                            ? 'cursor-pointer hover:scale-105'
                            : 'cursor-default'}
                      `}
                    >
                      {isEmpty ? (
                        // Empty seat
                        <div className={`w-11 h-11 rounded-full border-2 flex items-center justify-center transition-all
                          ${isModerator ? 'border-slate-800/50 bg-slate-950/30 opacity-40' : 'border-dashed border-slate-600/60 bg-slate-900/40 hover:border-amber-500/60 hover:bg-amber-950/20'}
                        `}>
                          <span className="text-lg opacity-50">🪑</span>
                        </div>
                      ) : (
                        // Occupied seat
                        <div className={`w-12 h-12 rounded-full border-2 overflow-hidden transition-all bg-[#1b1613]
                          ${isMySlot
                            ? 'border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.5)] hover:border-red-400'
                            : 'border-slate-500/60'}
                        `}>
                          <SpriteRenderer
                            base={occupant.avatar.base}
                            hair={occupant.avatar.hair}
                            outfit={occupant.avatar.outfit}
                            accessory={occupant.avatar.accessory}
                            petId="none"
                            size={48}
                          />
                        </div>
                      )}
                      <span className={`text-[8px] font-bold ${isEmpty ? 'text-slate-700' : isMySlot ? 'text-amber-400' : 'text-slate-400'}`}>
                        {isEmpty ? `#${slotIdx + 1}` : occupant.name}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* RIGHT: Lobby Panel */}
            <div className="flex-1 max-w-sm space-y-4">
              <div className="rounded-2xl border border-slate-700/60 bg-black/60 backdrop-blur-md p-5 space-y-4" style={{ boxShadow: '0 0 40px rgba(0,0,0,0.8), 0 0 60px rgba(139,92,246,0.1)' }}>
                <div className="text-center">
                  <h2 className="text-amber-400 font-bold text-lg tracking-widest" style={{ fontFamily: 'serif' }}>🎮 Lobby</h2>
                  <p className="text-slate-500 text-[10px] mt-0.5">Duduk di bangku untuk bergabung</p>
                </div>

                {/* Status cards */}
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className={`rounded-lg border px-3 py-2 ${
                    isModerator ? 'border-amber-600/60 bg-amber-950/40' : 'border-slate-700/40 bg-slate-900/30'
                  }`}>
                    <div className="text-slate-500 font-mono">Moderator</div>
                    <div className={`font-bold ${
                      isModerator ? 'text-amber-300' : gameState.moderator_id ? 'text-amber-500' : 'text-slate-600'
                    }`}>
                      {isModerator ? '👑 Kamu' : gameState.moderator_id ? '✓ Terisi' : '— Kosong'}
                    </div>
                  </div>
                  <div className={`rounded-lg border px-3 py-2 ${
                    mySeatIndex >= 0 ? 'border-emerald-600/60 bg-emerald-950/40' : 'border-slate-700/40 bg-slate-900/30'
                  }`}>
                    <div className="text-slate-500 font-mono">Status Kamu</div>
                    <div className={`font-bold ${
                      isModerator ? 'text-amber-300' : mySeatIndex >= 0 ? 'text-emerald-400' : 'text-slate-600'
                    }`}>
                      {isModerator ? '👑 Moderator' : mySeatIndex >= 0 ? `🧑 Pemain #${mySeatIndex + 1}` : '— Nonton'}
                    </div>
                  </div>
                </div>

                {/* Role config (mod only) */}
                {isModerator && (
                  <div className="space-y-2">
                    <div className="text-slate-400 text-[10px] uppercase tracking-widest font-bold flex items-center gap-1">
                      <Shuffle size={10} /> Konfigurasi Peran
                      {totalSpecial() > gameState.players.length && <span className="text-red-400 ml-1">⚠ Melebihi jumlah pemain!</span>}
                    </div>

                    {(['werewolves', 'guardians', 'seers'] as const).map(field => (
                      <div key={field} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-1.5 border border-white/10">
                        <span className="text-slate-300 text-[11px] flex items-center gap-1.5">
                          {field === 'werewolves' ? '🐺' : field === 'guardians' ? '🛡️' : '🔮'}
                          {field === 'werewolves' ? 'Werewolf' : field === 'guardians' ? 'Guardian' : 'Seer'}
                        </span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => adjustRole(field, -1)} className="w-5 h-5 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs cursor-pointer flex items-center justify-center">−</button>
                          <span className="text-amber-400 font-bold text-sm w-4 text-center">{gameState.role_config[field]}</span>
                          <button onClick={() => adjustRole(field, 1)} className="w-5 h-5 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs cursor-pointer flex items-center justify-center">+</button>
                        </div>
                      </div>
                    ))}

                    {(['has_hunter', 'has_cupid'] as const).map(field => (
                      <div key={field} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-1.5 border border-white/10">
                        <span className="text-slate-300 text-[11px] flex items-center gap-1.5">
                          {field === 'has_hunter' ? '🏹' : '💘'}{field === 'has_hunter' ? 'Hunter' : 'Cupid'}
                        </span>
                        <button
                          onClick={() => toggleBool(field)}
                          className={`w-9 h-5 rounded-full transition-colors cursor-pointer relative ${gameState.role_config[field] ? 'bg-emerald-600' : 'bg-slate-700'}`}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${gameState.role_config[field] ? 'right-0.5' : 'left-0.5'}`} />
                        </button>
                      </div>
                    ))}

                    <div className="text-right text-[9px] font-mono text-slate-600">
                      Total: {totalSpecial()} / {gameState.players.length} pemain
                    </div>

                    <button
                      onClick={startGame}
                      disabled={!isConfigValid()}
                      className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer border ${isConfigValid() ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white border-amber-500/50 shadow-lg' : 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'}`}
                    >
                      🎲 Mulai Game!
                    </button>
                  </div>
                )}

                {!isModerator && !isPlayer && (
                  <p className="text-slate-600 text-[10px] text-center italic">Klik bangku di sebelah kiri untuk duduk sebagai pemain, atau duduk di kursi Moderator (👑 atas).</p>
                )}
                {!isModerator && isPlayer && (
                  <p className="text-slate-500 text-[10px] text-center">Kamu sudah duduk sebagai pemain. Tunggu Moderator memulai game!</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            PLAYING VIEW — Circular avatars
        ═══════════════════════════════════════════════════ */}
        {gameState.status === 'playing' && (() => {
          const total = gameState.players.length;
          const canvasW = dimensions.width;
          const canvasH = dimensions.height;
          const cx = canvasW / 2;
          const cy = canvasH / 2;
          const rx = Math.min(canvasW, canvasH) * 0.36;
          const ry = rx * 0.75;

          return (
            <div className="absolute inset-0" style={{ zIndex: 2 }}>
              {gameState.players.map((player, idx) => {
                const pos = getCircularPosition(idx, total, cx, cy, rx, ry);
                const isMe = player.player_id === currentProfile.id;
                const showRole = isMe || isModerator;
                const roleInfo = ROLE_LABELS[player.role];

                let eyeBadge: string | null = null;
                if (gameState.game_phase === 'night' && canSeeThrough) {
                  const awake = gameState.active_awake_role !== 'none' && player.role === gameState.active_awake_role;
                  if (player.is_alive) eyeBadge = awake ? '🟢' : '🔴';
                }

                return (
                  <div key={player.player_id} className="absolute" style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)', zIndex: 3 }}>
                    <div
                      className={`flex flex-col items-center gap-0.5 select-none transition-all ${!player.is_alive ? 'opacity-40 grayscale' : ''} ${pointingTargetId === player.player_id ? 'scale-110' : ''}`}
                    >
                      {/* Avatar */}
                      <div className={`relative w-13 h-13 rounded-full overflow-hidden border-2 bg-[#1b1613] transition-all ${isMe ? 'border-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.5)]' : 'border-slate-600/80'} ${pointingTargetId === player.player_id ? 'border-red-400' : ''}`}
                        style={{ width: 52, height: 52 }}>
                        <SpriteRenderer base={player.avatar.base} hair={player.avatar.hair} outfit={player.avatar.outfit} accessory={player.avatar.accessory} petId="none" size={48} />
                        {!player.is_alive && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                            <Skull size={18} className="text-slate-500" />
                          </div>
                        )}
                      </div>
                      <div className="text-[9px] font-bold text-slate-200 truncate max-w-[68px] text-center">{player.name}</div>
                      {showRole && (
                        <div className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${roleInfo.color}22`, color: roleInfo.color, border: `1px solid ${roleInfo.color}44` }}>
                          {roleInfo.icon} {roleInfo.label}
                        </div>
                      )}
                      {!showRole && <div className="text-[8px] text-slate-700 font-mono">???</div>}
                      {eyeBadge && <div className="text-xs">{eyeBadge}</div>}

                      {/* Mod buttons */}
                      {isModerator && player.is_alive && (
                        <button onClick={(e) => { e.stopPropagation(); eliminatePlayer(player.player_id); }}
                          className="text-[8px] font-bold text-red-400 hover:text-red-300 bg-black/60 border border-red-900/40 rounded px-1.5 py-0.5 cursor-pointer mt-0.5">
                          Eliminasi
                        </button>
                      )}
                      {isModerator && !player.is_alive && (
                        <button onClick={(e) => { e.stopPropagation(); revivePlayer(player.player_id); }}
                          className="text-[8px] font-bold text-green-400 hover:text-green-300 bg-black/60 border border-green-900/40 rounded px-1.5 py-0.5 cursor-pointer mt-0.5">
                          Hidupkan
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* ── MODERATOR CURSOR (peers) ── */}
      {!isModerator && modCursor && gameState.status === 'playing' && (
        <div className="fixed pointer-events-none z-[9990]" style={{ left: `${modCursor.x}%`, top: `${modCursor.y}%`, transform: 'translate(-4px, -4px)' }}>
          <div className="relative">
            <div className="w-4 h-4 rounded-full border-2 border-amber-400 bg-amber-400/30 shadow-[0_0_10px_rgba(251,191,36,0.6)]" />
            <div className="absolute -bottom-5 left-4 whitespace-nowrap text-[8px] font-bold text-amber-300 bg-black/80 px-1 rounded">👁 Mod</div>
          </div>
        </div>
      )}

      {/* ── MOD CHAT BUBBLE ── */}
      {modChatBubble && (
        <div className="fixed pointer-events-none z-[9995]" style={{ left: `${modChatBubble.x}%`, top: `${modChatBubble.y}%`, transform: 'translate(-50%, -120%)' }}>
          <div className="bg-amber-900/95 border-2 border-amber-500/60 rounded-2xl px-4 py-2 text-amber-200 text-sm font-semibold max-w-[200px] shadow-2xl">
            💬 {modChatBubble.text}
          </div>
        </div>
      )}

      {/* ── MOD "/" CHAT INPUT ── */}
      {showModChat && isModerator && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-[#1b1613] border-2 border-amber-600/60 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 w-80">
            <div className="text-amber-400 text-xs font-bold uppercase tracking-widest">📢 Pesan Moderator</div>
            <div className="flex gap-2">
              <input autoFocus value={modChatInput} onChange={e => setModChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendModChat(); if (e.key === 'Escape') setShowModChat(false); }}
                placeholder="Ketik pesan..." className="flex-1 bg-black/60 text-white border border-amber-900/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
              <button onClick={sendModChat} className="px-3 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-lg cursor-pointer"><Send size={14} /></button>
            </div>
            <button onClick={() => setShowModChat(false)} className="text-slate-600 text-xs text-center hover:text-slate-400 cursor-pointer">ESC untuk batal</button>
          </div>
        </div>
      )}

      {/* ── MODERATOR GAME CONTROLS (bottom bar) ── */}
      {isModerator && gameState.status === 'playing' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[10000] flex flex-wrap items-center justify-center gap-2 px-4">
          <button onClick={() => setPhase(gameState.game_phase === 'day' ? 'night' : 'day')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 font-bold text-xs cursor-pointer transition-all ${gameState.game_phase === 'night' ? 'border-amber-600 bg-amber-950/80 text-amber-300 hover:bg-amber-900/80' : 'border-purple-700 bg-purple-950/80 text-purple-300 hover:bg-purple-900/80'}`}>
            {gameState.game_phase === 'day' ? <Moon size={13} /> : <Sun size={13} />}
            {gameState.game_phase === 'day' ? 'Matikan Semua' : 'Siang Hari'}
          </button>

          {gameState.game_phase === 'night' && (
            <>
              <button onClick={() => setAwakeRole('none')}
                className={`px-2.5 py-2 rounded-lg border text-xs font-bold cursor-pointer ${gameState.active_awake_role === 'none' ? 'border-slate-400 bg-slate-700 text-white' : 'border-slate-700 bg-slate-900/80 text-slate-400 hover:border-slate-500'}`}>
                🌑 Semua Tidur
              </button>
              <button onClick={() => setAwakeRole('werewolf')}
                className={`px-2.5 py-2 rounded-lg border text-xs font-bold cursor-pointer ${gameState.active_awake_role === 'werewolf' ? 'border-red-500 bg-red-950 text-red-300' : 'border-red-900/50 bg-slate-900/80 text-slate-400 hover:border-red-700'}`}>
                🐺 Bangunkan Werewolf
              </button>
              <button onClick={() => setAwakeRole('seer')}
                className={`px-2.5 py-2 rounded-lg border text-xs font-bold cursor-pointer ${gameState.active_awake_role === 'seer' ? 'border-purple-500 bg-purple-950 text-purple-300' : 'border-purple-900/50 bg-slate-900/80 text-slate-400 hover:border-purple-700'}`}>
                🔮 Bangunkan Seer
              </button>
              <button onClick={() => setAwakeRole('guardian')}
                className={`px-2.5 py-2 rounded-lg border text-xs font-bold cursor-pointer ${gameState.active_awake_role === 'guardian' ? 'border-blue-500 bg-blue-950 text-blue-300' : 'border-blue-900/50 bg-slate-900/80 text-slate-400 hover:border-blue-700'}`}>
                🛡️ Bangunkan Guardian
              </button>
            </>
          )}

          <div className="text-slate-700 text-[9px] font-mono px-2 border border-slate-800 rounded-lg py-2">
            Tekan <kbd className="text-amber-500">/</kbd> chat
          </div>

          <button onClick={resetSession}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-red-900/60 bg-red-950/50 text-red-400 hover:bg-red-900/40 font-bold text-xs cursor-pointer">
            <RotateCcw size={12} /> Reset Sesi
          </button>
        </div>
      )}

      {/* ── MY ROLE CARD (bottom-left) ── */}
      {gameState.status === 'playing' && myPlayer && myRole && (
        <div className="absolute bottom-4 left-4 z-[10000]">
          <div className="rounded-2xl border px-3 py-2.5 flex items-center gap-3"
            style={{ background: `linear-gradient(135deg, ${ROLE_LABELS[myRole].color}22, #0b0b14)`, borderColor: `${ROLE_LABELS[myRole].color}44`, boxShadow: `0 0 20px ${ROLE_LABELS[myRole].color}22` }}>
            <span className="text-2xl">{ROLE_LABELS[myRole].icon}</span>
            <div>
              <div className="font-bold text-[9px]" style={{ color: ROLE_LABELS[myRole].color }}>PERAN KAMU</div>
              <div className="text-white font-bold text-sm">{ROLE_LABELS[myRole].label}</div>
              <div className="text-slate-500 text-[8px]">{ROLE_LABELS[myRole].desc}</div>
            </div>
            {!myPlayer.is_alive && (
              <div className="ml-1 flex flex-col items-center">
                <Skull size={16} className="text-red-400" />
                <span className="text-red-400 text-[7px] font-bold">GHOST</span>
              </div>
            )}
          </div>
          {myPlayer.is_alive && <div className="text-slate-700 text-[8px] font-mono text-center mt-0.5">Klik & tahan/seret untuk menunjuk</div>}
        </div>
      )}

      {/* ── GHOST CHAT (dead + moderator) ── */}
      {(isGhost || isModerator) && gameState.status === 'playing' && (
        <div className="absolute bottom-4 right-4 z-[10000] w-60">
          <div className="bg-black/90 border border-slate-700/70 rounded-xl overflow-hidden shadow-2xl">
            <div className="px-3 py-2 bg-slate-900/90 border-b border-slate-700/50 flex items-center gap-2">
              <Skull size={11} className="text-purple-400" />
              <span className="text-purple-300 text-[9px] font-bold uppercase tracking-widest">Ghost Chat</span>
              {isModerator && !isGhost && <span className="text-amber-500 text-[8px] font-mono ml-auto">Mod View</span>}
            </div>
            <div className="h-32 overflow-y-auto p-2 space-y-1 no-scrollbar">
              {ghostChatMessages.map(m => (
                <div key={m.id} className="text-[9px]">
                  <span className="text-purple-400 font-bold">{m.name}: </span>
                  <span className="text-slate-300">{m.text}</span>
                </div>
              ))}
              {ghostChatMessages.length === 0 && <div className="text-slate-700 text-[9px] italic text-center mt-4">Hanya arwah yang bisa melihat ini...</div>}
              <div ref={ghostChatEndRef} />
            </div>
            {isGhost && (
              <form onSubmit={sendGhostChat} className="flex border-t border-slate-700/50">
                <input value={ghostChatInput} onChange={e => setGhostChatInput(e.target.value)} placeholder="Bisik arwah..."
                  className="flex-1 bg-transparent text-slate-300 px-2 py-1.5 text-[9px] focus:outline-none placeholder:text-slate-700" />
                <button type="submit" className="px-2 text-purple-400 hover:text-purple-300 cursor-pointer"><Send size={10} /></button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Ghost banner */}
      {isGhost && !isBlackedOut && gameState.status === 'playing' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[9900] pointer-events-none">
          <div className="bg-purple-950/80 border border-purple-700/50 rounded-full px-4 py-1.5 flex items-center gap-2">
            <Skull size={11} className="text-purple-400" />
            <span className="text-purple-300 text-[9px] font-bold">Mode Ghost — kamu sudah dieliminasi</span>
          </div>
        </div>
      )}

      {/* ── EXIT CONFIRM ── */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1b1613] border-2 border-red-700/60 rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4" style={{ boxShadow: '0 0 40px rgba(220,38,38,0.3)' }}>
            <div className="text-center space-y-4">
              <div className="text-4xl">🚪</div>
              <h3 className="text-red-400 font-bold text-lg">Keluar dari Game?</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Apakah kamu yakin ingin keluar? Kamu akan otomatis <span className="text-red-400 font-bold">tereliminasi</span> dari permainan.
              </p>
              <div className="flex gap-3 mt-4">
                <button onClick={() => setShowExitConfirm(false)} className="flex-1 py-2.5 rounded-xl border-2 border-slate-600 bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 cursor-pointer">Batal</button>
                <button onClick={doExit} className="flex-1 py-2.5 rounded-xl border-2 border-red-700 bg-red-950 text-red-300 font-bold text-sm hover:bg-red-900 cursor-pointer">Ya, Keluar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BLACKOUT ── */}
      {renderBlackout()}
    </div>
  );
};
