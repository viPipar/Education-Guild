import React, { useState, useEffect, useRef } from 'react';
import type { RpgAsset, Rarity, Profile } from '../lib/supabase';
import { db, DEFAULT_ASSETS } from '../lib/supabase';
import { Upload, Trash2, Image, Sparkles, ShieldAlert, RefreshCw, Coins, Gift, Edit, Users, FilePlus } from 'lucide-react';
import { playClick, playSelect } from '../lib/audio';

interface AssetManagerProps {
  onAssetsUpdated: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  character: 'Karakter',
  pet: 'Pet',
  cosmetic: 'Kosmetik',
};

const TYPE_COLORS: Record<string, string> = {
  character: 'text-yellow-400 bg-yellow-900/30 border-yellow-600/50',
  pet: 'text-green-400 bg-green-900/30 border-green-600/50',
  cosmetic: 'text-purple-400 bg-purple-900/30 border-purple-600/50',
};

export const RARITY_CONFIG: Record<Rarity, { label: string; color: string; glow: string }> = {
  basic:     { label: 'Basic',    color: 'text-stone-300 bg-stone-900/60 border-stone-600',     glow: '' },
  common:    { label: 'Common',    color: 'text-slate-300 bg-slate-800/60 border-slate-600',     glow: '' },
  uncommon:  { label: 'Uncommon',  color: 'text-green-300 bg-green-900/40 border-green-600',     glow: '' },
  rare:      { label: 'Rare',      color: 'text-blue-300 bg-blue-900/40 border-blue-500',         glow: '' },
  epic:      { label: 'Epic',      color: 'text-purple-300 bg-purple-900/40 border-purple-500',   glow: 'shadow-[0_0_8px_rgba(168,85,247,0.4)]' },
  legendary: { label: 'Legendary', color: 'text-yellow-300 bg-yellow-900/40 border-yellow-400',    glow: 'shadow-[0_0_12px_rgba(251,191,36,0.5)]' },
};

const MAX_FILE_SIZE_BYTES = 512 * 1024; // 512 KB

export const AssetManager: React.FC<AssetManagerProps> = ({ onAssetsUpdated }) => {
  const [assets, setAssets] = useState<RpgAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'character' | 'pet' | 'cosmetic'>('all');

  // Panel switcher
  const [activePanel, setActivePanel] = useState<'assets' | 'coins' | 'users'>('assets');

  // User Manager state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<'Director' | 'Manager' | 'Staff'>('Staff');
  const [editSubDiv, setEditSubDiv] = useState<'Academic' | 'Pub' | 'Project' | 'Comp' | 'All'>('Academic');
  const [editLevel, setEditLevel] = useState(1);
  const [editCoins, setEditCoins] = useState(0);
  const [userMsg, setUserMsg] = useState('');
  const [userError, setUserError] = useState('');
  const [userLoading, setUserLoading] = useState(false);

  // Coin manager state
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [coinAmounts, setCoinAmounts] = useState<Record<string, number>>({});
  const [coinMsg, setCoinMsg] = useState('');
  const [coinLoading, setCoinLoading] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'character' | 'pet' | 'cosmetic'>('character');
  const [formRarity, setFormRarity] = useState<Rarity>('common');
  const [formMinLevel, setFormMinLevel] = useState(1);
  const [formDescription, setFormDescription] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formImageName, setFormImageName] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);

  // Drag and Drop State
  const [isDragging, setIsDragging] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    const data = await db.getAssets();
    setAssets(data);
    const profs = await db.getProfiles();
    setProfiles(profs);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const unsub = db.subscribe((msg) => {
      if (msg.type === 'assets_update' || msg.type === 'profile_update') {
        loadData();
        onAssetsUpdated();
      }
    });
    return () => unsub();
  }, []);

  // --- File Processing Logic ---
  const processFile = (file: File) => {
    if (!['image/png', 'image/gif'].includes(file.type)) {
      setFormError('❌ Hanya file PNG dan GIF yang diperbolehkan.');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFormError(`❌ Ukuran file terlalu besar (maks 512 KB). File Anda: ${(file.size / 1024).toFixed(0)} KB.`);
      return;
    }

    setFormError('');
    setFormImageName(file.name);

    const reader = new FileReader();
    reader.onloadend = () => setFormImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    playClick();
    setFormError('');
    setFormSuccess('');

    if (!formName.trim()) { setFormError('❌ Nama aset wajib diisi.'); return; }
    if (!formImageUrl)     { setFormError('❌ File gambar wajib dipilih.'); return; }

    setFormLoading(true);

    const id = editingAssetId || `custom_${formType}_${Date.now()}`;
    const asset: RpgAsset = {
      id,
      name: formName.trim(),
      type: formType,
      rarity: formRarity,
      min_level: formMinLevel,
      description: formDescription.trim(),
      image_url: formImageUrl,
    };

    const result = await db.addAsset(asset);
    setFormLoading(false);

    if (result) {
      setFormSuccess(editingAssetId ? `✅ Aset "${formName}" berhasil diperbarui!` : `✅ Aset "${formName}" berhasil ditambahkan!`);
      setFormName('');
      setFormDescription('');
      setFormRarity('common');
      setFormMinLevel(1);
      setFormImageUrl('');
      setFormImageName('');
      setEditingAssetId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadData();
      onAssetsUpdated();
    } else {
      setFormError('❌ Gagal menyimpan aset. Coba lagi.');
    }
  };

  const handleEdit = (asset: RpgAsset) => {
    playSelect();
    setFormError('');
    setFormSuccess('');
    setEditingAssetId(asset.id);
    setFormName(asset.name);
    setFormType(asset.type);
    setFormRarity(asset.rarity as Rarity);
    setFormMinLevel(asset.min_level);
    setFormDescription(asset.description || '');
    setFormImageUrl(asset.image_url);
    setFormImageName('(Gambar tersimpan)');
  };

  const handleDelete = async (asset: RpgAsset) => {
    if (DEFAULT_ASSETS.some(a => a.id === asset.id)) {
      setFormError('❌ Aset bawaan sistem tidak dapat dihapus.');
      return;
    }
    playClick();
    setDeletingId(asset.id);
    await db.deleteAsset(asset.id);
    setDeletingId(null);
    await loadData();
    onAssetsUpdated();
  };

  const handleRefresh = async () => {
    playSelect();
    setLoading(true);
    await db.refreshAssetsCache();
    await loadData();
    onAssetsUpdated();
  };

  const handleGiveCoin = async (userId: string) => {
    const amount = coinAmounts[userId] || 0;
    if (!amount) return;
    setCoinLoading(true);
    await db.giveCoins(userId, amount);
    setCoinMsg(`✅ +${amount} koin diberikan!`);
    setCoinAmounts(prev => ({ ...prev, [userId]: 0 }));
    await loadData();
    setTimeout(() => setCoinMsg(''), 2500);
    setCoinLoading(false);
  };

  const handleGiveAll = async () => {
    setCoinLoading(true);
    await db.giveCoinsToAll(10);
    setCoinMsg('✅ +10 koin diberikan ke semua anggota!');
    await loadData();
    setTimeout(() => setCoinMsg(''), 2500);
    setCoinLoading(false);
  };

  const handleSelectUser = (p: Profile) => {
    playSelect();
    setSelectedUserId(p.id);
    setEditName(p.name);
    setEditRole(p.role);
    setEditSubDiv(p.sub_div_id);
    setEditLevel(p.level);
    setEditCoins(p.coins ?? 0);
    setUserMsg('');
    setUserError('');
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    if (!editName.trim()) {
      setUserError('❌ Nama anggota tidak boleh kosong.');
      return;
    }
    playClick();
    setUserLoading(true);
    setUserMsg('');
    setUserError('');

    try {
      const result = await db.updateProfile(selectedUserId, {
        name: editName.trim(),
        role: editRole,
        sub_div_id: editSubDiv,
        level: editLevel,
        coins: editCoins,
      });

      if (result) {
        setUserMsg('✅ Profil anggota berhasil diperbarui!');
        await loadData();
      } else {
        setUserError('❌ Gagal memperbarui profil.');
      }
    } catch (err) {
      console.error(err);
      setUserError('❌ Terjadi kesalahan.');
    } finally {
      setUserLoading(false);
    }
  };

  const filteredAssets = filterType === 'all' ? assets : assets.filter(a => a.type === filterType);
  const customAssets  = filteredAssets.filter(a => !DEFAULT_ASSETS.some(d => d.id === a.id));
  const builtinAssets = filteredAssets.filter(a => DEFAULT_ASSETS.some(d => d.id === a.id));

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="rpg-panel-stone p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="text-yellow-500" size={24} />
          <div>
            <h2 className="rpg-font-retro text-yellow-500 text-sm">ASSET CHAMBER</h2>
            <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">Kelola Aset &amp; Distribusi Koin untuk seluruh guild</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-red-950/50 border border-red-800 px-2 py-1 rounded text-[9px] text-red-400 font-bold">
            <ShieldAlert size={10} /> KHUSUS DIRECTOR
          </div>
          <button onClick={handleRefresh} className="rpg-btn-game py-1.5 px-3 text-[9px] flex items-center gap-1">
            <RefreshCw size={10} /> SYNC
          </button>
        </div>
      </div>

      {/* Panel Switcher */}
      <div className="flex gap-2">
        <button
          onClick={() => { playSelect(); setActivePanel('assets'); }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded text-[10px] font-bold border transition-all ${
            activePanel === 'assets' ? 'bg-amber-600 border-amber-400 text-stone-900' : 'bg-[#16110e] border-[#5a3d28] text-slate-400 hover:border-amber-600'
          }`}
        >
          <Sparkles size={10} /> MANAJEMEN ASET
        </button>
        <button
          onClick={() => { playSelect(); setActivePanel('coins'); }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded text-[10px] font-bold border transition-all ${
            activePanel === 'coins' ? 'bg-amber-600 border-amber-400 text-stone-900' : 'bg-[#16110e] border-[#5a3d28] text-slate-400 hover:border-amber-600'
          }`}
        >
          <Coins size={10} /> DISTRIBUSI KOIN
        </button>
        <button
          onClick={() => { playSelect(); setActivePanel('users'); }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded text-[10px] font-bold border transition-all ${
            activePanel === 'users' ? 'bg-amber-600 border-amber-400 text-stone-900' : 'bg-[#16110e] border-[#5a3d28] text-slate-400 hover:border-amber-600'
          }`}
        >
          <Users size={10} /> MANAJEMEN ANGGOTA
        </button>
      </div>

      {/* ── ASSET PANEL ── */}
      {activePanel === 'assets' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT: Upload Form */}
          <div className="rpg-panel-stone flex flex-col gap-4">
            <div className="rpg-plaque -mt-7 self-start flex items-center gap-1.5">
              <Upload size={10} /> TAMBAH ASET BARU
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-xs font-semibold mt-2">
              <div>
                <label className="block text-[9px] text-slate-400 rpg-font-retro mb-1.5">NAMA ASET:</label>
                <input type="text" placeholder="e.g. Ranger Animasi, Naga Api..."
                  value={formName} onChange={(e) => setFormName(e.target.value)} maxLength={40}
                  className="w-full bg-[#16110e] text-yellow-50 p-2.5 rounded border border-[#5a3d28] focus:outline-none focus:border-amber-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] text-slate-400 rpg-font-retro mb-1.5">TIPE ASET:</label>
                  <select value={formType} onChange={(e) => setFormType(e.target.value as any)}
                    className="w-full bg-[#16110e] text-yellow-50 p-2 rounded border border-[#5a3d28] focus:outline-none focus:border-amber-500 font-bold"
                  >
                    <option value="character">Karakter</option>
                    <option value="pet">Pet</option>
                    <option value="cosmetic">Kosmetik</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] text-slate-400 rpg-font-retro mb-1.5">LEVEL MINIMAL:</label>
                  <input type="number" min={1} max={100} value={formMinLevel}
                    onChange={(e) => setFormMinLevel(Number(e.target.value))}
                    className="w-full bg-[#16110e] text-yellow-50 p-2 rounded border border-[#5a3d28] focus:outline-none focus:border-amber-500 text-center font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] text-slate-400 rpg-font-retro mb-1.5">RARITY:</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(RARITY_CONFIG) as Rarity[]).map(r => (
                    <button key={r} type="button" onClick={() => { playSelect(); setFormRarity(r); }}
                      className={`py-1.5 rounded border text-[8px] font-bold transition-all ${
                        formRarity === r
                          ? `${RARITY_CONFIG[r].color} ${RARITY_CONFIG[r].glow} opacity-100 scale-105`
                          : 'bg-[#16110e] border-[#5a3d28] text-slate-500 hover:border-amber-600'
                      }`}
                    >
                      {r.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[9px] text-slate-400 rpg-font-retro mb-1.5">DESKRIPSI (Opsional):</label>
                <input type="text" placeholder="e.g. Karakter ranger penjaga hutan..."
                  value={formDescription} onChange={(e) => setFormDescription(e.target.value)} maxLength={80}
                  className="w-full bg-[#16110e] text-yellow-50 p-2.5 rounded border border-[#5a3d28] focus:outline-none focus:border-amber-500 font-semibold"
                />
              </div>

              {/* DRAG AND DROP AREA */}
              <div>
                <label className="block text-[9px] text-slate-400 rpg-font-retro mb-1.5">FILE GAMBAR (PNG/GIF):</label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`w-full border-2 border-dashed rounded p-6 text-center cursor-pointer transition-all duration-300 ${
                    isDragging 
                      ? 'border-amber-400 bg-amber-500/10 scale-[1.02] shadow-[0_0_15px_rgba(251,191,36,0.35)] animate-pulse' 
                      : formImageUrl 
                        ? 'border-green-500 bg-green-950/20 hover:border-green-400' 
                        : 'border-[#5a3d28] hover:border-amber-600 bg-[#16110e]/60'
                  }`}
                >
                  {formImageUrl ? (
                    <div className="flex flex-col items-center gap-2 pointer-events-none">
                      <img src={formImageUrl} alt="preview" className="max-h-20 max-w-full object-contain" style={{ imageRendering: 'pixelated' }} />
                      <span className="text-[9px] text-green-400 font-bold truncate max-w-full">✅ {formImageName}</span>
                      <span className="text-[8px] text-slate-400 mt-1">Seret file baru atau klik untuk ganti gambar</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-500 pointer-events-none">
                      {isDragging ? <FilePlus size={28} className="text-amber-500 animate-bounce" /> : <Image size={28} className="opacity-40" />}
                      <span className="text-[10px] font-bold">{isDragging ? 'LEPASKAN FILE SEKARANG' : 'KLIK ATAU TARIK PNG/GIF KE SINI'}</span>
                      <span className="text-[8px]">Maksimal ukuran file 512 KB</span>
                    </div>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/png, image/gif" onChange={handleFileChange} className="hidden" />
              </div>

              {formError   && <p className="text-[10px] text-red-400 font-bold">{formError}</p>}
              {formSuccess && <p className="text-[10px] text-green-400 font-bold">{formSuccess}</p>}

              <div className="flex flex-col gap-2">
                <button type="submit" disabled={formLoading} className="rpg-btn-game w-full py-3 flex items-center justify-center gap-2 font-bold">
                  <Upload size={12} />
                  {formLoading ? 'MENYIMPAN...' : (editingAssetId ? 'SIMPAN PERUBAHAN' : 'TAMBAHKAN ASET')}
                </button>
                {editingAssetId && (
                  <button type="button" onClick={() => { setEditingAssetId(null); setFormImageUrl(''); }}
                    className="w-full py-2 bg-slate-900 border border-slate-700 rounded text-slate-400 text-[9px] font-bold"
                  >BATAL EDIT</button>
                )}
              </div>
            </form>
          </div>

          {/* RIGHT: Asset List */}
          <div className="rpg-panel-stone flex flex-col gap-3">
            <div className="rpg-plaque -mt-7 self-start flex items-center gap-1.5">
              <Sparkles size={10} /> DAFTAR ASET ({filteredAssets.length})
            </div>

            <div className="flex gap-1.5 mt-2 flex-wrap">
              {(['all', 'character', 'pet', 'cosmetic'] as const).map(t => (
                <button key={t} onClick={() => { playSelect(); setFilterType(t); }}
                  className={`px-2.5 py-1 rounded text-[9px] font-bold border transition-all ${
                    filterType === t ? 'bg-amber-600 border-amber-400 text-stone-900' : 'bg-[#16110e] border-[#5a3d28] text-slate-400 hover:border-amber-600'
                  }`}
                >
                  {t === 'all' ? 'Semua' : TYPE_LABELS[t]}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="text-center text-slate-400 py-10 text-xs font-bold animate-pulse">Memuat...</div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto pr-1 no-scrollbar">
                {customAssets.length > 0 && (
                  <div>
                    <p className="text-[8px] text-amber-500 font-bold rpg-font-retro mb-1.5 border-b border-amber-800/30 pb-1">ASET KUSTOM</p>
                    {customAssets.map(asset => (
                      <AssetRow key={asset.id} asset={asset} isDefault={false}
                        isDeleting={deletingId === asset.id} onDelete={() => handleDelete(asset)}
                        onEdit={() => handleEdit(asset)} />
                    ))}
                  </div>
                )}
                {builtinAssets.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[8px] text-slate-500 font-bold rpg-font-retro mb-1.5 border-b border-slate-800/30 pb-1">ASET BAWAAN</p>
                    {builtinAssets.map(asset => (
                      <AssetRow key={asset.id} asset={asset} isDefault={true} isDeleting={false} onDelete={() => {}} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── COIN PANEL ── */}
      {activePanel === 'coins' && (
        <div className="rpg-panel-stone flex flex-col gap-4">
          <div className="rpg-plaque -mt-7 self-start flex items-center gap-1.5">
            <Coins size={10} /> DISTRIBUSI KOIN GUILD
          </div>

          <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
            <p className="text-[9px] text-slate-400 font-semibold">Beri koin ke seluruh anggota atau individual.</p>
            <button onClick={handleGiveAll} disabled={coinLoading} className="rpg-btn-game flex items-center gap-2 py-2 px-4 text-xs font-bold">
              <Gift size={12} /> GIVE ALL +10 COIN
            </button>
          </div>

          {coinMsg && <p className="text-[10px] text-green-400 font-bold">{coinMsg}</p>}

          <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto no-scrollbar">
            {profiles.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-2.5 bg-[#16110e] border border-[#5a3d28]/60 rounded hover:border-amber-700/40 transition-all">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[11px] text-yellow-50 truncate">{p.name}</span>
                    <span className={`text-[7px] font-bold px-1 py-0.5 rounded ${
                      p.role === 'Director' ? 'bg-yellow-900 text-yellow-400' :
                      p.role === 'Manager'  ? 'bg-blue-900 text-blue-400' : 'bg-slate-800 text-slate-400'
                    }`}>{p.role}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Coins size={8} className="text-yellow-500" />
                    <span className="text-[9px] text-yellow-400 font-bold font-mono">{p.coins ?? 0} koin</span>
                    <span className="text-[8px] text-slate-500">· LV.{p.level}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <input type="number" min={1} value={coinAmounts[p.id] || ''}
                    onChange={(e) => setCoinAmounts(prev => ({ ...prev, [p.id]: Number(e.target.value) }))}
                    className="w-20 bg-[#0f0f13] text-yellow-100 p-1.5 rounded border border-[#5a3d28] text-center text-xs font-bold"
                  />
                  <button onClick={() => handleGiveCoin(p.id)} disabled={coinLoading || !coinAmounts[p.id]} className="rpg-btn-game py-1.5 px-2.5 text-[9px]">BERI</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── USER PANEL ── */}
      {activePanel === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rpg-panel-stone flex flex-col gap-3">
            <div className="rpg-plaque -mt-7 self-start flex items-center gap-1.5">
              <Users size={10} /> ANGGOTA GUILD ({profiles.length})
            </div>
            <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto pr-1 no-scrollbar mt-2">
              {profiles.map(p => (
                <div key={p.id} onClick={() => handleSelectUser(p)}
                  className={`flex items-center gap-3 p-2.5 bg-[#16110e] border rounded cursor-pointer transition-all ${
                    selectedUserId === p.id ? 'border-amber-500 bg-amber-950/20' : 'border-[#5a3d28]/60 hover:border-amber-700/40'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-[11px] text-yellow-50 truncate">{p.name}</span>
                      <span className="text-[7px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded font-bold uppercase">{p.role}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-400 font-mono">
                      <span>LV.{p.level}</span><span>·</span><span className="text-amber-400">🪙 {p.coins ?? 0} koin</span>
                    </div>
                  </div>
                  <div className="text-[9px] font-bold text-amber-500 flex-shrink-0">EDIT &gt;</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 rpg-panel-stone flex flex-col gap-4">
            <div className="rpg-plaque -mt-7 self-start flex items-center gap-1.5">
              <Edit size={10} /> EDIT PROFIL ANGGOTA
            </div>
            {selectedUserId ? (
              <form onSubmit={handleUpdateUser} className="flex flex-col gap-3.5 text-xs font-semibold mt-2">
                <div>
                  <label className="block text-[9px] text-slate-400 rpg-font-retro mb-1">NAMA ANGGOTA:</label>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-[#16110e] text-yellow-50 p-2.5 rounded border border-[#5a3d28] focus:border-amber-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-400 rpg-font-retro mb-1">ROLE:</label>
                  <select value={editRole} onChange={(e) => setEditRole(e.target.value as any)}
                    className="w-full bg-[#16110e] text-yellow-50 p-2.5 rounded border border-[#5a3d28] outline-none"
                  >
                    <option value="Staff">Staff</option><option value="Manager">Manager</option><option value="Director">Director</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] text-slate-400 rpg-font-retro mb-1">SUB-DIVISI:</label>
                  <select value={editSubDiv} onChange={(e) => setEditSubDiv(e.target.value as any)}
                    className="w-full bg-[#16110e] text-yellow-50 p-2.5 rounded border border-[#5a3d28] outline-none"
                  >
                    <option value="Academic">Academic</option><option value="Pub">Pub</option><option value="Project">Project</option><option value="Comp">Comp</option><option value="All">All</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] text-slate-400 rpg-font-retro mb-1">LEVEL:</label>
                    <input type="number" value={editLevel} onChange={(e) => setEditLevel(Number(e.target.value))}
                      className="w-full bg-[#16110e] text-yellow-50 p-2.5 rounded border border-[#5a3d28] text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-400 rpg-font-retro mb-1">KOIN:</label>
                    <input type="number" value={editCoins} onChange={(e) => setEditCoins(Number(e.target.value))}
                      className="w-full bg-[#16110e] text-yellow-50 p-2.5 rounded border border-[#5a3d28] text-center"
                    />
                  </div>
                </div>
                {userError && <p className="text-[10px] text-red-400 font-bold">{userError}</p>}
                {userMsg && <p className="text-[10px] text-green-400 font-bold">{userMsg}</p>}
                <button type="submit" disabled={userLoading} className="rpg-btn-game w-full py-3 mt-2 flex items-center justify-center gap-2 font-bold">
                  <Edit size={12} /> {userLoading ? 'MEMPERBARUI...' : 'SIMPAN PERUBAHAN'}
                </button>
              </form>
            ) : <div className="text-center text-slate-50 py-16 text-xs font-bold border-2 border-dashed border-[#5a3d28]/35 rounded">PILIH ANGGOTA</div>}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Sub-component: AssetRow ──────────────────────────────────────────
const AssetRow: React.FC<{asset: RpgAsset, isDefault: boolean, isDeleting: boolean, onDelete: () => void, onEdit?: () => void}> = ({ asset, isDefault, isDeleting, onDelete, onEdit }) => {
  const typeColor = TYPE_COLORS[asset.type] || 'text-slate-400 bg-slate-900/30 border-slate-700';
  const rarConfig = RARITY_CONFIG[asset.rarity as Rarity] || RARITY_CONFIG.common;

  return (
    <div className={`flex items-center gap-3 p-2 bg-[#16110e] border border-[#5a3d28]/60 rounded mb-1.5 hover:border-amber-700/50 transition-all ${rarConfig.glow}`}>
      <div className="w-10 h-10 bg-black/60 border border-[#5a3d28] rounded flex items-center justify-center overflow-hidden">
        <img src={asset.image_url} alt="" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-[11px] text-yellow-50 truncate">{asset.name}</span>
          <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded border ${typeColor}`}>{TYPE_LABELS[asset.type]}</span>
          <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded border ${rarConfig.color}`}>{rarConfig.label}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[8px] text-amber-600 font-mono">LV. {asset.min_level}+</span>
        </div>
      </div>
      {!isDefault ? (
        <div className="flex items-center gap-1">
          {onEdit && <button onClick={onEdit} className="p-1.5 bg-amber-950/60 border border-amber-800 rounded text-amber-400"><Edit size={12} /></button>}
          <button onClick={onDelete} disabled={isDeleting} className="p-1.5 bg-red-950/60 border border-red-800 rounded text-red-400">
            {isDeleting ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
          </button>
        </div>
      ) : <span className="text-[8px] text-slate-600 font-mono px-1.5 py-1 border border-slate-800 rounded">BAWAAN</span>}
    </div>
  );
};