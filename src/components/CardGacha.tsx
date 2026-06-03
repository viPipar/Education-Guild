import React, { useState, useEffect } from 'react';
import type { Profile } from '../lib/supabase';
import { Sparkles, Trophy, Library, RefreshCw } from 'lucide-react';
import { playClick, playSelect, playLevelUp, playVote } from '../lib/audio';

interface CardGachaProps {
  currentProfile: Profile;
}

export interface MemoryCard {
  id: string;
  photoId: string;
  title: string;
  uploader: string;
  date: string;
  imageUrl: string;
  rarity: 'Common' | 'Rare' | 'Legendary';
  hp: number;
  attackName: string;
  damage: number;
  description: string;
  pulledAt: string;
}

export const CardGacha: React.FC<CardGachaProps> = ({ currentProfile }) => {
  const [binder, setBinder] = useState<MemoryCard[]>([]);
  const [isTearing, setIsTearing] = useState(false);
  const [isOpened, setIsOpened] = useState(false);
  const [activeTab, setActiveTab] = useState<'pull' | 'binder'>('pull');
  const [pulledCard, setPulledCard] = useState<MemoryCard | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Pre-defined fallback pixel/rpg photos to draw cards from if memory wall is empty
  const FALLBACK_MEMORIES = [
    {
      id: 'fb1',
      uploader: 'Guild Board',
      date: '2026-06-01',
      url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=300&auto=format&fit=crop',
      caption: 'Guild Hall briefing under the candlelight. Let\'s conquer the sprint!'
    },
    {
      id: 'fb2',
      uploader: 'Ancient Scribe',
      date: '2026-05-28',
      url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=300&auto=format&fit=crop',
      caption: 'A view of the code scrolls being compiled in the wizard tower.'
    },
    {
      id: 'fb3',
      uploader: 'Tavern Keeper',
      date: '2026-05-25',
      url: 'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?q=80&w=300&auto=format&fit=crop',
      caption: 'Hearthfire bonding session. Emotes were flying everywhere!'
    },
    {
      id: 'fb4',
      uploader: 'Academic Advisor',
      date: '2026-06-02',
      url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=300&auto=format&fit=crop',
      caption: 'The magical curriculum map glowing in the dark library.'
    }
  ];

  // Load Binder from LocalStorage
  const loadBinder = () => {
    const saved = localStorage.getItem(`rpg_card_binder_${currentProfile.id}`);
    if (saved) {
      setBinder(JSON.parse(saved));
    }
  };

  useEffect(() => {
    loadBinder();
  }, [currentProfile.id]);

  // Pull logic
  const handlePullCard = () => {
    playVote(); // play bubble/booster pack audio
    setIsTearing(true);
    setIsOpened(false);
    setPulledCard(null);

    // After 1 second of pack tear animation, reveal the card
    setTimeout(() => {
      // Gather pool: either custom photos uploaded by members or fallback presets
      const savedPhotosStr = localStorage.getItem('rpg_photos');
      let photoPool = FALLBACK_MEMORIES;
      if (savedPhotosStr) {
        const savedPhotos = JSON.parse(savedPhotosStr);
        if (savedPhotos.length > 0) {
          // Combine both for rich content
          photoPool = [...savedPhotos.map((p: any) => ({
            id: p.id,
            uploader: p.uploader,
            date: p.date,
            url: p.url,
            caption: p.caption
          })), ...FALLBACK_MEMORIES];
        }
      }

      // Pick random photo
      const randomPhoto = photoPool[Math.floor(Math.random() * photoPool.length)];

      // Generate card attributes
      const rarities: ('Common' | 'Rare' | 'Legendary')[] = ['Common', 'Common', 'Common', 'Rare', 'Rare', 'Legendary'];
      const pickedRarity = rarities[Math.floor(Math.random() * rarities.length)];

      // RPG moves names list
      const attacks = [
        { name: 'Directorial Command', dmg: 80 },
        { name: 'Curriculum Smash', dmg: 40 },
        { name: 'Design Spray', dmg: 50 },
        { name: 'Database Burst', dmg: 90 },
        { name: 'Coffee Refill', dmg: 20 },
        { name: 'Deadline Rush', dmg: 70 },
        { name: 'Deploy Spark', dmg: 60 }
      ];
      const randomAttack = attacks[Math.floor(Math.random() * attacks.length)];

      // Calculate HP and stats based on Rarity
      let hp = 70 + Math.floor(Math.random() * 50);
      let dmg = randomAttack.dmg;
      if (pickedRarity === 'Rare') {
        hp += 40;
        dmg += 20;
      } else if (pickedRarity === 'Legendary') {
        hp += 100;
        dmg += 50;
      }

      // Construct Memory Card object
      const newCard: MemoryCard = {
        id: 'card_' + Date.now(),
        photoId: randomPhoto.id,
        title: randomPhoto.caption.substring(0, 20) + (randomPhoto.caption.length > 20 ? '...' : ''),
        uploader: randomPhoto.uploader,
        date: randomPhoto.date,
        imageUrl: randomPhoto.url,
        rarity: pickedRarity,
        hp,
        attackName: randomAttack.name,
        damage: dmg,
        description: randomPhoto.caption,
        pulledAt: new Date().toLocaleDateString('id-ID')
      };

      setPulledCard(newCard);
      setIsOpened(true);
      setIsTearing(false);

      if (pickedRarity === 'Legendary') {
        playLevelUp(); // play epic fanfare for legendary pulls!
      } else {
        playSelect(); // normal select sound
      }
    }, 1000);
  };

  // Save card to binder inventory
  const handleSaveToBinder = () => {
    if (!pulledCard) return;
    playClick();
    setIsSaving(true);
    
    setTimeout(() => {
      const updatedBinder = [pulledCard, ...binder];
      setBinder(updatedBinder);
      localStorage.setItem(`rpg_card_binder_${currentProfile.id}`, JSON.stringify(updatedBinder));
      setIsSaving(false);
      setPulledCard(null);
      setIsOpened(false);
      // Switch view to Binder tab so they can see their album!
      setActiveTab('binder');
    }, 300);
  };

  const getRarityBadgeStyle = (rarity: string) => {
    switch (rarity) {
      case 'Legendary': return 'bg-[#ffd700] text-slate-950 border-[#cca566] legendary-glow';
      case 'Rare': return 'bg-[#00b4d8] text-white border-[#0077b6]';
      case 'Common':
      default: return 'bg-slate-700 text-slate-200 border-slate-600';
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      
      {/* Tab Navigators */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { playSelect(); setActiveTab('pull'); }}
          className={`rpg-button flex items-center gap-1.5 py-2 px-4 text-xs ${
            activeTab === 'pull' ? 'bg-[#ffd700] text-slate-950' : 'bg-slate-900 text-amber-500 border-slate-700'
          }`}
        >
          <Sparkles size={12} /> PULL GACHA PACK
        </button>
        <button
          onClick={() => { playSelect(); setActiveTab('binder'); }}
          className={`rpg-button flex items-center gap-1.5 py-2 px-4 text-xs ${
            activeTab === 'binder' ? 'bg-[#ffd700] text-slate-950' : 'bg-slate-900 text-amber-500 border-slate-700'
          }`}
        >
          <Library size={12} /> MY CARD BINDER ({binder.length})
        </button>
      </div>

      {activeTab === 'pull' && (
        <div className="flex flex-col items-center justify-center min-h-[480px] text-center">
          
          {!isOpened && !isTearing && (
            <div className="flex flex-col items-center gap-6">
              <div className="rpg-plaque flex items-center gap-1 text-[10px]">
                <Sparkles size={12} className="text-[#ffd700] animate-pulse" /> MEMORIES BOOSTER PACK
              </div>
              <p className="text-[10px] text-slate-400 max-w-sm leading-normal">
                Rip open this booster pack to unlock a random memory photo styled as a rare collectible holographic RPG battle card!
              </p>
              
              {/* Retro Booster Pack Container */}
              <div className="w-52 h-72 bg-gradient-to-b from-[#2a1b15] via-[#4e3629] to-[#16110e] border-4 border-[#ffd700] rounded-xl shadow-2xl relative overflow-hidden flex flex-col justify-between p-4 cursor-pointer transform hover:scale-105 transition-transform group"
                   onClick={handlePullCard}
              >
                {/* Pack foil grid pattern */}
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
                  backgroundImage: 'linear-gradient(45deg, #ffd700 25%, transparent 25%), linear-gradient(-45deg, #ffd700 25%, transparent 25%)',
                  backgroundSize: '16px 16px'
                }}></div>
                
                <span className="text-[8px] rpg-font-retro text-amber-500 block text-right">EDITION NO.1</span>
                
                <div className="my-auto flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-[#1b1613] border-2 border-[#ffd700] flex items-center justify-center shadow-lg group-hover:animate-bounce">
                    <span className="text-2xl">⚔️</span>
                  </div>
                  <h3 className="rpg-font-retro text-yellow-500 text-[10px] leading-tight tracking-wide">
                    GUILD BOOSTER
                  </h3>
                  <span className="text-[7px] rpg-font-retro text-slate-400">1 CARD INSIDE</span>
                </div>
                
                <div className="border-t border-[#ffd700]/30 pt-2 flex justify-between items-center text-[7px] font-mono text-[#cca566]">
                  <span>PULL TO REVEAL</span>
                  <span>100% SATISFYING</span>
                </div>
              </div>
            </div>
          )}

          {/* Ripping Booster Pack Animation */}
          {isTearing && (
            <div className="w-52 h-72 relative flex flex-col justify-center items-center">
              {/* Top Half of Pack */}
              <div className="absolute top-0 left-0 w-full h-[50%] bg-gradient-to-b from-[#2a1b15] to-[#4e3629] border-x-4 border-t-4 border-[#ffd700] rounded-t-xl flex flex-col justify-start p-4 overflow-hidden animate-tear-top z-30">
                <span className="text-[8px] rpg-font-retro text-amber-500 block text-right">EDITION NO.1</span>
                <h3 className="rpg-font-retro text-yellow-500 text-[10px] text-center mt-6">GUILD BOOSTER</h3>
              </div>
              {/* Bottom Half of Pack */}
              <div className="absolute bottom-0 left-0 w-full h-[50%] bg-gradient-to-b from-[#4e3629] to-[#16110e] border-x-4 border-b-4 border-[#ffd700] rounded-b-xl flex flex-col justify-end p-4 overflow-hidden animate-tear-bottom z-30">
                <div className="border-t border-[#ffd700]/30 pt-2 flex justify-between items-center text-[7px] font-mono text-[#cca566]">
                  <span>RIP PACK</span>
                  <span>OPENING...</span>
                </div>
              </div>
              
              {/* Blinding Glow behind pack */}
              <div className="w-32 h-32 rounded-full bg-white blur-3xl opacity-80 animate-pulse absolute z-10"></div>
            </div>
          )}

          {/* Opened Card Reveal Frame */}
          {isOpened && pulledCard && (
            <div className="flex flex-col items-center gap-6">
              
              {/* The Pokemon-Style Holographic Card */}
              <div className={`w-64 h-96 bg-gradient-to-b from-[#1b1613] to-[#0a0807] border-4 rounded-xl p-3 flex flex-col justify-between text-left shadow-2xl holo-shiny animate-card-reveal z-20 ${
                pulledCard.rarity === 'Legendary' ? 'legendary-card' : 'border-[#cca566]'
              }`}>
                
                {/* Header (Title, Rarity & HP) */}
                <div className="flex justify-between items-center border-b border-amber-600/20 pb-1">
                  <div className="flex flex-col">
                    <span className="font-bold text-xs text-yellow-50 truncate max-w-[130px]">
                      {pulledCard.title}
                    </span>
                    <span className={`text-[7px] font-mono border px-1 py-0.2 rounded w-fit uppercase font-bold mt-0.5 ${getRarityBadgeStyle(pulledCard.rarity)}`}>
                      {pulledCard.rarity}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono font-bold text-red-500 flex items-center gap-0.5">
                    HP <strong className="text-xs">{pulledCard.hp}</strong>
                  </span>
                </div>

                {/* Photo Image View */}
                <div className="my-2 border border-amber-600/30 bg-black h-40 overflow-hidden relative flex items-center justify-center rounded">
                  <img
                    src={pulledCard.imageUrl}
                    alt={pulledCard.title}
                    className="w-full h-full object-cover"
                  />
                  {/* Holographic overlay */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/10 via-pink-500/10 to-yellow-500/10 mix-blend-color-dodge pointer-events-none"></div>
                </div>

                {/* RPG Attack Stats section */}
                <div className="bg-slate-950/60 border border-slate-800 rounded p-1.5 text-[9.5px] leading-relaxed text-slate-300">
                  <div className="flex justify-between items-center mb-0.5 border-b border-slate-900 pb-0.5">
                    <strong className="text-yellow-400 flex items-center gap-0.5">⚡ {pulledCard.attackName}</strong>
                    <strong className="text-yellow-500 text-xs font-mono">{pulledCard.damage}</strong>
                  </div>
                  <p className="text-[8px] text-slate-400 italic truncate leading-tight">
                    "{pulledCard.description || 'Tiada deskripsi...'}"
                  </p>
                </div>

                {/* Footer (Uploader details) */}
                <div className="border-t border-slate-800 pt-1.5 flex justify-between items-center text-[7.5px] font-mono text-slate-500 font-semibold">
                  <span>👤 BY: {pulledCard.uploader.split(' ')[0]}</span>
                  <span>{pulledCard.date}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handlePullCard}
                  className="rpg-btn-game flex items-center gap-1 py-1.5 px-3 text-[10px]"
                  style={{
                    background: 'linear-gradient(to bottom, #7f8c8d 0%, #34495e 100%)',
                    boxShadow: '0 3px 0 #2c3e50',
                    border: '2px solid #2c3e50',
                    color: '#fff'
                  }}
                >
                  <RefreshCw size={12} /> DISCARD & RE-ROLL
                </button>
                <button
                  onClick={handleSaveToBinder}
                  disabled={isSaving}
                  className="rpg-btn-game flex items-center gap-1.5 py-2 px-5 text-[10px] text-slate-950"
                >
                  <Trophy size={13} /> {isSaving ? 'SAVING...' : 'SAVE TO BINDER'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'binder' && (
        <div>
          <div className="rpg-plaque mb-4 flex items-center justify-center gap-1.5 text-[10px]">
            <Library size={12} /> COLLECTOR'S BINDER
          </div>
          <p className="text-[10px] text-slate-400 mb-6 font-semibold">
            Tinjau koleksi kartu memori unik yang telah Anda tarik dari booster pack. Setiap kartu merekam momen berharga divisi!
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {binder.map((card) => (
              <div
                key={card.id}
                className={`bg-gradient-to-b from-[#1b1613] to-[#0a0807] border-4 rounded-xl p-2.5 flex flex-col justify-between text-left shadow-md holo-shiny hover:scale-105 ${
                  card.rarity === 'Legendary' ? 'legendary-card' : 'border-[#cca566]'
                }`}
              >
                {/* Header (Title & HP) */}
                <div className="flex justify-between items-center border-b border-amber-600/10 pb-0.5">
                  <div className="flex flex-col">
                    <span className="font-bold text-[10px] text-yellow-50 truncate max-w-[100px]" title={card.title}>
                      {card.title}
                    </span>
                    <span className={`text-[6.5px] font-mono border px-1 py-0.2 rounded w-fit uppercase font-bold mt-0.5 ${getRarityBadgeStyle(card.rarity)}`}>
                      {card.rarity}
                    </span>
                  </div>
                  <span className="text-[8px] font-mono font-bold text-red-500">
                    HP <strong className="text-[10px]">{card.hp}</strong>
                  </span>
                </div>

                {/* Photo Image Frame */}
                <div className="my-1.5 border border-amber-600/20 bg-black h-32 overflow-hidden relative flex items-center justify-center rounded">
                  <img
                    src={card.imageUrl}
                    alt={card.title}
                    className="w-full h-full object-cover"
                  />
                  {/* Holographic overlay */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/10 via-pink-500/10 to-yellow-500/10 mix-blend-color-dodge pointer-events-none"></div>
                </div>

                {/* RPG Attack details */}
                <div className="bg-slate-950/40 border border-slate-900 rounded p-1 text-[8.5px] text-slate-400">
                  <div className="flex justify-between items-center text-yellow-400 font-semibold mb-0.5">
                    <span>⚡ {card.attackName}</span>
                    <span className="font-mono">{card.damage}</span>
                  </div>
                  <p className="text-[7.5px] text-slate-500 italic truncate leading-tight">
                    {card.description}
                  </p>
                </div>

                {/* Footer */}
                <div className="border-t border-slate-800 pt-1 mt-1 flex justify-between items-center text-[7px] font-mono text-slate-500">
                  <span>👤 {card.uploader.split(' ')[0]}</span>
                  <span>{card.pulledAt}</span>
                </div>
              </div>
            ))}

            {binder.length === 0 && (
              <div className="col-span-full py-20 text-center border-4 border-dashed border-[#5a3d28]/30 rounded bg-[#1b1613]/50">
                <p className="text-xs text-slate-500 italic">Belum ada kartu di binder Anda. Silakan tarik kartu pertama Anda!</p>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
