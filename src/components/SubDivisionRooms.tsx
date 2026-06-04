import React, { useState, useEffect, useRef } from 'react';
import type { Profile, Seat, ChecklistItem, RoomConfig } from '../lib/supabase';
import { db } from '../lib/supabase';
import { SpriteRenderer } from './SpriteRenderer';
import { ClipboardList, Plus, Check, Trash2 } from 'lucide-react';
import { playClick, playSelect } from '../lib/audio';
import { NoticeBoard } from './NoticeBoard';

interface SubDivisionRoomsProps {
  currentProfile: Profile;
  profiles: Profile[];
  onRefreshProfiles: () => void;
  activeRoom: 'carriage' | 'boat';
  onSeatClick?: (seatId: string, isLeave: boolean) => void;
  roomConfig?: RoomConfig;
  onUpdateRoomConfig?: (roomId: string, updates: Partial<RoomConfig>) => void;
}

export const SubDivisionRooms: React.FC<SubDivisionRoomsProps> = ({
  currentProfile,
  profiles,
  onRefreshProfiles,
  activeRoom,
  onSeatClick,
  roomConfig,
  onUpdateRoomConfig,
}) => {
  const seats = React.useMemo(() => db.getSeatsSync(activeRoom, profiles), [profiles, activeRoom]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [showWhiteboard, setShowWhiteboard] = useState(false);

  // Chat Bubble State
  const [chatMessage, setChatMessage] = useState('');
  const [activeBubbles, setActiveBubbles] = useState<{ [userId: string]: { text: string, timerId: any } }>({});

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = canvas.width = canvas.offsetWidth;
    let height = canvas.height = canvas.offsetHeight;

    const handleResize = () => {
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', handleResize);

    const intensity = roomConfig?.weather_intensity ?? 0;

    // Define particles
    interface Particle {
      x: number;
      y: number;
      speed: number;
      size: number;
      drift: number;
    }

    const particles: Particle[] = [];
    const maxParticles = intensity * 20;

    // Initialize particles
    for (let i = 0; i < maxParticles; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        speed: Math.random() * 2 + (activeRoom === 'boat' ? 4 : 1), // Rain is faster, snow is slower
        size: activeRoom === 'boat' ? Math.random() * 1.5 + 0.5 : Math.random() * 2.5 + 1.5, // Snow is larger
        drift: Math.random() * 0.5 - 0.25
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      if (intensity > 0) {
        if (activeRoom === 'boat') {
          // RAIN EFFECT (Slanted lines falling down and to the right)
          ctx.strokeStyle = 'rgba(174, 207, 238, 0.45)';
          ctx.lineWidth = 1;
          for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + 4, p.y + p.speed * 2.5);
            ctx.stroke();

            // Update position
            p.x += 4;
            p.y += p.speed * 2.5;

            // Boundary wrap
            if (p.y > height) {
              p.y = -10;
              p.x = Math.random() * width;
            }
            if (p.x > width) {
              p.x = -10;
              p.y = Math.random() * height;
            }
          }
        } else {
          // SNOW EFFECT (Drifting circles falling down and to the right)
          ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();

            // Update position
            p.y += p.speed;
            p.x += p.drift + 1.5; // Wind blowing right (simulate carriage moving left)

            // Boundary wrap
            if (p.y > height) {
              p.y = -10;
              p.x = Math.random() * width;
            }
            if (p.x > width) {
              p.x = -10;
              p.y = Math.random() * height;
            }
          }
        }
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
  }, [activeRoom, roomConfig?.weather_intensity]);

  const loadRoomData = async () => {
    const c = await db.getChecklist(activeRoom);
    setChecklist(c);
  };

  useEffect(() => {
    loadRoomData();

    const unsubscribe = db.subscribe((msg) => {
      if (msg.type === 'checklist_update' && msg.payload.roomId === activeRoom) {
        db.getChecklist(activeRoom).then(setChecklist);
      } else if (msg.type === 'chat_bubble') {
        triggerBubble(msg.payload.userId, msg.payload.text);
      }
    });

    return () => unsubscribe();
  }, [activeRoom]);

  const handleSeatClick = async (seat: Seat) => {
    playSelect();
    const isLeave = seat.user_id === currentProfile.id;
    if (onSeatClick) {
      onSeatClick(seat.id, isLeave);
    } else {
      if (isLeave) {
        await db.leaveSeat(currentProfile.id);
      } else {
        await db.claimSeat(activeRoom, seat.id, currentProfile.id);
      }
      onRefreshProfiles();
    }
  };

  const handleAddChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChecklistItem.trim()) return;
    playClick();
    await db.addChecklistItem(activeRoom, newChecklistItem);
    setNewChecklistItem('');
    db.getChecklist(activeRoom).then(setChecklist);
  };

  const handleToggleChecklist = async (item: ChecklistItem) => {
    playClick();
    await db.toggleChecklistItem(activeRoom, item.id, !item.completed, currentProfile.name);
    db.getChecklist(activeRoom).then(setChecklist);
  };

  const handleDeleteChecklist = async (itemId: number) => {
    playClick();
    await db.deleteChecklistItem(activeRoom, itemId);
    db.getChecklist(activeRoom).then(setChecklist);
  };

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

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    playClick();
    db.broadcast('chat_bubble', { userId: currentProfile.id, text: chatMessage });
    triggerBubble(currentProfile.id, chatMessage);
    setChatMessage('');
  };

  return (
    <div className="flex flex-col gap-4 p-2">
      
      {/* Room HUD controls (Discord + weather) */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-slate-950/85 border border-[#cca566]/30 rounded">
        <div className="flex items-center gap-3">
          <span className="text-yellow-500 font-bold text-xs uppercase tracking-wide rpg-font-retro">
            {activeRoom === 'carriage' ? 'Moving Carriage' : 'Rowing Boat'}
          </span>
          <a
            href={roomConfig?.discord_url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => playSelect()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded text-[10px] font-bold transition-all shadow-[0_0_8px_rgba(147,51,234,0.5)] border border-purple-400/30"
          >
            <svg className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '6s' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m10.657 10.657l.707-.707M14 12a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            PORTAL
          </a>
        </div>

        {currentProfile.role !== 'Staff' && (
          <div className="flex items-center gap-4 flex-wrap text-[10px]">
            <div className="flex items-center gap-2 border-r border-slate-800 pr-4">
              <span className="font-bold text-[#cca566] uppercase">INTENSITAS CUACA:</span>
              <input
                type="range"
                min="0"
                max="5"
                value={roomConfig?.weather_intensity ?? 0}
                onChange={(e) => {
                  if (onUpdateRoomConfig) {
                    onUpdateRoomConfig(activeRoom, { weather_intensity: parseInt(e.target.value) });
                  }
                }}
                className="w-20 accent-amber-500 cursor-pointer h-1.5 bg-slate-950 rounded-lg appearance-none"
              />
              <span className="font-bold font-mono text-yellow-400">{roomConfig?.weather_intensity ?? 0}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-[#cca566] uppercase">DISCORD URL:</span>
              <input
                type="text"
                value={roomConfig?.discord_url ?? ''}
                onChange={(e) => {
                  if (onUpdateRoomConfig) {
                    onUpdateRoomConfig(activeRoom, { discord_url: e.target.value });
                  }
                }}
                placeholder="https://discord.gg/..."
                className="bg-black/60 text-yellow-100 border border-[#5a3d28] rounded px-2 py-1 w-52 text-[9px] font-semibold focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Map Rendering (8 Spans) */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          
          {/* CARRIAGE VIEW */}
          {activeRoom === 'carriage' && (
            <div className="map-scroll-container">
              <div className="rpg-panel border-4 h-[500px] relative overflow-hidden rounded snow-forest-scroll min-w-[750px] lg:min-w-0 flex items-center justify-center">
                {/* Weather Canvas Overlay */}
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-20" />

              {/* CARRIAGE FRAME (With shake animation and wheels offset) */}
              <div
                style={{
                  backgroundImage: 'url(/assets/rooms/carriage.png)',
                  backgroundSize: '100% 100%',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  aspectRatio: '669 / 373'
                }}
                className="w-[88%] max-w-[850px] relative flex items-center justify-center animate-[carriage-shake_0.8s_ease-in-out_infinite] mx-auto translate-y-[30px] z-10"
              >
                
                {/* NOTICE BOARD OVERLAY (Bulletin board on top-right wall) */}
                <div
                  onClick={() => setShowWhiteboard(true)}
                  style={{ left: '60.5%', top: '20.5%', width: '8%', height: '11%' }}
                  className="absolute cursor-pointer border border-transparent hover:border-amber-400 hover:bg-amber-400/10 transition-all rounded z-30 group"
                  title="Notice Board"
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-950/90 text-[8px] text-amber-400 border border-amber-500/50 px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none font-bold">
                    NOTICE BOARD
                  </div>
                </div>

                {/* Direction Labels */}
                <div 
                  style={{ left: '26%', top: '38%' }}
                  className="absolute transform -translate-x-1/2 bg-[#ddb892]/20 border border-[#ddb892]/30 rounded text-[7px] px-1.5 py-0.5 flex items-center justify-center text-[#ddb892] font-bold z-10"
                >
                  FRONT
                </div>
                <div 
                  style={{ left: '73%', top: '38%' }}
                  className="absolute transform -translate-x-1/2 bg-[#ddb892]/20 border border-[#ddb892]/30 rounded text-[7px] px-1.5 py-0.5 flex items-center justify-center text-[#ddb892] font-bold z-10"
                >
                  REAR
                </div>

                {/* Render Seats over the layout */}
                {seats.map((seat) => {
                  const occupant = profiles.find(p => p.id === seat.user_id);
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
                        className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all ${
                          occupant
                            ? 'border-none bg-transparent'
                            : 'border-2 border-dashed border-amber-500/40 bg-amber-900/10 hover:border-amber-400 hover:scale-105'
                        }`}
                      >
                        {occupant ? (
                          <div className="relative">
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
                              size={48}
                              className="transform -translate-y-1"
                            />
                            {occupant.id === currentProfile.id && (
                              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-2 h-2 bg-green-500 rounded-full border border-white animate-bounce"></div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[7.5px] rpg-font-retro text-amber-500/60 font-bold">SIT</span>
                        )}
                      </div>

                      {occupant && (
                        <div className="bg-slate-950/90 border border-[#8d6e63]/40 px-1.5 py-0.5 rounded text-[8px] mt-0.5 font-semibold max-w-[65px] truncate text-center">
                          <span style={{ color: occupant.sprite_json.nameColor || '#fef08a' }}>
                            {occupant.name.split(' ')[0]}
                          </span>
                          <span className="block text-[5px] text-slate-400 leading-none mt-0.5">{occupant.current_status}</span>
                        </div>
                      )}
                    </div>
                  );
                })}

              </div>
            </div>
          </div>
          )}

          {/* ROWING BOAT VIEW */}
          {activeRoom === 'boat' && (
            <div className="map-scroll-container">
              <div className="rpg-panel border-4 h-[500px] relative overflow-hidden rounded sea-waves-scroll min-w-[750px] lg:min-w-0">
                {/* Weather Canvas Overlay */}
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-20" />
              
              {/* Parallax Clouds & Water waves */}
              <div className="clouds"></div>
              <div className="waves"></div>

              {/* BOAT FRAME (With rock animation) */}
              <div
                style={{
                  backgroundImage: 'url(/assets/rooms/boat.png)',
                  backgroundSize: '100% 100%',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  aspectRatio: '666 / 375'
                }}
                className="w-[88%] max-w-[850px] relative flex items-center justify-center animate-[boat-rock_4s_ease-in-out_infinite] mx-auto z-10"
              >
                
                {/* NOTICE BOARD (Map Table overlay over background) */}
                <div
                  onClick={() => setShowWhiteboard(true)}
                  style={{ left: '46.5%', top: '57%', width: '6.5%', height: '8%' }}
                  className="absolute cursor-pointer border-2 border-transparent hover:border-amber-400 hover:bg-amber-400/10 transition-all rounded z-30 group"
                  title="Notice Board"
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-950/90 text-[8px] text-amber-400 border border-amber-500/50 px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none font-bold">
                    NOTICE BOARD (MAP TABLE)
                  </div>
                </div>

                {/* Guest Seats (Visitor bow/stern in horizontal orientation) */}
                <div 
                  style={{ left: '15%', top: '54%' }}
                  className="absolute transform -translate-x-1/2 bg-[#ddb892]/20 border border-[#ddb892]/30 rounded text-[7px] px-1.5 py-0.5 flex items-center justify-center text-[#ddb892] font-bold z-10"
                >
                  BOW
                </div>
                <div 
                  style={{ left: '92%', top: '37%' }}
                  className="absolute transform -translate-x-1/2 bg-[#ddb892]/20 border border-[#ddb892]/30 rounded text-[7px] px-1.5 py-0.5 flex items-center justify-center text-[#ddb892] font-bold z-10"
                >
                  STERN
                </div>

                {/* Render Seats */}
                {seats.map((seat) => {
                  const occupant = profiles.find(p => p.id === seat.user_id);
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
                        className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all ${
                          occupant
                            ? 'border-none bg-transparent'
                            : 'border-2 border-dashed border-amber-400/40 bg-amber-950/10 hover:border-amber-300 hover:scale-105'
                        }`}
                      >
                        {occupant ? (
                          <div className="relative">
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
                              size={48}
                              className="transform -translate-y-1"
                            />
                            {occupant.id === currentProfile.id && (
                              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-2 h-2 bg-green-500 rounded-full border border-white animate-bounce"></div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[7.5px] rpg-font-retro text-amber-300/60 font-bold">SIT</span>
                        )}
                      </div>

                      {occupant && (
                        <div className="bg-slate-950/90 border border-[#cd853f]/40 px-1.5 py-0.5 rounded text-[8px] mt-0.5 font-semibold max-w-[65px] truncate text-center">
                          <span style={{ color: occupant.sprite_json.nameColor || '#fef08a' }}>
                            {occupant.name.split(' ')[0]}
                          </span>
                          <span className="block text-[5px] text-slate-400 leading-none mt-0.5">{occupant.current_status}</span>
                        </div>
                      )}
                    </div>
                  );
                })}

              </div>
            </div>
          </div>
          )}

          {/* Chat bubble sender */}
          <form onSubmit={handleSendChat} className="rpg-panel-wood py-3 px-4 flex gap-2 items-center">
            <span className="text-[9px] text-[#cca566] rpg-font-retro mr-1">CHAT:</span>
            <input
              type="text"
              placeholder={`Ketik pesan bubble chat di ${activeRoom === 'carriage' ? 'Moving Carriage' : 'Rowing Boat'}...`}
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              maxLength={40}
              className="flex-1 bg-[#16110e] text-yellow-50 px-3 py-2 rounded border border-[#5a3d28] text-xs font-semibold focus:outline-none"
            />
            <button type="submit" className="rpg-btn-game">KIRIM</button>
          </form>

        </div>

        {/* Local Checklist (4 Spans) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="rpg-parchment flex-1 flex flex-col justify-between min-h-[350px]">
            <div>
              <h3 className="font-bold text-stone-900 text-sm mb-4 flex items-center gap-1.5">
                <ClipboardList size={14} className="text-yellow-700" /> LOCAL AGENDA
              </h3>
              <div className="rpg-parchment-divider"></div>

              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {checklist.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-3 p-2 rounded border-2 transition-all ${
                      item.completed
                        ? 'bg-stone-900/10 border-stone-400 line-through text-stone-500'
                        : 'bg-stone-950/5 border-[#5c3a21] hover:border-yellow-700 text-stone-900 font-semibold'
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
                          <span className="block text-[8px] text-green-700 font-mono mt-0.5">Dicentang: {item.completed_by}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteChecklist(item.id);
                      }}
                      className="p-1 text-red-650 hover:text-red-800 hover:bg-red-950/10 rounded flex-shrink-0"
                      title="Hapus Agenda"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {checklist.length === 0 && (
                  <p className="text-[10px] text-stone-500 italic text-center py-6 font-semibold">Belum ada agenda sub-divisi...</p>
                )}
              </div>
            </div>

            {/* Input agenda lokal (Director & Manager Only) */}
            {currentProfile.role !== 'Staff' && (
              <form onSubmit={handleAddChecklist} className="border-t border-stone-400/40 pt-3 mt-3 flex gap-2">
                <input
                  type="text"
                  placeholder="Agenda sub-divisi..."
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  className="flex-1 bg-white/80 text-stone-900 px-2 py-1.5 rounded border-2 border-[#5c3a21] text-xs font-semibold focus:outline-none"
                />
                <button type="submit" className="rpg-btn-game p-1.5 flex items-center justify-center" style={{
                  background: 'linear-gradient(to bottom, #d2b48c 0%, #b58a55 100%)',
                  boxShadow: '0 3px 0 #5c3a21',
                  border: '2px solid #5c3a21',
                  outline: 'none'
                }}>
                  <Plus size={12} />
                </button>
              </form>
            )}
          </div>
        </div>

      </div>

      {showWhiteboard && (
        <NoticeBoard
          roomId={activeRoom}
          currentProfile={currentProfile}
          onClose={() => setShowWhiteboard(false)}
          profiles={profiles}
        />
      )}

    </div>
  );
};
