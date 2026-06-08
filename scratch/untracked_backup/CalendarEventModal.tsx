import React, { useEffect, useState } from 'react';
import { Calendar, Clock, Info, Plus, X } from 'lucide-react';
import { isMock, supabase } from '../lib/supabase';
import { playClick } from '../lib/audio';

interface CalendarEventModalProps {
  onClose: () => void;
}

const indonesianMonths = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const getDaysArray = (vDate: Date) => {
  const firstDay = new Date(vDate.getFullYear(), vDate.getMonth(), 1);
  let startDayIdx = firstDay.getDay();
  if (startDayIdx === 0) startDayIdx = 7;
  const padding = startDayIdx - 1;
  const totalDays = new Date(vDate.getFullYear(), vDate.getMonth() + 1, 0).getDate();
  const days: Array<Date | null> = [];
  for (let i = 0; i < padding; i++) days.push(null);
  for (let i = 1; i <= totalDays; i++) days.push(new Date(vDate.getFullYear(), vDate.getMonth(), i));
  return days;
};

const formatIndonesianDate = (d: Date) => {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return `${days[d.getDay()]}, ${d.getDate()} ${indonesianMonths[d.getMonth()]} ${d.getFullYear()}`;
};

const formatDateStr = (d: Date) => {
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const date = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${date}`;
};

export const CalendarEventModal: React.FC<CalendarEventModalProps> = ({ onClose }) => {
  const [mode, setMode] = useState<'view' | 'add'>('add');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [startHour, setStartHour] = useState('10');
  const [startMinute, setStartMinute] = useState('00');
  const [endHour, setEndHour] = useState('11');
  const [endMinute, setEndMinute] = useState('00');
  const [viewDate, setViewDate] = useState(new Date());
  const [openPicker, setOpenPicker] = useState<'startDate' | 'endDate' | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startMinRef = React.useRef<HTMLInputElement>(null);
  const endMinRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const now = new Date();
    const minutes = now.getMinutes();
    let roundedMinutes = 0;
    if (minutes > 0 && minutes <= 30) {
      roundedMinutes = 30;
    } else if (minutes > 30) {
      roundedMinutes = 0;
      now.setHours(now.getHours() + 1);
    }
    now.setMinutes(roundedMinutes, 0, 0);
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    setStartDate(now);
    setEndDate(end);
    setViewDate(now);
    setStartHour(now.getHours().toString().padStart(2, '0'));
    setStartMinute(now.getMinutes().toString().padStart(2, '0'));
    setEndHour(end.getHours().toString().padStart(2, '0'));
    setEndMinute(end.getMinutes().toString().padStart(2, '0'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(null);
    setError(null);

    const paddedStartHr = startHour.trim().padStart(2, '0');
    const paddedStartMin = startMinute.trim().padStart(2, '0');
    const paddedEndHr = endHour.trim().padStart(2, '0');
    const paddedEndMin = endMinute.trim().padStart(2, '0');
    const nums = [paddedStartHr, paddedStartMin, paddedEndHr, paddedEndMin].map(Number);

    if (!title.trim() || nums.some(Number.isNaN) || nums[0] < 0 || nums[0] > 23 || nums[2] < 0 || nums[2] > 23 || nums[1] < 0 || nums[1] > 59 || nums[3] < 0 || nums[3] > 59) {
      setError('Judul dan format waktu wajib valid.');
      setLoading(false);
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim(),
      startTime: `${formatDateStr(startDate)}T${paddedStartHr}:${paddedStartMin}`,
      endTime: `${formatDateStr(endDate)}T${paddedEndHr}:${paddedEndMin}`,
    };

    if (new Date(payload.endTime) <= new Date(payload.startTime)) {
      setError('Waktu selesai harus setelah waktu mulai.');
      setLoading(false);
      return;
    }

    if (isMock) {
      const existing = JSON.parse(localStorage.getItem('mock_calendar_events') || '[]');
      localStorage.setItem('mock_calendar_events', JSON.stringify([...existing, { id: `mock_${Date.now()}`, ...payload }]));
      setSuccess('Rapat berhasil dijadwalkan. (Simulasi local)');
      setTitle('');
      setDescription('');
      setLoading(false);
      return;
    }

    try {
      const { data, error: invokeError } = await supabase!.functions.invoke('add-calendar-event', { body: payload });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setSuccess('Jadwal rapat berhasil ditambahkan ke Google Calendar.');
      setTitle('');
      setDescription('');
    } catch (err: any) {
      setError(err.message || 'Gagal menyambungkan ke Google Calendar.');
    } finally {
      setLoading(false);
    }
  };

  const renderDatePicker = (kind: 'startDate' | 'endDate') => {
    const selected = kind === 'startDate' ? startDate : endDate;
    const setSelected = kind === 'startDate' ? setStartDate : setEndDate;
    const daysArray = getDaysArray(viewDate);

    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenPicker(openPicker === kind ? null : kind)}
          className="bg-[#16110e] text-yellow-100 border border-amber-600/40 rounded px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-900 transition-colors cursor-pointer"
        >
          {formatIndonesianDate(selected)}
        </button>
        {openPicker === kind && (
          <div className="absolute top-full left-0 mt-1 bg-slate-950 border-2 border-[#cca566] rounded-lg shadow-2xl p-3 z-[2100] w-64 text-yellow-100">
            <div className="flex justify-between items-center mb-2">
              <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="p-1 hover:bg-slate-800 rounded text-amber-500 font-bold">&lt;</button>
              <span className="text-xs font-bold text-amber-400 font-mono">{indonesianMonths[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
              <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} className="p-1 hover:bg-slate-800 rounded text-amber-500 font-bold">&gt;</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-stone-400 font-bold mb-1">
              <div>Sen</div><div>Sel</div><div>Rab</div><div>Kam</div><div>Jum</div><div>Sab</div><div>Min</div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {daysArray.map((day, idx) => {
                if (!day) return <div key={`pad-${kind}-${idx}`} className="w-7 h-7" />;
                const isSelected = selected.getDate() === day.getDate() && selected.getMonth() === day.getMonth() && selected.getFullYear() === day.getFullYear();
                return (
                  <button
                    key={day.getTime()}
                    type="button"
                    onClick={() => {
                      setSelected(day);
                      if (kind === 'startDate' && endDate < day) setEndDate(day);
                      setOpenPicker(null);
                    }}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all cursor-pointer ${isSelected ? 'bg-amber-600 text-stone-950 font-extrabold shadow-md' : 'text-stone-300 hover:bg-slate-800'}`}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[2000] p-4 animate-fade-in">
      {openPicker && <div className="fixed inset-0 z-[2050] bg-transparent" onClick={() => setOpenPicker(null)} />}
      <div className={`rpg-panel-stone transition-all duration-300 w-full p-6 border-4 border-[#cca566] flex flex-col relative ${mode === 'view' ? 'max-w-4xl h-[80vh]' : 'max-w-xl'}`} style={{ animation: 'fadeIn 0.15s ease-out' }}>
        <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-4 flex-shrink-0">
          <div className="flex gap-2">
            <button type="button" onClick={() => { playClick(); setMode('view'); }} className={`px-3 py-1.5 text-[9px] font-bold rpg-font-retro border-2 rounded transition-all cursor-pointer flex items-center gap-1.5 ${mode === 'view' ? 'border-amber-500 bg-slate-900 text-amber-400' : 'border-stone-700 bg-transparent text-slate-400 hover:text-slate-200'}`}>
              <Calendar size={11} /> LIHAT KALENDER
            </button>
            <button type="button" onClick={() => { playClick(); setMode('add'); }} className={`px-3 py-1.5 text-[9px] font-bold rpg-font-retro border-2 rounded transition-all cursor-pointer flex items-center gap-1.5 ${mode === 'add' ? 'border-amber-500 bg-slate-900 text-amber-400' : 'border-stone-700 bg-transparent text-slate-400 hover:text-slate-200'}`}>
              <Plus size={11} /> TAMBAH RAPAT
            </button>
          </div>
          <button onClick={() => { playClick(); onClose(); }} className="text-slate-400 hover:text-white p-1 cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className={`flex-1 w-full h-full min-h-[300px] ${mode === 'view' ? '' : 'hidden'}`}>
          <div className="w-full bg-slate-950/80 rounded border border-amber-600/30 p-1 relative h-full min-h-[300px] overflow-hidden">
            <iframe
              src={`https://calendar.google.com/calendar/embed?src=${encodeURIComponent(import.meta.env.VITE_GOOGLE_CALENDAR_ID || 'educatieeeon.sbipb@gmail.com')}&ctz=Asia%2FJakarta&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=1&showCalendars=0&showTld=0`}
              style={{ border: 0 }}
              width="100%"
              height="100%"
              frameBorder="0"
              scrolling="no"
              className="rounded bg-zinc-900 h-full"
            />
          </div>
        </div>

        <form onSubmit={handleSubmit} className={`space-y-5 text-xs font-semibold text-stone-300 overflow-y-visible flex-1 pr-1 ${mode === 'add' ? '' : 'hidden'}`}>
          <div className="flex items-center gap-3">
            <div className="w-5" />
            <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tambahkan judul" className="flex-1 bg-transparent text-yellow-100 text-lg font-bold border-b border-stone-850 focus:outline-none focus:border-amber-500 placeholder:text-stone-600 py-1" />
          </div>
          <div className="flex items-start gap-3 relative z-50">
            <Clock size={14} className="text-[#cca566] mt-2 flex-shrink-0" />
            <div className="flex flex-wrap items-center gap-3 text-stone-300 w-full">
              {renderDatePicker('startDate')}
              <div className="flex items-center gap-1 bg-[#16110e] border border-amber-600/40 rounded px-2.5 py-1">
                <input type="text" placeholder="HH" maxLength={2} value={startHour} onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); if (val === '' || Number(val) <= 23) { setStartHour(val); if (val.length === 2) startMinRef.current?.focus(); } }} onBlur={(e) => { if (e.target.value.trim()) setStartHour(e.target.value.trim().padStart(2, '0')); }} className="bg-transparent text-yellow-100 text-center w-6 focus:outline-none text-xs font-mono font-bold" />
                <span className="text-[#cca566] font-bold font-mono">:</span>
                <input ref={startMinRef} type="text" placeholder="MM" maxLength={2} value={startMinute} onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); if (val === '' || Number(val) <= 59) setStartMinute(val); }} onBlur={(e) => { if (e.target.value.trim()) setStartMinute(e.target.value.trim().padStart(2, '0')); }} className="bg-transparent text-yellow-100 text-center w-6 focus:outline-none text-xs font-mono font-bold" />
              </div>
              <span className="text-stone-500 font-bold text-xs px-1 self-center">hingga</span>
              <div className="flex items-center gap-1 bg-[#16110e] border border-amber-600/40 rounded px-2.5 py-1">
                <input type="text" placeholder="HH" maxLength={2} value={endHour} onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); if (val === '' || Number(val) <= 23) { setEndHour(val); if (val.length === 2) endMinRef.current?.focus(); } }} onBlur={(e) => { if (e.target.value.trim()) setEndHour(e.target.value.trim().padStart(2, '0')); }} className="bg-transparent text-yellow-100 text-center w-6 focus:outline-none text-xs font-mono font-bold" />
                <span className="text-[#cca566] font-bold font-mono">:</span>
                <input ref={endMinRef} type="text" placeholder="MM" maxLength={2} value={endMinute} onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); if (val === '' || Number(val) <= 59) setEndMinute(val); }} onBlur={(e) => { if (e.target.value.trim()) setEndMinute(e.target.value.trim().padStart(2, '0')); }} className="bg-transparent text-yellow-100 text-center w-6 focus:outline-none text-xs font-mono font-bold" />
              </div>
              {renderDatePicker('endDate')}
            </div>
          </div>
          <div className="flex items-start gap-3 relative z-10">
            <Info size={14} className="text-[#cca566] mt-2 flex-shrink-0" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tambahkan deskripsi atau detail rapat..." rows={3} className="bg-[#16110e] text-yellow-100 border border-amber-600/40 rounded p-2 text-xs font-semibold focus:outline-none focus:border-amber-500 placeholder:text-stone-600 w-full resize-none" />
          </div>
          {error && <p className="text-[10px] text-red-500 font-bold bg-red-950/20 border border-red-900/30 p-2 rounded text-left">[!] {error}</p>}
          {success && <p className="text-[10px] text-green-400 font-bold bg-green-950/20 border border-green-900/30 p-2 rounded text-left animate-pulse">[OK] {success}</p>}
          <div className="flex justify-end gap-2.5 pt-2 flex-shrink-0">
            <button type="button" onClick={() => { playClick(); onClose(); }} className="px-4 py-2 bg-stone-850 hover:bg-stone-800 text-stone-200 text-xs font-bold rounded transition-all cursor-pointer">BATAL</button>
            <button type="submit" disabled={loading} className="px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-stone-950 font-black text-xs rounded transition-all active:scale-95 shadow-md shadow-amber-900/30 cursor-pointer flex items-center gap-1.5 font-mono">
              {loading ? 'SAVING...' : 'KIRIM JADWAL'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
