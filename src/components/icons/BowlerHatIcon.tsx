import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

/** Lucide-compatible decorative icon: simple bowler hat (dome crown, brim). */
export const BowlerHatIcon = forwardRef<SVGSVGElement, LucideProps>(
  (
    {
      color = 'currentColor',
      size = 24,
      strokeWidth = 2,
      absoluteStrokeWidth,
      className,
      children: _c,
      ...rest
    },
    ref,
  ) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={absoluteStrokeWidth ? (Number(strokeWidth) * 24) / Number(size) : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={['lucide', 'lucide-bowler-hat', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      {...rest}
    >
      <ellipse cx="12" cy="17" rx="11" ry="2.5" />
      <path d="M6 17C6 10 8.5 5.5 12 5.5S18 10 18 17" />
    </svg>
  ),
);

BowlerHatIcon.displayName = 'BowlerHatIcon';
