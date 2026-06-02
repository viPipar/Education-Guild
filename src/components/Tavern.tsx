import React, { useState, useEffect, useRef } from 'react';
import type { Profile, Seat } from '../lib/supabase';
import { db } from '../lib/supabase';
import { SpriteRenderer } from './SpriteRenderer';
import { CardGacha } from './CardGacha';
import { Coins, Sparkles, X, Gamepad2 } from 'lucide-react';
import { playClick, playSelect } from '../lib/audio';

interface TavernProps {
  currentProfile: Profile;
  profiles: Profile[];
  onRefreshProfiles: () => void;
  onUpdateProfile: (updates: Partial<Profile>) => void;
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

export const Tavern: React.FC<TavernProps> = ({
  currentProfile,
  profiles,
  onRefreshProfiles,
  onUpdateProfile
}) => {
  const [seats, setSeats] = useState<Seat[]>([]);
  
  // Interactive Modals
  const [showPetShop, setShowPetShop] = useState(false);
  const [showGacha, setShowGacha] = useState(false);
  const [showGame, setShowGame] = useState(false);
  
  // Local shop tabs & unlocked cosmetics list
  const [shopTab, setShopTab] = useState<'pets' | 'cosmetics'>('pets');
  const [unlockedCosmetics, setUnlockedCosmetics] = useState<string[]>([]);
  const [spectatorIds, setSpectatorIds] = useState<string[]>([]);
  
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

  const tttStateRef = useRef(tttState);
  const spectatorIdsRef = useRef(spectatorIds);

  useEffect(() => {
    tttStateRef.current = tttState;
  }, [tttState]);

  useEffect(() => {
    spectatorIdsRef.current = spectatorIds;
  }, [spectatorIds]);

  // Load Tavern seats
  const loadTavernSeats = async () => {
    const s = await db.getSeats('tavern');
    setSeats(s);
  };

  // Sync state and listen to broadcasts
  useEffect(() => {
    loadTavernSeats();
    
    // Load unlocked cosmetics
    const savedUnlocked = localStorage.getItem(`rpg_unlocked_cosmetics_${currentProfile.id}`);
    if (savedUnlocked) {
      setUnlockedCosmetics(JSON.parse(savedUnlocked));
    } else {
      const defaults = ['hair_black', 'hair_brown', 'outfit_casual', 'none'];
      localStorage.setItem(`rpg_unlocked_cosmetics_${currentProfile.id}`, JSON.stringify(defaults));
      setUnlockedCosmetics(defaults);
    }
    
    // Load local tictactoe state if exists
    const savedTtt = localStorage.getItem('rpg_tictactoe_state');
    if (savedTtt) {
      setTttState(JSON.parse(savedTtt) as TicTacToeState);
    }

    const unsubscribe = db.subscribe((msg) => {
      if (msg.type === 'profile_update' || msg.type === 'seat_claim' || msg.type === 'seat_leave') {
        onRefreshProfiles();
      } else if (msg.type === 'chat_bubble') {
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

  // Update seats when profiles update
  useEffect(() => {
    db.getSeats('tavern').then(setSeats);
  }, [profiles]);

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
    if (seat.user_id === currentProfile.id) {
      await db.leaveSeat(currentProfile.id);
    } else {
      await db.claimSeat('tavern', seat.id, currentProfile.id);
    }
    onRefreshProfiles();
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

  const handleBuyCosmetic = (cosmeticId: string) => {
    playSelect();
    const updated = [...unlockedCosmetics, cosmeticId];
    setUnlockedCosmetics(updated);
    localStorage.setItem(`rpg_unlocked_cosmetics_${currentProfile.id}`, JSON.stringify(updated));
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
    localStorage.setItem('rpg_tictactoe_state', JSON.stringify(newState));
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
    localStorage.setItem('rpg_tictactoe_state', JSON.stringify(newState));
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
    localStorage.setItem('rpg_tictactoe_state', JSON.stringify(newState));
    db.broadcast('tictactoe_sync', { tttState: newState, spectatorIds });
  };

  // Find player profiles to render sprites around Tic-Tac-Toe
  const playerXProfile = profiles.find(p => p.id === tttState.playerXId);
  const playerOProfile = profiles.find(p => p.id === tttState.playerOId);

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

            {/* Interactive Game Table (Tic-Tac-Toe) */}
            <div 
              onClick={openGameModal}
              className="absolute top-[52%] left-[24%] -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-[#6d4c41] border-4 border-[#3e2723] rounded-full shadow-2xl z-20 cursor-pointer flex flex-col items-center justify-center hover:scale-105 transition-transform hover:border-amber-400 group"
            >
              <span className="text-[14px]">🎮</span>
              <span className="text-[6.5px] text-[#ffd700] font-bold text-center leading-none mt-1 rpg-font-retro animate-pulse">TIC-TAC-TOE</span>
            </div>

            {/* Render Game Avatars directly next to the table */}
            {playerXProfile && (
              <div className="absolute top-[52%] left-[12%] -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center animate-pulse">
                <SpriteRenderer
                  base={playerXProfile.sprite_json.base}
                  hair={playerXProfile.sprite_json.hair}
                  outfit={playerXProfile.sprite_json.outfit}
                  accessory={playerXProfile.sprite_json.accessory}
                  petId="none"
                  size={44}
                />
                <span className="bg-blue-900/90 text-white border border-blue-500 px-1 rounded text-[6px] font-bold mt-0.5 font-mono">X: {playerXProfile.name.split(' ')[0]}</span>
              </div>
            )}
            
            {playerOProfile && (
              <div className="absolute top-[52%] left-[36%] -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center animate-pulse">
                <SpriteRenderer
                  base={playerOProfile.sprite_json.base}
                  hair={playerOProfile.sprite_json.hair}
                  outfit={playerOProfile.sprite_json.outfit}
                  accessory={playerOProfile.sprite_json.accessory}
                  petId="none"
                  size={44}
                />
                <span className="bg-red-900/90 text-white border border-red-500 px-1 rounded text-[6px] font-bold mt-0.5 font-mono">O: {playerOProfile.name.split(' ')[0]}</span>
              </div>
            )}

            {/* Render Spectator Avatars around the table */}
            {spectatorIds
              .filter(id => id !== tttState.playerXId && id !== tttState.playerOId)
              .map((specId, index) => {
                const specProfile = profiles.find(p => p.id === specId);
                if (!specProfile) return null;
                
                const coords = [
                  { x: 24, y: 35 },
                  { x: 24, y: 69 },
                  { x: 16, y: 63 },
                  { x: 32, y: 63 },
                  { x: 16, y: 41 },
                  { x: 32, y: 41 }
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
                    <span className="bg-slate-900/90 text-yellow-500 border border-slate-700 px-0.5 rounded text-[5px] font-bold mt-0.5 leading-none">
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

            {/* Clickable Cash Register (Pet Shop) */}
            <div
              onClick={() => { playClick(); setShowPetShop(true); }}
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
                    <div className="bg-slate-950/90 border border-[#5a3d28]/40 px-1 rounded text-[6.5px] font-semibold text-yellow-50 whitespace-nowrap shadow-md">
                      {occupant.name.split(' ')[0]}
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
              {['✨', '🔥', '🎉', '👍', '💬', '🍺'].map(emote => (
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

        {/* Right Side: Cozy tavern guide card (4 Spans) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="rpg-panel-wood p-4 flex flex-col justify-between min-h-[300px]">
            <div>
              <h3 className="font-bold text-[#cca566] text-xs mb-3 font-mono">
                🍺 COZY TAVERN GUIDE
              </h3>
              <p className="text-[10px] text-slate-400 leading-normal mb-3 font-semibold">
                Selamat datang di Tavern! Di sini adalah tempat interaksi santai untuk merekatkan hubungan antar staf.
              </p>
              
              <div className="space-y-2 border-t border-stone-850 pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs">🎮</span>
                  <div className="text-[9.5px]">
                    <span className="font-bold text-yellow-100 block">Cozy Tic-Tac-Toe (Kiri):</span>
                    Klik meja game di sisi kiri untuk bermain Tic-Tac-Toe bersama secara realtime.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs">🪙</span>
                  <div className="text-[9.5px]">
                    <span className="font-bold text-yellow-100 block">Pet Shop Kasir (Kanan):</span>
                    Klik kasir di samping bartender untuk membeli/equip pet pendamping rapat.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs">⭐</span>
                  <div className="text-[9.5px]">
                    <span className="font-bold text-yellow-100 block">Card Gacha Machine (Kanan):</span>
                    Klik mesin gacha merah untuk langsung melakukan booster pack gacha memori!
                  </div>
                </div>
              </div>
            </div>
            
            <div className="border-t border-amber-600/20 pt-3 mt-4 text-[9.5px] text-slate-500 font-semibold leading-normal">
              💡 Karakter Anda akan otomatis muncul di samping meja game saat bergabung di Tic-Tac-Toe!
            </div>
          </div>
        </div>

      </div>

      {/* ====================================================
          MODAL INTERACTION: PET SHOP MERCHANT
          ==================================================== */}
      {showPetShop && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[2000] p-4 animate-fade-in">
          <div className="rpg-panel-stone max-w-sm w-full p-6 border-4 border-[#cca566]">
            
            <div className="flex justify-between items-center border-b border-stone-750 pb-2 mb-3">
              <h3 className="font-bold text-amber-500 text-xs rpg-font-retro flex items-center gap-1.5">
                <Coins size={14} /> PET & COSMETIC SHOP
              </h3>
              <button onClick={() => setShowPetShop(false)} className="text-slate-400 hover:text-white p-1">
                <X size={16} />
              </button>
            </div>

            {/* Shop Tab Selector */}
            <div className="flex gap-2 mb-3 border-b border-stone-800 pb-2">
              <button
                onClick={() => { playSelect(); setShopTab('pets'); }}
                className={`flex-1 py-1 text-[9px] font-bold border rounded transition-colors ${
                  shopTab === 'pets'
                    ? 'bg-amber-600 border-amber-400 text-stone-950 font-extrabold'
                    : 'bg-stone-900 border-stone-800 text-slate-300'
                }`}
              >
                PET STABLE
              </button>
              <button
                onClick={() => { playSelect(); setShopTab('cosmetics'); }}
                className={`flex-1 py-1 text-[9px] font-bold border rounded transition-colors ${
                  shopTab === 'cosmetics'
                    ? 'bg-amber-600 border-amber-400 text-stone-950 font-extrabold'
                    : 'bg-stone-900 border-stone-800 text-slate-300'
                }`}
              >
                KOSMETIK & BAJU
              </button>
            </div>

            <p className="text-[10px] text-slate-400 leading-normal mb-3 font-semibold">
              {shopTab === 'pets' 
                ? 'Naikkan Level Anda melalui penilaian performa untuk membuka pet baru.' 
                : 'Buka aksesoris dan kostum premium jika Level Anda sudah mencukupi!'}
            </p>

            <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
              {shopTab === 'pets' ? (
                [
                  { id: 'cat', name: 'Kucing Orange', cost: 'LV. 1', minLevel: 1, desc: 'Pet lincah penambah keceriaan rapat.' },
                  { id: 'dog', name: 'Shiba Inu', cost: 'LV. 1', minLevel: 1, desc: 'Setia menemani Anda di segala suasana.' },
                  { id: 'slime', name: 'Bouncing Slime', cost: 'LV. 2', minLevel: 2, desc: 'Slime kenyal yang memantul gembira.' },
                  { id: 'owl', name: 'Wise Owl', cost: 'LV. 4', minLevel: 4, desc: 'Burung hantu penasehat bijak pencatat ide.' },
                  { id: 'dragon', name: 'Royal Dragon', cost: 'LV. 8', minLevel: 8, desc: 'Naga suci VIP milik Director / Staff Berprestasi.' }
                ].map((pet) => {
                  const isLocked = currentProfile.level < pet.minLevel;
                  const isEquipped = currentProfile.pet_id === pet.id;
                  
                  return (
                    <div
                      key={pet.id}
                      className={`p-2.5 rounded border text-xs flex justify-between items-center ${
                        isLocked
                          ? 'border-[#1a100a] bg-stone-950/60 opacity-55'
                          : isEquipped
                            ? 'border-[#ffd700] bg-[#4e3629] text-yellow-300 font-bold'
                            : 'border-[#5a3d28] bg-[#16110e] hover:border-amber-600/40 text-slate-300'
                      }`}
                    >
                      <div className="flex-1 pr-2">
                        <span className="font-bold text-yellow-50 flex items-center gap-1 text-[11px]">
                          {pet.name} {!isLocked && <Sparkles size={10} className="text-yellow-400" />}
                        </span>
                        <span className="block text-[8px] text-slate-400 leading-normal mt-0.5 font-semibold">{pet.desc}</span>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {isLocked ? (
                          <span className="text-[8px] bg-red-950/60 border border-red-900 text-red-400 py-1 px-2 rounded font-mono font-bold">
                            🔒 {pet.cost}
                          </span>
                        ) : isEquipped ? (
                          <span className="text-[8px] bg-amber-950 border border-amber-500 text-amber-300 py-1 px-1.5 rounded font-mono font-bold">
                            EQUIPPED
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              playSelect();
                              onUpdateProfile({ pet_id: pet.id });
                            }}
                            className="rpg-btn-game py-1 px-2 text-[8px]"
                          >
                            EQUIP
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                [
                  { id: 'hair_yellow', name: 'Rambut Spike Emas', minLevel: 2, desc: 'Gaya rambut spike berkilau emas.' },
                  { id: 'hair_red', name: 'Rambut Spike Merah', minLevel: 3, desc: 'Rambut merah membara penuh gairah.' },
                  { id: 'hair_grey', name: 'Rambut Bob Kelabu', minLevel: 4, desc: 'Rambut bob kelabu yang kalem.' },
                  { id: 'outfit_gold', name: 'Director Royal Outfit', minLevel: 8, desc: 'Jubah emas kebesaran Direktur.' },
                  { id: 'outfit_blue', name: 'Academic Robe', minLevel: 3, desc: 'Jubah biru Divisi Akademik.' },
                  { id: 'outfit_green', name: 'Pub Cloak', minLevel: 3, desc: 'Jubah hijau Divisi Publikasi.' },
                  { id: 'outfit_red', name: 'Project Suit', minLevel: 3, desc: 'Jas merah Divisi Project.' },
                  { id: 'outfit_purple', name: 'Comp Wizard Robe', minLevel: 3, desc: 'Jubah ungu Divisi Competition.' },
                  { id: 'glasses', name: 'Kacamata Baca', minLevel: 2, desc: 'Kacamata retro meningkatkan kecerdasan.' },
                  { id: 'crown', name: 'Mahkota Emas', minLevel: 6, desc: 'Mahkota megah berlapis emas murni.' },
                  { id: 'headset', name: 'Gamer Headset', minLevel: 4, desc: 'Headset canggih untuk koordinasi.' }
                ].map((cosmetic) => {
                  const isLocked = currentProfile.level < cosmetic.minLevel;
                  const isUnlocked = unlockedCosmetics.includes(cosmetic.id);
                  
                  return (
                    <div
                      key={cosmetic.id}
                      className={`p-2.5 rounded border text-xs flex justify-between items-center ${
                        isLocked
                          ? 'border-[#1a100a] bg-stone-950/60 opacity-55'
                          : isUnlocked
                            ? 'border-green-600 bg-green-950/20 text-green-300 font-bold'
                            : 'border-[#5a3d28] bg-[#16110e] hover:border-amber-600/40 text-slate-300'
                      }`}
                    >
                      <div className="flex-1 pr-2">
                        <span className="font-bold text-yellow-50 flex items-center gap-1 text-[11px]">
                          {cosmetic.name} {!isLocked && <Sparkles size={10} className="text-yellow-400" />}
                        </span>
                        <span className="block text-[8px] text-slate-400 leading-normal mt-0.5 font-semibold">{cosmetic.desc}</span>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {isLocked ? (
                          <span className="text-[8px] bg-red-950/60 border border-red-900 text-red-400 py-1 px-2 rounded font-mono font-bold">
                            🔒 LV. {cosmetic.minLevel}
                          </span>
                        ) : isUnlocked ? (
                          <span className="text-[8px] bg-green-950 border border-green-700 text-green-400 py-1 px-1.5 rounded font-mono font-bold">
                            DIBELI
                          </span>
                        ) : (
                          <button
                            onClick={() => handleBuyCosmetic(cosmetic.id)}
                            className="rpg-btn-game py-1 px-2 text-[8px] bg-amber-600/20 border-amber-600 hover:bg-amber-600"
                          >
                            BELI
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-stone-750 pt-2 mt-3 flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-400 flex items-center gap-1">
                LEVEL ANDA:
              </span>
              <span className="rpg-font-retro text-amber-500 font-bold">LV. {currentProfile.level}</span>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================
          MODAL INTERACTION: CARD GACHA POPUP
          ==================================================== */}
      {showGacha && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[2000] p-4 animate-fade-in">
          <div className="rpg-panel-glass max-w-4xl w-full flex flex-col h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-amber-600/20 pb-3 mb-3 p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="text-yellow-500" />
                <span className="rpg-title text-base">MEMORY CARD GACHA MACHINE</span>
              </div>
              <button
                onClick={() => setShowGacha(false)}
                className="text-slate-400 hover:text-white p-1 rounded bg-slate-900 border border-slate-800"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto">
              <CardGacha currentProfile={currentProfile} />
            </div>
          </div>
        </div>
      )}

      {/* ====================================================
          MODAL INTERACTION: TIC-TAC-TOE MULTIPLAYER
          ==================================================== */}
      {showGame && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[2000] p-4">
          <div className="rpg-panel-stone max-w-sm w-full p-6 border-4 border-[#cca566] text-center">
            
            <div className="flex justify-between items-center border-b border-stone-750 pb-2 mb-4">
              <h3 className="font-bold text-amber-500 text-xs rpg-font-retro flex items-center gap-1.5">
                <Gamepad2 size={14} /> COZY TIC-TAC-TOE
              </h3>
              <button onClick={closeGameModal} className="text-slate-400 hover:text-white p-1">
                <X size={16} />
              </button>
            </div>

            {/* Player Roles Panel */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="p-2 border border-blue-900 bg-blue-950/30 rounded text-xs">
                <span className="block text-[8px] text-blue-400 font-bold">PLAYER 1 (X)</span>
                <span className="font-bold text-yellow-50 text-[10px]">
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
                <span className="font-bold text-yellow-50 text-[10px]">
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
            <div className="w-48 h-48 mx-auto grid grid-cols-3 gap-2 bg-[#2d1b15] p-2 border-4 border-[#3e2723] rounded-lg shadow-inner mb-4">
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
            <button
              onClick={() => { resetGame(); closeGameModal(); }}
              className="rpg-button w-full bg-slate-900 border border-slate-700 hover:border-amber-500 py-1.5 text-[9px] font-bold"
            >
              BERSIHKAN PAPAN & KELUAR GAME
            </button>
            
          </div>
        </div>
      )}

    </div>
  );
};
