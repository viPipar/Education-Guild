import React, { useState, useEffect, useRef } from 'react';
import type { Profile, Seat, ChecklistItem, RoomConfig, AgendaComment, TimerState } from '../lib/supabase';
import { db, isMock, supabase } from '../lib/supabase';
import { SpriteRenderer } from './SpriteRenderer';
import { Play, Pause, RotateCcw, ClipboardList, Plus, Check, X, Trash2, Clock, Info, Music, Calendar } from 'lucide-react';
import { playClick, playSelect } from '../lib/audio';
import { NoticeBoard } from './NoticeBoard';
import { RoomWorkspace } from './RoomWorkspace';

const ensureAbsoluteUrl = (url?: string): string => {
  if (!url) return '#';
  const trimmed = url.trim();
  if (/^[a-z]+:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

const getDaysArray = (vDate: Date) => {
  const firstDay = new Date(vDate.getFullYear(), vDate.getMonth(), 1);
  let startDayIdx = firstDay.getDay(); // 0 is Sunday, 1 is Monday...
  if (startDayIdx === 0) startDayIdx = 7;
  const padding = startDayIdx - 1; // padding slots before day 1

  const totalDays = new Date(vDate.getFullYear(), vDate.getMonth() + 1, 0).getDate();
  const days = [];
  for (let i = 0; i < padding; i++) {
    days.push(null);
  }
  for (let i = 1; i <= totalDays; i++) {
    days.push(new Date(vDate.getFullYear(), vDate.getMonth(), i));
  }
  return days;
};

const indonesianMonths = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const formatIndonesianDate = (d: Date) => {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return `${days[d.getDay()]}, ${d.getDate()} ${indonesianMonths[d.getMonth()]} ${d.getFullYear()}`;
};

const timeOptions: string[] = [];
for (let h = 0; h < 24; h++) {
  const hrStr = h.toString().padStart(2, '0');
  timeOptions.push(`${hrStr}:00`);
  timeOptions.push(`${hrStr}:30`);
}

interface GuildHallProps {
  currentProfile: Profile;
  profiles: Profile[];
  onRefreshProfiles: () => void;
  broadcastTicker: string;
  onSetTicker: (text: string) => void;
  onSeatClick?: (seatId: string, isLeave: boolean) => void;
  roomConfig?: RoomConfig;
  onUpdateRoomConfig?: (roomId: string, updates: Partial<RoomConfig>) => void;
  globalMusicUrl: string;
  globalMusicStatus: 'playing' | 'stopped';
  onUpdateMusic: (url: string, status: 'playing' | 'stopped') => void;
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
  globalMusicUrl,
  globalMusicStatus,
  onUpdateMusic,
}) => {
  const seats = React.useMemo(() => db.getSeatsSync('guild_hall', profiles), [profiles]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  
  // Agenda Comments State
  const [agendaComments, setAgendaComments] = useState<AgendaComment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');

  // Timer State — absolute endsAt system
  const DEFAULT_DURATION_MS = 15 * 60 * 1000; // 15 minutes in ms
  const timerStateRef = useRef<TimerState>({ endsAt: 0, running: false, pausedRemaining: DEFAULT_DURATION_MS, totalDuration: DEFAULT_DURATION_MS });
  const [timerDisplay, setTimerDisplay] = useState('15:00');
  const [timerRunning, setTimerRunning] = useState(false);
  const timerIntervalRef = useRef<any>(null);

  const formatMs = (ms: number): string => {
    const totalSecs = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const s = (totalSecs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const applyTimerState = (state: TimerState) => {
    timerStateRef.current = state;
    setTimerRunning(state.running);
    if (state.running && state.endsAt > 0) {
      setTimerDisplay(formatMs(Math.max(0, state.endsAt - Date.now())));
    } else {
      setTimerDisplay(formatMs(state.pausedRemaining));
    }
  };
  
  // Whiteboard & Scroll of Order Popup States
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showScrollOfOrder, setShowScrollOfOrder] = useState(false);
  const [summonText, setSummonText] = useState('Semua staf berkumpul di Round Table sekarang!');
  const [showTickerInput, setShowTickerInput] = useState(false);
  const [tempTicker, setTempTicker] = useState(broadcastTicker);

  // Google Calendar Integration States
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarTab, setCalendarTab] = useState<'view' | 'add'>('view');
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarSuccess, setCalendarSuccess] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  // Custom DateTime Picker States
  const [calendarTitle, setCalendarTitle] = useState('');
  const [calendarDescription, setCalendarDescription] = useState('');
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  
  // Google Forms-like time fields
  const [startHour, setStartHour] = useState('10');
  const [startMinute, setStartMinute] = useState('00');
  const [endHour, setEndHour] = useState('11');
  const [endMinute, setEndMinute] = useState('00');
  
  const [openPicker, setOpenPicker] = useState<'startDate' | 'endDate' | null>(null);
  const [viewDate, setViewDate] = useState<Date>(new Date());

  // Input refs for automatic keyboard focus routing
  const startMinRef = useRef<HTMLInputElement>(null);
  const endMinRef = useRef<HTMLInputElement>(null);

  // Set default rounded time on modal open
  useEffect(() => {
    if (showCalendarModal) {
      setCalendarTitle('');
      setCalendarDescription('');
      setCalendarSuccess(null);
      setCalendarError(null);
      setOpenPicker(null);
      
      const now = new Date();
      // Round minutes to nearest 30 mins
      const minutes = now.getMinutes();
      let roundedMinutes = 0;
      if (minutes > 0 && minutes <= 30) {
        roundedMinutes = 30;
      } else if (minutes > 30) {
        roundedMinutes = 0;
        now.setHours(now.getHours() + 1);
      }
      now.setMinutes(roundedMinutes);
      now.setSeconds(0);
      now.setMilliseconds(0);

      const startHr = now.getHours().toString().padStart(2, '0');
      const startMin = now.getMinutes().toString().padStart(2, '0');
      setStartHour(startHr);
      setStartMinute(startMin);
      setStartDate(new Date(now));
      setViewDate(new Date(now));

      // End time is start time + 1 hour
      const endNow = new Date(now.getTime() + 60 * 60 * 1000);
      const endHr = endNow.getHours().toString().padStart(2, '0');
      const endMin = endNow.getMinutes().toString().padStart(2, '0');
      setEndHour(endHr);
      setEndMinute(endMin);
      setEndDate(new Date(endNow));
    }
  }, [showCalendarModal]);

  const handleSubmitCalendar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCalendarLoading(true);
    setCalendarError(null);
    setCalendarSuccess(null);

    const formatDateStr = (d: Date) => {
      const year = d.getFullYear();
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const date = d.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${date}`;
    };

    const paddedStartHr = startHour.trim().padStart(2, '0');
    const paddedStartMin = startMinute.trim().padStart(2, '0');
    const paddedEndHr = endHour.trim().padStart(2, '0');
    const paddedEndMin = endMinute.trim().padStart(2, '0');

    // Validation: 00:00 <= time <= 23:59
    const startHrNum = Number(paddedStartHr);
    const startMinNum = Number(paddedStartMin);
    const endHrNum = Number(paddedEndHr);
    const endMinNum = Number(paddedEndMin);

    if (
      startHour.trim() === '' || startMinute.trim() === '' ||
      endHour.trim() === '' || endMinute.trim() === '' ||
      isNaN(startHrNum) || startHrNum < 0 || startHrNum > 23 ||
      isNaN(startMinNum) || startMinNum < 0 || startMinNum > 59 ||
      isNaN(endHrNum) || endHrNum < 0 || endHrNum > 23 ||
      isNaN(endMinNum) || endMinNum < 0 || endMinNum > 59
    ) {
      setCalendarError("Format waktu tidak valid! Gunakan angka 00-23 untuk jam dan 00-59 untuk menit.");
      setCalendarLoading(false);
      return;
    }

    const startTimeCombined = `${formatDateStr(startDate)}T${paddedStartHr}:${paddedStartMin}`;
    const endTimeCombined = `${formatDateStr(endDate)}T${paddedEndHr}:${paddedEndMin}`;

    const payload = {
      title: calendarTitle.trim(),
      startTime: startTimeCombined,
      endTime: endTimeCombined,
      description: calendarDescription.trim()
    };

    if (!payload.title) {
      setCalendarError("Semua kolom bertanda * wajib diisi!");
      setCalendarLoading(false);
      return;
    }

    const start = new Date(payload.startTime);
    const end = new Date(payload.endTime);
    if (end <= start) {
      setCalendarError("Waktu selesai harus setelah waktu mulai!");
      setCalendarLoading(false);
      return;
    }

    // fallback simulation for local testing when mock mode is active
    if (isMock) {
      console.log("Mock Mode Active: Simulating calendar insert with payload:", payload);
      setTimeout(() => {
        const existing = JSON.parse(localStorage.getItem('mock_calendar_events') || '[]');
        const mockEvent = {
          id: 'mock_' + Date.now(),
          ...payload,
          htmlLink: 'https://calendar.google.com'
        };
        localStorage.setItem('mock_calendar_events', JSON.stringify([...existing, mockEvent]));

        setCalendarSuccess("Rapat berhasil dijadwalkan! (Simulasi Offline/Local)");
        setCalendarTitle('');
        setCalendarDescription('');
        setCalendarLoading(false);
      }, 1000);
      return;
    }

    try {
      const { data, error } = await supabase!.functions.invoke('add-calendar-event', {
        body: payload
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setCalendarSuccess("Jadwal rapat berhasil ditambahkan ke Google Calendar!");
      setCalendarTitle('');
      setCalendarDescription('');
    } catch (err: any) {
      console.error("Gagal menambahkan ke Google Calendar:", err);
      let errorMsg = err.message || "Gagal menyambungkan ke Google Calendar.";
      
      // Try to parse detailed error payload from Supabase FunctionsHttpError
      if (err.context && typeof err.context.json === 'function') {
        try {
          const body = await err.context.json();
          if (body && body.error) {
            errorMsg = body.error;
          } else if (body && typeof body === 'object') {
            errorMsg = JSON.stringify(body);
          }
        } catch (_) {
          try {
            const text = await err.context.text();
            if (text) errorMsg = text;
          } catch (__) {}
        }
      }
      
      setCalendarError(errorMsg);
    } finally {
      setCalendarLoading(false);
    }
  };


  // Local Discord URL State
  const [localDiscordUrl, setLocalDiscordUrl] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);

  // Music Player Config Popup State
  const [showMusicModal, setShowMusicModal] = useState(false);
  const [inputMusicUrl, setInputMusicUrl] = useState(globalMusicUrl);

  useEffect(() => {
    setInputMusicUrl(globalMusicUrl);
  }, [globalMusicUrl]);

  useEffect(() => {
    if (roomConfig?.discord_url !== undefined && !isInputFocused) {
      setLocalDiscordUrl(roomConfig.discord_url);
    }
  }, [roomConfig?.discord_url]);

  useEffect(() => {
    setTempTicker(broadcastTicker);
  }, [broadcastTicker]);
  
  // Chat Bubble State
  const [chatMessage, setChatMessage] = useState('');
  const [activeBubbles, setActiveBubbles] = useState<{ [userId: string]: { text: string, timerId: any } }>({});

  // Fetch checklist and agenda comments, subscribe to realtime
  const loadRoomData = async () => {
    const c = await db.getChecklist('guild_hall');
    setChecklist(c);
    const comments = await db.getAgendaComments('guild_hall');
    setAgendaComments(comments);
    // Load timer state from DB
    const ts = await db.getTimerState();
    if (ts) applyTimerState(ts);
  };

  useEffect(() => {
    loadRoomData();

    // Listen to real-time broadcasts
    const unsubscribe = db.subscribe((msg) => {
      if (msg.type === 'checklist_update' && msg.payload.roomId === 'guild_hall') {
        db.getChecklist('guild_hall').then(setChecklist);
      } else if (msg.type === 'chat_bubble') {
        triggerBubble(msg.payload.userId, msg.payload.text);
      } else if (msg.type === 'timer_sync_v2') {
        applyTimerState(msg.payload as TimerState);
      } else if (msg.type === 'agenda_comment_add' && msg.payload.roomId === 'guild_hall') {
        setAgendaComments(prev => [...prev, msg.payload.comment]);
      } else if (msg.type === 'agenda_comments_clear' && msg.payload.roomId === 'guild_hall') {
        setAgendaComments([]);
      }
    });

    return () => {
      unsubscribe();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  const autoSeatRef = useRef(false);
  useEffect(() => {
    if (profiles.length > 0 && !autoSeatRef.current && currentProfile) {
      autoSeatRef.current = true;
      const myProfile = profiles.find(p => p.id === currentProfile.id);
      const currentSeat = myProfile?.current_seat_id;
      const isSeatedInThisRoom = currentSeat && currentSeat.startsWith('guild_hall');
      
      if (!isSeatedInThisRoom) {
        const chairs = seats.filter(s => !s.id.includes('notice') && !s.id.includes('scroll') && !s.id.includes('calendar'));
        const availableChairs = chairs.filter(s => !s.user_id);
        
        if (availableChairs.length > 0) {
          const randomSeat = availableChairs[Math.floor(Math.random() * availableChairs.length)];
          if (onSeatClick) {
            onSeatClick(randomSeat.id, false);
          } else {
            db.claimSeat('guild_hall', randomSeat.id, currentProfile.id).then(() => {
              onRefreshProfiles();
            });
          }
        } else {
          const overflowSeatId = `guild_hall_overflow_${currentProfile.id}`;
          if (onSeatClick) {
            onSeatClick(overflowSeatId, false);
          } else {
            db.claimSeat('guild_hall', overflowSeatId, currentProfile.id).then(() => {
              onRefreshProfiles();
            });
          }
        }
      }
    }
  }, [profiles, currentProfile]);

  // Timer tick — recalculate from absolute endsAt every 500ms
  useEffect(() => {
    clearInterval(timerIntervalRef.current);
    if (!timerRunning) return;
    timerIntervalRef.current = setInterval(() => {
      const state = timerStateRef.current;
      if (!state.running || state.endsAt <= 0) {
        clearInterval(timerIntervalRef.current);
        setTimerRunning(false);
        return;
      }
      const remaining = state.endsAt - Date.now();
      if (remaining <= 0) {
        setTimerDisplay('00:00');
        setTimerRunning(false);
        clearInterval(timerIntervalRef.current);
        timerStateRef.current = { ...state, running: false, endsAt: 0, pausedRemaining: 0 };
      } else {
        setTimerDisplay(formatMs(remaining));
      }
    }, 500);
    return () => clearInterval(timerIntervalRef.current);
  }, [timerRunning]);

  // Timer Controls — Director broadcasts absolute endsAt to all clients
  const handleStartTimer = () => {
    playClick();
    const state = timerStateRef.current;
    const remaining = state.pausedRemaining > 0 ? state.pausedRemaining : state.totalDuration;
    const newState: TimerState = {
      endsAt: Date.now() + remaining,
      running: true,
      pausedRemaining: 0,
      totalDuration: state.totalDuration
    };
    applyTimerState(newState);
    db.saveTimerState(newState);
  };

  const handlePauseTimer = () => {
    playClick();
    const state = timerStateRef.current;
    const remaining = Math.max(0, state.endsAt - Date.now());
    const newState: TimerState = {
      endsAt: 0,
      running: false,
      pausedRemaining: remaining,
      totalDuration: state.totalDuration
    };
    applyTimerState(newState);
    db.saveTimerState(newState);
  };

  const handleResetTimer = () => {
    playClick();
    const newState: TimerState = {
      endsAt: 0,
      running: false,
      pausedRemaining: DEFAULT_DURATION_MS,
      totalDuration: DEFAULT_DURATION_MS
    };
    applyTimerState(newState);
    db.saveTimerState(newState);
  };

  // Timer color class for display
  const getTimerColorClass = () => {
    if (!timerRunning) return 'timer-green';
    const remaining = timerStateRef.current.endsAt > 0 ? timerStateRef.current.endsAt - Date.now() : timerStateRef.current.pausedRemaining;
    if (remaining <= 60000) return 'timer-red';
    if (remaining <= 300000) return 'timer-yellow';
    return 'timer-green';
  };

  // Agenda Comments Handlers
  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    playClick();
    await db.addAgendaComment('guild_hall', newCommentText.trim(), currentProfile.id, currentProfile.name);
    setNewCommentText('');
  };

  const handleClearComments = async () => {
    if (!window.confirm('Hapus semua komentar agenda ini?')) return;
    playClick();
    await db.clearAgendaComments('guild_hall');
  };

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

      {currentProfile.role !== 'Staff' && (
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-950/90 border-2 border-[#cca566]/40 rounded-lg shadow-xl shadow-black/50">
          <div className="flex items-center gap-3">
            <span className="text-amber-500 font-extrabold text-sm uppercase tracking-wider rpg-font-retro">
              Round Table Config
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
                    onUpdateRoomConfig('guild_hall', { discord_url: localDiscordUrl });
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

      {/* Guild Hall HUD Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-slate-950/85 border border-[#cca566]/30 rounded">
        <div className="flex items-center gap-3">
          <span className="text-yellow-500 font-bold text-xs uppercase tracking-wide rpg-font-retro">
            ROUND TABLE GUILD HALL
          </span>
        </div>
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
            
            {/* NOTICE BOARD (Figma Notice Board overlay over background) */}
            <div
              onClick={() => {
                setShowWhiteboard(true);
                handleSeatClick({ id: 'guild_hall_seat_notice', room_id: 'guild_hall', user_id: null, x: 0, y: 0 });
              }}
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
              onClick={() => {
                setShowScrollOfOrder(true);
                handleSeatClick({ id: 'guild_hall_seat_scroll', room_id: 'guild_hall', user_id: null, x: 0, y: 0 });
              }}
              style={{ left: '52.73%', top: '4.28%', width: '11.72%', height: '12.5%' }}
              className="absolute cursor-pointer border-2 border-transparent hover:border-amber-400 hover:bg-amber-400/10 transition-all rounded z-10 group"
              title="Scroll of Order"
            >
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-950/90 text-[8px] text-amber-400 border border-amber-500/50 px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none font-bold">
                SCROLL OF ORDER (AGENDA: {checklist.length})
              </div>
            </div>

             {/* CALENDAR BOARD (Google Calendar Integration trigger) */}
             <div
               onClick={() => {
                 playSelect();
                 setCalendarTab('view');
                 setShowCalendarModal(true);
                 handleSeatClick({ id: 'guild_hall_seat_calendar', room_id: 'guild_hall', user_id: null, x: 0, y: 0 });
               }}
               style={{ left: '36.5%', top: '4.28%', width: '11.72%', height: '12.5%' }}
               className="absolute cursor-pointer border-2 border-transparent hover:border-amber-400 hover:bg-amber-400/10 transition-all rounded z-10 group"
               title="Calendar Board"
             >
               <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-950/90 text-[8px] text-amber-400 border border-amber-500/50 px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none font-bold">
                 CALENDAR BOARD (KLIK)
               </div>
             </div>

            {/* ROUND TABLE STATUS PLAQUE */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 bg-slate-950/85 border border-amber-600/30 px-3 py-1 rounded-full flex items-center gap-2 text-[10px] text-yellow-100 font-bold shadow-lg">
              <span className="text-amber-500 font-serif">ROUND TABLE</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              <span>{profiles.filter(p => p.current_seat_id?.startsWith('guild_hall_')).length} / 20 Duduk</span>
            </div>

            {/* CHANDELIER (Music Player trigger in center of table) */}
            <div
              onClick={() => {
                if (currentProfile.role !== 'Staff') {
                  playClick();
                  setShowMusicModal(true);
                } else {
                  playSelect();
                  alert("Hanya Direktur & Manajer yang dapat mengatur musik rapat.");
                }
              }}
              style={{ left: '50.5%', top: '56.5%', width: '12%', height: '15%', transform: 'translate(-50%, -50%)' }}
              className="absolute cursor-pointer border-2 border-transparent hover:border-yellow-400 hover:bg-yellow-400/10 hover:shadow-[0_0_20px_rgba(253,224,71,0.5)] transition-all rounded-full z-20 group flex items-center justify-center animate-[pulse_3.5s_infinite]"
              title="Setel Musik Rapat (Chandelier)"
            >
              <div className="flex flex-col items-center justify-center">
                {/* Glowing chandelier orb */}
                <div className="w-8 h-8 rounded-full bg-yellow-500/30 border-2 border-yellow-400 flex items-center justify-center shadow-[0_0_15px_rgba(234,179,8,0.6)] group-hover:scale-105 transition-transform">
                  <Music className="text-yellow-400 animate-pulse" size={14} />
                </div>
                <span className="text-[5.5px] text-yellow-300 font-extrabold rpg-font-retro uppercase tracking-tighter mt-1 bg-slate-950/90 px-1 py-0.2 rounded border border-yellow-600/40 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                  SETEL MUSIK (CHANDELIER)
                </span>
              </div>
            </div>

            {/* SEATS AND USERS RENDERING */}
            {seats.map((seat) => {
              const occupant = profiles.find(p => p.id === seat.user_id);
              if (!occupant && (seat.id.includes('notice') || seat.id.includes('scroll') || seat.id.includes('calendar'))) {
                return null;
              }
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
                          cosmeticId={occupant.sprite_json.cosmetic_id}
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

            {/* Overflow Characters Container (Bottom Right) */}
            <div className="absolute bottom-14 right-4 z-40 flex flex-col items-end gap-1 pointer-events-auto">
              {profiles.filter(p => p.current_seat_id === `guild_hall_overflow_${p.id}`).length > 0 && (
                <div className="bg-slate-950/85 border-2 border-[#cca566]/40 p-2 rounded-xl flex flex-wrap gap-2 max-w-[180px] justify-end shadow-xl shadow-black/80">
                  <span className="text-[6.5px] text-red-405 font-extrabold uppercase tracking-widest block w-full text-right select-none font-mono">
                    OVERFLOW (KURSI PENUH)
                  </span>
                  {profiles.filter(p => p.current_seat_id === `guild_hall_overflow_${p.id}`).map(occupant => (
                    <div key={occupant.id} className="relative flex flex-col items-center group cursor-pointer">
                      <div className="w-10 h-10 flex items-center justify-center relative hover:scale-110 transition-transform">
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
                          size={44}
                        />
                        {occupant.id === currentProfile.id && (
                          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-green-500 rounded-full border border-white animate-bounce z-50"></div>
                        )}
                      </div>
                      
                      {/* Name tag on hover */}
                      <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center bg-slate-950/95 border border-[#5c3a21]/50 px-2 py-0.5 rounded text-[8px] font-bold max-w-[100px] text-center shadow-lg pointer-events-none z-50">
                        <span style={{ color: occupant.sprite_json.nameColor || '#fef08a' }}>
                          {occupant.name.split(' ')[0]}
                        </span>
                        <span className="block text-[6px] text-slate-400 mt-0.5 leading-none">{occupant.current_status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

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

            {/* ─── AGENDA COMMENTS SECTION ─── */}
            <div className="border-t-2 border-stone-400/30 mt-4 pt-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-stone-800 font-bold text-xs flex items-center gap-1.5">
                  💬 Diskusi Agenda
                  <span className="text-[9px] text-stone-500 font-semibold">({agendaComments.length})</span>
                </h4>
                {currentProfile.role === 'Director' && agendaComments.length > 0 && (
                  <button
                    onClick={handleClearComments}
                    className="text-[8px] text-red-600 hover:text-red-800 font-bold border border-red-300 hover:border-red-500 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                    title="Clear All Comments (Director Only)"
                  >
                    🗑 Clear
                  </button>
                )}
              </div>
              {/* Comments List */}
              <div className="max-h-[180px] overflow-y-auto space-y-1.5 pr-1 mb-2">
                {agendaComments.length === 0 ? (
                  <p className="text-[10px] text-stone-400 italic text-center py-3">Belum ada diskusi...</p>
                ) : (
                  agendaComments.map(c => (
                    <div key={c.id} className="flex items-start gap-1.5 bg-white/60 rounded px-2 py-1.5 border border-stone-300/50">
                      <div className="flex-1 min-w-0">
                        <span className="text-[8px] font-bold text-amber-800">{c.author_name}</span>
                        <span className="text-[7px] text-stone-400 ml-1">
                          {new Date(c.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <p className="text-[10px] text-stone-800 font-semibold mt-0.5 break-words leading-snug">{c.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {/* Comment Input */}
              <form onSubmit={handleSendComment} className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Tulis komentar/diskusi..."
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  maxLength={200}
                  className="flex-1 bg-white text-stone-900 px-2 py-1 rounded border border-stone-300 text-[10px] font-semibold focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  disabled={!newCommentText.trim()}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-[9px] font-bold px-2.5 py-1 rounded border border-amber-400 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  KIRIM
                </button>
              </form>
            </div>
            
          </div>
        </div>
      )}

      {/* GOOGLE CALENDAR MODAL */}
      {showCalendarModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[2000] p-4 animate-fade-in">
          {openPicker && (
            <div 
              className="fixed inset-0 z-[2050] bg-transparent" 
              onClick={() => setOpenPicker(null)}
            />
          )}
          <div 
            className={`rpg-panel-stone transition-all duration-300 w-full p-6 border-4 border-[#cca566] flex flex-col relative ${
              calendarTab === 'view' ? 'max-w-4xl h-[80vh]' : 'max-w-xl'
            }`} 
            style={{ animation: 'fadeIn 0.15s ease-out' }}
          >
            <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-4 flex-shrink-0">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { playClick(); setCalendarTab('view'); }}
                  className={`px-3 py-1.5 text-[9px] font-bold rpg-font-retro border-2 rounded transition-all cursor-pointer flex items-center gap-1.5 ${
                    calendarTab === 'view'
                      ? 'border-amber-500 bg-slate-900 text-amber-400'
                      : 'border-stone-700 bg-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Calendar size={11} /> LIHAT KALENDER
                </button>
                <button
                  type="button"
                  onClick={() => { playClick(); setCalendarTab('add'); }}
                  className={`px-3 py-1.5 text-[9px] font-bold rpg-font-retro border-2 rounded transition-all cursor-pointer flex items-center gap-1.5 ${
                    calendarTab === 'add'
                      ? 'border-amber-500 bg-slate-900 text-amber-400'
                      : 'border-stone-700 bg-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Plus size={11} /> TAMBAH RAPAT
                </button>
              </div>
              <button onClick={() => { playClick(); setShowCalendarModal(false); }} className="text-slate-400 hover:text-white p-1 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            {/* TAB 1: LIHAT KALENDER (Iframe kept mounted permanently to prevent reloading) */}
            <div className={`flex-1 w-full h-full min-h-[300px] ${calendarTab === 'view' ? '' : 'hidden'}`}>
              <div className="w-full bg-slate-950/80 rounded border border-amber-600/30 p-1 relative h-full min-h-[300px] overflow-hidden">
                <iframe
                  src={`https://calendar.google.com/calendar/embed?src=${encodeURIComponent(import.meta.env.VITE_GOOGLE_CALENDAR_ID || 'educatieeeon.sbipb@gmail.com')}&ctz=Asia%2FJakarta&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=1&showCalendars=0&showTld=0`}
                  style={{ border: 0 }}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  className="rounded bg-zinc-900 h-full"
                ></iframe>
              </div>
            </div>

            {/* TAB 2: TAMBAH RAPAT (Google Forms-like numeric inputs for Hour:Minute) */}
            {(() => {
              const daysArray = getDaysArray(viewDate);
              return (
                <form 
                  onSubmit={handleSubmitCalendar} 
                  className={`space-y-5 text-xs font-semibold text-stone-300 overflow-y-visible flex-1 pr-1 ${
                    calendarTab === 'add' ? '' : 'hidden'
                  }`}
                >
                  
                  {/* Google Calendar-like Title Input */}
                  <div className="flex items-center gap-3">
                    <div className="w-5" />
                    <input
                      type="text"
                      required
                      value={calendarTitle}
                      onChange={(e) => setCalendarTitle(e.target.value)}
                      placeholder="Tambahkan judul"
                      className="flex-1 bg-transparent text-yellow-100 text-lg font-bold border-b border-stone-850 focus:outline-none focus:border-amber-500 placeholder:text-stone-600 py-1"
                    />
                  </div>

                  {/* Date & Time Selectors Row */}
                  <div className="flex items-start gap-3 relative z-50">
                    <Clock size={14} className="text-[#cca566] mt-2 flex-shrink-0" />
                    <div className="flex flex-wrap items-center gap-3 text-stone-300 w-full">
                      
                      {/* Start Date Picker */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenPicker(openPicker === 'startDate' ? null : 'startDate')}
                          className="bg-[#16110e] text-yellow-100 border border-amber-600/40 rounded px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-900 transition-colors cursor-pointer"
                        >
                          {formatIndonesianDate(startDate)}
                        </button>
                        
                        {openPicker === 'startDate' && (
                          <div className="absolute top-full left-0 mt-1 bg-slate-950 border-2 border-[#cca566] rounded-lg shadow-2xl p-3 z-[2100] w-64 text-yellow-100">
                            <div className="flex justify-between items-center mb-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
                                }}
                                className="p-1 hover:bg-slate-800 rounded text-amber-500 font-bold"
                              >
                                &lt;
                              </button>
                              <span className="text-xs font-bold text-amber-400 font-mono">
                                {indonesianMonths[viewDate.getMonth()]} {viewDate.getFullYear()}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
                                }}
                                className="p-1 hover:bg-slate-800 rounded text-amber-500 font-bold"
                              >
                                &gt;
                              </button>
                            </div>
                            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-stone-400 font-bold mb-1">
                              <div>Sen</div><div>Sel</div><div>Rab</div><div>Kam</div><div>Jum</div><div>Sab</div><div>Min</div>
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                              {daysArray.map((day, idx) => {
                                if (!day) return <div key={`pad-${idx}`} className="w-7 h-7" />;
                                const isSelected = startDate.getDate() === day.getDate() &&
                                                   startDate.getMonth() === day.getMonth() &&
                                                   startDate.getFullYear() === day.getFullYear();
                                const isToday = new Date().getDate() === day.getDate() &&
                                                new Date().getMonth() === day.getMonth() &&
                                                new Date().getFullYear() === day.getFullYear();
                                return (
                                  <button
                                    key={day.getTime()}
                                    type="button"
                                    onClick={() => {
                                      setStartDate(day);
                                      if (endDate < day) {
                                        setEndDate(day);
                                      }
                                      setOpenPicker(null);
                                    }}
                                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all cursor-pointer ${
                                      isSelected
                                        ? 'bg-amber-600 text-stone-950 font-extrabold shadow-md'
                                        : isToday
                                          ? 'border border-amber-500 text-amber-500'
                                          : 'text-stone-300 hover:bg-slate-800'
                                    }`}
                                  >
                                    {day.getDate()}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Start Time (Google Forms Style) */}
                      <div className="flex items-center gap-1 bg-[#16110e] border border-amber-600/40 rounded px-2.5 py-1">
                        <input
                          type="text"
                          placeholder="HH"
                          maxLength={2}
                          value={startHour}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            if (val === '' || (Number(val) >= 0 && Number(val) <= 23)) {
                              setStartHour(val);
                              if (val.length === 2 && Number(val) <= 23) {
                                startMinRef.current?.focus();
                              }
                            }
                          }}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val) setStartHour(val.padStart(2, '0'));
                          }}
                          className="bg-transparent text-yellow-100 text-center w-6 focus:outline-none text-xs font-mono font-bold"
                        />
                        <span className="text-[#cca566] font-bold font-mono">:</span>
                        <input
                          ref={startMinRef}
                          type="text"
                          placeholder="MM"
                          maxLength={2}
                          value={startMinute}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            if (val === '' || (Number(val) >= 0 && Number(val) <= 59)) {
                              setStartMinute(val);
                            }
                          }}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val) setStartMinute(val.padStart(2, '0'));
                          }}
                          className="bg-transparent text-yellow-100 text-center w-6 focus:outline-none text-xs font-mono font-bold"
                        />
                      </div>

                      <span className="text-stone-500 font-bold text-xs px-1 self-center">hingga</span>

                      {/* End Time (Google Forms Style) */}
                      <div className="flex items-center gap-1 bg-[#16110e] border border-amber-600/40 rounded px-2.5 py-1">
                        <input
                          type="text"
                          placeholder="HH"
                          maxLength={2}
                          value={endHour}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            if (val === '' || (Number(val) >= 0 && Number(val) <= 23)) {
                              setEndHour(val);
                              if (val.length === 2 && Number(val) <= 23) {
                                endMinRef.current?.focus();
                              }
                            }
                          }}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val) setEndHour(val.padStart(2, '0'));
                          }}
                          className="bg-transparent text-yellow-100 text-center w-6 focus:outline-none text-xs font-mono font-bold"
                        />
                        <span className="text-[#cca566] font-bold font-mono">:</span>
                        <input
                          ref={endMinRef}
                          type="text"
                          placeholder="MM"
                          maxLength={2}
                          value={endMinute}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            if (val === '' || (Number(val) >= 0 && Number(val) <= 59)) {
                              setEndMinute(val);
                            }
                          }}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val) setEndMinute(val.padStart(2, '0'));
                          }}
                          className="bg-transparent text-yellow-100 text-center w-6 focus:outline-none text-xs font-mono font-bold"
                        />
                      </div>

                      {/* End Date Picker */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenPicker(openPicker === 'endDate' ? null : 'endDate')}
                          className="bg-[#16110e] text-yellow-100 border border-amber-600/40 rounded px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-900 transition-colors cursor-pointer"
                        >
                          {formatIndonesianDate(endDate)}
                        </button>
                        
                        {openPicker === 'endDate' && (
                          <div className="absolute top-full left-0 mt-1 bg-slate-950 border-2 border-[#cca566] rounded-lg shadow-2xl p-3 z-[2100] w-64 text-yellow-100">
                            <div className="flex justify-between items-center mb-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
                                }}
                                className="p-1 hover:bg-slate-800 rounded text-amber-500 font-bold"
                              >
                                &lt;
                              </button>
                              <span className="text-xs font-bold text-amber-400 font-mono">
                                {indonesianMonths[viewDate.getMonth()]} {viewDate.getFullYear()}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
                                }}
                                className="p-1 hover:bg-slate-800 rounded text-amber-500 font-bold"
                              >
                                &gt;
                              </button>
                            </div>
                            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-stone-400 font-bold mb-1">
                              <div>Sen</div><div>Sel</div><div>Rab</div><div>Kam</div><div>Jum</div><div>Sab</div><div>Min</div>
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                              {daysArray.map((day, idx) => {
                                if (!day) return <div key={`pad-end-${idx}`} className="w-7 h-7" />;
                                const isSelected = endDate.getDate() === day.getDate() &&
                                                   endDate.getMonth() === day.getMonth() &&
                                                   endDate.getFullYear() === day.getFullYear();
                                const isToday = new Date().getDate() === day.getDate() &&
                                                new Date().getMonth() === day.getMonth() &&
                                                new Date().getFullYear() === day.getFullYear();
                                return (
                                  <button
                                    key={day.getTime()}
                                    type="button"
                                    onClick={() => {
                                      setEndDate(day);
                                      setOpenPicker(null);
                                    }}
                                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all cursor-pointer ${
                                      isSelected
                                        ? 'bg-amber-600 text-stone-950 font-extrabold shadow-md'
                                        : isToday
                                          ? 'border border-amber-500 text-amber-500'
                                          : 'text-stone-300 hover:bg-slate-800'
                                    }`}
                                  >
                                    {day.getDate()}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                  {/* Agenda/Description textarea */}
                  <div className="flex items-start gap-3 relative z-10">
                    <Info size={14} className="text-[#cca566] mt-2 flex-shrink-0" />
                    <textarea
                      value={calendarDescription}
                      onChange={(e) => setCalendarDescription(e.target.value)}
                      placeholder="Tambahkan deskripsi atau detail rapat..."
                      rows={3}
                      className="bg-[#16110e] text-yellow-100 border border-amber-600/40 rounded p-2 text-xs font-semibold focus:outline-none focus:border-amber-500 placeholder:text-stone-600 w-full resize-none"
                    />
                  </div>

                  {calendarError && (
                    <p className="text-[10px] text-red-500 font-bold bg-red-950/20 border border-red-900/30 p-2 rounded text-left">
                      [!] {calendarError}
                    </p>
                  )}

                  {calendarSuccess && (
                    <p className="text-[10px] text-green-400 font-bold bg-green-950/20 border border-green-900/30 p-2 rounded text-left animate-pulse">
                      [OK] {calendarSuccess}
                    </p>
                  )}

                  <div className="flex justify-end gap-2.5 pt-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => { playClick(); setShowCalendarModal(false); }}
                      className="px-4 py-2 bg-stone-850 hover:bg-stone-800 text-stone-200 text-xs font-bold rounded transition-all cursor-pointer"
                    >
                      BATAL
                    </button>
                    <button
                      type="submit"
                      disabled={calendarLoading}
                      className="px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-stone-950 font-black text-xs rounded transition-all active:scale-95 shadow-md shadow-amber-900/30 cursor-pointer flex items-center gap-1.5 font-mono"
                    >
                      {calendarLoading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-1 h-3.5 w-3.5 text-stone-950" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          SAVING...
                        </>
                      ) : 'KIRIM JADWAL'}
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}



      {/* MUSIC PLAYER CONFIG MODAL */}
      {showMusicModal && currentProfile.role !== 'Staff' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[2000] p-4 animate-fade-in">
          <div className="rpg-panel-stone max-w-sm w-full p-5 border-4 border-[#cca566]" style={{ animation: 'fadeIn 0.15s ease-out' }}>
            
            <div className="flex justify-between items-center border-b border-stone-750 pb-2 mb-4">
              <h3 className="font-bold text-amber-500 text-xs rpg-font-retro flex items-center gap-1.5">
                <Music size={14} className="text-yellow-400 animate-pulse" /> SETEL MUSIK RAPAT
              </h3>
              <button onClick={() => { playClick(); setShowMusicModal(false); }} className="text-slate-400 hover:text-white p-1"><X size={16} /></button>
            </div>

            <p className="text-[9.5px] text-slate-400 leading-normal mb-4 font-semibold">
              Masukkan link YouTube untuk memutar audio musik rapat secara global untuk seluruh anggota di dalam guild.
            </p>

            <div className="space-y-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[8.5px] text-[#cca566] font-bold uppercase tracking-wider text-left">Link YouTube:</label>
                <input
                  type="text"
                  value={inputMusicUrl}
                  onChange={(e) => setInputMusicUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="bg-black/80 text-yellow-100 border border-amber-600/40 rounded px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:border-amber-500 placeholder:text-stone-600"
                />
              </div>

              {/* Status display */}
              <div className="bg-slate-900/60 border border-stone-850 rounded p-2 text-stone-300 text-left">
                <span className="text-[8px] text-slate-500 block uppercase tracking-wider leading-none">Status Musik Saat Ini:</span>
                <div className="flex items-center gap-1.5 mt-1 font-mono">
                  <span className={`w-2 h-2 rounded-full ${globalMusicStatus === 'playing' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                  <span className="text-[10px] font-bold">
                    {globalMusicStatus === 'playing' ? 'Sedang Memutar 🟢' : 'Berhenti 🔴'}
                  </span>
                </div>
                {globalMusicUrl && (
                  <span className="text-[7.5px] text-slate-400 truncate block mt-1.5">
                    Link: {globalMusicUrl}
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 mt-4">
                <button
                  onClick={() => {
                    playClick();
                    if (inputMusicUrl.trim()) {
                      onUpdateMusic(inputMusicUrl.trim(), 'playing');
                    } else {
                      alert("Silakan masukkan link YouTube terlebih dahulu.");
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-stone-950 font-black text-xs rounded transition-all active:scale-95 shadow-md shadow-amber-900/30 cursor-pointer text-center font-mono"
                >
                  PLAY (SETEL)
                </button>
                
                <button
                  onClick={() => {
                    playClick();
                    onUpdateMusic(globalMusicUrl, 'stopped');
                  }}
                  disabled={globalMusicStatus !== 'playing'}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 text-white font-black text-xs rounded transition-all active:scale-95 shadow-md shadow-red-900/30 cursor-pointer text-center font-mono"
                >
                  STOP
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Drive Workspace — below all room content */}
      <RoomWorkspace
        driveFolderId={import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID || ''}
        roomLabel="Round Table"
        roomId="guild_hall"
        currentProfile={currentProfile}
      />

    </div>
  );
};
