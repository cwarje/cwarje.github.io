import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

/** Lucide-compatible decorative icon: pig in profile (body, head, snout, ear, tail, legs). */
export const PigIcon = forwardRef<SVGSVGElement, LucideProps>(
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
      className={['lucide', 'lucide-pig', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      {...rest}
    >
      <ellipse cx="10" cy="14.5" rx="6.5" ry="4.25" />
      <circle cx="16.25" cy="12" r="3.35" />
      <ellipse cx="20.25" cy="12.5" rx="2.15" ry="1.85" />
      <path d="M15 8.5q1.25-2.05 2.8-1.2" />
      <path d="M3.75 13.5q-1.35-.2-1.55-1.55.35-1.95 2-2.25" />
      <path d="M8 18.5v2.25M12 18.5v2.25M15 18.5v2" />
      <circle cx="19" cy="12.35" r="0.55" fill="currentColor" />
      <circle cx="20.75" cy="12.35" r="0.55" fill="currentColor" />
    </svg>
  ),
);

PigIcon.displayName = 'PigIcon';
