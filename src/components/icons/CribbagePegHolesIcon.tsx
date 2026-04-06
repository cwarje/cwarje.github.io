import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

/** Lucide-compatible icon: two parallel rows of peg holes (4×2), horizontal like a cribbage track. */
export const CribbagePegHolesIcon = forwardRef<SVGSVGElement, LucideProps>(
  (
    {
      color = 'currentColor',
      size = 24,
      strokeWidth: _strokeWidth,
      absoluteStrokeWidth: _absoluteStrokeWidth,
      className,
      children: _c,
      ...rest
    },
    ref,
  ) => {
    const xs = [4.75, 9.25, 13.75, 18.25];
    const ys = [9, 15];
    const r = 1.65;
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={color}
        className={['lucide', 'lucide-cribbage-peg-holes', className].filter(Boolean).join(' ')}
        aria-hidden="true"
        {...rest}
      >
        {xs.flatMap(x => ys.map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />))}
      </svg>
    );
  },
);

CribbagePegHolesIcon.displayName = 'CribbagePegHolesIcon';
