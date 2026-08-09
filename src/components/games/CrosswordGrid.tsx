import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { CrosswordClue, buildGridMeta, cellKey } from '@/services/crossword';
import { cn } from '@/lib/utils';

interface Props {
  size: number;
  clues: CrosswordClue[];
  letters: Record<string, string>;
  onChange: (letters: Record<string, string>) => void;
  active: { clue: CrosswordClue | null; cell: string | null };
  onActiveChange: (next: { clue: CrosswordClue | null; cell: string | null }) => void;
  wrongNumbers?: number[];
  revealed?: Record<string, boolean>;
  locked?: boolean;
}

const CrosswordGrid: React.FC<Props> = ({
  size,
  clues,
  letters,
  onChange,
  active,
  onActiveChange,
  wrongNumbers = [],
  revealed = {},
  locked = false,
}) => {
  const { cells, numbers, cellClues } = useMemo(() => buildGridMeta(clues), [clues]);
  const inputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  const wrongCells = useMemo(() => {
    const set = new Set<string>();
    clues
      .filter((c) => wrongNumbers.includes(Number(c.number)))
      .forEach((c) => {
        for (let i = 0; i < c.length; i++) {
          const r = c.dir === 'across' ? c.row : c.row + i;
          const col = c.dir === 'across' ? c.col + i : c.col;
          set.add(cellKey(r, col));
        }
      });
    return set;
  }, [clues, wrongNumbers]);

  const activeCells = useMemo(() => {
    const set = new Set<string>();
    const c = active.clue;
    if (!c) return set;
    for (let i = 0; i < c.length; i++) {
      const r = c.dir === 'across' ? c.row : c.row + i;
      const col = c.dir === 'across' ? c.col + i : c.col;
      set.add(cellKey(r, col));
    }
    return set;
  }, [active.clue]);

  const focusCell = useCallback((key: string) => {
    inputsRef.current[key]?.focus();
    inputsRef.current[key]?.select();
  }, []);

  useEffect(() => {
    if (active.cell) focusCell(active.cell);
  }, [active.cell, focusCell]);

  const pickClue = (row: number, col: number, preferSwitch = false) => {
    const entry = cellClues.get(cellKey(row, col));
    if (!entry) return null;
    const current = active.clue;
    if (preferSwitch && current) {
      const other = current.dir === 'across' ? entry.down : entry.across;
      if (other) return other;
    }
    return entry.across ?? entry.down ?? null;
  };

  const step = (clue: CrosswordClue, row: number, col: number, delta: number) => {
    const idx = clue.dir === 'across' ? col - clue.col : row - clue.row;
    const next = idx + delta;
    if (next < 0 || next >= clue.length) return null;
    return clue.dir === 'across' ? cellKey(clue.row, clue.col + next) : cellKey(clue.row + next, clue.col);
  };

  const handleInput = (row: number, col: number, value: string) => {
    if (locked) return;
    const key = cellKey(row, col);
    const ch = value.replace(/[\s\u064B-\u0652]/g, '').slice(-1);
    const next = { ...letters };
    if (ch) next[key] = ch;
    else delete next[key];
    onChange(next);

    const clue = active.clue ?? pickClue(row, col);
    if (ch && clue) {
      const nk = step(clue, row, col, 1);
      if (nk) onActiveChange({ clue, cell: nk });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    const clue = active.clue ?? pickClue(row, col);
    const key = cellKey(row, col);

    if (e.key === 'Backspace') {
      e.preventDefault();
      if (locked) return;
      const next = { ...letters };
      if (next[key]) {
        delete next[key];
        onChange(next);
      } else if (clue) {
        const pk = step(clue, row, col, -1);
        if (pk) {
          delete next[pk];
          onChange(next);
          onActiveChange({ clue, cell: pk });
        }
      }
      return;
    }

    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowRight: [0, -1], // اتجاه عربي: يمين = بداية الكلمة
      ArrowLeft: [0, 1],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const [dr, dc] = moves[e.key];
      let r = row + dr;
      let c = col + dc;
      while (r >= 0 && r < size && c >= 0 && c < size) {
        const k = cellKey(r, c);
        if (cells.has(k)) {
          const entry = cellClues.get(k)!;
          const wantDir: 'across' | 'down' = dr !== 0 ? 'down' : 'across';
          onActiveChange({ clue: entry[wantDir] ?? entry.across ?? entry.down ?? null, cell: k });
          return;
        }
        r += dr;
        c += dc;
      }
      return;
    }

    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const switched = pickClue(row, col, true);
      if (switched) onActiveChange({ clue: switched, cell: key });
    }
  };

  return (
    <div
      dir="rtl"
      className="mx-auto w-full max-w-[520px] select-none"
      style={{ display: 'grid', gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, gap: 2 }}
    >
      {Array.from({ length: size * size }, (_, i) => {
        const row = Math.floor(i / size);
        const col = i % size;
        const key = cellKey(row, col);
        if (!cells.has(key)) return <div key={key} className="aspect-square rounded-[3px] bg-muted/40" />;

        const number = numbers.get(key);
        const isActiveCell = active.cell === key;
        const inActiveWord = activeCells.has(key);
        const isWrong = wrongCells.has(key);
        const isRevealed = revealed[key];

        return (
          <div key={key} className="relative aspect-square">
            {number && (
              <span className="pointer-events-none absolute right-[2px] top-0 z-10 text-[8px] font-bold leading-none text-muted-foreground sm:text-[10px]">
                {number}
              </span>
            )}
            <input
              ref={(el) => {
                inputsRef.current[key] = el;
              }}
              value={letters[key] ?? ''}
              readOnly={locked}
              inputMode="text"
              autoComplete="off"
              aria-label={`خلية ${row + 1}-${col + 1}`}
              onChange={(e) => handleInput(row, col, e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, row, col)}
              onFocus={() => {
                const entry = cellClues.get(key)!;
                const clue = active.clue && activeCells.has(key) ? active.clue : entry.across ?? entry.down ?? null;
                onActiveChange({ clue, cell: key });
              }}
              onDoubleClick={() => {
                const switched = pickClue(row, col, true);
                if (switched) onActiveChange({ clue: switched, cell: key });
              }}
              className={cn(
                'h-full w-full rounded-[3px] border text-center text-sm font-bold uppercase outline-none transition-colors sm:text-lg',
                'border-border bg-card text-foreground',
                inActiveWord && 'bg-primary/10',
                isActiveCell && 'ring-2 ring-primary bg-primary/20',
                isWrong && 'border-destructive bg-destructive/15',
                isRevealed && 'text-primary'
              )}
            />
          </div>
        );
      })}
    </div>
  );
};

export default CrosswordGrid;
