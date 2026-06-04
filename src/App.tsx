import React, { useState, useEffect } from 'react';
import type { Profile } from './lib/supabase';
import { db } from './lib/supabase';
import { House } from './components/House';
import { GuildHall } from './components/GuildHall';
import { SubDivisionRooms } from './components/SubDivisionRooms';
import { Tavern } from './components/Tavern';
import { Library } from './components/Library';
import { LeadersLedger } from './components/LeadersLedger';
import { QuestBoard } from './components/QuestBoard';
import { AssetManager } from './components/AssetManager';
import { Inventory } from './components/Inventory';
import { SpriteRenderer } from './components/SpriteRenderer';
import { Wilderness } from './components/Wilderness';
import { LogOut, Users, Compass, Flame, BookOpen, UserCheck, Star, Home, Ship, X, Sparkles, Sword, Swords } from 'lucide-react';
import { playClick, playSelect } from './lib/audio';

function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<string>('house');

  // Inventory Modal State
  const [showInventory, setShowInventory] = useState(false);

  // Summon Notification State
  const [summonNotification, setSummonNotification] = useState<{ show: boolean; text: string }>({ show: false, text: '' });

  // Master Broadcast Ticker
  const [broadcastTicker, setBroadcastTicker] = useState('Selamat datang di Education Guild! Silakan kustomisasi karakter Anda di House.');

  // Global Timer (synced from GuildHall Director)
  const [globalTimerDisplay, setGlobalTimerDisplay] = useState('00:00');
  const [globalTimerRunning, setGlobalTimerRunning] = useState(false);
  const globalTimerDurationRef = React.useRef<number>(0);
  const globalTimerIntervalRef = React.useRef<any>(null);

  // User Profile Detail Modal State
  const [selectedProfileForDetail, setSelectedProfileForDetail] = useState<Profile | null>(null);

  // Header Seats State
  const [lockedSeats, setLockedSeats] = useState<string[]>([]);

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
    // Pre-populate the asset cache so SpriteRenderer can read synchronously
    db.refreshAssetsCache();

    // Fetch initial header seat locks and global ticker
    db.getLockedHeaderSeats().then(setLockedSeats);
    db.getGlobalTicker().then(setBroadcastTicker);

    // Listen for realtime updates
    const unsubscribe = db.subscribe(async (msg) => {
      if (msg.type === 'profile_update' || msg.type === 'seat_claim' || msg.type === 'seat_leave') {
        // Ignore updates initiated by ourselves to prevent race conditions and redundant network requests
        if (currentProfile) {
          if (msg.type === 'profile_update' && msg.payload.id === currentProfile.id) {
            return;
          }
          if ((msg.type === 'seat_claim' || msg.type === 'seat_leave') && msg.payload.userId === currentProfile.id) {
            return;
          }
        }
        refreshProfiles();
      } else if (msg.type === 'ticker_update') {
        setBroadcastTicker(msg.payload.text);
      } else if (msg.type === 'summon_all') {
        const { announcement } = msg.payload;
        setSummonNotification({ show: true, text: announcement });
      } else if (msg.type === 'timer_sync') {
        const { duration, running } = msg.payload;
        globalTimerDurationRef.current = duration;
        const mins = Math.floor(duration / 60).toString().padStart(2, '0');
        const secs = (duration % 60).toString().padStart(2, '0');
        setGlobalTimerDisplay(`${mins}:${secs}`);
        setGlobalTimerRunning(running);
      } else if (msg.type === 'header_seats_lock_update') {
        setLockedSeats(msg.payload.lockedSeats);
      }
    });

    return () => {
      unsubscribe();
      clearInterval(globalTimerIntervalRef.current);
    };
  }, [currentProfile?.id]);

  // Global Timer Countdown Effect
  React.useEffect(() => {
    clearInterval(globalTimerIntervalRef.current);
    if (!globalTimerRunning) return;
    globalTimerIntervalRef.current = setInterval(() => {
      globalTimerDurationRef.current = Math.max(0, globalTimerDurationRef.current - 1);
      const d = globalTimerDurationRef.current;
      const mins = Math.floor(d / 60).toString().padStart(2, '0');
      const secs = (d % 60).toString().padStart(2, '0');
      setGlobalTimerDisplay(`${mins}:${secs}`);
      if (d <= 0) {
        setGlobalTimerRunning(false);
        clearInterval(globalTimerIntervalRef.current);
      }
    }, 1000);
    return () => clearInterval(globalTimerIntervalRef.current);
  }, [globalTimerRunning]);

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

    // Level-up coin reward: +10 coins per level gained
    if (updates.level && updates.level > currentProfile.level) {
      const levelsGained = updates.level - currentProfile.level;
      updates = { ...updates, coins: (currentProfile.coins || 0) + (levelsGained * 10) };
    }

    const updated = await db.updateProfile(currentProfile.id, updates);
    if (updated) {
      setCurrentProfile(updated);
      refreshProfiles();
    }
  };

  const handleSetTicker = (text: string) => {
    if (currentProfile && currentProfile.role !== 'Staff') {
      setBroadcastTicker(text);
      db.saveGlobalTicker(text);
    }
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

  // Unified Seat Click Optimistic Handler
  const handleSeatClick = async (roomId: string, seatId: string, userId: string, isLeave = false) => {
    // 1. Optimistic Update (instant UI feedback)
    setProfiles(prev => prev.map(p => {
      if (p.id === userId) {
        return { ...p, current_seat_id: isLeave ? null : seatId };
      }
      if (!isLeave && p.current_seat_id === seatId) {
        return { ...p, current_seat_id: null };
      }
      return p;
    }));
    
    if (currentProfile && currentProfile.id === userId) {
      setCurrentProfile(prev => prev ? { ...prev, current_seat_id: isLeave ? null : seatId } : null);
    }

    // 2. Perform DB update (background)
    try {
      let success = false;
      if (isLeave) {
        success = await db.leaveSeat(userId);
      } else {
        success = await db.claimSeat(roomId, seatId, userId);
      }

      // If the DB update failed (e.g. seat occupied by someone else), revert optimistic update
      if (!success) {
        console.warn("Seat claim/leave failed in database, reverting state...");
        refreshProfiles();
      }
    } catch (err) {
      console.error("Failed to update seat in DB, reverting...", err);
      refreshProfiles();
    }
  };

  // Claim or leave a header seat
  const handleHeaderSeatClick = (seatId: string, isLocked: boolean, occupant: Profile | null) => {
    if (isLocked) return;
    if (!currentProfile) return;
    playSelect();

    const isLeave = occupant ? occupant.id === currentProfile.id : false;
    handleSeatClick('header', seatId, currentProfile.id, isLeave);
  };

  // Toggle lock status (Director Only)
  const handleToggleLockHeaderSeat = async (seatId: string) => {
    if (!currentProfile || currentProfile.role !== 'Director') return;
    playClick();
    
    const wasLocked = lockedSeats.includes(seatId);
    let nextLocked: string[];
    if (wasLocked) {
      nextLocked = lockedSeats.filter(id => id !== seatId);
    } else {
      nextLocked = [...lockedSeats, seatId];
      const occupant = profiles.find(p => p.current_seat_id === seatId);
      if (occupant) {
        await db.leaveSeat(occupant.id);
      }
    }
    
    setLockedSeats(nextLocked);
    await db.saveLockedHeaderSeats(nextLocked);
    refreshProfiles();
  };

  return (
    <div className="flex flex-col min-h-screen bg-black">
      
      {/* Summon Announcement Banner Popup */}
      {summonNotification.show && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-white border-2 border-stone-300 text-stone-900 p-4 rounded shadow-2xl z-[9999] max-w-md w-[90vw] flex flex-col gap-2">
          <div className="flex justify-between items-center border-b border-stone-200 pb-1 font-sans">
            <span className="font-bold text-xs text-stone-700 tracking-wide">BROADCAST</span>
            <button onClick={() => setSummonNotification({ show: false, text: '' })} className="text-stone-400 hover:text-stone-700 font-bold text-xs">X</button>
          </div>
          <p className="text-xs font-bold leading-normal text-stone-850 font-sans">"{summonNotification.text}"</p>
        </div>
      )}
      
      {/* RPG HUD Header */}
      <header className="bg-[#1b1613] border-b-4 border-[#cca566] p-4 flex flex-col md:flex-row justify-between items-center gap-4 z-50">
        
        {/* Logo and Game Title */}
        <div className="flex items-center gap-3">
          <div className="border-2 border-[#ffd700] p-1.5 bg-[#d90429] shadow-md flex items-center justify-center">
            <Sword className="text-white" size={16} />
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

        {/* Header Seats (visible on all pages) */}
        {currentProfile && (
          <div className="flex items-center gap-2.5 bg-[#2b1f1a]/40 border-2 border-[#cca566]/30 px-3.5 py-1.5 rounded shadow-inner max-w-sm">
            {Array.from({ length: 5 }, (_, i) => {
              const seatId = `header_seat_${i + 1}`;
              const occupant = profiles.find(p => p.current_seat_id === seatId) || null;
              const isLocked = lockedSeats.includes(seatId);
              
              return (
                <div key={seatId} className="relative flex flex-col items-center group">
                  <div
                    onClick={() => handleHeaderSeatClick(seatId, isLocked, occupant)}
                    className={`w-9 h-9 rounded border flex items-center justify-center cursor-pointer transition-all relative ${
                      isLocked
                        ? 'border-red-950 bg-red-950/20 text-red-500 cursor-not-allowed'
                        : occupant
                        ? 'border-transparent bg-transparent'
                        : 'border-dashed border-[#cca566]/40 hover:border-amber-400 bg-black/25 hover:scale-105'
                    }`}
                    title={isLocked ? "Locked by Director" : occupant ? occupant.name : "Duduk di Header"}
                  >
                    {isLocked ? (
                      <span className="text-xs">🔒</span>
                    ) : occupant ? (
                      <div className="relative">
                        <SpriteRenderer
                          base={occupant.sprite_json.base}
                          hair={occupant.sprite_json.hair}
                          outfit={occupant.sprite_json.outfit}
                          accessory={occupant.sprite_json.accessory}
                          petId="none"
                          size={32}
                        />
                      </div>
                    ) : (
                      <span className="text-xs opacity-50 filter grayscale hover:grayscale-0">🪑</span>
                    )}
                  </div>

                  {currentProfile.role === 'Director' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleLockHeaderSeat(seatId);
                      }}
                      className={`absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full border text-[7px] font-bold flex items-center justify-center shadow z-10 hover:scale-110 cursor-pointer ${
                        isLocked
                          ? 'bg-red-600 border-red-400 text-white'
                          : 'bg-stone-700 border-stone-500 text-stone-300'
                      }`}
                      title={isLocked ? "Unlock Seat" : "Lock Seat"}
                    >
                      {isLocked ? "🔓" : "🔒"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Player Status HUD Panel & Large Global Timer */}
        {currentProfile ? (
          <div className="flex items-center gap-4 flex-wrap justify-end">
            {/* Global Timer (placed on the left of profile, large and prominent) */}
            <div className={`flex flex-col items-center justify-center px-4 py-1 border-2 shadow-lg font-mono rounded-lg min-w-[85px] ${
              globalTimerRunning && globalTimerDurationRef.current <= 60
                ? 'border-red-600 bg-red-950/80 text-red-400 animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.4)]'
                : globalTimerRunning && globalTimerDurationRef.current <= 300
                ? 'border-yellow-600 bg-yellow-950/70 text-yellow-300 shadow-[0_0_10px_rgba(202,138,4,0.3)]'
                : 'border-[#cca566]/40 bg-black/60 text-amber-400 shadow-inner'
            }`}>
              <span className="text-[7.5px] font-bold uppercase tracking-widest text-slate-400 select-none">TIMER RAPAT</span>
              <span className="text-xl font-bold font-mono tracking-wider leading-none mt-0.5">{globalTimerDisplay}</span>
              {!globalTimerRunning && globalTimerDisplay !== '00:00' && (
                <span className="text-[6px] text-slate-500 font-bold uppercase select-none leading-none mt-1">PAUSED</span>
              )}
            </div>

            {/* Profile HUD Card */}
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
                  <span className="font-bold text-xs" style={{ color: currentProfile.sprite_json.nameColor || '#fef08a' }}>
                    {currentProfile.name.split(' ')[0]}
                  </span>
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
                
                {/* Stats Row (Coins) */}
                <div className="flex items-center gap-2 mt-0.5">
                  {/* Coins display */}
                  <div className="flex items-center gap-0.5 bg-black/40 px-1.5 py-0.5 rounded border border-[#cca566]/20">
                    <span className="text-[10px] font-bold text-amber-400" title="Koin Anda">🪙 {currentProfile.coins ?? 0}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="text-red-400 hover:text-red-200 p-2 rounded bg-slate-950/80 border border-red-900 transition-colors ml-2 cursor-pointer"
                title="Leave House"
              >
                <LogOut size={14} />
              </button>
            </div>
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
                  if (seatId.startsWith('wilderness_')) return 'in Wilderness';
                  if (seatId.startsWith('header_')) return 'In Roof';
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
                        <span 
                          className="font-bold text-[11px] truncate block"
                          style={{ color: member.sprite_json.nameColor || (isCurrent ? '#86efac' : '#f1f5f9') }}
                        >
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
                { id: 'wilderness', name: 'Wilderness', icon: Swords },
                currentProfile.role !== 'Staff' ? { id: 'ledger', name: 'Ledger', icon: UserCheck } : null,
                { id: 'quest', name: 'Quest Board', icon: Star },
                currentProfile.role === 'Director' ? { id: 'asset_chamber', name: 'Asset Chamber', icon: Sparkles } : null,
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
                    onOpenInventory={() => setShowInventory(true)}
                  />
                )}
                {activeTab === 'guild_hall' && (
                  <GuildHall
                    currentProfile={currentProfile}
                    profiles={profiles}
                    onRefreshProfiles={refreshProfiles}
                    broadcastTicker={broadcastTicker}
                    onSetTicker={handleSetTicker}
                    onSeatClick={(seatId, isLeave) => handleSeatClick('guild_hall', seatId, currentProfile.id, isLeave)}
                  />
                )}
                 {activeTab === 'carriage' && (
                  <SubDivisionRooms
                    activeRoom="carriage"
                    currentProfile={currentProfile}
                    profiles={profiles}
                    onRefreshProfiles={refreshProfiles}
                    onSeatClick={(seatId, isLeave) => handleSeatClick('carriage', seatId, currentProfile.id, isLeave)}
                  />
                )}
                {activeTab === 'boat' && (
                  <SubDivisionRooms
                    activeRoom="boat"
                    currentProfile={currentProfile}
                    profiles={profiles}
                    onRefreshProfiles={refreshProfiles}
                    onSeatClick={(seatId, isLeave) => handleSeatClick('boat', seatId, currentProfile.id, isLeave)}
                  />
                )}
                {activeTab === 'tavern' && (
                  <Tavern
                    currentProfile={currentProfile}
                    profiles={profiles}
                    onRefreshProfiles={refreshProfiles}
                    onUpdateProfile={handleUpdateProfile}
                    onSeatClick={(seatId, isLeave) => handleSeatClick('tavern', seatId, currentProfile.id, isLeave)}
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
                {activeTab === 'wilderness' && (
                  <Wilderness
                    currentProfile={currentProfile}
                    profiles={profiles}
                    onUpdateProfile={handleUpdateProfile}
                    onSeatClick={(seatId, isLeave) => handleSeatClick('wilderness', seatId, currentProfile.id, isLeave)}
                  />
                )}
                {activeTab === 'asset_chamber' && currentProfile.role === 'Director' && (
                  <AssetManager
                    onAssetsUpdated={() => db.refreshAssetsCache()}
                  />
                )}
              </>
            )}
          </div>
        </main>

      </div>

      {/* Inventory Modal */}
      {showInventory && currentProfile && (
        <Inventory
          currentProfile={currentProfile}
          onClose={() => setShowInventory(false)}
          onUpdateProfile={handleUpdateProfile}
        />
      )}

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
                        if (seat.startsWith('wilderness_')) return 'in Wilderness';
                        if (seat.startsWith('header_')) return 'In Roof';
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
