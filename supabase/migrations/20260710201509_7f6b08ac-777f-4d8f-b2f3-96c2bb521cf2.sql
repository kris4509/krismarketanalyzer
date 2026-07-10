-- 1) Harden has_role: switch to SECURITY INVOKER and tighten EXECUTE grants.
-- user_roles has a SELECT policy allowing "auth.uid() = user_id", and every
-- call site passes auth.uid(), so INVOKER still returns correct results
-- without granting the function the ability to bypass RLS.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;


-- 2) Let buyers download the bot file they paid for.
-- Match on the object's storage path (name) against bots.file_path,
-- and only when the caller has a completed purchase for that bot.
CREATE POLICY "Purchasers can read their bot files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'bots-files'
  AND EXISTS (
    SELECT 1
    FROM public.purchases p
    JOIN public.bots b ON b.id = p.bot_id
    WHERE p.user_id = auth.uid()
      AND p.status = 'completed'
      AND b.file_path = storage.objects.name
  )
);
