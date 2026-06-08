# Handover Context & Action Plan

Dokumen ini berisi rangkuman status pengerjaan, daftar bug yang dilaporkan, kebutuhan fitur baru, serta panduan untuk AI selanjutnya guna memperbaiki sistem ke arah yang benar.

---

## 1. Status Codebase Saat Ini (Berdasarkan `git status`)

Sebelum semua perubahan ini dihapus/direstore, berikut adalah file yang telah dimodifikasi atau ditambahkan:

### File yang Dimodifikasi (`Modified`):
- `scratch/test_edge_function.js` (Script pengujian edge function)
- `src/App.tsx` (Layout utama dan state global)
- `src/components/GuildHall.tsx` (Halaman utama Round Table)
- `src/components/NoticeBoard.tsx` (Papan tulis virtual/whiteboard)
- `src/components/SubDivisionRooms.tsx` (Halaman Carriage dan Boat)
- `src/components/Tavern.tsx` (Kedai Tavern)
- `src/components/Wilderness.tsx` (Halaman Raid Boss)
- `src/index.css` (Style global)
- `src/lib/supabase.ts` (Handler database dan realtime broadcast channel)

### File Baru/Belum Dilacak (`Untracked`):
- `scratch/check_drive_quota.cjs`
- `scratch/set_supabase_secrets.cjs`
- `scratch/set_supabase_secrets.js`
- `src/components/CalendarEventModal.tsx`
- `src/components/FileExplorer.tsx`
- `src/components/RoomWorkspace.tsx`
- `src/hooks/` (Berisi custom hook untuk drive explorer)
- `src/lib/driveMime.ts`
- `supabase/functions/manage-drive-assets/` (Edge function Supabase untuk integrasi Google Drive)

> **Catatan penting**: Semua perbaikan di atas akan di-restore ke keadaan bersih (`origin/main`) karena menyebabkan ketidakstabilan (broken). AI selanjutnya harus memulai dengan keadaan bersih dan mendesain ulang dengan hati-hati.

---

## 2. Highlight Bug Utama yang Harus Diperbaiki

### 1. Figma (Notice Board / Whiteboard) Hilang & Tidak Tersimpan
- **Deskripsi Bug**: Coretan atau catatan pada Notice Board (Whiteboard) tiba-tiba hilang tanpa alasan dan tidak tersimpan secara permanen di database.
- **Goal**: Pastikan Notice Board menyimpan coretannya secara berkala ke Supabase (`whiteboard_drawings` table) dan tersinkronisasi secara realtime dengan stabil untuk semua user di room yang sama.

### 2. Timer Rapat Tidak Sinkron (Local Timer)
- **Deskripsi Bug**: Timer rapat saat ini berjalan secara lokal di browser masing-masing pengguna (waktu tersisa berbeda-beda).
- **Goal**: Timer harus bersifat **absolut** dan **terpusat** (diatur dari database Supabase/realtime). Jika Director memulai timer, semua user harus melihat detik yang sama persis secara realtime.

### 3. Masalah Sinkronisasi Realtime Lainnya
- **Deskripsi Bug**: Khawatir beberapa fitur masih berjalan secara lokal dan tidak terintegrasi dengan benar menggunakan database/Supabase Realtime untuk semua user.
- **Goal**: Lakukan audit menyeluruh untuk memastikan semua aksi (seperti chat bubble, seat claim, gartic score reset, dll.) terintegrasi penuh secara realtime di seluruh client.

---

## 3. Fitur / Perbaikan Baru yang Diinginkan

### 1. Chat/Komentar Agenda Lokal per Halaman
- **Deskripsi**: Di bawah agenda lokal masing-masing page (Round Table, Carriage, Boat), harus ada fitur komentar/chat yang tersimpan (persisten di database).
- **Goal**: Anggota room bisa melakukan chattingan/diskusi tertulis di bawah agenda tersebut. Fitur ini harus memiliki tombol **Clear Comments** yang hanya bisa ditekan oleh **Director**.

### 2. Layout Drive Screen (Workspace) di Bawah Screen Utama
- **Deskripsi**: Layar Drive / Google Workspace harus berada di **BAWAH** layar utama (Round Table, Carriage, Boat), bukan melayang (floating) atau menutupi layar utama.
- **Goal**: Pastikan ketika workspace dibuka, posisinya berada di bawah konten room utama (sehingga tidak mengganggu tampilan round table/kursi virtual). Jika workspace membesar, area di bawahnya bertambah tinggi (bisa di-scroll ke bawah).

---

## 4. Analisis Masalah Integrasi Google Drive & Docs (Edge Function)

### Gejala Error:
- Muncul pesan error: `"Failed to send a request to the Edge Function"`
- Muncul pesan error: `"Edge Function returned a non-2xx status code"`
- Fitur dokumen/drive di bawah page Round Table, Carriage, dan Boat tidak berfungsi karena integrasi dengan aplikasi bermasalah.

### Apa yang Dibutuhkan untuk Menjalankannya:
1. **Google Service Account / API Credentials**: Pastikan credential Google Drive sudah di-deploy dengan benar ke Supabase Secrets.
2. **Supabase Secrets**: Edge function `manage-drive-assets` membutuhkan environment secrets (seperti `GOOGLE_SERVICE_ACCOUNT_KEY` atau token) untuk berkomunikasi dengan Google Drive API.
3. **Google Drive Folder ID (`VITE_GOOGLE_DRIVE_FOLDER_ID`)**: Aplikasi memerlukan Link Folder Drive yang valid agar Service Account dapat membaca dan menulis dokumen.
4. **Supabase CLI / Deploy**: Periksa apakah Supabase Edge Function sudah ter-deploy ke Supabase project yang aktif menggunakan command `supabase functions deploy manage-drive-assets`.

---

## 5. Panduan Langkah untuk AI Selanjutnya

1. **Revert Perubahan yang Rusak**: Jalankan `git restore .` (dan hapus file untracked yang tidak perlu) agar codebase kembali ke status stabil asal.
2. **Setup Supabase Edge Function Secrets**: Bantu pengguna mengonfigurasi rahasia Supabase yang tepat agar Edge Function dapat berjalan tanpa error non-2xx.
3. **Perbaiki Layout Workspace (Drive)**: Pastikan komponen `RoomWorkspace` diletakkan di bawah konten room secara alami, dengan scrolling terkontrol secara lokal (bukan scroll-jump global).
4. **Implementasikan Fitur Baru**:
   - Papan komentar/diskusi di bawah agenda lokal.
   - Sinkronisasi timer terpusat.
   - Perbaikan fungsionalitas penyimpanan Notice Board.
