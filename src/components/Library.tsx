import React, { useState, useEffect } from 'react';
import type { Profile } from '../lib/supabase';
import { Book, Image as ImageIcon, Clock, User, FileText, Upload } from 'lucide-react';
import { playSelect } from '../lib/audio';

interface LibraryProps {
  currentProfile: Profile;
}

interface MinuteLog {
  id: string;
  title: string;
  date: string;
  time: string;
  scribe: string;
  summary: string;
  actionItems: string[];
}

interface MemoryPhoto {
  id: string;
  uploader: string;
  date: string;
  url: string;
  caption: string;
}

export const Library: React.FC<LibraryProps> = ({ currentProfile }) => {
  const [minutes, setMinutes] = useState<MinuteLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<MinuteLog | null>(null);
  const [photos, setPhotos] = useState<MemoryPhoto[]>([]);
  const [caption, setCaption] = useState('');
  const [uploadError, setUploadError] = useState('');

  // Default mock minutes
  const DEFAULT_MINUTES: MinuteLog[] = [
    {
      id: 'm1',
      title: 'Briefing Program Kerja & Pembagian Divisi',
      date: '2026-05-20',
      time: '19:00 - 20:30 WIB',
      scribe: 'Alya Nurul',
      summary: 'Rapat perdana Divisi Education menetapkan pembagian fokus kerja ke dalam empat sub-divisi utama: Academic, Pub, Project, dan Comp. Masing-masing sub-divisi didorong merancang kurikulum dan timeline acara 3 bulan ke depan.',
      actionItems: [
        'Sub-divisi Academic merancang modul kurikulum minggu depan.',
        'Sub-divisi Pub membuat template feed Instagram baru.',
        'Sub-divisi Comp menyiapkan repositori kode dan server database.'
      ]
    },
    {
      id: 'm2',
      title: 'Evaluasi Kurikulum & Timeline Event Fair',
      date: '2026-05-27',
      time: '19:30 - 21:00 WIB',
      scribe: 'Budi Prasetyo',
      summary: 'Pembahasan draft modul kurikulum oleh Academic. Publikasi feed Instagram perdana disetujui. Sub-divisi Project melaporkan timeline detail event Education Fair yang akan diselenggarakan akhir semester.',
      actionItems: [
        'Review final modul kurikulum oleh Director paling lambat 4 Juni.',
        'Manager Project menghubungi pihak sponsorship eksternal.',
        'Tim Comp memulai pembuatan landing page pendaftaran.'
      ]
    }
  ];

  // Default photos
  const DEFAULT_PHOTOS: MemoryPhoto[] = [
    {
      id: 'p1',
      uploader: 'Ahmad Rafif Ilmany',
      date: '2026-05-20',
      url: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=300&auto=format&fit=crop',
      caption: 'Sesi perkenalan perdana di tavern, semuanya sangat antusias! 🚀'
    },
    {
      id: 'p2',
      uploader: 'Citra Dewi',
      date: '2026-05-27',
      url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=300&auto=format&fit=crop',
      caption: 'Managerial briefing selepas rapat besar. Semangat mengejar target!'
    }
  ];

  useEffect(() => {
    // Load Minutes & Photos from localStorage
    const savedMinutes = localStorage.getItem('rpg_minutes');
    if (savedMinutes) {
      setMinutes(JSON.parse(savedMinutes));
    } else {
      setMinutes(DEFAULT_MINUTES);
      localStorage.setItem('rpg_minutes', JSON.stringify(DEFAULT_MINUTES));
    }

    const savedPhotos = localStorage.getItem('rpg_photos');
    if (savedPhotos) {
      setPhotos(JSON.parse(savedPhotos));
    } else {
      setPhotos(DEFAULT_PHOTOS);
      localStorage.setItem('rpg_photos', JSON.stringify(DEFAULT_PHOTOS));
    }
  }, []);

  // Handle Photo Upload (Convert to WebP-like Base64 Data URL)
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: max 500KB
    if (file.size > 500 * 1024) {
      setUploadError('Ukuran file melebihi batas 500KB! Harap gunakan gambar yang lebih kecil.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Url = event.target?.result as string;
      
      const newPhoto: MemoryPhoto = {
        id: Date.now().toString(),
        uploader: currentProfile.name,
        date: new Date().toISOString().split('T')[0],
        url: base64Url,
        caption: caption || 'Foto Kenangan Baru 📸'
      };

      const updatedPhotos = [newPhoto, ...photos];
      setPhotos(updatedPhotos);
      localStorage.setItem('rpg_photos', JSON.stringify(updatedPhotos));
      setCaption('');
      // Clear file input value
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 max-w-6xl mx-auto">
      
      {/* Date-Based Meeting Minutes (Left: 6 Spans) */}
      <div className="lg:col-span-6 flex flex-col gap-4">
        <div className="rpg-panel flex-1 flex flex-col min-h-[500px]">
          <h3 className="rpg-title text-base mb-4 flex items-center gap-2">
            <Book className="text-amber-500" /> SCRIBE'S LIBRARY (ARCHIVE)
          </h3>
          <p className="text-[10px] text-slate-400 mb-4 leading-normal">
            Laci arsip digital. Klik notulensi rapat di bawah untuk membuka detail ringkasan rapat, jadwal, dan action items yang harus dikerjakan.
          </p>

          <div className="space-y-3 overflow-y-auto pr-1 flex-1 max-h-[400px]">
            {minutes.map((log) => (
              <div
                key={log.id}
                onClick={() => {
                  playSelect();
                  setSelectedLog(log);
                }}
                className={`p-3 rounded border cursor-pointer transition-all ${
                  selectedLog?.id === log.id
                    ? 'border-amber-500 bg-amber-950/20 text-amber-300'
                    : 'border-slate-700 bg-slate-800/80 hover:bg-slate-700 hover:border-amber-600/60 text-slate-300'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-xs rpg-font-retro text-yellow-50">{log.title}</span>
                  <span className="text-[8px] bg-slate-900 border border-slate-700 px-2 py-0.5 rounded font-mono font-bold text-amber-500">
                    {log.date}
                  </span>
                </div>
                <div className="flex gap-4 text-[9px] text-slate-400 font-medium mt-2">
                  <span className="flex items-center gap-1"><Clock size={11} /> {log.time}</span>
                  <span className="flex items-center gap-1"><User size={11} /> Scribe: {log.scribe}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Detailed View Modal or Section below list */}
          {selectedLog && (
            <div className="border-t border-amber-600/30 pt-4 mt-4 text-xs space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-amber-400 text-sm flex items-center gap-1">
                  <FileText size={14} /> Detail Notulensi
                </h4>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="text-slate-400 hover:text-white font-mono font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 text-[8px]"
                >
                  TUTUP
                </button>
              </div>
              <p className="text-slate-300 leading-normal bg-slate-900/60 p-2.5 rounded border border-slate-800">
                {selectedLog.summary}
              </p>
              <div>
                <span className="font-bold text-[10px] text-amber-500 block mb-1">ACTION ITEMS:</span>
                <ul className="space-y-1.5">
                  {selectedLog.actionItems.map((item, index) => (
                    <li key={index} className="flex gap-2 items-start text-slate-400">
                      <span className="text-amber-500 mt-0.5">▪</span>
                      <span className="leading-normal">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Infinite Vertical Memory Wall (Right: 6 Spans) */}
      <div className="lg:col-span-6 flex flex-col gap-4">
        <div className="rpg-panel flex-1 flex flex-col min-h-[500px]">
          <h3 className="rpg-title text-base mb-4 flex items-center gap-2">
            <ImageIcon className="text-amber-500" /> MEMORY WALL
          </h3>
          
          {/* Photo Uploader Form */}
          <div className="bg-slate-950/70 border border-slate-800 p-3 rounded mb-4 text-xs">
            <h4 className="font-bold text-amber-500 mb-2 flex items-center gap-1">
              <Upload size={12} /> UPLOAD FOTO KENANGAN (MAKS 500KB)
            </h4>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Tulis caption foto..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full bg-slate-900 text-yellow-50 px-2.5 py-1.5 rounded border border-amber-600/40 text-xs focus:outline-none"
              />
              <div className="flex gap-2 items-center">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="block w-full text-[10px] text-slate-500
                    file:mr-4 file:py-1 file:px-3
                    file:rounded file:border-0
                    file:text-[10px] file:font-semibold
                    file:bg-amber-950 file:text-amber-400
                    hover:file:bg-amber-900 cursor-pointer"
                />
              </div>
              {uploadError && (
                <span className="text-[9px] text-red-500 font-semibold block">{uploadError}</span>
              )}
            </div>
          </div>

          {/* Photo Feed List */}
          <div className="space-y-4 overflow-y-auto pr-1 flex-1 max-h-[380px]">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="bg-slate-900 border border-slate-800 rounded p-3 text-xs shadow-md"
              >
                {/* Photo Header */}
                <div className="flex justify-between items-center mb-2.5">
                  <span className="font-bold text-slate-300 flex items-center gap-1">
                    👤 {photo.uploader}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono font-semibold">
                    {photo.date}
                  </span>
                </div>

                {/* Photo Image Frame */}
                <div className="border border-amber-600/30 rounded overflow-hidden max-h-[220px] bg-slate-950 flex items-center justify-center relative group">
                  <img
                    src={photo.url}
                    alt={photo.caption}
                    className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                    style={{ imageRendering: 'auto' }} // photos render smooth
                  />
                </div>

                {/* Photo Caption */}
                <p className="mt-2.5 text-slate-300 italic leading-normal">
                  {photo.caption}
                </p>
              </div>
            ))}
            {photos.length === 0 && (
              <p className="text-[10px] text-slate-500 italic text-center py-10">Belum ada foto kenangan...</p>
            )}
          </div>

        </div>
      </div>

    </div>
  );
};
