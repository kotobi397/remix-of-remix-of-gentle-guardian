-- 1) Tables
CREATE TABLE public.crossword_puzzles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  week_start date NOT NULL UNIQUE,
  size integer NOT NULL DEFAULT 11,
  difficulty text NOT NULL DEFAULT 'medium',
  words jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.crossword_puzzles TO anon;
GRANT SELECT ON public.crossword_puzzles TO authenticated;
GRANT ALL ON public.crossword_puzzles TO service_role;

ALTER TABLE public.crossword_puzzles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published puzzles"
ON public.crossword_puzzles FOR SELECT
USING (is_published = true);

CREATE POLICY "Admins manage puzzles"
ON public.crossword_puzzles FOR ALL
TO authenticated
USING (public.is_current_user_admin())
WITH CHECK (public.is_current_user_admin());

CREATE TABLE public.crossword_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id uuid NOT NULL REFERENCES public.crossword_puzzles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_seconds integer,
  hints_used integer NOT NULL DEFAULT 0,
  correct_words integer NOT NULL DEFAULT 0,
  total_words integer NOT NULL DEFAULT 0,
  is_completed boolean NOT NULL DEFAULT false,
  score integer NOT NULL DEFAULT 0,
  rewarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (puzzle_id, user_id)
);

GRANT SELECT, INSERT, UPDATE ON public.crossword_attempts TO authenticated;
GRANT ALL ON public.crossword_attempts TO service_role;

ALTER TABLE public.crossword_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own attempts"
ON public.crossword_attempts FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users create own attempts"
ON public.crossword_attempts FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own attempts"
ON public.crossword_attempts FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_crossword_attempts_puzzle ON public.crossword_attempts (puzzle_id, is_completed, duration_seconds);

CREATE TRIGGER trg_crossword_puzzles_updated_at
BEFORE UPDATE ON public.crossword_puzzles
FOR EACH ROW EXECUTE FUNCTION public.gam_set_updated_at();

CREATE TRIGGER trg_crossword_attempts_updated_at
BEFORE UPDATE ON public.crossword_attempts
FOR EACH ROW EXECUTE FUNCTION public.gam_set_updated_at();

-- 2) Current puzzle WITHOUT answers
CREATE OR REPLACE FUNCTION public.cw_get_current_puzzle()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.crossword_puzzles;
  a public.crossword_attempts;
  clues jsonb;
BEGIN
  SELECT * INTO p FROM public.crossword_puzzles
  WHERE is_published = true AND week_start <= current_date
  ORDER BY week_start DESC LIMIT 1;

  IF p.id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'number', w->>'number',
    'row', (w->>'row')::int,
    'col', (w->>'col')::int,
    'dir', w->>'dir',
    'length', char_length(w->>'answer'),
    'clue', w->>'clue'
  ) ORDER BY (w->>'number')::int), '[]'::jsonb)
  INTO clues
  FROM jsonb_array_elements(p.words) w;

  IF auth.uid() IS NOT NULL THEN
    SELECT * INTO a FROM public.crossword_attempts
    WHERE puzzle_id = p.id AND user_id = auth.uid();
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'id', p.id,
    'title', p.title,
    'description', p.description,
    'week_start', p.week_start,
    'size', p.size,
    'difficulty', p.difficulty,
    'clues', clues,
    'attempt', CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', a.id,
      'started_at', a.started_at,
      'completed_at', a.completed_at,
      'duration_seconds', a.duration_seconds,
      'hints_used', a.hints_used,
      'is_completed', a.is_completed,
      'correct_words', a.correct_words,
      'score', a.score
    ) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cw_get_current_puzzle() FROM public;
GRANT EXECUTE ON FUNCTION public.cw_get_current_puzzle() TO anon, authenticated;

-- 3) Start attempt
CREATE OR REPLACE FUNCTION public.cw_start_attempt(_puzzle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.crossword_attempts;
  total int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('started', false, 'reason', 'not_authenticated');
  END IF;

  SELECT jsonb_array_length(words) INTO total FROM public.crossword_puzzles
  WHERE id = _puzzle_id AND is_published = true;
  IF total IS NULL THEN
    RETURN jsonb_build_object('started', false, 'reason', 'not_found');
  END IF;

  INSERT INTO public.crossword_attempts (puzzle_id, user_id, total_words)
  VALUES (_puzzle_id, auth.uid(), total)
  ON CONFLICT (puzzle_id, user_id) DO UPDATE SET total_words = total
  RETURNING * INTO a;

  RETURN jsonb_build_object(
    'started', true,
    'attempt_id', a.id,
    'started_at', a.started_at,
    'is_completed', a.is_completed,
    'hints_used', a.hints_used
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cw_start_attempt(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.cw_start_attempt(uuid) TO authenticated;

-- 4) Hint: reveal one letter of a word
CREATE OR REPLACE FUNCTION public.cw_use_hint(_puzzle_id uuid, _number int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ans text;
  a public.crossword_attempts;
  idx int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO a FROM public.crossword_attempts
  WHERE puzzle_id = _puzzle_id AND user_id = auth.uid();
  IF a.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_attempt');
  END IF;
  IF a.is_completed THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_completed');
  END IF;
  IF a.hints_used >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hint_limit');
  END IF;

  SELECT w->>'answer' INTO ans
  FROM public.crossword_puzzles p, jsonb_array_elements(p.words) w
  WHERE p.id = _puzzle_id AND (w->>'number')::int = _number;

  IF ans IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'clue_not_found');
  END IF;

  idx := 1 + (a.hints_used % char_length(ans));

  UPDATE public.crossword_attempts
  SET hints_used = hints_used + 1
  WHERE id = a.id;

  RETURN jsonb_build_object('ok', true, 'number', _number, 'index', idx - 1,
    'letter', substr(ans, idx, 1), 'hints_used', a.hints_used + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.cw_use_hint(uuid, int) FROM public;
GRANT EXECUTE ON FUNCTION public.cw_use_hint(uuid, int) TO authenticated;

-- 5) Submit answers, validate server-side, score and reward
CREATE OR REPLACE FUNCTION public.cw_submit_attempt(_puzzle_id uuid, _answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.crossword_attempts;
  total int := 0;
  correct int := 0;
  wrong_numbers jsonb := '[]'::jsonb;
  w jsonb;
  given text;
  expected text;
  secs int;
  final_score int := 0;
  completed boolean := false;
  xp_awarded int := 0;
  coins_awarded int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO a FROM public.crossword_attempts
  WHERE puzzle_id = _puzzle_id AND user_id = auth.uid();
  IF a.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_attempt');
  END IF;
  IF a.is_completed THEN
    RETURN jsonb_build_object('ok', true, 'already_completed', true,
      'correct_words', a.correct_words, 'total_words', a.total_words,
      'duration_seconds', a.duration_seconds, 'score', a.score);
  END IF;

  FOR w IN SELECT jsonb_array_elements(p.words) FROM public.crossword_puzzles p WHERE p.id = _puzzle_id
  LOOP
    total := total + 1;
    expected := regexp_replace(w->>'answer', '\s', '', 'g');
    given := regexp_replace(coalesce(_answers->>(w->>'number'), ''), '\s', '', 'g');
    IF given <> '' AND given = expected THEN
      correct := correct + 1;
    ELSE
      wrong_numbers := wrong_numbers || to_jsonb((w->>'number')::int);
    END IF;
  END LOOP;

  secs := GREATEST(1, EXTRACT(EPOCH FROM (now() - a.started_at))::int);
  completed := (total > 0 AND correct = total);

  IF completed THEN
    final_score := GREATEST(100, 2000 - (secs / 3) - (a.hints_used * 75));
  END IF;

  UPDATE public.crossword_attempts
  SET correct_words = correct,
      total_words = total,
      is_completed = completed,
      completed_at = CASE WHEN completed THEN now() ELSE NULL END,
      duration_seconds = CASE WHEN completed THEN secs ELSE NULL END,
      score = final_score
  WHERE id = a.id
  RETURNING * INTO a;

  IF completed AND NOT a.rewarded THEN
    xp_awarded := 60 + GREATEST(0, 40 - a.hints_used * 8);
    coins_awarded := 25;
    PERFORM public.award_xp(auth.uid(), xp_awarded, 'admin_adjust'::xp_reason, _puzzle_id::text,
      jsonb_build_object('source', 'literary_crossword', 'score', final_score));
    PERFORM public.award_coins(auth.uid(), coins_awarded, 'admin_adjust'::coins_reason, _puzzle_id::text,
      jsonb_build_object('source', 'literary_crossword'));
    UPDATE public.crossword_attempts SET rewarded = true WHERE id = a.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'is_completed', completed,
    'correct_words', correct,
    'total_words', total,
    'wrong_numbers', wrong_numbers,
    'duration_seconds', CASE WHEN completed THEN secs ELSE NULL END,
    'score', final_score,
    'hints_used', a.hints_used,
    'xp_awarded', xp_awarded,
    'coins_awarded', coins_awarded
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cw_submit_attempt(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.cw_submit_attempt(uuid, jsonb) TO authenticated;

-- 6) Weekly hall of fame
CREATE OR REPLACE FUNCTION public.cw_get_leaderboard(_puzzle_id uuid DEFAULT NULL, _limit int DEFAULT 50)
RETURNS TABLE (
  rank bigint,
  user_id uuid,
  username text,
  avatar_url text,
  duration_seconds integer,
  hints_used integer,
  score integer,
  completed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid := _puzzle_id;
BEGIN
  IF pid IS NULL THEN
    SELECT p.id INTO pid FROM public.crossword_puzzles p
    WHERE p.is_published = true AND p.week_start <= current_date
    ORDER BY p.week_start DESC LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT ROW_NUMBER() OVER (ORDER BY at.score DESC, at.duration_seconds ASC, at.completed_at ASC),
         at.user_id,
         pr.username,
         pr.avatar_url,
         at.duration_seconds,
         at.hints_used,
         at.score,
         at.completed_at
  FROM public.crossword_attempts at
  LEFT JOIN public.profiles pr ON pr.id = at.user_id
  WHERE at.puzzle_id = pid AND at.is_completed = true
  ORDER BY at.score DESC, at.duration_seconds ASC, at.completed_at ASC
  LIMIT LEAST(GREATEST(_limit, 1), 100);
END;
$$;

REVOKE ALL ON FUNCTION public.cw_get_leaderboard(uuid, int) FROM public;
GRANT EXECUTE ON FUNCTION public.cw_get_leaderboard(uuid, int) TO anon, authenticated;