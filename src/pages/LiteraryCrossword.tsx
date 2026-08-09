import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Trophy, Crown, Medal, Flame, Lightbulb, Clock, CheckCircle2, Sparkles } from '@/components/icons/kotobi-lucide';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { UnifiedProfileLink } from '@/components/profile/UnifiedProfileLink';
import CrosswordGrid from '@/components/games/CrosswordGrid';
import { useCurrentCrossword, useCrosswordLeaderboard, useCrosswordActions } from '@/hooks/useCrossword';
import { CrosswordClue, cellKey, extractAnswers, formatDuration } from '@/services/crossword';

const HINT_LIMIT = 5;

const LiteraryCrossword: React.FC = () => {
  const { user } = useAuth();
  const { data: puzzle, isLoading } = useCurrentCrossword();
  const puzzleId = puzzle?.found ? puzzle.id : undefined;
  const { data: board, isLoading: boardLoading } = useCrosswordLeaderboard(puzzleId);
  const { start, hint, submit } = useCrosswordActions(puzzleId);

  const clues = useMemo<CrosswordClue[]>(() => puzzle?.clues ?? [], [puzzle]);
  const storageKey = puzzleId ? `crossword:${puzzleId}:${user?.id ?? 'guest'}` : null;

  const [letters, setLetters] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState<{ clue: CrosswordClue | null; cell: string | null }>({ clue: null, cell: null });
  const [wrongNumbers, setWrongNumbers] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [startedLocal, setStartedLocal] = useState(false);
  const [result, setResult] = useState<{ score: number; duration: number | null; xp?: number; coins?: number } | null>(null);

  const attempt = puzzle?.attempt ?? null;
  const isCompleted = !!attempt?.is_completed;
  const hintsUsed = hint.data?.hints_used ?? attempt?.hints_used ?? 0;
  const started = (!!attempt || startedLocal) && !isCompleted;


  // استعادة الحروف المحفوظة محلياً
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      setLetters(raw ? JSON.parse(raw) : {});
    } catch {
      setLetters({});
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(letters));
    } catch {
      /* تجاهل امتلاء التخزين */
    }
  }, [letters, storageKey]);

  // المؤقت
  useEffect(() => {
    const startedAtRaw = attempt?.started_at ?? localStartedAt;
    if (!startedAtRaw || isCompleted) return;
    const startedAt = new Date(startedAtRaw).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [attempt?.started_at, localStartedAt, isCompleted]);

  useEffect(() => {
    if (!active.clue && clues.length) setActive({ clue: clues[0], cell: cellKey(clues[0].row, clues[0].col) });
  }, [clues, active.clue]);

  const filledCount = useMemo(() => {
    const answers = extractAnswers(clues, letters);
    return clues.filter((c) => (answers[String(c.number)] ?? '').length === c.length).length;
  }, [clues, letters]);

  // كلمة السؤال النشط (لصندوق الكتابة السريع)
  const activeWord = useMemo(() => {
    const c = active.clue;
    if (!c) return '';
    let w = '';
    for (let i = 0; i < c.length; i++) {
      const r = c.dir === 'across' ? c.row : c.row + i;
      const col = c.dir === 'across' ? c.col + i : c.col;
      w += letters[cellKey(r, col)] ?? ' ';
    }
    return w.replace(/\s+$/, '');
  }, [active.clue, letters]);

  const writeWord = (raw: string) => {
    const c = active.clue;
    if (!c || !started) return;
    const chars = raw.replace(/[\s\u064B-\u0652]/g, '').slice(0, c.length).split('');
    setLetters((prev) => {
      const next = { ...prev };
      for (let i = 0; i < c.length; i++) {
        const r = c.dir === 'across' ? c.row : c.row + i;
        const col = c.dir === 'across' ? c.col + i : c.col;
        const k = cellKey(r, col);
        if (chars[i]) next[k] = chars[i];
        else delete next[k];
      }
      return next;
    });
  };

  const goToClue = (delta: number) => {
    if (!active.clue) return;
    const idx = clues.findIndex((c) => c.number === active.clue!.number && c.dir === active.clue!.dir);
    const nextClue = clues[(idx + delta + clues.length) % clues.length];
    if (nextClue) setActive({ clue: nextClue, cell: cellKey(nextClue.row, nextClue.col) });
  };

  const handleStart = async () => {
    if (!user) {
      toast({ title: 'سجّل دخولك أولاً', description: 'تحتاج حساباً لتسجيل وقتك في قائمة الشرف.' });
      return;
    }
    const res = await start.mutateAsync();
    if (!res.started) {
      toast({ title: 'تعذّر بدء اللعبة', variant: 'destructive' });
      return;
    }
    setStartedLocal(true);
    setLocalStartedAt(res.started_at ?? new Date().toISOString());
    toast({ title: 'انطلق العدّاد! ⏱️', description: 'اضغط على أي خانة واكتب الحروف، أو اكتب الكلمة كاملة في الصندوق أسفل الشبكة.' });
  };


  const handleHint = async () => {
    if (!active.clue) return;
    const res = await hint.mutateAsync(Number(active.clue.number));
    if (!res.ok) {
      const reasons: Record<string, string> = {
        not_authenticated: 'سجّل دخولك أولاً.',
        no_attempt: 'ابدأ اللعبة أولاً.',
        already_completed: 'أنهيت الشبكة بالفعل.',
        hint_limit: `الحد الأقصى ${HINT_LIMIT} تلميحات.`,
      };
      toast({ title: reasons[res.reason ?? ''] ?? 'تعذّر التلميح', variant: 'destructive' });
      return;
    }
    const c = active.clue;
    const idx = res.index ?? 0;
    const key = c.dir === 'across' ? cellKey(c.row, c.col + idx) : cellKey(c.row + idx, c.col);
    setLetters((prev) => ({ ...prev, [key]: res.letter ?? '' }));
    setRevealed((prev) => ({ ...prev, [key]: true }));
  };

  const handleSubmit = async () => {
    const answers = extractAnswers(clues, letters);
    const res = await submit.mutateAsync(answers);
    if (!res.ok) {
      toast({ title: res.reason === 'no_attempt' ? 'ابدأ اللعبة أولاً' : 'تعذّر الإرسال', variant: 'destructive' });
      return;
    }
    setWrongNumbers(res.wrong_numbers ?? []);
    if (res.is_completed || res.already_completed) {
      setResult({ score: res.score ?? 0, duration: res.duration_seconds ?? null, xp: res.xp_awarded, coins: res.coins_awarded });
      toast({ title: '🎉 أنهيت الشبكة!', description: `نقاطك: ${res.score} — الزمن: ${formatDuration(res.duration_seconds)}` });
    } else {
      toast({
        title: 'ما زالت هناك كلمات خاطئة',
        description: `الصحيح ${res.correct_words} من ${res.total_words}. الكلمات الخاطئة مظللة بالأحمر.`,
        variant: 'destructive',
      });
    }
  };

  const across = clues.filter((c) => c.dir === 'across');
  const down = clues.filter((c) => c.dir === 'down');

  const ClueList = ({ title, items }: { title: string; items: CrosswordClue[] }) => (
    <div>
      <h3 className="mb-2 text-sm font-bold text-muted-foreground">{title}</h3>
      <ul className="space-y-1">
        {items.map((c) => (
          <li key={`${c.dir}-${c.number}`}>
            <button
              type="button"
              onClick={() => setActive({ clue: c, cell: cellKey(c.row, c.col) })}
              className={`w-full rounded-md px-2 py-1.5 text-right text-sm transition-colors hover:bg-muted ${
                active.clue?.number === c.number && active.clue?.dir === c.dir ? 'bg-primary/15 font-semibold' : ''
              } ${wrongNumbers.includes(Number(c.number)) ? 'text-destructive' : ''}`}
            >
              <span className="font-bold">{c.number}.</span> {c.clue}{' '}
              <span className="text-xs text-muted-foreground">({c.length} حروف)</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 pb-32 md:pb-6" dir="rtl">
      <Helmet>
        <title>الكلمات المتقاطعة الأدبية — تحدي أسبوعي | كتبي</title>
        <meta
          name="description"
          content="شبكة كلمات متقاطعة أسبوعية عن الشخصيات الروائية والأسماء الأدبية وتواريخ الكتب. أنهِ الشبكة بأسرع وقت وتصدّر قائمة الشرف."
        />
      </Helmet>

      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <Sparkles className="text-sky-500" /> الكلمات المتقاطعة الأدبية
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تحدٍّ أسبوعي عن الشخصيات الروائية والأسماء الأدبية. الأسرع يتصدّر قائمة الشرف.
        </p>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : !puzzle?.found ? (
        <Card className="p-8 text-center text-muted-foreground">لا توجد شبكة منشورة حالياً. عُد قريباً!</Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Card className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold">{puzzle.title}</h2>
                  {puzzle.description && <p className="text-xs text-muted-foreground">{puzzle.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {isCompleted ? formatDuration(attempt?.duration_seconds) : formatDuration(started ? elapsed : 0)}
                  </Badge>
                  <Badge variant="secondary">
                    {filledCount}/{clues.length} كلمة
                  </Badge>
                </div>
              </div>

              <CrosswordGrid
                size={puzzle.size ?? 13}
                clues={clues}
                letters={letters}
                onChange={setLetters}
                active={active}
                onActiveChange={setActive}
                wrongNumbers={wrongNumbers}
                revealed={revealed}
                locked={isCompleted || !started}
              />

              {active.clue && (
                <div className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">
                  <span className="font-bold">
                    {active.clue.number}. {active.clue.dir === 'across' ? 'أفقي' : 'رأسي'} —{' '}
                  </span>
                  {active.clue.clue}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {!started && !isCompleted && (
                  <Button onClick={handleStart} disabled={start.isPending}>
                    {start.isPending ? 'جارٍ البدء…' : 'ابدأ التحدي'}
                  </Button>
                )}
                {started && (
                  <>
                    <Button onClick={handleSubmit} disabled={submit.isPending}>
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                      {submit.isPending ? 'جارٍ التحقق…' : 'تحقّق وأرسل'}
                    </Button>
                    <Button variant="outline" onClick={handleHint} disabled={hint.isPending || hintsUsed >= HINT_LIMIT}>
                      <Lightbulb className="mr-1 h-4 w-4" />
                      تلميح ({HINT_LIMIT - hintsUsed})
                    </Button>
                  </>
                )}
                {isCompleted && (
                  <Badge className="gap-1 px-3 py-1.5 text-sm">
                    <Trophy className="h-4 w-4" /> أنهيتها في {formatDuration(attempt?.duration_seconds)} — {attempt?.score} نقطة
                  </Badge>
                )}
                {!user && (
                  <Button asChild variant="ghost">
                    <Link to="/auth">سجّل الدخول للمنافسة</Link>
                  </Button>
                )}
              </div>

              {result && (
                <div className="mt-3 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
                  🎉 نتيجتك {result.score} نقطة في {formatDuration(result.duration)}
                  {result.xp ? ` — +${result.xp} خبرة` : ''}
                  {result.coins ? ` و +${result.coins} عملة` : ''}
                </div>
              )}
            </Card>

            <Card className="grid gap-6 p-4 sm:grid-cols-2">
              <ClueList title="أفقي" items={across} />
              <ClueList title="رأسي" items={down} />
            </Card>
          </div>

          <aside>
            <Card className="p-4">
              <h2 className="mb-3 flex items-center gap-2 font-bold">
                <Crown className="text-amber-500" /> قائمة الشرف الأسبوعية
              </h2>
              {boardLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : (board?.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">لا أحد أنهى الشبكة بعد. كن الأول!</p>
              ) : (
                <ol className="space-y-2">
                  {board?.map((e) => (
                    <li key={e.user_id}>
                      <UnifiedProfileLink
                        userId={e.user_id}
                        username={e.username ?? undefined}
                        className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-muted"
                      >
                        <span className="w-6 text-center font-bold">
                          {e.rank === 1 ? <Medal className="h-4 w-4 text-amber-500" /> : e.rank}
                        </span>
                        <span className="flex-1 truncate text-sm">{e.username ?? 'قارئ'}</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDuration(e.duration_seconds)}
                        </span>
                        <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                          <Flame className="h-3 w-3" />
                          {e.score}
                        </span>
                      </UnifiedProfileLink>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
};

export default LiteraryCrossword;
