import React, { useState, useEffect, useRef } from 'react';
import type { RpgAsset, Rarity, Profile } from '../lib/supabase';
import { db, DEFAULT_ASSETS } from '../lib/supabase';
import { Upload, Trash2, Image, Sparkles, ShieldAlert, RefreshCw, Coins, Gift, Edit } from 'lucide-react';
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
  legendary: { label: 'Legendary', color: 'text-yellow-300 bg-yellow-900/40 border-yellow-400',   glow: 'shadow-[0_0_12px_rgba(251,191,36,0.5)]' },
};

const MAX_FILE_SIZE_BYTES = 512 * 1024; // 512 KB

export const AssetManager: React.FC<AssetManagerProps> = ({ onAssetsUpdated }) => {
  const [assets, setAssets] = useState<RpgAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'character' | 'pet' | 'cosmetic'>('all');

  // Panel switcher
  const [activePanel, setActivePanel] = useState<'assets' | 'coins'>('assets');

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

  // ── Coin handlers ─────────────────────────────────────────────────────────
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

              {/* Nama */}
              <div>
                <label className="block text-[9px] text-slate-400 rpg-font-retro mb-1.5">NAMA ASET:</label>
                <input type="text" placeholder="e.g. Ranger Animasi, Naga Api..."
                  value={formName} onChange={(e) => setFormName(e.target.value)} maxLength={40}
                  className="w-full bg-[#16110e] text-yellow-50 p-2.5 rounded border border-[#5a3d28] focus:outline-none focus:border-amber-500 font-semibold"
                />
              </div>

              {/* Tipe */}
              <div>
                <label className="block text-[9px] text-slate-400 rpg-font-retro mb-1.5">TIPE ASET:</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['character', 'pet', 'cosmetic'] as const).map(t => (
                    <button key={t} type="button" onClick={() => { playSelect(); setFormType(t); }}
                      className={`py-2 rounded border text-[9px] font-bold transition-all ${
                        formType === t ? 'bg-amber-500 border-amber-300 text-stone-900' : 'bg-[#16110e] border-[#5a3d28] text-slate-300 hover:border-amber-600'
                      }`}
                    >{TYPE_LABELS[t]}</button>
                  ))}
                </div>
              </div>

              {/* Rarity */}
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
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>
                <div className={`mt-1 text-[8px] font-bold px-2 py-1 rounded border inline-block ${RARITY_CONFIG[formRarity].color} ${RARITY_CONFIG[formRarity].glow}`}>
                  {RARITY_CONFIG[formRarity].label} dipilih
                </div>
              </div>

              {/* Level Minimal */}
              <div>
                <label className="block text-[9px] text-slate-400 rpg-font-retro mb-1.5">LEVEL MINIMAL:</label>
                <input type="number" min={1} max={10} value={formMinLevel}
                  onChange={(e) => setFormMinLevel(Number(e.target.value))}
                  className="w-24 bg-[#16110e] text-yellow-50 p-2 rounded border border-[#5a3d28] focus:outline-none focus:border-amber-500 text-center font-bold"
                />
              </div>

              {/* Deskripsi */}
              <div>
                <label className="block text-[9px] text-slate-400 rpg-font-retro mb-1.5">DESKRIPSI (Opsional):</label>
                <input type="text" placeholder="e.g. Karakter ranger penjaga hutan..."
                  value={formDescription} onChange={(e) => setFormDescription(e.target.value)} maxLength={80}
                  className="w-full bg-[#16110e] text-yellow-50 p-2.5 rounded border border-[#5a3d28] focus:outline-none focus:border-amber-500 font-semibold"
                />
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-[9px] text-slate-400 rpg-font-retro mb-1.5">FILE GAMBAR (PNG atau GIF, maks 512 KB):</label>
                <div onClick={() => fileInputRef.current?.click()}
                  className={`w-full border-2 border-dashed rounded p-4 text-center cursor-pointer transition-all ${
                    formImageUrl ? 'border-green-500 bg-green-950/20' : 'border-[#5a3d28] hover:border-amber-500 bg-[#16110e]/60'
                  }`}
                >
                  {formImageUrl ? (
                    <div className="flex flex-col items-center gap-2">
                      <img src={formImageUrl} alt="preview" className="max-h-20 max-w-full object-contain" style={{ imageRendering: 'pixelated' }} />
                      <span className="text-[9px] text-green-400 font-bold truncate max-w-full">✅ {formImageName}</span>
                      <span className="text-[8px] text-slate-400">Klik untuk ganti gambar</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-500">
                      <Image size={28} className="opacity-40" />
                      <span className="text-[10px] font-bold">Klik untuk pilih file PNG atau GIF Animasi</span>
                      <span className="text-[8px]">GIF direkomendasikan untuk animasi idle</span>
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
                  {formLoading ? 'MENYIMPAN KE DATABASE...' : (editingAssetId ? 'SIMPAN PERUBAHAN ASET' : 'TAMBAHKAN ASET KE GUILD')}
                </button>
                {editingAssetId && (
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      setEditingAssetId(null);
                      setFormName('');
                      setFormDescription('');
                      setFormRarity('common');
                      setFormMinLevel(1);
                      setFormImageUrl('');
                      setFormImageName('');
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="w-full py-2 bg-slate-900 border border-slate-700 rounded text-slate-400 hover:text-white hover:bg-slate-800 text-[9px] font-bold transition-colors"
                  >
                    BATAL EDIT (TAMBAH ASET BARU)
                  </button>
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
                  {t === 'all' ? '📋 Semua' : TYPE_LABELS[t]}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="text-center text-slate-400 py-10 text-xs font-bold animate-pulse">Memuat aset...</div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto pr-1 no-scrollbar">

                {customAssets.length > 0 && (
                  <div>
                    <p className="text-[8px] text-amber-500 font-bold rpg-font-retro mb-1.5 border-b border-amber-800/30 pb-1">
                      🎨 ASET KUSTOM
                    </p>
                    {customAssets.map(asset => (
                      <AssetRow key={asset.id} asset={asset} isDefault={false}
                        isDeleting={deletingId === asset.id} onDelete={() => handleDelete(asset)}
                        onEdit={() => handleEdit(asset)} />
                    ))}
                  </div>
                )}

                {builtinAssets.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[8px] text-slate-500 font-bold rpg-font-retro mb-1.5 border-b border-slate-800/30 pb-1">
                      🔒 ASET BAWAAN
                    </p>
                    {builtinAssets.map(asset => (
                      <AssetRow key={asset.id} asset={asset} isDefault={true} isDeleting={false} onDelete={() => {}} />
                    ))}
                  </div>
                )}

                {filteredAssets.length === 0 && !loading && (
                  <p className="text-[10px] text-slate-500 text-center py-8 font-bold">Belum ada aset untuk tipe ini.</p>
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
            <button
              onClick={handleGiveAll}
              disabled={coinLoading}
              className="rpg-btn-game flex items-center gap-2 py-2 px-4 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-stone-900 border-amber-400"
            >
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
                      p.role === 'Manager'  ? 'bg-blue-900 text-blue-400' :
                      'bg-slate-800 text-slate-400'
                    }`}>{p.role}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Coins size={8} className="text-yellow-500" />
                    <span className="text-[9px] text-yellow-400 font-bold font-mono">{p.coins ?? 0} koin</span>
                    <span className="text-[8px] text-slate-500">· LV.{p.level}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    placeholder="Jumlah"
                    value={coinAmounts[p.id] || ''}
                    onChange={(e) => setCoinAmounts(prev => ({ ...prev, [p.id]: Number(e.target.value) }))}
                    className="w-20 bg-[#0f0f13] text-yellow-100 p-1.5 rounded border border-[#5a3d28] focus:outline-none focus:border-amber-500 text-center text-xs font-bold"
                  />
                  <button
                    onClick={() => handleGiveCoin(p.id)}
                    disabled={coinLoading || !coinAmounts[p.id]}
                    className="rpg-btn-game py-1.5 px-2.5 text-[9px] disabled:opacity-40"
                  >
                    BERI
                  </button>
                </div>
              </div>
            ))}
            {profiles.length === 0 && (
              <p className="text-center text-slate-500 text-xs py-8">Tidak ada anggota ditemukan.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Sub-component: Single Asset Row ──────────────────────────────────────────
interface AssetRowProps {
  asset: RpgAsset;
  isDefault: boolean;
  isDeleting: boolean;
  onDelete: () => void;
  onEdit?: () => void;
}

const AssetRow: React.FC<AssetRowProps> = ({ asset, isDefault, isDeleting, onDelete, onEdit }) => {
  const typeColor  = TYPE_COLORS[asset.type] || 'text-slate-400 bg-slate-900/30 border-slate-700';
  const rarConfig  = RARITY_CONFIG[asset.rarity as Rarity] || RARITY_CONFIG.common;

  return (
    <div className={`flex items-center gap-3 p-2 bg-[#16110e] border border-[#5a3d28]/60 rounded mb-1.5 hover:border-amber-700/50 transition-all ${rarConfig.glow}`}>
      <div className="w-10 h-10 bg-black/60 border border-[#5a3d28] rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
        {asset.image_url ? (
          <img src={asset.image_url} alt={asset.name} className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
        ) : (
          <span className="text-slate-600 text-[10px] font-bold">SVG</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-[11px] text-yellow-50 truncate">{asset.name}</span>
          <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded border ${typeColor}`}>{TYPE_LABELS[asset.type]}</span>
          <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded border ${rarConfig.color}`}>{rarConfig.label}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[8px] text-amber-600 font-mono">LV. {asset.min_level}+</span>
          {asset.description && <span className="text-[8px] text-slate-500 truncate max-w-[120px]">{asset.description}</span>}
        </div>
      </div>

      {!isDefault ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          {onEdit && (
            <button onClick={onEdit} type="button"
              className="p-1.5 bg-amber-950/60 border border-amber-800 rounded text-amber-400 hover:bg-amber-900 hover:text-amber-200 transition-colors"
              title="Edit Aset"
            >
              <Edit size={12} />
            </button>
          )}
          <button onClick={onDelete} disabled={isDeleting}
            className="p-1.5 bg-red-950/60 border border-red-800 rounded text-red-400 hover:bg-red-900 hover:text-red-200 transition-colors disabled:opacity-40"
            title="Hapus Aset"
          >
            {isDeleting ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
          </button>
        </div>
      ) : (
        <span className="flex-shrink-0 text-[8px] text-slate-600 font-mono px-1.5 py-1 border border-slate-800 rounded">BAWAAN</span>
      )}
    </div>
  );
};
