// Utility: Google Drive MIME type helpers for folder navigation vs document presentation

export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

export const PRESENTABLE_MIMES = [
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
] as const;

export type PresentableMime = (typeof PRESENTABLE_MIMES)[number];

export interface DriveShortcutDetails {
  targetId?: string;
  targetMimeType?: string;
}

export interface DriveFileLike {
  id: string;
  name?: string;
  mimeType?: string;
  shortcutDetails?: DriveShortcutDetails;
}

// Education Guild folder naming convention (e.g. "[-]Director")
const FOLDER_NAME_PREFIX = /^\[-\]/;

function mimeLooksLikeFolder(mimeType?: string): boolean {
  if (!mimeType) return false;
  const normalized = mimeType.toLowerCase();
  return normalized === FOLDER_MIME || normalized.includes('folder');
}

export function isDriveFolder(
  mimeType?: string,
  shortcutDetails?: DriveShortcutDetails,
  name?: string
): boolean {
  if (mimeLooksLikeFolder(mimeType)) return true;

  if (mimeType === SHORTCUT_MIME && mimeLooksLikeFolder(shortcutDetails?.targetMimeType)) {
    return true;
  }

  if (name && FOLDER_NAME_PREFIX.test(name)) return true;

  return false;
}

export function getFolderNavigateTarget(
  file: DriveFileLike
): { folderId: string; folderName: string } | null {
  const name = file.name ?? 'Folder';

  if (mimeLooksLikeFolder(file.mimeType)) {
    return { folderId: file.id, folderName: name };
  }

  if (
    file.mimeType === SHORTCUT_MIME &&
    mimeLooksLikeFolder(file.shortcutDetails?.targetMimeType) &&
    file.shortcutDetails?.targetId
  ) {
    return { folderId: file.shortcutDetails.targetId, folderName: name };
  }

  if (name && FOLDER_NAME_PREFIX.test(name)) {
    return { folderId: file.id, folderName: name };
  }

  return null;
}

export function isPresentableDriveFile(mimeType?: string): mimeType is PresentableMime {
  if (!mimeType) return false;
  return (PRESENTABLE_MIMES as readonly string[]).includes(mimeType);
}
