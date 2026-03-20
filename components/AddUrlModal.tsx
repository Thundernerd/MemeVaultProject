'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AddUrlForm from './AddUrlForm';

interface Props {
  onClose: () => void;
  onAdded: () => void;
}

interface FileStatus {
  file: File;
  state: 'pending' | 'done' | 'error';
  error?: string;
}

export default function AddUrlModal({ onClose, onAdded }: Props) {
  const [view, setView] = useState<'url' | 'upload'>('url');
  const [selectedFiles, setSelectedFiles] = useState<FileStatus[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleAdded() {
    onAdded();
    onClose();
  }

  function switchToUpload() {
    setView('upload');
    setSelectedFiles([]);
  }

  function switchToUrl() {
    setView('url');
    setSelectedFiles([]);
  }

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    setSelectedFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.file.name));
      const newEntries: FileStatus[] = list
        .filter((f) => !existingNames.has(f.name))
        .map((f) => ({ file: f, state: 'pending' }));
      return [...prev, ...newEntries];
    });
  }, []);

  function removeFile(name: string) {
    setSelectedFiles((prev) => prev.filter((f) => f.file.name !== name));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  async function handleUpload() {
    if (!selectedFiles.length || uploading) return;
    setUploading(true);

    const formData = new FormData();
    for (const { file } of selectedFiles) {
      formData.append('files', file);
    }

    try {
      const res = await fetch('/api/media/upload', { method: 'POST', body: formData });
      const json = await res.json() as { results: { success: boolean; filename: string; error?: string }[] };

      setSelectedFiles((prev) =>
        prev.map((entry) => {
          const result = json.results.find((r) => r.filename === entry.file.name);
          if (!result) return entry;
          return result.success
            ? { ...entry, state: 'done' }
            : { ...entry, state: 'error', error: result.error };
        }),
      );

      if (json.results.some((r) => r.success)) {
        onAdded();
      }
    } catch {
      setSelectedFiles((prev) =>
        prev.map((entry) => ({ ...entry, state: 'error', error: 'Request failed' })),
      );
    } finally {
      setUploading(false);
    }
  }

  const allDone = selectedFiles.length > 0 && selectedFiles.every((f) => f.state === 'done');
  const pendingCount = selectedFiles.filter((f) => f.state === 'pending').length;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            {view === 'url' ? 'Add to queue' : 'Upload files'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 2l12 12M14 2L2 14" />
            </svg>
          </button>
        </div>

        {/* URL view */}
        {view === 'url' && (
          <>
            <AddUrlForm onAdded={handleAdded} />
            <button
              onClick={switchToUpload}
              className="text-zinc-500 hover:text-zinc-300 text-xs flex items-center gap-1.5 transition-colors self-start"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 12V4M4 8l4-4 4 4" />
                <path d="M2 14h12" />
              </svg>
              Upload files instead
            </button>
          </>
        )}

        {/* Upload view */}
        {view === 'upload' && (
          <>
            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer transition-colors
                ${dragOver ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 hover:border-zinc-500'}`}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                <path d="M12 18V6M6 12l6-6 6 6" />
                <path d="M3 20h18" />
              </svg>
              <p className="text-sm text-zinc-400">Drop files here or <span className="text-zinc-200">browse</span></p>
              <p className="text-xs text-zinc-600">Videos and images</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,image/*"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
            />

            {/* File list */}
            {selectedFiles.length > 0 && (
              <ul className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {selectedFiles.map(({ file, state, error }) => (
                  <li key={file.name} className="flex items-center gap-2 text-sm">
                    {state === 'pending' && (
                      <span className="w-4 h-4 rounded-full border border-zinc-600 shrink-0" />
                    )}
                    {state === 'done' && (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-green-400 shrink-0">
                        <path d="M3 8l3.5 3.5L13 5" />
                      </svg>
                    )}
                    {state === 'error' && (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-red-400 shrink-0">
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    )}
                    <span className={`flex-1 truncate ${state === 'error' ? 'text-red-400' : 'text-zinc-300'}`}>
                      {file.name}
                    </span>
                    {state === 'error' && error && (
                      <span className="text-xs text-red-500 shrink-0 max-w-32 truncate">{error}</span>
                    )}
                    {state === 'pending' && !uploading && (
                      <button
                        onClick={() => removeFile(file.name)}
                        className="text-zinc-600 hover:text-zinc-400 shrink-0 transition-colors"
                        aria-label="Remove"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M1 1l10 10M11 1L1 11" />
                        </svg>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2">
              {!allDone && (
                <button
                  onClick={handleUpload}
                  disabled={pendingCount === 0 || uploading}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
                >
                  {uploading
                    ? 'Uploading…'
                    : pendingCount > 0
                      ? `Upload ${pendingCount} file${pendingCount !== 1 ? 's' : ''}`
                      : 'Upload'}
                </button>
              )}
              {allDone && (
                <button
                  onClick={onClose}
                  className="w-full bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
                >
                  Done
                </button>
              )}
            </div>

            <button
              onClick={switchToUrl}
              className="text-zinc-500 hover:text-zinc-300 text-xs flex items-center gap-1.5 transition-colors self-start"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 4H3M3 4l3-3M3 4l3 3" />
                <path d="M6 12h7M13 12l-3-3M13 12l-3 3" />
              </svg>
              Add URL instead
            </button>
          </>
        )}
      </div>
    </div>
  );
}
