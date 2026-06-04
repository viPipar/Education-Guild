
import React, { useState, useEffect, useRef } from 'react';
import type { Profile, Seat, RpgAsset, Rarity, TavernComment } from '../lib/supabase';
import { db } from '../lib/supabase';
import { RARITY_CONFIG } from './AssetManager';
import { SpriteRenderer } from './SpriteRenderer';
import { Coins, Sparkles, X, Gamepad2, Package, MessageSquare, Send } from 'lucide-react';
import { playClick, playSelect } from '../lib/audio';


interface TavernProps {
  currentProfile: Profile;
  profiles: Profile[];
  onRefreshProfiles: () => void;
  onUpdateProfile: (updates: Partial<Profile>) => void;
  onSeatClick?: (seatId: string, isLeave: boolean) => void;
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

export const Tavern: React.FC<TavernProps> = ({
  currentProfile,
  profiles,
  onRefreshProfiles,
  onUpdateProfile,
  onSeatClick,
}) => {
  const seats = React.useMemo(() => db.getSeatsSync('tavern', profiles), [profiles]);
  
  // Interactive Modals
  const [showKasir, setShowKasir] = useState(false);
  const [showGacha, setShowGacha] = useState(false);
  const [showGame, setShowGame] = useState(false);

  // Gacha state
  type PackType = 'individual' | 'education' | 'ieee';
  const [selectedPack, setSelectedPack] = useState<PackType>('individual');
  const [pullResult, setPullResult] = useState<{ asset: RpgAsset; rarity: Rarity; isDuplicate: boolean } | null>(null);
  const [gachaError, setGachaError] = useState('');
  const [gachaPulling, setGachaPulling] = useState(false);
  const [cardRevealed, setCardRevealed] = useState(false);

  // Coin refresh helper
  const [localCoins, setLocalCoins] = useState(currentProfile.coins || 0);
  useEffect(() => {
    setLocalCoins(currentProfile.coins || 0);
  }, [currentProfile.coins]);

  const PACK_INFO: Record<PackType, { label: string; cost: number; desc: string; emoji: string; probs: string }> = {
    individual: { label: 'Individual Pack', cost: 10, desc: 'Peluang Common besar, Legendary kecil.', emoji: '📦', probs: '60% C · 25% UC · 10% R · 4% E · 1% L' },
    education:  { label: 'Education Pack', cost: 25, desc: 'Peluang seimbang, Rare cukup sering.',   emoji: '🎓', probs: '45% C · 30% UC · 15% R · 7% E · 3% L' },
    ieee:       { label: 'IEEE Pack',       cost: 50, desc: 'Rare–Legendary jauh lebih sering!',     emoji: '⚡', probs: '15% C · 20% UC · 35% R · 20% E · 10% L' },
  };

  const [spectatorIds, setSpectatorIds] = useState<string[]>([]);

  // Anonymous Chat / Evaluation Comment states
  const [commentInput, setCommentInput] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [comments, setComments] = useState<TavernComment[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);

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
  const [activeGameTab, setActiveGameTab] = useState<'ttt' | 'chess'>('ttt');

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

  // ── Gacha handlers ────────────────────────────────────────────────────────
  const handlePullCard = async () => {
    setGachaError('');
    setPullResult(null);
    setCardRevealed(false);
    setGachaPulling(true);

    const result = await db.pullCard(currentProfile.id, selectedPack);
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
    <div className="flex flex-col gap-4 p-2">
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Interactive Tavern Canvas Map (8 Spans) */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          
          <div className="map-scroll-container">
            <div className="rpg-panel border-4 h-[550px] relative overflow-hidden rounded bg-[#1c0f0d] min-w-[750px] lg:min-w-0" style={{
              backgroundImage: 'radial-gradient(#100807 1.5px, transparent 1.5px)',
              backgroundSize: '24px 24px'
            }}>
            
            <div className="absolute top-2 left-2 border border-slate-700 bg-slate-900/80 px-2 py-1 rounded text-[10px] rpg-font-retro text-amber-500 z-30">
              🍻 COZY DIVISION TAVERN
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
              onClick={() => { setActiveGameTab('ttt'); openGameModal(); }}
              className="absolute top-[54%] left-[10%] -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-[#6d4c41] border-4 border-[#3e2723] rounded-full shadow-2xl z-20 cursor-pointer flex flex-col items-center justify-center hover:scale-105 transition-transform hover:border-blue-400 group"
            >
              <span className="text-[12px]">🎮</span>
              <span className="text-[6px] text-[#ffd700] font-bold text-center leading-none mt-0.5 rpg-font-retro animate-pulse">TIC-TAC-TOE</span>
            </div>

            {/* Chess Game Table */}
            <div 
              onClick={() => { setActiveGameTab('chess'); openGameModal(); }}
              className="absolute top-[54%] left-[42%] -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-[#5c4033] border-4 border-[#2d1b15] rounded-full shadow-2xl z-20 cursor-pointer flex flex-col items-center justify-center hover:scale-105 transition-transform hover:border-amber-400 group"
            >
              <span className="text-[12px]">♟️</span>
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
                  ⚪: {playerWhiteProfile.name.split(' ')[0]}
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
                  ⚫: {playerBlackProfile.name.split(' ')[0]}
                </span>
              </div>
            )}

            {/* Render Spectator Avatars around the active table */}
            {spectatorIds
              .filter(id => {
                if (activeGameTab === 'chess') {
                  return id !== chessState.playerWhiteId && id !== chessState.playerBlackId;
                } else {
                  return id !== tttState.playerXId && id !== tttState.playerOId;
                }
              })
              .map((specId, index) => {
                const specProfile = profiles.find(p => p.id === specId);
                if (!specProfile) return null;
                
                const tableX = activeGameTab === 'chess' ? 42 : 10;
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
                    key={specId}
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
                      👁️ {specProfile.name.split(' ')[0]}
                    </span>
                  </div>
                );
              })}

            {/* ====================================================
                RIGHT SIDE: BAR COUNTER, NPC BARTENDER, SHOP & GACHA
                ==================================================== */}

            {/* Bartender counter bar */}
            <div className="absolute top-[28%] right-[5%] w-[42%] h-10 bg-[#3e2723] border-4 border-[#271510] rounded-lg z-10 flex justify-between items-center px-4 shadow-lg">
              <div className="h-[2px] w-full bg-[#5d4037]"></div>
            </div>

            {/* NPC Bartender Sprite */}
            <div className="absolute top-[12%] right-[25%] -translate-x-1/2 flex flex-col items-center z-0">
              {/* NPC Portrait */}
              <div className="w-12 h-12 bg-slate-900 border-2 border-[#5a3d28] rounded-full overflow-hidden flex items-center justify-center">
                <span className="text-xl">🤵</span>
              </div>
              <span className="bg-slate-950/80 px-1.5 py-0.2 rounded text-[6.5px] border border-amber-600/40 text-[#cca566] font-bold mt-0.5">BARTENDER NPC</span>
            </div>

            {/* Clickable Cash Register (Kasir Pack) */}
            <div
              onClick={() => { playClick(); setShowKasir(true); }}
              className="absolute top-[22%] right-[38%] w-10 h-10 bg-[#795548] border-2 border-[#3e2723] rounded flex flex-col items-center justify-center cursor-pointer hover:scale-105 transition-transform hover:border-amber-400 shadow z-20 group"
            >
              <span className="text-sm">🪙</span>
              <span className="text-[6px] text-green-400 font-bold font-mono group-hover:animate-bounce leading-none mt-0.5">KASIR</span>
            </div>

            {/* Clickable Gacha Machine (Memory Gacha) */}
            <div
              onClick={() => { playClick(); setShowGacha(true); }}
              className="absolute top-[22%] right-[10%] w-10 h-10 bg-[#d90429] border-2 border-[#9b0000] rounded-t-xl flex flex-col items-center justify-center cursor-pointer hover:scale-105 transition-transform hover:border-yellow-400 shadow-xl z-20 group"
            >
              <div className="w-4 h-4 bg-white/30 rounded-full border border-white/50 flex items-center justify-center animate-pulse">
                <span className="text-[8px]">⭐</span>
              </div>
              <span className="text-[5.5px] text-white font-bold tracking-tight leading-none mt-0.5 rpg-font-retro">GACHA</span>
            </div>


            {/* ====================================================
                SEATS AND ONLINE MEMBERS PLOTTING
                ==================================================== */}
            {seats.map((seat) => {
              const occupant = profiles.find(p => p.id === seat.user_id);
              
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
                🔒 Arsip evaluasi hari sebelumnya terkunci.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ====================================================
          MODAL: KASIR — BELI CARD PACK
          ==================================================== */}
      {showKasir && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[2000] p-4">
          <div className="rpg-panel-stone max-w-sm w-full p-5 border-4 border-[#cca566]" style={{ animation: 'fadeIn 0.15s ease-out' }}>

            <div className="flex justify-between items-center border-b border-stone-700 pb-2 mb-4">
              <h3 className="font-bold text-amber-500 text-xs rpg-font-retro flex items-center gap-1.5">
                <Coins size={14} /> KASIR — BELI CARD PACK
              </h3>
              <button onClick={() => { playClick(); setShowKasir(false); }} className="text-slate-400 hover:text-white p-1"><X size={16} /></button>
            </div>

            {/* Coin balance */}
            <div className="flex items-center gap-2 mb-4 bg-amber-950/30 border border-amber-700/40 rounded px-3 py-2">
              <Coins size={14} className="text-yellow-500" />
              <span className="text-xs font-bold text-yellow-300">Saldo Koin: <span className="text-yellow-100 text-sm">{localCoins} 🪙</span></span>
            </div>

            {/* Pack selection */}
            <div className="flex flex-col gap-3">
              {(Object.keys(PACK_INFO) as PackType[]).map(pack => {
                const info = PACK_INFO[pack];
                const canAfford = localCoins >= info.cost;
                return (
                  <div
                    key={pack}
                    onClick={() => { playSelect(); setSelectedPack(pack); }}
                    className={`p-3 rounded border cursor-pointer transition-all ${
                      selectedPack === pack
                        ? 'border-amber-500 bg-amber-950/40 shadow-[0_0_10px_rgba(251,191,36,0.2)]'
                        : 'border-[#5a3d28] bg-[#16110e] hover:border-amber-700'
                    } ${!canAfford ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{info.emoji}</span>
                        <div>
                          <p className="font-bold text-[11px] text-yellow-100">{info.label}</p>
                          <p className="text-[8px] text-slate-400">{info.desc}</p>
                        </div>
                      </div>
                      <span className={`font-bold text-xs px-2 py-1 rounded border font-mono ${
                        canAfford ? 'text-yellow-300 border-amber-600 bg-amber-950/60' : 'text-slate-500 border-slate-700'
                      }`}>
                        {info.cost} 🪙
                      </span>
                    </div>
                    <p className="text-[7px] text-slate-500 mt-1.5 font-mono">{info.probs}</p>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => {
                playClick();
                setShowKasir(false);
                setShowGacha(true);
                setPullResult(null);
                setGachaError('');
                setCardRevealed(false);
              }}
              disabled={localCoins < PACK_INFO[selectedPack].cost}
              className="rpg-btn-game w-full mt-4 py-3 flex items-center justify-center gap-2 font-bold disabled:opacity-40"
            >
              <Package size={12} /> BUKA GACHA MACHINE →
            </button>
          </div>
        </div>
      )}
      {/* ====================================================
          MODAL: GACHA PULL — ROBEK KARTU!
          ==================================================== */}
      {showGacha && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[2000] p-4 backdrop-blur-sm">
          <div className="rpg-panel-stone max-w-md w-full p-6 border-4 border-[#cca566]" style={{ animation: 'fadeIn 0.2s ease-out' }}>

            <div className="flex justify-between items-center border-b border-stone-700 pb-3 mb-5">
              <h3 className="font-bold text-amber-500 text-sm rpg-font-retro flex items-center gap-2">
                <Sparkles size={16} className="text-yellow-400" /> GACHA — {PACK_INFO[selectedPack].label}
              </h3>
              <button onClick={() => { playClick(); setShowGacha(false); setPullResult(null); }}
                className="text-slate-400 hover:text-white p-1 rounded bg-slate-900 border border-slate-700">
                <X size={16} />
              </button>
            </div>

            {/* Coin Balance */}
            <div className="flex items-center gap-2 mb-4 bg-amber-950/30 border border-amber-700/40 rounded px-3 py-2">
              <Coins size={12} className="text-yellow-500" />
              <span className="text-[10px] font-bold text-yellow-300">Saldo: {localCoins} 🪙</span>
              <span className="ml-auto text-[9px] text-slate-400">Biaya: {PACK_INFO[selectedPack].cost} 🪙</span>
            </div>

            {/* Card Area */}
            <div className="min-h-[200px] flex flex-col items-center justify-center">

              {!pullResult && !gachaPulling && !gachaError && (
                <div className="flex flex-col items-center gap-4">
                  {/* Card back */}
                  <div className="w-32 h-44 bg-gradient-to-br from-[#3a1f10] to-[#1a0d05] border-4 border-[#cca566] rounded-xl flex items-center justify-center shadow-2xl cursor-pointer hover:scale-105 transition-transform"
                    onClick={handlePullCard}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-4xl">🎴</span>
                      <span className="text-[9px] text-amber-400 font-bold rpg-font-retro">ROBEK!</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 text-center">Klik kartu atau tombol di bawah untuk pull!</p>
                </div>
              )}

              {gachaPulling && (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-32 h-44 bg-gradient-to-br from-amber-900 to-yellow-700 border-4 border-yellow-400 rounded-xl flex items-center justify-center shadow-2xl animate-pulse">
                    <span className="text-4xl animate-spin">✨</span>
                  </div>
                  <p className="text-[10px] text-amber-400 font-bold animate-bounce">Menarik kartu...</p>
                </div>
              )}

              {gachaError && (
                <div className="text-center">
                  <p className="text-red-400 font-bold text-sm mb-3">{gachaError}</p>
                  <p className="text-[9px] text-slate-500">Minta Director tambah koin untukmu!</p>
                </div>
              )}

              {pullResult && (
                <div className={`flex flex-col items-center gap-3 transition-all duration-500 ${cardRevealed ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
                  {/* Rarity glow card */}
                  <div className={`w-36 h-48 rounded-xl border-4 flex flex-col items-center justify-center gap-2 p-3 shadow-2xl
                    ${RARITY_CONFIG[pullResult.rarity]?.glow || ''}
                    ${pullResult.rarity === 'legendary' ? 'border-yellow-400 bg-gradient-to-br from-yellow-950 to-amber-900' :
                      pullResult.rarity === 'epic'      ? 'border-purple-500 bg-gradient-to-br from-purple-950 to-purple-900' :
                      pullResult.rarity === 'rare'      ? 'border-blue-500 bg-gradient-to-br from-blue-950 to-blue-900' :
                      pullResult.rarity === 'uncommon'  ? 'border-green-500 bg-gradient-to-br from-green-950 to-green-900' :
                      'border-slate-500 bg-gradient-to-br from-slate-900 to-slate-800'
                    }`}
                  >
                    {/* Asset image */}
                    {pullResult.asset.image_url ? (
                      <img src={pullResult.asset.image_url} alt={pullResult.asset.name}
                        className="w-16 h-16 object-contain" style={{ imageRendering: 'pixelated' }} />
                    ) : (
                      <SpriteRenderer base={pullResult.asset.id} hair="none" outfit="none" accessory="none" petId="none" size={56} />
                    )}
                    {/* Rarity badge */}
                    <span className={`text-[8px] font-bold px-2 py-0.5 rounded border ${RARITY_CONFIG[pullResult.rarity]?.color || ''}`}>
                      {RARITY_CONFIG[pullResult.rarity]?.label}
                    </span>
                    <span className="text-[9px] font-bold text-yellow-50 text-center leading-tight">{pullResult.asset.name}</span>
                    {pullResult.isDuplicate && (
                      <span className="text-[7px] text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-700">🔄 DUPLIKAT</span>
                    )}
                  </div>

                  {pullResult.isDuplicate && (
                    <p className="text-[9px] text-slate-400 text-center">Item sudah ada di inventory-mu. Quantity +1!</p>
                  )}
                  {!pullResult.isDuplicate && (
                    <p className="text-[9px] text-green-400 text-center font-bold">✨ Item baru ditambahkan ke inventory!</p>
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
                  className="rpg-btn-game w-full py-3 flex items-center justify-center gap-2 font-bold text-sm disabled:opacity-40"
                >
                  <Sparkles size={14} /> {gachaPulling ? 'MENARIK...' : `ROBEK KARTU! (${PACK_INFO[selectedPack].cost} 🪙)`}
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handlePullCard}
                    disabled={gachaPulling || localCoins < PACK_INFO[selectedPack].cost}
                    className="rpg-btn-game w-full py-2.5 flex items-center justify-center gap-2 font-bold disabled:opacity-40"
                  >
                    <Sparkles size={12} /> PULL LAGI ({PACK_INFO[selectedPack].cost} 🪙)
                  </button>
                  <button
                    onClick={handleReroll}
                    disabled={gachaPulling || localCoins < PACK_INFO[selectedPack].cost}
                    className="rpg-btn-game w-full py-2 flex items-center justify-center gap-2 text-[10px] font-bold border-yellow-500 disabled:opacity-40"
                    title="Lakukan reroll tarikan gacha"
                  >
                    🔁 REROLL — {PACK_INFO[selectedPack].cost} 🪙
                  </button>
                </div>
              )}
              {gachaError && (
                <button
                  onClick={() => { setShowGacha(false); setShowKasir(true); }}
                  className="rpg-btn-game w-full py-2 text-[10px]"
                >
                  ← Kembali ke Kasir
                </button>
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
          <div className={`rpg-panel-stone ${activeGameTab === 'chess' ? 'max-w-md' : 'max-w-sm'} w-full p-6 border-4 border-[#cca566] text-center transition-all duration-300`}>
            
            <div className="flex justify-between items-center border-b border-stone-750 pb-2 mb-4">
              <h3 className="font-bold text-amber-500 text-xs rpg-font-retro flex items-center gap-1.5">
                <Gamepad2 size={14} /> {activeGameTab === 'ttt' ? 'COZY TIC-TAC-TOE' : 'SANDBOX CHESS'}
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
            </div>

            {activeGameTab === 'ttt' ? (
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
                      <span className="text-yellow-500 font-bold text-sm block animate-bounce">⚡ SERI / DRAW! ⚡</span>
                    ) : (
                      <span className="text-green-400 font-bold text-sm block animate-bounce">🎉 PEMENANG: PLAYER {tttState.winner}! 🎉</span>
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
                    🎮 MAIN LAGI (RESET PAPAN)
                  </button>
                )}

                <button
                  onClick={() => { resetGame(); closeGameModal(); }}
                  className="rpg-btn-game w-full bg-slate-900 border border-slate-700 hover:border-amber-500 py-1.5 text-[9px] font-bold cursor-pointer"
                >
                  BERSIHKAN PAPAN & KELUAR GAME
                </button>
              </>
            ) : (
              <>
                {/* Chess Player Roles Panel */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="p-2 border border-amber-900 bg-amber-950/20 rounded text-xs">
                    <span className="block text-[8px] text-amber-300 font-bold">PUTIH (WHITE ⚪)</span>
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
                    <span className="block text-[8px] text-stone-400 font-bold">HITAM (BLACK ⚫)</span>
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
                                  ? 'text-stone-50 drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.95)]'
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
                      🎉 PEMENANG: PLAYER {chessState.winner === 'white' ? 'PUTIH (WHITE)' : 'HITAM (BLACK)'}! 🎉
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
                    🎮 MAIN LAGI (RESET PAPAN)
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
            
          </div>
        </div>
      )}

    </div>
  );
};
