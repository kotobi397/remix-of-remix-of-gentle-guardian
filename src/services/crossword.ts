// خدمة لعبة الكلمات المتقاطعة الأدبية — تستدعي RPCs آمنة (الأجوبة تبقى على السيرفر)
import { supabase } from '@/integrations/supabase/client';

export type Direction = 'across' | 'down';

export interface CrosswordClue {
  number: string | number;
  row: number;
  col: number;
  dir: Direction;
  length: number;
  clue: string;
}

export interface CrosswordAttempt {
  id: string;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  hints_used: number;
  is_completed: boolean;
  correct_words: number;
  score: number;
}

export interface CurrentPuzzle {
  found: boolean;
  id?: string;
  title?: string;
  description?: string | null;
  week_start?: string;
  size?: number;
  difficulty?: string;
  clues?: CrosswordClue[];
  attempt?: CrosswordAttempt | null;
}

export interface SubmitResult {
  ok: boolean;
  reason?: string;
  already_completed?: boolean;
  is_completed?: boolean;
  correct_words?: number;
  total_words?: number;
  wrong_numbers?: number[];
  duration_seconds?: number | null;
  score?: number;
  hints_used?: number;
  xp_awarded?: number;
  coins_awarded?: number;
}

export interface HintResult {
  ok: boolean;
  reason?: string;
  number?: number;
  index?: number;
  letter?: string;
  hints_used?: number;
}

export interface CrosswordLeaderboardEntry {
  rank: number;
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  duration_seconds: number | null;
  hints_used: number;
  score: number;
  completed_at: string | null;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const crossword = {
  getCurrentPuzzle: () => rpc<CurrentPuzzle>('cw_get_current_puzzle'),
  startAttempt: (puzzleId: string) =>
    rpc<{ started: boolean; reason?: string; attempt_id?: string; started_at?: string; is_completed?: boolean; hints_used?: number }>(
      'cw_start_attempt',
      { _puzzle_id: puzzleId }
    ),
  useHint: (puzzleId: string, number: number) =>
    rpc<HintResult>('cw_use_hint', { _puzzle_id: puzzleId, _number: number }),
  submit: (puzzleId: string, answers: Record<string, string>) =>
    rpc<SubmitResult>('cw_submit_attempt', { _puzzle_id: puzzleId, _answers: answers }),
  getLeaderboard: (puzzleId?: string, limit = 50) =>
    rpc<CrosswordLeaderboardEntry[]>('cw_get_leaderboard', { _puzzle_id: puzzleId ?? null, _limit: limit }),
};

export function formatDuration(seconds?: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const cellKey = (row: number, col: number) => `${row},${col}`;

/** يبني خرائط الخلايا وأرقام البدايات من قائمة الأسئلة */
export function buildGridMeta(clues: CrosswordClue[]) {
  const cells = new Set<string>();
  const numbers = new Map<string, string>();
  const cellClues = new Map<string, { across?: CrosswordClue; down?: CrosswordClue }>();

  clues.forEach((c) => {
    for (let i = 0; i < c.length; i++) {
      const r = c.dir === 'across' ? c.row : c.row + i;
      const k = cellKey(r, c.dir === 'across' ? c.col + i : c.col);
      cells.add(k);
      const entry = cellClues.get(k) ?? {};
      entry[c.dir] = c;
      cellClues.set(k, entry);
    }
    const startKey = cellKey(c.row, c.col);
    if (!numbers.has(startKey)) numbers.set(startKey, String(c.number));
  });

  return { cells, numbers, cellClues };
}

/** يستخرج حروف كل كلمة من حالة الشبكة */
export function extractAnswers(clues: CrosswordClue[], letters: Record<string, string>): Record<string, string> {
  const answers: Record<string, string> = {};
  clues.forEach((c) => {
    let word = '';
    for (let i = 0; i < c.length; i++) {
      const r = c.dir === 'across' ? c.row : c.row + i;
      const col = c.dir === 'across' ? c.col + i : c.col;
      word += letters[cellKey(r, col)] ?? '';
    }
    answers[String(c.number)] = word;
  });
  return answers;
}
