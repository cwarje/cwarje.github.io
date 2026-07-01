import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

/** Lucide-compatible decorative icon: diagonal rounded rectangle (half cucumber). */
export const CucumberIcon = forwardRef<SVGSVGElement, LucideProps>(
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
      className={['lucide', 'lucide-cucumber', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      {...rest}
    >
      <rect x="2" y="8" width="20" height="8" rx="4" transform="rotate(-35 12 12)" />
    </svg>
  ),
);

CucumberIcon.displayName = 'CucumberIcon';
