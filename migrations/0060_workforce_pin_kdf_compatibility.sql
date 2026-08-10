-- Cloudflare Workers supports PBKDF2 iteration counts up to 100,000.
-- Preserve legacy metadata so older credentials fail closed and can be reset.
ALTER TABLE time_clock_credentials ADD COLUMN pin_kdf TEXT NOT NULL DEFAULT 'PBKDF2-SHA256';
ALTER TABLE time_clock_credentials ADD COLUMN pin_iterations INTEGER NOT NULL DEFAULT 120000;

