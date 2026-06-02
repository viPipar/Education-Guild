import { useState, useEffect } from 'react';
import type { Profile } from './lib/supabase';
import { db } from './lib/supabase';
import { House } from './components/House';
import { GuildHall } from './components/GuildHall';
import { SubDivisionRooms } from './components/SubDivisionRooms';
import { Tavern } from './components/Tavern';
import { Library } from './components/Library';
import { LeadersLedger } from './components/LeadersLedger';
import { QuestBoard } from './components/QuestBoard';
import { SpriteRenderer } from './components/SpriteRenderer';
import { LogOut, Users, Compass, Flame, BookOpen, UserCheck, Star, Home, Ship, X } from 'lucide-react';
import { playClick, playSelect } from './lib/audio';

function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<string>('house');

  // Summon Notification State
  const [summonNotification, setSummonNotification] = useState<{ show: boolean; text: string }>({ show: false, text: '' });

  // Master Broadcast Ticker
  const [broadcastTicker, setBroadcastTicker] = useState('🔥 Selamat datang di Education Guild! Silakan kustomisasi karakter Anda di House.');

  // User Profile Detail Modal State
  const [selectedProfileForDetail, setSelectedProfileForDetail] = useState<Profile | null>(null);

  // Fetch all profiles from database
  const refreshProfiles = async () => {
    const data = await db.getProfiles();
    setProfiles(data);
    
    if (currentProfile) {
      const updated = data.find(p => p.id === currentProfile.id);
      if (updated) {
        setCurrentProfile(updated);
      }
    }
  };

  // Load active session on mount
  const checkSession = async () => {
    try {
      const userProfile = await db.getCurrentUser();
      if (userProfile) {
        setCurrentProfile(userProfile);
      }
    } catch (e) {
      console.error("Failed to restore session", e);
    }
  };

  useEffect(() => {
    checkSession();
    refreshProfiles();

    // Listen for realtime updates
    const unsubscribe = db.subscribe(async (msg) => {
      if (msg.type === 'profile_update' || msg.type === 'seat_claim' || msg.type === 'seat_leave') {
        refreshProfiles();
      } else if (msg.type === 'ticker_update') {
        setBroadcastTicker(msg.payload.text);
      } else if (msg.type === 'summon_all') {
        const { announcement, roomId } = msg.payload;
        setSummonNotification({ show: true, text: announcement });
        setActiveTab('guild_hall');
        
        // Auto teleport self to empty seat in the room if not already seated there
        if (currentProfile) {
          const roomSeats = await db.getSeats(roomId);
          const alreadySitting = roomSeats.some(s => s.user_id === currentProfile.id);
          if (!alreadySitting) {
            const emptySeat = roomSeats.find(s => s.user_id === null);
            if (emptySeat) {
              await db.claimSeat(roomId, emptySeat.id, currentProfile.id);
              refreshProfiles();
            }
          }
        }
      }
    });

    return () => unsubscribe();
  }, [currentProfile?.id]);

  // Periodic heartbeat to keep last_seen updated (Online indicator)
  useEffect(() => {
    if (!currentProfile) return;

    // Immediately trigger on load/login
    db.updateProfile(currentProfile.id, { last_seen: new Date().toISOString() });

    const interval = setInterval(() => {
      db.updateProfile(currentProfile.id, { last_seen: new Date().toISOString() });
    }, 20000); // 20 seconds interval

    return () => clearInterval(interval);
  }, [currentProfile?.id]);

  const getOnlineStatus = (lastSeenStr: string) => {
    if (!lastSeenStr) return { online: false, label: 'Offline' };
    const lastSeen = new Date(lastSeenStr);
    const now = new Date();
    const diffMs = now.getTime() - lastSeen.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) {
      return { online: true, label: 'Online' };
    } else if (diffMins < 60) {
      return { online: false, label: `Offline (${diffMins}m lalu)` };
    } else {
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) {
        return { online: false, label: `Offline (${diffHours}j lalu)` };
      } else {
        const diffDays = Math.floor(diffHours / 24);
        return { online: false, label: `Offline (${diffDays}h lalu)` };
      }
    }
  };

  const handleLogin = (profile: Profile) => {
    playClick();
    setCurrentProfile(profile);
    setActiveTab('house');
  };

  const handleLogout = async () => {
    playClick();
    if (currentProfile) {
      await db.signOut(currentProfile.id);
    }
    setCurrentProfile(null);
    setActiveTab('house');
    refreshProfiles();
  };

  const handleUpdateProfile = async (updates: Partial<Profile>) => {
    if (!currentProfile) return;
    const updated = await db.updateProfile(currentProfile.id, updates);
    if (updated) {
      setCurrentProfile(updated);
      refreshProfiles();
    }
  };

  const handleSetTicker = (text: string) => {
    setBroadcastTicker(text);
    db.broadcast('ticker_update', { text });
  };

  // Sort party members: Director first, then Manager, then Staff
  const getOnlineMembers = () => {
    return [...profiles].sort((a, b) => {
      const roles = { 'Director': 3, 'Manager': 2, 'Staff': 1 };
      return roles[b.role] - roles[a.role];
    });
  };

  const onlineMembers = getOnlineMembers();

  // Calculate simulated XP percentage based on user level
  const getXpProgress = (level: number) => {
    // Arbitrary XP progress math (e.g. lvl 5 is 50% through bar)
    return Math.min(100, Math.max(10, (level * 10) % 100 || 80));
  };

  return (
    <div className="flex flex-col min-h-screen bg-black">
      
      {/* Summon Announcement Banner Popup */}
      {summonNotification.show && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-red-950 border-4 border-red-500 text-yellow-100 p-4 rounded shadow-2xl z-[9999] max-w-md w-[90vw] animate-bounce flex flex-col gap-2">
          <div className="flex justify-between items-center border-b border-red-500/40 pb-1 font-sans">
            <span className="font-bold text-xs text-red-400 flex items-center gap-1">🚨 PANGGILAN RAPAT DIREKTUR</span>
            <button onClick={() => setSummonNotification({ show: false, text: '' })} className="text-slate-400 hover:text-white font-bold text-xs">X</button>
          </div>
          <p className="text-xs font-bold leading-normal text-yellow-50 font-sans">"{summonNotification.text}"</p>
          <span className="text-[8px] text-slate-400 italic font-sans">Karakter Anda telah diteleportasi secara otomatis ke Round Table.</span>
        </div>
      )}
      
      {/* RPG HUD Header */}
      <header className="bg-[#1b1613] border-b-4 border-[#cca566] p-4 flex flex-col md:flex-row justify-between items-center gap-4 z-50">
        
        {/* Logo and Game Title */}
        <div className="flex items-center gap-3">
          <div className="border-2 border-[#ffd700] p-1.5 bg-[#d90429] shadow-md flex items-center justify-center">
            <span className="text-white text-lg font-bold">⚔️</span>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <h1 className="rpg-font-retro text-yellow-500 text-sm md:text-base leading-none">
                EDUCATION GUILD
              </h1>
              <span className="text-[7.5px] font-bold text-slate-400 font-mono select-none">v1.1.0</span>
            </div>
            <span className="text-[8px] rpg-font-retro text-slate-400 mt-1 block">EDUCATION DIVISION</span>
          </div>
        </div>

        {/* Player Status HUD Panel */}
        {currentProfile ? (
          <div className="rpg-hud-card">
            {/* Portrait Frame */}
            <div className="rpg-hud-avatar-frame flex items-center justify-center overflow-hidden">
              <SpriteRenderer
                base={currentProfile.sprite_json.base}
                hair={currentProfile.sprite_json.hair}
                outfit={currentProfile.sprite_json.outfit}
                accessory={currentProfile.sprite_json.accessory}
                petId="none" // Keep HUD avatar clean without pet overlap
                size={40}
              />
            </div>
            
            {/* Player details & Stats bar */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center gap-4">
                <span className="font-bold text-xs text-yellow-100">{currentProfile.name.split(' ')[0]}</span>
                <span className="text-[8px] rpg-font-retro text-[#ffd700]">LV.{currentProfile.level}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[7px] rpg-font-retro text-slate-400">XP:</span>
                <div className="rpg-hud-bar-container">
                  <div
                    className="rpg-hud-bar-fill"
                    style={{ width: `${getXpProgress(currentProfile.level)}%` }}
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="text-red-400 hover:text-red-200 p-2 rounded bg-slate-950/80 border border-red-900 transition-colors ml-2"
              title="Leave House"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <div className="rpg-plaque animate-pulse">
            SILAKAN LOGIN DI HOUSE
          </div>
        )}
      </header>

      {/* Main Content Stage */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Left Sidebar: RPG Party Member List */}
        {currentProfile && (
          <aside className="rpg-sidebar w-full md:w-64 bg-[#1b1613] border-r-4 border-[#cca566]/60 p-4 flex flex-col gap-3">
            <div className="border-b border-[#cca566]/20 pb-2">
              <h3 className="rpg-font-retro text-[8px] text-amber-500 flex items-center gap-1 font-bold">
                <Users size={12} /> PARTY MEMBERS ({profiles.length})
              </h3>
            </div>

            {/* Scrollable Party Members List */}
            <div className="space-y-1.5 overflow-y-auto max-h-[300px] md:max-h-[calc(100vh-210px)] pr-1 flex-1 no-scrollbar">
              {onlineMembers.map((member) => {
                const isCurrent = member.id === currentProfile.id;
                
                const getLocationLabel = (seatId: string | null) => {
                  if (!seatId) return 'in House';
                  if (seatId.startsWith('guild_hall_')) return 'in Round Table';
                  if (seatId.startsWith('carriage_')) return 'in Carriage';
                  if (seatId.startsWith('boat_')) return 'in Boat';
                  if (seatId.startsWith('tavern_')) return 'in Tavern';
                  return 'in House';
                };

                return (
                  <div
                    key={member.id}
                    onClick={() => {
                      playClick();
                      setSelectedProfileForDetail(member);
                    }}
                    className={`rpg-party-member cursor-pointer hover:border-amber-500/80 transition-all ${isCurrent ? 'border-[#38b000] bg-[#1b2615]' : ''}`}
                  >
                    {/* Small sprite avatar head */}
                    <div className="rpg-party-avatar flex items-center justify-center overflow-hidden">
                      <SpriteRenderer
                        base={member.sprite_json.base}
                        hair={member.sprite_json.hair}
                        outfit={member.sprite_json.outfit}
                        accessory={member.sprite_json.accessory}
                        petId="none"
                        size={28}
                      />
                    </div>
                    
                    {/* Member Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <span className={`font-bold text-[11px] truncate block ${isCurrent ? 'text-green-300' : 'text-slate-100'}`}>
                          {member.name.split(' ')[0]}
                        </span>
                        <span className="text-[7.5px] font-mono text-slate-500">LV.{member.level}</span>
                      </div>
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        {member.current_status && (
                          <span className="text-[7.5px] text-[#cca566]/85 block truncate font-medium italic">
                            "{member.current_status}"
                          </span>
                        )}
                        <span className="text-[9.5px] text-cyan-400 font-bold block">
                          {getLocationLabel(member.current_seat_id)}
                        </span>
                        {/* Online/Offline status badge */}
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${getOnlineStatus(member.last_seen).online ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
                          <span className="text-[7.5px] text-slate-400 font-medium font-mono">
                            {getOnlineStatus(member.last_seen).label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {/* Center Canvas Main Screen */}
        <main className="flex-1 flex flex-col bg-[#0f0f13] overflow-y-auto pb-10">
          
          {/* Navigation: Game Inventory Tabs */}
          {currentProfile && (
            <nav className="rpg-tab-nav no-scrollbar">
              {([
                { id: 'house', name: 'House', icon: Home },
                { id: 'guild_hall', name: 'Round Table', icon: Users },
                { id: 'carriage', name: 'Carriage', icon: Compass },
                { id: 'boat', name: 'Boat', icon: Ship },
                { id: 'tavern', name: 'Tavern', icon: Flame },
                { id: 'library', name: 'Library', icon: BookOpen },
                currentProfile.role !== 'Staff' ? { id: 'ledger', name: 'Ledger', icon: UserCheck } : null,
                { id: 'quest', name: 'Quest Board', icon: Star }
              ].filter(Boolean) as { id: string; name: string; icon: any }[]).map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      playSelect();
                      setActiveTab(tab.id);
                    }}
                    className={`rpg-tab-item ${isActive ? 'active' : ''}`}
                  >
                    <span className="flex items-center gap-1">
                      <Icon size={10} /> {tab.name}
                    </span>
                  </button>
                );
              })}
            </nav>
          )}

          {/* Active Screen Frame */}
          <div className="flex-1">
            {!currentProfile ? (
              <House
                profiles={profiles}
                currentProfile={currentProfile}
                onLogin={handleLogin}
                onUpdateProfile={handleUpdateProfile}
              />
            ) : (
              <>
                {activeTab === 'house' && (
                  <House
                    profiles={profiles}
                    currentProfile={currentProfile}
                    onLogin={handleLogin}
                    onUpdateProfile={handleUpdateProfile}
                  />
                )}
                {activeTab === 'guild_hall' && (
                  <GuildHall
                    currentProfile={currentProfile}
                    profiles={profiles}
                    onRefreshProfiles={refreshProfiles}
                    broadcastTicker={broadcastTicker}
                    onSetTicker={handleSetTicker}
                  />
                )}
                 {activeTab === 'carriage' && (
                  <SubDivisionRooms
                    activeRoom="carriage"
                    currentProfile={currentProfile}
                    profiles={profiles}
                    onRefreshProfiles={refreshProfiles}
                  />
                )}
                {activeTab === 'boat' && (
                  <SubDivisionRooms
                    activeRoom="boat"
                    currentProfile={currentProfile}
                    profiles={profiles}
                    onRefreshProfiles={refreshProfiles}
                  />
                )}
                {activeTab === 'tavern' && (
                  <Tavern
                    currentProfile={currentProfile}
                    profiles={profiles}
                    onRefreshProfiles={refreshProfiles}
                    onUpdateProfile={handleUpdateProfile}
                  />
                )}
                {activeTab === 'library' && (
                  <Library
                    currentProfile={currentProfile}
                  />
                )}
                {activeTab === 'ledger' && currentProfile.role !== 'Staff' && (
                  <LeadersLedger
                    currentProfile={currentProfile}
                    profiles={profiles}
                    onRefreshProfiles={refreshProfiles}
                  />
                )}
                {activeTab === 'quest' && (
                  <QuestBoard
                    currentProfile={currentProfile}
                  />
                )}
              </>
            )}
          </div>
        </main>

      </div>

      {/* User Profile Detail Modal */}
      {selectedProfileForDetail && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4">
          <div className="rpg-panel-glass max-w-sm w-full p-6 flex flex-col gap-4 animate-[fadeIn_0.2s_ease-out]">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-amber-600/30 pb-2">
              <span className="text-amber-500 font-bold text-xs uppercase tracking-wide rpg-font-retro">
                Character Sheet
              </span>
              <button 
                onClick={() => setSelectedProfileForDetail(null)}
                className="text-slate-400 hover:text-white p-1 rounded bg-slate-900 border border-slate-800"
              >
                <X size={14} />
              </button>
            </div>

            {/* Content (Avatar & Details) */}
            <div className="flex gap-4 items-center">
              {/* Large Portrait Frame */}
              <div className="w-24 h-24 bg-[#1b1613] border-4 border-[#cca566] rounded-lg shadow-inner flex items-center justify-center overflow-hidden bg-gradient-to-b from-[#2b1f1a] to-[#120a07] flex-shrink-0">
                <SpriteRenderer
                  base={selectedProfileForDetail.sprite_json.base}
                  hair={selectedProfileForDetail.sprite_json.hair}
                  outfit={selectedProfileForDetail.sprite_json.outfit}
                  accessory={selectedProfileForDetail.sprite_json.accessory}
                  petId={selectedProfileForDetail.pet_id}
                  size={80}
                />
              </div>

              {/* Statistics */}
              <div className="flex-1 space-y-1.5 min-w-0">
                <div>
                  <h2 className="text-sm font-bold text-yellow-400 leading-tight truncate">
                    {selectedProfileForDetail.name}
                  </h2>
                  <span className="text-[8px] font-bold text-cyan-400 font-mono tracking-wider">
                    {selectedProfileForDetail.role.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[9px] bg-black/30 p-2 rounded border border-slate-800/80">
                  <div>
                    <span className="text-slate-400 block text-[7px] leading-none">LEVEL</span>
                    <span className="text-[#ffd700] font-bold font-mono">LV.{selectedProfileForDetail.level}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[7px] leading-none">PET</span>
                    <span className="text-slate-200 font-semibold font-mono uppercase truncate block">
                      {selectedProfileForDetail.pet_id !== 'none' ? selectedProfileForDetail.pet_id : 'TIDAK ADA'}
                    </span>
                  </div>
                  <div className="col-span-2 border-t border-slate-800/40 pt-1">
                    <span className="text-slate-400 block text-[7px] leading-none">LOCATION</span>
                    <span className="text-cyan-300 font-semibold truncate block">
                      {(() => {
                        const seat = selectedProfileForDetail.current_seat_id;
                        if (!seat) return 'in House';
                        if (seat.startsWith('guild_hall_')) return 'in Round Table';
                        if (seat.startsWith('carriage_')) return 'in Carriage';
                        if (seat.startsWith('boat_')) return 'in Boat';
                        if (seat.startsWith('tavern_')) return 'in Tavern';
                        return 'in House';
                      })()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Status & Biography Section */}
            <div className="bg-[#1b1613] border border-[#cca566]/20 p-2.5 rounded">
              <span className="text-[8px] text-[#cca566] block font-bold uppercase tracking-wider mb-1">
                Current Status:
              </span>
              <p className="text-[10px] text-yellow-100 font-mono font-medium leading-relaxed italic break-words">
                "{selectedProfileForDetail.current_status || 'Tidak ada status...'}"
              </p>
            </div>

            {/* Footer with activity and Close */}
            <div className="flex justify-between items-center text-[8px] text-slate-500 pt-2 border-t border-slate-800">
              <span className="truncate max-w-[150px]">
                Terakhir aktif: {selectedProfileForDetail.last_seen ? new Date(selectedProfileForDetail.last_seen).toLocaleTimeString() : '-'}
              </span>
              <button
                onClick={() => setSelectedProfileForDetail(null)}
                className="rpg-btn-game px-3 py-1 text-[9px] font-bold"
              >
                TUTUP
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default App;
