
ALTER TABLE public.purchases ALTER COLUMN user_id DROP NOT NULL;

-- Allow anonymous browsing of active bots
DROP POLICY IF EXISTS "Anyone signed in can view active bots" ON public.bots;
CREATE POLICY "Anyone can view active bots"
  ON public.bots FOR SELECT
  TO anon, authenticated
  USING (active = true OR public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT ON public.bots TO anon;
