import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crossword } from '@/services/crossword';
import { useAuth } from '@/context/AuthContext';

export function useCurrentCrossword() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['crossword', 'current', user?.id ?? 'guest'],
    queryFn: () => crossword.getCurrentPuzzle(),
    staleTime: 60 * 1000,
  });
}

export function useCrosswordLeaderboard(puzzleId?: string) {
  return useQuery({
    queryKey: ['crossword', 'leaderboard', puzzleId ?? 'current'],
    queryFn: () => crossword.getLeaderboard(puzzleId),
    enabled: !!puzzleId,
    staleTime: 30 * 1000,
  });
}

export function useCrosswordActions(puzzleId?: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['crossword'] });
    queryClient.invalidateQueries({ queryKey: ['gamification'] });
  };

  const start = useMutation({
    mutationFn: () => crossword.startAttempt(puzzleId!),
  });

  const hint = useMutation({
    mutationFn: (number: number) => crossword.useHint(puzzleId!, number),
  });

  const submit = useMutation({
    mutationFn: (answers: Record<string, string>) => crossword.submit(puzzleId!, answers),
    onSuccess: (res) => {
      if (res?.is_completed || res?.already_completed) invalidate();
    },
  });

  return { start, hint, submit };
}
