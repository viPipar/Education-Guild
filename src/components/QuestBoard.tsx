import React, { useState, useEffect } from 'react';
import type { Profile } from '../lib/supabase';
import { Shield, ExternalLink, Calendar, Plus, Award } from 'lucide-react';
import { playSelect } from '../lib/audio';

interface Quest {
  id: string;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  rewardXp: number;
  spreadsheetUrl: string;
  deadline: string;
}

interface QuestBoardProps {
  currentProfile: Profile;
}

export const QuestBoard: React.FC<QuestBoardProps> = ({ currentProfile }) => {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // New quest form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Easy');
  const [rewardXp, setRewardXp] = useState(10);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState('https://docs.google.com/spreadsheets/d/1example/edit');
  const [deadline, setDeadline] = useState('2026-06-15');

  const DEFAULT_QUESTS: Quest[] = [
    {
      id: 'q1',
      title: 'Penyusunan Silabus Kelas Baru (Academic)',
      description: 'Menyusun rancangan silabus & materi ajar untuk kelas pemrograman dasar.',
      difficulty: 'Easy',
      rewardXp: 15,
      spreadsheetUrl: 'https://docs.google.com/spreadsheets',
      deadline: '2026-06-08'
    },
    {
      id: 'q2',
      title: 'Desain Poster Pendaftaran Webinar (Pub)',
      description: 'Membuat aset desain grafis, poster promosi, dan feed Instagram webinar education.',
      difficulty: 'Medium',
      rewardXp: 30,
      spreadsheetUrl: 'https://docs.google.com/spreadsheets',
      deadline: '2026-06-12'
    },
    {
      id: 'q3',
      title: 'Slicing Landing Page & Supabase (Comp)',
      description: 'Melakukan coding frontend react dan integrasi tabel database Supabase.',
      difficulty: 'Hard',
      rewardXp: 50,
      spreadsheetUrl: 'https://docs.google.com/spreadsheets',
      deadline: '2026-06-20'
    }
  ];

  useEffect(() => {
    const savedQuests = localStorage.getItem('rpg_quests');
    if (savedQuests) {
      setQuests(JSON.parse(savedQuests));
    } else {
      setQuests(DEFAULT_QUESTS);
      localStorage.setItem('rpg_quests', JSON.stringify(DEFAULT_QUESTS));
    }
  }, []);

  const handleAddQuest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !spreadsheetUrl.trim()) return;

    const newQuest: Quest = {
      id: Date.now().toString(),
      title,
      description,
      difficulty,
      rewardXp,
      spreadsheetUrl,
      deadline
    };

    const updatedQuests = [...quests, newQuest];
    setQuests(updatedQuests);
    localStorage.setItem('rpg_quests', JSON.stringify(updatedQuests));

    // Reset Form
    setTitle('');
    setDescription('');
    setDifficulty('Easy');
    setRewardXp(10);
    setSpreadsheetUrl('https://docs.google.com/spreadsheets');
    setShowAddForm(false);
  };

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case 'Hard': return 'border-red-600 bg-red-900/20 text-red-700';
      case 'Medium': return 'border-orange-500 bg-orange-900/20 text-orange-700';
      case 'Easy':
      default: return 'border-green-600 bg-green-900/20 text-green-700';
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      
      {/* Plaque Header title */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="rpg-plaque mb-1 flex items-center gap-1.5">
            <Shield size={14} className="text-yellow-400" /> GUILD QUEST BOARD
          </div>
          <p className="text-[10px] text-slate-400 font-medium">
            Daftar penugasan aktif Divisi Education. Ambil quest untuk menyelesaikan tugas!
          </p>
        </div>

        {/* Add quest (Director / Manager only) */}
        {currentProfile.role !== 'Staff' && !showAddForm && (
          <button
            onClick={() => {
              playSelect();
              setShowAddForm(true);
            }}
            className="rpg-btn-game flex items-center gap-1.5"
          >
            <Plus size={12} /> TAMBAH QUEST
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Quest Creator Panel */}
        {showAddForm && (
          <div className="lg:col-span-4 rpg-panel-wood h-fit">
            <h3 className="rpg-font-retro text-[9px] text-[#cca566] mb-4 flex items-center justify-between border-b border-stone-700 pb-2">
              <span>📜 BUAT QUEST BARU</span>
              <button onClick={() => setShowAddForm(false)} className="text-red-400 hover:text-red-300 font-bold">X</button>
            </h3>
            
            <form onSubmit={handleAddQuest} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-[9px] text-slate-400 mb-1">Judul Misi:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Publikasi Feed Instagram"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[#16110e] text-yellow-50 px-2.5 py-1.5 rounded border border-[#5a3d28] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[9px] text-slate-400 mb-1">Deskripsi Singkat Misi:</label>
                <textarea
                  placeholder="Tulis instruksi singkat..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full h-16 bg-[#16110e] text-yellow-50 p-2 rounded border border-[#5a3d28] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] text-slate-400 mb-1">Tingkat Kesulitan:</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as any)}
                    className="w-full bg-[#16110e] text-yellow-50 p-2 rounded border border-[#5a3d28] focus:outline-none"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] text-slate-400 mb-1">XP Reward:</label>
                  <input
                    type="number"
                    min="5"
                    max="100"
                    value={rewardXp}
                    onChange={(e) => setRewardXp(parseInt(e.target.value))}
                    className="w-full bg-[#16110e] text-yellow-50 p-2 rounded border border-[#5a3d28] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] text-slate-400 mb-1">Link Google Spreadsheet:</label>
                <input
                  type="url"
                  required
                  placeholder="https://docs.google.com/spreadsheets/..."
                  value={spreadsheetUrl}
                  onChange={(e) => setSpreadsheetUrl(e.target.value)}
                  className="w-full bg-[#16110e] text-yellow-50 px-2.5 py-1.5 rounded border border-[#5a3d28] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[9px] text-slate-400 mb-1">Batas Waktu (Deadline):</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full bg-[#16110e] text-yellow-50 p-2 rounded border border-[#5a3d28] focus:outline-none"
                />
              </div>

              <button type="submit" className="w-full rpg-btn-game">
                PUBLISH MISI QUEST
              </button>
            </form>
          </div>
        )}

        {/* Quest List (8 or 12 spans depending on Form visibility) */}
        <div className={showAddForm ? 'lg:col-span-8 space-y-4' : 'lg:col-span-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'}>
          {quests.map((quest) => (
            <div
              key={quest.id}
              className="rpg-parchment flex flex-col justify-between min-h-[240px] relative transition-transform hover:-translate-y-1"
            >
              <div>
                {/* Header info */}
                <div className="flex justify-between items-start gap-2 mb-3">
                  <span className={`text-[8px] font-mono px-2 py-0.5 rounded border font-bold ${getDifficultyColor(quest.difficulty)}`}>
                    {quest.difficulty.toUpperCase()}
                  </span>
                  <span className="text-[9px] text-stone-600 font-bold font-mono flex items-center gap-1">
                    <Calendar size={11} /> Limit: {quest.deadline}
                  </span>
                </div>

                {/* Title */}
                <h3 className="font-bold text-stone-900 text-sm mb-2 leading-relaxed">
                  {quest.title}
                </h3>

                {/* Desc */}
                <p className="text-xs text-stone-700 leading-normal font-medium mb-4">
                  {quest.description}
                </p>
              </div>

              {/* Bottom footer action */}
              <div className="rpg-parchment-divider"></div>
              
              <div className="flex justify-between items-center">
                <span className="text-[9.5px] text-yellow-700 font-bold font-mono flex items-center gap-0.5">
                  <Award size={13} className="text-yellow-600" /> +{quest.rewardXp} XP
                </span>
                
                {/* Redirects to User's Spreadsheet */}
                <a
                  href={quest.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => playSelect()}
                  className="rpg-btn-game text-stone-900 py-1.5 px-3 flex items-center gap-1.5"
                  style={{
                    background: 'linear-gradient(to bottom, #d2b48c 0%, #b58a55 100%)',
                    boxShadow: '0 3px 0 #5c3a21',
                    border: '2px solid #5c3a21',
                    outline: 'none'
                  }}
                >
                  BUKA MISI <ExternalLink size={10} />
                </a>
              </div>
            </div>
          ))}

          {quests.length === 0 && (
            <div className="col-span-full py-16 text-center border-4 border-dashed border-[#5a3d28]/40 rounded bg-[#1b1613]">
              <p className="text-xs text-slate-500 italic">Tidak ada quest aktif...</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
