import React, { useId } from 'react';

interface KotobiSupportIconProps {
  className?: string;
  size?: number;
  title?: string;
}

/**
 * شارة توثيق الدعم الرسمي لمنصة كتبي
 * درع مُسنّن بتدرّج ذهبي/زمردي + كتاب مفتوح ودرع حماية وعلامة صح
 */
export const KotobiSupportIcon: React.FC<KotobiSupportIconProps> = ({
  className = '',
  size = 20,
  title = 'حساب الدعم الرسمي في كتبي',
}) => {
  const uid = useId().replace(/:/g, '');
  const grad = `ksGrad-${uid}`;
  const gloss = `ksGloss-${uid}`;
  const ring = `ksRing-${uid}`;

  // ختم مُسنّن (14 سنًّا) ليبدو أقوى وأكثر رسمية
  const lobes = 14;
  const rOuter = 47;
  const rInner = 40;
  let d = '';
  for (let i = 0; i < lobes; i++) {
    const a1 = ((i * 2 - 0.5) * Math.PI) / lobes;
    const a2 = ((i * 2 + 0.5) * Math.PI) / lobes;
    const a3 = ((i * 2 + 1.5) * Math.PI) / lobes;
    const p = (r: number, a: number) =>
      `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
    if (i === 0) d += `M ${p(rInner, a1)}`;
    d += ` Q ${p(rOuter + 3, (a1 + a2) / 2)} ${p(rInner, a2)}`;
    d += ` L ${p(rInner, a3)}`;
  }
  d += ' Z';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe27a" />
          <stop offset="42%" stopColor="#f2b23a" />
          <stop offset="100%" stopColor="#b6741a" />
        </linearGradient>
        <linearGradient id={gloss} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id={ring} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1f6f4f" />
          <stop offset="100%" stopColor="#0d4732" />
        </linearGradient>
      </defs>

      {/* الختم الذهبي */}
      <path d={d} fill={`url(#${grad})`} />
      <path d={d} fill={`url(#${gloss})`} />

      {/* قرص داخلي زمردي داكن */}
      <circle cx="50" cy="50" r="34" fill={`url(#${ring})`} />
      <circle cx="50" cy="50" r="34" fill="none" stroke="#ffe9a8" strokeOpacity="0.7" strokeWidth="2.4" />

      {/* درع الحماية */}
      <path
        d="M50 24 L70 31 V50c0 12.5-8.4 21-20 25.5C38.4 71 30 62.5 30 50V31z"
        fill="#ffffff"
        fillOpacity="0.1"
        stroke="#ffe9a8"
        strokeOpacity="0.55"
        strokeWidth="2"
      />

      {/* كتاب مفتوح صغير */}
      <g fill="none" opacity="0.5" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M50 40c-2.6-2.1-5.9-3-9.6-3H36v16h4.4c3.7 0 7 .9 9.6 3" />
        <path d="M50 40c2.6-2.1 5.9-3 9.6-3H64v16h-4.4c-3.7 0-7 .9-9.6 3" />
      </g>

      {/* علامة الصح */}
      <path
        d="M39 51.5 L46.8 59.5 L62 42.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M39 51.5 L46.8 59.5 L62 42.5"
        fill="none"
        stroke="#f2b23a"
        strokeOpacity="0.45"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default KotobiSupportIcon;
