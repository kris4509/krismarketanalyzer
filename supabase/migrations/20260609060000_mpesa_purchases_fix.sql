
-- Allow service_role to insert purchases without a user_id (anonymous M-Pesa purchases).
-- user_id was made nullable in a previous migration; this ensures all grants are correct.

-- Ensure service_role has full access (idempotent)
GRANT ALL ON public.purchases TO service_role;

-- Allow anon to read their own purchase status by checkout_request_id
-- (used by the client-side status polling via server function)
GRANT SELECT ON public.purchases TO anon;

-- Policy: service_role bypasses RLS by default (no policy needed for service_role).
-- This migration is a no-op safety net to confirm grants are in place.
