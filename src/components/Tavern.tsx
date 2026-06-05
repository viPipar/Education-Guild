import React, { useState, useEffect, useRef } from 'react';
import type { Profile, Seat, RpgAsset, Rarity, TavernComment, RoomConfig } from '../lib/supabase';
import { db, isMock, supabase } from '../lib/supabase';
import { RARITY_CONFIG } from './AssetManager';
import { SpriteRenderer } from './SpriteRenderer';
import { Coins, Sparkles, X, Gamepad2, Package, MessageSquare, Send, Brush, Eraser, Trash2, Trophy, Settings, Play, Check, Clock } from 'lucide-react';
import { playClick, playSelect } from '../lib/audio';


const ensureAbsoluteUrl = (url?: string): string => {
  if (!url) return '#';
  const trimmed = url.trim();
  if (/^[a-z]+:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

interface TavernProps {
  currentProfile: Profile;
  profiles: Profile[];
  onRefreshProfiles: () => void;
  onUpdateProfile: (updates: Partial<Profile>) => void;
  onSeatClick?: (seatId: string, isLeave: boolean) => void;
  roomConfig?: RoomConfig;
  onUpdateRoomConfig?: (roomId: string, updates: Partial<RoomConfig>) => void;
}

interface TicTacToeState {
  board: (string | null)[];
  turn: 'X' | 'O';
  playerXId: string | null;
  playerXName: string | null;
  playerOId: string | null;
  playerOName: string | null;
  winner: string | null;
}

interface ChessState {
  board: (string | null)[];
  turn: 'white' | 'black';
  playerWhiteId: string | null;
  playerWhiteName: string | null;
  playerBlackId: string | null;
  playerBlackName: string | null;
  winner: string | null;
  capturedPieces: string[];
}

const INITIAL_CHESS_BOARD = [
  'bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR',
  'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP',
  null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null,
  'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP',
  'wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR'
];

type PackType = 'individual' | 'education' | 'ieee';

export const Tavern: React.FC<TavernProps> = ({
  currentProfile,
  profiles,
  onRefreshProfiles,
  onUpdateProfile,
  onSeatClick,
  roomConfig,
  onUpdateRoomConfig,
}) => {
  const seats = React.useMemo(() => db.getSeatsSync('tavern', profiles), [profiles]);
  
  // Interactive Modals
  const [showGacha, setShowGacha] = useState(false);
  const [showGame, setShowGame] = useState(false);

  // Gacha state
  const [selectedPack, setSelectedPack] = useState<PackType>('individual');
  const [pullResult, setPullResult] = useState<{ asset: RpgAsset; rarity: Rarity; isDuplicate: boolean } | null>(null);
  const [gachaError, setGachaError] = useState('');
  const [gachaPulling, setGachaPulling] = useState(false);
  const [cardRevealed, setCardRevealed] = useState(false);
  const [activeGachaTab, setActiveGachaTab] = useState<'char_pet' | 'cosmetic'>('char_pet');
  const [isFlipped, setIsFlipped] = useState(false);

  // Coin refresh helper
  const [localCoins, setLocalCoins] = useState(currentProfile.coins || 0);
  useEffect(() => {
    setLocalCoins(currentProfile.coins || 0);
  }, [currentProfile.coins]);

  const PACK_INFO: Record<PackType, { label: string; cost: number; desc: string; probs: string }> = {
    individual: { label: 'Individual Pack', cost: 10, desc: 'Peluang Common besar, Legendary kecil.', probs: '60% C · 25% UC · 10% R · 4% E · 1% L' },
    education:  { label: 'Education Pack', cost: 25, desc: 'Peluang seimbang, Rare cukup sering.',   probs: '45% C · 30% UC · 15% R · 7% E · 3% L' },
    ieee:       { label: 'IEEE Pack',       cost: 50, desc: 'Rare–Legendary jauh lebih sering!',     probs: '15% C · 20% UC · 35% R · 20% E · 10% L' },
  };

  const [spectatorIds, setSpectatorIds] = useState<string[]>([]);

  // Anonymous Chat / Evaluation Comment states
  const [commentInput, setCommentInput] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [comments, setComments] = useState<TavernComment[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);

  // Local Discord URL State
  const [localDiscordUrl, setLocalDiscordUrl] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);

  useEffect(() => {
    if (roomConfig?.discord_url !== undefined && !isInputFocused) {
      setLocalDiscordUrl(roomConfig.discord_url);
    }
  }, [roomConfig?.discord_url]);

  const loadComments = async (dateStr: string) => {
    const data = await db.getTavernComments(dateStr);
    setComments(data);
  };

  const loadDates = async () => {
    const dates = await db.getTavernCommentDates();
    const today = new Date().toISOString().split('T')[0];
    const merged = Array.from(new Set([today, ...dates])).sort((a, b) => b.localeCompare(a));
    setAvailableDates(merged);
  };

  useEffect(() => {
    loadComments(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    loadDates();

    const unsubscribe = db.subscribe((msg) => {
      if (msg.type === 'tavern_comment_update') {
        const { comment } = msg.payload;
        if (comment.comment_date === selectedDate) {
          setComments(prev => {
            if (prev.some(c => c.id === comment.id)) return prev;
            return [...prev, comment];
          });
        }
        loadDates();
      }
    });
    return () => unsubscribe();
  }, [selectedDate]);

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;
    playClick();
    const today = new Date().toISOString().split('T')[0];
    const text = commentInput.trim();
    setCommentInput('');
    await db.addTavernComment(text, today);
  };

  // Local chat state
  const [chatMessage, setChatMessage] = useState('');
  const [activeBubbles, setActiveBubbles] = useState<{ [userId: string]: { text: string, timerId: any } }>({});

  // Tic-Tac-Toe Game State
  const [tttState, setTttState] = useState<TicTacToeState>({
    board: Array(9).fill(null),
    turn: 'X',
    playerXId: null,
    playerXName: null,
    playerOId: null,
    playerOName: null,
    winner: null
  });

  // Active Game Tab State
  const [activeGameTab, setActiveGameTab] = useState<'ttt' | 'chess' | 'gartic'>('ttt');

  // Chess Game State
  const [chessState, setChessState] = useState<ChessState>({
    board: [...INITIAL_CHESS_BOARD],
    turn: 'white',
    playerWhiteId: null,
    playerWhiteName: null,
    playerBlackId: null,
    playerBlackName: null,
    winner: null,
    capturedPieces: []
  });
  const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
  const [selectedCaptured, setSelectedCaptured] = useState<{ index: number; code: string } | null>(null);

  // Gartic Game State
  const [garticState, setGarticState] = useState<{
    status: 'idle' | 'active' | 'ended';
    round: number;
    totalRounds: number;
    timer: number;
    totalTimer: number;
    drawerId: string | null;
    drawerName: string | null;
    wordHash: string | null;
    wordLength: number;
    currentWord: string;
    leaderboard: { [profileId: string]: { name: string; score: number; nameColor?: string } };
    correctGuessers: string[];
    baseReward: number;
    words: { id: string; text: string; enabled: boolean }[];
  }>({
    status: 'idle',
    round: 1,
    totalRounds: 3,
    timer: 60,
    totalTimer: 60,
    drawerId: null,
    drawerName: null,
    wordHash: null,
    wordLength: 0,
    currentWord: '',
    leaderboard: {},
    correctGuessers: [],
    baseReward: 100,
    words: [
      { id: '1', text: 'naga', enabled: true },
      { id: '2', text: 'pedang', enabled: true },
      { id: '3', text: 'mahkota', enabled: true },
      { id: '4', text: 'kastil', enabled: true },
      { id: '5', text: 'ramuan', enabled: true },
      { id: '6', text: 'penyihir', enabled: true },
      { id: '7', text: 'koin', enabled: true },
      { id: '8', text: 'gerbong', enabled: true },
      { id: '9', text: 'perahu', enabled: true },
      { id: '10', text: 'taverna', enabled: true }
    ]
  });

  const [garticChat, setGarticChat] = useState<{ id: string; sender: string; text: string; system?: boolean; correct?: boolean }[]>([]);
  const [garticChatInput, setGarticChatInput] = useState('');
  const [garticRevealedWord, setGarticRevealedWord] = useState('');
  const [garticDrawingColor, setGarticDrawingColor] = useState('#fafaf9');
  const [garticDrawingWidth, setGarticDrawingWidth] = useState(3);
  const [garticTool, setGarticTool] = useState<'pen' | 'eraser'>('pen');
  const [presencePlayers, setPresencePlayers] = useState<{ id: string; name: string }[]>([]);
  const [garticShowSettings, setGarticShowSettings] = useState(false);
  const [newWordInput, setNewWordInput] = useState('');

  const garticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isGarticDrawingRef = useRef(false);
  const lastGarticPosRef = useRef<{ x: number; y: number } | null>(null);
  const garticDrawingBufferRef = useRef<{ x: number; y: number }[]>([]);
  const garticTimerIntervalRef = useRef<any>(null);
  const garticStateRef = useRef(garticState);
  const lastBroadcastTimeRef = useRef(0);

  useEffect(() => {
    garticStateRef.current = garticState;
  }, [garticState]);

  // Load Gartic config from db or localStorage
  useEffect(() => {
    const loadGarticConfig = async () => {
      const defaultWords = [
        { id: '1', text: 'naga', enabled: true },
        { id: '2', text: 'pedang', enabled: true },
        { id: '3', text: 'mahkota', enabled: true },
        { id: '4', text: 'kastil', enabled: true },
        { id: '5', text: 'ramuan', enabled: true },
        { id: '6', text: 'penyihir', enabled: true },
        { id: '7', text: 'koin', enabled: true },
        { id: '8', text: 'gerbong', enabled: true },
        { id: '9', text: 'perahu', enabled: true },
        { id: '10', text: 'taverna', enabled: true }
      ];
      if (!isMock && supabase) {
        try {
          const { data, error } = await supabase
            .from('whiteboard_drawings')
            .select('notes')
            .eq('room_id', 'gartic_config')
            .maybeSingle();
          if (error) throw error;
          if (data && data.notes) {
            const config = typeof data.notes === 'string' ? JSON.parse(data.notes) : data.notes;
            setGarticState(prev => ({
              ...prev,
              totalRounds: config.totalRounds ?? prev.totalRounds,
              totalTimer: config.totalTimer ?? prev.totalTimer,
              baseReward: config.baseReward ?? prev.baseReward,
              words: config.words ?? defaultWords
            }));
          }
        } catch (err) {
          console.warn('Failed to load Gartic config from database:', err);
        }
      } else {
        try {
          const saved = localStorage.getItem('rpg_gartic_config');
          if (saved) {
            const config = JSON.parse(saved);
            setGarticState(prev => ({
              ...prev,
              totalRounds: config.totalRounds ?? prev.totalRounds,
              totalTimer: config.totalTimer ?? prev.totalTimer,
              baseReward: config.baseReward ?? prev.baseReward,
              words: config.words ?? defaultWords
            }));
          }
        } catch {}
      }
    };
    loadGarticConfig();
  }, []);

  const saveGarticConfig = async (updatedState: typeof garticState) => {
    const config = {
      totalRounds: updatedState.totalRounds,
      totalTimer: updatedState.totalTimer,
      baseReward: updatedState.baseReward,
      words: updatedState.words
    };
    localStorage.setItem('rpg_gartic_config', JSON.stringify(config));
    if (!isMock && supabase) {
      try {
        await supabase
          .from('whiteboard_drawings')
          .upsert({
            room_id: 'gartic_config',
            notes: config,
            updated_at: new Date().toISOString()
          }, { onConflict: 'room_id' });
      } catch (err) {
        console.error('Failed to save Gartic config to Supabase:', err);
      }
    }
    db.broadcast('gartic_config_sync', config);
  };

  // Real-time Gartic Presence
  useEffect(() => {
    if (activeGameTab !== 'gartic') {
      setPresencePlayers([]);
      return;
    }

    if (isMock || !supabase) {
      const activeProfiles = profiles.filter(p => {
        const diff = Date.now() - new Date(p.last_seen).getTime();
        return diff < 30000;
      }).map(p => ({ id: p.id, name: p.name }));
      setPresencePlayers(activeProfiles);
      return;
    }

    const channel = supabase.channel('rpg_gartic_presence', {
      config: {
        presence: {
          key: currentProfile.id
        }
      }
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const players: { id: string; name: string }[] = [];
        Object.keys(state).forEach(key => {
          const userPresences = state[key] as any;
          if (userPresences && userPresences[0]) {
            players.push({ id: key, name: userPresences[0].name });
          }
        });
        setPresencePlayers(players);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ name: currentProfile.name });
        }
      });

  }, [activeGameTab, profiles, currentProfile.id, currentProfile.name]);

  // Auto-vacate TTT and Chess player slots and spectator status if player claims another seat
  useEffect(() => {
    const isPlayerX = currentProfile.id === tttState.playerXId;
    const isPlayerO = currentProfile.id === tttState.playerOId;
    if ((isPlayerX || isPlayerO) && currentProfile.current_seat_id !== 'tavern_seat_ttt') {
      const newState = { ...tttState };
      if (isPlayerX) {
        newState.playerXId = null;
        newState.playerXName = null;
      }
      if (isPlayerO) {
        newState.playerOId = null;
        newState.playerOName = null;
      }
      if (!newState.playerXId && !newState.playerOId) {
        newState.board = Array(9).fill(null);
        newState.winner = null;
        newState.turn = 'X';
      }
      setTttState(newState);
      db.saveTicTacToeState(newState);
      db.broadcast('tictactoe_sync', { tttState: newState, spectatorIds });
    }
  }, [currentProfile.current_seat_id, tttState.playerXId, tttState.playerOId]);

  useEffect(() => {
    const isWhite = currentProfile.id === chessState.playerWhiteId;
    const isBlack = currentProfile.id === chessState.playerBlackId;
    if ((isWhite || isBlack) && currentProfile.current_seat_id !== 'tavern_seat_chess') {
      const newState = { ...chessState };
      if (isWhite) {
        newState.playerWhiteId = null;
        newState.playerWhiteName = null;
      }
      if (isBlack) {
        newState.playerBlackId = null;
        newState.playerBlackName = null;
      }
      if (!newState.playerWhiteId && !newState.playerBlackId) {
        newState.board = [...INITIAL_CHESS_BOARD];
        newState.winner = null;
        newState.turn = 'white';
        newState.capturedPieces = [];
      }
      setChessState(newState);
      db.saveChessState(newState);
      db.broadcast('chess_sync', { chessState: newState });
    }
  }, [currentProfile.current_seat_id, chessState.playerWhiteId, chessState.playerBlackId]);

  useEffect(() => {
    const isAtTtt = currentProfile.current_seat_id === 'tavern_seat_ttt';
    const isAtChess = currentProfile.current_seat_id === 'tavern_seat_chess';
    if (!isAtTtt && !isAtChess && spectatorIds.includes(currentProfile.id)) {
      setSpectatorIds(prev => {
        const updated = prev.filter(id => id !== currentProfile.id);
        db.broadcast('tictactoe_spectator_leave', { userId: currentProfile.id });
        return updated;
      });
    }
  }, [currentProfile.current_seat_id, spectatorIds]);


  // Game Loop autoritatif (hanya berjalan di klien Director)
  useEffect(() => {
    if (currentProfile.role !== 'Director' || garticState.status !== 'active') {
      return;
    }

    garticTimerIntervalRef.current = setInterval(() => {
      const currentState = garticStateRef.current;
      if (currentState.timer <= 1) {
        clearInterval(garticTimerIntervalRef.current);
        setGarticState(prev => ({ ...prev, timer: 0 }));
        handleGarticRoundTimeout(currentState);
      } else {
        const nextTimer = currentState.timer - 1;
        setGarticState(prev => ({ ...prev, timer: nextTimer }));
        db.broadcast('gartic_timer_tick', { timer: nextTimer });
      }
    }, 1000);

    return () => clearInterval(garticTimerIntervalRef.current);
  }, [garticState.status, garticState.round]);

  const getWordHash = (w: string) => {
    let hash = 0;
    const clean = w.toLowerCase().trim();
    for (let i = 0; i < clean.length; i++) {
      hash = (hash << 5) - hash + clean.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString();
  };

  const handleGarticRoundTimeout = async (currentState: typeof garticState) => {
    clearInterval(garticTimerIntervalRef.current);
    db.broadcast('gartic_end_round', { word: currentState.currentWord, round: currentState.round });

    setTimeout(() => {
      const nextRound = currentState.round + 1;
      if (nextRound <= currentState.totalRounds) {
        const activePlayers = presencePlayers.length > 0 ? presencePlayers : [{ id: currentProfile.id, name: currentProfile.name }];
        const sortedPlayers = [...activePlayers].sort((a, b) => a.id.localeCompare(b.id));
        const nextPlayer = sortedPlayers[(nextRound - 1) % sortedPlayers.length];

        const enabledWords = currentState.words.filter(w => w.enabled);
        const randomWordObj = enabledWords.length > 0 
          ? enabledWords[Math.floor(Math.random() * enabledWords.length)]
          : { text: 'mahkota' };
        const nextWord = randomWordObj.text;

        db.broadcast('gartic_start_round', {
          round: nextRound,
          drawerId: nextPlayer.id,
          drawerName: nextPlayer.name,
          wordHash: getWordHash(nextWord),
          wordLength: nextWord.length,
          totalRounds: currentState.totalRounds,
          duration: currentState.totalTimer,
          baseReward: currentState.baseReward
        });

        db.broadcast('gartic_drawer_word', {
          drawerId: nextPlayer.id,
          word: nextWord
        });
      } else {
        const gameOverTime = Date.now();
        db.broadcast('gartic_game_over', { timestamp: gameOverTime });
        setGarticState(prev => ({ ...prev, status: 'ended' }));
        awardGarticCoins(currentState.leaderboard);
      }
    }, 5000);
  };

  const awardGarticCoins = async (leaderboard: typeof garticState.leaderboard) => {
    const sorted = Object.entries(leaderboard)
      .map(([id, val]) => ({ id, ...val }))
      .sort((a, b) => b.score - a.score);

    const base = garticStateRef.current.baseReward;

    for (let i = 0; i < sorted.length; i++) {
      const player = sorted[i];
      let multiplier = 0;
      if (i === 0) multiplier = 3;
      else if (i === 1) multiplier = 2.5;
      else if (i === 2) multiplier = 2;
      else if (i === 3) multiplier = 1.75;
      else if (i === 4) multiplier = 1.5;
      else if (i >= 5 && i <= 9) multiplier = 1;

      if (multiplier > 0) {
        const rewardCoins = Math.round(base * multiplier);
        const playerProfile = profiles.find(p => p.id === player.id);
        if (playerProfile) {
          const newCoins = (playerProfile.coins || 0) + rewardCoins;
          await db.updateProfile(player.id, { coins: newCoins });
          db.broadcast('gartic_guess', {
            sender: 'Sistem',
            text: `[SISTEM] ${player.name} peringkat ${i+1} mendapatkan ${rewardCoins} koin!`,
            system: true,
            msgId: `reward_${player.id}_${i}_${Date.now()}`
          });
        }
      }
    }
    onRefreshProfiles();
  };

  const startGarticGame = () => {
    if (garticState.status === 'active') return;
    const activePlayers = presencePlayers.length > 0 ? presencePlayers : [{ id: currentProfile.id, name: currentProfile.name }];
    const sortedPlayers = [...activePlayers].sort((a, b) => a.id.localeCompare(b.id));
    const nextPlayer = sortedPlayers[0];

    const enabledWords = garticState.words.filter(w => w.enabled);
    const randomWordObj = enabledWords.length > 0 
      ? enabledWords[Math.floor(Math.random() * enabledWords.length)]
      : { text: 'mahkota' };
    const selectedWord = randomWordObj.text;

    setGarticChat([]);
    
    // Reset Leaderboard
    const resetLeader: typeof garticState.leaderboard = {};
    activePlayers.forEach(p => {
      resetLeader[p.id] = { name: p.name, score: 0 };
    });

    db.broadcast('gartic_start_round', {
      round: 1,
      drawerId: nextPlayer.id,
      drawerName: nextPlayer.name,
      wordHash: getWordHash(selectedWord),
      wordLength: selectedWord.length,
      totalRounds: garticState.totalRounds,
      duration: garticState.totalTimer,
      baseReward: garticState.baseReward,
      leaderboard: resetLeader
    });

    db.broadcast('gartic_drawer_word', {
      drawerId: nextPlayer.id,
      word: selectedWord
    });
  };

  const resetGarticGame = () => {
    if (garticState.status === 'active') return;
    db.broadcast('gartic_reset', {});
  };

  const flushDrawingBuffer = () => {
    const buffer = garticDrawingBufferRef.current;
    if (buffer.length > 0) {
      db.broadcast('gartic_draw', {
        points: buffer,
        color: garticDrawingColor,
        width: garticDrawingWidth,
        tool: garticTool,
        isEnd: false,
        isClear: false
      });
      garticDrawingBufferRef.current = [buffer[buffer.length - 1]];
    }
  };

  const handleDrawMove = (x: number, y: number) => {
    if (!isGarticDrawingRef.current) return;
    garticDrawingBufferRef.current.push({ x, y });

    const now = Date.now();
    if (now - lastBroadcastTimeRef.current > 50) {
      flushDrawingBuffer();
      lastBroadcastTimeRef.current = now;
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (garticState.drawerId !== currentProfile.id || garticState.status !== 'active') return;
    const canvas = garticCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

    isGarticDrawingRef.current = true;
    lastGarticPosRef.current = { x, y };
    garticDrawingBufferRef.current = [{ x, y }];

    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (garticTool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = garticDrawingColor;
      }
      ctx.lineWidth = garticDrawingWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isGarticDrawingRef.current || garticState.drawerId !== currentProfile.id) return;
    const canvas = garticCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(lastGarticPosRef.current!.x, lastGarticPosRef.current!.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    lastGarticPosRef.current = { x, y };
    handleDrawMove(x, y);
  };

  const handleCanvasMouseUpOrLeave = () => {
    if (!isGarticDrawingRef.current) return;
    isGarticDrawingRef.current = false;
    flushDrawingBuffer();
    lastGarticPosRef.current = null;
    db.broadcast('gartic_draw', { points: [], color: '', width: 0, tool: garticTool, isEnd: true, isClear: false });
  };

  const getTouchPos = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = garticCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    return {
      x: ((touch.clientX - rect.left) / rect.width) * canvas.width,
      y: ((touch.clientY - rect.top) / rect.height) * canvas.height
    };
  };

  const handleCanvasTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (garticState.drawerId !== currentProfile.id || garticState.status !== 'active') return;
    e.preventDefault();
    const { x, y } = getTouchPos(e);
    isGarticDrawingRef.current = true;
    lastGarticPosRef.current = { x, y };
    garticDrawingBufferRef.current = [{ x, y }];

    const canvas = garticCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      if (garticTool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = garticDrawingColor;
      }
      ctx.lineWidth = garticDrawingWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const handleCanvasTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isGarticDrawingRef.current || garticState.drawerId !== currentProfile.id) return;
    e.preventDefault();
    const { x, y } = getTouchPos(e);

    const canvas = garticCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(lastGarticPosRef.current!.x, lastGarticPosRef.current!.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    lastGarticPosRef.current = { x, y };
    handleDrawMove(x, y);
  };

  const handleSendGarticGuess = (e: React.FormEvent) => {
    e.preventDefault();
    const rawInput = garticChatInput.trim();
    if (!rawInput || garticState.status !== 'active') return;

    const text = rawInput.toLowerCase();
    setGarticChatInput('');

    if (getWordHash(text) === garticState.wordHash) {
      const timeRemaining = garticState.timer;
      const totalTime = garticState.totalTimer;
      const points = Math.max(10, Math.round((timeRemaining / totalTime) * 100));

      db.broadcast('gartic_guess', {
        sender: currentProfile.name,
        text: 'menjawab dengan benar!',
        correct: true,
        system: true,
        msgId: `correct_${currentProfile.id}_${Date.now()}`
      });
      db.broadcast('gartic_score', {
        userId: currentProfile.id,
        score: points
      });

      setGarticState(prev => ({
        ...prev,
        correctGuessers: [...prev.correctGuessers, currentProfile.id]
      }));
    } else {
      db.broadcast('gartic_guess', {
        sender: currentProfile.name,
        text: rawInput,
        correct: false,
        system: false,
        msgId: `guess_${currentProfile.id}_${Date.now()}_${Math.random()}`
      });
    }
  };

  const handleClearCanvas = () => {
    const canvas = garticCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    db.broadcast('gartic_draw', { points: [], color: '', width: 0, tool: 'pen', isEnd: false, isClear: true });
  };

  const tttStateRef = useRef(tttState);
  const chessStateRef = useRef(chessState);
  const spectatorIdsRef = useRef(spectatorIds);

  useEffect(() => {
    tttStateRef.current = tttState;
  }, [tttState]);

  useEffect(() => {
    chessStateRef.current = chessState;
  }, [chessState]);

  useEffect(() => {
    spectatorIdsRef.current = spectatorIds;
  }, [spectatorIds]);

  // Sync state and listen to broadcasts
  useEffect(() => {
    // Load from DB
    db.getTicTacToeState().then(state => {
      if (state) {
        setTttState(state);
      }
    });

    db.getChessState().then(state => {
      if (state) {
        setChessState({
          ...state,
          capturedPieces: state.capturedPieces || []
        });
      }
    });

    const unsubscribe = db.subscribe((msg) => {
      if (msg.type === 'chat_bubble') {
        triggerBubble(msg.payload.userId, msg.payload.text);
      } else if (msg.type === 'tictactoe_sync') {
        const payloadData = msg.payload;
        if (payloadData.board) {
          setTttState(payloadData);
          localStorage.setItem('rpg_tictactoe_state', JSON.stringify(payloadData));
        } else if (payloadData.tttState) {
          setTttState(payloadData.tttState);
          localStorage.setItem('rpg_tictactoe_state', JSON.stringify(payloadData.tttState));
        }
        if (payloadData.spectatorIds) {
          setSpectatorIds(payloadData.spectatorIds);
        }
      } else if (msg.type === 'chess_sync') {
        const payloadData = msg.payload;
        if (payloadData.chessState) {
          setChessState({
            ...payloadData.chessState,
            capturedPieces: payloadData.chessState.capturedPieces || []
          });
          localStorage.setItem('rpg_chess_state', JSON.stringify(payloadData.chessState));
        }
      } else if (msg.type === 'chess_request_sync') {
        const currentChess = chessStateRef.current;
        const isPlayer = currentProfile.id === currentChess.playerWhiteId || currentProfile.id === currentChess.playerBlackId;
        if (isPlayer) {
          db.broadcast('chess_sync', { chessState: currentChess });
        }
      } else if (msg.type === 'tictactoe_request_sync') {
        // If we are a player, reply to broadcast sync request
        const currentTtt = tttStateRef.current;
        const currentSpecs = spectatorIdsRef.current;
        const isPlayer = currentProfile.id === currentTtt.playerXId || currentProfile.id === currentTtt.playerOId;
        if (isPlayer) {
          db.broadcast('tictactoe_sync', { tttState: currentTtt, spectatorIds: currentSpecs });
        }
      } else if (msg.type === 'tictactoe_spectator_join') {
        const currentTtt = tttStateRef.current;
        setSpectatorIds(prev => {
          const updated = prev.includes(msg.payload.userId) ? prev : [...prev, msg.payload.userId];
          const isPlayer = currentProfile.id === currentTtt.playerXId || currentProfile.id === currentTtt.playerOId;
          if (isPlayer) {
            db.broadcast('tictactoe_sync', { tttState: currentTtt, spectatorIds: updated });
          }
          return updated;
        });
      } else if (msg.type === 'tictactoe_spectator_leave') {
        const currentTtt = tttStateRef.current;
        setSpectatorIds(prev => {
          const updated = prev.filter(id => id !== msg.payload.userId);
          const isPlayer = currentProfile.id === currentTtt.playerXId || currentProfile.id === currentTtt.playerOId;
          if (isPlayer) {
            db.broadcast('tictactoe_sync', { tttState: currentTtt, spectatorIds: updated });
          }
          return updated;
        });
      } else if (msg.type === 'gartic_start_round') {
        const { round, drawerId, drawerName, wordHash, wordLength, totalRounds, duration, baseReward, leaderboard } = msg.payload;
        setGarticRevealedWord('');
        const canvas = garticCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        setGarticState(prev => ({
          ...prev,
          status: 'active',
          round,
          totalRounds,
          drawerId,
          drawerName,
          wordHash,
          wordLength,
          timer: duration,
          totalTimer: duration,
          baseReward,
          currentWord: '',
          correctGuessers: [],
          leaderboard: leaderboard || prev.leaderboard
        }));
        setGarticChat(prev => {
          const msgId = `start_round_${round}`;
          if (prev.some(m => m.id === msgId)) return prev;
          
          const newChat = round === 1 ? [] : [...prev];
          return [
            ...newChat,
            {
              id: msgId,
              sender: 'Sistem',
              text: `Ronde ${round} dimulai! Penggambar: ${drawerName}. Kata terdiri dari ${wordLength} huruf.`,
              system: true
            }
          ];
        });
      } else if (msg.type === 'gartic_drawer_word') {
        const { drawerId, word } = msg.payload;
        if (currentProfile.id === drawerId) {
          setGarticState(prev => ({ ...prev, currentWord: word }));
        }
      } else if (msg.type === 'gartic_timer_tick') {
        const { timer } = msg.payload;
        setGarticState(prev => ({ ...prev, timer }));
      } else if (msg.type === 'gartic_end_round') {
        const { word, round } = msg.payload;
        setGarticState(prev => ({
          ...prev,
          status: 'idle',
          currentWord: word
        }));
        setGarticChat(prev => {
          const msgId = `end_round_${round}_${word}`;
          if (prev.some(m => m.id === msgId)) return prev;
          return [
            ...prev,
            {
              id: msgId,
              sender: 'Sistem',
              text: `Ronde selesai! Katanya adalah: ${word.toUpperCase()}`,
              system: true
            }
          ];
        });
      } else if (msg.type === 'gartic_draw') {
        const { points, color, width, tool, isClear } = msg.payload;
        const currentDrawerId = garticStateRef.current.drawerId;
        if (currentProfile.id !== currentDrawerId) {
          const canvas = garticCanvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              if (isClear) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
              } else if (points && points.length > 0) {
                if (tool === 'eraser') {
                  ctx.globalCompositeOperation = 'destination-out';
                } else {
                  ctx.globalCompositeOperation = 'source-over';
                  ctx.strokeStyle = color;
                }
                ctx.lineWidth = width;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                  ctx.lineTo(points[i].x, points[i].y);
                }
                ctx.stroke();
              }
            }
          }
        }
      } else if (msg.type === 'gartic_guess') {
        const { sender, text, correct, system, msgId } = msg.payload;
        setGarticChat(prev => {
          if (msgId && prev.some(m => m.id === msgId)) return prev;
          return [
            ...prev,
            {
              id: msgId || Math.random().toString(),
              sender,
              text,
              correct,
              system
            }
          ];
        });
      } else if (msg.type === 'gartic_score') {
        const { userId, score } = msg.payload;
        setGarticState(prev => {
          const newLeaderboard = { ...prev.leaderboard };
          if (newLeaderboard[userId]) {
            newLeaderboard[userId] = { ...newLeaderboard[userId], score: newLeaderboard[userId].score + score };
          } else {
            const targetProfile = profiles.find(pr => pr.id === userId);
            newLeaderboard[userId] = {
              name: targetProfile ? targetProfile.name : 'Pemain',
              score: score,
              nameColor: targetProfile?.sprite_json.nameColor
            };
          }
          return { ...prev, leaderboard: newLeaderboard };
        });
      } else if (msg.type === 'gartic_game_over') {
        const { timestamp } = msg.payload;
        setGarticState(prev => ({ ...prev, status: 'ended' }));
        const canvas = garticCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        setGarticChat(prev => {
          const msgId = `game_over_${timestamp || Date.now()}`;
          if (prev.some(m => m.id === msgId)) return prev;
          return [
            ...prev,
            {
              id: msgId,
              sender: 'Sistem',
              text: `Game Gartic Selesai! Menghitung hadiah koin...`,
              system: true
            }
          ];
        });
      } else if (msg.type === 'gartic_config_sync') {
        const config = msg.payload;
        setGarticState(prev => ({
          ...prev,
          totalRounds: config.totalRounds ?? prev.totalRounds,
          totalTimer: config.totalTimer ?? prev.totalTimer,
          baseReward: config.baseReward ?? prev.baseReward,
          words: config.words ?? prev.words
        }));
      } else if (msg.type === 'gartic_reset') {
        setGarticRevealedWord('');
        const canvas = garticCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        setGarticState(prev => {
          const resetLeader = { ...prev.leaderboard };
          Object.keys(resetLeader).forEach(key => {
            resetLeader[key] = { ...resetLeader[key], score: 0 };
          });
          return {
            ...prev,
            status: 'idle',
            round: 1,
            timer: prev.totalTimer,
            drawerId: null,
            drawerName: null,
            wordHash: null,
            wordLength: 0,
            currentWord: '',
            correctGuessers: [],
            leaderboard: resetLeader
          };
        });
        setGarticChat([]);
      }
    });

    return () => unsubscribe();
  }, [currentProfile.id]);

  const triggerBubble = (userId: string, text: string) => {
    if (activeBubbles[userId]?.timerId) {
      clearTimeout(activeBubbles[userId].timerId);
    }
    const tId = setTimeout(() => {
      setActiveBubbles(prev => {
        const copy = { ...prev };
        delete copy[userId];
        return copy;
      });
    }, 3000);

    setActiveBubbles(prev => ({
      ...prev,
      [userId]: { text, timerId: tId }
    }));
  };

  const handleSeatClick = async (seat: Seat) => {
    playSelect();
    const isLeave = seat.user_id === currentProfile.id;
    if (onSeatClick) {
      onSeatClick(seat.id, isLeave);
    } else {
      if (isLeave) {
        await db.leaveSeat(currentProfile.id);
      } else {
        await db.claimSeat('tavern', seat.id, currentProfile.id);
      }
      onRefreshProfiles();
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    playClick();
    db.broadcast('chat_bubble', { userId: currentProfile.id, text: chatMessage });
    triggerBubble(currentProfile.id, chatMessage);
    setChatMessage('');
  };

  const handleEmote = (emote: string) => {
    playClick();
    db.broadcast('chat_bubble', { userId: currentProfile.id, text: emote });
    triggerBubble(currentProfile.id, emote);
  };

  // Tic-Tac-Toe logic
  const checkWinner = (board: (string | null)[]) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    if (board.every(cell => cell !== null)) {
      return 'Draw';
    }
    return null;
  };

  // Gacha handlers
  const handlePullCard = async () => {
    setGachaError('');
    setPullResult(null);
    setCardRevealed(false);
    setIsFlipped(false);
    setGachaPulling(true);

    const result = await db.pullCard(currentProfile.id, selectedPack, activeGachaTab);
    setGachaPulling(false);

    if (!result.success) {
      if (result.newCoins !== undefined) {
        setLocalCoins(result.newCoins);
        onUpdateProfile({ coins: result.newCoins });
      }
      setGachaError(result.errorMsg || 'Pull gagal.');
      return;
    }
    if (result.asset && result.newCoins !== undefined) {
      setPullResult({ asset: result.asset, rarity: result.rarity, isDuplicate: result.isDuplicate });
      setLocalCoins(result.newCoins);
      onUpdateProfile({ coins: result.newCoins });
      // animate reveal
      setTimeout(() => setCardRevealed(true), 300);
      // refresh profile coins in parent
      onRefreshProfiles();
    }
  };

  const handleReroll = async () => {
    await handlePullCard();
  };

  const openGameModal = () => {
    playClick();
    setShowGame(true);
    // Join spectators
    setSpectatorIds(prev => {
      const updated = prev.includes(currentProfile.id) ? prev : [...prev, currentProfile.id];
      db.broadcast('tictactoe_spectator_join', { userId: currentProfile.id });
      return updated;
    });
    // Request state sync
    db.broadcast('tictactoe_request_sync', {});
    db.broadcast('chess_request_sync', {});
  };

  const closeGameModal = () => {
    playClick();
    setShowGame(false);
    // Leave spectators
    setSpectatorIds(prev => {
      const updated = prev.filter(id => id !== currentProfile.id);
      db.broadcast('tictactoe_spectator_leave', { userId: currentProfile.id });
      return updated;
    });
  };

  const joinGame = (role: 'X' | 'O') => {
    playClick();
    const newState = { ...tttState };
    if (role === 'X') {
      newState.playerXId = currentProfile.id;
      newState.playerXName = currentProfile.name.split(' ')[0];
    } else {
      newState.playerOId = currentProfile.id;
      newState.playerOName = currentProfile.name.split(' ')[0];
    }
    setTttState(newState);
    db.saveTicTacToeState(newState);
    db.broadcast('tictactoe_sync', { tttState: newState, spectatorIds });
  };

  const resetGame = () => {
    playClick();
    const newState = {
      board: Array(9).fill(null),
      turn: 'X' as const,
      playerXId: null,
      playerXName: null,
      playerOId: null,
      playerOName: null,
      winner: null
    };
    setTttState(newState);
    db.saveTicTacToeState(newState);
    db.broadcast('tictactoe_sync', { tttState: newState, spectatorIds: [] });
    setSpectatorIds([]);
  };

  const makeMove = (index: number) => {
    if (tttState.board[index] || tttState.winner) return;
    
    const isPlayerX = currentProfile.id === tttState.playerXId;
    const isPlayerO = currentProfile.id === tttState.playerOId;
    if (tttState.turn === 'X' && !isPlayerX) return;
    if (tttState.turn === 'O' && !isPlayerO) return;

    playSelect();
    const newBoard = [...tttState.board];
    newBoard[index] = tttState.turn;
    
    const winner = checkWinner(newBoard);
    const nextTurn: 'X' | 'O' = tttState.turn === 'X' ? 'O' : 'X';
    
    const newState = {
      ...tttState,
      board: newBoard,
      turn: nextTurn,
      winner: winner ? winner : null
    };
    
    setTttState(newState);
    db.saveTicTacToeState(newState);
    db.broadcast('tictactoe_sync', { tttState: newState, spectatorIds });
  };

  // Chess handlers
  const joinChess = (role: 'white' | 'black') => {
    playClick();
    const newState = { ...chessState };
    if (role === 'white') {
      newState.playerWhiteId = currentProfile.id;
      newState.playerWhiteName = currentProfile.name.split(' ')[0];
    } else {
      newState.playerBlackId = currentProfile.id;
      newState.playerBlackName = currentProfile.name.split(' ')[0];
    }
    setChessState(newState);
    db.saveChessState(newState);
    db.broadcast('chess_sync', { chessState: newState });
  };

  const resetChess = () => {
    playClick();
    const newState = {
      board: [...INITIAL_CHESS_BOARD],
      turn: 'white' as const,
      playerWhiteId: null,
      playerWhiteName: null,
      playerBlackId: null,
      playerBlackName: null,
      winner: null,
      capturedPieces: []
    };
    setChessState(newState);
    setSelectedSquare(null);
    setSelectedCaptured(null);
    db.saveChessState(newState);
    db.broadcast('chess_sync', { chessState: newState });
  };

  const playAgainChess = () => {
    playClick();
    const newState = {
      ...chessState,
      board: [...INITIAL_CHESS_BOARD],
      turn: 'white' as const,
      winner: null,
      capturedPieces: []
    };
    setChessState(newState);
    setSelectedSquare(null);
    setSelectedCaptured(null);
    db.saveChessState(newState);
    db.broadcast('chess_sync', { chessState: newState });
  };

  const moveChessPiece = (fromIndex: number, toIndex: number) => {
    // Only White or Black player can move pieces
    const isWhite = currentProfile.id === chessState.playerWhiteId;
    const isBlack = currentProfile.id === chessState.playerBlackId;
    if (!isWhite && !isBlack) return;

    if (fromIndex === toIndex) return;

    const newBoard = [...chessState.board];
    const movingPiece = newBoard[fromIndex];
    if (!movingPiece) return;

    playSelect();
    const captured = newBoard[toIndex];
    const newCaptured = [...(chessState.capturedPieces || [])];
    if (captured) {
      newCaptured.push(captured);
    }

    newBoard[toIndex] = movingPiece;
    newBoard[fromIndex] = null;

    const newState = {
      ...chessState,
      board: newBoard,
      capturedPieces: newCaptured
    };

    setChessState(newState);
    setSelectedSquare(null);
    setSelectedCaptured(null);
    db.saveChessState(newState);
    db.broadcast('chess_sync', { chessState: newState });
  };

  const handleChessSquareClick = (index: number) => {
    const isWhite = currentProfile.id === chessState.playerWhiteId;
    const isBlack = currentProfile.id === chessState.playerBlackId;
    if (!isWhite && !isBlack) return;

    const piece = chessState.board[index];

    // If a captured piece is selected, click on board moves it to target index
    if (selectedCaptured !== null) {
      playSelect();
      const newBoard = [...chessState.board];
      const newCaptured = [...(chessState.capturedPieces || [])];
      
      const targetPiece = newBoard[index];
      if (targetPiece) {
        newCaptured.push(targetPiece);
      }

      newBoard[index] = selectedCaptured.code;
      newCaptured.splice(selectedCaptured.index, 1);

      const newState = {
        ...chessState,
        board: newBoard,
        capturedPieces: newCaptured
      };

      setChessState(newState);
      setSelectedCaptured(null);
      db.saveChessState(newState);
      db.broadcast('chess_sync', { chessState: newState });
      return;
    }

    if (selectedSquare === null) {
      if (piece) {
        playSelect();
        setSelectedSquare(index);
      }
    } else {
      if (selectedSquare === index) {
        playSelect();
        setSelectedSquare(null);
      } else {
        moveChessPiece(selectedSquare, index);
      }
    }
  };

  // Drag & Drop handlers
  const handleChessDragStart = (e: React.DragEvent, index: number) => {
    const isWhite = currentProfile.id === chessState.playerWhiteId;
    const isBlack = currentProfile.id === chessState.playerBlackId;
    if (!isWhite && !isBlack) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', index.toString());
    setSelectedSquare(index);
    setSelectedCaptured(null);
  };

  const handleChessDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleChessDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndexStr = e.dataTransfer.getData('text/plain');
    if (!sourceIndexStr) return;

    const isWhite = currentProfile.id === chessState.playerWhiteId;
    const isBlack = currentProfile.id === chessState.playerBlackId;
    if (!isWhite && !isBlack) return;

    // Check if dragging from captured bench
    if (sourceIndexStr.startsWith('captured:')) {
      const parts = sourceIndexStr.split(':');
      const cIdx = parseInt(parts[1], 10);
      const pieceCode = parts[2];
      if (isNaN(cIdx)) return;

      playSelect();
      const newBoard = [...chessState.board];
      const newCaptured = [...(chessState.capturedPieces || [])];

      const targetPiece = newBoard[targetIndex];
      if (targetPiece) {
        newCaptured.push(targetPiece);
      }

      newBoard[targetIndex] = pieceCode;
      newCaptured.splice(cIdx, 1);

      const newState = {
        ...chessState,
        board: newBoard,
        capturedPieces: newCaptured
      };

      setChessState(newState);
      setSelectedCaptured(null);
      setSelectedSquare(null);
      db.saveChessState(newState);
      db.broadcast('chess_sync', { chessState: newState });
      return;
    }

    const sourceIndex = parseInt(sourceIndexStr, 10);
    if (isNaN(sourceIndex)) return;

    moveChessPiece(sourceIndex, targetIndex);
  };

  // Drag from board and drop to captured bench
  const handleCapturedDropZone = (e: React.DragEvent) => {
    e.preventDefault();
    const sourceIndexStr = e.dataTransfer.getData('text/plain');
    if (!sourceIndexStr || sourceIndexStr.startsWith('captured:')) return;
    const sourceIndex = parseInt(sourceIndexStr, 10);
    if (isNaN(sourceIndex)) return;

    const isWhite = currentProfile.id === chessState.playerWhiteId;
    const isBlack = currentProfile.id === chessState.playerBlackId;
    if (!isWhite && !isBlack) return;

    const newBoard = [...chessState.board];
    const piece = newBoard[sourceIndex];
    if (!piece) return;

    playSelect();
    newBoard[sourceIndex] = null;
    const newCaptured = [...(chessState.capturedPieces || [])];
    newCaptured.push(piece);

    const newState = {
      ...chessState,
      board: newBoard,
      capturedPieces: newCaptured
    };

    setChessState(newState);
    setSelectedSquare(null);
    setSelectedCaptured(null);
    db.saveChessState(newState);
    db.broadcast('chess_sync', { chessState: newState });
  };

  const handleCapturedZoneClick = () => {
    if (selectedSquare !== null) {
      const isWhite = currentProfile.id === chessState.playerWhiteId;
      const isBlack = currentProfile.id === chessState.playerBlackId;
      if (!isWhite && !isBlack) return;

      const newBoard = [...chessState.board];
      const piece = newBoard[selectedSquare];
      if (!piece) return;

      playSelect();
      newBoard[selectedSquare] = null;
      const newCaptured = [...(chessState.capturedPieces || [])];
      newCaptured.push(piece);

      const newState = {
        ...chessState,
        board: newBoard,
        capturedPieces: newCaptured
      };

      setChessState(newState);
      setSelectedSquare(null);
      setSelectedCaptured(null);
      db.saveChessState(newState);
      db.broadcast('chess_sync', { chessState: newState });
    }
  };

  const handleCapturedPieceClick = (e: React.MouseEvent, pieceCode: string, cIdx: number) => {
    e.stopPropagation();
    const isWhite = currentProfile.id === chessState.playerWhiteId;
    const isBlack = currentProfile.id === chessState.playerBlackId;
    if (!isWhite && !isBlack) return;

    playSelect();
    if (selectedCaptured?.index === cIdx) {
      setSelectedCaptured(null);
    } else {
      setSelectedCaptured({ index: cIdx, code: pieceCode });
      setSelectedSquare(null);
    }
  };

  const handleCapturedDragStart = (e: React.DragEvent, pieceCode: string, indexInCaptured: number) => {
    const isWhite = currentProfile.id === chessState.playerWhiteId;
    const isBlack = currentProfile.id === chessState.playerBlackId;
    if (!isWhite && !isBlack) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', `captured:${indexInCaptured}:${pieceCode}`);
    setSelectedSquare(null);
    setSelectedCaptured(null);
  };

  // Find player profiles to render sprites around Tic-Tac-Toe & Chess
  const playerXProfile = profiles.find(p => p.id === tttState.playerXId);
  const playerOProfile = profiles.find(p => p.id === tttState.playerOId);
  const playerWhiteProfile = profiles.find(p => p.id === chessState.playerWhiteId);
  const playerBlackProfile = profiles.find(p => p.id === chessState.playerBlackId);

  return (
    <div className="flex flex-col gap-4 p-2 relative">
      
      {/* Configure Panel (Director/Manager Only) */}
      {currentProfile.role !== 'Staff' && (
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-950/90 border-2 border-[#cca566]/40 rounded-lg shadow-xl shadow-black/50">
          <div className="flex items-center gap-3">
            <span className="text-amber-500 font-extrabold text-sm uppercase tracking-wider rpg-font-retro">
              Tavern Config
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-extrabold text-amber-100 uppercase tracking-wide text-xs rpg-font-retro">PORTAL URL:</span>
            <input
              type="text"
              value={localDiscordUrl}
              onChange={(e) => setLocalDiscordUrl(e.target.value)}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              placeholder="Masukkan link dokumen (contoh: google.com)..."
              className="bg-black/80 text-yellow-100 border border-amber-600/40 rounded px-3 py-1.5 w-72 text-xs font-semibold focus:outline-none focus:border-amber-500 placeholder:text-stone-600"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  playClick();
                  if (onUpdateRoomConfig) {
                    onUpdateRoomConfig('tavern', { discord_url: localDiscordUrl });
                    setShowSavedFeedback(true);
                    setTimeout(() => setShowSavedFeedback(false), 3000);
                  }
                }}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-stone-950 font-black text-xs rounded transition-all active:scale-95 shadow-md shadow-amber-900/30 cursor-pointer flex-shrink-0"
              >
                SAVE
              </button>
              {showSavedFeedback && (
                <span className="text-green-400 font-bold text-xs rpg-font-retro animate-bounce flex-shrink-0">
                  ✓ Tersimpan!
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Interactive Tavern Canvas Map (8 Spans) */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          
          <div className="map-scroll-container">
             <div className="rpg-panel border-4 h-[550px] relative overflow-hidden rounded bg-[#1c0f0d] min-w-[750px] lg:min-w-0" style={{
              backgroundImage: 'radial-gradient(#100807 1.5px, transparent 1.5px)',
              backgroundSize: '24px 24px'
            }}>
            
            {/* FLOATING ACTION PORTALS */}
            <div className="absolute top-3 right-3 flex items-center gap-3 z-30">
              {/* Discord Voice Button */}
              <div className="flex flex-col items-center gap-1 group">
                <a
                  href="discord://discord.com/channels/1452630913908342906/1452630915942453268"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => playSelect()}
                  className="w-11 h-11 rounded-full bg-[#5865F2] hover:bg-[#4752C4] shadow-[0_0_10px_rgba(88,101,242,0.4)] hover:shadow-[0_0_15px_rgba(88,101,242,0.7)] flex items-center justify-center text-white border-2 border-white/20 transition-all hover:scale-105"
                  title="Buka Discord Voice"
                >
                  <svg className="w-5.5 h-5.5 fill-current" viewBox="0 0 127.14 96.36">
                    <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36c2.65-3.6,5-7.46,7-11.52A68.66,68.66,0,0,1,28.68,79.3c.88-.65,1.76-1.32,2.6-2a75.52,75.52,0,0,0,71.72,0c.84.69,1.72,1.36,2.6,2a68.86,68.86,0,0,1-10.37,5.54c2,4.06,4.35,7.92,7,11.52A105.73,105.73,0,0,0,126.1,77.53C130.66,48,122.3,25.19,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z" />
                  </svg>
                </a>
                <span className="text-[7.5px] font-bold text-slate-300 bg-slate-950/90 px-1.5 py-0.5 rounded border border-slate-800/40 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity animate-none">
                  DISCORD
                </span>
              </div>

              {/* Portal Button */}
              <div className="flex flex-col items-center gap-1 group">
                {roomConfig?.discord_url && roomConfig.discord_url.trim() !== '' ? (
                  <a
                    href={ensureAbsoluteUrl(roomConfig.discord_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => playSelect()}
                    className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-[0_0_12px_rgba(147,51,234,0.6)] hover:shadow-[0_0_18px_rgba(147,51,234,0.9)] flex items-center justify-center text-white border-2 border-purple-400/50 transition-all hover:scale-105 animate-[pulse_2.5s_infinite]"
                    title="Buka Portal Dokumen/Link"
                  >
                    <svg className="w-5.5 h-5.5 animate-spin" style={{ animationDuration: '6s' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m10.657 10.657l.707-.707M14 12a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </a>
                ) : (
                  <button
                    disabled
                    className="w-11 h-11 rounded-full bg-stone-700/85 text-stone-500 border-2 border-stone-600/50 flex items-center justify-center cursor-not-allowed opacity-90 transition-all"
                    title="Portal belum disetting (Kosong)"
                  >
                    <svg className="w-5.5 h-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m10.657 10.657l.707-.707M14 12a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </button>
                )}
                <span className={`text-[7.5px] font-bold bg-slate-950/90 px-1.5 py-0.5 rounded border pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${roomConfig?.discord_url && roomConfig.discord_url.trim() !== '' ? 'text-purple-300 border-purple-900/40' : 'text-stone-400 border-stone-800/40'}`}>
                  PORTAL
                </span>
              </div>
            </div>

            {/* Area Divider Line (Visual counter split) */}
            <div className="absolute top-0 bottom-0 left-1/2 w-1 border-r-2 border-dashed border-[#5a3d28]/20 pointer-events-none"></div>

            {/* ====================================================
                LEFT SIDE: FIREPLACE ROOM & TIC-TAC-TOE GAME
                ==================================================== */}
            
            {/* Fireplace (Tungku api) */}
            <div className="absolute top-4 left-[24%] -translate-x-1/2 w-28 h-20 bg-stone-800 border-4 border-stone-900 rounded-t shadow-lg flex items-center justify-center z-10">
              {/* Flame animation */}
              <div className="w-12 h-10 bg-amber-500 rounded-t-full animate-[fire-flicker_1.5s_infinite] flex items-center justify-center relative">
                <div className="w-8 h-8 bg-red-600 rounded-t-full"></div>
                <div className="absolute inset-0 bg-red-500/20 animate-ping rounded-full pointer-events-none"></div>
              </div>
            </div>

            {/* Cozy rug layout around fireplace */}
            <div className="absolute bottom-[10%] left-[6%] w-[36%] h-[32%] bg-[#422213] rounded-full border-2 border-[#5c3a21]/30 opacity-70 -z-10"></div>

            {/* Tic-Tac-Toe Game Table */}
            <div 
              onClick={() => { 
                setActiveGameTab('ttt'); 
                openGameModal(); 
                handleSeatClick({ id: 'tavern_seat_ttt', room_id: 'tavern', user_id: null, x: 0, y: 0 });
              }}
              className="absolute top-[54%] left-[10%] -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-[#6d4c41] border-4 border-[#3e2723] rounded-full shadow-2xl z-20 cursor-pointer flex flex-col items-center justify-center hover:scale-105 transition-transform hover:border-blue-400 group"
            >
              <span className="text-[6px] text-[#ffd700] font-bold text-center leading-none mt-0.5 rpg-font-retro animate-pulse">TIC-TAC-TOE</span>
            </div>

            {/* Chess Game Table */}
            <div 
              onClick={() => { 
                setActiveGameTab('chess'); 
                openGameModal(); 
                handleSeatClick({ id: 'tavern_seat_chess', room_id: 'tavern', user_id: null, x: 0, y: 0 });
              }}
              className="absolute top-[54%] left-[42%] -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-[#5c4033] border-4 border-[#2d1b15] rounded-full shadow-2xl z-20 cursor-pointer flex flex-col items-center justify-center hover:scale-105 transition-transform hover:border-amber-400 group"
            >
              <span className="text-[6px] text-[#cca566] font-bold text-center leading-none mt-0.5 rpg-font-retro animate-pulse">CHESS GAME</span>
            </div>

            {/* Render Tic-Tac-Toe Game Avatars directly next to the TTT table */}
            {playerXProfile && (
              <div className="absolute top-[54%] left-[3%] -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center animate-pulse">
                <SpriteRenderer
                  base={playerXProfile.sprite_json.base}
                  hair={playerXProfile.sprite_json.hair}
                  outfit={playerXProfile.sprite_json.outfit}
                  accessory={playerXProfile.sprite_json.accessory}
                  petId="none"
                  size={44}
                />
                <span 
                  className="bg-blue-900/90 border border-blue-500 px-1 rounded text-[6px] font-bold mt-0.5 font-mono"
                  style={{ color: playerXProfile.sprite_json.nameColor || '#ffffff' }}
                >
                  X: {playerXProfile.name.split(' ')[0]}
                </span>
              </div>
            )}
            
            {playerOProfile && (
              <div className="absolute top-[54%] left-[17%] -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center animate-pulse">
                <SpriteRenderer
                  base={playerOProfile.sprite_json.base}
                  hair={playerOProfile.sprite_json.hair}
                  outfit={playerOProfile.sprite_json.outfit}
                  accessory={playerOProfile.sprite_json.accessory}
                  petId="none"
                  size={44}
                />
                <span 
                  className="bg-red-900/90 border border-red-500 px-1 rounded text-[6px] font-bold mt-0.5 font-mono"
                  style={{ color: playerOProfile.sprite_json.nameColor || '#ffffff' }}
                >
                  O: {playerOProfile.name.split(' ')[0]}
                </span>
              </div>
            )}

            {/* Render Chess Game Avatars directly next to the Chess table */}
            {playerWhiteProfile && (
              <div className="absolute top-[54%] left-[35%] -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center animate-pulse">
                <SpriteRenderer
                  base={playerWhiteProfile.sprite_json.base}
                  hair={playerWhiteProfile.sprite_json.hair}
                  outfit={playerWhiteProfile.sprite_json.outfit}
                  accessory={playerWhiteProfile.sprite_json.accessory}
                  petId="none"
                  size={44}
                />
                <span 
                  className="bg-[#dfbe8c]/90 border border-amber-600 px-1 rounded text-[6.5px] font-bold mt-0.5 font-mono text-[#3e2723] shadow-md"
                  style={{ color: playerWhiteProfile.sprite_json.nameColor || '#3e2723' }}
                >
                  Putih: {playerWhiteProfile.name.split(' ')[0]}
                </span>
              </div>
            )}
            
            {playerBlackProfile && (
              <div className="absolute top-[54%] left-[49%] -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center animate-pulse">
                <SpriteRenderer
                  base={playerBlackProfile.sprite_json.base}
                  hair={playerBlackProfile.sprite_json.hair}
                  outfit={playerBlackProfile.sprite_json.outfit}
                  accessory={playerBlackProfile.sprite_json.accessory}
                  petId="none"
                  size={44}
                />
                <span 
                  className="bg-[#3e2723]/95 border border-stone-850 px-1 rounded text-[6.5px] font-bold mt-0.5 font-mono text-stone-200 shadow-md"
                  style={{ color: playerBlackProfile.sprite_json.nameColor || '#eab308' }}
                >
                  Hitam: {playerBlackProfile.name.split(' ')[0]}
                </span>
              </div>
            )}

            {/* Render Tic-Tac-Toe Table Spectators/Occupants */}
            {(() => {
              const tttSeatUserId = seats.find(s => s.id === 'tavern_seat_ttt')?.user_id;
              const tttSpectatorIds = Array.from(new Set([
                ...(activeGameTab === 'ttt' ? spectatorIds : []),
                ...(tttSeatUserId ? [tttSeatUserId] : [])
              ])).filter(id => id && id !== tttState.playerXId && id !== tttState.playerOId);

              return tttSpectatorIds.map((specId, index) => {
                const specProfile = profiles.find(p => p.id === specId);
                if (!specProfile) return null;
                
                const tableX = 10;
                const coords = [
                  { x: tableX, y: 36 },
                  { x: tableX, y: 72 },
                  { x: tableX - 7, y: 66 },
                  { x: tableX + 7, y: 66 },
                  { x: tableX - 7, y: 44 },
                  { x: tableX + 7, y: 44 }
                ];
                const pos = coords[index % coords.length];
                
                return (
                  <div 
                    key={`ttt-spec-${specId}`}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center opacity-90 scale-95"
                  >
                    <SpriteRenderer
                      base={specProfile.sprite_json.base}
                      hair={specProfile.sprite_json.hair}
                      outfit={specProfile.sprite_json.outfit}
                      accessory={specProfile.sprite_json.accessory}
                      petId="none"
                      size={36}
                    />
                    <span 
                      className="bg-slate-900/90 border border-slate-700 px-0.5 rounded text-[5px] font-bold mt-0.5 leading-none"
                      style={{ color: specProfile.sprite_json.nameColor || '#eab308' }}
                    >
                      {specProfile.name.split(' ')[0]}
                    </span>
                  </div>
                );
              });
            })()}

            {/* Render Chess Table Spectators/Occupants */}
            {(() => {
              const chessSeatUserId = seats.find(s => s.id === 'tavern_seat_chess')?.user_id;
              const chessSpectatorIds = Array.from(new Set([
                ...(activeGameTab === 'chess' ? spectatorIds : []),
                ...(chessSeatUserId ? [chessSeatUserId] : [])
              ])).filter(id => id && id !== chessState.playerWhiteId && id !== chessState.playerBlackId);

              return chessSpectatorIds.map((specId, index) => {
                const specProfile = profiles.find(p => p.id === specId);
                if (!specProfile) return null;
                
                const tableX = 42;
                const coords = [
                  { x: tableX, y: 36 },
                  { x: tableX, y: 72 },
                  { x: tableX - 7, y: 66 },
                  { x: tableX + 7, y: 66 },
                  { x: tableX - 7, y: 44 },
                  { x: tableX + 7, y: 44 }
                ];
                const pos = coords[index % coords.length];
                
                return (
                  <div 
                    key={`chess-spec-${specId}`}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center opacity-90 scale-95"
                  >
                    <SpriteRenderer
                      base={specProfile.sprite_json.base}
                      hair={specProfile.sprite_json.hair}
                      outfit={specProfile.sprite_json.outfit}
                      accessory={specProfile.sprite_json.accessory}
                      petId="none"
                      size={36}
                    />
                    <span 
                      className="bg-slate-900/90 border border-slate-700 px-0.5 rounded text-[5px] font-bold mt-0.5 leading-none"
                      style={{ color: specProfile.sprite_json.nameColor || '#eab308' }}
                    >
                      {specProfile.name.split(' ')[0]}
                    </span>
                  </div>
                );
              });
            })()}

            {/* ====================================================
                RIGHT SIDE: BAR COUNTER, NPC BARTENDER, SHOP & GACHA
                ==================================================== */}

            {/* Bartender counter bar */}
            <div className="absolute top-[28%] right-[5%] w-[42%] h-10 bg-[#3e2723] border-4 border-[#271510] rounded-lg z-10 flex justify-between items-center px-4 shadow-lg">
              <div className="h-[2px] w-full bg-[#5d4037]"></div>
            </div>

            {/* NPC Bartender Sprite */}
            <div className="absolute top-[12%] right-[25%] -translate-x-1/2 flex flex-col items-center z-10">
              <SpriteRenderer
                base="base_3"
                hair="hair_black"
                outfit="outfit_blue"
                accessory="none"
                petId="none"
                size={44}
              />
              <span className="bg-slate-950/80 px-1.5 py-0.2 rounded text-[6.5px] border border-amber-600/40 text-[#cca566] font-bold mt-0.5">BARTENDER NPC</span>
            </div>

            {/* Clickable Cash Register (Kasir Pack) */}
            <div
              onClick={() => { 
                playClick(); 
                setActiveGachaTab('char_pet');
                setPullResult(null);
                setGachaError('');
                setCardRevealed(false);
                setIsFlipped(false);
                setShowGacha(true); 
                handleSeatClick({ id: 'tavern_seat_kasir', room_id: 'tavern', user_id: null, x: 0, y: 0 });
              }}
              className="absolute top-[22%] right-[38%] w-10 h-10 bg-[#795548] border-2 border-[#3e2723] rounded flex flex-col items-center justify-center cursor-pointer hover:scale-105 transition-transform hover:border-amber-400 shadow z-20 group"
              title="Gacha Karakter & Pet"
            >
              <span className="text-[5px] text-[#cca566] font-bold font-mono group-hover:animate-bounce leading-none text-center px-0.5 uppercase">GACHA CHAR/PET</span>
            </div>

            {/* Clickable Gacha Machine (Memory Gacha) */}
            <div
              onClick={() => { 
                playClick(); 
                setActiveGachaTab('cosmetic');
                setPullResult(null);
                setGachaError('');
                setCardRevealed(false);
                setIsFlipped(false);
                setShowGacha(true); 
                handleSeatClick({ id: 'tavern_seat_gacha', room_id: 'tavern', user_id: null, x: 0, y: 0 });
              }}
              className="absolute top-[22%] right-[10%] w-10 h-10 bg-[#d90429] border-2 border-[#9b0000] rounded-t-xl flex flex-col items-center justify-center cursor-pointer hover:scale-105 transition-transform hover:border-yellow-400 shadow-xl z-20 group"
              title="Gacha Kosmetik"
            >
              <div className="w-4 h-4 bg-white/30 rounded-full border border-white/50 flex items-center justify-center animate-pulse">
              </div>
              <span className="text-[5px] text-white font-bold tracking-tight leading-none mt-0.5 rpg-font-retro text-center uppercase px-0.5">GACHA KOSMETIK</span>
            </div>

            {/* Clickable Gartic Game Table */}
            <div 
              onClick={() => { 
                playClick(); 
                setActiveGameTab('gartic'); 
                openGameModal(); 
                handleSeatClick({ id: 'tavern_seat_gartic', room_id: 'tavern', user_id: null, x: 0, y: 0 });
              }}
              style={{ left: '78%', top: '54%', transform: 'translate(-50%, -50%)' }}
              className="absolute w-16 h-16 bg-[#3d271f] border-4 border-[#ffd700] rounded-full shadow-2xl z-20 cursor-pointer flex flex-col items-center justify-center hover:scale-105 transition-transform hover:border-yellow-400 group animate-pulse"
              title="Gartic Multiplayer Game"
            >
              <span className="text-[6px] text-[#ffd700] font-bold text-center leading-none mt-0.5 rpg-font-retro">GARTIC GAME</span>
            </div>


            {/* ====================================================
                SEATS AND ONLINE MEMBERS PLOTTING
                ==================================================== */}
            {seats.map((seat) => {
              // Exclude Tic-Tac-Toe and Chess seats from general rendering to prevent duplication with custom table renderers
              if (seat.id === 'tavern_seat_ttt' || seat.id === 'tavern_seat_chess') {
                return null;
              }
              const occupant = profiles.find(p => p.id === seat.user_id);
              if (!occupant && (seat.id.includes('notice') || seat.id.includes('scroll') || seat.id.includes('gartic') || seat.id.includes('gacha') || seat.id.includes('kasir'))) {
                return null;
              }
              
              // Don't render seat triggers if someone sits there to keep visual clean
              return (
                <div
                  key={seat.id}
                  style={{
                    left: `${seat.x}%`,
                    top: `${seat.y}%`
                  }}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center"
                >
                  <div
                    onClick={() => handleSeatClick(seat)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all ${
                      occupant
                        ? 'border-none bg-transparent'
                        : 'border-2 border-dashed border-[#5a3d28]/30 bg-black/10 hover:border-amber-500 hover:scale-105'
                    }`}
                  >
                    {occupant ? (
                      <div className="relative">
                        {/* Bubble chats */}
                        {activeBubbles[occupant.id] && (
                          <div className="speech-bubble">
                            {activeBubbles[occupant.id].text}
                          </div>
                        )}
                        <SpriteRenderer
                          base={occupant.sprite_json.base}
                          hair={occupant.sprite_json.hair}
                          outfit={occupant.sprite_json.outfit}
                          accessory={occupant.sprite_json.accessory}
                          petId={occupant.pet_id}
                          cosmeticId={occupant.sprite_json.cosmetic_id}
                          size={40}
                          className="transform -translate-y-1"
                        />
                        {occupant.id === currentProfile.id && (
                          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-2 h-2 bg-green-500 rounded-full border border-white animate-bounce z-50"></div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[6.5px] text-stone-500 font-bold font-mono">DUDUK</span>
                    )}
                  </div>
                  
                  {occupant && (
                    <div className="bg-slate-950/90 border border-[#5a3d28]/40 px-1 rounded text-[6.5px] font-semibold whitespace-nowrap shadow-md">
                      <span style={{ color: occupant.sprite_json.nameColor || '#fafaf9' }}>
                        {occupant.name.split(' ')[0]}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            </div>
          </div>

          {/* Quick Chat and Emote Controls */}
          <div className="rpg-panel-wood p-3 flex flex-col md:flex-row gap-3 items-center justify-between">
            <form onSubmit={handleSendChat} className="flex gap-2 items-center flex-1 w-full">
              <span className="text-[9px] text-[#cca566] rpg-font-retro mr-1">CHAT:</span>
              <input
                type="text"
                placeholder="Ketik pesan obrolan di tavern..."
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                maxLength={40}
                className="flex-1 bg-[#16110e] text-yellow-50 px-3 py-2 rounded border border-[#5a3d28] text-xs font-semibold focus:outline-none"
              />
              <button type="submit" className="rpg-btn-game py-1.5 px-3">KIRIM</button>
            </form>
            <div className="flex gap-1.5 items-center">
              <span className="text-[9px] text-slate-400 font-bold font-mono">REAKSI:</span>
              {['👍', '🎉', '🔥', '✨', '💡'].map(emote => (
                <button
                  key={emote}
                  onClick={() => handleEmote(emote)}
                  className="bg-[#16110e] border-2 border-[#5a3d28] hover:border-amber-500 px-2 py-1 rounded text-xs transition-colors"
                >
                  {emote}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Right Side: Anonymous Chat Evaluation (4 Spans) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="rpg-panel-wood p-4 flex flex-col justify-between min-h-[350px] h-full">
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex justify-between items-center mb-3 border-b border-stone-800 pb-2">
                <h3 className="font-bold text-[#cca566] text-xs font-mono flex items-center gap-1.5">
                  <MessageSquare size={13} /> EVALUASI ANONIM
                </h3>
                
                {/* Date Dropdown selector */}
                <select
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-[#16110e] text-yellow-100 border border-[#5a3d28] rounded px-1.5 py-0.5 text-[9px] font-bold focus:outline-none cursor-pointer"
                >
                  {availableDates.map(dateStr => {
                    const isToday = dateStr === new Date().toISOString().split('T')[0];
                    return (
                      <option key={dateStr} value={dateStr}>
                        {isToday ? `Hari Ini (${dateStr})` : dateStr}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Description */}
              <p className="text-[9.5px] text-slate-400 leading-normal mb-3 font-semibold">
                Wadah aspirasi dan komentar evaluasi harian dari staf. Kiriman bersifat 100% anonim dan rahasia.
              </p>

              {/* Comments List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[180px] max-h-[250px] no-scrollbar">
                {comments.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 italic text-[9.5px] font-bold">
                    Belum ada komentar evaluasi untuk tanggal ini.
                  </div>
                ) : (
                  comments.map((comment) => {
                    let timeStr = '00:00';
                    try {
                      timeStr = new Date(comment.created_at).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                    } catch (e) {
                      console.error(e);
                    }
                    return (
                      <div key={comment.id} className="bg-[#181818] border border-[#2c2c2c] rounded p-2 text-stone-300">
                        <div className="flex justify-between items-center text-[7.5px] text-slate-500 font-mono font-bold mb-1">
                          <span>👤 Anonim</span>
                          <span>{timeStr}</span>
                        </div>
                        <p className="text-[10px] leading-relaxed break-words whitespace-pre-wrap font-sans text-stone-200">
                          {comment.text}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Input Form at bottom - only active for today */}
            {selectedDate === new Date().toISOString().split('T')[0] ? (
              <form onSubmit={handleSendComment} className="border-t border-stone-850 pt-3 mt-3 flex gap-2">
                <input
                  type="text"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="Ketik komentar evaluasi..."
                  maxLength={250}
                  className="flex-1 bg-[#16110e] text-yellow-50 px-2.5 py-1.5 rounded border border-[#5a3d28] text-[9.5px] focus:outline-none focus:border-amber-600 font-medium"
                />
                <button
                  type="submit"
                  className="rpg-btn-game px-3 py-1 flex items-center justify-center text-[9px] text-[#cca566]"
                >
                  <Send size={10} />
                </button>
              </form>
            ) : (
              <div className="border-t border-stone-850 pt-3 mt-3 text-center text-[8.5px] text-slate-500 font-bold italic">
                Arsip evaluasi hari sebelumnya terkunci.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ====================================================
          MODAL: UNIFIED GACHA SYSTEM
          ==================================================== */}
      {showGacha && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[2000] p-4 backdrop-blur-sm">
          <div className="rpg-panel-stone max-w-md w-full p-6 border-4 border-[#cca566]" style={{ animation: 'fadeIn 0.2s ease-out' }}>

            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-stone-700 pb-3 mb-4">
              <h3 className="font-bold text-amber-500 text-sm rpg-font-retro flex items-center gap-2">
                <Sparkles size={16} className="text-yellow-400" /> GACHA SYSTEM
              </h3>
              <button onClick={() => { playClick(); setShowGacha(false); setPullResult(null); }}
                className="text-slate-400 hover:text-white p-1 rounded bg-slate-900 border border-slate-700">
                <X size={16} />
              </button>
            </div>

            {/* Gacha Tabs */}
            <div className="flex gap-2 mb-4 border-b border-stone-800 pb-2">
              <button
                onClick={() => {
                  playSelect();
                  setActiveGachaTab('char_pet');
                  setPullResult(null);
                  setGachaError('');
                  setCardRevealed(false);
                  setIsFlipped(false);
                }}
                className={`flex-1 py-2 text-[9px] font-bold rpg-font-retro rounded border transition-all ${
                  activeGachaTab === 'char_pet'
                    ? 'border-amber-500 bg-amber-950/40 text-yellow-300'
                    : 'border-stone-850 bg-stone-900/40 text-stone-500 hover:border-stone-750 hover:text-stone-350'
                }`}
              >
                ⚔️ CHAR & PET
              </button>
              <button
                onClick={() => {
                  playSelect();
                  setActiveGachaTab('cosmetic');
                  setPullResult(null);
                  setGachaError('');
                  setCardRevealed(false);
                  setIsFlipped(false);
                }}
                className={`flex-1 py-2 text-[9px] font-bold rpg-font-retro rounded border transition-all ${
                  activeGachaTab === 'cosmetic'
                    ? 'border-amber-500 bg-amber-950/40 text-yellow-300'
                    : 'border-stone-850 bg-stone-900/40 text-stone-500 hover:border-stone-750 hover:text-stone-355'
                }`}
              >
                🎒 KOSMETIK TOYS
              </button>
            </div>

            {/* Pack Selection Buttons */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {(Object.keys(PACK_INFO) as PackType[]).map((pack) => {
                const info = PACK_INFO[pack];
                const isSelected = selectedPack === pack;
                const canAfford = localCoins >= info.cost;
                return (
                  <button
                    key={pack}
                    onClick={() => {
                      playSelect();
                      setSelectedPack(pack);
                      setPullResult(null);
                      setGachaError('');
                      setCardRevealed(false);
                      setIsFlipped(false);
                    }}
                    className={`p-2 rounded border flex flex-col items-center justify-between text-center transition-all ${
                      isSelected
                        ? 'border-amber-500 bg-amber-950/40 shadow-[0_0_8px_rgba(251,191,36,0.15)]'
                        : 'border-[#5a3d28] bg-[#16110e] hover:border-amber-700'
                    } ${!canAfford ? 'opacity-50' : ''}`}
                  >
                    <span className="font-bold text-[8.5px] text-yellow-100 leading-tight block truncate max-w-full">
                      {info.label.split(' ')[0]}
                    </span>
                    <span className="text-[8px] font-mono font-bold text-amber-500 mt-1 block">
                      {info.cost} koin
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Selected Pack Description */}
            <p className="text-[8px] text-slate-400 font-medium mb-4 text-center leading-normal">
              {PACK_INFO[selectedPack].desc} <span className="font-mono text-[#cca566]">({PACK_INFO[selectedPack].probs})</span>
            </p>

            {/* Coin Balance */}
            <div className="flex items-center gap-2 mb-4 bg-amber-950/30 border border-amber-700/40 rounded px-3 py-1.5 justify-between">
              <div className="flex items-center gap-1.5">
                <Coins size={12} className="text-yellow-500" />
                <span className="text-[10px] font-bold text-yellow-300">Saldo: {localCoins} koin</span>
              </div>
              <span className="text-[9px] text-[#cca566] font-semibold">Biaya: {PACK_INFO[selectedPack].cost} koin</span>
            </div>

            {/* Pull Area */}
            <div className="min-h-[200px] flex flex-col items-center justify-center">

              {/* Status: Idle, No result pulled yet */}
              {!pullResult && !gachaPulling && !gachaError && (
                <div className="flex flex-col items-center gap-3">
                  {activeGachaTab === 'char_pet' ? (
                    /* Character & Pet: Card Back */
                    <div className="w-32 h-44 bg-gradient-to-br from-[#3a1f10] to-[#1a0d05] border-4 border-[#cca566] rounded-xl flex items-center justify-center shadow-2xl cursor-pointer hover:scale-105 transition-transform"
                      onClick={handlePullCard}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Package size={44} className="text-amber-500 animate-pulse" />
                        <span className="text-[9px] text-amber-400 font-bold rpg-font-retro">ROBEK!</span>
                      </div>
                    </div>
                  ) : (
                    /* Cosmetics: Blister Pack Toy Box Front (Closed/Sealed) */
                    <div className="toy-box-container hover:scale-105 transition-transform" onClick={handlePullCard}>
                      <div className="toy-box-card">
                        <div className="toy-box-face toy-box-front flex flex-col justify-between p-3 relative overflow-hidden">
                          <div className="hang-tab"></div>
                          <div className="text-center mt-2">
                            <span className="text-[5.5px] rpg-font-retro text-amber-300 block tracking-widest leading-none">GAME SEED</span>
                            <span className="text-[7.5px] rpg-font-retro text-white font-extrabold block leading-tight mt-0.5 uppercase tracking-wide">COSMETIC TOY</span>
                          </div>
                          <div className="mika-window flex items-center justify-center my-auto w-full h-[80px]">
                            <span className="text-2xl text-yellow-500/80 font-bold animate-pulse font-mono select-none">?</span>
                          </div>
                          <div className="bg-amber-500 text-stone-950 font-bold text-[6.5px] py-0.5 px-2 rounded-sm text-center w-full uppercase select-none animate-pulse">
                            BUKA KOTAK
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <p className="text-[9.5px] text-slate-400 text-center">Klik wadah di atas untuk melakukan pull!</p>
                </div>
              )}

              {/* Status: Pulling / Loading */}
              {gachaPulling && (
                <div className="flex flex-col items-center gap-3">
                  {activeGachaTab === 'char_pet' ? (
                    <div className="w-32 h-44 bg-gradient-to-br from-amber-900 to-yellow-700 border-4 border-yellow-400 rounded-xl flex items-center justify-center shadow-2xl animate-pulse">
                      <Sparkles size={44} className="text-yellow-400 animate-spin" />
                    </div>
                  ) : (
                    <div className="toy-box-container animate-pulse">
                      <div className="toy-box-card animate-bounce">
                        <div className="toy-box-face toy-box-front flex flex-col justify-between p-3 relative overflow-hidden">
                          <div className="hang-tab"></div>
                          <div className="mika-window flex items-center justify-center my-auto w-full h-[80px] bg-yellow-950/40">
                            <Sparkles size={24} className="text-yellow-400 animate-spin" />
                          </div>
                          <div className="bg-yellow-600 text-stone-950 font-bold text-[6.5px] py-0.5 px-2 rounded-sm text-center w-full uppercase select-none">
                            MENARIK...
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-amber-400 font-bold animate-bounce">
                    {activeGachaTab === 'char_pet' ? 'Merobek kartu...' : 'Membuka kemasan...'}
                  </p>
                </div>
              )}

              {/* Status: Error */}
              {gachaError && (
                <div className="text-center py-6">
                  <p className="text-red-400 font-bold text-sm mb-3">{gachaError}</p>
                  <p className="text-[9px] text-slate-500 font-medium">Minta Director tambah koin untuk akunmu!</p>
                </div>
              )}

              {/* Status: Pulled Result Revealed */}
              {pullResult && !gachaPulling && (
                <div className="w-full flex justify-center py-1">
                  {activeGachaTab === 'char_pet' ? (
                    /* Character / Pet: Tear Card Reveal */
                    <div className={`flex flex-col items-center gap-3 transition-all duration-500 ${cardRevealed ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
                      <div className={`w-36 h-48 rounded-xl border-4 flex flex-col items-center justify-center gap-2 p-3 shadow-2xl
                        ${RARITY_CONFIG[pullResult.rarity]?.glow || ''}
                        ${pullResult.rarity === 'legendary' ? 'border-yellow-400 bg-gradient-to-br from-yellow-950 to-amber-900' :
                          pullResult.rarity === 'epic'      ? 'border-purple-500 bg-gradient-to-br from-purple-950 to-purple-900' :
                          pullResult.rarity === 'rare'      ? 'border-blue-500 bg-gradient-to-br from-blue-950 to-blue-900' :
                          pullResult.rarity === 'uncommon'  ? 'border-green-500 bg-gradient-to-br from-green-950 to-green-900' :
                          'border-slate-500 bg-gradient-to-br from-slate-900 to-slate-800'
                        }`}
                      >
                        {pullResult.asset.image_url ? (
                          <img src={pullResult.asset.image_url} alt={pullResult.asset.name}
                            className="w-16 h-16 object-contain animate-bounce" style={{ imageRendering: 'pixelated' }} />
                        ) : (
                          <SpriteRenderer base={pullResult.asset.id} hair="none" outfit="none" accessory="none" petId="none" size={56} />
                        )}
                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded border ${RARITY_CONFIG[pullResult.rarity]?.color || ''}`}>
                          {RARITY_CONFIG[pullResult.rarity]?.label}
                        </span>
                        <span className="text-[9px] font-bold text-yellow-50 text-center leading-tight">{pullResult.asset.name}</span>
                        {pullResult.isDuplicate && (
                          <span className="text-[7px] text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-700">DUPLIKAT</span>
                        )}
                      </div>
                      
                      {pullResult.isDuplicate ? (
                        <p className="text-[9px] text-slate-400 text-center">Item sudah dimiliki. Qty +1!</p>
                      ) : (
                        <p className="text-[9px] text-green-400 text-center font-bold">Item ditambahkan to inventory!</p>
                      )}
                    </div>
                  ) : (
                    /* Cosmetics: Hot Wheels Blister Package 3D Flip */
                    <div className="flex flex-col items-center gap-3">
                      <div className="toy-box-container">
                        <div className={`toy-box-card ${isFlipped ? 'is-flipped' : ''}`} onClick={() => { playSelect(); setIsFlipped(true); }}>
                          {/* Front Face: Sealed Retail Box */}
                          <div className="toy-box-face toy-box-front flex flex-col justify-between p-3 relative overflow-hidden">
                            <div className="hang-tab"></div>
                            <div className="text-center mt-2">
                              <span className="text-[5.5px] rpg-font-retro text-amber-300 block tracking-widest leading-none">GAME SEED</span>
                              <span className="text-[7.5px] rpg-font-retro text-white font-extrabold block leading-tight mt-0.5 uppercase tracking-wide">COSMETIC TOY</span>
                            </div>
                            <div className="mika-window flex items-center justify-center my-auto w-full h-[80px]">
                              {/* glowing item silhouette */}
                              <div className="w-14 h-14 bg-yellow-500/10 rounded-full flex items-center justify-center animate-pulse border border-yellow-500/20">
                                <span className="text-xl text-yellow-400 font-bold font-mono">?</span>
                              </div>
                            </div>
                            <div className="bg-yellow-500 text-stone-950 font-bold text-[6px] py-0.5 px-2 rounded-sm text-center w-full uppercase select-none animate-pulse">
                              KETUK UNTUK FLIP!
                            </div>
                          </div>

                          {/* Back Face: Revealed Cosmetic */}
                          <div className="toy-box-face toy-box-back flex flex-col justify-between p-3 relative overflow-hidden">
                            <div className="hang-tab"></div>
                            <div className="text-center mt-2">
                              <span className="text-[6.5px] font-bold text-[#cca566] uppercase tracking-wider block font-mono">COLLECTOR CARD</span>
                            </div>
                            
                            {/* Showcase Display Area */}
                            <div className="w-full bg-black/80 border border-[#cca566]/40 rounded-lg p-2 flex flex-col items-center justify-center my-auto min-h-[80px]">
                              {pullResult.asset.image_url ? (
                                <img src={pullResult.asset.image_url} alt={pullResult.asset.name}
                                  className="w-14 h-14 object-contain" style={{ imageRendering: 'pixelated' }} />
                              ) : (
                                <SpriteRenderer base={pullResult.asset.id} hair="none" outfit="none" accessory="none" petId="none" size={44} />
                              )}
                              <span className={`text-[6.5px] font-mono border px-1.5 py-0.2 rounded uppercase font-bold mt-1.5 ${RARITY_CONFIG[pullResult.rarity]?.color || ''}`}>
                                {RARITY_CONFIG[pullResult.rarity]?.label}
                              </span>
                            </div>
                            
                            <div className="text-center w-full mt-1">
                              <span className="text-[8.5px] font-bold text-yellow-50 block leading-tight truncate px-1">{pullResult.asset.name}</span>
                              {pullResult.isDuplicate ? (
                                <span className="text-[6px] text-slate-400 bg-slate-900/80 px-1 py-0.2 rounded border border-slate-700 inline-block mt-0.5">DUPLIKAT (Qty +1)</span>
                              ) : (
                                <span className="text-[6px] text-green-400 font-bold block mt-0.5 uppercase">BARU!</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {!isFlipped ? (
                        <p className="text-[9px] text-[#cca566] text-center font-bold animate-pulse">Klik kotak mainan untuk membalik badan!</p>
                      ) : (
                        <p className="text-[9px] text-yellow-400 text-center font-semibold">Berhasil didapatkan!</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 mt-5">
              {!pullResult ? (
                <button
                  onClick={handlePullCard}
                  disabled={gachaPulling || localCoins < PACK_INFO[selectedPack].cost}
                  className="rpg-btn-game w-full py-3 flex items-center justify-center gap-2 font-bold text-xs disabled:opacity-40"
                >
                  <Sparkles size={12} /> {gachaPulling ? 'MENARIK...' : `ROBEK KARTU! (${PACK_INFO[selectedPack].cost} koin)`}
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handlePullCard}
                    disabled={gachaPulling || localCoins < PACK_INFO[selectedPack].cost}
                    className="rpg-btn-game w-full py-2.5 flex items-center justify-center gap-2 font-bold disabled:opacity-40 text-xs"
                  >
                    <Sparkles size={12} /> PULL LAGI ({PACK_INFO[selectedPack].cost} koin)
                  </button>
                  <button
                    onClick={handleReroll}
                    disabled={gachaPulling || localCoins < PACK_INFO[selectedPack].cost}
                    className="rpg-btn-game w-full py-2 flex items-center justify-center gap-2 text-[10px] font-bold border-yellow-500 disabled:opacity-40"
                    title="Lakukan reroll tarikan gacha"
                  >
                    REROLL — {PACK_INFO[selectedPack].cost} koin
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {/* ====================================================
          MODAL INTERACTION: GAME MULTIPLAYER (TTT & CHESS)
          ==================================================== */}
      {showGame && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[2000] p-4">
          <div className={`rpg-panel-stone ${
            activeGameTab === 'gartic' ? 'max-w-4xl' : activeGameTab === 'chess' ? 'max-w-md' : 'max-w-sm'
          } w-full p-6 border-4 border-[#cca566] text-center transition-all duration-300`}>
            
            <div className="flex justify-between items-center border-b border-stone-750 pb-2 mb-4">
              <h3 className="font-bold text-amber-500 text-xs rpg-font-retro flex items-center gap-1.5">
                <Gamepad2 size={14} /> {
                  activeGameTab === 'gartic' ? 'MULTIPLE REAL-TIME GARTIC' : activeGameTab === 'ttt' ? 'COZY TIC-TAC-TOE' : 'SANDBOX CHESS'
                }
              </h3>
              <button onClick={closeGameModal} className="text-slate-400 hover:text-white p-1">
                <X size={16} />
              </button>
            </div>

            {/* Game Tab Selector */}
            <div className="flex justify-center gap-2 mb-4 border-b border-stone-850 pb-2">
              <button
                onClick={() => { playSelect(); setActiveGameTab('ttt'); }}
                className={`px-3 py-1 text-[9px] font-bold rpg-font-retro rounded border transition-all ${
                  activeGameTab === 'ttt'
                    ? 'border-amber-500 bg-amber-950/40 text-yellow-300'
                    : 'border-stone-800 bg-stone-900/60 text-stone-500 hover:border-stone-700 hover:text-stone-300'
                }`}
              >
                TIC-TAC-TOE
              </button>
              <button
                onClick={() => { playSelect(); setActiveGameTab('chess'); }}
                className={`px-3 py-1 text-[9px] font-bold rpg-font-retro rounded border transition-all ${
                  activeGameTab === 'chess'
                    ? 'border-amber-500 bg-amber-950/40 text-yellow-300'
                    : 'border-stone-800 bg-stone-900/60 text-stone-500 hover:border-stone-700 hover:text-stone-300'
                }`}
              >
                SANDBOX CHESS
              </button>
              <button
                onClick={() => { playSelect(); setActiveGameTab('gartic'); }}
                className={`px-3 py-1 text-[9px] font-bold rpg-font-retro rounded border transition-all ${
                  activeGameTab === 'gartic'
                    ? 'border-amber-500 bg-amber-950/40 text-yellow-300'
                    : 'border-stone-800 bg-stone-900/60 text-stone-500 hover:border-stone-700 hover:text-stone-300'
                }`}
              >
                GARTIC MULTI
              </button>
            </div>

            {activeGameTab === 'ttt' && (
              <>
                {/* Player Roles Panel */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="p-2 border border-blue-900 bg-blue-950/30 rounded text-xs">
                    <span className="block text-[8px] text-blue-400 font-bold">PLAYER 1 (X)</span>
                    <span 
                      className="font-bold text-[10px]"
                      style={{ color: playerXProfile?.sprite_json.nameColor || '#fafaf9' }}
                    >
                      {tttState.playerXName || 'Kosong'}
                    </span>
                    {!tttState.playerXId && (
                      <button 
                        onClick={() => joinGame('X')}
                        className="rpg-btn-game text-[8px] px-2 py-0.5 mt-1.5 w-full block"
                      >
                        Gabung X
                      </button>
                    )}
                  </div>
                  <div className="p-2 border border-red-900 bg-red-950/30 rounded text-xs">
                    <span className="block text-[8px] text-red-400 font-bold">PLAYER 2 (O)</span>
                    <span 
                      className="font-bold text-[10px]"
                      style={{ color: playerOProfile?.sprite_json.nameColor || '#fafaf9' }}
                    >
                      {tttState.playerOName || 'Kosong'}
                    </span>
                    {!tttState.playerOId && (
                      <button 
                        onClick={() => joinGame('O')}
                        className="rpg-btn-game text-[8px] px-2 py-0.5 mt-1.5 w-full block"
                      >
                        Gabung O
                      </button>
                    )}
                  </div>
                </div>

                {/* Tic-Tac-Toe Game Grid Board */}
                <div 
                  className="w-48 h-48 mx-auto grid grid-cols-3 grid-rows-3 gap-2 bg-[#2d1b15] p-2 border-4 border-[#3e2723] rounded-lg shadow-inner mb-4"
                  style={{ gridTemplateRows: 'repeat(3, minmax(0, 1fr))' }}
                >
                  {tttState.board.map((cell, idx) => {
                    const isPlayer = currentProfile.id === tttState.playerXId || currentProfile.id === tttState.playerOId;
                    return (
                      <button
                        key={idx}
                        onClick={() => makeMove(idx)}
                        disabled={!isPlayer}
                        className={`w-full h-full rounded border border-[#5a3d28]/35 flex items-center justify-center text-xl font-bold font-mono transition-colors focus:outline-none ${
                          cell === 'X' 
                            ? 'text-blue-400 bg-blue-950/20' 
                            : cell === 'O' 
                              ? 'text-red-400 bg-red-950/20' 
                              : !isPlayer 
                                ? 'bg-[#1b100c]/40 cursor-not-allowed'
                                : 'bg-[#1b100c] hover:bg-[#3d271f]'
                        }`}
                      >
                        {cell}
                      </button>
                    );
                  })}
                </div>

                {/* Winner / Status message */}
                <div className="mb-4 text-xs font-semibold text-yellow-100">
                  {tttState.winner ? (
                    tttState.winner === 'Draw' ? (
                      <span className="text-yellow-500 font-bold text-sm block animate-bounce">SERI / DRAW!</span>
                    ) : (
                      <span className="text-green-400 font-bold text-sm block animate-bounce">PEMENANG: PLAYER {tttState.winner}!</span>
                    )
                  ) : (
                    <span>GILIRAN JALAN: <strong className="text-yellow-400">{tttState.turn}</strong></span>
                  )}
                </div>

                {/* Reset / Clean Board */}
                {tttState.winner && (
                  <button
                    onClick={() => {
                      playClick();
                      const newState = {
                        ...tttState,
                        board: Array(9).fill(null),
                        turn: 'X' as const,
                        winner: null
                      };
                      setTttState(newState);
                      db.saveTicTacToeState(newState);
                      db.broadcast('tictactoe_sync', { tttState: newState, spectatorIds });
                    }}
                    className="rpg-btn-game w-full border border-[#cca566] text-amber-500 py-1.5 text-[9px] font-bold mb-2 cursor-pointer shadow-md"
                  >
                    MAIN LAGI (RESET PAPAN)
                  </button>
                )}

                <button
                  onClick={() => { resetGame(); closeGameModal(); }}
                  className="rpg-btn-game w-full bg-slate-900 border border-slate-700 hover:border-amber-500 py-1.5 text-[9px] font-bold cursor-pointer"
                >
                  BERSIHKAN PAPAN & KELUAR GAME
                </button>
              </>
            )}

            {activeGameTab === 'chess' && (
              <>
                {/* Chess Player Roles Panel */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="p-2 border border-amber-900 bg-amber-950/20 rounded text-xs">
                    <span className="block text-[8px] text-amber-300 font-bold">PUTIH (WHITE)</span>
                    <span 
                      className="font-bold text-[10px]"
                      style={{ color: playerWhiteProfile?.sprite_json.nameColor || '#fafaf9' }}
                    >
                      {chessState.playerWhiteName || 'Kosong'}
                    </span>
                    {!chessState.playerWhiteId && (
                      <button 
                        onClick={() => joinChess('white')}
                        className="rpg-btn-game text-[8px] px-2 py-0.5 mt-1.5 w-full block"
                      >
                        Gabung Putih
                      </button>
                    )}
                  </div>
                  <div className="p-2 border border-stone-850 bg-stone-900/60 rounded text-xs">
                    <span className="block text-[8px] text-stone-400 font-bold">HITAM (BLACK)</span>
                    <span 
                      className="font-bold text-[10px]"
                      style={{ color: playerBlackProfile?.sprite_json.nameColor || '#eab308' }}
                    >
                      {chessState.playerBlackName || 'Kosong'}
                    </span>
                    {!chessState.playerBlackId && (
                      <button 
                        onClick={() => joinChess('black')}
                        className="rpg-btn-game text-[8px] px-2 py-0.5 mt-1.5 w-full block"
                      >
                        Gabung Hitam
                      </button>
                    )}
                  </div>
                </div>

                {/* Board + Bench Wrapper */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
                  
                  {/* Chess Game Grid Board (8x8) */}
                  <div 
                    className="w-64 h-64 grid grid-cols-8 grid-rows-8 gap-0 bg-[#2d1b15] border-4 border-[#3e2723] rounded-lg shadow-inner overflow-hidden flex-shrink-0"
                    style={{ gridTemplateRows: 'repeat(8, minmax(0, 1fr))' }}
                  >
                    {chessState.board.map((cell, idx) => {
                      const row = Math.floor(idx / 8);
                      const col = idx % 8;
                      const isLight = (row + col) % 2 === 0;
                      const isSelected = selectedSquare === idx;
                      const piece = cell;
                      const pieceColor = piece ? piece[0] : null;
                      const pieceType = piece ? piece[1] : null;

                      const isPlayerWhite = currentProfile.id === chessState.playerWhiteId;
                      const isPlayerBlack = currentProfile.id === chessState.playerBlackId;
                      const isPlayer = isPlayerWhite || isPlayerBlack;

                      // Solid chess glyphs mapping
                      const SOLID_CHESS_GLYPHS: Record<string, string> = {
                        K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟'
                      };
                      const glyph = pieceType ? (SOLID_CHESS_GLYPHS[pieceType] || '') : '';

                      return (
                        <button
                          key={idx}
                          onClick={() => handleChessSquareClick(idx)}
                          onDragOver={handleChessDragOver}
                          onDrop={(e) => handleChessDrop(e, idx)}
                          disabled={!isPlayer}
                          className={`w-full h-full flex items-center justify-center text-xl font-bold transition-all relative focus:outline-none ${
                            isLight ? 'bg-[#dfbe8c]' : 'bg-[#8b5a2b]'
                          } ${
                            isSelected 
                              ? 'ring-2 ring-yellow-400 ring-inset bg-yellow-500/20' 
                              : ''
                          } ${
                            !isPlayer
                              ? 'cursor-default'
                              : 'hover:brightness-110 cursor-pointer'
                          }`}
                        >
                          {piece && (
                            <span 
                              draggable={isPlayer}
                              onDragStart={(e) => handleChessDragStart(e, idx)}
                              className={`select-none transition-transform duration-200 ${
                                isPlayer ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                              } ${
                                pieceColor === 'w'
                                  ? 'text-stone-55 drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.95)]'
                                  : 'text-[#18110f] drop-shadow-[0_1.2px_1.2px_rgba(255,255,255,0.4)]'
                              } ${isSelected ? 'scale-110' : ''}`}
                            >
                              {glyph}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Captured pieces bench */}
                  <div 
                    onDragOver={handleChessDragOver}
                    onDrop={handleCapturedDropZone}
                    onClick={handleCapturedZoneClick}
                    className="w-32 h-64 bg-[#1b100c] border-4 border-[#3e2723] rounded-lg p-2 flex flex-col justify-between cursor-pointer hover:border-amber-600 transition-colors flex-shrink-0"
                    title="Bidak cadangan. Tarik bidak ke sini untuk menyimpannya."
                  >
                    <span className="text-[7.5px] text-amber-500 font-bold block uppercase tracking-wider text-center border-b border-[#3e2723]/60 pb-1 mb-1.5 font-mono">
                      BENCH CADANGAN
                    </span>
                    <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-1 content-start max-h-[200px] no-scrollbar">
                      {(chessState.capturedPieces || []).map((piece: string, cIdx: number) => {
                        const pieceColor = piece[0];
                        const pieceType = piece[1];
                        const SOLID_CHESS_GLYPHS: Record<string, string> = {
                          K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟'
                        };
                        const glyph = SOLID_CHESS_GLYPHS[pieceType] || '';
                        const isSelected = selectedCaptured?.index === cIdx;
                        const isPlayerWhite = currentProfile.id === chessState.playerWhiteId;
                        const isPlayerBlack = currentProfile.id === chessState.playerBlackId;
                        const isPlayer = isPlayerWhite || isPlayerBlack;

                        return (
                          <div
                            key={cIdx}
                            onClick={(e) => handleCapturedPieceClick(e, piece, cIdx)}
                            draggable={isPlayer}
                            onDragStart={(e) => handleCapturedDragStart(e, piece, cIdx)}
                            className={`w-6 h-6 rounded border flex items-center justify-center text-sm font-bold transition-all ${
                              isSelected
                                ? 'bg-yellow-500/20 border-yellow-400 ring-2 ring-yellow-400 ring-inset'
                                : 'bg-[#2d1b15] border-[#5a3d28]/35 hover:bg-[#3d271f] hover:border-amber-500'
                            } ${
                              isPlayer ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                            }`}
                          >
                            <span className={`select-none transition-transform ${
                              pieceColor === 'w'
                                ? 'text-stone-50 drop-shadow-[0_1px_1px_rgba(0,0,0,0.95)]'
                                : 'text-[#18110f] drop-shadow-[0_0.8px_0.8px_rgba(255,255,255,0.4)]'
                            } ${isSelected ? 'scale-110' : ''}`}>
                              {glyph}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-[6px] text-stone-500 text-center italic mt-1 leading-none uppercase font-mono">
                      TARIK / KLIK DI SINI UNTUK SIMPAN
                    </div>
                  </div>

                </div>

                {/* Winner / Status message */}
                <div className="mb-4 text-xs font-semibold text-yellow-100">
                  {chessState.winner ? (
                    <span className="text-green-400 font-bold text-sm block animate-bounce">
                      PEMENANG: PLAYER {chessState.winner === 'white' ? 'PUTIH (WHITE)' : 'HITAM (BLACK)'}!
                    </span>
                  ) : (
                    <span>MODE BEBAS (SANDBOX) — Tarik & taruh bidak atau klik untuk jalan!</span>
                  )}
                </div>

                {/* Reset / Clean Board */}
                {chessState.winner && (
                  <button
                    onClick={playAgainChess}
                    className="rpg-btn-game w-full border border-[#cca566] text-amber-500 py-1.5 text-[9px] font-bold mb-2 cursor-pointer shadow-md"
                  >
                    MAIN LAGI (RESET PAPAN)
                  </button>
                )}

                <button
                  onClick={() => { resetChess(); closeGameModal(); }}
                  className="rpg-btn-game w-full bg-slate-900 border border-slate-700 hover:border-amber-500 py-1.5 text-[9px] font-bold cursor-pointer"
                >
                  BERSIHKAN PAPAN & KELUAR GAME
                </button>
              </>
            )}

            {activeGameTab === 'gartic' && (
              <div className="flex flex-col gap-4 text-left font-sans text-stone-200">
                {/* Top Status Bar / HUD */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/80 border border-amber-600/40 p-3 rounded-lg animate-fade-in">
                  <div className="flex items-center gap-3">
                    <span className="bg-amber-950/60 border border-amber-600/60 text-yellow-400 font-extrabold text-[10px] px-2.5 py-1 rounded rpg-font-retro">
                      RONDE {garticState.round}/{garticState.totalRounds}
                    </span>
                    <span className="text-stone-300 text-xs font-semibold">
                      Penggambar: <strong className="text-yellow-100">{garticState.drawerName || 'Menunggu...'}</strong>
                    </span>
                  </div>

                  {/* Secret Word Hint / Blanks */}
                  <div className="flex flex-col items-center">
                    {garticState.status === 'active' ? (
                      garticState.drawerId === currentProfile.id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-amber-500 font-bold uppercase tracking-wider">Kata Rahasia:</span>
                          <span className="text-xs font-black tracking-widest text-green-400 bg-green-950/40 px-2.5 py-1 rounded border border-green-800/40 font-mono">
                            {garticState.currentWord.toUpperCase()}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-amber-500 font-bold uppercase tracking-wider">Petunjuk:</span>
                          <span className="text-sm font-black tracking-[0.25em] text-yellow-300 font-mono bg-black/60 px-3 py-1 rounded border border-amber-900/40">
                            {garticState.correctGuessers.includes(currentProfile.id) || garticRevealedWord ? (
                              <span className="text-green-400 font-bold">{garticRevealedWord.toUpperCase()}</span>
                            ) : (
                              Array(garticState.wordLength).fill('_').join(' ')
                            )}
                          </span>
                        </div>
                      )
                    ) : (
                      <span className="text-[10px] text-stone-400 font-bold italic">Round Selesai</span>
                    )}
                  </div>

                  {/* Timer Display */}
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-amber-500" />
                    <span className={`text-base font-mono font-bold ${
                      garticState.timer <= 15 ? 'text-red-500 animate-pulse' : 'text-green-400'
                    }`}>
                      {garticState.timer}s
                    </span>
                  </div>
                </div>

                {/* Main 3-Column Content Layout */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  
                  {/* Column 1: Leaderboard & Player Lobby (3 Spans) */}
                  <div className="md:col-span-3 bg-slate-950/70 border border-[#cca566]/20 p-3 rounded-lg flex flex-col h-[380px] overflow-hidden animate-fade-in">
                    <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest border-b border-amber-900/30 pb-1 mb-2 font-mono flex items-center gap-1">
                      <Trophy size={11} /> Papan Skor ({presencePlayers.length} P)
                    </span>
                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
                      {presencePlayers.map(p => {
                        const scoreData = garticState.leaderboard[p.id] || { score: 0 };
                        const isDrawer = garticState.drawerId === p.id;
                        const isGuessed = garticState.correctGuessers.includes(p.id);
                        return (
                          <div 
                            key={p.id}
                            className={`flex items-center justify-between p-2 rounded border text-xs ${
                              isDrawer 
                                ? 'bg-amber-950/20 border-amber-600/40' 
                                : isGuessed 
                                  ? 'bg-green-950/20 border-green-700/40 text-green-300 font-bold'
                                  : 'bg-[#121212] border-stone-850'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              {isDrawer ? (
                                <Brush size={11} className="text-amber-400 flex-shrink-0 animate-bounce" />
                              ) : isGuessed ? (
                                <Check size={11} className="text-green-400 flex-shrink-0 font-bold" />
                              ) : (
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-500 flex-shrink-0" />
                              )}
                              {(() => {
                                const pProfile = profiles.find(pr => pr.id === p.id);
                                if (!pProfile) return null;
                                return (
                                  <div className="w-5 h-5 bg-slate-950/60 border border-[#cca566]/20 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                                    <SpriteRenderer
                                      base={pProfile.sprite_json.base}
                                      hair={pProfile.sprite_json.hair}
                                      outfit={pProfile.sprite_json.outfit}
                                      accessory={pProfile.sprite_json.accessory}
                                      petId="none"
                                      size={18}
                                    />
                                  </div>
                                );
                              })()}
                              <span 
                                className="font-bold truncate"
                                style={{ color: p.id === currentProfile.id ? '#ffd700' : undefined }}
                              >
                                {p.name.split(' ')[0]}
                              </span>
                            </div>
                            <span className="font-mono font-bold text-[10px] text-stone-300 bg-black/40 px-1.5 py-0.5 rounded">
                              {scoreData.score} pts
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Column 2: Canvas Drawing Board (6 Spans) */}
                  <div className="md:col-span-6 flex flex-col gap-2">
                    <div className="relative bg-stone-900 border-2 border-amber-600/40 rounded-lg overflow-hidden h-[300px]">
                      <canvas
                        ref={garticCanvasRef}
                        width={500}
                        height={300}
                        onMouseDown={handleCanvasMouseDown}
                        onMouseMove={handleCanvasMouseMove}
                        onMouseUp={handleCanvasMouseUpOrLeave}
                        onMouseLeave={handleCanvasMouseUpOrLeave}
                        onTouchStart={handleCanvasTouchStart}
                        onTouchMove={handleCanvasTouchMove}
                        onTouchEnd={handleCanvasMouseUpOrLeave}
                        className={`w-full h-full bg-[#161413] ${
                          garticState.drawerId === currentProfile.id && garticState.status === 'active'
                            ? 'cursor-crosshair'
                            : 'pointer-events-none'
                        }`}
                      />
                      
                      {/* overlay if round inactive / drawer selection banner */}
                      {garticState.status === 'idle' && (
                        <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-center p-4">
                          <span className="text-xs font-bold text-yellow-300 rpg-font-retro animate-pulse">LOBBY GAME GARTIC</span>
                          <p className="text-[9.5px] text-slate-400 mt-2 font-medium max-w-xs leading-relaxed">
                            {currentProfile.role === 'Director' 
                              ? 'Sebagai Director, silakan sesuaikan kata/config dan klik "MULAI GAME" di panel bawah.' 
                              : 'Menunggu game dimulai oleh Director...'}
                          </p>
                        </div>
                      )}

                      {/* overlay when round ended */}
                      {garticState.status === 'ended' && (
                        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-center p-4">
                          <Trophy size={36} className="text-yellow-500 mb-2 animate-bounce" />
                          <span className="text-sm font-bold text-green-400 rpg-font-retro animate-bounce">GAME SELESAI!</span>
                          <p className="text-[10px] text-stone-300 mt-2.5 font-bold mb-4">Papan peringkat akhir dan bonus koin telah dihitung.</p>
                          {currentProfile.role === 'Director' && (
                            <button
                              type="button"
                              onClick={() => { playClick(); resetGarticGame(); }}
                              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-stone-950 font-extrabold text-[10.5px] rounded active:scale-95 transition-all cursor-pointer shadow-md flex items-center gap-1.5 font-mono"
                            >
                              KEMBALI KE LOBBY (RESET)
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Canvas Controls Palette (Drawer only) */}
                    {garticState.drawerId === currentProfile.id && garticState.status === 'active' && (
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/80 p-2.5 rounded-lg border border-amber-900/40 animate-fade-in">
                        {/* Tool choice */}
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => { playSelect(); setGarticTool('pen'); }}
                            className={`p-1.5 rounded border transition-colors ${
                              garticTool === 'pen' ? 'bg-amber-600 text-stone-950 border-amber-500' : 'bg-black/60 border-stone-850 hover:border-stone-700'
                            }`}
                            title="Pensil"
                          >
                            <Brush size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => { playSelect(); setGarticTool('eraser'); }}
                            className={`p-1.5 rounded border transition-colors ${
                              garticTool === 'eraser' ? 'bg-amber-600 text-stone-950 border-amber-500' : 'bg-black/60 border-stone-850 hover:border-stone-700'
                            }`}
                            title="Penghapus"
                          >
                            <Eraser size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => { playClick(); handleClearCanvas(); }}
                            className="p-1.5 rounded border bg-red-950/40 text-red-400 border-red-900/30 hover:bg-red-900 hover:text-stone-950"
                            title="Bersihkan Kanvas"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>

                        {/* Colors */}
                        <div className="flex items-center gap-1">
                          {['#fafaf9', '#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#e0f2fe', '#374151'].map(color => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => { playSelect(); setGarticDrawingColor(color); setGarticTool('pen'); }}
                              style={{ backgroundColor: color }}
                              className={`w-4 h-4 rounded-full border transition-all ${
                                garticDrawingColor === color && garticTool === 'pen' ? 'scale-120 ring-2 ring-amber-500 ring-offset-2 ring-offset-slate-950' : 'opacity-85 hover:opacity-100 hover:scale-110'
                              }`}
                            />
                          ))}
                        </div>

                        {/* Brush Width */}
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] font-bold text-stone-400 uppercase">Lebar:</span>
                          <input
                            type="range"
                            min="1"
                            max="20"
                            value={garticDrawingWidth}
                            onChange={(e) => setGarticDrawingWidth(parseInt(e.target.value))}
                            className="w-16 accent-amber-500 cursor-pointer h-1 bg-slate-950 rounded-lg appearance-none"
                          />
                          <span className="text-[10px] font-bold font-mono text-amber-200">{garticDrawingWidth}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Column 3: Live Guess Chat Feed (3 Spans) */}
                  <div className="md:col-span-3 bg-slate-950/70 border border-[#cca566]/20 p-3 rounded-lg flex flex-col h-[380px] justify-between animate-fade-in">
                    <div className="flex flex-col flex-1 min-h-0">
                      <div className="flex justify-between items-center border-b border-amber-900/30 pb-1 mb-2 flex-shrink-0">
                        <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest font-mono flex items-center gap-1">
                          <MessageSquare size={11} /> Tebakan Chat
                        </span>
                        <button
                          type="button"
                          onClick={() => { playClick(); setGarticChat([]); }}
                          className="text-[8px] font-bold text-red-400 hover:text-red-300 font-mono bg-red-950/40 px-1.5 py-0.5 rounded border border-red-900/50 cursor-pointer transition-all active:scale-95 flex-shrink-0"
                          title="Hapus semua chat tebakan"
                        >
                          HAPUS
                        </button>
                      </div>
                      
                      {/* Message list */}
                      <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
                        {garticChat.map(msg => (
                          <div 
                            key={msg.id} 
                            className={`p-1.5 rounded text-[10.5px] leading-relaxed break-words ${
                              msg.system 
                                ? msg.correct 
                                  ? 'bg-green-950/30 border border-green-800/40 text-green-300 font-bold' 
                                  : 'bg-amber-950/30 text-amber-300 font-bold' 
                                : 'bg-[#181818]/65 border border-stone-850 text-stone-200'
                            }`}
                          >
                            <span className="font-extrabold text-[9.5px] text-amber-100 pr-1.5 border-r border-stone-800 mr-1.5">
                              {msg.sender.split(' ')[0]}
                            </span>
                            <span>{msg.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Chat Box Form */}
                    <form onSubmit={handleSendGarticGuess} className="border-t border-[#3e2723]/60 pt-2 flex gap-1.5 mt-2 flex-shrink-0">
                      <input
                        type="text"
                        value={garticChatInput}
                        onChange={(e) => setGarticChatInput(e.target.value)}
                        placeholder={
                          garticState.drawerId === currentProfile.id 
                            ? 'Anda Penggambar...' 
                            : garticState.correctGuessers.includes(currentProfile.id)
                              ? 'Tebakan benar! ✓'
                              : 'Ketik tebakan...'
                        }
                        disabled={
                          garticState.drawerId === currentProfile.id || 
                          garticState.correctGuessers.includes(currentProfile.id) || 
                          garticState.status !== 'active'
                        }
                        className="flex-1 bg-black/80 text-yellow-50 px-2 py-1 rounded border border-amber-900/40 text-[10px] focus:outline-none focus:border-amber-600 placeholder:text-stone-600"
                      />
                      <button
                        type="submit"
                        disabled={
                          garticState.drawerId === currentProfile.id || 
                          garticState.correctGuessers.includes(currentProfile.id) || 
                          garticState.status !== 'active'
                        }
                        className="px-2 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:hover:bg-amber-600 text-stone-950 font-extrabold text-[10px] rounded active:scale-95 transition-all cursor-pointer"
                      >
                        GUESS
                      </button>
                    </form>
                  </div>

                </div>

                {/* Director Control Panel & Config */}
                {currentProfile.role === 'Director' && (
                  <div className="bg-slate-950/85 border border-[#cca566]/20 p-3.5 rounded-lg flex flex-col gap-3 mt-2 font-mono">
                    <div className="flex items-center justify-between border-b border-amber-900/30 pb-2">
                      <span className="text-[10px] font-black text-amber-400 rpg-font-retro uppercase tracking-wider flex items-center gap-1.5">
                        <Settings size={13} /> Panel Game Director
                      </span>
                      <button
                        type="button"
                        onClick={() => { playSelect(); setGarticShowSettings(!garticShowSettings); }}
                        className="px-3 py-1 bg-[#221c1a] hover:bg-stone-800 text-[9px] font-bold text-amber-200 rounded border border-amber-900/40 cursor-pointer"
                      >
                        {garticShowSettings ? 'Tutup Pengaturan' : 'Buka Pengaturan & Kata'}
                      </button>
                    </div>

                    {/* Game Launch and Quick Actions */}
                    <div className="flex flex-wrap items-center gap-3.5">
                      <button
                        type="button"
                        onClick={() => { playClick(); startGarticGame(); }}
                        disabled={garticState.status === 'active'}
                        className="px-4 py-2 bg-gradient-to-b from-green-500 to-green-700 text-white border border-green-400 font-extrabold text-[10.5px] rounded active:scale-95 transition-all cursor-pointer shadow-md disabled:opacity-40 flex items-center gap-1.5 font-mono"
                      >
                        <Play size={12} /> MULAI GAME
                      </button>
                      <button
                        type="button"
                        onClick={() => { playClick(); handleGarticRoundTimeout(garticState); }}
                        disabled={garticState.status !== 'active'}
                        className="px-3 py-2 bg-red-950 border border-red-800/60 text-red-300 font-bold text-[10px] rounded active:scale-95 transition-all cursor-pointer disabled:opacity-40"
                      >
                        LEWATKAN RONDE (FORCED)
                      </button>
                      {garticState.status !== 'idle' && (
                        <button
                          type="button"
                          onClick={() => { playClick(); resetGarticGame(); }}
                          className="px-3 py-2 bg-[#221c1a] hover:bg-stone-850 text-amber-500 border border-amber-900/40 font-bold text-[10px] rounded active:scale-95 transition-all cursor-pointer"
                        >
                          RESET GAME
                        </button>
                      )}
                      <div className="text-[9.5px] text-stone-400 font-semibold">
                        Status: <strong className="text-yellow-100">{
                          garticState.status === 'active' ? 'Sedang Berjalan 🟢' : 'Idle ⚪'
                        }</strong>
                      </div>
                    </div>

                    {/* settings config block */}
                    {garticShowSettings && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 pt-3 border-t border-amber-900/30 animate-fade-in text-xs font-semibold">
                        
                        {/* Left Sub-column: Game Config Parameters */}
                        <div className="flex flex-col gap-3 border-r border-amber-900/20 pr-4">
                          <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest font-mono text-left">Konfigurasi Sesi</span>
                          
                          {/* Round Count */}
                          <div className="flex items-center justify-between">
                            <span className="text-stone-300">Total Ronde:</span>
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={garticState.totalRounds}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 3;
                                const copy = { ...garticState, totalRounds: val };
                                setGarticState(copy);
                                saveGarticConfig(copy);
                              }}
                              className="w-16 bg-black text-yellow-100 px-2 py-1 rounded border border-amber-950 text-center font-mono font-bold focus:outline-none"
                            />
                          </div>

                          {/* Round Timer Duration */}
                          <div className="flex items-center justify-between">
                            <span className="text-stone-300">Timer Ronde (detik):</span>
                            <input
                              type="number"
                              min="15"
                              max="180"
                              value={garticState.totalTimer}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 60;
                                const copy = { ...garticState, totalTimer: val, timer: val };
                                setGarticState(copy);
                                saveGarticConfig(copy);
                              }}
                              className="w-16 bg-black text-yellow-100 px-2 py-1 rounded border border-amber-950 text-center font-mono font-bold focus:outline-none"
                            />
                          </div>

                          {/* Base Reward Coins */}
                          <div className="flex items-center justify-between">
                            <span className="text-stone-300">Base Reward Koin:</span>
                            <input
                              type="number"
                              min="10"
                              max="1000"
                              value={garticState.baseReward}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 100;
                                const copy = { ...garticState, baseReward: val };
                                setGarticState(copy);
                                saveGarticConfig(copy);
                              }}
                              className="w-16 bg-black text-yellow-100 px-2 py-1 rounded border border-amber-950 text-center font-mono font-bold focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Right Sub-column: Word Pool Management */}
                        <div className="flex flex-col gap-2.5">
                          <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest font-mono text-left">Daftar Kata Pool</span>
                          
                          {/* Add Word Form */}
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={newWordInput}
                              onChange={(e) => setNewWordInput(e.target.value)}
                              placeholder="Tambah kata baru..."
                              className="flex-1 bg-black text-yellow-100 px-2 py-1 rounded border border-amber-900/40 text-[10px] focus:outline-none focus:border-amber-600 font-semibold"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                playClick();
                                const clean = newWordInput.trim().toLowerCase();
                                if (!clean) return;
                                if (garticState.words.some(w => w.text === clean)) return;
                                const updatedWords = [...garticState.words, { id: Date.now().toString(), text: clean, enabled: true }];
                                setNewWordInput('');
                                const copy = { ...garticState, words: updatedWords };
                                setGarticState(copy);
                                saveGarticConfig(copy);
                              }}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-stone-950 text-[10px] font-black rounded cursor-pointer"
                            >
                              TAMBAH
                            </button>
                          </div>

                          {/* Words list list */}
                          <div className="max-h-[140px] overflow-y-auto space-y-1 pr-1 border border-amber-950 bg-black/20 p-2 rounded no-scrollbar">
                            {garticState.words.map(w => (
                              <div key={w.id} className="flex items-center justify-between bg-[#121212] p-1.5 rounded border border-stone-850 text-[10.5px]">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={w.enabled}
                                    onChange={() => {
                                      playSelect();
                                      const updatedWords = garticState.words.map(item => item.id === w.id ? { ...item, enabled: !item.enabled } : item);
                                      const copy = { ...garticState, words: updatedWords };
                                      setGarticState(copy);
                                      saveGarticConfig(copy);
                                    }}
                                    className="accent-amber-500 cursor-pointer animate-none"
                                  />
                                  <span className={`font-mono ${w.enabled ? 'text-yellow-100 font-bold' : 'text-stone-500 line-through'}`}>{w.text}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    playClick();
                                    const updatedWords = garticState.words.filter(item => item.id !== w.id);
                                    const copy = { ...garticState, words: updatedWords };
                                    setGarticState(copy);
                                    saveGarticConfig(copy);
                                  }}
                                  className="text-red-400 hover:text-red-500 p-0.5"
                                  title="Hapus kata"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
