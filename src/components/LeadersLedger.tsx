import React, { useState, useEffect } from 'react';
import type { Profile, Assessment } from '../lib/supabase';
import { db } from '../lib/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, UserCheck, ShieldAlert } from 'lucide-react';
import { playClick, playLevelUp } from '../lib/audio';

interface LeadersLedgerProps {
  currentProfile: Profile;
  profiles: Profile[];
  onRefreshProfiles: () => void;
}

export const LeadersLedger: React.FC<LeadersLedgerProps> = ({
  currentProfile,
  profiles,
  onRefreshProfiles
}) => {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  
  // Rating Form State
  const [commScore, setCommScore] = useState<number>(3);
  const [initScore, setInitScore] = useState<number>(3);
  const [commitScore, setCommitScore] = useState<number>(3);
  const [notes, setNotes] = useState<string>('');
  
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadAssessments = async () => {
    const list = await db.getAssessments();
    setAssessments(list);
  };

  useEffect(() => {
    loadAssessments();

    const unsubscribe = db.subscribe((msg) => {
      if (msg.type === 'assessment_update') {
        loadAssessments();
      }
    });

    return () => unsubscribe();
  }, []);

  // Determine who can be assessed
  // Director can assess anyone.
  // Managers can assess staff in their own sub-division.
  // Staff cannot assess anyone.
  const getAssessableStaff = () => {
    if (currentProfile.role === 'Director') {
      return profiles.filter(p => p.role === 'Staff');
    }
    if (currentProfile.role === 'Manager') {
      return profiles.filter(p => p.role === 'Staff' && p.sub_div_id === currentProfile.sub_div_id);
    }
    return [];
  };

  const assessableStaffList = getAssessableStaff();

  // Set default selected staff on load
  useEffect(() => {
    if (assessableStaffList.length > 0 && !selectedStaffId) {
      setSelectedStaffId(assessableStaffList[0].id);
    } else if (currentProfile.role === 'Staff') {
      setSelectedStaffId(currentProfile.id);
    }
  }, [profiles, currentProfile]);

  // Handle Assessment Submission
  const handleSubmitAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedStaffId) {
      setErrorMsg('Harap pilih staf yang akan dinilai!');
      return;
    }

    try {
      await db.addAssessment(
        currentProfile.id,
        selectedStaffId,
        commScore,
        initScore,
        commitScore,
        notes
      );

      // Increase level of assessed staff slightly to gamify!
      const targetStaff = profiles.find(p => p.id === selectedStaffId);
      let didLevelUp = false;
      if (targetStaff) {
        const currentLevel = targetStaff.level;
        // Every 2 assessments, increase level by 1
        const staffAssCount = assessments.filter(a => a.staff_id === selectedStaffId).length + 1;
        const newLevel = 1 + Math.floor(staffAssCount / 2);
        if (newLevel > currentLevel) {
          await db.updateProfile(selectedStaffId, { level: newLevel });
          didLevelUp = true;
        }
      }

      if (didLevelUp) {
        playLevelUp();
      } else {
        playClick();
      }

      setSuccessMsg('Penilaian mingguan berhasil disimpan!');
      setNotes('');
      setCommScore(3);
      setInitScore(3);
      setCommitScore(3);
      loadAssessments();
      onRefreshProfiles();
    } catch (err) {
      console.error(err);
      setErrorMsg('Gagal menyimpan penilaian.');
    }
  };

  // Compile Chart Data for selected staff
  const getChartData = () => {
    const staffAss = assessments
      .filter(a => a.staff_id === selectedStaffId)
      .sort((a, b) => new Date(a.assessment_date).getTime() - new Date(b.assessment_date).getTime());

    return staffAss.map((ass, i) => {
      const average = parseFloat(((ass.comm_score + ass.init_score + ass.commit_score) / 3).toFixed(2));
      return {
        name: `M-${i + 1}`, // Minggu ke-X
        date: ass.assessment_date,
        Komunikasi: ass.comm_score,
        Inisiatif: ass.init_score,
        Komitmen: ass.commit_score,
        RataRata: average
      };
    });
  };

  const chartData = getChartData();
  const selectedStaffProfile = profiles.find(p => p.id === selectedStaffId);
  const selectedStaffHistory = assessments
    .filter(a => a.staff_id === selectedStaffId)
    .sort((a, b) => new Date(b.assessment_date).getTime() - new Date(a.assessment_date).getTime());

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 max-w-6xl mx-auto">
      
      {/* Simulation/Selection panel (Left: 4 spans) */}
      <div className="lg:col-span-4 flex flex-col gap-4">
        
        {/* Assess Form (Managers & Directors only) */}
        {currentProfile.role !== 'Staff' ? (
          <div className="rpg-panel">
            <h3 className="rpg-title text-sm mb-4 flex items-center gap-1">
              <UserCheck size={18} className="text-amber-500" /> INPUT PENILAIAN
            </h3>
            
            <form onSubmit={handleSubmitAssessment} className="space-y-4 text-xs">
              
              {/* Staff Select */}
              <div>
                <label className="block text-[10px] text-slate-400 mb-1.5 font-semibold">Pilih Staf:</label>
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  className="w-full bg-slate-900 text-yellow-100 p-2.5 rounded border border-amber-600/40 font-bold focus:outline-none"
                >
                  {assessableStaffList.map(staff => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name} (Sub-div: {staff.sub_div_id})
                    </option>
                  ))}
                  {assessableStaffList.length === 0 && (
                    <option value="">Tidak ada staf di sub-divisi Anda</option>
                  )}
                </select>
              </div>

              {/* Sliders */}
              <div className="space-y-3.5 border-t border-amber-600/10 pt-3">
                
                {/* Comm */}
                <div>
                  <div className="flex justify-between font-semibold mb-1">
                    <span className="text-slate-300">Komunikasi:</span>
                    <span className="text-amber-500 font-mono font-bold">{commScore} / 5</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    value={commScore}
                    onChange={(e) => setCommScore(parseInt(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[7px] text-slate-500 font-mono mt-0.5">
                    <span>Pasif</span>
                    <span>Sangat Aktif</span>
                  </div>
                </div>

                {/* Init */}
                <div>
                  <div className="flex justify-between font-semibold mb-1">
                    <span className="text-slate-300">Inisiatif:</span>
                    <span className="text-amber-500 font-mono font-bold">{initScore} / 5</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    value={initScore}
                    onChange={(e) => setInitScore(parseInt(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[7px] text-slate-500 font-mono mt-0.5">
                    <span>Menunggu Arahan</span>
                    <span>Proaktif Tinggi</span>
                  </div>
                </div>

                {/* Commit */}
                <div>
                  <div className="flex justify-between font-semibold mb-1">
                    <span className="text-slate-300">Komitmen:</span>
                    <span className="text-amber-500 font-mono font-bold">{commitScore} / 5</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    value={commitScore}
                    onChange={(e) => setCommitScore(parseInt(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[7px] text-slate-500 font-mono mt-0.5">
                    <span>Sering Absen</span>
                    <span>Penuh Dedikasi</span>
                  </div>
                </div>

              </div>

              {/* Notes */}
              <div className="border-t border-amber-600/10 pt-3">
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Catatan Tambahan:</label>
                <textarea
                  placeholder="Berikan feedback atau evaluasi tugas staf..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={150}
                  className="w-full h-16 bg-slate-900 text-yellow-50 p-2 rounded border border-amber-600/40 focus:outline-none leading-relaxed"
                />
              </div>

              {errorMsg && <p className="text-[10px] text-red-500 font-bold">{errorMsg}</p>}
              {successMsg && <p className="text-[10px] text-green-500 font-bold">{successMsg}</p>}

              <button
                type="submit"
                className="w-full rpg-button py-2 text-[10px]"
              >
                SUBMIT PENILAIAN
              </button>

            </form>
          </div>
        ) : (
          /* Staff View Info */
          <div className="rpg-panel border-red-900/60 bg-red-950/10 text-center py-6">
            <ShieldAlert size={36} className="text-red-500 mx-auto mb-2" />
            <h3 className="rpg-font-retro text-[10px] text-red-400 mb-2">AKSES DIKUNCI</h3>
            <p className="text-[10px] text-slate-400 leading-normal px-2">
              Anda berstatus sebagai **Staff**. Form penilaian performa hanya bisa diakses oleh **Director** dan **Manager** divisi Anda.
            </p>
          </div>
        )}

        {/* Selected Staff Stats Card */}
        {selectedStaffProfile && (
          <div className="rpg-panel">
            <h4 className="rpg-font-retro text-[10px] text-amber-500 mb-3">STATUS AKTIF STAF</h4>
            <div className="flex items-center gap-3 bg-slate-900/60 p-2.5 rounded border border-slate-800">
              <span className="text-xl">{selectedStaffProfile.current_status.split(' ')[0]}</span>
              <div>
                <span className="font-bold text-xs text-yellow-50 block">{selectedStaffProfile.name}</span>
                <span className="text-[9px] text-slate-400 font-medium">
                  Divisi {selectedStaffProfile.sub_div_id} ▪ LV.{selectedStaffProfile.level}
                </span>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Visual Charts & History (Right: 8 spans) */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        
        {/* Trend Graph Card */}
        <div className="rpg-panel min-h-[340px] flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="rpg-title text-sm flex items-center gap-1">
                <TrendingUp size={18} className="text-amber-400 animate-pulse" /> TREN PERFORMA STAF
              </h3>
              {currentProfile.role === 'Staff' && (
                <span className="text-[8px] bg-green-950 border border-green-800 text-green-400 py-1 px-2 rounded font-mono font-bold">
                  AKSES MANDIRI
                </span>
              )}
              {currentProfile.role !== 'Staff' && (
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <span className="text-[9px] text-slate-400 font-mono">TAMPILKAN:</span>
                  <select
                    value={selectedStaffId}
                    onChange={(e) => setSelectedStaffId(e.target.value)}
                    className="bg-slate-900 text-yellow-100 p-1.5 rounded border border-amber-600/30 text-xs focus:outline-none"
                  >
                    {profiles.filter(p => p.role === 'Staff').map(staff => (
                      <option key={staff.id} value={staff.id}>{staff.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {chartData.length > 0 ? (
              <div className="w-full h-[220px] text-xs font-semibold mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#252535" />
                    <XAxis dataKey="name" stroke="#8d99ae" />
                    <YAxis domain={[1, 5]} tickCount={5} stroke="#8d99ae" />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a24', border: '2px double #c5a880', color: '#f0ebd8' }} />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: 8 }} />
                    <Line type="monotone" dataKey="Komunikasi" stroke="#4ea8de" strokeWidth={2.5} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="Inisiatif" stroke="#e76f51" strokeWidth={2.5} />
                    <Line type="monotone" dataKey="Komitmen" stroke="#38b000" strokeWidth={2.5} />
                    <Line type="monotone" dataKey="RataRata" stroke="#ffd700" strokeWidth={3} strokeDasharray="4 4" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center border-2 border-dashed border-slate-800 rounded bg-slate-950/20">
                <p className="text-xs text-slate-500 italic">Belum ada riwayat penilaian mingguan untuk staf ini...</p>
              </div>
            )}
          </div>

          <div className="border-t border-amber-600/10 pt-2 text-[9px] text-slate-400 font-mono text-right flex justify-between items-center">
            <span>Rata-Rata diakumulasikan dari pilar penilaian utama.</span>
            <span className="text-amber-500 font-bold">LEGEND'S CORE</span>
          </div>
        </div>

        {/* Assessment Log Cards list */}
        <div className="rpg-panel">
          <h3 className="rpg-font-retro text-xs text-amber-500 mb-3">RIWAYAT FEEDBACK PENILAIAN</h3>
          
          <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1">
            {selectedStaffHistory.map((ass) => {
              const rAverage = parseFloat(((ass.comm_score + ass.init_score + ass.commit_score) / 3).toFixed(1));
              return (
                <div
                  key={ass.id}
                  className="bg-slate-900 border border-slate-800 rounded p-3 text-xs"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-[10px] text-amber-400 font-mono">
                      📅 MINGGUAN: {ass.assessment_date}
                    </span>
                    <span className="text-[9px] bg-amber-950 border border-amber-500 text-amber-300 py-0.5 px-2 rounded font-mono font-bold">
                      SKOR: {rAverage} / 5
                    </span>
                  </div>
                  
                  {/* Performance breakdowns */}
                  <div className="grid grid-cols-3 gap-2 text-[9.5px] text-slate-400 font-semibold mb-2 bg-slate-950/50 p-1.5 rounded">
                    <span>💬 Komunikasi: <strong className="text-blue-400">{ass.comm_score}</strong></span>
                    <span>💡 Inisiatif: <strong className="text-orange-400">{ass.init_score}</strong></span>
                    <span>🔥 Komitmen: <strong className="text-green-400">{ass.commit_score}</strong></span>
                  </div>

                  {ass.notes && (
                    <p className="text-slate-300 italic leading-relaxed pl-2 border-l-2 border-amber-600/30">
                      "{ass.notes}"
                    </p>
                  )}
                </div>
              );
            })}
            {selectedStaffHistory.length === 0 && (
              <p className="text-[10px] text-slate-500 italic text-center py-6">Belum ada riwayat feedback.</p>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
