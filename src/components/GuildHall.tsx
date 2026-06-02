import React, { useState, useEffect, useRef } from 'react';
import type { Profile, Seat, ChecklistItem } from '../lib/supabase';
import { db } from '../lib/supabase';
import { SpriteRenderer } from './SpriteRenderer';
import { Play, Pause, RotateCcw, ClipboardList, Plus, Check, X } from 'lucide-react';
import { playClick, playSelect } from '../lib/audio';
import { NoticeBoard } from './NoticeBoard';

interface GuildHallProps {
  currentProfile: Profile;
  profiles: Profile[];
  onRefreshProfiles: () => void;
  broadcastTicker: string;
  onSetTicker: (text: string) => void;
}

export const GuildHall: React.FC<GuildHallProps> = ({
  currentProfile,
  profiles,
  onRefreshProfiles,
  broadcastTicker,
  onSetTicker
}) => {
  const [seats, setSeats] = useState<Seat[]>([]);
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
  
  // Chat Bubble State
  const [chatMessage, setChatMessage] = useState('');
  const [activeBubbles, setActiveBubbles] = useState<{ [userId: string]: { text: string, timerId: any } }>({});

  // Sync Timer from Director
  const timerIntervalRef = useRef<any>(null);

  // Fetch seats and checklist
  const loadRoomData = async () => {
    const s = await db.getSeats('guild_hall');
    setSeats(s);
    const c = await db.getChecklist('guild_hall');
    setChecklist(c);
  };

  useEffect(() => {
    loadRoomData();

    // Listen to real-time broadcasts
    const unsubscribe = db.subscribe((msg) => {
      if (msg.type === 'seat_claim' || msg.type === 'seat_leave' || msg.type === 'profile_update') {
        onRefreshProfiles();
      } else if (msg.type === 'checklist_update' && msg.payload.roomId === 'guild_hall') {
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

  // Update seats when profiles update
  useEffect(() => {
    db.getSeats('guild_hall').then(setSeats);
  }, [profiles]);

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
    if (seat.user_id === currentProfile.id) {
      // Leave seat if clicked own seat
      await db.leaveSeat(currentProfile.id);
    } else {
      // Claim seat
      await db.claimSeat('guild_hall', seat.id, currentProfile.id);
    }
    onRefreshProfiles();
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
      <div className="bg-slate-950 border border-amber-600/30 p-2 text-xs flex items-center overflow-hidden h-8 rounded relative">
        <span className="text-amber-500 font-bold border-r border-amber-600/40 pr-2 mr-2 flex-shrink-0 rpg-font-retro text-[10px]">
          📣 TICKER:
        </span>
        {currentProfile.role !== 'Staff' ? (
          <input
            type="text"
            value={broadcastTicker}
            onChange={(e) => onSetTicker(e.target.value)}
            placeholder="Edit text berjalan... (Director & Manager Only)"
            className="flex-1 bg-transparent text-yellow-100 outline-none placeholder-slate-600 border-none font-semibold text-xs py-0"
          />
        ) : (
          <div className="ticker-wrap flex-1">
            <div className="ticker-content font-semibold text-yellow-50">{broadcastTicker || "Selamat Datang di Rapat Divisi Education!"}</div>
          </div>
        )}
      </div>

      {/* Main Grid: Map & Side panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Left Side: Interactive Guild Hall Map (8 Spans) */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          
          {/* Guild Hall Map */}
          <div className="map-scroll-container">
            <div className="rpg-panel border-4 h-[550px] relative overflow-hidden rounded select-none bg-[#2e2620] min-w-[750px] lg:min-w-0" style={{
              backgroundImage: 'radial-gradient(#1f1a16 1px, transparent 1px)',
              backgroundSize: '20px 20px'
            }}>
            
            {/* NOTICE BOARD (Figma Notice Board anchor) */}
            <div
              onClick={() => setShowWhiteboard(true)}
              className="absolute top-4 left-[calc(50%-105px)] w-24 h-16 bg-[#5c4033] border-4 border-[#8b5a2b] rounded shadow-lg cursor-pointer flex flex-col items-center justify-center hover:scale-105 transition-transform hover:border-amber-400 z-10 group"
            >
              <div className="bg-[#fcf8e3] w-[90%] h-[75%] rounded border border-black flex flex-col items-center justify-center relative overflow-hidden">
                <span className="text-[7.5px] font-bold text-slate-800 font-serif">NOTICE BOARD</span>
                <span className="text-[6.5px] text-amber-600 font-mono font-bold animate-pulse">KLIK PAPAN</span>
              </div>
            </div>

            {/* SCROLL OF ORDER (Agenda Popup anchor) */}
            <div
              onClick={() => setShowScrollOfOrder(true)}
              className="absolute top-4 left-[calc(50%+9px)] w-24 h-16 bg-[#b58a55] border-4 border-[#5c3a21] rounded shadow-lg cursor-pointer flex flex-col items-center justify-center hover:scale-105 transition-transform hover:border-amber-400 z-10 group"
            >
              <div className="bg-[#fdf6e2] w-[90%] h-[75%] rounded border border-[#5c3a21] flex flex-col items-center justify-center relative overflow-hidden">
                <span className="text-[7.5px] font-bold text-stone-900 font-serif">SCROLL OF ORDER</span>
                <span className="text-[6.5px] text-red-600 font-mono font-bold animate-pulse">AGENDA ({checklist.length})</span>
              </div>
            </div>

            {/* ROUND MEETING TABLE */}
            <div className="absolute top-[48%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[54%] h-[32%] bg-[#6b4c35] border-[6px] border-[#3e271a] rounded-full shadow-2xl z-20 flex flex-col items-center justify-center">
              {/* Inner ring decoration */}
              <div className="w-[85%] h-[80%] border-4 border-dashed border-[#533725]/30 rounded-full flex flex-col items-center justify-center">
                <span className="rpg-font-retro text-[10px] text-[#cca580] tracking-widest opacity-80">ROUND TABLE</span>
                <span className="text-[8px] text-[#cca580]/50 mt-1 font-semibold">{profiles.filter(p => p.current_seat_id?.startsWith('guild_hall_')).length} / 22 Duduk</span>
              </div>
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
                    <div className="bg-slate-950/90 border border-[#5c3a21]/50 px-2 py-0.5 rounded text-[8px] mt-0.5 font-bold text-yellow-100 max-w-[80px] truncate text-center shadow-md">
                      {occupant.name.split(' ')[0]}
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
            <div className="rpg-plaque mb-3">⌛ TIMER RAPAT</div>
            
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
                  <label className="block text-[8.5px] text-[#cca566] font-bold text-left">PENGUMUMAN SUMMON:</label>
                  <input
                    type="text"
                    value={summonText}
                    onChange={(e) => setSummonText(e.target.value)}
                    placeholder="Tulis pesan summon..."
                    className="w-full bg-[#16110e] text-yellow-100 p-2 rounded border border-[#5a3d28] text-[10px] focus:outline-none font-bold"
                  />
                  <button onClick={handleBroadcastSummon} className="rpg-btn-game w-full text-[9px] text-[#cca566] py-1.5" style={{
                    background: 'linear-gradient(to bottom, #4e3629 0%, #2a1910 100%)',
                    boxShadow: '0 3px 0 #120a06',
                    border: '2px solid #5a3d28',
                    color: '#ffd700'
                  }}>
                    📢 SUMMON SEMUA STAF
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Room Info / Guild ledger snippet card instead of Scroll of Order */}
          <div className="rpg-panel-wood p-4 flex flex-col justify-between min-h-[220px]">
            <div>
              <h3 className="font-bold text-[#cca566] text-xs mb-3 font-mono">
                🏰 ROOM INFO: GUILD HALL
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
          onClose={() => setShowWhiteboard(false)}
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
                  onClick={() => handleToggleChecklist(item)}
                  className={`flex items-start gap-3 p-2 rounded cursor-pointer border-2 transition-all ${
                    item.completed
                      ? 'bg-stone-950/10 border-stone-400 line-through text-stone-500 font-normal'
                      : 'bg-white border-[#5c3a21] hover:border-yellow-700 text-stone-900 font-semibold'
                  }`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    item.completed ? 'border-green-700 bg-green-900/10 text-green-700' : 'border-[#5c3a21] bg-white/60'
                  }`}>
                    {item.completed && <Check size={12} strokeWidth={3} />}
                  </div>
                  <div className="flex-1 text-xs select-none leading-relaxed">
                    {item.title}
                    {item.completed && item.completed_by && (
                      <span className="block text-[8px] text-green-700 font-mono mt-0.5">Dicentang oleh: {item.completed_by}</span>
                    )}
                  </div>
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
