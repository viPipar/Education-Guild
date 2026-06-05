import React, { useState, useEffect } from 'react';
import type { Profile, RpgAsset } from '../lib/supabase';
import { db } from '../lib/supabase';
import { SpriteRenderer } from './SpriteRenderer';
import { HouseClicker } from './HouseClicker';
import { Shield, Sparkles, Smile, LogIn, Package, Eye, EyeOff } from 'lucide-react';
import { playClick, playSelect } from '../lib/audio';


interface HouseProps {
  profiles: Profile[];
  currentProfile: Profile | null;
  onLogin: (profile: Profile) => void;
  onUpdateProfile: (updates: Partial<Profile>) => void;
  onOpenInventory?: () => void;
}


export const House: React.FC<HouseProps> = ({
  currentProfile,
  onLogin,
  onUpdateProfile,
  onOpenInventory
}) => {

  // Login Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showUpdatePassword, setShowUpdatePassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);



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
  const [regSubDiv, setRegSubDiv] = useState<'Academic & Publication' | 'Project & Competition' | 'All'>('Academic & Publication');
  const [regSuccess, setRegSuccess] = useState('');
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  // Status Form States
  const [customStatusText, setCustomStatusText] = useState('');
  const [customStatusEmoji, setCustomStatusEmoji] = useState('🔥');

  // ── Dynamic Asset State ──────────────────────────────────────────────────
  const [characterOptions, setCharacterOptions] = useState<RpgAsset[]>([]);
  const [petOptions, setPetOptions] = useState<RpgAsset[]>([]);
  const [cosmeticOptions, setCosmeticOptions] = useState<RpgAsset[]>([]);
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  const loadAssets = async () => {
    if (!currentProfile) return;
    try {
      const [all, inv] = await Promise.all([
        db.getAssets(),
        db.getInventory(currentProfile.id)
      ]);
      await db.refreshAssetsCache(); // keep SpriteRenderer cache fresh

      // Owned custom character assets
      const ownedCharAssets = all.filter(a => a.type === 'character' && (a.rarity === 'basic' || inv.some(i => i.asset_id === a.id)));

      // Only owned custom character assets (no default vector bases)
      const currentBase = currentProfile.sprite_json.base;
      const isDefaultBase = ['base_1', 'base_2', 'base_3'].includes(currentBase);
      const charList = [...ownedCharAssets];
      if (isDefaultBase && !charList.some(a => a.id === currentBase)) {
        charList.unshift({
          id: currentBase,
          name: currentBase === 'base_1' ? 'Karakter 1 (Default)' : currentBase === 'base_2' ? 'Karakter 2 (Default)' : 'Karakter 3 (Default)',
          type: 'character',
          rarity: 'common',
          min_level: 1,
          description: 'Aset bawaan awal',
          image_url: ''
        });
      }
      setCharacterOptions(charList);

      // Owned custom pet assets
      const ownedPetAssets = all.filter(a => a.type === 'pet' && (a.rarity === 'basic' || inv.some(i => i.asset_id === a.id)));

      // Default no-pet option + owned custom pets
      setPetOptions([
        { id: 'none', name: 'Tidak Ada Pet', type: 'pet', rarity: 'common', min_level: 1, description: '', image_url: '' },
        ...ownedPetAssets
      ]);

      // Owned custom cosmetic assets
      const ownedCosmeticAssets = all.filter(a => a.type === 'cosmetic' && (a.rarity === 'basic' || inv.some(i => i.asset_id === a.id)));

      // Default no-cosmetic option + owned custom cosmetics
      setCosmeticOptions([
        { id: 'none', name: 'Tidak Ada Kosmetik', type: 'cosmetic', rarity: 'common', min_level: 1, description: '', image_url: '' },
        ...ownedCosmeticAssets
      ]);
    } catch (err) {
      console.error('Failed to load assets in House:', err);
    } finally {
      setAssetsLoaded(true);
    }
  };

  useEffect(() => {
    loadAssets();
    const unsub = db.subscribe((msg) => {
      if (msg.type === 'assets_update' || msg.type === 'profile_update') loadAssets();
    });
    return () => unsub();
  }, [currentProfile?.id]);


  const statusEmojis = ['💻', '☕', '💡', '📖', '🚀', '🔥'];

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

  // Carousel logic — character (no level gating: all chars available to everyone)
  const handleCharacterCarouselChange = (direction: 'next' | 'prev') => {
    if (!currentProfile || characterOptions.length === 0) return;
    playSelect();
    const currentBase = currentProfile.sprite_json.base;
    const currentIndex = characterOptions.findIndex(opt => opt.id === currentBase);

    let newIndex = 0;
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % characterOptions.length;
    } else {
      newIndex = currentIndex <= 0
        ? characterOptions.length - 1
        : (currentIndex - 1 + characterOptions.length) % characterOptions.length;
    }

    onUpdateProfile({
      sprite_json: {
        ...currentProfile.sprite_json,
        base: characterOptions[newIndex].id,
        hair: 'none',
        outfit: 'none',
        accessory: 'none'
      }
    });
  };

  const handlePetCarouselChange = (direction: 'next' | 'prev') => {
    if (!currentProfile) return;
    playSelect();
    // Filter available pets based on current user level
    const availablePets = petOptions.filter(pet => currentProfile.level >= pet.min_level);
    const currentIndex = availablePets.findIndex(pet => pet.id === currentProfile.pet_id);

    let newIndex = 0;
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % availablePets.length;
    } else {
      newIndex = (currentIndex - 1 + availablePets.length) % availablePets.length;
    }
    onUpdateProfile({ pet_id: availablePets[newIndex].id });
  };

  const handleCosmeticCarouselChange = (direction: 'next' | 'prev') => {
    if (!currentProfile || cosmeticOptions.length === 0) return;
    playSelect();
    // Filter available cosmetics based on current user level
    const availableCosmetics = cosmeticOptions.filter(cosmetic => currentProfile.level >= cosmetic.min_level);
    const currentCosmeticId = currentProfile.sprite_json.cosmetic_id || 'none';
    const currentIndex = availableCosmetics.findIndex(cosmetic => cosmetic.id === currentCosmeticId);

    let newIndex = 0;
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % availableCosmetics.length;
    } else {
      newIndex = (currentIndex - 1 + availableCosmetics.length) % availableCosmetics.length;
    }
    onUpdateProfile({
      sprite_json: {
        ...currentProfile.sprite_json,
        cosmetic_id: availableCosmetics[newIndex].id
      }
    });
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
            <div className="relative">
              <input
                type={showLoginPassword ? "text" : "password"}
                required
                placeholder="Masukkan password Anda"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#16110e] text-yellow-100 p-3.5 pr-10 rounded border border-[#5a3d28] focus:outline-none font-bold"
              />
              <button
                type="button"
                onClick={() => { playSelect(); setShowLoginPassword(!showLoginPassword); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white focus:outline-none"
              >
                {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
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

  // Active item names for preview UI
  const currentBase = currentProfile.sprite_json.base;
  const activeCharacterOpt = characterOptions.find(opt => opt.id === currentBase);
  const activeCharacterName = activeCharacterOpt ? activeCharacterOpt.name : currentBase;
  const activePetName = petOptions.find(opt => opt.id === currentProfile.pet_id)?.name || 'Tidak Ada';
  const activeCosmeticName = cosmeticOptions.find(opt => opt.id === (currentProfile.sprite_json.cosmetic_id || 'none'))?.name || 'Tidak Ada';

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">

      {/* Assets loading state */}
      {!assetsLoaded && (
        <div className="rpg-panel-stone p-4 text-center text-xs text-slate-400 font-bold animate-pulse">
          ⚔️ Memuat daftar karakter dari guild...
        </div>
      )}

      {assetsLoaded && characterOptions.length === 0 && (
        <div className="rpg-panel-stone p-4 text-center">
          <p className="text-xs text-amber-400 font-bold">📭 Belum ada karakter tersedia.</p>
          <p className="text-[9px] text-slate-500 mt-1">Minta Director upload sprite karakter di tab Asset Chamber ✨</p>
        </div>
      )}

      {/* Inventory Shortcut Button */}
      {onOpenInventory && (
        <div className="flex justify-end">
          <button
            onClick={() => { playClick(); onOpenInventory(); }}
            className="rpg-btn-game flex items-center gap-2 py-2 px-4 text-xs"
          >
            <Package size={12} /> BUKA INVENTORY
          </button>
        </div>
      )}


      <div className="rpg-panel-stone p-6 relative flex flex-col items-center">
        <div className="rpg-plaque absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1">
          <Sparkles size={12} className="text-yellow-400" /> CHARACTER CUSTOMIZER
        </div>
        
        <div className="flex flex-col items-center justify-center gap-6 mt-6 w-full max-w-3xl">
          
          {/* CAROUSEL CONTROLLER (Left/Right Buttons beside Main Preview) */}
          <div className="flex items-center justify-center gap-6 md:gap-10 w-full">
            
            <button
              type="button"
              onClick={() => handleCharacterCarouselChange('prev')}
              className="rpg-btn-game p-4 text-lg md:text-xl font-bold shadow-md hover:scale-105 transition-transform"
              title="Karakter Sebelumnya"
            >
              ◀
            </button>

            {/* CENTER LARGE CHARACTER PREVIEW (size = 144) */}
            <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-b from-[#2b1f1a] to-[#17110e] border-4 border-[#5a3d28] rounded-lg shadow-2xl w-60 h-60 md:w-64 md:h-64 relative">
              <div className="absolute top-2 right-3 text-[#ffd700] text-[8px] font-bold font-mono">
                LV. {currentProfile.level}
              </div>
              
              <SpriteRenderer
                base={currentProfile.sprite_json.base}
                hair={currentProfile.sprite_json.hair}
                outfit={currentProfile.sprite_json.outfit}
                accessory={currentProfile.sprite_json.accessory}
                petId={currentProfile.pet_id}
                cosmeticId={currentProfile.sprite_json.cosmetic_id}
                size={144}
                className="transform hover:scale-105 transition-transform drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)]"
              />
              
              <div className="mt-3 bg-slate-950/95 border border-[#cca566]/40 px-3.5 py-1 rounded flex flex-col items-center gap-0.5 shadow-md">
                <span className="font-bold text-xs" style={{ color: currentProfile.sprite_json.nameColor || '#fafaf9' }}>{currentProfile.name}</span>
                <span className="text-[8px] font-semibold text-yellow-500 font-mono uppercase tracking-wider">{activeCharacterName}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleCharacterCarouselChange('next')}
              className="rpg-btn-game p-4 text-lg md:text-xl font-bold shadow-md hover:scale-105 transition-transform"
              title="Karakter Selanjutnya"
            >
              ▶
            </button>

          </div>

          {/* LOWER CONTROLS (Pet Stable, Cosmetic closet, Status Emoji & Name Color) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-3xl mt-4">
            
            {/* Pet Stable */}
            <div className="flex flex-col p-3 bg-[#16110e] border border-[#5a3d28]/60 rounded-md">
              <span className="text-[8px] rpg-font-retro text-amber-500 mb-1.5 block text-center">PET STABLE</span>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handlePetCarouselChange('prev')}
                  className="rpg-btn-game py-1 px-3 text-[10px] font-bold"
                >
                  ◀
                </button>
                <span className="text-[10px] font-bold text-yellow-100 text-center flex-1 truncate">{activePetName}</span>
                <button
                  type="button"
                  onClick={() => handlePetCarouselChange('next')}
                  className="rpg-btn-game py-1 px-3 text-[10px] font-bold"
                >
                  ▶
                </button>
              </div>
            </div>

            {/* Lemari Kosmetik */}
            <div className="flex flex-col p-3 bg-[#16110e] border border-[#5a3d28]/60 rounded-md">
              <span className="text-[8px] rpg-font-retro text-amber-500 mb-1.5 block text-center">LEMARI KOSMETIK</span>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleCosmeticCarouselChange('prev')}
                  className="rpg-btn-game py-1 px-3 text-[10px] font-bold"
                >
                  ◀
                </button>
                <span className="text-[10px] font-bold text-yellow-100 text-center flex-1 truncate">{activeCosmeticName}</span>
                <button
                  type="button"
                  onClick={() => handleCosmeticCarouselChange('next')}
                  className="rpg-btn-game py-1 px-3 text-[10px] font-bold"
                >
                  ▶
                </button>
              </div>
            </div>

            {/* Status Emoji */}
            <div className="flex flex-col p-3 bg-[#16110e] border border-[#5a3d28]/60 rounded-md">
              <span className="text-[8px] rpg-font-retro text-amber-500 mb-1.5 block text-center">STATUS EMOJI</span>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleEmojiCarouselChange('prev')}
                  className="rpg-btn-game py-1 px-3 text-[10px] font-bold"
                >
                  ◀
                </button>
                <span className="text-sm text-center flex-1">{customStatusEmoji}</span>
                <button
                  type="button"
                  onClick={() => handleEmojiCarouselChange('next')}
                  className="rpg-btn-game py-1 px-3 text-[10px] font-bold"
                >
                  ▶
                </button>
              </div>
            </div>

            {/* Name Color Picker */}
            <div className="flex flex-col p-3 bg-[#16110e] border border-[#5a3d28]/60 rounded-md">
              <span className="text-[8px] rpg-font-retro text-amber-500 mb-1.5 block text-center">WARNA NAMA</span>
              <div className="flex items-center justify-center gap-1.5 flex-wrap h-full content-center">
                {['#ffffff', '#ffd700', '#f43f5e', '#10b981', '#0ea5e9', '#d946ef', '#f97316', '#06b6d4'].map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      playSelect();
                      onUpdateProfile({
                        sprite_json: {
                          ...currentProfile.sprite_json,
                          nameColor: color
                        }
                      });
                    }}
                    style={{ backgroundColor: color }}
                    className={`w-4 h-4 rounded border ${
                      (currentProfile.sprite_json.nameColor || '#ffffff') === color
                        ? 'border-amber-500 scale-110 ring-1 ring-amber-500/50'
                        : 'border-stone-700 hover:border-slate-500'
                    }`}
                    title={color}
                  />
                ))}
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* 2. SUB CONTENT PANELS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Left Column: Cozy Room View & Status Text */}
        <div className="flex flex-col gap-4">
          
          {/* Room Frame - Cozy Room Clicker Template */}
          <HouseClicker key={currentProfile.id} currentProfile={currentProfile} />

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
              <div className="relative">
                <input
                  type={showUpdatePassword ? "text" : "password"}
                  placeholder="Masukkan password baru..."
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#16110e] text-yellow-50 p-2 pr-8 rounded border border-[#5a3d28] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => { playSelect(); setShowUpdatePassword(!showUpdatePassword); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white focus:outline-none"
                >
                  {showUpdatePassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
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
                  <div className="relative">
                    <input
                      type={showRegisterPassword ? "text" : "password"}
                      required
                      placeholder="Minimal 6 karakter"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="w-full bg-[#16110e] text-yellow-50 p-1.5 pr-8 rounded border border-[#5a3d28] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => { playSelect(); setShowRegisterPassword(!showRegisterPassword); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white focus:outline-none"
                    >
                      {showRegisterPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
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
                      <option value="Academic & Publication">Academic & Publication</option>
                      <option value="Project & Competition">Project & Competition</option>
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
