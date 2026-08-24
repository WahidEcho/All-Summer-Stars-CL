'use client';

import { useId, useRef, useState } from 'react';

import { cn } from '@/lib/cn';
import { AdminButton } from '@/components/admin/Button';

export type MediaBucket = 'players' | 'brand';

export interface UploadResponse {
  ok: boolean;
  url?: string;
  path?: string;
  error?: string;
}

export interface UploadFieldProps {
  bucket: MediaBucket;
  /** Folder inside the bucket, e.g. `crests` or `portraits`. */
  folder: string;
  label: string;
  hint?: string;
  value: string | null;
  onUploaded: (url: string) => void;
  onCleared?: () => void;
  accept?: string;
  disabled?: boolean;
  /** Rendered instead of the default thumbnail — a live card preview. */
  preview?: React.ReactNode;
  className?: string;
}

/** 8 MB is comfortably above a full-resolution cut-out PNG and below a laptop screenshot dump. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Upload a crest, a portrait or a sponsor logo.
 *
 * The file goes to `/admin/api/media`, which re-checks the operator's role and
 * writes to Supabase storage with the service key. Doing it there rather than
 * straight from the browser means the same console works during setup, before
 * any staff account exists, without loosening the storage policies.
 */
export function UploadField({
  bucket,
  folder,
  label,
  hint,
  value,
  onUploaded,
  onCleared,
  accept = 'image/png,image/jpeg,image/webp,image/svg+xml,image/avif',
  disabled = false,
  preview,
  className,
}: UploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<void> {
    setError(null);

    if (file.size > MAX_BYTES) {
      setError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB — export it smaller.`,
      );
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Only image files can be uploaded here.');
      return;
    }

    const body = new FormData();
    body.set('bucket', bucket);
    body.set('folder', folder);
    body.set('file', file);

    setBusy(true);
    try {
      const response = await fetch('/admin/api/media', { method: 'POST', body });
      const payload = (await response.json()) as UploadResponse;
      if (!response.ok || !payload.ok || !payload.url) {
        setError(payload.error ?? `Upload failed (${response.status}).`);
        return;
      }
      onUploaded(payload.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The upload did not complete.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className={cn('min-w-0 space-y-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="u-label text-text-secondary text-eyebrow">
          {label}
        </label>
        {value ? (
          <span className="text-text-muted text-[0.6875rem]">Uploaded</span>
        ) : (
          <span className="text-text-muted text-[0.6875rem]">No file yet</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div
          className={cn(
            'ring-border-subtle bg-mist flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md ring-1',
          )}
        >
          {preview ? (
            preview
          ) : value ? (
            // A plain <img>: these are runtime Supabase URLs on an unknown host,
            // which next/image would need configuring for per deployment.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt=""
              className="size-full object-contain"
              onError={() => setError('That URL did not load. Re-upload the file.')}
            />
          ) : (
            <span aria-hidden className="text-text-muted text-[1.25rem]">
              ⬚
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={accept}
            disabled={disabled || busy}
            className="u-sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <AdminButton
              size="sm"
              busy={busy}
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              {value ? 'Replace file' : 'Choose file'}
            </AdminButton>
            {value && onCleared ? (
              <AdminButton
                size="sm"
                variant="ghost"
                disabled={disabled || busy}
                onClick={() => {
                  setError(null);
                  onCleared();
                }}
              >
                Remove
              </AdminButton>
            ) : null}
          </div>

          {value ? (
            <p className="text-text-muted truncate text-[0.6875rem]" title={value}>
              {value}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-live text-[0.75rem] leading-body">
              <span aria-hidden>▲ </span>
              {error}
            </p>
          ) : hint ? (
            <p className="text-text-muted text-[0.75rem] leading-body">{hint}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default UploadField;
