import React, { useState, useEffect } from 'react';
import type { Profile } from '../lib/supabase';
import { db } from '../lib/supabase';
import { Shield, ExternalLink, Calendar, Plus, Award, Trash2, Edit } from 'lucide-react';
import { playClick, playSelect } from '../lib/audio';

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
  const [editingQuestId, setEditingQuestId] = useState<string | null>(null);
  
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
    db.getQuests().then(list => {
      if (list.length === 0) {
        // Seed default quests
        Promise.all(DEFAULT_QUESTS.map(q => db.saveQuest(q))).then(() => {
          db.getQuests().then(setQuests);
        });
      } else {
        setQuests(list);
      }
    });

    const unsubscribe = db.subscribe((msg) => {
      if (msg.type === 'quest_update') {
        db.getQuests().then(setQuests);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleAddQuest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !spreadsheetUrl.trim()) return;
    playClick();

    const questData: Quest = {
      id: editingQuestId || Date.now().toString(),
      title: title.trim(),
      description: description.trim(),
      difficulty,
      rewardXp,
      spreadsheetUrl: spreadsheetUrl.trim(),
      deadline
    };

    db.saveQuest(questData).then(() => {
      db.getQuests().then(setQuests);
      closeForm();
    });
  };

  const handleEditQuest = (quest: Quest) => {
    playSelect();
    setEditingQuestId(quest.id);
    setTitle(quest.title);
    setDescription(quest.description);
    setDifficulty(quest.difficulty);
    setRewardXp(quest.rewardXp);
    setSpreadsheetUrl(quest.spreadsheetUrl);
    setDeadline(quest.deadline);
    setShowAddForm(true);
  };

  const handleDeleteQuest = (id: string) => {
    playClick();
    db.deleteQuest(id).then(() => {
      db.getQuests().then(setQuests);
    });
  };

  const closeForm = () => {
    playClick();
    setShowAddForm(false);
    setEditingQuestId(null);
    setTitle('');
    setDescription('');
    setDifficulty('Easy');
    setRewardXp(10);
    setSpreadsheetUrl('https://docs.google.com/spreadsheets');
    setDeadline('2026-06-15');
  };

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case 'Hard': return 'border-red-650 bg-red-900/20 text-red-700';
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
            Daftar penugasan aktif Divisi Education. Halo {currentProfile.name}, tambah, edit, atau hapus quest misi Anda di sini!
          </p>
        </div>

        {!showAddForm && (
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
              <span>{editingQuestId ? 'EDIT QUEST' : 'BUAT QUEST BARU'}</span>
              <button onClick={closeForm} className="text-red-400 hover:text-red-300 font-bold">X</button>
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
                  className="w-full h-16 bg-[#16110e] text-yellow-50 p-2 rounded border border-[#5a3d28] focus:outline-none resize-none"
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
                    onChange={(e) => setRewardXp(parseInt(e.target.value) || 10)}
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

              <div className="flex flex-col gap-2">
                <button type="submit" className="w-full rpg-btn-game">
                  {editingQuestId ? 'SIMPAN PERUBAHAN' : 'PUBLISH MISI QUEST'}
                </button>
                {editingQuestId && (
                  <button type="button" onClick={closeForm} className="w-full py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-400 hover:text-white hover:bg-slate-800 text-[10px] font-bold">
                    BATAL EDIT (BUAT BARU)
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {/* Quest List (8 or 12 spans depending on Form visibility) */}
        <div className={showAddForm ? 'lg:col-span-8 space-y-4' : 'lg:col-span-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'}>
          {quests.map((quest) => (
            <div
              key={quest.id}
              className="rpg-parchment flex flex-col justify-between min-h-[250px] relative transition-transform hover:-translate-y-1"
            >
              <div>
                {/* Header info */}
                <div className="flex justify-between items-start gap-2 mb-3">
                  <span className={`text-[8px] font-mono px-2 py-0.5 rounded border font-bold ${getDifficultyColor(quest.difficulty)}`}>
                    {quest.difficulty.toUpperCase()}
                  </span>
                  
                  {/* Edit and Delete Actions */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleEditQuest(quest)}
                      className="p-1 bg-[#d2b48c]/30 hover:bg-[#b58a55]/30 border border-[#5c3a21]/50 rounded text-yellow-900 transition-colors"
                      title="Edit Quest"
                    >
                      <Edit size={10} />
                    </button>
                    <button
                      onClick={() => handleDeleteQuest(quest.id)}
                      className="p-1 bg-red-100 hover:bg-red-200 border border-red-400 rounded text-red-700 transition-colors"
                      title="Hapus Quest"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>

                <div className="text-[9px] text-stone-600 font-bold font-mono flex items-center gap-1 mb-2">
                  <Calendar size={11} /> Limit: {quest.deadline}
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
              <div>
                <div className="rpg-parchment-divider mb-3"></div>
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
            </div>
          ))}

          {quests.length === 0 && (
            <div className="col-span-full py-16 text-center border-4 border-dashed border-[#5a3d28]/40 rounded bg-[#1b1613]/30">
              <p className="text-xs text-slate-500 italic">Tidak ada quest aktif...</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
