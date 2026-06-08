import { createClient } from '@supabase/supabase-js';

// Detect Supabase config and sanitize URL
let rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
if (rawUrl.endsWith('/rest/v1/')) {
  rawUrl = rawUrl.substring(0, rawUrl.length - 9);
} else if (rawUrl.endsWith('/rest/v1')) {
  rawUrl = rawUrl.substring(0, rawUrl.length - 8);
}
if (rawUrl.endsWith('/')) {
  rawUrl = rawUrl.substring(0, rawUrl.length - 1);
}
const supabaseUrl = rawUrl;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isMock = !supabaseUrl || !supabaseAnonKey;

export const supabase = !isMock ? createClient(supabaseUrl, supabaseAnonKey) : null;

// ==========================================
// TYPES
// ==========================================
export interface Profile {
  id: string;
  name: string;
  role: 'Director' | 'Manager' | 'Staff';
  sub_div_id: 'Academic & Publication' | 'Project & Competition' | 'All';
  level: number;
  coins: number;
  sprite_json: {
    base: string;
    hair: string;
    outfit: string;
    accessory: string;
    nameColor?: string;
    cosmetic_id?: string;
  };
  pet_id: string;
  current_status: string;
  current_seat_id: string | null;
  last_seen: string;
}

export interface Seat {
  id: string;
  room_id: string;
  user_id: string | null;
  x: number;
  y: number;
}

export interface RoomConfig {
  room_id: string;
  weather_intensity: number;
  discord_url: string;
  weather_filter?: number; // 0: Cerah, 1: Sore, 2: Malam, 3: Badai Petir
}

export interface Assessment {
  id: number;
  manager_id: string;
  staff_id: string;
  assessment_date: string;
  comm_score: number;
  init_score: number;
  commit_score: number;
  notes: string;
}

export interface ChecklistItem {
  id: number;
  room_id: string;
  title: string;
  completed: boolean;
  completed_by?: string;
  updated_at: string;
}

export type Rarity = 'basic' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface RpgAsset {
  id: string;
  name: string;
  type: 'character' | 'pet' | 'cosmetic';
  rarity: Rarity;
  min_level: number;
  description: string;
  image_url: string; // Base64 Data URL: "data:image/gif;base64,..." or "data:image/png;base64,..."
}

export interface InventoryItem {
  id: number;
  user_id: string;
  asset_id: string;
  quantity: number;
  obtained_at: string;
}

export interface WhiteboardStroke {
  id: string;
  tool: 'pen' | 'eraser';
  color: string;
  width: number;
  points: { x: number; y: number }[];
}

export interface BoardComment {
  id: string;
  userName: string;
  userRole: string;
  text: string;
  createdAt: string;
}

export interface MinuteLog {
  id: string;
  title: string;
  date: string;
  time: string;
  scribe: string;
  summary: string;
  actionItems: string[];
  photos?: string[]; // base64 compressed URLs
}

export interface MemoryPhoto {
  id: string;
  uploader: string;
  date: string;
  url: string; // Base64 data URL
  caption: string;
  x: number;
  y: number;
  rotate: number;
}

export interface TavernComment {
  id: string;
  comment_date: string;
  text: string;
  created_at: string;
}

// Agenda/Local room chat comments
export interface AgendaComment {
  id: string;
  room_id: string;
  author_id: string;
  author_name: string;
  text: string;
  created_at: string;
}

// Absolute timer state (stored in DB so latecomers see correct time)
export interface TimerState {
  endsAt: number;         // Unix ms when timer expires (0 = not running)
  running: boolean;
  pausedRemaining: number; // ms remaining when paused (0 = use endsAt)
  totalDuration: number;  // original duration in ms (for reset)
}

// Room presentation state for collaborative workspace
export interface PresentationState {
  fileUrl: string;
  fileName: string;
  presenterId: string;
  presenterName: string;
  active: boolean;
}

// ==========================================
// WILDERNESS RAID TYPES
// ==========================================
export interface BossConfig {
  name: string;
  gifBase64: string; // base64 data URL, empty string if none
  question: string;
  maxHp: number;        // default 300
  damage: number;       // default 20
  attackSpeed: number;  // seconds, default 5
  raidDuration: number; // seconds, default 300
  winLevelReward: number; // level gain on win
  lossCoinPenalty: number; // coin loss on defeat
}

export interface RaiderState {
  profileId: string;
  hp: number;          // 0–100
  energy: number;      // current energy
  commentCount: number; // total comments submitted
  alive: boolean;
}

export type RaidPhase = 'lobby' | 'active' | 'ended';

export interface WildernessRaidState {
  phase: RaidPhase;
  bossConfig: BossConfig;
  bossHp: number;
  bossDebuffUntil: number; // timestamp ms, 0 = not active
  raiders: RaiderState[];
  startedAt: number; // timestamp ms
  endsAt: number;    // timestamp ms
  result?: 'win' | 'lose' | 'draw';
}

export interface RaidComment {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

// ==========================================
// DEFAULT ASSETS
// Kosong — semua aset nyata diunggah oleh Director via Asset Chamber.
// SpriteRenderer tetap bisa render profil lama (base_1/2/3) via SVG fallback.
// ==========================================
export const DEFAULT_ASSETS: RpgAsset[] = [];


// ==========================================
// PRESETS FOR EDUCATION DIVISION
// ==========================================
export const DEFAULT_PROFILES: Profile[] = [
  {
    id: 'director_1',
    name: 'Ahmad Rafif Ilmany',
    role: 'Director',
    sub_div_id: 'All',
    level: 10,
    coins: 999,
    sprite_json: { base: 'base_1', hair: 'hair_red', outfit: 'outfit_gold', accessory: 'crown' },
    pet_id: 'dragon',
    current_status: '👑 Rapat Mode: On',
    current_seat_id: null,
    last_seen: new Date().toISOString()
  },
  {
    id: 'manager_acad',
    name: 'Alya Nurul (Academic)',
    role: 'Manager',
    sub_div_id: 'Academic & Publication',
    level: 5,
    coins: 50,
    sprite_json: { base: 'base_2', hair: 'hair_brown', outfit: 'outfit_blue', accessory: 'glasses' },
    pet_id: 'cat',
    current_status: '📖 Mengoreksi modul',
    current_seat_id: null,
    last_seen: new Date().toISOString()
  },
  {
    id: 'manager_pub',
    name: 'Budi Prasetyo (Pub)',
    role: 'Manager',
    sub_div_id: 'Academic & Publication',
    level: 5,
    coins: 50,
    sprite_json: { base: 'base_3', hair: 'hair_black', outfit: 'outfit_green', accessory: 'headset' },
    pet_id: 'dog',
    current_status: '🎨 Bikin poster',
    current_seat_id: null,
    last_seen: new Date().toISOString()
  },
  {
    id: 'manager_proj',
    name: 'Citra Dewi (Project)',
    role: 'Manager',
    sub_div_id: 'Project & Competition',
    level: 5,
    coins: 50,
    sprite_json: { base: 'base_1', hair: 'hair_yellow', outfit: 'outfit_red', accessory: 'none' },
    pet_id: 'slime',
    current_status: '⚡ OTW Rapat',
    current_seat_id: null,
    last_seen: new Date().toISOString()
  },
  {
    id: 'manager_comp',
    name: 'Daffa Raditya (Comp)',
    role: 'Manager',
    sub_div_id: 'Project & Competition',
    level: 5,
    coins: 50,
    sprite_json: { base: 'base_2', hair: 'hair_grey', outfit: 'outfit_purple', accessory: 'none' },
    pet_id: 'owl',
    current_status: '💻 Debugging',
    current_seat_id: null,
    last_seen: new Date().toISOString()
  },
  // Staff Academic
  { id: 'staff_acad_1', name: 'Eka Saputra', role: 'Staff', sub_div_id: 'Academic & Publication', level: 2, coins: 20, sprite_json: { base: 'base_3', hair: 'hair_black', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'none', current_status: '☕ Minum kopi', current_seat_id: null, last_seen: new Date().toISOString() },
  { id: 'staff_acad_2', name: 'Farhan Azhar', role: 'Staff', sub_div_id: 'Academic & Publication', level: 3, coins: 30, sprite_json: { base: 'base_1', hair: 'hair_brown', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'none', current_status: '🔥 Semangat', current_seat_id: null, last_seen: new Date().toISOString() },
  { id: 'staff_acad_3', name: 'Gita Lestari', role: 'Staff', sub_div_id: 'Academic & Publication', level: 1, coins: 10, sprite_json: { base: 'base_2', hair: 'hair_yellow', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'none', current_status: '📝 Menyimak', current_seat_id: null, last_seen: new Date().toISOString() },
  { id: 'staff_acad_4', name: 'Hari Wijaya', role: 'Staff', sub_div_id: 'Academic & Publication', level: 2, coins: 20, sprite_json: { base: 'base_3', hair: 'hair_red', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'none', current_status: '💤 Mengantuk', current_seat_id: null, last_seen: new Date().toISOString() },
  // Staff Pub
  { id: 'staff_pub_1', name: 'Indah Kusuma', role: 'Staff', sub_div_id: 'Academic & Publication', level: 2, coins: 20, sprite_json: { base: 'base_2', hair: 'hair_brown', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'none', current_status: '🎨 Ngedesain', current_seat_id: null, last_seen: new Date().toISOString() },
  { id: 'staff_pub_2', name: 'Joko Susilo', role: 'Staff', sub_div_id: 'Academic & Publication', level: 1, coins: 10, sprite_json: { base: 'base_3', hair: 'hair_black', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'none', current_status: '☕ Low Energy', current_seat_id: null, last_seen: new Date().toISOString() },
  { id: 'staff_pub_3', name: 'Kartika Sari', role: 'Staff', sub_div_id: 'Academic & Publication', level: 3, coins: 30, sprite_json: { base: 'base_1', hair: 'hair_yellow', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'none', current_status: '✨ Ready', current_seat_id: null, last_seen: new Date().toISOString() },
  // Staff Project
  { id: 'staff_proj_1', name: 'Luthfi Hakim', role: 'Staff', sub_div_id: 'Project & Competition', level: 2, coins: 20, sprite_json: { base: 'base_3', hair: 'hair_black', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'none', current_status: '📅 Bikin timeline', current_seat_id: null, last_seen: new Date().toISOString() },
  { id: 'staff_proj_2', name: 'Mega Utami', role: 'Staff', sub_div_id: 'Project & Competition', level: 2, coins: 20, sprite_json: { base: 'base_2', hair: 'hair_brown', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'none', current_status: '💡 Ada ide', current_seat_id: null, last_seen: new Date().toISOString() },
  { id: 'staff_proj_3', name: 'Naufal Pratama', role: 'Staff', sub_div_id: 'Project & Competition', level: 3, coins: 30, sprite_json: { base: 'base_1', hair: 'hair_grey', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'none', current_status: '🍕 Makan dulu', current_seat_id: null, last_seen: new Date().toISOString() },
  // Staff Comp
  { id: 'staff_comp_1', name: 'Sarah Amanda', role: 'Staff', sub_div_id: 'Project & Competition', level: 2, coins: 20, sprite_json: { base: 'base_2', hair: 'hair_black', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'none', current_status: '🚀 Deploying', current_seat_id: null, last_seen: new Date().toISOString() },
  { id: 'staff_comp_2', name: 'Taufik Hidayat', role: 'Staff', sub_div_id: 'Project & Competition', level: 3, coins: 30, sprite_json: { base: 'base_3', hair: 'hair_brown', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'none', current_status: '👾 Ngoding game', current_seat_id: null, last_seen: new Date().toISOString() },
  { id: 'staff_comp_3', name: 'Umam Alfarizi', role: 'Staff', sub_div_id: 'Project & Competition', level: 1, coins: 10, sprite_json: { base: 'base_1', hair: 'hair_red', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'none', current_status: '🔍 Riset data', current_seat_id: null, last_seen: new Date().toISOString() }
];

// Seed initial localStorage items if mock
if (isMock) {
  if (!localStorage.getItem('rpg_profiles')) {
    localStorage.setItem('rpg_profiles', JSON.stringify(DEFAULT_PROFILES));
  }
  if (!localStorage.getItem('rpg_assets')) {
    localStorage.setItem('rpg_assets', JSON.stringify(DEFAULT_ASSETS));
  }
  if (!localStorage.getItem('rpg_assessments')) {
    localStorage.setItem('rpg_assessments', JSON.stringify([
      { id: 1, manager_id: 'manager_acad', staff_id: 'staff_acad_1', assessment_date: '2026-05-20', comm_score: 4, init_score: 3, commit_score: 5, notes: 'Komitmen sangat baik untuk modul mingguan.' },
      { id: 2, manager_id: 'manager_acad', staff_id: 'staff_acad_1', assessment_date: '2026-05-27', comm_score: 5, init_score: 4, commit_score: 4, notes: 'Komunikasi aktif saat briefing.' },
      { id: 3, manager_id: 'manager_pub', staff_id: 'staff_pub_1', assessment_date: '2026-05-22', comm_score: 3, init_score: 5, commit_score: 4, notes: 'Inisiatif tinggi dalam desain feed instagram.' }
    ]));
  }
  if (!localStorage.getItem('rpg_checklist')) {
    localStorage.setItem('rpg_checklist', JSON.stringify([
      { id: 1, room_id: 'guild_hall', title: 'Evaluasi Program Kerja Bulan Lalu', completed: true, completed_by: 'Ahmad Rafif Ilmany', updated_at: new Date().toISOString() },
      { id: 2, room_id: 'guild_hall', title: 'Persiapan Event Education Fair 2026', completed: false, completed_by: '', updated_at: new Date().toISOString() },
      { id: 3, room_id: 'carriage', title: 'Diskusi Modul Kurikulum Akademik', completed: false, completed_by: '', updated_at: new Date().toISOString() },
      { id: 4, room_id: 'boat', title: 'Timeline Pengerjaan Platform Lomba', completed: false, completed_by: '', updated_at: new Date().toISOString() }
    ]));
  }
  if (!localStorage.getItem('rpg_whiteboard')) {
    localStorage.setItem('rpg_whiteboard', JSON.stringify({
      guild_hall: { strokes: [], notes: [{ id: 'n1', text: 'Selamat Datang di Rapat Divisi!', x: 50, y: 50, color: '#fffd82' }] },
      carriage: { strokes: [], notes: [] },
      boat: { strokes: [], notes: [] }
    }));
  }
  if (!localStorage.getItem('rpg_timer')) {
    localStorage.setItem('rpg_timer', JSON.stringify({ room_id: 'guild_hall', duration: 15 * 60, status: 'idle', startTime: null }));
  }
}

// Broadcast Channel for Multi-tab sync
const bc = new BroadcastChannel('rpg_org_realtime');

// Client Tab ID to prevent echoing messages to ourselves
const clientTabId = Math.random().toString(36).substring(2, 15);

// Setup Supabase Realtime Channel if database connection is real (not mock)
let supabaseChannel: any = null;
const subscribers = new Set<(msg: { type: string; payload: any }) => void>();

bc.addEventListener('message', (e: MessageEvent) => {
  if (e.data && e.data.payload && e.data.payload._senderTabId === clientTabId) {
    return;
  }
  subscribers.forEach(cb => {
    try { cb(e.data); } catch (err) { console.error('Error in BroadcastChannel subscriber callback:', err); }
  });
});

if (!isMock && supabase) {
  supabaseChannel = supabase.channel('rpg_org_global_realtime');
  supabaseChannel
    .on('broadcast', { event: '*' }, (msg: any) => {
      if (msg.payload && msg.payload._senderTabId === clientTabId) {
        return;
      }
      subscribers.forEach(cb => {
        try { cb({ type: msg.event, payload: msg.payload }); } catch (err) { console.error('Error in Supabase Realtime subscriber callback:', err); }
      });
    })
    .subscribe((status: string) => {
      console.log('Supabase global channel status:', status);
    });
}

// Unified Db Handler
export const db = {
  // Profiles
  async getProfiles(): Promise<Profile[]> {
    if (!isMock && supabase) {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) console.error(error);
      return data || [];
    } else {
      return JSON.parse(localStorage.getItem('rpg_profiles') || '[]');
    }
  },

  async updateProfile(id: string, updates: Partial<Profile>): Promise<Profile | null> {
    if (!isMock && supabase) {
      const { data, error } = await supabase.from('profiles').update(updates).eq('id', id).select();
      if (error) console.error(error);
      if (data && data[0]) {
        this.broadcast('profile_update', { id, ...updates });
        return data[0];
      }
      return null;
    } else {
      const profiles = await this.getProfiles();
      const idx = profiles.findIndex(p => p.id === id);
      if (idx !== -1) {
        profiles[idx] = { ...profiles[idx], ...updates, last_seen: new Date().toISOString() };
        localStorage.setItem('rpg_profiles', JSON.stringify(profiles));
        this.broadcast('profile_update', profiles[idx]);
        return profiles[idx];
      }
      return null;
    }
  },

  getSeatsSync(roomId: string, profiles: Profile[]): Seat[] {
    let count = 22;
    if (roomId === 'guild_hall') count = 23;
    else if (roomId === 'carriage' || roomId === 'boat') count = 13;
    else if (roomId === 'tavern') count = 31;
    else if (roomId === 'wilderness') count = 20;
    else if (roomId === 'header') count = 5;

    return Array.from({ length: count }, (_, i) => {
      // Find seatId
      let seatId = `${roomId}_seat_${i + 1}`;
      if (roomId === 'guild_hall') {
        if (i === 20) seatId = 'guild_hall_seat_notice';
        else if (i === 21) seatId = 'guild_hall_seat_scroll';
        else if (i === 22) seatId = 'guild_hall_seat_calendar';
      } else if (roomId === 'carriage') {
        if (i === 12) seatId = 'carriage_seat_notice';
      } else if (roomId === 'boat') {
        if (i === 12) seatId = 'boat_seat_notice';
      } else if (roomId === 'tavern') {
        if (i === 26) seatId = 'tavern_seat_gartic';
        else if (i === 27) seatId = 'tavern_seat_ttt';
        else if (i === 28) seatId = 'tavern_seat_chess';
        else if (i === 29) seatId = 'tavern_seat_gacha';
        else if (i === 30) seatId = 'tavern_seat_kasir';
      }

      const occupant = profiles.find(p => p.current_seat_id === seatId);
      
      // Coordinate logic for rendering layout
      let x = 0, y = 0;
      if (roomId === 'guild_hall') {
        // Pre-defined coordinates to perfectly align with the chairs in the background image
        // Total 20 chairs: 4 on top, 6 on right, 4 on bottom, 6 on left
        const guildHallCoordinates = [
          // Top row (4 chairs)
          { x: 33.5, y: 28 },
          { x: 45.0, y: 28 },
          { x: 55.5, y: 28 },
          { x: 67.0, y: 28 },
          
          // Right curve (6 chairs)
          { x: 77.0, y: 34 },
          { x: 84.5, y: 44 },
          { x: 91.0, y: 60 },
          { x: 88.5, y: 70 },
          { x: 84.0, y: 78 },
          { x: 77.0, y: 85 },
          
          // Bottom row (4 chairs)
          { x: 67.0, y: 89 },
          { x: 55.5, y: 89 },
          { x: 45.0, y: 89 },
          { x: 33.5, y: 89 },
          
          // Left curve (6 chairs)
          { x: 24.0, y: 85 },
          { x: 17.0, y: 78 },
          { x: 12.0, y: 70 },
          { x: 10.0, y: 60 },
          { x: 17.0, y: 44 },
          { x: 24.0, y: 34 }
        ];
        if (i === 20) {
          x = 10; y = 15;
        } else if (i === 21) {
          x = 50; y = 16;
        } else if (i === 22) {
          x = 36.5; y = 16;
        } else {
          const coord = guildHallCoordinates[i] || { x: 50, y: 50 };
          x = coord.x;
          y = coord.y;
        }
      } else if (roomId === 'carriage') {
        // Pre-defined coordinates to perfectly align with the new horizontal carriage.png image
        // 12 seats inside and outside the carriage
        const carriageCoordinates = [
          { x: 37.5, y: 48 }, // 1. Desk chair (writing area)
          { x: 41.5, y: 33 }, // 2. Top row chair 1
          { x: 46.8, y: 33 }, // 3. Top row chair 2
          { x: 52.0, y: 33 }, // 4. Top row chair 3
          { x: 57.3, y: 33 }, // 5. Top row chair 4
          { x: 41.5, y: 66 }, // 6. Bottom row chair 1 (at table)
          { x: 46.8, y: 66 }, // 7. Bottom row chair 2 (at table)
          { x: 52.0, y: 66 }, // 8. Bottom row chair 3 (at table)
          { x: 57.3, y: 66 }, // 9. Bottom row chair 4 (at table)
          { x: 26.0, y: 57 }, // 10. Driver seat (outside left)
          { x: 67.0, y: 33 }, // 11. Cargo chest (outside right top)
          { x: 73.0, y: 47 }  // 12. Entry platform/stairs (outside right middle)
        ];
        if (i === 12) {
          x = 58.5; y = 31;
        } else {
          const coord = carriageCoordinates[i] || { x: 50, y: 50 };
          x = coord.x;
          y = coord.y;
        }
      } else if (roomId === 'boat') {
        // Pre-defined coordinates to perfectly align with the new horizontal boat.png image
        // 12 seats: 10 on main deck (2 rows of 5), 2 on raised captain's deck
        const boatCoordinates = [
          // Main Deck Top Row (5 seats)
          { x: 25, y: 57 },
          { x: 36, y: 57 },
          { x: 47, y: 57 },
          { x: 58, y: 57 },
          { x: 69, y: 57 },
          // Main Deck Bottom Row (5 seats)
          { x: 25, y: 74 },
          { x: 36, y: 74 },
          { x: 47, y: 74 },
          { x: 58, y: 74 },
          { x: 69, y: 74 },
          // Captain's Deck (2 seats)
          { x: 90, y: 52 }, // standing near helm / top of stairs
          { x: 93, y: 66 }  // at captain's desk chair
        ];
        if (i === 12) {
          x = 42.5; y = 63;
        } else {
          const coord = boatCoordinates[i] || { x: 50, y: 50 };
          x = coord.x;
          y = coord.y;
        }
      } else if (roomId === 'wilderness') {
        // 20 seats aligned with the colosseum stands/benches in the background image
        const angle = Math.PI * (1 - i / (count - 1)); // π to 0
        x = Math.round(50 + Math.cos(angle) * 38);
        y = Math.round(58 - Math.sin(angle) * 24);
      } else if (roomId === 'tavern') {
        if (i === 26) {
          x = 73; y = 59;
        } else if (i === 27) {
          x = 15; y = 59;
        } else if (i === 28) {
          x = 47; y = 59;
        } else if (i === 29) {
          x = 86; y = 32;
        } else if (i === 30) {
          x = 58; y = 32;
        } else if (i < 10) {
          // 10 seats in top-left (around top-left cozy area)
          const angle = (i / 10) * Math.PI * 2;
          x = Math.round(24 + Math.cos(angle) * 14);
          y = Math.round(30 + Math.sin(angle) * 9);
        } else if (i < 20) {
          // 10 seats in bottom-left (around bottom-left cozy area)
          const angle = ((i - 10) / 10) * Math.PI * 2;
          x = Math.round(24 + Math.cos(angle) * 14);
          y = Math.round(70 + Math.sin(angle) * 9);
        } else {
          // 6 seats in bar/counter area (indices 20-25)
          const barIndex = i - 20;
          if (barIndex < 4) {
            // 4 bar stools along counter
            x = 68 + barIndex * 7;
            y = 38;
          } else {
            // 2 seats at table
            x = barIndex === 4 ? 75 : 85;
            y = 75;
          }
        }
      }

      return {
        id: seatId,
        room_id: roomId,
        user_id: occupant ? occupant.id : null,
        x,
        y
      };
    });
  },

  async getSeats(roomId: string): Promise<Seat[]> {
    const profiles = await this.getProfiles();
    return this.getSeatsSync(roomId, profiles);
  },

  async claimSeat(roomId: string, seatId: string, userId: string): Promise<boolean> {
    const profiles = await this.getProfiles();
    
    // Check if the seat is already occupied by someone else
    const occupant = profiles.find(p => p.current_seat_id === seatId);
    if (occupant && occupant.id !== userId) {
      return false;
    }
    
    // Clear old seat if user was sitting elsewhere
    profiles.forEach(p => {
      if (p.id === userId) {
        p.current_seat_id = seatId;
      }
    });

    if (!isMock && supabase) {
      await supabase.from('profiles').update({ current_seat_id: seatId }).eq('id', userId);
    } else {
      localStorage.setItem('rpg_profiles', JSON.stringify(profiles));
    }
    
    this.broadcast('seat_claim', { roomId, seatId, userId });
    return true;
  },

  async leaveSeat(userId: string): Promise<boolean> {
    const profiles = await this.getProfiles();
    const user = profiles.find(p => p.id === userId);
    if (user && user.current_seat_id) {
      const oldSeat = user.current_seat_id;
      user.current_seat_id = null;
      if (!isMock && supabase) {
        await supabase.from('profiles').update({ current_seat_id: null }).eq('id', userId);
      } else {
        localStorage.setItem('rpg_profiles', JSON.stringify(profiles));
      }
      this.broadcast('seat_leave', { userId, oldSeat });
      return true;
    }
    return false;
  },

  // Checklist
  async getChecklist(roomId: string): Promise<ChecklistItem[]> {
    if (!isMock && supabase) {
      const { data, error } = await supabase.from('checklist_items').select('*').eq('room_id', roomId);
      if (error) console.error(error);
      return data || [];
    } else {
      const list: ChecklistItem[] = JSON.parse(localStorage.getItem('rpg_checklist') || '[]');
      return list.filter(item => item.room_id === roomId);
    }
  },

  async addChecklistItem(roomId: string, title: string): Promise<ChecklistItem> {
    const newItem = {
      id: Date.now(),
      room_id: roomId,
      title,
      completed: false,
      completed_by: '',
      updated_at: new Date().toISOString()
    };

    if (!isMock && supabase) {
      const { data, error } = await supabase.from('checklist_items').insert(newItem).select();
      if (error) console.error(error);
      if (data && data[0]) {
        this.broadcast('checklist_update', { roomId });
        return data[0];
      }
    } else {
      const list = JSON.parse(localStorage.getItem('rpg_checklist') || '[]');
      list.push(newItem);
      localStorage.setItem('rpg_checklist', JSON.stringify(list));
    }

    this.broadcast('checklist_update', { roomId });
    return newItem;
  },

  async toggleChecklistItem(roomId: string, itemId: number, completed: boolean, completedBy: string): Promise<boolean> {
    if (!isMock && supabase) {
      await supabase.from('checklist_items').update({ completed, completed_by: completedBy, updated_at: new Date().toISOString() }).eq('id', itemId);
    } else {
      const list: ChecklistItem[] = JSON.parse(localStorage.getItem('rpg_checklist') || '[]');
      const item = list.find(i => i.id === itemId);
      if (item) {
        item.completed = completed;
        item.completed_by = completed ? completedBy : '';
        item.updated_at = new Date().toISOString();
        localStorage.setItem('rpg_checklist', JSON.stringify(list));
      }
    }
    this.broadcast('checklist_update', { roomId });
    return true;
  },

  async deleteChecklistItem(roomId: string, itemId: number): Promise<boolean> {
    if (!isMock && supabase) {
      const { error } = await supabase.from('checklist_items').delete().eq('id', itemId);
      if (error) { console.error(error); return false; }
    } else {
      const list: ChecklistItem[] = JSON.parse(localStorage.getItem('rpg_checklist') || '[]');
      const filtered = list.filter(i => i.id !== itemId);
      localStorage.setItem('rpg_checklist', JSON.stringify(filtered));
    }
    this.broadcast('checklist_update', { roomId });
    return true;
  },

  // Whiteboard / Drawings, Notes & Comments
  async getWhiteboard(roomId: string): Promise<{ strokes: WhiteboardStroke[], notes: any[], comments: BoardComment[] }> {
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('whiteboard_drawings')
          .select('strokes, notes, comments')
          .eq('room_id', roomId)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          return {
            strokes: (data.strokes as unknown as WhiteboardStroke[]) || [],
            notes: (data.notes as unknown as any[]) || [],
            comments: (data.comments as unknown as BoardComment[]) || []
          };
        }
      } catch (err) {
        console.warn('Failed to load whiteboard from Supabase, fallback to local:', err);
      }
    }
    const data = JSON.parse(localStorage.getItem('rpg_whiteboard') || '{}');
    const board = data[roomId] || { strokes: [], notes: [], comments: [] };
    return {
      strokes: board.strokes || [],
      notes: board.notes || [],
      comments: board.comments || []
    };
  },

  async saveWhiteboard(roomId: string, strokes: WhiteboardStroke[], notes: any[], comments: BoardComment[] = []): Promise<boolean> {
    if (!isMock && supabase) {
      try {
        const { error } = await supabase
          .from('whiteboard_drawings')
          .upsert({
            room_id: roomId,
            strokes,
            notes,
            comments,
            updated_at: new Date().toISOString()
          }, { onConflict: 'room_id' });
        if (error) throw error;
      } catch (err) {
        console.error('Failed to save whiteboard to Supabase:', err);
      }
    }
    const data = JSON.parse(localStorage.getItem('rpg_whiteboard') || '{}');
    data[roomId] = { strokes, notes, comments };
    localStorage.setItem('rpg_whiteboard', JSON.stringify(data));
    this.broadcast('whiteboard_update', { roomId, strokes, notes, comments });
    return true;
  },

  // Minutes of Meeting (Library)
  async getMinutes(): Promise<MinuteLog[]> {
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('rpg_minutes')
          .select('*')
          .order('date', { ascending: false });
        if (error) throw error;
        return (data || []).map(row => ({
          id: row.id,
          title: row.title,
          date: row.date,
          time: row.time,
          scribe: row.scribe,
          summary: row.summary,
          actionItems: (row.action_items as unknown as string[]) || [],
          photos: (row.photos as unknown as string[]) || []
        }));
      } catch (err) {
        console.warn('Failed to load minutes from Supabase, using local:', err);
      }
    }
    return JSON.parse(localStorage.getItem('rpg_minutes') || '[]');
  },

  async saveMinuteLog(log: MinuteLog): Promise<boolean> {
    if (!isMock && supabase) {
      try {
        const { error } = await supabase
          .from('rpg_minutes')
          .upsert({
            id: log.id,
            title: log.title,
            date: log.date,
            time: log.time,
            scribe: log.scribe,
            summary: log.summary,
            action_items: log.actionItems,
            photos: log.photos || [],
            updated_at: new Date().toISOString()
          });
        if (error) throw error;
      } catch (err) {
        console.error('Failed to save minute log to Supabase:', err);
      }
    }
    const list = JSON.parse(localStorage.getItem('rpg_minutes') || '[]');
    const idx = list.findIndex((m: any) => m.id === log.id);
    if (idx !== -1) {
      list[idx] = log;
    } else {
      list.push(log);
    }
    localStorage.setItem('rpg_minutes', JSON.stringify(list));
    this.broadcast('minutes_update', { log });
    return true;
  },

  async deleteMinuteLog(id: string): Promise<boolean> {
    if (!isMock && supabase) {
      try {
        const { error } = await supabase.from('rpg_minutes').delete().eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.error('Failed to delete minute log from Supabase:', err);
      }
    }
    const list = JSON.parse(localStorage.getItem('rpg_minutes') || '[]');
    const filtered = list.filter((m: any) => m.id !== id);
    localStorage.setItem('rpg_minutes', JSON.stringify(filtered));
    this.broadcast('minutes_update', { deletedId: id });
    return true;
  },

  // 3 Polaroid Memory Boards
  async getMemoryBoard(boardId: string): Promise<MemoryPhoto[]> {
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('rpg_memory_boards')
          .select('photos')
          .eq('board_id', boardId)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          return (data.photos as unknown as MemoryPhoto[]) || [];
        }
      } catch (err) {
        console.warn(`Failed to load memory board ${boardId} from Supabase, using local:`, err);
      }
    }
    return JSON.parse(localStorage.getItem(`rpg_memory_board_${boardId}`) || '[]');
  },

  async saveMemoryBoard(boardId: string, photos: MemoryPhoto[]): Promise<boolean> {
    if (!isMock && supabase) {
      try {
        const { error } = await supabase
          .from('rpg_memory_boards')
          .upsert({
            board_id: boardId,
            photos,
            updated_at: new Date().toISOString()
          }, { onConflict: 'board_id' });
        if (error) throw error;
      } catch (err) {
        console.error(`Failed to save memory board ${boardId} to Supabase:`, err);
      }
    }
    localStorage.setItem(`rpg_memory_board_${boardId}`, JSON.stringify(photos));
    this.broadcast('memory_board_update', { boardId, photos });
    return true;
  },

  // Assessments (Managerial)
  async getAssessments(): Promise<Assessment[]> {
    if (!isMock && supabase) {
      const { data, error } = await supabase.from('assessments').select('*');
      if (error) console.error(error);
      return data || [];
    } else {
      return JSON.parse(localStorage.getItem('rpg_assessments') || '[]');
    }
  },

  async addAssessment(managerId: string, staffId: string, comm: number, init: number, commit: number, notes: string): Promise<Assessment> {
    const newAss = {
      id: Date.now(),
      manager_id: managerId,
      staff_id: staffId,
      assessment_date: new Date().toISOString().split('T')[0],
      comm_score: comm,
      init_score: init,
      commit_score: commit,
      notes
    };

    if (!isMock && supabase) {
      const { data, error } = await supabase.from('assessments').insert(newAss).select();
      if (error) console.error(error);
      if (data && data[0]) {
        this.broadcast('assessment_update', {});
        return data[0];
      }
    } else {
      const list = JSON.parse(localStorage.getItem('rpg_assessments') || '[]');
      list.push(newAss);
      localStorage.setItem('rpg_assessments', JSON.stringify(list));
    }

    this.broadcast('assessment_update', {});
    return newAss;
  },

  // Authentication
  async signIn(email: string, password: string): Promise<Profile | null> {
    if (!isMock && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) return null;
      const { data: profile, error: pError } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
      if (pError) console.error(pError);
      return profile || null;
    } else {
      // Mock Login
      const profiles = await this.getProfiles();
      const matched = profiles.find(p => {
        const mockEmail = p.name.split(' ')[0].toLowerCase() + '@rpg.org';
        return mockEmail === email.trim().toLowerCase();
      });
      if (matched && password === 'password123') {
        localStorage.setItem('rpg_mock_session', matched.id);
        return matched;
      }
      throw new Error('Email atau password salah (Mock: password default adalah "password123")');
    }
  },

  async signOut(userId: string): Promise<void> {
    await this.leaveSeat(userId);
    if (!isMock && supabase) {
      await supabase.auth.signOut();
    } else {
      localStorage.removeItem('rpg_mock_session');
    }
  },

  async getCurrentUser(): Promise<Profile | null> {
    if (!isMock && supabase) {
      const { data: { user }, error: uError } = await supabase.auth.getUser();
      if (uError || !user) return null;
      const { data: profile, error: pError } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (pError) console.error(pError);
      return profile || null;
    } else {
      const sessionId = localStorage.getItem('rpg_mock_session');
      if (!sessionId) return null;
      const profiles = await this.getProfiles();
      return profiles.find(p => p.id === sessionId) || null;
    }
  },

  async changePassword(password: string): Promise<boolean> {
    if (!isMock && supabase) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      return true;
    } else {
      return true;
    }
  },

  async createMember(email: string, password: string, name: string, role: 'Director' | 'Manager' | 'Staff', subDivId: 'Academic & Publication' | 'Project & Competition' | 'All'): Promise<boolean> {
    if (!isMock && supabase) {
      const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });
      const { error } = await tempClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            role,
            sub_div_id: subDivId
          }
        }
      });
      if (error) throw error;
      return true;
    } else {
      const profiles = await this.getProfiles();
      const newId = 'mock_user_' + Date.now();
      const newProfile: Profile = {
        id: newId,
        name,
        role,
        sub_div_id: subDivId,
        level: 1,
        coins: 0,
        sprite_json: { base: 'base_1', hair: 'hair_black', outfit: 'outfit_casual', accessory: 'none' },
        pet_id: 'none',
        current_status: '☕ Santai',
        current_seat_id: null,
        last_seen: new Date().toISOString()
      };
      profiles.push(newProfile);
      localStorage.setItem('rpg_profiles', JSON.stringify(profiles));
      this.broadcast('profile_update', newProfile);
      return true;
    }
  },

  // ==========================================
  // Asset CRUD (Director-Only)
  // ==========================================
  async getAssets(): Promise<RpgAsset[]> {
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase.from('rpg_assets').select('*').order('type').order('min_level');
        if (error) throw error;
        // Merge with defaults: DB custom assets + built-in defaults (those without DB override)
        const dbIds = new Set((data || []).map((a: RpgAsset) => a.id));
        const builtins = DEFAULT_ASSETS.filter(a => !dbIds.has(a.id));
        return [...(data || []), ...builtins];
      } catch (err) {
        console.warn('rpg_assets table not found or error, using defaults:', err);
        return [...DEFAULT_ASSETS];
      }
    } else {
      return JSON.parse(localStorage.getItem('rpg_assets') || JSON.stringify(DEFAULT_ASSETS));
    }
  },

  async addAsset(asset: RpgAsset): Promise<RpgAsset | null> {
    if (!isMock && supabase) {
      const { data, error } = await supabase.from('rpg_assets').upsert(asset).select();
      if (error) { console.error(error); return null; }
      await this.refreshAssetsCache();
      this.broadcast('assets_update', {});
      return data?.[0] || null;
    } else {
      const assets = await this.getAssets();
      const existing = assets.findIndex(a => a.id === asset.id);
      if (existing !== -1) {
        assets[existing] = asset;
      } else {
        assets.push(asset);
      }
      localStorage.setItem('rpg_assets', JSON.stringify(assets));
      await this.refreshAssetsCache();
      this.broadcast('assets_update', {});
      return asset;
    }
  },

  async deleteAsset(id: string): Promise<boolean> {
    // Prevent deletion of built-in defaults
    const isDefault = DEFAULT_ASSETS.some(a => a.id === id);
    if (isDefault) return false;

    if (!isMock && supabase) {
      const { error } = await supabase.from('rpg_assets').delete().eq('id', id);
      if (error) { console.error(error); return false; }
    } else {
      const assets = await this.getAssets();
      const filtered = assets.filter(a => a.id !== id);
      localStorage.setItem('rpg_assets', JSON.stringify(filtered));
    }
    await this.refreshAssetsCache();
    this.broadcast('assets_update', {});
    return true;
  },

  // Persist assets to localStorage cache so SpriteRenderer can read synchronously
  async refreshAssetsCache(): Promise<void> {
    const assets = await this.getAssets();
    localStorage.setItem('rpg_assets_cache', JSON.stringify(assets));
  },

  // ==========================================
  // Inventory CRUD
  // ==========================================
  async getInventory(userId: string): Promise<InventoryItem[]> {
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('rpg_inventory')
          .select('*')
          .eq('user_id', userId)
          .order('obtained_at', { ascending: false });
        if (error) throw error;
        return data || [];
      } catch (err) {
        console.warn('rpg_inventory error, using localStorage:', err);
        return JSON.parse(localStorage.getItem(`rpg_inventory_${userId}`) || '[]');
      }
    } else {
      return JSON.parse(localStorage.getItem(`rpg_inventory_${userId}`) || '[]');
    }
  },

  async addToInventory(userId: string, assetId: string): Promise<void> {
    if (!isMock && supabase) {
      // Upsert: if exists increment quantity, else insert
      const { data: existing } = await supabase
        .from('rpg_inventory')
        .select('id, quantity')
        .eq('user_id', userId)
        .eq('asset_id', assetId)
        .single();
      if (existing) {
        await supabase
          .from('rpg_inventory')
          .update({ quantity: existing.quantity + 1 })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('rpg_inventory')
          .insert({ user_id: userId, asset_id: assetId, quantity: 1 });
      }
    } else {
      const items: InventoryItem[] = JSON.parse(localStorage.getItem(`rpg_inventory_${userId}`) || '[]');
      const idx = items.findIndex(i => i.asset_id === assetId);
      if (idx !== -1) {
        items[idx].quantity += 1;
      } else {
        items.push({ id: Date.now(), user_id: userId, asset_id: assetId, quantity: 1, obtained_at: new Date().toISOString() });
      }
      localStorage.setItem(`rpg_inventory_${userId}`, JSON.stringify(items));
    }
  },

  // ==========================================
  // Coin Management
  // ==========================================
  async giveCoins(userId: string, amount: number): Promise<number | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;
    const newCoins = Math.max(0, (profile.coins || 0) + amount);
    const updated = await this.updateProfile(userId, { coins: newCoins });
    if (updated) {
      this.broadcast('profile_update', { id: userId, coins: newCoins });
      return newCoins;
    }
    return null;
  },

  async giveCoinsToAll(amount: number): Promise<void> {
    const profiles = await this.getProfiles();
    await Promise.all(profiles.map(p => this.giveCoins(p.id, amount)));
    this.broadcast('profile_update', {});
  },

  async spendCoins(userId: string, amount: number): Promise<number | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;
    if ((profile.coins || 0) < amount) return null; // insufficient
    const newCoins = profile.coins - amount;
    const updated = await this.updateProfile(userId, { coins: newCoins });
    if (updated) {
      this.broadcast('profile_update', { id: userId, coins: newCoins });
      return newCoins;
    }
    return null;
  },

  async getProfile(userId: string): Promise<Profile | null> {
    const profiles = await this.getProfiles();
    return profiles.find(p => p.id === userId) || null;
  },

  // ==========================================
  // Gacha Pull Logic
  // ==========================================
  gachaRoll(packType: 'individual' | 'education' | 'ieee'): Rarity {
    const rand = Math.random() * 100;
    const tables: Record<string, [number, number, number, number, number]> = {
      //                     common uncommon rare epic legendary  (cumulative)
      individual: [60, 85, 95, 99, 100],
      education:  [45, 75, 90, 97, 100],
      ieee:       [15, 35, 70, 90, 100],
    };
    const [c, u, r, e] = tables[packType];
    if (rand < c) return 'common';
    if (rand < u) return 'uncommon';
    if (rand < r) return 'rare';
    if (rand < e) return 'epic';
    return 'legendary';
  },

  packCost(packType: 'individual' | 'education' | 'ieee'): number {
    return { individual: 10, education: 25, ieee: 50 }[packType];
  },

  // Pull one card: deduct coins, roll rarity, pick random asset of that rarity, add to inventory
  async pullCard(
    userId: string,
    packType: 'individual' | 'education' | 'ieee',
    gachaType?: 'char_pet' | 'cosmetic'
  ): Promise<{ success: boolean; asset: RpgAsset | null; rarity: Rarity; isDuplicate: boolean; newCoins?: number; errorMsg?: string }> {
    const cost = this.packCost(packType);
    const newCoins = await this.spendCoins(userId, cost);
    if (newCoins === null) return { success: false, asset: null, rarity: 'common', isDuplicate: false, errorMsg: 'Koin tidak cukup!' };

    const rolledRarity = this.gachaRoll(packType);
    const allAssets = await this.getAssets();
    
    // Filter initial pool
    let pool = allAssets.filter(a => a.rarity === rolledRarity);
    if (gachaType === 'char_pet') {
      pool = pool.filter(a => a.type === 'character' || a.type === 'pet');
    } else if (gachaType === 'cosmetic') {
      pool = pool.filter(a => a.type === 'cosmetic');
    }

    // Fallback: if no assets for that rarity, try lower rarities
    let finalPool = pool;
    if (finalPool.length === 0) {
      const order: Rarity[] = ['legendary','epic','rare','uncommon','common'];
      for (const r of order) {
        let tempPool = allAssets.filter(a => a.rarity === r);
        if (gachaType === 'char_pet') {
          tempPool = tempPool.filter(a => a.type === 'character' || a.type === 'pet');
        } else if (gachaType === 'cosmetic') {
          tempPool = tempPool.filter(a => a.type === 'cosmetic');
        }
        if (tempPool.length > 0) {
          finalPool = tempPool;
          break;
        }
      }
    }
    if (finalPool.length === 0) {
      // refund
      const refundedCoins = await this.giveCoins(userId, cost);
      return { success: false, asset: null, rarity: rolledRarity, isDuplicate: false, newCoins: refundedCoins !== null ? refundedCoins : undefined, errorMsg: 'Tidak ada aset tersedia di pool gacha!' };
    }

    const picked = finalPool[Math.floor(Math.random() * finalPool.length)];

    // Check duplicate
    const inventory = await this.getInventory(userId);
    const isDuplicate = inventory.some(i => i.asset_id === picked.id);

    await this.addToInventory(userId, picked.id);
    return { success: true, asset: picked, rarity: picked.rarity, isDuplicate, newCoins };
  },

  async getTavernComments(dateStr: string): Promise<TavernComment[]> {
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('rpg_tavern_comments')
          .select('*')
          .eq('comment_date', dateStr)
          .order('created_at', { ascending: true });
        if (error) throw error;
        return (data || []).map(row => ({
          id: row.id.toString(),
          comment_date: row.comment_date,
          text: row.text,
          created_at: row.created_at
        }));
      } catch (err) {
        console.warn('Failed to load comments from Supabase, fallback to local:', err);
      }
    }
    const allComments: TavernComment[] = JSON.parse(localStorage.getItem('rpg_tavern_comments') || '[]');
    return allComments.filter(c => c.comment_date === dateStr);
  },

  async addTavernComment(text: string, dateStr: string): Promise<TavernComment> {
    let newComment: TavernComment = {
      id: Date.now().toString(),
      comment_date: dateStr,
      text,
      created_at: new Date().toISOString()
    };
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('rpg_tavern_comments')
          .insert({ comment_date: dateStr, text })
          .select();
        if (error) throw error;
        if (data && data[0]) {
          newComment = {
            id: data[0].id.toString(),
            comment_date: data[0].comment_date,
            text: data[0].text,
            created_at: data[0].created_at
          };
        }
      } catch (err) {
        console.error('Failed to add comment to Supabase:', err);
      }
    }
    const allComments: TavernComment[] = JSON.parse(localStorage.getItem('rpg_tavern_comments') || '[]');
    allComments.push(newComment);
    localStorage.setItem('rpg_tavern_comments', JSON.stringify(allComments));
    this.broadcast('tavern_comment_update', { comment: newComment });
    return newComment;
  },

  async getTavernCommentDates(): Promise<string[]> {
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('rpg_tavern_comments')
          .select('comment_date');
        if (error) throw error;
        const dates = Array.from(new Set((data || []).map(row => row.comment_date)));
        return dates.sort((a, b) => b.localeCompare(a));
      } catch (err) {
        console.warn('Failed to load comment dates from Supabase, fallback to local:', err);
      }
    }
    const allComments: TavernComment[] = JSON.parse(localStorage.getItem('rpg_tavern_comments') || '[]');
    const dates = Array.from(new Set(allComments.map(c => c.comment_date)));
    return dates.sort((a, b) => b.localeCompare(a));
  },

  // ==========================================
  // WILDERNESS RAID
  // ==========================================
  async getRaidState(): Promise<WildernessRaidState | null> {
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('rpg_raid_config')
          .select('raid_state')
          .eq('id', 1)
          .maybeSingle();
        if (error) throw error;
        if (data?.raid_state) return data.raid_state as WildernessRaidState;
      } catch (err) {
        console.warn('getRaidState Supabase error, fallback to localStorage:', err);
      }
    }
    const saved = localStorage.getItem('rpg_wilderness_state');
    return saved ? JSON.parse(saved) : null;
  },

  async saveRaidState(state: WildernessRaidState): Promise<void> {
    // Always persist locally
    localStorage.setItem('rpg_wilderness_state', JSON.stringify(state));
    // Persist to Supabase (with full GIF in raid_state JSONB)
    if (!isMock && supabase) {
      try {
        await supabase.from('rpg_raid_config').upsert({
          id: 1,
          phase: state.phase,
          raid_state: state,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('saveRaidState Supabase error:', err);
      }
    }
    // Broadcast lightweight state (strip GIF to keep payload small for BroadcastChannel)
    const { gifBase64: _gif, ...configWithoutGif } = state.bossConfig;
    this.broadcast('wilderness_state_update', {
      state: { ...state, bossConfig: configWithoutGif }
    });
  },

  async getRaidComments(): Promise<RaidComment[]> {
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('rpg_raid_comments')
          .select('*')
          .order('created_at', { ascending: true });
        if (error) throw error;
        return (data || []).map((row: any) => ({
          id: row.id.toString(),
          authorId: row.author_id,
          authorName: row.author_name,
          text: row.text,
          createdAt: row.created_at
        }));
      } catch (err) {
        console.warn('getRaidComments Supabase error, fallback:', err);
      }
    }
    return JSON.parse(localStorage.getItem('rpg_raid_comments') || '[]');
  },

  async addRaidComment(text: string, authorId: string, authorName: string): Promise<RaidComment> {
    let newComment: RaidComment = {
      id: Date.now().toString(),
      authorId,
      authorName,
      text,
      createdAt: new Date().toISOString()
    };
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('rpg_raid_comments')
          .insert({ author_id: authorId, author_name: authorName, text })
          .select();
        if (error) throw error;
        if (data?.[0]) {
          newComment = {
            id: data[0].id.toString(),
            authorId: data[0].author_id,
            authorName: data[0].author_name,
            text: data[0].text,
            createdAt: data[0].created_at
          };
        }
      } catch (err) {
        console.error('addRaidComment Supabase error:', err);
      }
    }
    // Always persist to localStorage
    const list: RaidComment[] = JSON.parse(localStorage.getItem('rpg_raid_comments') || '[]');
    list.push(newComment);
    localStorage.setItem('rpg_raid_comments', JSON.stringify(list));
    this.broadcast('wilderness_comment_add', { comment: newComment });
    return newComment;
  },

  async clearRaidComments(): Promise<void> {
    if (!isMock && supabase) {
      try {
        await supabase.from('rpg_raid_comments').delete().gt('id', 0);
      } catch (err) {
        console.error('clearRaidComments Supabase error:', err);
      }
    }
    localStorage.removeItem('rpg_raid_comments');
    this.broadcast('wilderness_comments_clear', {});
  },

  async getLockedHeaderSeats(): Promise<string[]> {
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('whiteboard_drawings')
          .select('notes')
          .eq('room_id', 'header_seats_config')
          .maybeSingle();
        if (error) throw error;
        if (data && Array.isArray(data.notes)) {
          return data.notes as string[];
        }
      } catch (err) {
        console.warn('Failed to load header seat locks from Supabase:', err);
      }
    }
    try {
      const saved = localStorage.getItem('rpg_header_locked_seats');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  },

  async saveLockedHeaderSeats(lockedSeats: string[]): Promise<boolean> {
    localStorage.setItem('rpg_header_locked_seats', JSON.stringify(lockedSeats));
    if (!isMock && supabase) {
      try {
        await supabase
          .from('whiteboard_drawings')
          .upsert({
            room_id: 'header_seats_config',
            notes: lockedSeats,
            updated_at: new Date().toISOString()
          }, { onConflict: 'room_id' });
      } catch (err) {
        console.error('Failed to save header seat locks to Supabase:', err);
        return false;
      }
    }
    this.broadcast('header_seats_lock_update', { lockedSeats });
    return true;
  },

  async getTicTacToeState(): Promise<any | null> {
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('whiteboard_drawings')
          .select('notes')
          .eq('room_id', 'tictactoe_state')
          .maybeSingle();
        if (error) throw error;
        if (data && data.notes) {
          return data.notes;
        }
      } catch (err) {
        console.warn('Failed to load Tic-Tac-Toe state from Supabase:', err);
      }
    }
    try {
      const saved = localStorage.getItem('rpg_tictactoe_state');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  },

  async saveTicTacToeState(state: any): Promise<boolean> {
    localStorage.setItem('rpg_tictactoe_state', JSON.stringify(state));
    if (!isMock && supabase) {
      try {
        await supabase
          .from('whiteboard_drawings')
          .upsert({
            room_id: 'tictactoe_state',
            notes: state,
            updated_at: new Date().toISOString()
          }, { onConflict: 'room_id' });
      } catch (err) {
        console.error('Failed to save Tic-Tac-Toe state to Supabase:', err);
        return false;
      }
    }
    this.broadcast('tictactoe_sync', { tttState: state });
    return true;
  },

  async getChessState(): Promise<any | null> {
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('whiteboard_drawings')
          .select('notes')
          .eq('room_id', 'chess_state')
          .maybeSingle();
        if (error) throw error;
        if (data && data.notes) {
          return data.notes;
        }
      } catch (err) {
        console.warn('Failed to load Chess state from Supabase:', err);
      }
    }
    try {
      const saved = localStorage.getItem('rpg_chess_state');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  },

  async saveChessState(state: any): Promise<boolean> {
    localStorage.setItem('rpg_chess_state', JSON.stringify(state));
    if (!isMock && supabase) {
      try {
        await supabase
          .from('whiteboard_drawings')
          .upsert({
            room_id: 'chess_state',
            notes: state,
            updated_at: new Date().toISOString()
          }, { onConflict: 'room_id' });
      } catch (err) {
        console.error('Failed to save Chess state to Supabase:', err);
        return false;
      }
    }
    this.broadcast('chess_sync', { chessState: state });
    return true;
  },

  async getRoundTableMusic(): Promise<{ url: string; status: 'playing' | 'stopped'; startedAt?: number } | null> {
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('whiteboard_drawings')
          .select('notes')
          .eq('room_id', 'round_table_music')
          .maybeSingle();
        if (error) throw error;
        if (data && data.notes) {
          return data.notes as any;
        }
      } catch (err) {
        console.warn('Failed to load Round Table music config from Supabase:', err);
      }
    }
    try {
      const saved = localStorage.getItem('rpg_round_table_music');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  },

  async saveRoundTableMusic(state: { url: string; status: 'playing' | 'stopped'; startedAt?: number }): Promise<boolean> {
    const finalState = {
      ...state,
      startedAt: state.startedAt || (state.status === 'playing' ? Date.now() : 0)
    };
    localStorage.setItem('rpg_round_table_music', JSON.stringify(finalState));
    if (!isMock && supabase) {
      try {
        await supabase
          .from('whiteboard_drawings')
          .upsert({
            room_id: 'round_table_music',
            notes: finalState as any,
            updated_at: new Date().toISOString()
          }, { onConflict: 'room_id' });
      } catch (err) {
        console.error('Failed to save Round Table music state to Supabase:', err);
        return false;
      }
    }
    this.broadcast('round_table_music_sync', finalState);
    return true;
  },

  async getGlobalTicker(): Promise<string> {
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('whiteboard_drawings')
          .select('notes')
          .eq('room_id', 'global_ticker')
          .maybeSingle();
        if (error) throw error;
        if (data && typeof data.notes === 'string') {
          return data.notes;
        }
      } catch (err) {
        console.warn('Failed to load global ticker from Supabase:', err);
      }
    }
    return localStorage.getItem('rpg_global_ticker') || 'Selamat datang di Education Guild! Silakan kustomisasi karakter Anda di House.';
  },

  async saveGlobalTicker(text: string): Promise<boolean> {
    localStorage.setItem('rpg_global_ticker', text);
    if (!isMock && supabase) {
      try {
        await supabase
          .from('whiteboard_drawings')
          .upsert({
            room_id: 'global_ticker',
            notes: text as any,
            updated_at: new Date().toISOString()
          }, { onConflict: 'room_id' });
      } catch (err) {
        console.error('Failed to save global ticker to Supabase:', err);
        return false;
      }
    }
    this.broadcast('ticker_update', { text });
    return true;
  },

  async getRoomConfigs(): Promise<RoomConfig[]> {
    const defaultConfigs: RoomConfig[] = [
      { room_id: 'guild_hall', weather_intensity: 0, discord_url: 'https://discord.gg/jY5CMZrN68', weather_filter: 0 },
      { room_id: 'carriage', weather_intensity: 2, discord_url: 'https://discord.gg/CX5KjcGMyP', weather_filter: 0 },
      { room_id: 'boat', weather_intensity: 2, discord_url: 'https://discord.gg/QaB82GYhmy', weather_filter: 0 },
      { room_id: 'tavern', weather_intensity: 0, discord_url: 'https://discord.gg/jY5CMZrN68', weather_filter: 0 }
    ];

    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase.from('rpg_room_configs').select('*');
        if (error) throw error;
        if (data && data.length > 0) {
          const merged = defaultConfigs.map(def => {
            const dbVal = data.find(d => d.room_id === def.room_id);
            return dbVal ? { ...def, ...dbVal } : def;
          });
          return merged;
        }
      } catch (err) {
        console.warn('Failed to load room configs from Supabase, using defaults:', err);
      }
    }

    try {
      const saved = localStorage.getItem('rpg_room_configs');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}

    localStorage.setItem('rpg_room_configs', JSON.stringify(defaultConfigs));
    return defaultConfigs;
  },

  async updateRoomConfig(roomId: string, updates: Partial<RoomConfig>): Promise<RoomConfig | null> {
    const configs = await this.getRoomConfigs();
    const index = configs.findIndex(c => c.room_id === roomId);
    if (index === -1) return null;

    const updated = { ...configs[index], ...updates };
    configs[index] = updated;
    localStorage.setItem('rpg_room_configs', JSON.stringify(configs));

    if (!isMock && supabase) {
      try {
        const { error } = await supabase
          .from('rpg_room_configs')
          .upsert({ room_id: roomId, ...updates }, { onConflict: 'room_id' });
        if (error) throw error;
      } catch (err) {
        console.error('Failed to update room config in Supabase:', err);
      }
    }

    this.broadcast('room_config_update', { roomId, updates });
    return updated;
  },

  broadcast(type: string, payload: any) {
    const wrappedPayload = (payload && typeof payload === 'object')
      ? { ...payload, _senderTabId: clientTabId }
      : payload;

    bc.postMessage({ type, payload: wrappedPayload });
    if (supabaseChannel) {
      supabaseChannel.send({
        type: 'broadcast',
        event: type,
        payload: wrappedPayload
      });
    }
    // Also trigger for our own tab/window immediately
    subscribers.forEach(cb => {
      try { cb({ type, payload: wrappedPayload }); } catch (err) { console.error('Error in local subscriber callback:', err); }
    });
  },

  subscribe(callback: (msg: { type: string; payload: any }) => void): () => void {
    subscribers.add(callback);
    return () => {
      subscribers.delete(callback);
    };
  },

  // ==========================================
  // ABSOLUTE TIMER STATE
  // Stored in whiteboard_drawings with room_id='global_timer'
  // ==========================================
  async getTimerState(): Promise<TimerState | null> {
    const defaultTimer: TimerState = { endsAt: 0, running: false, pausedRemaining: 15 * 60 * 1000, totalDuration: 15 * 60 * 1000 };
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('whiteboard_drawings')
          .select('notes')
          .eq('room_id', 'global_timer_state')
          .maybeSingle();
        if (error) throw error;
        if (data?.notes) return data.notes as TimerState;
      } catch (err) {
        console.warn('getTimerState error, fallback to localStorage:', err);
      }
    }
    try {
      const saved = localStorage.getItem('rpg_global_timer_state');
      return saved ? JSON.parse(saved) : defaultTimer;
    } catch {
      return defaultTimer;
    }
  },

  async saveTimerState(state: TimerState): Promise<void> {
    localStorage.setItem('rpg_global_timer_state', JSON.stringify(state));
    if (!isMock && supabase) {
      try {
        await supabase
          .from('whiteboard_drawings')
          .upsert({
            room_id: 'global_timer_state',
            notes: state as any,
            updated_at: new Date().toISOString()
          }, { onConflict: 'room_id' });
      } catch (err) {
        console.error('saveTimerState error:', err);
      }
    }
    // Broadcast to all clients
    this.broadcast('timer_sync_v2', state);
  },

  // ==========================================
  // AGENDA COMMENTS (per-room persistent chat)
  // ==========================================
  async getAgendaComments(roomId: string): Promise<AgendaComment[]> {
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('room_agenda_comments')
          .select('*')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true });
        if (error) throw error;
        return (data || []).map((row: any) => ({
          id: row.id.toString(),
          room_id: row.room_id,
          author_id: row.author_id,
          author_name: row.author_name,
          text: row.text,
          created_at: row.created_at
        }));
      } catch (err) {
        console.warn('getAgendaComments error, fallback:', err);
      }
    }
    const key = `rpg_agenda_comments_${roomId}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
  },

  async addAgendaComment(roomId: string, text: string, authorId: string, authorName: string): Promise<AgendaComment> {
    let newComment: AgendaComment = {
      id: Date.now().toString(),
      room_id: roomId,
      author_id: authorId,
      author_name: authorName,
      text,
      created_at: new Date().toISOString()
    };
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('room_agenda_comments')
          .insert({ room_id: roomId, author_id: authorId, author_name: authorName, text })
          .select();
        if (error) throw error;
        if (data?.[0]) {
          newComment = {
            id: data[0].id.toString(),
            room_id: data[0].room_id,
            author_id: data[0].author_id,
            author_name: data[0].author_name,
            text: data[0].text,
            created_at: data[0].created_at
          };
        }
      } catch (err) {
        console.error('addAgendaComment error:', err);
      }
    }
    // Always persist locally
    const key = `rpg_agenda_comments_${roomId}`;
    const list: AgendaComment[] = JSON.parse(localStorage.getItem(key) || '[]');
    list.push(newComment);
    localStorage.setItem(key, JSON.stringify(list));
    this.broadcast('agenda_comment_add', { roomId, comment: newComment });
    return newComment;
  },

  async clearAgendaComments(roomId: string): Promise<void> {
    if (!isMock && supabase) {
      try {
        await supabase
          .from('room_agenda_comments')
          .delete()
          .eq('room_id', roomId);
      } catch (err) {
        console.error('clearAgendaComments error:', err);
      }
    }
    localStorage.removeItem(`rpg_agenda_comments_${roomId}`);
    this.broadcast('agenda_comments_clear', { roomId });
  },

  // ==========================================
  // ROOM PRESENTATION WORKSPACE SYNC
  // ==========================================
  async getPresentationState(roomId: string): Promise<PresentationState> {
    const defaultState: PresentationState = { fileUrl: '', fileName: '', presenterId: '', presenterName: '', active: false };
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('whiteboard_drawings')
          .select('notes')
          .eq('room_id', `presentation_${roomId}`)
          .maybeSingle();
        if (error) throw error;
        if (data?.notes) return data.notes as unknown as PresentationState;
      } catch (err) {
        console.warn(`getPresentationState error for ${roomId}, fallback:`, err);
      }
    }
    try {
      const saved = localStorage.getItem(`rpg_presentation_${roomId}`);
      return saved ? JSON.parse(saved) : defaultState;
    } catch {
      return defaultState;
    }
  },

  async savePresentationState(roomId: string, state: PresentationState): Promise<void> {
    localStorage.setItem(`rpg_presentation_${roomId}`, JSON.stringify(state));
    if (!isMock && supabase) {
      try {
        await supabase
          .from('whiteboard_drawings')
          .upsert({
            room_id: `presentation_${roomId}`,
            notes: state as any,
            updated_at: new Date().toISOString()
          }, { onConflict: 'room_id' });
      } catch (err) {
        console.error('savePresentationState error:', err);
      }
    }
    // Broadcast to all clients
    this.broadcast('presentation_sync', { roomId, state });
  },

  async getTypingQuestions(): Promise<any[]> {
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('rpg_typing_questions')
          .select('*')
          .order('id', { ascending: true });
        if (!error && data) return data;
      } catch (e) {
        console.warn('Failed to fetch typing questions from DB, falling back to mock:', e);
      }
    }
    const stored = localStorage.getItem('rpg_mock_typing_questions');
    if (stored) {
      return JSON.parse(stored);
    }
    const defaults = [
      { id: '1', soal: 'Ibu kota jepang?', jawaban: 'tokyo' },
      { id: '2', soal: 'Ibu kota indonesia?', jawaban: 'jakarta' },
      { id: '3', soal: '15x16', jawaban: '240' },
      { id: '4', soal: 'heksakosioiheksekontaheksafobia', jawaban: 'heksakosioiheksekontaheksafobia' },
      { id: '5', soal: '7x8', jawaban: '56' },
      { id: '6', soal: 'Apa kepanjangan IEEE?', jawaban: 'institute of electrical and electronics engineers' }
    ];
    localStorage.setItem('rpg_mock_typing_questions', JSON.stringify(defaults));
    return defaults;
  },

  async addTypingQuestion(soal: string, jawaban: string): Promise<any> {
    const cleanJawaban = jawaban.trim().toLowerCase();
    if (!isMock && supabase) {
      try {
        const { data, error } = await supabase
          .from('rpg_typing_questions')
          .insert([{ soal, jawaban: cleanJawaban }])
          .select();
        if (!error && data) {
          this.broadcast('typing_questions_update', {});
          return data[0];
        }
      } catch (e) {
        console.error('Failed to add typing question in DB:', e);
      }
    }
    const list = await this.getTypingQuestions();
    const newId = String(Date.now());
    const newItem = { id: newId, soal, jawaban: cleanJawaban };
    const updated = [...list, newItem];
    localStorage.setItem('rpg_mock_typing_questions', JSON.stringify(updated));
    this.broadcast('typing_questions_update', {});
    return newItem;
  },

  async deleteTypingQuestion(id: string): Promise<boolean> {
    if (!isMock && supabase) {
      try {
        const { error } = await supabase
          .from('rpg_typing_questions')
          .delete()
          .eq('id', id);
        if (!error) {
          this.broadcast('typing_questions_update', {});
          return true;
        }
      } catch (e) {
        console.error('Failed to delete typing question in DB:', e);
      }
    }
    const list = await this.getTypingQuestions();
    const updated = list.filter((item: any) => String(item.id) !== String(id));
    localStorage.setItem('rpg_mock_typing_questions', JSON.stringify(updated));
    this.broadcast('typing_questions_update', {});
    return true;
  }
};
