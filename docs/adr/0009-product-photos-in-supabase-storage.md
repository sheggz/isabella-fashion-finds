# 0009. Product photos in Supabase Storage, uploaded through the API

Status: Accepted · Date: 2026-10-01

## Context
The owner uploads photos of each piece; customers view them. We already use Supabase for Postgres (ADR 0006) and FastAPI is the only writer. Photos must be safe to serve publicly and must not leave the database and the file store disagreeing for long.

## Decision
- Photos live in a **public** Supabase Storage bucket `product-images`; the database stores only the object **path** (`product_images.path`). The public URL is built at response time from configuration, so a change of host or CDN is a config change, not a data migration. The internal path is never sent to clients.
- **Uploads go through FastAPI** (multipart, owner-only), not directly from the browser. The server holds the secret key, validates every file, and chooses the path.
- **Never trust the client's description of a file:** the type is detected from the file's bytes (JPEG, PNG, WebP only), the filename and Content-Type header are ignored, the path is built from ids we generate, max 5 MB, max 8 photos per product. The bucket repeats the size and type limits, enforced by Supabase itself.
- **Consistency order:** validate, upload the file, then write the row; if the row cannot be saved the file is deleted again. On delete the row goes first and file cleanup is best-effort (logged, never fails the user's request). Deleting a product removes its files the same way.
- Auth to Storage follows the key type: new `sb_secret_` keys go in the `apikey` header only (they are not JWTs); legacy JWT keys also get a bearer header. Verified against the live API.
- Every upload gets a fresh random file name, so a changed photo is a new URL.
- A `scripts/ensure_bucket.py` makes bucket creation repeatable per Supabase project.

## Alternatives considered
- **Browser uploads directly to Storage with signed URLs:** less load on our server, but validation (real file type, limits, photo count) would have to be trusted to the client or rebuilt in policies. More moving parts for a small catalogue.
- **Storing images in Postgres:** simple consistency, but bloats the database and backups and serves poorly.
- **Private bucket with signed URLs for viewing:** unnecessary: product photos are meant to be public.

## Consequences
- (+) One trust boundary (our API); safe-by-default validation; orphan files are the only failure mode and are logged.
- (-) Uploads pass through our server (5 MB cap; the whole multipart body is still received before our check, so a request-size limit is also needed at the host/proxy). Public objects are cached by Supabase's CDN: a deleted photo can remain visible at its old URL for a while. Orphaned files after a failed cleanup need an occasional sweep (not built yet).
