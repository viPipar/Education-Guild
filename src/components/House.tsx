import React, { useState, useEffect } from 'react';
import type { Profile } from '../lib/supabase';
import { db } from '../lib/supabase';
import { SpriteRenderer } from './SpriteRenderer';
import { Shield, Sparkles, Smile, Award, LogIn } from 'lucide-react';
import { playClick, playSelect } from '../lib/audio';

interface HouseProps {
  profiles: Profile[];
  currentProfile: Profile | null;
  onLogin: (profile: Profile) => void;
  onUpdateProfile: (updates: Partial<Profile>) => void;
}

export const House: React.FC<HouseProps> = ({
  currentProfile,
  onLogin,
  onUpdateProfile
}) => {
  // Login Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Unlocked cosmetics state
  const [unlockedCosmetics, setUnlockedCosmetics] = useState<string[]>([]);

  useEffect(() => {
    if (currentProfile) {
      const savedUnlocked = localStorage.getItem(`rpg_unlocked_cosmetics_${currentProfile.id}`);
      if (savedUnlocked) {
        setUnlockedCosmetics(JSON.parse(savedUnlocked));
      } else {
        const defaults = ['hair_black', 'hair_brown', 'outfit_casual', 'none'];
        setUnlockedCosmetics(defaults);
      }
    }
  }, [currentProfile?.id]);

  // Change Password States
  const [newPassword, setNewPassword] = useState('');
  const [changePasswordSuccess, setChangePasswordSuccess] = useState('');
  const [changePasswordError, setChangePasswordError] = useState('');
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);

  // Add Member States (Director Only)
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regRole, setRegRole] = useState<'Director' | 'Manager' | 'Staff'>('Staff');
  const [regSubDiv, setRegSubDiv] = useState<'Academic' | 'Pub' | 'Project' | 'Comp' | 'All'>('Academic');
  const [regSuccess, setRegSuccess] = useState('');
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  // Status Form States
  const [customStatusText, setCustomStatusText] = useState('');
  const [customStatusEmoji, setCustomStatusEmoji] = useState('🔥');

  // Customize Options
  const baseOptions = [
    { id: 'base_1', name: 'Putih Gading' },
    { id: 'base_2', name: 'Kuning Langsat' },
    { id: 'base_3', name: 'Sawo Matang' }
  ];

  const hairOptions = [
    { id: 'hair_black', name: 'Spike Hitam' },
    { id: 'hair_brown', name: 'Bob Cokelat' },
    { id: 'hair_yellow', name: 'Spike Emas' },
    { id: 'hair_red', name: 'Spike Merah' },
    { id: 'hair_grey', name: 'Bob Kelabu' }
  ];

  const outfitOptions = [
    { id: 'outfit_casual', name: 'Casual Orange' },
    { id: 'outfit_gold', name: 'Director Royal' },
    { id: 'outfit_blue', name: 'Academic Robe' },
    { id: 'outfit_green', name: 'Pub Cloak' },
    { id: 'outfit_red', name: 'Project Suit' },
    { id: 'outfit_purple', name: 'Comp Wizard' }
  ];

  const accessoryOptions = [
    { id: 'none', name: 'Tidak Ada Aksesori' },
    { id: 'glasses', name: 'Kacamata Baca' },
    { id: 'crown', name: 'Mahkota Emas' },
    { id: 'headset', name: 'Gamer Headset' }
  ];

  const petOptions = [
    { id: 'none', name: 'Tidak Ada Pet', minLevel: 1 },
    { id: 'cat', name: 'Kucing Orange', minLevel: 1 },
    { id: 'dog', name: 'Anjing Shiba', minLevel: 1 },
    { id: 'slime', name: 'Slime Hijau', minLevel: 2 },
    { id: 'owl', name: 'Burung Hantu', minLevel: 4 },
    { id: 'dragon', name: 'Naga Ungu (VIP)', minLevel: 8 }
  ];

  const statusEmojis = ['🔥', '☕', '💻', '💤', '✨', '🍔', '💡', '📖', '🎨', '🚀'];

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setLoginError('Email dan password wajib diisi!');
      return;
    }
    setLoginError('');
    setLoginLoading(true);
    playClick();
    try {
      const profile = await db.signIn(email, password);
      if (profile) {
        onLogin(profile);
      } else {
        setLoginError('Gagal memuat profil setelah login.');
      }
    } catch (err: any) {
      console.error(err);
      setLoginError(err.message || 'Login gagal. Periksa kembali email dan password Anda.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setChangePasswordError('Password minimal 6 karakter!');
      return;
    }
    setChangePasswordError('');
    setChangePasswordSuccess('');
    setChangePasswordLoading(true);
    playClick();
    try {
      await db.changePassword(newPassword);
      setChangePasswordSuccess('Password berhasil diubah!');
      setNewPassword('');
    } catch (err: any) {
      console.error(err);
      setChangePasswordError(err.message || 'Gagal mengubah password.');
    } finally {
      setChangePasswordLoading(false);
    }
  };

  const handleRegisterMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regEmail.trim() || !regPassword.trim() || !regName.trim()) {
      setRegError('Semua field wajib diisi!');
      return;
    }
    if (regPassword.length < 6) {
      setRegError('Password minimal 6 karakter!');
      return;
    }
    setRegError('');
    setRegSuccess('');
    setRegLoading(true);
    playClick();
    try {
      await db.createMember(regEmail, regPassword, regName, regRole, regSubDiv);
      setRegSuccess(`Akun untuk ${regName} berhasil dibuat!`);
      setRegEmail('');
      setRegPassword('');
      setRegName('');
    } catch (err: any) {
      console.error(err);
      setRegError(err.message || 'Gagal membuat akun staf baru.');
    } finally {
      setRegLoading(false);
    }
  };

  const handleStatusSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProfile) return;
    playClick();
    const fullStatus = `${customStatusEmoji} ${customStatusText || 'Online'}`;
    onUpdateProfile({ current_status: fullStatus });
    setCustomStatusText('');
  };

  // Carousel Next/Prev Logic
  const handleCarouselChange = (
    layer: 'base' | 'hair' | 'outfit' | 'accessory',
    options: { id: string; name: string }[],
    direction: 'next' | 'prev'
  ) => {
    if (!currentProfile) return;
    playSelect();
    const currentValue = currentProfile.sprite_json[layer];
    const currentIndex = options.findIndex(opt => opt.id === currentValue);
    
    let newIndex = 0;
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % options.length;
    } else {
      newIndex = (currentIndex - 1 + options.length) % options.length;
    }

    const currentSprite = { ...currentProfile.sprite_json };
    currentSprite[layer] = options[newIndex].id;
    onUpdateProfile({ sprite_json: currentSprite });
  };

  const handlePetCarouselChange = (direction: 'next' | 'prev') => {
    if (!currentProfile) return;
    playSelect();
    
    // Filter available pets based on current user level
    const availablePets = petOptions.filter(pet => currentProfile.level >= pet.minLevel);
    const currentIndex = availablePets.findIndex(pet => pet.id === currentProfile.pet_id);
    
    let newIndex = 0;
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % availablePets.length;
    } else {
      newIndex = (currentIndex - 1 + availablePets.length) % availablePets.length;
    }
    
    onUpdateProfile({ pet_id: availablePets[newIndex].id });
  };

  const handleEmojiCarouselChange = (direction: 'next' | 'prev') => {
    playSelect();
    const currentIndex = statusEmojis.indexOf(customStatusEmoji);
    let newIndex = 0;
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % statusEmojis.length;
    } else {
      newIndex = (currentIndex - 1 + statusEmojis.length) % statusEmojis.length;
    }
    setCustomStatusEmoji(statusEmojis[newIndex]);
  };

  if (!currentProfile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] p-4 bg-[#0f0f13]">
        <form onSubmit={handleLoginSubmit} className="rpg-panel-stone max-w-md w-full p-8 text-center">
          <div className="flex justify-center mb-4 text-[#ffd700]">
            <Shield size={48} className="animate-pulse" />
          </div>
          <h2 className="rpg-font-retro text-yellow-500 text-base mb-1">MEMBERS GATE</h2>
          <span className="text-[8px] rpg-font-retro text-slate-400 block mb-6">MASUK MENGGUNAKAN EMAIL & PASSWORD</span>
          
          <div className="mb-4 text-left text-xs font-semibold">
            <label className="block text-[9px] rpg-font-retro text-slate-400 mb-2">EMAIL AKSES</label>
            <input
              type="email"
              required
              placeholder="e.g. director@rpg.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#16110e] text-yellow-100 p-3.5 rounded border border-[#5a3d28] focus:outline-none font-bold"
            />
          </div>

          <div className="mb-6 text-left text-xs font-semibold">
            <label className="block text-[9px] rpg-font-retro text-slate-400 mb-2">PASSWORD</label>
            <input
              type="password"
              required
              placeholder="Masukkan password Anda"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#16110e] text-yellow-100 p-3.5 rounded border border-[#5a3d28] focus:outline-none font-bold"
            />
          </div>

          {loginError && <span className="text-[9px] text-red-500 font-bold block mb-4">{loginError}</span>}

          <button
            type="submit"
            disabled={loginLoading}
            className="rpg-btn-game w-full flex items-center justify-center gap-2 py-3"
          >
            <LogIn size={14} /> {loginLoading ? 'MASUK...' : 'MASUK KE GUILD HALL'}
          </button>
        </form>
      </div>
    );
  }

  // Get active item names
  const activeBaseName = baseOptions.find(opt => opt.id === currentProfile.sprite_json.base)?.name || 'Default';
  
  // Filter options based on unlocked items
  const hairOptionsFiltered = hairOptions.filter(opt => 
    opt.id === 'hair_black' || opt.id === 'hair_brown' || unlockedCosmetics.includes(opt.id)
  );
  const outfitOptionsFiltered = outfitOptions.filter(opt => 
    opt.id === 'outfit_casual' || unlockedCosmetics.includes(opt.id)
  );
  const accessoryOptionsFiltered = accessoryOptions.filter(opt => 
    opt.id === 'none' || unlockedCosmetics.includes(opt.id)
  );

  const activeHairName = hairOptions.find(opt => opt.id === currentProfile.sprite_json.hair)?.name || 'Default';
  const activeOutfitName = outfitOptions.find(opt => opt.id === currentProfile.sprite_json.outfit)?.name || 'Default';
  const activeAccessoryName = accessoryOptions.find(opt => opt.id === currentProfile.sprite_json.accessory)?.name || 'Default';
  const activePetName = petOptions.find(opt => opt.id === currentProfile.pet_id)?.name || 'Tidak Ada';

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      
      {/* 1. UNIFIED CHARACTER WARDROBE (Carousel directly on left/right of big character) */}
      <div className="rpg-panel-stone p-6 relative flex flex-col items-center">
        <div className="rpg-plaque absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1">
          <Sparkles size={12} className="text-yellow-400" /> CHARACTER WARDROBE
        </div>
        
        <div className="flex flex-col md:flex-row items-center justify-center gap-8 mt-6 w-full max-w-3xl">
          
          {/* LEFT COLUMN CUSTOMIZERS */}
          <div className="flex flex-col gap-4 w-full md:w-56">
            
            {/* Skin */}
            <div className="flex flex-col p-2 bg-[#16110e] border border-[#5a3d28]/60 rounded-md">
              <span className="text-[8px] rpg-font-retro text-amber-500 mb-1 block text-center">BODY SKIN</span>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleCarouselChange('base', baseOptions, 'prev')}
                  className="rpg-btn-game py-0.5 px-2 text-[9px] font-bold"
                >
                  ◀
                </button>
                <span className="text-[10px] font-bold text-yellow-100 text-center flex-1 truncate">{activeBaseName}</span>
                <button
                  type="button"
                  onClick={() => handleCarouselChange('base', baseOptions, 'next')}
                  className="rpg-btn-game py-0.5 px-2 text-[9px] font-bold"
                >
                  ▶
                </button>
              </div>
            </div>

            {/* Hair style */}
            <div className="flex flex-col p-2 bg-[#16110e] border border-[#5a3d28]/60 rounded-md">
              <span className="text-[8px] rpg-font-retro text-amber-500 mb-1 block text-center">HAIR STYLE</span>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleCarouselChange('hair', hairOptionsFiltered, 'prev')}
                  className="rpg-btn-game py-0.5 px-2 text-[9px] font-bold"
                >
                  ◀
                </button>
                <span className="text-[10px] font-bold text-yellow-100 text-center flex-1 truncate">{activeHairName}</span>
                <button
                  type="button"
                  onClick={() => handleCarouselChange('hair', hairOptionsFiltered, 'next')}
                  className="rpg-btn-game py-0.5 px-2 text-[9px] font-bold"
                >
                  ▶
                </button>
              </div>
            </div>

            {/* Pet Stable */}
            <div className="flex flex-col p-2 bg-[#16110e] border border-[#5a3d28]/60 rounded-md">
              <span className="text-[8px] rpg-font-retro text-amber-500 mb-1 block text-center">PET STABLE</span>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handlePetCarouselChange('prev')}
                  className="rpg-btn-game py-0.5 px-2 text-[9px] font-bold"
                >
                  ◀
                </button>
                <span className="text-[10px] font-bold text-yellow-100 text-center flex-1 truncate">{activePetName}</span>
                <button
                  type="button"
                  onClick={() => handlePetCarouselChange('next')}
                  className="rpg-btn-game py-0.5 px-2 text-[9px] font-bold"
                >
                  ▶
                </button>
              </div>
            </div>

          </div>

          {/* CENTER LARGE CHARACTER PREVIEW (size = 144) */}
          <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-b from-[#2b1f1a] to-[#17110e] border-4 border-[#5a3d28] rounded-lg shadow-2xl w-64 h-64 relative">
            <div className="absolute top-2 right-3 text-[#ffd700] text-[8px] font-bold font-mono">
              LV. {currentProfile.level}
            </div>
            
            <SpriteRenderer
              base={currentProfile.sprite_json.base}
              hair={currentProfile.sprite_json.hair}
              outfit={currentProfile.sprite_json.outfit}
              accessory={currentProfile.sprite_json.accessory}
              petId={currentProfile.pet_id}
              size={144}
              className="transform hover:scale-105 transition-transform drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)]"
            />
            
            <div className="mt-3 bg-slate-950/95 border border-[#cca566]/40 px-3.5 py-1 rounded flex items-center gap-1.5 shadow-md">
              <span className="font-bold text-xs text-yellow-50">{currentProfile.name}</span>
            </div>
          </div>

          {/* RIGHT COLUMN CUSTOMIZERS */}
          <div className="flex flex-col gap-4 w-full md:w-56">

            {/* Outfit cloak */}
            <div className="flex flex-col p-2 bg-[#16110e] border border-[#5a3d28]/60 rounded-md">
              <span className="text-[8px] rpg-font-retro text-amber-500 mb-1 block text-center">OUTFIT CLOAK</span>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleCarouselChange('outfit', outfitOptionsFiltered, 'prev')}
                  className="rpg-btn-game py-0.5 px-2 text-[9px] font-bold"
                >
                  ◀
                </button>
                <span className="text-[10px] font-bold text-yellow-100 text-center flex-1 truncate">{activeOutfitName}</span>
                <button
                  type="button"
                  onClick={() => handleCarouselChange('outfit', outfitOptionsFiltered, 'next')}
                  className="rpg-btn-game py-0.5 px-2 text-[9px] font-bold"
                >
                  ▶
                </button>
              </div>
            </div>

            {/* Head Gear */}
            <div className="flex flex-col p-2 bg-[#16110e] border border-[#5a3d28]/60 rounded-md">
              <span className="text-[8px] rpg-font-retro text-amber-500 mb-1 block text-center">HEAD GEAR</span>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleCarouselChange('accessory', accessoryOptionsFiltered, 'prev')}
                  className="rpg-btn-game py-0.5 px-2 text-[9px] font-bold"
                >
                  ◀
                </button>
                <span className="text-[10px] font-bold text-yellow-100 text-center flex-1 truncate">{activeAccessoryName}</span>
                <button
                  type="button"
                  onClick={() => handleCarouselChange('accessory', accessoryOptionsFiltered, 'next')}
                  className="rpg-btn-game py-0.5 px-2 text-[9px] font-bold"
                >
                  ▶
                </button>
              </div>
            </div>

            {/* Status Emoji Carousel */}
            <div className="flex flex-col p-2 bg-[#16110e] border border-[#5a3d28]/60 rounded-md">
              <span className="text-[8px] rpg-font-retro text-amber-500 mb-1 block text-center">STATUS EMOJI</span>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleEmojiCarouselChange('prev')}
                  className="rpg-btn-game py-0.5 px-2 text-[9px] font-bold"
                >
                  ◀
                </button>
                <span className="text-sm text-center flex-1">{customStatusEmoji}</span>
                <button
                  type="button"
                  onClick={() => handleEmojiCarouselChange('next')}
                  className="rpg-btn-game py-0.5 px-2 text-[9px] font-bold"
                >
                  ▶
                </button>
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* 2. SUB CONTENT PANELS (Split layout bottom) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Left Column: Visual Room Room View & Status Text update */}
        <div className="flex flex-col gap-4">
          
          {/* Room Frame */}
          <div className="rpg-panel-stone h-[260px] relative overflow-hidden flex flex-col justify-between" style={{
            background: 'linear-gradient(to bottom, #2b1f1a 0%, #17110e 100%)',
            backgroundImage: 'radial-gradient(#4e3629 1px, transparent 1px)',
            backgroundSize: '16px 16px'
          }}>
            <div className="rpg-plaque absolute top-3 left-3 text-[9px]">
              COZY ROOM
            </div>

            <div className="absolute top-8 right-8 w-16 h-12 border-2 border-[#5a3d28] bg-cyan-950/60 rounded flex items-center justify-center shadow-inner">
              <div className="w-[1px] h-full bg-[#5a3d28]"></div>
              <div className="h-[1px] w-full bg-[#5a3d28] absolute"></div>
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-cyan-400/20 to-transparent pointer-events-none"></div>
            </div>

            <div className="absolute top-12 left-6 w-20 h-10 bg-red-950 border border-red-900 rounded-s-sm flex items-center justify-end">
              <div className="w-6 h-full bg-amber-100 rounded-s-xs border-r border-red-950"></div>
            </div>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-32 h-16 bg-[#3a2215]/80 rounded-full border border-[#5a3d28]/30 -z-10"></div>

            <div className="flex-1 flex flex-col items-center justify-center z-10 mt-6">
              <SpriteRenderer
                base={currentProfile.sprite_json.base}
                hair={currentProfile.sprite_json.hair}
                outfit={currentProfile.sprite_json.outfit}
                accessory={currentProfile.sprite_json.accessory}
                petId={currentProfile.pet_id}
                size={80}
              />
              {currentProfile.current_status && (
                <div className="mt-2 bg-[#fdf6e2] text-stone-900 border-2 border-[#5a3d28] px-3 py-0.5 rounded text-[9px] font-bold shadow-md max-w-[180px] text-center relative">
                  {currentProfile.current_status}
                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#fdf6e2] border-t-2 border-l-2 border-[#5a3d28] rotate-45"></div>
                </div>
              )}
            </div>

            <div className="border-t border-[#cca566]/20 bg-black/40 p-2 flex justify-between items-center text-[9px]">
              <span className="text-slate-400 font-semibold">ROLE:</span>
              <span className="text-[#ffd700] font-bold flex items-center gap-1 font-mono uppercase">
                <Award size={12} /> {currentProfile.role}
              </span>
            </div>
          </div>

          {/* Status text update */}
          <form onSubmit={handleStatusSubmit} className="rpg-panel-wood">
            <h3 className="rpg-font-retro text-[8px] text-amber-500 mb-2 flex items-center gap-1">
              <Smile size={12} /> UPDATE STATUS TEXT
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Tulis status aktivitas di sini..."
                value={customStatusText}
                onChange={(e) => setCustomStatusText(e.target.value)}
                maxLength={24}
                className="flex-1 bg-[#16110e] text-yellow-100 p-2 rounded border border-[#5a3d28] focus:outline-none text-xs font-semibold"
              />
              <button type="submit" className="rpg-btn-game px-3 py-2 text-[9px] font-bold">SIMPAN</button>
            </div>
          </form>

        </div>

        {/* Right Column: Update Password & Registry member */}
        <div className="flex flex-col gap-4">
          
          {/* Password Form */}
          <form onSubmit={handleChangePasswordSubmit} className="rpg-panel-wood">
            <h3 className="rpg-font-retro text-[8px] text-amber-500 mb-2 flex items-center gap-1">
              <Shield size={12} /> SECURE PASSWORD UPDATE
            </h3>
            <div className="space-y-2 text-xs">
              <input
                type="password"
                placeholder="Masukkan password baru..."
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-[#16110e] text-yellow-50 p-2 rounded border border-[#5a3d28] focus:outline-none"
              />
              {changePasswordError && <span className="text-[8px] text-red-500 font-bold block">{changePasswordError}</span>}
              {changePasswordSuccess && <span className="text-[8px] text-green-500 font-bold block">{changePasswordSuccess}</span>}
              <button
                type="submit"
                disabled={changePasswordLoading}
                className="rpg-btn-game w-full py-2 text-[9px] font-bold"
              >
                {changePasswordLoading ? 'UPDATING...' : 'UPDATE PASSWORD'}
              </button>
            </div>
          </form>

          {/* Member registration (Director only) */}
          {currentProfile.role === 'Director' && (
            <div className="rpg-panel-wood">
              <h3 className="rpg-font-retro text-[8px] text-amber-500 mb-2 flex items-center gap-1">
                <LogIn size={12} /> TAMBAH ANGGOTA BARU
              </h3>
              <form onSubmit={handleRegisterMember} className="space-y-2 text-xs font-semibold">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[8px] text-slate-400 mb-0.5">NAMA LENGKAP:</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Eka Saputra"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="w-full bg-[#16110e] text-yellow-50 p-1.5 rounded border border-[#5a3d28] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] text-slate-400 mb-0.5">EMAIL:</label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. eka@rpg.org"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="w-full bg-[#16110e] text-yellow-50 p-1.5 rounded border border-[#5a3d28] focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[8px] text-slate-400 mb-0.5">PASSWORD DEFAULT:</label>
                  <input
                    type="password"
                    required
                    placeholder="Minimal 6 karakter"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full bg-[#16110e] text-yellow-50 p-1.5 rounded border border-[#5a3d28] focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[8px] text-slate-400 mb-0.5">ROLE AKSES:</label>
                    <select
                      value={regRole}
                      onChange={(e) => setRegRole(e.target.value as any)}
                      className="w-full bg-[#16110e] text-yellow-50 p-1 rounded border border-[#5a3d28] focus:outline-none"
                    >
                      <option value="Staff">Staff</option>
                      <option value="Manager">Manager</option>
                      <option value="Director">Director</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[8px] text-slate-400 mb-0.5">SUB-DIVISI:</label>
                    <select
                      value={regSubDiv}
                      onChange={(e) => setRegSubDiv(e.target.value as any)}
                      className="w-full bg-[#16110e] text-yellow-50 p-1 rounded border border-[#5a3d28] focus:outline-none"
                    >
                      <option value="Academic">Academic</option>
                      <option value="Pub">Pub</option>
                      <option value="Project">Project</option>
                      <option value="Comp">Comp</option>
                      <option value="All">All</option>
                    </select>
                  </div>
                </div>
                {regError && <span className="text-[8px] text-red-500 font-bold block">{regError}</span>}
                {regSuccess && <span className="text-[8px] text-green-500 font-bold block">{regSuccess}</span>}
                <button
                  type="submit"
                  disabled={regLoading}
                  className="rpg-btn-game w-full py-2 font-bold"
                >
                  {regLoading ? 'MEMBUAT AKUN...' : 'BUAT AKUN ANGGOTA'}
                </button>
              </form>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
