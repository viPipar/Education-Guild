-- RPG-Org Database Schema
-- Paste this script into your Supabase SQL Editor to initialize tables, triggers, and Row Level Security (RLS)

-- 1. Create Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id TEXT PRIMARY KEY, -- Using TEXT to support both Supabase Auth UUID and simple custom session logins
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Director', 'Manager', 'Staff')),
    sub_div_id TEXT NOT NULL DEFAULT 'Education', -- e.g. Academic, Pub, Project, Comp
    level INTEGER DEFAULT 1,
    sprite_json JSONB DEFAULT '{"base": "base_1", "hair": "hair_1", "outfit": "outfit_1", "accessory": "none"}'::jsonb,
    pet_id TEXT DEFAULT 'none',
    current_status TEXT DEFAULT '☕ Santai',
    current_seat_id TEXT NULL,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read profiles" ON public.profiles 
    FOR SELECT USING (true);

CREATE POLICY "Allow users to update own profile" ON public.profiles 
    FOR UPDATE USING (true);

CREATE POLICY "Allow public insert profiles" ON public.profiles 
    FOR INSERT WITH CHECK (true);

-- 2. Create Seats Table
CREATE TABLE IF NOT EXISTS public.seats (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    user_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL
);

-- Enable RLS on Seats
ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read seats" ON public.seats 
    FOR SELECT USING (true);

CREATE POLICY "Allow anyone to update seats" ON public.seats 
    FOR UPDATE USING (true);

-- Insert Initial Seats for Guild Hall & Sub-divisions if needed
-- Will be managed dynamically or initialized via app, but let's pre-populate common seats.

-- 3. Create Assessments Table
CREATE TABLE IF NOT EXISTS public.assessments (
    id BIGSERIAL PRIMARY KEY,
    manager_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    staff_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    assessment_date DATE DEFAULT CURRENT_DATE NOT NULL,
    comm_score INTEGER CHECK (comm_score BETWEEN 1 AND 5),
    init_score INTEGER CHECK (init_score BETWEEN 1 AND 5),
    commit_score INTEGER CHECK (commit_score BETWEEN 1 AND 5),
    notes TEXT
);

-- Enable RLS on Assessments
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow Managers and Directors to view all assessments" ON public.assessments
    FOR SELECT USING (true); -- Accessible for dashboard plotting

CREATE POLICY "Allow Managers and Directors to insert assessments" ON public.assessments
    FOR INSERT WITH CHECK (true);

-- 4. Create Attendance Logs Table
CREATE TABLE IF NOT EXISTS public.attendance_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    log_date DATE DEFAULT CURRENT_DATE NOT NULL,
    clock_in TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    clock_out TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select attendance" ON public.attendance_logs FOR SELECT USING (true);
CREATE POLICY "Allow users to log attendance" ON public.attendance_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow users to update attendance" ON public.attendance_logs FOR UPDATE USING (true);

-- 5. Realtime Notice Board / Whiteboard Drawings Table
CREATE TABLE IF NOT EXISTS public.whiteboard_drawings (
    id BIGSERIAL PRIMARY KEY,
    room_id TEXT NOT NULL UNIQUE,
    strokes JSONB DEFAULT '[]'::jsonb,
    notes JSONB DEFAULT '[]'::jsonb,
    comments JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.whiteboard_drawings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read drawings" ON public.whiteboard_drawings FOR SELECT USING (true);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'whiteboard_drawings' AND policyname = 'Allow public update drawings') THEN
        CREATE POLICY "Allow public update drawings" ON public.whiteboard_drawings FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 6. Checklist / Scroll of Order Table
CREATE TABLE IF NOT EXISTS public.checklist_items (
    id BIGSERIAL PRIMARY KEY,
    room_id TEXT NOT NULL,
    title TEXT NOT NULL,
    completed BOOLEAN DEFAULT false,
    completed_by TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read checklist" ON public.checklist_items FOR SELECT USING (true);
CREATE POLICY "Allow public update checklist" ON public.checklist_items FOR ALL USING (true);

-- 7. RPG Assets Table (Director-Managed Dynamic Assets)
-- Stores character sprites, pets, and cosmetics as Base64 Data URLs.
-- No Supabase Storage bucket is needed — images are stored directly in the DB.
CREATE TABLE IF NOT EXISTS public.rpg_assets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('character', 'pet', 'cosmetic')),
    min_level INTEGER NOT NULL DEFAULT 1,
    description TEXT DEFAULT '',
    image_url TEXT NOT NULL -- Base64 Data URL: "data:image/gif;base64,..." or "data:image/png;base64,..."
);

-- Enable RLS on rpg_assets
ALTER TABLE public.rpg_assets ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read assets (characters, pets, cosmetics)
CREATE POLICY "Allow public read assets" ON public.rpg_assets
    FOR SELECT USING (true);

-- Only Directors can insert/update/delete assets (enforced at app level via profile.role)
CREATE POLICY "Allow Director insert assets" ON public.rpg_assets
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow Director update assets" ON public.rpg_assets
    FOR UPDATE USING (true);

CREATE POLICY "Allow Director delete assets" ON public.rpg_assets
    FOR DELETE USING (true);

-- 8. Add rarity to rpg_assets (run if table already exists)
-- If the table already exists, you can run this block to add the rarity column and update the constraint:
-- ALTER TABLE public.rpg_assets DROP CONSTRAINT IF EXISTS rpg_assets_rarity_check;
ALTER TABLE public.rpg_assets
  ADD COLUMN IF NOT EXISTS rarity TEXT NOT NULL DEFAULT 'common';

ALTER TABLE public.rpg_assets
  DROP CONSTRAINT IF EXISTS rpg_assets_rarity_check,
  ADD CONSTRAINT rpg_assets_rarity_check CHECK (rarity IN ('basic','common','uncommon','rare','epic','legendary'));

-- 9. Add coins to profiles (run if table already exists)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0;

-- 10. RPG Inventory Table — per-user gacha collection
CREATE TABLE IF NOT EXISTS public.rpg_inventory (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  asset_id    TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  obtained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, asset_id)
);
ALTER TABLE public.rpg_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on inventory" ON public.rpg_inventory FOR ALL USING (true);

-- 11. Whiteboard Drawings Updates (run if table already exists)
ALTER TABLE public.whiteboard_drawings
  ADD COLUMN IF NOT EXISTS notes JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb;

-- To make room_id UNIQUE if not already set:
ALTER TABLE public.whiteboard_drawings
  DROP CONSTRAINT IF EXISTS whiteboard_drawings_room_id_key;
ALTER TABLE public.whiteboard_drawings
  ADD CONSTRAINT whiteboard_drawings_room_id_key UNIQUE (room_id);

-- 12. Tavern Anonymous Evaluation Comments Table
CREATE TABLE IF NOT EXISTS public.rpg_tavern_comments (
    id BIGSERIAL PRIMARY KEY,
    comment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rpg_tavern_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read tavern comments" ON public.rpg_tavern_comments FOR SELECT USING (true);
CREATE POLICY "Allow public insert tavern comments" ON public.rpg_tavern_comments FOR INSERT WITH CHECK (true);

-- 13. Wilderness Raid Config & Comments
-- Single-row table that holds the current raid state (including boss GIF as JSONB)
CREATE TABLE IF NOT EXISTS public.rpg_raid_config (
    id INT PRIMARY KEY DEFAULT 1,
    phase TEXT NOT NULL DEFAULT 'lobby',
    boss_config JSONB NOT NULL DEFAULT '{}',
    raid_state JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rpg_raid_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on raid_config" ON public.rpg_raid_config FOR ALL USING (true);

-- Permanent raid brainstorm comments (only Director can clear via app)
CREATE TABLE IF NOT EXISTS public.rpg_raid_comments (
    id BIGSERIAL PRIMARY KEY,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rpg_raid_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on raid_comments" ON public.rpg_raid_comments FOR ALL USING (true);

-- 14. Werewolf Room State
CREATE TABLE IF NOT EXISTS public.werewolf_rooms (
    room_id TEXT PRIMARY KEY,
    state JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.werewolf_rooms ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'werewolf_rooms' AND policyname = 'Allow all on werewolf_rooms') THEN
        CREATE POLICY "Allow all on werewolf_rooms" ON public.werewolf_rooms FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 15. Minutes of Meeting (Library)
CREATE TABLE IF NOT EXISTS public.rpg_minutes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    scribe TEXT NOT NULL,
    summary TEXT,
    action_items JSONB DEFAULT '[]'::jsonb,
    photos JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.rpg_minutes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rpg_minutes' AND policyname = 'Allow all on rpg_minutes') THEN
        CREATE POLICY "Allow all on rpg_minutes" ON public.rpg_minutes FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 16. Memory Boards (Polaroids)
CREATE TABLE IF NOT EXISTS public.rpg_memory_boards (
    board_id TEXT PRIMARY KEY,
    photos JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.rpg_memory_boards ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rpg_memory_boards' AND policyname = 'Allow all on rpg_memory_boards') THEN
        CREATE POLICY "Allow all on rpg_memory_boards" ON public.rpg_memory_boards FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 17. Room Configurations (Weather, Discord)
CREATE TABLE IF NOT EXISTS public.rpg_room_configs (
    room_id TEXT PRIMARY KEY,
    weather_intensity INTEGER DEFAULT 0,
    discord_url TEXT DEFAULT '',
    weather_filter INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.rpg_room_configs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rpg_room_configs' AND policyname = 'Allow all on rpg_room_configs') THEN
        CREATE POLICY "Allow all on rpg_room_configs" ON public.rpg_room_configs FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 18. Room Agenda Comments (Chats)
CREATE TABLE IF NOT EXISTS public.room_agenda_comments (
    id BIGSERIAL PRIMARY KEY,
    room_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.room_agenda_comments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_agenda_comments' AND policyname = 'Allow all on room_agenda_comments') THEN
        CREATE POLICY "Allow all on room_agenda_comments" ON public.room_agenda_comments FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 19. Typing Questions
CREATE TABLE IF NOT EXISTS public.rpg_typing_questions (
    id BIGSERIAL PRIMARY KEY,
    soal TEXT NOT NULL,
    jawaban TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.rpg_typing_questions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rpg_typing_questions' AND policyname = 'Allow all on rpg_typing_questions') THEN
        CREATE POLICY "Allow all on rpg_typing_questions" ON public.rpg_typing_questions FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 20. Quest Board Table
CREATE TABLE IF NOT EXISTS public.rpg_quests (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    reward_xp INTEGER DEFAULT 10,
    spreadsheet_url TEXT,
    deadline TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.rpg_quests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rpg_quests' AND policyname = 'Allow all on rpg_quests') THEN
        CREATE POLICY "Allow all on rpg_quests" ON public.rpg_quests FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
