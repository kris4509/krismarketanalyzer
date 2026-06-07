
-- Restrict SECURITY DEFINER funcs (linter fix)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Storage policies: admins manage files in bots-files bucket
CREATE POLICY "Admins can upload bot files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bots-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update bot files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'bots-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete bot files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'bots-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can read bot files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'bots-files' AND public.has_role(auth.uid(), 'admin'));
