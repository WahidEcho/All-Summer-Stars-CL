import { NextResponse } from 'next/server';

import { serviceDb } from '@/lib/data/server';
import { readAdminSession, canAdminister } from '@/app/admin/_lib/session';

/**
 * Media upload for the setup screens.
 *
 * Crests, player cut-outs and sponsor logos are written with the service key
 * from here rather than straight from the browser. That keeps the storage
 * policies tight (`staff write media` still requires an authenticated staff
 * user for any direct client write) while letting the console work during
 * setup, before the first staff account exists.
 *
 * The operator is resolved and role-checked on every request — this endpoint
 * does not rely on the proxy's /admin gate.
 */

const BUCKETS = new Set(['players', 'brand']);
const MAX_BYTES = 8 * 1024 * 1024;

const EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Keep a filename to characters that survive a URL and a CDN path. */
function safeSegment(value: string, fallback: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned.length > 0 ? cleaned : fallback;
}

export async function POST(request: Request) {
  const session = await readAdminSession();
  if (!session) return fail(401, 'Sign in to upload media.');
  if (!canAdminister(session.role)) {
    return fail(403, `Role "${session.role}" cannot upload media.`);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'Expected a multipart form upload.');
  }

  const bucket = String(form.get('bucket') ?? '');
  if (!BUCKETS.has(bucket)) {
    return fail(400, 'Uploads are only accepted into the players and brand buckets.');
  }

  const file = form.get('file');
  if (!(file instanceof File)) return fail(400, 'No file was attached.');
  if (file.size === 0) return fail(400, 'That file is empty.');
  if (file.size > MAX_BYTES) {
    return fail(413, 'That file is larger than the 8 MB limit.');
  }

  const contentType = file.type || 'application/octet-stream';
  if (!contentType.startsWith('image/')) {
    return fail(415, 'Only images can be uploaded here.');
  }

  const folder = safeSegment(String(form.get('folder') ?? ''), 'uploads');
  const base = safeSegment(file.name.replace(/\.[^.]+$/, ''), 'file');
  const extension = EXTENSION[contentType] ?? 'bin';
  // The timestamp keeps a replaced photo from being served from a stale cache
  // under the old URL — the row simply points at the new object.
  const path = `${folder}/${base}-${Date.now().toString(36)}.${extension}`;

  let db;
  try {
    db = serviceDb();
  } catch {
    return fail(500, 'Supabase service credentials are missing on the server.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const upload = await db.storage
    .from(bucket)
    .upload(path, buffer, { contentType, upsert: true, cacheControl: '3600' });

  if (upload.error) {
    return fail(500, upload.error.message);
  }

  const { data } = db.storage.from(bucket).getPublicUrl(path);

  return NextResponse.json({ ok: true, url: data.publicUrl, path });
}
