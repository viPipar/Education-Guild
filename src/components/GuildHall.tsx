import React, { useState, useEffect, useRef } from 'react';
import type { Profile, Seat, ChecklistItem, RoomConfig } from '../lib/supabase';
import { db } from '../lib/supabase';
import { SpriteRenderer } from './SpriteRenderer';
import { Play, Pause, RotateCcw, ClipboardList, Plus, Check, X, Trash2, Clock, Info } from 'lucide-react';
import { playClick, playSelect } from '../lib/audio';
import { NoticeBoard } from './NoticeBoard';

interface GuildHallProps {
  currentProfile: Profile;
  profiles: Profile[];
  onRefreshProfiles: () => void;
  broadcastTicker: string;
  onSetTicker: (text: string) => void;
  onSeatClick?: (seatId: string, isLeave: boolean) => void;
  roomConfig?: RoomConfig;
  onUpdateRoomConfig?: (roomId: string, updates: Partial<RoomConfig>) => void;
}

export const GuildHall: React.FC<GuildHallProps> = ({
  currentProfile,
  profiles,
  onRefreshProfiles,
  broadcastTicker,
  onSetTicker,
  onSeatClick,
  roomConfig,
  onUpdateRoomConfig,
}) => {
  const seats = React.useMemo(() => db.getSeatsSync('guild_hall', profiles), [profiles]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  
  // Timer State
  const [timerDuration, setTimerDuration] = useState(15 * 60); // 15 mins
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerDisplay, setTimerDisplay] = useState('15:00');
  
  // Whiteboard & Scroll of Order Popup States
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showScrollOfOrder, setShowScrollOfOrder] = useState(false);
  const [summonText, setSummonText] = useState('Semua staf berkumpul di Round Table sekarang!');
  const [showTickerInput, setShowTickerInput] = useState(false);
  const [tempTicker, setTempTicker] = useState(broadcastTicker);

  // Local Discord URL State
  const [localDiscordUrl, setLocalDiscordUrl] = useState('');
  useEffect(() => {
    if (roomConfig?.discord_url !== undefined) {
      setLocalDiscordUrl(roomConfig.discord_url);
    }
  }, [roomConfig?.discord_url]);

  useEffect(() => {
    setTempTicker(broadcastTicker);
  }, [broadcastTicker]);
  
  // Chat Bubble State
  const [chatMessage, setChatMessage] = useState('');
  const [activeBubbles, setActiveBubbles] = useState<{ [userId: string]: { text: string, timerId: any } }>({});

  // Sync Timer from Director
  const timerIntervalRef = useRef<any>(null);

  // Fetch seats and checklist
  const loadRoomData = async () => {
    const c = await db.getChecklist('guild_hall');
    setChecklist(c);
  };

  useEffect(() => {
    loadRoomData();

    // Listen to real-time broadcasts
    const unsubscribe = db.subscribe((msg) => {
      if (msg.type === 'checklist_update' && msg.payload.roomId === 'guild_hall') {
        db.getChecklist('guild_hall').then(setChecklist);
      } else if (msg.type === 'chat_bubble') {
        triggerBubble(msg.payload.userId, msg.payload.text);
      } else if (msg.type === 'timer_sync') {
        setTimerDuration(msg.payload.duration);
        setTimerRunning(msg.payload.running);
      }
    });

    return () => {
      unsubscribe();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // Global Timer Tick
  useEffect(() => {
    if (timerRunning) {
      timerIntervalRef.current = setInterval(() => {
        setTimerDuration(prev => {
          if (prev <= 1) {
            setTimerRunning(false);
            clearInterval(timerIntervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => clearInterval(timerIntervalRef.current);
  }, [timerRunning]);

  // Format Timer
  useEffect(() => {
    const mins = Math.floor(timerDuration / 60);
    const secs = timerDuration % 60;
    setTimerDisplay(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
  }, [timerDuration]);

  // Handle Teleport (Claim Seat)
  const handleSeatClick = async (seat: Seat) => {
    playSelect();
    const isLeave = seat.user_id === currentProfile.id;
    if (onSeatClick) {
      onSeatClick(seat.id, isLeave);
    } else {
      if (isLeave) {
        await db.leaveSeat(currentProfile.id);
      } else {
        await db.claimSeat('guild_hall', seat.id, currentProfile.id);
      }
      onRefreshProfiles();
    }
  };

  const handleBroadcastSummon = () => {
    playClick();
    db.broadcast('summon_all', { announcement: summonText, roomId: 'guild_hall' });
  };

  // Timer Control Panel (Director Only)
  const syncTimer = (duration: number, running: boolean) => {
    db.broadcast('timer_sync', { duration, running });
    setTimerDuration(duration);
    setTimerRunning(running);
  };

  const handleStartTimer = () => { playClick(); syncTimer(timerDuration, true); };
  const handlePauseTimer = () => { playClick(); syncTimer(timerDuration, false); };
  const handleResetTimer = () => { playClick(); syncTimer(15 * 60, false); };
  
  // Get Timer Color based on remaining time
  const getTimerColorClass = () => {
    if (timerDuration <= 60) return 'timer-red'; // 1 min
    if (timerDuration <= 5 * 60) return 'timer-yellow'; // 5 mins
    return 'timer-green';
  };

  // Checklist Action
  const handleAddChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChecklistItem.trim()) return;
    playClick();
    await db.addChecklistItem('guild_hall', newChecklistItem);
    setNewChecklistItem('');
    db.getChecklist('guild_hall').then(setChecklist);
  };

  const handleToggleChecklist = async (item: ChecklistItem) => {
    playClick();
    const isCompleted = !item.completed;
    await db.toggleChecklistItem('guild_hall', item.id, isCompleted, currentProfile.name);
    db.getChecklist('guild_hall').then(setChecklist);
  };

  const handleDeleteChecklist = async (itemId: number) => {
    playClick();
    await db.deleteChecklistItem('guild_hall', itemId);
    db.getChecklist('guild_hall').then(setChecklist);
  };

  // Chat Bubble Trigger
  const triggerBubble = (userId: string, text: string) => {
    // Clear old timer if exist
    if (activeBubbles[userId]?.timerId) {
      clearTimeout(activeBubbles[userId].timerId);
    }
    
    const tId = setTimeout(() => {
      setActiveBubbles(prev => {
        const copy = { ...prev };
        delete copy[userId];
        return copy;
      });
    }, 3000); // 3 seconds chat bubble
    
    setActiveBubbles(prev => ({
      ...prev,
      [userId]: { text, timerId: tId }
    }));
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    playClick();
    db.broadcast('chat_bubble', { userId: currentProfile.id, text: chatMessage });
    triggerBubble(currentProfile.id, chatMessage);
    setChatMessage('');
  };

  return (
    <div className="flex flex-col gap-4 p-2 relative">
      
      {/* Broadcast Ticker Bar */}
      <div className="bg-slate-950 border border-amber-600/30 p-2 text-xs flex items-center justify-between overflow-hidden h-8 rounded relative">
        <div className="flex items-center overflow-hidden flex-1">
          <span className="text-amber-500 font-bold border-r border-amber-600/40 pr-2 mr-2 flex-shrink-0 rpg-font-retro text-[10px]">
            TICKER:
          </span>
          <div className="ticker-wrap flex-1">
            <div className="ticker-content font-semibold text-yellow-50">
              {broadcastTicker || "Selamat datang di Education Guild! Silakan kustomisasi karakter Anda di House."}
            </div>
          </div>
        </div>
        {currentProfile.role !== 'Staff' && (
          <button
            onClick={() => {
              playClick();
              if (showTickerInput) {
                if (tempTicker.trim() && tempTicker.trim() !== broadcastTicker) {
                  onSetTicker(tempTicker.trim());
                }
              }
              setShowTickerInput(!showTickerInput);
            }}
            className="ml-2 px-2 py-0.5 bg-amber-600 hover:bg-amber-500 text-stone-950 text-[9px] font-bold rounded cursor-pointer transition-colors flex-shrink-0"
          >
            {showTickerInput ? 'SELESAI' : 'EDIT TICKER'}
          </button>
        )}
      </div>

      {/* Ticker Input (shown below ticker, not wrapping the map) */}
      {showTickerInput && currentProfile.role !== 'Staff' && (
        <div className="rpg-panel-wood p-2.5 flex items-center gap-2 border border-amber-500/50 rounded animate-fade-in">
          <span className="text-[9px] text-[#cca566] font-bold rpg-font-retro mr-1">TICKER BARU:</span>
          <input
            type="text"
            value={tempTicker}
            onChange={(e) => setTempTicker(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                playClick();
                if (tempTicker.trim() && tempTicker.trim() !== broadcastTicker) {
                  onSetTicker(tempTicker.trim());
                }
                setShowTickerInput(false);
              }
            }}
            placeholder="Ketik teks berjalan baru... (Tekan Enter atau klik Simpan)"
            className="flex-1 bg-[#16110e] text-yellow-100 px-3 py-1.5 rounded border border-[#5a3d28] text-xs font-semibold focus:outline-none"
          />
          <button
            onClick={() => {
              playClick();
              if (tempTicker.trim() && tempTicker.trim() !== broadcastTicker) {
                onSetTicker(tempTicker.trim());
              }
              setShowTickerInput(false);
            }}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-stone-950 text-[10px] font-extrabold rounded cursor-pointer transition-colors"
          >
            SIMPAN
          </button>
        </div>
      )}

      {/* Guild Hall HUD Control Bar (Portal + URL Config) */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-slate-950/85 border border-[#cca566]/30 rounded">
        <div className="flex items-center gap-3">
          <span className="text-yellow-500 font-bold text-xs uppercase tracking-wide rpg-font-retro">
            ROUND TABLE GUILD HALL
          </span>
          <a
            href={localDiscordUrl ? (localDiscordUrl.startsWith('http://') || localDiscordUrl.startsWith('https://') ? localDiscordUrl : 'https://' + localDiscordUrl) : '#'}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => playSelect()}
            className="flex flex-col items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white transition-all shadow-[0_0_12px_rgba(147,51,234,0.6)] hover:shadow-[0_0_18px_rgba(147,51,234,0.9)] border-2 border-purple-400/50 hover:scale-105"
            title="Buka Portal Voice Channel"
          >
            <svg className="w-5 h-5 animate-spin" style={{ animationDuration: '4s' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m10.657 10.657l.707-.707M14 12a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-[7px] font-extrabold tracking-wider mt-0.5 leading-none">PORTAL</span>
          </a>
        </div>

        {currentProfile.role !== 'Staff' && (
          <div className="flex items-center gap-2 text-[10px]">
            <span className="font-bold text-[#cca566] uppercase">PORTAL URL:</span>
            <input
              type="text"
              value={localDiscordUrl}
              onChange={(e) => setLocalDiscordUrl(e.target.value)}
              placeholder="https://discord.gg/..."
              className="bg-black/60 text-yellow-100 border border-[#5a3d28] rounded px-2 py-1 w-52 text-[9px] font-semibold focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={() => {
                playClick();
                if (onUpdateRoomConfig) {
                  onUpdateRoomConfig('guild_hall', { discord_url: localDiscordUrl });
                }
              }}
              className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-[9px] rounded transition-colors"
            >
              SAVE
            </button>
          </div>
        )}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* Map Area (8 Spans) */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          <div className="map-scroll-container">
            <div className="rpg-panel border-4 h-[550px] relative overflow-hidden rounded select-none bg-[#2e2620] min-w-[750px] lg:min-w-0" style={{
              backgroundImage: 'url(/assets/rooms/round_table_bg.jpg)',
              backgroundSize: '100% 100%',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }}>
            
            {/* NOTICE BOARD (Figma Notice Board overlay over background) */}
            <div
              onClick={() => setShowWhiteboard(true)}
              style={{ left: '6.8%', top: '1.37%', width: '11.2%', height: '14.38%' }}
              className="absolute cursor-pointer border-2 border-transparent hover:border-amber-400 hover:bg-amber-400/10 transition-all rounded z-10 group"
              title="Notice Board"
            >
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-950/90 text-[8px] text-amber-400 border border-amber-500/50 px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none font-bold">
                NOTICE BOARD (KLIK)
              </div>
            </div>

            {/* SCROLL OF ORDER (Agenda Popup overlay over background) */}
            <div
              onClick={() => setShowScrollOfOrder(true)}
              style={{ left: '52.73%', top: '4.28%', width: '11.72%', height: '12.5%' }}
              className="absolute cursor-pointer border-2 border-transparent hover:border-amber-400 hover:bg-amber-400/10 transition-all rounded z-10 group"
              title="Scroll of Order"
            >
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-950/90 text-[8px] text-amber-400 border border-amber-500/50 px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none font-bold">
                SCROLL OF ORDER (AGENDA: {checklist.length})
              </div>
            </div>

            {/* ROUND TABLE STATUS PLAQUE */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 bg-slate-950/85 border border-amber-600/30 px-3 py-1 rounded-full flex items-center gap-2 text-[10px] text-yellow-100 font-bold shadow-lg">
              <span className="text-amber-500 font-serif">ROUND TABLE</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              <span>{profiles.filter(p => p.current_seat_id?.startsWith('guild_hall_')).length} / 20 Duduk</span>
            </div>

            {/* SEATS AND USERS RENDERING */}
            {seats.map((seat) => {
              const occupant = profiles.find(p => p.id === seat.user_id);
              // Z-Index depth sorting logic
              const isBottomSeat = seat.y >= 48;
              const seatZIndexClass = isBottomSeat ? 'z-30' : 'z-10';

              return (
                <div
                  key={seat.id}
                  style={{
                    left: `${seat.x}%`,
                    top: `${seat.y}%`
                  }}
                  className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${seatZIndexClass} flex flex-col items-center`}
                >
                  {/* Seat trigger button */}
                  <div
                    onClick={() => handleSeatClick(seat)}
                    className={`w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-all ${
                      occupant
                        ? 'border-none bg-transparent'
                        : 'border-2 border-dashed border-[#cca566]/30 bg-black/10 hover:border-amber-400 hover:scale-105'
                    }`}
                  >
                    {occupant ? (
                      <div className="relative">
                        {/* Chat bubble popup */}
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
                          size={54}
                          className="transform -translate-y-2"
                        />
                        {/* Active player indicator */}
                        {occupant.id === currentProfile.id && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white animate-bounce z-50"></div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[7.5px] rpg-font-retro text-amber-500/40 font-bold">DUDUK</span>
                    )}
                  </div>

                  {/* Occupant Name Plaque */}
                  {occupant && (
                    <div className="bg-slate-950/90 border border-[#5c3a21]/50 px-2 py-0.5 rounded text-[8px] mt-0.5 font-bold max-w-[80px] truncate text-center shadow-md">
                      <span style={{ color: occupant.sprite_json.nameColor || '#fef08a' }}>
                        {occupant.name.split(' ')[0]}
                      </span>
                      <span className="block text-[5px] text-[#cca566] truncate mt-0.5 leading-none">{occupant.current_status}</span>
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
                placeholder="Ketik pesan bubble chat (tampil 3 detik)..."
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                maxLength={40}
                className="flex-1 bg-[#16110e] text-yellow-50 px-3 py-2 rounded border border-[#5a3d28] text-xs font-semibold focus:outline-none"
              />
              <button type="submit" className="rpg-btn-game flex items-center gap-1">
                KIRIM
              </button>
            </form>
          </div>
        </div>

        {/* Right Side: Global Timer & Room Summary (4 Spans) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          
          {/* Global Timer Card */}
          <div className="rpg-panel-wood text-center">
            <div className="rpg-plaque mb-3 flex items-center justify-center gap-1.5">
              <Clock size={12} /> TIMER RAPAT
            </div>
            
            <div className={`text-4xl font-mono font-bold py-2 ${getTimerColorClass()}`}>
              {timerDisplay}
            </div>

            {/* Admin (Director Only) Timer Controls */}
            {currentProfile.role === 'Director' && (
              <div className="mt-4 border-t border-stone-700 pt-4 space-y-3">
                
                {/* Custom numeric timer input */}
                <div className="flex gap-2 justify-center items-center text-[10px] text-stone-300 font-bold">
                  <span>DURASI TIMER:</span>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    placeholder="Menit"
                    className="w-16 bg-[#16110e] text-yellow-100 p-1 rounded border border-[#5a3d28] font-bold text-center text-[10px] focus:outline-none focus:border-amber-500"
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (val > 0) {
                        syncTimer(val * 60, timerRunning);
                      }
                    }}
                  />
                  <span>MENIT</span>
                </div>

                <div className="flex gap-3 justify-center">
                  {!timerRunning ? (
                    <button onClick={handleStartTimer} className="rpg-btn-game px-3 py-1.5 text-[9px] flex items-center gap-1">
                      <Play size={10} /> START
                    </button>
                  ) : (
                    <button onClick={handlePauseTimer} className="rpg-btn-game px-3 py-1.5 text-[9px] flex items-center gap-1">
                      <Pause size={10} /> PAUSE
                    </button>
                  )}
                  <button onClick={handleResetTimer} className="rpg-btn-game px-3 py-1.5 text-[9px] flex items-center gap-1">
                    <RotateCcw size={10} /> RESET
                  </button>
                </div>

                {/* Summon Controls with announcement field */}
                <div className="mt-3 border-t border-stone-800 pt-3 flex flex-col gap-2">
                  <label className="block text-[8.5px] text-[#cca566] font-bold text-left">PESAN BROADCAST:</label>
                  <input
                    type="text"
                    value={summonText}
                    onChange={(e) => setSummonText(e.target.value)}
                    placeholder="Tulis pesan broadcast..."
                    className="w-full bg-[#16110e] text-yellow-100 p-2 rounded border border-[#5a3d28] text-[10px] focus:outline-none font-bold"
                  />
                  <button onClick={handleBroadcastSummon} className="rpg-btn-game w-full text-[9px] text-[#cca566] py-1.5" style={{
                    background: 'linear-gradient(to bottom, #4e3629 0%, #2a1910 100%)',
                    boxShadow: '0 3px 0 #120a06',
                    border: '2px solid #5a3d28',
                    color: '#ffd700'
                  }}>
                    SIARKAN BROADCAST
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Room Info / Guild ledger snippet card instead of Scroll of Order */}
          <div className="rpg-panel-wood p-4 flex flex-col justify-between min-h-[220px]">
            <div>
              <h3 className="font-bold text-[#cca566] text-xs mb-3 font-mono flex items-center gap-1.5">
                <Info size={12} /> ROOM INFO: GUILD HALL
              </h3>
              <p className="text-[10px] text-slate-400 leading-normal mb-3 font-semibold">
                Gunakan <strong>Notice Board</strong> untuk curah ide bersama secara figma-like, dan <strong>Scroll of Order</strong> di tengah peta untuk memantau agenda rapat hari ini.
              </p>
              <ul className="text-[9px] text-[#cca580] space-y-1.5 font-bold list-disc pl-3">
                <li>Direktur bisa memanggil semua staf.</li>
                <li>Direktur bisa mengatur timer rapat secara numerik bebas.</li>
                <li>Semua staf bisa duduk di kursi melingkar.</li>
              </ul>
            </div>
          </div>

        </div>

      </div>

      {/* FIGMA-LIKE NOTICE BOARD MODAL */}
      {showWhiteboard && (
        <NoticeBoard
          roomId="guild_hall"
          currentProfile={currentProfile}
          onClose={() => setShowWhiteboard(false)}
          profiles={profiles}
        />
      )}

      {/* SCROLL OF ORDER MODAL */}
      {showScrollOfOrder && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[2000] p-4">
          <div className="rpg-panel-glass max-w-md w-full p-6 text-stone-900 bg-[#fdf6e2] border-4 border-[#5c3a21]">
            
            <div className="flex justify-between items-center border-b border-stone-400/40 pb-2 mb-3">
              <h3 className="font-bold text-stone-900 text-sm flex items-center gap-1.5">
                <ClipboardList size={14} className="text-yellow-700" /> SCROLL OF ORDER (AGENDA RAPAT)
              </h3>
              <button onClick={() => setShowScrollOfOrder(false)} className="text-stone-600 hover:text-stone-900 p-1">
                <X size={16} />
              </button>
            </div>

            {/* Agenda Checklist Items */}
            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {checklist.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-3 p-2 rounded border-2 transition-all ${
                    item.completed
                      ? 'bg-stone-950/10 border-stone-400 line-through text-stone-500 font-normal'
                      : 'bg-white border-[#5c3a21] hover:border-yellow-700 text-stone-900 font-semibold'
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => handleToggleChecklist(item)}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      item.completed ? 'border-green-700 bg-green-900/10 text-green-700' : 'border-[#5c3a21] bg-white/60'
                    }`}>
                      {item.completed && <Check size={12} strokeWidth={3} />}
                    </div>
                    <div className="flex-1 text-xs select-none leading-relaxed truncate">
                      {item.title}
                      {item.completed && item.completed_by && (
                        <span className="block text-[8px] text-green-700 font-mono mt-0.5">Dicentang oleh: {item.completed_by}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteChecklist(item.id);
                    }}
                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-100/50 rounded flex-shrink-0"
                    title="Hapus Agenda"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {checklist.length === 0 && (
                <p className="text-[10px] text-stone-500 italic text-center py-6 font-bold">Belum ada agenda rapat...</p>
              )}
            </div>

            {/* Add Agenda (Director/Manager Only) */}
            {currentProfile.role !== 'Staff' && (
              <form onSubmit={handleAddChecklist} className="border-t border-stone-400/40 pt-3 mt-3 flex gap-2">
                <input
                  type="text"
                  placeholder="Agenda baru..."
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  className="flex-1 bg-white text-stone-900 px-2 py-1.5 rounded border-2 border-[#5c3a21] text-xs font-semibold focus:outline-none"
                />
                <button type="submit" className="rpg-btn-game p-1.5 flex items-center justify-center">
                  <Plus size={12} />
                </button>
              </form>
            )}
            
          </div>
        </div>
      )}

    </div>
  );
};
