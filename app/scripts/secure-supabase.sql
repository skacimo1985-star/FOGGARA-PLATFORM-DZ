-- Run as the database owner before adding production users.
-- FOGGARA uses its own FastAPI authentication, not the Supabase browser Data API.
-- Keep owner/backend access; deny anon/authenticated direct table access.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t.tablename);
  END LOOP;
END $$;
