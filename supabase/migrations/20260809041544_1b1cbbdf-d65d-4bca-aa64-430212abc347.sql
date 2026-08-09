DROP FUNCTION IF EXISTS public.cw_get_current_puzzle();
DROP FUNCTION IF EXISTS public.cw_start_attempt(uuid);
DROP FUNCTION IF EXISTS public.cw_use_hint(uuid, integer);
DROP FUNCTION IF EXISTS public.cw_submit_attempt(uuid, jsonb);
DROP FUNCTION IF EXISTS public.cw_get_leaderboard(uuid);
DROP TABLE IF EXISTS public.crossword_attempts CASCADE;
DROP TABLE IF EXISTS public.crossword_puzzles CASCADE;