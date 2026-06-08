import React, { useState, useEffect } from 'react';
import type { Profile, PresentationState } from '../lib/supabase';
import { db, isMock, supabase } from '../lib/supabase';
import { playClick, playSelect } from '../lib/audio';
import {
  Share2, Monitor, Play, Square,
  Folder, Globe, Loader2, ArrowLeft, ChevronRight,
  FileText, FileSpreadsheet, File
} from 'lucide-react';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

interface RoomWorkspaceProps {
  driveFolderId: string;
  roomLabel: string;
  roomId: string;
  currentProfile: Profile;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
}

// Mock Files for standalone development and mock modes
const MOCK_FILES: Record<string, DriveFile[]> = {
  'root': [
    { id: 'folder_academic', name: 'Academic & Publications', mimeType: 'application/vnd.google-apps.folder' },
    { id: 'folder_project', name: 'Project & Competitions', mimeType: 'application/vnd.google-apps.folder' },
    { id: 'doc_timeline', name: 'Timeline Rapat Divisi', mimeType: 'application/vnd.google-apps.document' },
    { id: 'sheet_budget', name: 'Budget Guild', mimeType: 'application/vnd.google-apps.spreadsheet' },
    { id: 'slide_profile', name: 'Slide Company Profile', mimeType: 'application/vnd.google-apps.presentation' },
  ],
  'folder_academic': [
    { id: 'doc_academic_plan', name: 'Rencana Penelitian & Jurnal 2026', mimeType: 'application/vnd.google-apps.document' },
    { id: 'slide_seminar', name: 'Slide Presentasi Seminar Hasil', mimeType: 'application/vnd.google-apps.presentation' },
  ],
  'folder_project': [
    { id: 'doc_competition_guide', name: 'Panduan Lomba Nasional IEEE', mimeType: 'application/vnd.google-apps.document' },
    { id: 'sheet_participants', name: 'Data Peserta Lomba IEEE', mimeType: 'application/vnd.google-apps.spreadsheet' },
  ]
};

// Helper: Parse Google Drive URLs into collaborative embedded URLs
const getCollaborativeEmbedUrl = (url: string): { embedUrl: string; name: string } => {
  const trimmed = url.trim();

  // Google Docs (e.g., /document/d/ID/edit)
  const docMatch = trimmed.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  if (docMatch) {
    return {
      embedUrl: `https://docs.google.com/document/d/${docMatch[1]}/edit?rm=embedded`,
      name: 'Google Document (Collaborative)'
    };
  }

  // Google Sheets (e.g., /spreadsheets/d/ID/edit)
  const sheetMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (sheetMatch) {
    return {
      embedUrl: `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/edit?rm=embedded`,
      name: 'Google Spreadsheet (Collaborative)'
    };
  }

  // Google Slides (e.g., /presentation/d/ID/edit)
  const slideMatch = trimmed.match(/\/presentation\/d\/([a-zA-Z0-9-_]+)/);
  if (slideMatch) {
    return {
      embedUrl: `https://docs.google.com/presentation/d/${slideMatch[1]}/edit?rm=embedded`,
      name: 'Google Slides (Collaborative)'
    };
  }

  // Generic Google Drive file preview
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
  if (fileMatch) {
    return {
      embedUrl: `https://drive.google.com/file/d/${fileMatch[1]}/preview`,
      name: 'Google Drive File'
    };
  }

  return {
    embedUrl: trimmed,
    name: 'Custom Shared Document'
  };
};

const getFileMeta = (file: DriveFile) => {
  const mime = file.mimeType || '';
  if (mime === 'application/vnd.google-apps.folder') {
    return { isFolder: true, type: 'folder', embedUrl: '' };
  }
  
  let embedUrl = file.webViewLink || '';
  if (mime.includes('document')) {
    embedUrl = `https://docs.google.com/document/d/${file.id}/edit?rm=embedded`;
    return { isFolder: false, type: 'docs', embedUrl };
  } else if (mime.includes('spreadsheet')) {
    embedUrl = `https://docs.google.com/spreadsheets/d/${file.id}/edit?rm=embedded`;
    return { isFolder: false, type: 'sheets', embedUrl };
  } else if (mime.includes('presentation')) {
    embedUrl = `https://docs.google.com/presentation/d/${file.id}/edit?rm=embedded`;
    return { isFolder: false, type: 'slides', embedUrl };
  } else {
    embedUrl = `https://drive.google.com/file/d/${file.id}/preview`;
    return { isFolder: false, type: 'file', embedUrl };
  }
};

// Sub-Component: Inline Google Drive File Explorer
interface DriveExplorerProps {
  rootFolderId: string;
  onFileClick: (file: DriveFile, embedUrl: string) => void;
}

const DriveExplorer: React.FC<DriveExplorerProps> = ({ rootFolderId, onFileClick }) => {
  const [currentFolderId, setCurrentFolderId] = useState(rootFolderId || 'root');
  const [folderPath, setFolderPath] = useState<Array<{ id: string; name: string }>>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFiles = async (folderId: string) => {
    setLoading(true);
    const folderKey = folderId || 'root';

    if (isMock || !folderId || folderId.startsWith('mock_') || folderId === 'root' || folderId === 'yours_mock') {
      setTimeout(() => {
        const mockList = MOCK_FILES[folderKey] || MOCK_FILES['root'];
        setFiles(mockList);
        setLoading(false);
      }, 300);
      return;
    }

    try {
      if (!supabase) {
        setFiles(MOCK_FILES[folderKey] || MOCK_FILES['root']);
        setLoading(false);
        return;
      }
      const { data, error: fnError } = await supabase.functions.invoke(`manage-drive-assets?folderId=${folderId}`, {
        method: 'GET'
      });

      if (fnError) {
        console.warn('Google Drive API Edge function error, using mock fallback:', fnError);
        setFiles(MOCK_FILES[folderKey] || MOCK_FILES['root']);
      } else if (data && data.files) {
        setFiles(data.files);
      } else {
        setFiles([]);
      }
    } catch (err: any) {
      console.warn('Fetch files error, using mock fallback:', err);
      setFiles(MOCK_FILES[folderKey] || MOCK_FILES['root']);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles(currentFolderId);
  }, [currentFolderId]);

  const handleFolderClick = (folder: DriveFile) => {
    playSelect();
    setFolderPath(prev => [...prev, { id: folder.id, name: folder.name }]);
    setCurrentFolderId(folder.id);
  };

  const handleBreadcrumbClick = (id: string, index: number) => {
    playSelect();
    setFolderPath(prev => prev.slice(0, index));
    setCurrentFolderId(id);
  };

  const handleGoUp = () => {
    playSelect();
    if (folderPath.length === 0) return;
    const nextPath = [...folderPath];
    nextPath.pop();
    setFolderPath(nextPath);
    setCurrentFolderId(nextPath.length > 0 ? nextPath[nextPath.length - 1].id : rootFolderId || 'root');
  };

  return (
    <div className="flex flex-col border border-[#cca566]/20 rounded-lg overflow-hidden bg-slate-950/70">
      {/* Breadcrumbs / Toolbar */}
      <div className="flex items-center gap-2 p-2 bg-slate-900 border-b border-[#cca566]/20 text-[10px] font-bold">
        {folderPath.length > 0 && (
          <button
            type="button"
            onClick={handleGoUp}
            className="flex items-center gap-1 px-2 py-0.5 bg-amber-955 border border-amber-600/30 text-amber-400 hover:border-amber-500 rounded transition-all text-[9px]"
          >
            <ArrowLeft size={10} />
            Mundur
          </button>
        )}
        <div className="flex items-center flex-wrap gap-1 text-slate-400">
          <span
            onClick={() => handleBreadcrumbClick(rootFolderId || 'root', 0)}
            className="hover:text-yellow-400 hover:underline cursor-pointer"
          >
            Root
          </span>
          {folderPath.map((item, idx) => (
            <React.Fragment key={item.id}>
              <ChevronRight size={10} className="text-slate-600" />
              <span
                onClick={() => handleBreadcrumbClick(item.id, idx + 1)}
                className="hover:text-yellow-400 hover:underline cursor-pointer text-slate-350"
              >
                {item.name}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="h-36 flex items-center justify-center gap-2 text-amber-500">
          <Loader2 className="w-4.5 h-4.5 animate-spin" />
          <span className="text-[10px] font-mono font-bold">Memuat...</span>
        </div>
      ) : (
        <div className="p-2 max-h-[220px] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5" style={{ overscrollBehavior: 'contain' }}>
          {files.map(file => {
            const { isFolder, type, embedUrl } = getFileMeta(file);
            let icon = <File size={11} className="text-slate-400" />;
            if (isFolder) icon = <Folder size={11} className="text-blue-400 fill-blue-500/20" />;
            else if (type === 'docs') icon = <FileText size={11} className="text-blue-400" />;
            else if (type === 'sheets') icon = <FileSpreadsheet size={11} className="text-green-400" />;
            else if (type === 'slides') icon = <Play size={11} className="text-orange-400 fill-orange-500/20" />;

            return (
              <div
                key={file.id}
                onClick={() => {
                  if (isFolder) {
                    handleFolderClick(file);
                  } else {
                    onFileClick(file, embedUrl);
                  }
                }}
                className="flex items-center gap-2 p-1.5 bg-slate-900/40 border border-[#cca566]/10 hover:border-[#cca566]/40 rounded cursor-pointer transition-all hover:bg-slate-900/80 group"
              >
                <div className="w-5 h-5 rounded bg-slate-950 flex items-center justify-center border border-[#cca566]/10 flex-shrink-0">
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-slate-350 truncate group-hover:text-yellow-400">
                    {file.name}
                  </p>
                </div>
              </div>
            );
          })}
          {files.length === 0 && (
            <div className="col-span-2 py-8 text-center text-xs text-slate-500 font-mono">
              Kosong
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const RoomWorkspace: React.FC<RoomWorkspaceProps> = ({ driveFolderId, roomLabel, roomId, currentProfile }) => {
  const [activeTab, setActiveTab] = useState<'yours' | 'shared'>('yours');
  
  const [presentation, setPresentation] = useState<PresentationState>({
    fileUrl: '',
    fileName: '',
    presenterId: '',
    presenterName: '',
    active: false
  });

  const [pasteUrl, setPasteUrl] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [showPastePanel, setShowPastePanel] = useState(false);
  const [isSelectingFileToPresent, setIsSelectingFileToPresent] = useState(false);

  // local file selection in YOUR WORKSPACE
  const [activeLocalFile, setActiveLocalFile] = useState<{ url: string; name: string } | null>(null);

  // Resize workspace height
  const [workspaceHeight, setWorkspaceHeight] = useState(480);
  const [isResizing, setIsResizing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isHovered || isResizing) {
      const mainEl = document.querySelector('main');
      if (!mainEl) return;

      const startScrollTop = mainEl.scrollTop;
      const startScrollLeft = mainEl.scrollLeft;
      const startWinTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
      const startWinLeft = window.scrollX || document.documentElement.scrollLeft || document.body.scrollLeft;

      const handleScroll = () => {
        if (mainEl.scrollTop !== startScrollTop) {
          mainEl.scrollTop = startScrollTop;
        }
        if (mainEl.scrollLeft !== startScrollLeft) {
          mainEl.scrollLeft = startScrollLeft;
        }
        const currentWinTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
        const currentWinLeft = window.scrollX || document.documentElement.scrollLeft || document.body.scrollLeft;
        if (currentWinTop !== startWinTop || currentWinLeft !== startWinLeft) {
          window.scrollTo(startWinLeft, startWinTop);
        }
      };

      mainEl.addEventListener('scroll', handleScroll, { passive: true });
      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        mainEl.removeEventListener('scroll', handleScroll);
        window.removeEventListener('scroll', handleScroll);
      };
    }
  }, [isHovered, isResizing]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startY = e.clientY;
    const startHeight = workspaceHeight;

    const doDrag = (moveEvent: MouseEvent) => {
      const newHeight = startHeight + (moveEvent.clientY - startY);
      const maxHeight = window.innerHeight > 0 ? window.innerHeight : 800;
      setWorkspaceHeight(Math.min(maxHeight, Math.max(300, newHeight)));
    };

    const stopDrag = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  // GAPI and GIS auth states for optional picker fallback
  const [gisLoaded, setGisLoaded] = useState(false);
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Dynamic loading of Google API Scripts
  useEffect(() => {
    if (!window.gapi) {
      const scriptGapi = document.createElement('script');
      scriptGapi.src = 'https://apis.google.com/js/api.js';
      scriptGapi.async = true;
      scriptGapi.defer = true;
      scriptGapi.onload = () => {
        window.gapi.load('picker', () => {});
      };
      document.body.appendChild(scriptGapi);
    } else {
      window.gapi.load('picker', () => {});
    }

    if (!window.google || !window.google.accounts) {
      const scriptGis = document.createElement('script');
      scriptGis.src = 'https://accounts.google.com/gsi/client';
      scriptGis.async = true;
      scriptGis.defer = true;
      scriptGis.onload = () => {
        initGisClient();
      };
      document.body.appendChild(scriptGis);
    } else {
      initGisClient();
    }
  }, []);

  const initGisClient = () => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: (response: any) => {
          if (response.error !== undefined) {
            console.error('OAuth token error:', response.error);
            return;
          }
          setAccessToken(response.access_token);
          createPicker(response.access_token);
        },
      });
      setTokenClient(client);
      setGisLoaded(true);
    } catch (err) {
      console.error('Error initializing GIS client:', err);
    }
  };

  // Setup presentation DB sync + realtime broadcast channels
  useEffect(() => {
    db.getPresentationState(roomId).then(state => {
      if (state) setPresentation(state);
    });

    const unsubscribe = db.subscribe((msg) => {
      if (msg.type === 'presentation_sync' && msg.payload.roomId === roomId) {
        setPresentation(msg.payload.state);
      }
    });

    return () => unsubscribe();
  }, [roomId]);

  // Automatically switch tab to shared when active presentation starts
  useEffect(() => {
    if (presentation.active) {
      setActiveTab('shared');
    }
  }, [presentation.active]);

  const handleOpenPicker = () => {
    playClick();
    if (!tokenClient) {
      alert('Google API client belum siap atau Client ID salah. Silakan pilih langsung dokumen dari folder workspace di bawah.');
      return;
    }

    if (accessToken) {
      createPicker(accessToken);
    } else {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    }
  };

  const createPicker = (oauthToken: string) => {
    try {
      const view = new window.google.picker.View(window.google.picker.ViewId.DOCS);
      const picker = new window.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(oauthToken)
        .setDeveloperKey(import.meta.env.VITE_GOOGLE_API_KEY || '')
        .setCallback((data: any) => {
          if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
            const doc = data[window.google.picker.Response.DOCUMENTS][0];
            const fileId = doc[window.google.picker.Document.ID];
            const fileName = doc[window.google.picker.Document.NAME];
            const fileUrl = doc[window.google.picker.Document.URL];
            const mimeType = doc[window.google.picker.Document.MIME_TYPE];

            let embedUrl = fileUrl;
            if (mimeType.includes('document')) {
              embedUrl = `https://docs.google.com/document/d/${fileId}/edit?rm=embedded`;
            } else if (mimeType.includes('spreadsheet')) {
              embedUrl = `https://docs.google.com/spreadsheets/d/${fileId}/edit?rm=embedded`;
            } else if (mimeType.includes('presentation')) {
              embedUrl = `https://docs.google.com/presentation/d/${fileId}/edit?rm=embedded`;
            } else {
              embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
            }

            startPresenting(embedUrl, fileName);
            setIsSelectingFileToPresent(false);
          }
        })
        .build();
      picker.setVisible(true);
    } catch (err) {
      console.error('Error opening Google Picker:', err);
      alert('Gagal membuka Google Picker.');
    }
  };

  const startPresenting = async (url: string, name: string) => {
    const nextState: PresentationState = {
      fileUrl: url,
      fileName: name || 'Dokumen Bersama',
      presenterId: currentProfile.id,
      presenterName: currentProfile.name,
      active: true
    };
    setPresentation(nextState);
    await db.savePresentationState(roomId, nextState);
    setShowPastePanel(false);
    setPasteUrl('');
    setPasteTitle('');
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteUrl.trim()) return;
    playClick();

    const { embedUrl, name } = getCollaborativeEmbedUrl(pasteUrl.trim());
    const finalName = pasteTitle.trim() || name;
    startPresenting(embedUrl, finalName);
    setIsSelectingFileToPresent(false);
  };

  const stopPresenting = async () => {
    playClick();
    const nextState: PresentationState = {
      fileUrl: '',
      fileName: '',
      presenterId: '',
      presenterName: '',
      active: false
    };
    setPresentation(nextState);
    await db.savePresentationState(roomId, nextState);
  };

  const handleLocalFileClick = (file: DriveFile, embedUrl: string) => {
    playClick();
    setActiveLocalFile({ url: embedUrl, name: file.name });
  };

  const handlePresentFileClick = (file: DriveFile, embedUrl: string) => {
    playClick();
    startPresenting(embedUrl, file.name);
    setIsSelectingFileToPresent(false);
  };

  const isPresenterOrAdmin =
    presentation.presenterId === currentProfile.id ||
    currentProfile.role === 'Director' ||
    currentProfile.role === 'Manager';

  const handleMouseLeave = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x === undefined || y === undefined) {
      setIsHovered(false);
      return;
    }

    const margin = 2;
    const isOutside =
      x < (rect.left - margin) ||
      x > (rect.right + margin) ||
      y < (rect.top - margin) ||
      y > (rect.bottom + margin);

    if (isOutside) {
      setIsHovered(false);
    }
  };

  return (
    <div
      className="mt-3"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
    >
      {/* Static Header Bar — Always Open */}
      <div className="w-full flex items-center justify-between px-4 py-2 bg-slate-950 border border-[#cca566]/30 border-b-0 rounded-t-lg text-amber-400 text-xs font-bold rpg-font-retro">
        <span className="flex items-center gap-2">
          <Share2 className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
          KOLABORASI WORKSPACE — {roomLabel}
          {presentation.active && (
            <span className="ml-2 px-1.5 py-0.2 bg-red-955 border border-red-800 text-red-400 text-[8px] rounded uppercase tracking-wider animate-pulse font-mono">
              🔴 LIVE
            </span>
          )}
        </span>
      </div>

      {/* Main Workspace Panel */}
      <div className="rounded-b-lg border-2 border-t-0 border-[#cca566]/30 bg-slate-950/95 overflow-hidden shadow-xl shadow-black/50">
        {/* Tab Selection */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between border-b border-[#cca566]/20 bg-slate-900/80">
          <div className="flex border-b md:border-b-0 border-[#cca566]/10">
            <button
              onClick={() => {
                playSelect();
                setActiveTab('yours');
              }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-bold rpg-font-retro border-r border-[#cca566]/20 transition-all ${
                activeTab === 'yours'
                  ? 'bg-slate-950/80 text-yellow-400 border-t-2 border-t-amber-500'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-950/30'
              }`}
            >
              <Folder size={11} className="text-blue-400" />
              YOUR WORKSPACE
            </button>
            <button
              onClick={() => {
                playSelect();
                setActiveTab('shared');
              }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-bold rpg-font-retro border-r border-[#cca566]/20 transition-all relative ${
                activeTab === 'shared'
                  ? 'bg-slate-950/80 text-yellow-400 border-t-2 border-t-amber-500'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-950/30'
              }`}
            >
              <Globe size={11} className="text-green-400" />
              SHOW TO ALL SPACE
              {presentation.active && (
                <span className="absolute top-1.5 right-1.5 flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                </span>
              )}
            </button>
          </div>
        </div>

        {/* TAB 1: YOUR WORKSPACE CONTENT */}
        {activeTab === 'yours' && (
          <div className="w-full min-h-[300px]">
            {activeLocalFile ? (
              /* Local File Frame Viewer */
              <div className="flex flex-col animate-fade-in">
                {/* Control bar */}
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-[#cca566]/25 text-[9.5px] font-bold text-slate-350">
                  <button
                    onClick={() => {
                      playClick();
                      setActiveLocalFile(null);
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 bg-amber-955 hover:bg-amber-900 border border-amber-600/30 rounded text-amber-400 transition-colors"
                  >
                    <ArrowLeft size={10} />
                    Kembali ke Folder
                  </button>
                  <span className="truncate max-w-[250px]">
                    Sedang Melihat: <strong className="text-yellow-400">{activeLocalFile.name}</strong>
                  </span>
                  <a
                    href={activeLocalFile.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => playClick()}
                    className="text-amber-500 hover:text-amber-400 underline underline-offset-1 transition-colors flex items-center gap-1"
                  >
                    Buka Tab Baru ↗
                  </a>
                </div>
                {/* Resize Handle Bar */}
                <div
                  onMouseDown={startResize}
                  className="w-full h-5 bg-slate-900 hover:bg-amber-955 border-b border-[#cca566]/20 cursor-row-resize flex items-center justify-center gap-2 transition-all select-none group text-slate-500 hover:text-amber-400"
                  title="Geser ke atas/bawah untuk mengubah tinggi layar (pembesaran ke bawah)"
                >
                  <div className="w-6 h-0.5 bg-slate-700 group-hover:bg-amber-450 rounded" />
                  <span className="text-[7.5px] font-mono font-extrabold tracking-widest uppercase">
                    ⇅ GESER UNTUK RESIZE TINGGI DOKUMEN (EXTEND DOWN) ⇅
                  </span>
                  <div className="w-6 h-0.5 bg-slate-700 group-hover:bg-amber-450 rounded" />
                </div>

                {/* Iframe */}
                <div className="w-full bg-white relative" style={{ height: `${workspaceHeight}px`, overscrollBehavior: 'contain' }}>
                  {isResizing && (
                    <div className="absolute inset-0 bg-transparent z-50 cursor-row-resize" />
                  )}
                  <iframe
                    src={activeLocalFile.url}
                    className="w-full h-full border-0"
                    style={{ overscrollBehavior: 'contain' }}
                    title={`Preview Local File: ${activeLocalFile.name}`}
                    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
                  />
                </div>
              </div>
            ) : (
              /* File Explorer View */
              <div className="p-3">
                <p className="text-[10px] text-slate-400 mb-2 font-mono">
                  Berikut adalah berkas-berkas di folder kerja bersama Anda. Silakan klik folder untuk membuka sub-folder, atau klik file untuk membukanya secara lokal di dalam aplikasi:
                </p>
                <DriveExplorer
                  rootFolderId={driveFolderId || 'root'}
                  onFileClick={handleLocalFileClick}
                />
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SHOW TO ALL SPACE CONTENT */}
        {activeTab === 'shared' && (
          <div className="w-full min-h-[300px]">
            {presentation.active ? (
              /* Global Collaborative Presentation Iframe View */
              <div className="flex flex-col animate-fade-in">
                {/* Presentation Status Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-2.5 bg-slate-900 border-b border-[#cca566]/20 text-xs font-bold text-slate-300">
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="flex items-center gap-1.5 text-slate-100">
                      <Monitor className="w-4 h-4 text-green-455 animate-pulse flex-shrink-0" />
                      SEDANG MEMPRESENTASIKAN: <strong className="text-yellow-400 truncate max-w-[300px] sm:max-w-[400px]">{presentation.fileName}</strong>
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Presenter: <strong className="text-amber-455">{presentation.presenterName}</strong>
                    </span>
                  </div>
                  {isPresenterOrAdmin && (
                    <button
                      onClick={stopPresenting}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 bg-red-955 hover:bg-red-900 border border-red-800 rounded text-red-400 transition-all active:scale-95 cursor-pointer font-extrabold uppercase tracking-wider text-[9.5px] whitespace-nowrap self-start sm:self-center"
                    >
                      <Square size={11} fill="currentColor" className="animate-pulse" />
                      HENTIKAN PRESENTASI (STOP PRESENT)
                    </button>
                  )}
                </div>
                {/* Resize Handle Bar */}
                <div
                  onMouseDown={startResize}
                  className="w-full h-5 bg-slate-900 hover:bg-amber-955 border-b border-[#cca566]/20 cursor-row-resize flex items-center justify-center gap-2 transition-all select-none group text-slate-500 hover:text-amber-400"
                  title="Geser ke atas/bawah untuk mengubah tinggi layar (pembesaran ke bawah)"
                >
                  <div className="w-6 h-0.5 bg-slate-700 group-hover:bg-amber-450 rounded" />
                  <span className="text-[7.5px] font-mono font-extrabold tracking-widest uppercase">
                    ⇅ GESER UNTUK RESIZE TINGGI DOKUMEN (EXTEND DOWN) ⇅
                  </span>
                  <div className="w-6 h-0.5 bg-slate-700 group-hover:bg-amber-450 rounded" />
                </div>

                {/* Shared Iframe Container */}
                <div className="w-full bg-white relative" style={{ height: `${workspaceHeight}px`, overscrollBehavior: 'contain' }}>
                  {isResizing && (
                    <div className="absolute inset-0 bg-transparent z-50 cursor-row-resize" />
                  )}
                  <iframe
                    src={presentation.fileUrl}
                    className="w-full h-full border-0"
                    style={{ overscrollBehavior: 'contain' }}
                    title={`Collaborative Shared File: ${presentation.fileName}`}
                    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
                  />
                </div>
              </div>
            ) : isSelectingFileToPresent ? (
              /* Selection Interface for Presenter */
              <div className="p-4 flex flex-col gap-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-bold text-amber-500 uppercase rpg-font-retro tracking-wider flex items-center gap-1">
                    <Share2 size={12} />
                    Pilih File untuk Dipresentasikan Ke Semua User
                  </h3>
                  <button
                    onClick={() => {
                      playClick();
                      setIsSelectingFileToPresent(false);
                    }}
                    className="text-[9.5px] text-red-400 hover:text-red-500 font-bold border border-red-900/30 px-2 py-0.5 rounded"
                  >
                    Batal
                  </button>
                </div>

                {/* File Explorer to Select File */}
                <div>
                  <p className="text-[9.5px] text-slate-400 mb-1.5 font-mono">
                    Klik berkas di bawah ini untuk langsung mempresentasikan dan membukanya ke layar semua pengguna secara realtime:
                  </p>
                  <DriveExplorer
                    rootFolderId={driveFolderId || 'root'}
                    onFileClick={handlePresentFileClick}
                  />
                </div>

                {/* Manual Paste Tautan */}
                <div className="border-t border-[#cca566]/15 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      setShowPastePanel(p => !p);
                    }}
                    className="text-[9.5px] text-amber-500 hover:text-amber-400 font-bold underline transition-colors cursor-pointer"
                  >
                    {showPastePanel ? 'Sembunyikan Opsi Tautan Manual' : 'Atau tempel tautan berbagi secara manual'}
                  </button>

                  {showPastePanel && (
                    <form onSubmit={handleManualSubmit} className="mt-2 bg-slate-900/60 p-3 border border-[#cca566]/20 rounded w-full flex flex-col gap-2 text-left font-semibold text-[10px] animate-fade-in">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[8.5px] text-[#cca566] font-bold">TAUTAN FILE GOOGLE DRIVE/DOCS:</label>
                        <input
                          type="url"
                          required
                          placeholder="Contoh: https://docs.google.com/document/d/..."
                          value={pasteUrl}
                          onChange={(e) => setPasteUrl(e.target.value)}
                          className="bg-black/60 text-yellow-100 border border-[#cca566]/30 px-2.5 py-1.5 rounded focus:outline-none focus:border-amber-500 text-[9.5px] font-semibold placeholder:text-stone-600"
                        />
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <label className="text-[8.5px] text-[#cca566] font-bold">NAMA/JUDUL DOKUMEN (OPSIONAL):</label>
                        <input
                          type="text"
                          placeholder="Contoh: Timeline Rapat Divisi"
                          value={pasteTitle}
                          onChange={(e) => setPasteTitle(e.target.value)}
                          className="bg-black/60 text-yellow-100 border border-[#cca566]/30 px-2.5 py-1.5 rounded focus:outline-none focus:border-amber-500 text-[9.5px] font-semibold placeholder:text-stone-600"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="py-1.5 px-3 bg-amber-600 hover:bg-amber-500 text-stone-950 font-extrabold rounded active:scale-95 transition-all cursor-pointer shadow-md text-[9.5px]"
                        >
                          HADIRKAN DOKUMEN MANUAL
                        </button>
                        {gisLoaded && (
                          <button
                            type="button"
                            onClick={handleOpenPicker}
                            className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-amber-400 font-extrabold border border-amber-600/30 rounded active:scale-95 transition-all cursor-pointer text-[9.5px]"
                          >
                            Pilih via Google Picker (OAuth)
                          </button>
                        )}
                      </div>
                    </form>
                  )}
                </div>
              </div>
            ) : (
              /* Presentation Inactive - Default Clean Screen */
              <div className="p-8 flex flex-col items-center justify-center gap-3 text-center max-w-md mx-auto min-h-[260px]">
                <div className="w-12 h-12 rounded-full bg-slate-900/60 border border-[#cca566]/30 flex items-center justify-center text-slate-500">
                  <Share2 className="w-5.5 h-5.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[#cca566] uppercase rpg-font-retro tracking-wider">Show to All Space</h3>
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed font-medium">
                    Tidak ada presentasi aktif. Klik tombol di bawah ini untuk memilih dokumen dan mempresentasikannya ke layar semua anggota secara bersamaan.
                  </p>
                </div>
                <button
                  onClick={() => {
                    playClick();
                    setIsSelectingFileToPresent(true);
                  }}
                  className="mt-3 px-5 py-2 bg-gradient-to-b from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 border border-amber-400 text-stone-950 font-black text-[10px] rounded transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Share2 size={12} className="text-stone-950" />
                  PRESENT / BAGIKAN FILE
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
