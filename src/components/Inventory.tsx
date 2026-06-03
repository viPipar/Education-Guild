import React, { useState, useEffect } from 'react';
import type { Profile, RpgAsset, InventoryItem } from '../lib/supabase';
import { db } from '../lib/supabase';
import { SpriteRenderer } from './SpriteRenderer';
import { X, Package, Sword, PawPrint, Sparkles, Lock } from 'lucide-react';
import { playClick, playSelect } from '../lib/audio';

interface InventoryProps {
  currentProfile: Profile;
  onClose: () => void;
  onUpdateProfile: (updates: Partial<Profile>) => void;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  character: <Sword size={10} />,
  pet:       <PawPrint size={10} />,
  cosmetic:  <Sparkles size={10} />,
};

const TYPE_LABELS: Record<string, string> = {
  character: 'Karakter',
  pet:       'Pet',
  cosmetic:  'Kosmetik',
};

const TYPE_COLOR: Record<string, string> = {
  character: 'text-yellow-400 border-yellow-700/60 bg-yellow-950/30',
  pet:       'text-green-400 border-green-700/60 bg-green-950/30',
  cosmetic:  'text-purple-400 border-purple-700/60 bg-purple-950/30',
};

export const Inventory: React.FC<InventoryProps> = ({ currentProfile, onClose, onUpdateProfile }) => {
  const [allAssets, setAllAssets] = useState<RpgAsset[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'character' | 'pet' | 'cosmetic'>('all');

  const loadAssets = async () => {
    setLoading(true);
    try {
      const [assets, inv] = await Promise.all([
        db.getAssets(),
        db.getInventory(currentProfile.id)
      ]);
      setAllAssets(assets);
      setInventoryItems(inv);
    } catch (err) {
      console.error('Failed to load inventory assets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssets();
  }, []);

  // ── Equip handlers ────────────────────────────────────────────────────────

  const equipCharacter = (asset: RpgAsset) => {
    if (!canUse(asset)) return;
    playSelect();
    onUpdateProfile({
      sprite_json: {
        base: asset.id,
        hair: 'none',
        outfit: 'none',
        accessory: 'none',
      }
    });
  };

  const equipPet = (asset: RpgAsset) => {
    if (!canUse(asset)) return;
    playSelect();
    onUpdateProfile({ pet_id: asset.id });
  };

  const removePet = () => {
    playClick();
    onUpdateProfile({ pet_id: 'none' });
  };

  const canUse = (asset: RpgAsset) => currentProfile.level >= asset.min_level;

  // ── Derived state ─────────────────────────────────────────────────────────

  const ownedAssets = allAssets.map(asset => {
    if (asset.rarity === 'basic') {
      return { ...asset, quantity: 1 };
    }
    const invItem = inventoryItems.find(i => i.asset_id === asset.id);
    if (invItem) {
      return { ...asset, quantity: invItem.quantity };
    }
    return null;
  }).filter((a): a is RpgAsset & { quantity: number } => a !== null);

  const filteredAssets = filter === 'all'
    ? ownedAssets
    : ownedAssets.filter(a => a.type === filter);

  const equippedCharId = currentProfile.sprite_json.base;
  const equippedPetId  = currentProfile.pet_id;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rpg-panel-stone overflow-hidden"
        style={{ animation: 'fadeIn 0.15s ease-out' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between p-4 border-b border-[#5a3d28]">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-yellow-500" />
            <div>
              <h3 className="rpg-font-retro text-yellow-400 text-sm leading-none">INVENTORY</h3>
              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">
                {currentProfile.name} — LV.{currentProfile.level}
              </p>
            </div>
          </div>
          <button
            onClick={() => { playClick(); onClose(); }}
            className="p-1.5 bg-slate-900 border border-slate-700 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Live Character Preview ── */}
        <div className="flex items-center gap-4 p-4 bg-[#16110e]/80 border-b border-[#5a3d28]">
          <div className="w-20 h-20 bg-[#2b1f1a] border-2 border-[#5a3d28] rounded flex items-center justify-center flex-shrink-0">
            <SpriteRenderer
              base={equippedCharId}
              hair={currentProfile.sprite_json.hair}
              outfit={currentProfile.sprite_json.outfit}
              accessory={currentProfile.sprite_json.accessory}
              petId={equippedPetId}
              size={72}
            />
          </div>
          <div className="flex-1 flex flex-col gap-1 text-xs font-semibold">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <Sword size={9} className="text-yellow-500" />
              <span className="text-yellow-100">
                {allAssets.find(a => a.id === equippedCharId)?.name || equippedCharId}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <PawPrint size={9} className="text-green-500" />
              <span className="text-green-100">
                {equippedPetId === 'none' ? 'Tidak Ada Pet' : (allAssets.find(a => a.id === equippedPetId)?.name || equippedPetId)}
              </span>
              {equippedPetId !== 'none' && (
                <button
                  onClick={removePet}
                  className="ml-1 text-[8px] text-red-400 hover:text-red-300 font-bold border border-red-800 px-1 rounded"
                >
                  LEPAS
                </button>
              )}
            </div>
            <p className="text-[9px] text-slate-500">Klik item di bawah untuk menggantinya</p>
          </div>
        </div>

        {/* ── Filter Tabs ── */}
        <div className="flex gap-1.5 px-4 pt-3 pb-2 border-b border-[#5a3d28]/40">
          {(['all', 'character', 'pet', 'cosmetic'] as const).map(t => (
            <button
              key={t}
              onClick={() => { playSelect(); setFilter(t); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-[9px] font-bold border transition-all ${
                filter === t
                  ? 'bg-amber-600 border-amber-400 text-stone-900'
                  : 'bg-[#16110e] border-[#5a3d28] text-slate-400 hover:border-amber-600'
              }`}
            >
              {t === 'all' ? '📋 Semua' : <>{TYPE_ICONS[t]} {TYPE_LABELS[t]}</>}
            </button>
          ))}
          <span className="ml-auto text-[9px] text-slate-600 self-center font-mono">
            {filteredAssets.length} item
          </span>
        </div>

        {/* ── Asset Grid ── */}
        <div className="overflow-y-auto flex-1 p-4 no-scrollbar">
          {loading ? (
            <p className="text-center text-xs text-slate-500 py-10 font-bold animate-pulse">Memuat inventory...</p>
          ) : filteredAssets.length === 0 ? (
            <p className="text-center text-xs text-slate-500 py-10 font-bold">
              Tidak ada item untuk kategori ini.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredAssets.map(asset => {
                const unlocked = canUse(asset);
                const isEquippedChar = asset.type === 'character' && equippedCharId === asset.id;
                const isEquippedPet  = asset.type === 'pet'       && equippedPetId  === asset.id;
                const isEquipped = isEquippedChar || isEquippedPet;

                return (
                  <button
                    key={asset.id}
                    disabled={!unlocked || asset.type === 'cosmetic'}
                    onClick={() => {
                      if (asset.type === 'character') equipCharacter(asset);
                      else if (asset.type === 'pet')  equipPet(asset);
                    }}
                    className={`relative flex flex-col items-center gap-2 p-3 rounded border text-center transition-all group
                      ${isEquipped
                        ? 'border-amber-500 bg-amber-950/30 shadow-[0_0_12px_rgba(251,191,36,0.2)]'
                        : unlocked
                          ? `${TYPE_COLOR[asset.type]} hover:border-amber-500 hover:bg-amber-950/20 cursor-pointer`
                          : 'border-slate-800 bg-slate-950/40 opacity-50 cursor-not-allowed'
                      }`}
                    title={!unlocked ? `Butuh Level ${asset.min_level}` : asset.description}
                  >
                    {/* Lock Overlay */}
                    {!unlocked && (
                      <div className="absolute top-1.5 right-1.5 text-slate-500">
                        <Lock size={10} />
                      </div>
                    )}
                    {/* Equipped Badge */}
                    {isEquipped && (
                      <div className="absolute top-1.5 left-1.5 bg-amber-500 text-stone-900 text-[7px] font-bold px-1 rounded">
                        DIPAKAI
                      </div>
                    )}

                    {/* Asset Preview */}
                    <div className="relative w-14 h-14 bg-black/60 rounded border border-[#5a3d28]/60 flex items-center justify-center overflow-hidden">
                      {asset.image_url ? (
                        <img
                          src={asset.image_url}
                          alt={asset.name}
                          className="w-full h-full object-contain"
                          style={{ imageRendering: 'pixelated' }}
                        />
                      ) : asset.type === 'character' ? (
                        /* Live SVG preview for legacy base_X characters */
                        <SpriteRenderer
                          base={asset.id}
                          hair="none"
                          outfit="none"
                          accessory="none"
                          petId="none"
                          size={48}
                        />
                      ) : (
                        <span className="text-slate-600 text-[10px] font-bold">{TYPE_ICONS[asset.type]}</span>
                      )}
                      
                      {/* Quantity Badge */}
                      {asset.quantity > 1 && (
                        <div className="absolute bottom-0.5 right-0.5 bg-amber-500 text-stone-950 text-[7px] font-bold px-1 rounded-sm shadow-sm">
                          x{asset.quantity}
                        </div>
                      )}
                    </div>

                    {/* Name */}
                    <span className="text-[10px] font-bold text-yellow-50 leading-tight">{asset.name}</span>

                    {/* Level badge */}
                    <span className={`text-[8px] font-mono font-bold ${unlocked ? 'text-amber-500' : 'text-slate-600'}`}>
                      LV.{asset.min_level}+
                    </span>

                    {/* Equip hint for cosmetics */}
                    {asset.type === 'cosmetic' && unlocked && (
                      <span className="text-[7px] text-slate-500">(Di House Customizer)</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="p-3 border-t border-[#5a3d28]/40 flex justify-between items-center">
          <span className="text-[9px] text-slate-500 font-semibold">
            🔒 Item terkunci tersedia setelah naik level
          </span>
          <button
            onClick={() => { playClick(); onClose(); }}
            className="rpg-btn-game py-1.5 px-4 text-[10px]"
          >
            TUTUP
          </button>
        </div>
      </div>
    </div>
  );
};
