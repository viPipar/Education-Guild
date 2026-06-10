import React, { useState, useEffect, useRef } from 'react';
import type { Profile, MinuteLog, MemoryPhoto } from '../lib/supabase';
import { db } from '../lib/supabase';
import { 
  Book, Image as ImageIcon, Clock, User, FileText, Upload, Plus, X, Trash2, ArrowLeft, AlertTriangle, Save
} from 'lucide-react';
import { playClick, playSelect } from '../lib/audio';

interface LibraryProps {
  currentProfile: Profile;
}

// Client-side Image Compression helper using HTML5 Canvas
const compressImage = (file: File, maxWidth = 800, quality = 0.6): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Scale proportionally if width exceeds maxWidth
        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string); // fallback
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export const Library: React.FC<LibraryProps> = ({ currentProfile }) => {
  const [minutes, setMinutes] = useState<MinuteLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<MinuteLog | null>(null);
  
  // Memory boards state
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [boardPhotos, setBoardPhotos] = useState<MemoryPhoto[]>([]);
  
  // Polaroid Drag State
  const [draggingPhotoId, setDraggingPhotoId] = useState<string | null>(null);
  const [dragStartOffset, setDragStartOffset] = useState({ x: 0, y: 0 });
  const boardRef = useRef<HTMLDivElement | null>(null);
  
  // Custom states for minutes editing
  const [newActionItem, setNewActionItem] = useState('');
  const [uploadError, setUploadError] = useState('');

  // Load minutes and board layouts on init or board change
  const loadData = async () => {
    const minsData = await db.getMinutes();
    setMinutes(minsData);

    if (activeBoardId) {
      const photosData = await db.getMemoryBoard(activeBoardId);
      setBoardPhotos(photosData);
    }
  };

  useEffect(() => {
    loadData();

    // Database Realtime Broadcast Sync
    const unsubscribe = db.subscribe((msg) => {
      if (msg.type === 'minutes_update') {
        db.getMinutes().then(setMinutes);
        if (msg.payload.log) {
          setSelectedLog(prev => prev && prev.id === msg.payload.log.id ? msg.payload.log : prev);
        } else if (msg.payload.deletedId) {
          setSelectedLog(prev => prev && prev.id === msg.payload.deletedId ? null : prev);
        }
      } else if (msg.type === 'memory_board_update' && activeBoardId === msg.payload.boardId) {
        setBoardPhotos(msg.payload.photos);
      }
    });

    return () => unsubscribe();
  }, [activeBoardId]);

  // Create new Meeting minutes
  const handleAddMinuteLog = () => {
    playClick();
    const newLog: MinuteLog = {
      id: 'minutes_' + Date.now(),
      title: 'Notulensi Rapat Baru',
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().split(' ')[0].substring(0, 5),
      scribe: currentProfile.name,
      summary: '',
      actionItems: [],
      photos: []
    };
    setSelectedLog(newLog);
  };

  const handleUpdateMinuteField = (fields: Partial<MinuteLog>) => {
    if (!selectedLog) return;
    setSelectedLog(prev => prev ? { ...prev, ...fields } : null);
  };

  const handleSaveMinuteLog = async () => {
    if (!selectedLog) return;
    playClick();
    await db.saveMinuteLog(selectedLog);
    const data = await db.getMinutes();
    setMinutes(data);
    setSelectedLog(null);
  };

  const handleDeleteMinuteLog = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Hapus notulensi rapat ini secara permanen?')) {
      playClick();
      await db.deleteMinuteLog(id);
      if (selectedLog?.id === id) {
        setSelectedLog(null);
      }
      db.getMinutes().then(setMinutes);
    }
  };

  // Action Items CRUD inside editor
  const handleAddActionItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLog || !newActionItem.trim()) return;
    playClick();
    const updatedItems = [...selectedLog.actionItems, newActionItem.trim()];
    handleUpdateMinuteField({ actionItems: updatedItems });
    setNewActionItem('');
  };

  const handleDeleteActionItem = (index: number) => {
    if (!selectedLog) return;
    playClick();
    const updatedItems = selectedLog.actionItems.filter((_, i) => i !== index);
    handleUpdateMinuteField({ actionItems: updatedItems });
  };

  // Compressed Image Uploader (Documentation & Polaroid)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, isBoard = false) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) return;

    // Optional warning if file is exceptionally massive
    if (file.size > 8 * 1024 * 1024) {
      setUploadError('File terlalu besar! Batas ukuran maksimal file adalah 8MB.');
      return;
    }

    try {
      const compressedBase64 = await compressImage(file, 800, 0.6);

      if (isBoard) {
        const latestPhotos = await db.getMemoryBoard(activeBoardId!);
        const newPhoto: MemoryPhoto = {
          id: 'photo_' + Date.now(),
          uploader: currentProfile.name,
          date: new Date().toISOString().split('T')[0],
          url: compressedBase64,
          caption: 'Ketuk untuk menulis caption... 📸',
          x: 40 + Math.random() * 12,
          y: 25 + Math.random() * 12,
          rotate: Math.round(Math.random() * 12 - 6) // random subtle rotation
        };
        const updated = [...latestPhotos, newPhoto];
        setBoardPhotos(updated);
        await db.saveMemoryBoard(activeBoardId!, updated);
      } else if (selectedLog) {
        const updatedPhotos = [...(selectedLog.photos || []), compressedBase64];
        await handleUpdateMinuteField({ photos: updatedPhotos });
      }
    } catch (err) {
      console.error(err);
      setUploadError('Gagal memproses dan mengompres foto. Harap coba file lain.');
    }
    e.target.value = '';
  };

  // Delete documentation photo inside minutes editor
  const handleDeleteDocPhoto = async (photoIdx: number) => {
    if (!selectedLog) return;
    playClick();
    const updatedPhotos = (selectedLog.photos || []).filter((_, idx) => idx !== photoIdx);
    await handleUpdateMinuteField({ photos: updatedPhotos });
  };

  // Polaroid Drag Controls
  const handlePhotoMouseDown = (e: React.MouseEvent, photoId: string) => {
    e.stopPropagation();
    playClick();
    setDraggingPhotoId(photoId);

    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const photo = boardPhotos.find(p => p.id === photoId);
      if (!photo) return;

      const photoXPx = (photo.x / 100) * rect.width;
      const photoYPx = (photo.y / 100) * rect.height;

      setDragStartOffset({
        x: mouseX - photoXPx,
        y: mouseY - photoYPx
      });
    }
  };

  const handleBoardMouseMove = (e: React.MouseEvent) => {
    if (draggingPhotoId && boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newXPx = mouseX - dragStartOffset.x;
      const newYPx = mouseY - dragStartOffset.y;

      const xPct = Math.min(90, Math.max(0, (newXPx / rect.width) * 100));
      const yPct = Math.min(90, Math.max(0, (newYPx / rect.height) * 100));

      setBoardPhotos(prev => prev.map(p => p.id === draggingPhotoId ? { ...p, x: xPct, y: yPct } : p));
    }
  };

  const handleBoardMouseUp = async () => {
    if (draggingPhotoId) {
      const targetId = draggingPhotoId;
      setDraggingPhotoId(null);
      const latestPhotos = await db.getMemoryBoard(activeBoardId!);
      const draggedPhotoLocal = boardPhotos.find(p => p.id === targetId);
      if (draggedPhotoLocal) {
        const updated = latestPhotos.map(p => 
          p.id === targetId ? { ...p, x: draggedPhotoLocal.x, y: draggedPhotoLocal.y } : p
        );
        setBoardPhotos(updated);
        await db.saveMemoryBoard(activeBoardId!, updated);
      }
    }
  };

  const handleUpdatePolaroidCaption = (photoId: string, text: string) => {
    setBoardPhotos(prev => prev.map(p => p.id === photoId ? { ...p, caption: text } : p));
  };

  const handleSavePolaroidCaption = async (photoId: string) => {
    const target = boardPhotos.find(p => p.id === photoId);
    if (target) {
      const latestPhotos = await db.getMemoryBoard(activeBoardId!);
      const updated = latestPhotos.map(p => 
        p.id === photoId ? { ...p, caption: target.caption } : p
      );
      setBoardPhotos(updated);
      await db.saveMemoryBoard(activeBoardId!, updated);
    }
  };

  const handleDeletePolaroid = async (photoId: string) => {
    if (window.confirm('Apakah Anda ingin membuang foto Polaroid ini dari papan memori?')) {
      playClick();
      const latestPhotos = await db.getMemoryBoard(activeBoardId!);
      const updated = latestPhotos.filter(p => p.id !== photoId);
      setBoardPhotos(updated);
      await db.saveMemoryBoard(activeBoardId!, updated);
    }
  };

  return (
    <div className="p-4 max-w-7xl mx-auto w-full relative">
      
      {/* CORKBOARD SCREEN (Active Memory Wall Canvas Overlay) */}
      {activeBoardId ? (
        <div className="fixed inset-0 bg-[#0c0c0f]/90 z-[2000] flex flex-col p-4 backdrop-blur-sm">
          <div className="rpg-panel-glass flex-1 flex flex-col rounded border-2 border-stone-600/50 overflow-hidden relative">
            
            {/* Board Header */}
            <div className="flex justify-between items-center border-b border-amber-600/20 pb-3 mb-3 gap-2 px-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { playSelect(); setActiveBoardId(null); }}
                  className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1.5 text-xs font-bold font-mono"
                >
                  <ArrowLeft size={13} /> KEMBALI
                </button>
                <span className="text-amber-500 font-bold text-xs uppercase tracking-wide rpg-font-retro flex items-center gap-2 pl-2">
                  <span>📌</span> {activeBoardId === 'education' ? 'EDUCATION BOARD' : activeBoardId === 'academic_pub' ? 'ACADEMIC & PUBLICATION BOARD' : 'PROJECT & COMPETITION BOARD'}
                </span>
              </div>

              {/* Action buttons inside board */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 border border-slate-800 rounded relative cursor-pointer hover:border-amber-500/50">
                  <Upload size={12} className="text-amber-500" />
                  <span className="text-[10px] text-yellow-100 font-bold select-none">PIN FOTO POLAROID</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handlePhotoUpload(e, true)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {uploadError && (
              <div className="mx-2 mb-2 p-2 bg-red-950/40 border border-red-900/30 text-red-300 text-[10px] font-semibold rounded text-center flex items-center justify-center gap-1">
                <AlertTriangle size={12} /> {uploadError}
              </div>
            )}

            {/* Corkboard Workspace Container */}
            <div 
              className="flex-1 bg-[#1e1915] border-2 border-amber-900/35 rounded overflow-auto relative select-none cursor-default no-scrollbar"
              onMouseMove={handleBoardMouseMove}
              onMouseUp={handleBoardMouseUp}
              onMouseLeave={handleBoardMouseUp}
            >
              {/* Massive scrollable Corkboard canvas */}
              <div
                ref={boardRef}
                style={{
                  width: '1600px',
                  height: '1000px',
                  backgroundImage: 'radial-gradient(rgba(102, 68, 34, 0.3) 1.5px, transparent 1.5px)',
                  backgroundSize: '20px 20px',
                  backgroundColor: '#4e3629' // Warm corkboard brown
                }}
                className="relative shadow-inner overflow-hidden border-4 border-[#3a251b]"
              >
                {/* Visual corkboard frame decoration overlay */}
                <div className="absolute inset-0 bg-[#3a251b]/10 pointer-events-none shadow-[inner_0_0_100px_rgba(0,0,0,0.8)]" />
                
                {/* Polaroid elements */}
                {boardPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    onMouseDown={(e) => handlePhotoMouseDown(e, photo.id)}
                    style={{
                      left: `${photo.x}%`,
                      top: `${photo.y}%`,
                      transform: `rotate(${photo.rotate || 0}deg)`,
                      position: 'absolute',
                      cursor: 'grab'
                    }}
                    className="bg-[#faf9f6] p-3 pb-8 w-44 shadow-2xl flex flex-col items-center z-10 border border-stone-200/50 hover:z-30 hover:scale-[1.03] transition-transform duration-200 select-none"
                  >
                    {/* Polaroid Header Pin decoration */}
                    <div className="w-3.5 h-3.5 rounded-full bg-red-600/80 border-2 border-red-500 absolute -top-1.5 left-1/2 -translate-x-1/2 shadow-md z-40 pointer-events-none" />
                    
                    {/* Close / Remove Pin handle */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeletePolaroid(photo.id); }}
                      className="absolute top-1.5 right-1.5 w-4 h-4 bg-slate-900/60 hover:bg-red-650 text-white rounded-full flex items-center justify-center text-[8px] z-30 transition-colors"
                      title="Buang Foto"
                    >
                      <X size={10} />
                    </button>

                    {/* Image Area */}
                    <div className="w-full h-32 bg-stone-900 border border-stone-300/40 rounded-sm overflow-hidden pointer-events-none select-none relative shadow-inner">
                      <img
                        src={photo.url}
                        alt="Polaroid Memory"
                        className="w-full h-full object-cover pointer-events-none"
                      />
                    </div>

                    {/* Polaroid Caption Footer */}
                    <div className="w-full mt-3 px-1 flex flex-col items-center">
                      <textarea
                        value={photo.caption}
                        onChange={(e) => handleUpdatePolaroidCaption(photo.id, e.target.value)}
                        onBlur={() => handleSavePolaroidCaption(photo.id)}
                        onClick={(e) => e.stopPropagation()}
                        rows={2}
                        className="w-full bg-transparent border-none text-center font-serif text-[10px] text-stone-800 leading-normal italic font-semibold focus:outline-none resize-none no-scrollbar placeholder-stone-400 focus:bg-stone-100/50 rounded"
                        placeholder="Klik untuk menulis caption..."
                      />
                      <span className="text-[5px] text-stone-400 font-bold block mt-1 tracking-wider uppercase select-none">
                        📍 {photo.uploader.split(' ')[0]} • {photo.date}
                      </span>
                    </div>

                  </div>
                ))}

                {boardPhotos.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center opacity-30 pointer-events-none">
                    <span className="text-4xl mb-2">📌</span>
                    <span className="text-xs rpg-font-retro text-amber-500 uppercase tracking-widest">Papan Penuh Memori Kosong</span>
                    <span className="text-[9px] text-yellow-100 font-bold mt-1">Unggah foto dokumentasi Anda untuk disematkan sebagai Polaroid!</span>
                  </div>
                )}

              </div>
            </div>
            
          </div>
        </div>
      ) : null}

      {/* GOOGLE DOCS-STYLE MINUTES EDITOR OVERLAY */}
      {selectedLog ? (
        <div className="fixed inset-0 bg-[#0c0c0f]/95 z-[2000] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="rpg-panel-glass max-w-4xl w-full flex flex-col h-[90vh] border-2 border-amber-600/30 overflow-hidden relative bg-[#1c1815]">
            
            {/* Header Document bar */}
            <div className="flex justify-between items-center border-b border-amber-600/20 pb-3 p-4 bg-slate-950/60">
              <div className="flex items-center gap-3 w-3/5">
                <button
                  onClick={() => { playSelect(); setSelectedLog(null); }}
                  className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1 font-bold font-mono text-[10px]"
                >
                  <ArrowLeft size={12} /> TUTUP
                </button>
                
                {/* Editable Document Title */}
                <input
                  type="text"
                  value={selectedLog.title}
                  onChange={(e) => handleUpdateMinuteField({ title: e.target.value })}
                  placeholder="Judul Rapat..."
                  className="flex-1 bg-transparent border-b border-transparent hover:border-slate-700 focus:border-amber-500 focus:outline-none text-yellow-100 font-bold text-sm py-0.5 font-mono"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveMinuteLog}
                  className="px-2.5 py-1 bg-green-700 hover:bg-green-600 border border-green-800 text-white text-[9px] font-bold rounded flex items-center gap-1 shadow-md hover:scale-105 transition-all font-mono"
                >
                  <Save size={10} /> SIMPAN RAPAT
                </button>
                <button
                  onClick={(e) => { setSelectedLog(null); handleDeleteMinuteLog(selectedLog.id, e); }}
                  className="p-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-900/30 text-red-300 text-[10px] font-bold rounded flex items-center gap-1"
                >
                  <Trash2 size={12} /> Hapus
                </button>
              </div>
            </div>

            {/* Document sheet view */}
            <div className="flex-1 overflow-y-auto p-6 md:p-10 flex flex-col items-center bg-[#151210]">
              
              {/* Paper Content container */}
              <div className="w-full max-w-2xl bg-[#faf9f6] text-stone-900 shadow-[0_15px_40px_rgba(0,0,0,0.5)] border-2 border-stone-200/20 rounded p-6 md:p-10 space-y-6 flex flex-col font-serif leading-relaxed text-sm">
                
                {/* Sheet header */}
                <div className="border-b-2 border-stone-300/80 pb-4 space-y-3 font-sans text-stone-600">
                  <div className="flex items-center gap-2 text-xs font-bold text-stone-500">
                    <FileText size={16} className="text-amber-800" />
                    <span>DOKUMEN NOTULENSI RAPAT</span>
                  </div>
                  
                  {/* Metadata fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] font-semibold">
                    <div className="flex items-center gap-1.5">
                      <span className="text-stone-400">TANGGAL:</span>
                      <input
                        type="date"
                        value={selectedLog.date}
                        onChange={(e) => handleUpdateMinuteField({ date: e.target.value })}
                        className="bg-transparent border-b border-transparent focus:border-stone-400 focus:outline-none text-stone-800 font-bold p-0.5"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-stone-400">PUKUL:</span>
                      <input
                        type="text"
                        value={selectedLog.time}
                        onChange={(e) => handleUpdateMinuteField({ time: e.target.value })}
                        placeholder="Pukul..."
                        className="bg-transparent border-b border-transparent focus:border-stone-400 focus:outline-none text-stone-800 font-bold w-16 p-0.5"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-stone-400">SCRIBE:</span>
                      <input
                        type="text"
                        value={selectedLog.scribe}
                        onChange={(e) => handleUpdateMinuteField({ scribe: e.target.value })}
                        placeholder="Scribe..."
                        className="bg-transparent border-b border-transparent focus:border-stone-400 focus:outline-none text-stone-800 font-bold w-24 p-0.5"
                      />
                    </div>
                  </div>
                </div>

                {/* Summary Textarea (Main Google docs Editor sheet) */}
                <div className="flex flex-col flex-1 space-y-2">
                  <label className="block text-[9.5px] font-sans font-bold text-stone-500 uppercase tracking-widest">
                    Ringkasan Hasil Rapat:
                  </label>
                  <textarea
                    value={selectedLog.summary}
                    onChange={(e) => handleUpdateMinuteField({ summary: e.target.value })}
                    className="w-full bg-[#fcfbf9] border border-stone-200 focus:border-amber-700 focus:outline-none rounded p-4 text-xs font-serif leading-relaxed text-stone-800 resize-none min-h-[160px] flex-1 shadow-inner focus:ring-1 focus:ring-amber-700/30"
                    placeholder="Tulis detail keputusan, ringkasan, atau pembahasan rapat..."
                  />
                </div>

                {/* Action Items Bullet lists */}
                <div className="space-y-3 pt-3 border-t border-stone-200">
                  <label className="block text-[9.5px] font-sans font-bold text-stone-500 uppercase tracking-widest">
                    Rencana Tindak Lanjut (Action Items):
                  </label>
                  
                  {/* Action Items rendering */}
                  <ul className="space-y-1.5 font-sans text-xs">
                    {selectedLog.actionItems.map((item, index) => (
                      <li key={index} className="flex gap-2 items-center justify-between group bg-stone-100 px-2.5 py-1.5 rounded text-stone-700 font-semibold">
                        <div className="flex items-center gap-2">
                          <span className="text-amber-800">•</span>
                          <span>{item}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteActionItem(index)}
                          className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={10} />
                        </button>
                      </li>
                    ))}
                    {selectedLog.actionItems.length === 0 && (
                      <p className="text-[10px] text-stone-400 italic">Belum ada action items...</p>
                    )}
                  </ul>

                  {/* Add action item form */}
                  <form onSubmit={handleAddActionItem} className="flex gap-1.5 mt-2">
                    <input
                      type="text"
                      placeholder="Tambah action item..."
                      value={newActionItem}
                      onChange={(e) => setNewActionItem(e.target.value)}
                      className="flex-1 bg-white border border-stone-200 rounded px-2.5 py-1.5 text-xs text-stone-800 font-sans focus:outline-none focus:border-amber-700"
                    />
                    <button
                      type="submit"
                      className="bg-amber-900 hover:bg-amber-800 text-white font-sans font-bold text-[10px] px-3.5 rounded flex items-center justify-center"
                    >
                      TAMBAH
                    </button>
                  </form>
                </div>

                {/* Meeting documentation photos list */}
                <div className="space-y-3 pt-4 border-t border-stone-200">
                  <div className="flex justify-between items-center">
                    <label className="block text-[9.5px] font-sans font-bold text-stone-500 uppercase tracking-widest">
                      FOTO DOKUMENTASI RAPAT ({selectedLog.photos?.length || 0})
                    </label>
                    <div className="flex items-center gap-1 bg-amber-900/10 hover:bg-amber-900/20 px-2.5 py-1 rounded border border-amber-900/25 relative cursor-pointer font-sans">
                      <Upload size={10} className="text-amber-800" />
                      <span className="text-[9px] text-amber-900 font-bold select-none">UPLOAD FOTO</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handlePhotoUpload(e, false)}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Photo Documentation Grid */}
                  <div className="grid grid-cols-3 gap-3">
                    {selectedLog.photos?.map((photo, photoIdx) => (
                      <div key={photoIdx} className="aspect-video bg-stone-900 border border-stone-200 rounded overflow-hidden relative group">
                        <img
                          src={photo}
                          alt="Meeting documentation"
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => handleDeleteDocPhoto(photoIdx)}
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-red-400 hover:text-red-300 transition-opacity"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {(!selectedLog.photos || selectedLog.photos.length === 0) && (
                      <div className="col-span-3 border border-dashed border-stone-300 rounded p-6 text-center opacity-40 font-sans">
                        <span className="text-xl block mb-1">📸</span>
                        <p className="text-[9px] font-semibold italic text-stone-500">Belum ada foto dokumentasi rapat...</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      ) : null}

      {/* MAIN VIEW: MINUTES ON LEFT, 3 WOODEN MEMORY WALL BOARDS ON RIGHT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Date-Based Meeting Minutes (Left: 6 Spans) */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          <div className="rpg-panel flex-1 flex flex-col min-h-[500px]">
            <div className="flex justify-between items-center mb-3">
              <h3 className="rpg-title text-base flex items-center gap-2 m-0">
                <Book className="text-amber-500" /> SCRIBE'S LIBRARY (ARCHIVE)
              </h3>
              <button
                onClick={handleAddMinuteLog}
                className="bg-slate-900 hover:bg-slate-800 border border-amber-500/30 hover:border-amber-500 text-yellow-50 px-2.5 py-1.5 rounded text-[10px] flex items-center gap-1 font-bold font-mono"
              >
                <Plus size={10} /> TAMBAH NOTULENSI
              </button>
            </div>
            
            <p className="text-[10px] text-slate-400 mb-4 leading-normal">
              Laci arsip digital. Klik salah satu notulensi rapat di bawah untuk membuka **Google Docs-style text editor** untuk merangkum rapat dan mengunggah dokumentasi foto.
            </p>

            <div className="space-y-3 overflow-y-auto pr-1 flex-1 max-h-[420px] no-scrollbar">
              {minutes.map((log) => (
                <div
                  key={log.id}
                  onClick={() => {
                    playSelect();
                    setSelectedLog(log);
                  }}
                  className="p-3 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 hover:border-amber-600/60 text-slate-300 cursor-pointer transition-all flex justify-between items-center group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-xs rpg-font-retro text-yellow-50 truncate block max-w-[200px]">
                        {log.title}
                      </span>
                      <span className="text-[8px] bg-slate-900 border border-slate-700 px-2 py-0.5 rounded font-mono font-bold text-amber-500">
                        {log.date}
                      </span>
                    </div>
                    <div className="flex gap-4 text-[9px] text-slate-400 font-medium mt-1">
                      <span className="flex items-center gap-1"><Clock size={11} /> {log.time}</span>
                      <span className="flex items-center gap-1"><User size={11} /> Scribe: {log.scribe.split(' ')[0]}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteMinuteLog(log.id, e)}
                    className="p-1 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                    title="Hapus Notulensi"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {minutes.length === 0 && (
                <p className="text-[10px] text-slate-500 italic text-center py-20 font-bold">Belum ada notulensi rapat...</p>
              )}
            </div>
          </div>
        </div>

        {/* 3 Wooden Corkboard Panels Memory Wall (Right: 6 Spans) */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          <div className="rpg-panel flex-1 flex flex-col min-h-[500px]">
            <h3 className="rpg-title text-base mb-2 flex items-center gap-2">
              <ImageIcon className="text-amber-500" /> MEMORY WALL
            </h3>
            <p className="text-[10px] text-slate-400 mb-6 leading-normal">
              Dinding galeri kenangan divisi. Pilih salah satu papan di bawah untuk membuka corkboard interaktif, menaruh foto polaroid, menyeret posisinya, dan menulis caption kenangan!
            </p>

            {/* 3 Large Wooden Boards layout */}
            <div className="flex-1 flex flex-col gap-4 justify-around py-2">
              
              {/* Board 1: Education Board */}
              <div
                onClick={() => { playSelect(); setActiveBoardId('education'); }}
                style={{
                  background: 'linear-gradient(to right, #4e3629, #3e271a)',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.5), inset 0 2px 5px rgba(255,255,255,0.1)'
                }}
                className="p-4 rounded-xl border-4 border-[#2d1d14] hover:border-amber-500 cursor-pointer transition-all hover:scale-[1.02] flex items-center gap-4 text-stone-100"
              >
                <div className="w-12 h-12 rounded-lg bg-amber-900/40 border border-amber-500/20 flex items-center justify-center text-2xl relative shadow-inner">
                  📌
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-xs rpg-font-retro tracking-wide text-amber-400">EDUCATION BOARD</h4>
                  <p className="text-[9px] text-stone-300 mt-1 leading-normal font-semibold">Koleksi dokumentasi rapat, pencapaian tim, dan foto kebersamaan divisi Education.</p>
                </div>
                <div className="text-right flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-yellow-100 font-mono">Buka Papan</span>
                  <span className="text-[7.5px] text-stone-400 font-bold">Instan Realtime</span>
                </div>
              </div>

              {/* Board 2: Academic & Publication Board */}
              <div
                onClick={() => { playSelect(); setActiveBoardId('academic_pub'); }}
                style={{
                  background: 'linear-gradient(to right, #4e3629, #3e271a)',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.5), inset 0 2px 5px rgba(255,255,255,0.1)'
                }}
                className="p-4 rounded-xl border-4 border-[#2d1d14] hover:border-amber-500 cursor-pointer transition-all hover:scale-[1.02] flex items-center gap-4 text-stone-100"
              >
                <div className="w-12 h-12 rounded-lg bg-amber-900/40 border border-amber-500/20 flex items-center justify-center text-2xl relative shadow-inner">
                  🎨
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-xs rpg-font-retro tracking-wide text-amber-400">ACADEMIC & PUBLICATION BOARD</h4>
                  <p className="text-[9px] text-stone-300 mt-1 leading-normal font-semibold">Galeri poster pub, silabus modul akademik, infografis, dan coretan ide kreatif.</p>
                </div>
                <div className="text-right flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-yellow-100 font-mono">Buka Papan</span>
                  <span className="text-[7.5px] text-stone-400 font-bold">Instan Realtime</span>
                </div>
              </div>

              {/* Board 3: Project & Competition Board */}
              <div
                onClick={() => { playSelect(); setActiveBoardId('project_comp'); }}
                style={{
                  background: 'linear-gradient(to right, #4e3629, #3e271a)',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.5), inset 0 2px 5px rgba(255,255,255,0.1)'
                }}
                className="p-4 rounded-xl border-4 border-[#2d1d14] hover:border-amber-500 cursor-pointer transition-all hover:scale-[1.02] flex items-center gap-4 text-stone-100"
              >
                <div className="w-12 h-12 rounded-lg bg-amber-900/40 border border-amber-500/20 flex items-center justify-center text-2xl relative shadow-inner">
                  🏆
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-xs rpg-font-retro tracking-wide text-amber-400">PROJECT & COMPETITION BOARD</h4>
                  <p className="text-[9px] text-stone-300 mt-1 leading-normal font-semibold">Dokumentasi peluncuran platform lomba, foto piala kemenangan, dan timeline target project.</p>
                </div>
                <div className="text-right flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-yellow-100 font-mono">Buka Papan</span>
                  <span className="text-[7.5px] text-stone-400 font-bold">Instan Realtime</span>
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
