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
  sub_div_id: 'Academic' | 'Pub' | 'Project' | 'Comp' | 'All';
  level: number;
  sprite_json: {
    base: string;
    hair: string;
    outfit: string;
    accessory: string;
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

export interface WhiteboardStroke {
  id: string;
  tool: 'pen' | 'eraser';
  color: string;
  width: number;
  points: { x: number; y: number }[];
}

export interface StickyNote {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
}

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
    sub_div_id: 'Academic',
    level: 5,
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
    sub_div_id: 'Pub',
    level: 5,
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
    sub_div_id: 'Project',
    level: 5,
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
    sub_div_id: 'Comp',
    level: 5,
    sprite_json: { base: 'base_2', hair: 'hair_grey', outfit: 'outfit_purple', accessory: 'none' },
    pet_id: 'owl',
    current_status: '💻 Debugging',
    current_seat_id: null,
    last_seen: new Date().toISOString()
  },
  // Staff Academic
  { id: 'staff_acad_1', name: 'Eka Saputra', role: 'Staff', sub_div_id: 'Academic', level: 2, sprite_json: { base: 'base_3', hair: 'hair_black', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'none', current_status: '☕ Minum kopi', current_seat_id: null, last_seen: new Date().toISOString() },
  { id: 'staff_acad_2', name: 'Farhan Azhar', role: 'Staff', sub_div_id: 'Academic', level: 3, sprite_json: { base: 'base_1', hair: 'hair_brown', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'cat', current_status: '🔥 Semangat', current_seat_id: null, last_seen: new Date().toISOString() },
  { id: 'staff_acad_3', name: 'Gita Lestari', role: 'Staff', sub_div_id: 'Academic', level: 1, sprite_json: { base: 'base_2', hair: 'hair_yellow', outfit: 'outfit_casual', accessory: 'glasses' }, pet_id: 'none', current_status: '📝 Menyimak', current_seat_id: null, last_seen: new Date().toISOString() },
  { id: 'staff_acad_4', name: 'Hari Wijaya', role: 'Staff', sub_div_id: 'Academic', level: 2, sprite_json: { base: 'base_3', hair: 'hair_red', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'none', current_status: '💤 Mengantuk', current_seat_id: null, last_seen: new Date().toISOString() },
  // Staff Pub
  { id: 'staff_pub_1', name: 'Indah Kusuma', role: 'Staff', sub_div_id: 'Pub', level: 2, sprite_json: { base: 'base_2', hair: 'hair_brown', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'dog', current_status: '🎨 Ngedesain', current_seat_id: null, last_seen: new Date().toISOString() },
  { id: 'staff_pub_2', name: 'Joko Susilo', role: 'Staff', sub_div_id: 'Pub', level: 1, sprite_json: { base: 'base_3', hair: 'hair_black', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'none', current_status: '☕ Low Energy', current_seat_id: null, last_seen: new Date().toISOString() },
  { id: 'staff_pub_3', name: 'Kartika Sari', role: 'Staff', sub_div_id: 'Pub', level: 3, sprite_json: { base: 'base_1', hair: 'hair_yellow', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'slime', current_status: '✨ Ready', current_seat_id: null, last_seen: new Date().toISOString() },
  // Staff Project
  { id: 'staff_proj_1', name: 'Luthfi Hakim', role: 'Staff', sub_div_id: 'Project', level: 2, sprite_json: { base: 'base_3', hair: 'hair_black', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'none', current_status: '📅 Bikin timeline', current_seat_id: null, last_seen: new Date().toISOString() },
  { id: 'staff_proj_2', name: 'Mega Utami', role: 'Staff', sub_div_id: 'Project', level: 2, sprite_json: { base: 'base_2', hair: 'hair_brown', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'cat', current_status: '💡 Ada ide', current_seat_id: null, last_seen: new Date().toISOString() },
  { id: 'staff_proj_3', name: 'Naufal Pratama', role: 'Staff', sub_div_id: 'Project', level: 3, sprite_json: { base: 'base_1', hair: 'hair_grey', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'owl', current_status: '🍕 Makan dulu', current_seat_id: null, last_seen: new Date().toISOString() },
  // Staff Comp
  { id: 'staff_comp_1', name: 'Sarah Amanda', role: 'Staff', sub_div_id: 'Comp', level: 2, sprite_json: { base: 'base_2', hair: 'hair_black', outfit: 'outfit_casual', accessory: 'glasses' }, pet_id: 'none', current_status: '🚀 Deploying', current_seat_id: null, last_seen: new Date().toISOString() },
  { id: 'staff_comp_2', name: 'Taufik Hidayat', role: 'Staff', sub_div_id: 'Comp', level: 3, sprite_json: { base: 'base_3', hair: 'hair_brown', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'dog', current_status: '👾 Ngoding game', current_seat_id: null, last_seen: new Date().toISOString() },
  { id: 'staff_comp_3', name: 'Umam Alfarizi', role: 'Staff', sub_div_id: 'Comp', level: 1, sprite_json: { base: 'base_1', hair: 'hair_red', outfit: 'outfit_casual', accessory: 'none' }, pet_id: 'none', current_status: '🔍 Riset data', current_seat_id: null, last_seen: new Date().toISOString() }
];

// Seed initial localStorage items if mock
if (isMock) {
  if (!localStorage.getItem('rpg_profiles')) {
    localStorage.setItem('rpg_profiles', JSON.stringify(DEFAULT_PROFILES));
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

// Setup Supabase Realtime Channel if database connection is real (not mock)
let supabaseChannel: any = null;
if (!isMock && supabase) {
  supabaseChannel = supabase.channel('rpg_org_global_realtime');
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

  // Seats
  async getSeats(roomId: string): Promise<Seat[]> {
    const profiles = await this.getProfiles();
    // Return mock seats calculated based on room layout
    // 22 seats for Guild Hall, 12 for Carriage, 12 for Boat, 26 for Tavern
    let count = 22;
    if (roomId === 'carriage' || roomId === 'boat') count = 12;
    else if (roomId === 'tavern') count = 26;

    const seats: Seat[] = Array.from({ length: count }, (_, i) => {
      // Find who sits here
      const seatId = `${roomId}_seat_${i + 1}`;
      const occupant = profiles.find(p => p.current_seat_id === seatId);
      
      // Coordinate logic for rendering layout
      let x = 0, y = 0;
      if (roomId === 'guild_hall') {
        // Oval arrangement around a center table (x: 50%, y: 50%)
        const angle = (i / count) * Math.PI * 2;
        x = Math.round(50 + Math.cos(angle) * 38); // percentage
        y = Math.round(50 + Math.sin(angle) * 28);
      } else if (roomId === 'carriage') {
        // Two facing rows (x: 30% and 70%) with a walkway in the middle
        const row = i % 2;
        const index = Math.floor(i / 2);
        x = row === 0 ? 25 : 75;
        y = 20 + index * 13;
      } else if (roomId === 'boat') {
        // Rows along the edge of the boat
        const row = i % 2;
        const index = Math.floor(i / 2);
        x = row === 0 ? 35 : 65;
        y = 25 + index * 12;
      } else if (roomId === 'tavern') {
        if (i < 10) {
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

    return seats;
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

  // Whiteboard / Drawings & Notes
  async getWhiteboard(roomId: string): Promise<{ strokes: WhiteboardStroke[], notes: StickyNote[] }> {
    const data = JSON.parse(localStorage.getItem('rpg_whiteboard') || '{}');
    return data[roomId] || { strokes: [], notes: [] };
  },

  async saveWhiteboard(roomId: string, strokes: WhiteboardStroke[], notes: StickyNote[]): Promise<boolean> {
    const data = JSON.parse(localStorage.getItem('rpg_whiteboard') || '{}');
    data[roomId] = { strokes, notes };
    localStorage.setItem('rpg_whiteboard', JSON.stringify(data));
    this.broadcast('whiteboard_update', { roomId, strokes, notes });
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

  async createMember(email: string, password: string, name: string, role: 'Director' | 'Manager' | 'Staff', subDivId: 'Academic' | 'Pub' | 'Project' | 'Comp' | 'All'): Promise<boolean> {
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

  // Broadcast & Subscriptions
  broadcast(type: string, payload: any) {
    bc.postMessage({ type, payload });
    if (supabaseChannel) {
      supabaseChannel.send({
        type: 'broadcast',
        event: type,
        payload: payload
      });
    }
  },

  subscribe(callback: (msg: { type: string; payload: any }) => void): () => void {
    const handler = (e: MessageEvent) => {
      callback(e.data);
    };
    bc.addEventListener('message', handler);

    if (supabaseChannel) {
      supabaseChannel.on('broadcast', { event: '*' }, (msg: any) => {
        callback({ type: msg.event, payload: msg.payload });
      });
      
      if (supabaseChannel.state !== 'joined') {
        supabaseChannel.subscribe();
      }
    }

    return () => {
      bc.removeEventListener('message', handler);
    };
  }
};
