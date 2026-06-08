// Hook: useDriveFileExplorer
// Purpose: Manage folder navigation, caching, and file exploration

import { useState, useCallback, useRef, useEffect } from 'react';
import { isMock, supabase } from '../lib/supabase';
import { isDriveFolder, isPresentableDriveFile, type DriveShortcutDetails } from '../lib/driveMime';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  shortcutDetails?: DriveShortcutDetails;
}

function normalizeDriveFile(raw: Record<string, unknown>): DriveFile {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    mimeType: String(raw.mimeType ?? raw.mime_type ?? ''),
    webViewLink: raw.webViewLink as string | undefined,
    shortcutDetails: raw.shortcutDetails as DriveShortcutDetails | undefined,
  };
}

export interface BreadcrumbItem {
  id: string;
  name: string;
}

interface FolderCache {
  files: DriveFile[];
  nextPageToken?: string;
  timestamp: number;
}

export const useDriveFileExplorer = (rootFolderId: string) => {
  const [currentFolderId, setCurrentFolderId] = useState(rootFolderId);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([
    { id: rootFolderId, name: 'Root' }
  ]);

  const cacheRef = useRef<Record<string, FolderCache>>({});
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Fetch files from edge function or mock
  const fetchFolder = useCallback(async (folderId: string, useCache = true) => {
    setLoading(true);
    setError(null);

    try {
      // Check cache first
      const cached = cacheRef.current[folderId];
      if (useCache && cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setFiles(cached.files);
        return;
      }

      if (isMock) {
        // Mock: return empty files array
        setFiles([]);
        return;
      }

      // Call edge function
      const { data, error: invokeError } = await supabase!.functions.invoke(`manage-drive-assets?folderId=${folderId}`, {
        method: 'GET'
      });

      if (invokeError) throw invokeError;

      if (data?.error) {
        throw new Error(data.error);
      }

      const fetchedFiles: DriveFile[] = (data?.files || []).map(normalizeDriveFile);
      
      // Cache the result
      cacheRef.current[folderId] = {
        files: fetchedFiles,
        nextPageToken: data?.nextPageToken,
        timestamp: Date.now()
      };

      setFiles(fetchedFiles);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat folder dari Google Drive');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load initial folder
  useEffect(() => {
    if (rootFolderId) {
      fetchFolder(rootFolderId, true);
    }
  }, [rootFolderId, fetchFolder]);

  // Navigate to a subfolder
  const navigateToFolder = useCallback((folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setBreadcrumb(prev => [...prev, { id: folderId, name: folderName }]);
    fetchFolder(folderId, true);
  }, [fetchFolder]);

  // Go back to parent folder
  const goBack = useCallback(() => {
    if (breadcrumb.length > 1) {
      const newBreadcrumb = breadcrumb.slice(0, -1);
      const parentId = newBreadcrumb[newBreadcrumb.length - 1].id;
      
      setCurrentFolderId(parentId);
      setBreadcrumb(newBreadcrumb);
      
      // Use cache for back navigation
      const cached = cacheRef.current[parentId];
      if (cached) {
        setFiles(cached.files);
      } else {
        fetchFolder(parentId, false); // Fetch fresh if not cached
      }
    }
  }, [breadcrumb, fetchFolder]);
  
  const goToRoot = useCallback(() => {
    setCurrentFolderId(rootFolderId);
    setBreadcrumb([{ id: rootFolderId, name: 'Root' }]);
    fetchFolder(rootFolderId, true);
  }, [rootFolderId, fetchFolder]);

  // Create a new file
  const createFile = useCallback(async (name: string, type: 'folder' | 'docs' | 'sheets' | 'slides') => {
    setError(null);

    try {
      if (isMock) {
        // Mock: add to current files
        const newFile: DriveFile = {
          id: `mock_${Date.now()}`,
          name,
          mimeType: type === 'folder' ? 'application/vnd.google-apps.folder' : `application/vnd.google-apps.${type}`,
          webViewLink: `https://docs.google.com/document/d/${Date.now()}/edit`
        };
        setFiles(prev => [newFile, ...prev]);
        // Invalidate cache
        delete cacheRef.current[currentFolderId];
        return newFile;
      }

      // Call edge function to create file
      const { data, error: invokeError } = await supabase!.functions.invoke('manage-drive-assets', {
        method: 'POST',
        body: {
          type,
          name: name.trim(),
          parentFolderId: currentFolderId
        }
      });

      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);

      const newFile: DriveFile = {
        id: data.id,
        name: data.name,
        mimeType: data.mimeType,
        webViewLink: data.webViewLink
      };

      setFiles(prev => [newFile, ...prev]);
      // Invalidate cache since we added a new file
      delete cacheRef.current[currentFolderId];

      return newFile;
    } catch (err: any) {
      const errorMsg = err.message || 'Gagal membuat file';
      setError(errorMsg);
      throw err;
    }
  }, [currentFolderId]);

  const folders = files.filter(f => isDriveFolder(f.mimeType, f.shortcutDetails, f.name));
  const otherFiles = files.filter(f => isPresentableDriveFile(f.mimeType));

  return {
    // State
    currentFolderId,
    files,
    folders,
    otherFiles,
    loading,
    error,
    breadcrumb,

    // Actions
    navigateToFolder,
    goBack,
    goToRoot,
    createFile,
    fetchFolder,

    // Derived
    canGoBack: breadcrumb.length > 1,
    currentPath: breadcrumb.map(b => b.name).join(' / ')
  };
};
