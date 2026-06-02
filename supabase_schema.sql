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
    room_id TEXT NOT NULL,
    strokes JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.whiteboard_drawings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read drawings" ON public.whiteboard_drawings FOR SELECT USING (true);
CREATE POLICY "Allow public update drawings" ON public.whiteboard_drawings FOR ALL USING (true);

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
