// Component: FileExplorer
// Purpose: Display and navigate Google Drive folder structure with asset creation

import React, { useState } from 'react';
import { FolderOpen, FileText, Sheet, Layers, Plus, ChevronRight, ChevronLeft, AlertCircle, Loader2, FolderPlus, File } from 'lucide-react';
import { useDriveFileExplorer } from '../hooks/useDriveFileExplorer';
import { playClick, playSelect } from '../lib/audio';

interface FileExplorerProps {
  rootFolderId: string;
  onFileSelect: (fileId: string, fileName: string, mimeType: string) => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ rootFolderId, onFileSelect }) => {
  const explorer = useDriveFileExplorer(rootFolderId);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewDocDropdown, setShowNewDocDropdown] = useState(false);
  const [creatingType, setCreatingType] = useState<'folder' | 'docs' | 'sheets' | 'slides' | null>(null);

  const handleCreateFolder = async () => {
    playClick();
    if (!newFolderName.trim()) return;

    try {
      setCreatingType('folder');
      await explorer.createFile(newFolderName, 'folder');
      setNewFolderName('');
      setShowNewFolderModal(false);
    } catch (err) {
      console.error('Failed to create folder:', err);
    } finally {
      setCreatingType(null);
    }
  };

  const handleCreateDocument = async (type: 'docs' | 'sheets' | 'slides') => {
    playClick();
    const typeNames = { docs: 'Document', sheets: 'Spreadsheet', slides: 'Presentation' };
    const name = `New ${typeNames[type]} ${new Date().toLocaleTimeString()}`;

    try {
      setCreatingType(type);
      await explorer.createFile(name, type);
      setShowNewDocDropdown(false);
    } catch (err) {
      console.error(`Failed to create ${type}:`, err);
    } finally {
      setCreatingType(null);
    }
  };

  const getMimeIcon = (mimeType: string) => {
    if (mimeType === 'application/vnd.google-apps.folder') return <FolderOpen size={16} className="text-amber-400" />;
    if (mimeType === 'application/vnd.google-apps.document') return <FileText size={16} className="text-blue-400" />;
    if (mimeType === 'application/vnd.google-apps.spreadsheet') return <Sheet size={16} className="text-green-400" />;
    if (mimeType === 'application/vnd.google-apps.presentation') return <Layers size={16} className="text-orange-400" />;
    return <File size={16} className="text-slate-400" />;
  };

  const isFolder = (mimeType: string) => mimeType === 'application/vnd.google-apps.folder';

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header with breadcrumb and actions */}
      <div className="flex flex-col gap-2">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-1 text-xs text-slate-300 overflow-x-auto pb-1">
          {explorer.breadcrumb.map((item, idx) => (
            <React.Fragment key={item.id}>
              {idx > 0 && <ChevronRight size={12} className="flex-shrink-0" />}
              <span className="text-yellow-100 font-semibold truncate">
                {item.name}
              </span>
            </React.Fragment>
          ))}
        </div>

        {/* Asset Creation Toolbar */}
        <div className="flex flex-wrap gap-2">
          {/* New Folder Button */}
          <button
            onClick={() => { playSelect(); setShowNewFolderModal(true); }}
            disabled={explorer.loading}
            className="rpg-btn-game px-2 py-1 text-[9px] flex items-center gap-1 disabled:opacity-50"
          >
            <FolderPlus size={12} /> Folder
          </button>

          {/* New Document Dropdown */}
          <div className="relative">
            <button
              onClick={() => { playSelect(); setShowNewDocDropdown(!showNewDocDropdown); }}
              disabled={explorer.loading}
              className="rpg-btn-game px-2 py-1 text-[9px] flex items-center gap-1 disabled:opacity-50"
            >
              <Plus size={12} /> Dokumen
            </button>
            {showNewDocDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-slate-950 border-2 border-[#cca566] rounded shadow-lg z-10 min-w-[140px]">
                <button
                  onClick={() => handleCreateDocument('docs')}
                  disabled={creatingType !== null}
                  className="w-full px-3 py-2 text-[9px] text-yellow-100 hover:bg-slate-900 transition-colors text-left font-semibold border-b border-[#5a3d28] disabled:opacity-50"
                >
                  {creatingType === 'docs' ? <Loader2 size={12} className="inline animate-spin mr-1" /> : <FileText size={12} className="inline mr-1" />}
                  Google Docs
                </button>
                <button
                  onClick={() => handleCreateDocument('sheets')}
                  disabled={creatingType !== null}
                  className="w-full px-3 py-2 text-[9px] text-yellow-100 hover:bg-slate-900 transition-colors text-left font-semibold border-b border-[#5a3d28] disabled:opacity-50"
                >
                  {creatingType === 'sheets' ? <Loader2 size={12} className="inline animate-spin mr-1" /> : <Sheet size={12} className="inline mr-1" />}
                  Google Sheets
                </button>
                <button
                  onClick={() => handleCreateDocument('slides')}
                  disabled={creatingType !== null}
                  className="w-full px-3 py-2 text-[9px] text-yellow-100 hover:bg-slate-900 transition-colors text-left font-semibold disabled:opacity-50"
                >
                  {creatingType === 'slides' ? <Loader2 size={12} className="inline animate-spin mr-1" /> : <Layers size={12} className="inline mr-1" />}
                  Google Slides
                </button>
              </div>
            )}
          </div>

          {/* Back Button */}
          {explorer.canGoBack && (
            <button
              onClick={() => { playSelect(); explorer.goBack(); }}
              disabled={explorer.loading}
              className="rpg-btn-game px-2 py-1 text-[9px] flex items-center gap-1 disabled:opacity-50"
            >
              <ChevronLeft size={12} /> Kembali
            </button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {explorer.loading && (
        <div className="flex items-center justify-center py-4 text-slate-400">
          <Loader2 size={16} className="animate-spin mr-2" />
          <span className="text-xs">Memuat folder...</span>
        </div>
      )}

      {/* Error State */}
      {explorer.error && (
        <div className="bg-red-950/30 border border-red-900/50 text-red-200 rounded px-3 py-2 text-xs font-bold flex items-center gap-2">
          <AlertCircle size={14} /> {explorer.error}
        </div>
      )}

      {/* File List */}
      {!explorer.loading && (
        <div className="flex-1 overflow-y-auto border-2 border-[#5a3d28] bg-slate-950 rounded">
          {explorer.files.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-center p-4">
              <p className="text-xs">
                {explorer.currentPath === 'Root'
                  ? 'Folder ini kosong. Buat dokumen baru atau subfolder.'
                  : 'Folder ini kosong.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#5a3d28]">
              {explorer.files.map(file => (
                <div
                  key={file.id}
                  className={`px-3 py-2 flex items-center gap-2 text-xs text-yellow-100 hover:bg-slate-900 transition-colors ${isFolder(file.mimeType) ? 'cursor-pointer' : 'cursor-pointer'
                    }`}
                  onClick={() => {
                    playClick();
                    if (isFolder(file.mimeType)) {
                      explorer.navigateToFolder(file.id, file.name);
                    } else {
                      onFileSelect(file.id, file.name, file.mimeType);
                    }
                  }}
                >
                  <span className="flex-shrink-0">{getMimeIcon(file.mimeType)}</span>
                  <span className="flex-1 truncate font-semibold">{file.name}</span>
                  {isFolder(file.mimeType) && (
                    <ChevronRight size={12} className="flex-shrink-0 text-slate-400" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-950 border-4 border-[#cca566] rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
            <p className="text-[9px] text-amber-500 uppercase tracking-wide font-bold mb-1">Folder Baru</p>
            <h3 className="text-lg font-bold text-yellow-100 mb-4">Buat Subfolder</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              placeholder="Nama folder..."
              className="w-full bg-[#16110e] text-yellow-100 border border-amber-600/40 rounded px-3 py-2 text-xs font-semibold mb-4 focus:outline-none focus:border-amber-400 placeholder-slate-500"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { playClick(); setShowNewFolderModal(false); setNewFolderName(''); }}
                className="px-3 py-2 text-[9px] font-bold text-slate-400 hover:text-slate-200 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || creatingType !== null}
                className="rpg-btn-game px-4 py-2 text-[9px] disabled:opacity-50"
              >
                {creatingType === 'folder' ? <Loader2 size={12} className="inline animate-spin mr-1" /> : null}
                Buat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
