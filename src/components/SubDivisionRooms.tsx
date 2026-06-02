import React, { useState, useEffect } from 'react';
import type { Profile, Seat, ChecklistItem } from '../lib/supabase';
import { db } from '../lib/supabase';
import { SpriteRenderer } from './SpriteRenderer';
import { ClipboardList, Plus, Check } from 'lucide-react';
import { playClick, playSelect } from '../lib/audio';
import { NoticeBoard } from './NoticeBoard';

interface SubDivisionRoomsProps {
  currentProfile: Profile;
  profiles: Profile[];
  onRefreshProfiles: () => void;
  activeRoom: 'carriage' | 'boat';
}

export const SubDivisionRooms: React.FC<SubDivisionRoomsProps> = ({
  currentProfile,
  profiles,
  onRefreshProfiles,
  activeRoom
}) => {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [showWhiteboard, setShowWhiteboard] = useState(false);

  // Chat Bubble State
  const [chatMessage, setChatMessage] = useState('');
  const [activeBubbles, setActiveBubbles] = useState<{ [userId: string]: { text: string, timerId: any } }>({});

  const loadRoomData = async () => {
    const s = await db.getSeats(activeRoom);
    setSeats(s);
    const c = await db.getChecklist(activeRoom);
    setChecklist(c);
  };

  useEffect(() => {
    loadRoomData();

    const unsubscribe = db.subscribe((msg) => {
      if (msg.type === 'seat_claim' || msg.type === 'seat_leave' || msg.type === 'profile_update') {
        onRefreshProfiles();
      } else if (msg.type === 'checklist_update' && msg.payload.roomId === activeRoom) {
        db.getChecklist(activeRoom).then(setChecklist);
      } else if (msg.type === 'chat_bubble') {
        triggerBubble(msg.payload.userId, msg.payload.text);
      }
    });

    return () => unsubscribe();
  }, [activeRoom]);

  // Sync seats when profiles change
  useEffect(() => {
    db.getSeats(activeRoom).then(setSeats);
  }, [profiles, activeRoom]);

  const handleSeatClick = async (seat: Seat) => {
    playSelect();
    if (seat.user_id === currentProfile.id) {
      await db.leaveSeat(currentProfile.id);
    } else {
      await db.claimSeat(activeRoom, seat.id, currentProfile.id);
    }
    onRefreshProfiles();
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
      
      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Map Rendering (8 Spans) */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          
          {/* CARRIAGE VIEW */}
          {activeRoom === 'carriage' && (
            <div className="map-scroll-container">
              <div className="rpg-panel border-4 h-[500px] relative overflow-hidden rounded bg-[#3e2723] flex items-center justify-center min-w-[750px] lg:min-w-0" style={{
                backgroundImage: 'linear-gradient(to bottom, #110d0c, #261917)',
              }}>
              
              {/* Parallax Ground & Moving Lines to simulate speed */}
              <div className="absolute inset-0 opacity-15 pointer-events-none flex flex-col justify-around">
                <div className="w-[200%] h-0.5 bg-yellow-600/30 animate-[wave-move_4s_linear_infinite]"></div>
                <div className="w-[200%] h-0.5 bg-yellow-600/30 animate-[wave-move_6s_linear_infinite_reverse]"></div>
                <div className="w-[200%] h-0.5 bg-yellow-600/30 animate-[wave-move_5s_linear_infinite]"></div>
              </div>

              {/* CARRIAGE FRAME (With shake animation) */}
              <div className="w-[85%] h-[80%] bg-[#5d4037] border-4 border-[#8d6e63] rounded-xl relative shadow-2xl flex items-center justify-center animate-[carriage-shake_0.8s_ease-in-out_infinite] z-10">
                
                {/* Carriage Windows */}
                <div className="absolute top-4 left-6 w-24 h-10 border border-amber-600/30 bg-cyan-950/60 rounded"></div>
                <div className="absolute top-4 right-6 w-24 h-10 border border-amber-600/30 bg-cyan-950/60 rounded"></div>

                {/* NOTICE BOARD (NoticeBoard anchor) */}
                <div
                  onClick={() => setShowWhiteboard(true)}
                  className="absolute top-[8%] left-[22%] w-24 h-10 bg-[#5c4033] border-2 border-[#8d6e63] rounded shadow-lg cursor-pointer flex items-center justify-center hover:scale-105 transition-transform hover:border-amber-400 z-30 group"
                >
                  <div className="bg-[#fcf8e3] w-[90%] h-[75%] rounded border border-black flex items-center justify-center">
                    <span className="text-[7.5px] font-bold text-slate-800 font-serif">NOTICE BOARD</span>
                  </div>
                </div>

                {/* Walkway in Middle */}
                <div className="absolute inset-x-0 top-[40%] bottom-[40%] bg-[#3e2723] border-y border-[#261614] opacity-80 z-0"></div>

                {/* Left Row Benches (academic side) */}
                <div className="absolute left-[8%] inset-y-[20%] w-[15%] bg-[#4e342e] rounded border border-[#2e1d1a] z-10 shadow-lg"></div>
                {/* Right Row Benches (pub side) */}
                <div className="absolute right-[8%] inset-y-[20%] w-[15%] bg-[#4e342e] rounded border border-[#2e1d1a] z-10 shadow-lg"></div>

                {/* Guest Seats (BPH / Visitors at the end) */}
                <div className="absolute top-[8%] left-[43%] w-[14%] h-[12%] bg-[#be9c7b]/20 border border-[#be9c7b]/30 rounded text-[8px] flex items-center justify-center text-[#be9c7b] z-10">
                  TAMU 1
                </div>
                <div className="absolute bottom-[8%] left-[43%] w-[14%] h-[12%] bg-[#be9c7b]/20 border border-[#be9c7b]/30 rounded text-[8px] flex items-center justify-center text-[#be9c7b] z-10">
                  TAMU 2
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
                        <div className="bg-slate-950/90 border border-[#8d6e63]/40 px-1.5 py-0.5 rounded text-[8px] mt-0.5 font-semibold max-w-[65px] truncate text-center text-yellow-100">
                          {occupant.name.split(' ')[0]}
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
              <div className="rpg-panel border-4 h-[500px] relative overflow-hidden rounded rowing-boat-sea min-w-[750px] lg:min-w-0" style={{
                backgroundImage: 'radial-gradient(#1f3557 1px, transparent 1px)',
                backgroundSize: '30px 30px'
              }}>
              
              {/* Parallax Clouds & Water waves */}
              <div className="clouds"></div>
              <div className="waves"></div>

              {/* BOAT FRAME (With rock animation) */}
              <div className="w-[50%] h-[82%] bg-[#8b5a2b] border-4 border-[#cd853f] rounded-[40px] relative shadow-2xl flex items-center justify-center animate-[boat-rock_4s_ease-in-out_infinite] mx-auto z-10">
                
                {/* Wood floor pattern */}
                <div className="absolute inset-y-[10%] inset-x-[15%] bg-[#5c3a21] rounded-[30px] border border-[#3e251c] opacity-90 z-0"></div>

                {/* Mast and Sail shadow */}
                <div className="absolute top-[35%] bottom-[35%] left-1/2 -translate-x-1/2 w-1.5 bg-[#402717] z-20"></div>
                <div className="absolute top-[40%] bottom-[50%] left-1/2 -translate-x-1/2 w-12 bg-white/10 border border-white/20 rounded z-20"></div>

                {/* NOTICE BOARD (NoticeBoard anchor) */}
                <div
                  onClick={() => setShowWhiteboard(true)}
                  className="absolute top-[22%] left-[50%] -translate-x-1/2 w-24 h-10 bg-[#5c4033] border-2 border-[#cd853f] rounded shadow-lg cursor-pointer flex items-center justify-center hover:scale-105 transition-transform hover:border-amber-400 z-30 group"
                >
                  <div className="bg-[#fcf8e3] w-[90%] h-[75%] rounded border border-black flex items-center justify-center">
                    <span className="text-[7.5px] font-bold text-slate-800 font-serif">NOTICE BOARD</span>
                  </div>
                </div>

                {/* Guest Seats (Visitor bow/stern) */}
                <div className="absolute top-[12%] left-[40%] w-[20%] h-[7%] bg-[#ddb892]/20 border border-[#ddb892]/30 rounded text-[7px] flex items-center justify-center text-[#ddb892] z-10">
                  BOW
                </div>
                <div className="absolute bottom-[12%] left-[40%] w-[20%] h-[7%] bg-[#ddb892]/20 border border-[#ddb892]/30 rounded text-[7px] flex items-center justify-center text-[#ddb892] z-10">
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
                        <div className="bg-slate-950/90 border border-[#cd853f]/40 px-1.5 py-0.5 rounded text-[8px] mt-0.5 font-semibold max-w-[65px] truncate text-center text-yellow-100">
                          {occupant.name.split(' ')[0]}
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
                    onClick={() => handleToggleChecklist(item)}
                    className={`flex items-start gap-3 p-2 rounded cursor-pointer border-2 transition-all ${
                      item.completed
                        ? 'bg-stone-900/10 border-stone-400 line-through text-stone-500'
                        : 'bg-stone-950/5 border-[#5c3a21] hover:border-yellow-700 text-stone-900 font-semibold'
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
                        <span className="block text-[8px] text-green-700 font-mono mt-0.5">Dicentang: {item.completed_by}</span>
                      )}
                    </div>
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
          onClose={() => setShowWhiteboard(false)}
        />
      )}

    </div>
  );
};
