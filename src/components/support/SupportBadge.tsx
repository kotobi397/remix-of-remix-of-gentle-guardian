import React from 'react';
import KotobiSupportIcon from '@/components/icons/KotobiSupportIcon';
import { cn } from '@/lib/utils';
import { isKotobiSupportAccount } from '@/lib/supportAccount';

interface SupportBadgeProps {
  userId?: string | null;
  email?: string | null;
  username?: string | null;
  /** تجاوز الفحص التلقائي وإظهار الشارة مباشرة */
  force?: boolean;
  size?: number;
  /** إظهار كلمة «الدعم الرسمي» بجانب الشارة */
  withLabel?: boolean;
  className?: string;
}

export const SupportBadge: React.FC<SupportBadgeProps> = ({
  userId,
  email,
  username,
  force = false,
  size = 16,
  withLabel = false,
  className,
}) => {
  const isSupport = force || isKotobiSupportAccount({ id: userId, email, username });
  if (!isSupport) return null;

  const label = 'الدعم الرسمي لكتبي';

  if (!withLabel) {
    return (
      <span
        title={label}
        aria-label={label}
        className={cn('inline-flex items-center align-middle shrink-0', className)}
      >
        <KotobiSupportIcon size={size} />
      </span>
    );
  }

  return (
    <span
      title={label}
      className={cn(
        'inline-flex items-center gap-1 align-middle shrink-0 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5',
        className
      )}
    >
      <KotobiSupportIcon size={size} />
      <span className="text-[10px] font-bold text-amber-500">{label}</span>
    </span>
  );
};

export default SupportBadge;
