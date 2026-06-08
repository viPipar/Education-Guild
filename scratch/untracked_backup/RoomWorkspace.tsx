// Component: RoomWorkspace
// Purpose: Workspace container for collaborative document editing per room

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, MonitorUp, RotateCcw, ExternalLink, CalendarPlus } from 'lucide-react';
import { db } from '../lib/supabase';
import { playClick, playSelect } from '../lib/audio';
import { FileExplorer } from './FileExplorer';
import { CalendarEventModal } from './CalendarEventModal';

// Type exports for App.tsx
export type WorkspaceRoomId = 'guild_hall' | 'carriage' | 'boat';

export interface RoomWorkspaceState {
  activeTab: 'workspace' | 'show';
  showToAllIframeSrc: string;
  lastPresentedName?: string;
  workspaceIframeSrc?: string; // For backward compatibility
}

interface RoomWorkspaceProps {
  roomId: WorkspaceRoomId;
  state: RoomWorkspaceState;
  onStateChange: (updates: Partial<RoomWorkspaceState>) => void;
  height: number;
  onHeightChange: (h: number) => void;
}

const ROOM_LABELS: Record<WorkspaceRoomId, string> = {
  guild_hall: 'Round Table',
  carriage: 'Carriage',
  boat: 'Boat',
};

// Convert file ID to embedded edit URL based on mimeType
const getEmbeddedUrl = (fileId: string, mimeType: string): string => {
  if (!fileId) return '';

  if (mimeType === 'application/vnd.google-apps.document') {
    return `https://docs.google.com/document/d/${fileId}/edit?embedded=true`;
  } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    return `https://docs.google.com/spreadsheets/d/${fileId}/edit?embedded=true`;
  } else if (mimeType === 'application/vnd.google-apps.presentation') {
    return `https://docs.google.com/presentation/d/${fileId}/edit?embedded=true`;
  }

  // Fallback for other files
  return `https://drive.google.com/file/d/${fileId}/preview`;
};

export const RoomWorkspace: React.FC<RoomWorkspaceProps> = ({ roomId, state, onStateChange, height, onHeightChange }) => {
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const roomLabel = ROOM_LABELS[roomId];
  const rootFolderId = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID || '';

  const activeSrc = useMemo(() => {
    if (state.activeTab === 'workspace') return '';
    return state.showToAllIframeSrc;
  }, [state.activeTab, state.showToAllIframeSrc]);

  const hasShowSpace = Boolean(state.showToAllIframeSrc);

  const statusText = useMemo(() => {
    if (state.activeTab === 'workspace') return 'Private canvas aktif';
    if (state.lastPresentedName) return `Menampilkan: ${state.lastPresentedName}`;
    return hasShowSpace ? 'Dokumen bersama aktif' : 'Belum ada dokumen bersama';
  }, [hasShowSpace, state.activeTab, state.lastPresentedName]);

  const [isResizing, setIsResizing] = useState(false);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.pageY;
      const constrainedHeight = Math.max(220, Math.min(newHeight, window.innerHeight * 0.9));
      onHeightChange(constrainedHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onHeightChange]);

  // Subscribe to broadcast messages for room-specific sync
  useEffect(() => {
    const unsubscribe = db.subscribe((msg) => {
      // Listen for FORCE_PAGE_SYNC on this room
      if (msg.type !== 'FORCE_PAGE_SYNC') return;
      if (msg.payload?.roomId !== roomId) return;
      if (msg.payload?._senderTabId === db.getClientTabId()) return;

      // Auto-switch to Show to All tab when synced
      onStateChange({
        activeTab: 'show',
        showToAllIframeSrc: msg.payload.iframeSrc,
        lastPresentedName: msg.payload.name || 'Google Workspace Document',
      });
    });

    return unsubscribe;
  }, [roomId, onStateChange]);

  // Handle file selection from FileExplorer
  const presentDocument = async (fileId: string, fileName: string, mimeType: string) => {
    const iframeSrc = getEmbeddedUrl(fileId, mimeType);
    if (!iframeSrc) return;

    const newState = {
      activeTab: 'show' as const,
      showToAllIframeSrc: iframeSrc,
      lastPresentedName: fileName,
    };

    // Update local state
    onStateChange(newState);

    // Save to DB (which will also broadcast workspace_sync to other users in this room)
    await db.saveRoomWorkspaceState(roomId, newState);

    playSelect();
  };

  return (
    <section 
      style={{ height: `${height}px` }} 
      className="room-workspace-fold relative bg-[#09080a] border-t-4 border-[#cca566] px-3 py-4 md:px-6 md:py-6 flex flex-col min-h-[220px]"
    >
      {/* Resize handle */}
      <div
        onMouseDown={startResize}
        className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize bg-[#cca566] hover:bg-amber-400 active:bg-amber-500 transition-colors z-30"
        title="Tarik untuk mengubah ukuran workspace"
      />

      <div className="mx-auto max-w-7xl h-full w-full flex flex-col gap-3 min-h-0">
        {/* Header */}
        <div className="rpg-panel-wood flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <p className="text-[9px] rpg-font-retro text-amber-500 uppercase tracking-wide">Room Workspace</p>
            <h2 className="text-xl md:text-2xl font-black text-yellow-100 leading-tight">{roomLabel} Shared Canvas</h2>
            <p className="text-xs text-slate-400 font-semibold mt-1">{statusText}</p>
          </div>

          {/* Tab Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { playSelect(); onStateChange({ activeTab: 'workspace' }); }}
              className={`px-3 py-2 text-[10px] font-bold rpg-font-retro border-2 rounded transition-all cursor-pointer ${state.activeTab === 'workspace'
                  ? 'border-amber-500 bg-slate-900 text-amber-400'
                  : 'border-stone-700 bg-transparent text-slate-400 hover:text-slate-200'
                }`}
            >
              Your Workspace
            </button>
            <button
              type="button"
              onClick={() => { playSelect(); onStateChange({ activeTab: 'show' }); }}
              className={`px-3 py-2 text-[10px] font-bold rpg-font-retro border-2 rounded transition-all cursor-pointer ${state.activeTab === 'show'
                  ? 'border-amber-500 bg-slate-900 text-amber-400'
                  : 'border-stone-700 bg-transparent text-slate-400 hover:text-slate-200'
                }`}
            >
              Show to All Space
            </button>
          </div>
        </div>

        {/* Main Content Panel */}
        <div className="rpg-panel-stone flex-1 flex flex-col gap-3 min-h-0">
          {/* Action Bar */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            {state.activeTab === 'workspace' ? (
              <div className="flex-1 text-xs text-slate-300 font-semibold">
                {rootFolderId ? (
                  <span className="text-amber-400">📁 File Explorer Ready</span>
                ) : (
                  <span className="text-red-400">⚠️ VITE_GOOGLE_DRIVE_FOLDER_ID not configured</span>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-300 font-semibold flex items-center gap-2">
                <MonitorUp size={15} className="text-amber-400" />
                <span>
                  {hasShowSpace
                    ? 'Audience layer tersinkron untuk room ini.'
                    : 'Belum ada dokumen yang dipresentasikan di room ini.'}
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { playClick(); setShowCalendarModal(true); }}
                className="rpg-btn-game px-3 py-2 text-[9px] flex items-center justify-center gap-2"
              >
                <CalendarPlus size={14} /> Calendar
              </button>
              {activeSrc && (
                <a
                  href={activeSrc}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => playSelect()}
                  className="rpg-btn-game px-3 py-2 text-[9px] flex items-center justify-center gap-2"
                >
                  <ExternalLink size={14} /> Open
                </a>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className="relative flex-1 min-h-0 bg-slate-950 border-4 border-[#5a3d28] outline outline-4 outline-black shadow-inner overflow-hidden">
            {state.activeTab === 'workspace' ? (
              // Your Workspace Tab - File Explorer
              rootFolderId ? (
                <div className="w-full h-full p-4 flex flex-col">
                  <FileExplorer
                    rootFolderId={rootFolderId}
                    onFileSelect={presentDocument}
                  />
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <AlertCircle size={42} className="text-amber-500 mb-3" />
                  <p className="text-sm font-bold text-yellow-100">Folder tidak dikonfigurasi</p>
                  <p className="text-xs mt-1 max-w-md">
                    Pastikan VITE_GOOGLE_DRIVE_FOLDER_ID tersedia di environment variables.
                  </p>
                </div>
              )
            ) : (
              // Show to All Space Tab - Collaborative Iframe
              activeSrc ? (
                <>
                  <iframe
                    src={activeSrc}
                    title={`${roomLabel} Shared Document`}
                    className="w-full h-full bg-white border-0"
                    allow="clipboard-read; clipboard-write; fullscreen"
                  />
                  {/* Return to Workspace Button */}
                  <button
                    type="button"
                    onClick={() => { playSelect(); onStateChange({ activeTab: 'workspace' }); }}
                    className="absolute right-4 bottom-4 z-20 rpg-btn-game px-3 py-2 text-[9px] flex items-center gap-2 shadow-2xl"
                  >
                    <RotateCcw size={14} /> Return to Workspace
                  </button>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <MonitorUp size={42} className="text-amber-500 mb-3" />
                  <p className="text-sm font-bold text-yellow-100">Belum ada dokumen bersama</p>
                  <p className="text-xs mt-1 max-w-md">
                    Gunakan Your Workspace tab untuk memilih dokumen dan membagikannya ke semua peserta di room ini.
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Calendar Event Modal */}
      {showCalendarModal && <CalendarEventModal onClose={() => setShowCalendarModal(false)} />}
    </section>
  );
};
