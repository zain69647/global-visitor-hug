-- Table to store global and daily visit counts
CREATE TABLE public.visitor_counts (
  id TEXT PRIMARY KEY,
  count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.visitor_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read visitor counts"
  ON public.visitor_counts FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.visitor_counts (id, count) VALUES ('global', 0);
INSERT INTO public.visitor_counts (id, count) VALUES ('today_' || to_char(now(), 'YYYY-MM-DD'), 0);

CREATE OR REPLACE FUNCTION public.increment_visit()
RETURNS TABLE(global_count BIGINT, today_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today TEXT;
  _global BIGINT;
  _today_count BIGINT;
BEGIN
  _today := 'today_' || to_char(now(), 'YYYY-MM-DD');
  
  UPDATE visitor_counts SET count = count + 1, updated_at = now() WHERE id = 'global';
  SELECT count INTO _global FROM visitor_counts WHERE id = 'global';
  
  INSERT INTO visitor_counts (id, count) VALUES (_today, 1)
  ON CONFLICT (id) DO UPDATE SET count = visitor_counts.count + 1, updated_at = now();
  SELECT count INTO _today_count FROM visitor_counts WHERE id = _today;
  
  RETURN QUERY SELECT _global, _today_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_visit_counts()
RETURNS TABLE(global_count BIGINT, today_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today TEXT;
  _global BIGINT;
  _today_count BIGINT;
BEGIN
  _today := 'today_' || to_char(now(), 'YYYY-MM-DD');
  
  SELECT count INTO _global FROM visitor_counts WHERE id = 'global';
  SELECT COALESCE((SELECT count FROM visitor_counts WHERE id = _today), 0) INTO _today_count;
  
  RETURN QUERY SELECT _global, _today_count;
END;
$$;