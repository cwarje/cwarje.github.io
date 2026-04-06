import { useEffect, useRef, useState } from 'react';

function getFittedTextSize(text: string, availableWidth: number, minSize: number, maxSize: number): number {
  if (typeof document === 'undefined' || availableWidth <= 0) return minSize;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return maxSize;

  for (let size = maxSize; size >= minSize; size -= 0.5) {
    context.font = `700 ${size}px Inter, ui-sans-serif, system-ui, sans-serif`;
    if (context.measureText(text).width <= availableWidth) return size;
  }

  return minSize;
}

interface AutoFitSeatNameProps {
  name: string;
  textColor: string;
  /** Class for the measured name span (game-specific typography). */
  nameClassName?: string;
}

export function AutoFitSeatName({ name, textColor, nameClassName = 'hearts-seatPillName' }: AutoFitSeatNameProps) {
  const nameRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(13);

  useEffect(() => {
    const node = nameRef.current;
    if (!node) return;

    const recalc = () => {
      const availableWidth = Math.max(0, node.clientWidth - 2);
      const fittedSize = getFittedTextSize(name, availableWidth, 8, 14);
      setFontSize(prev => (Math.abs(prev - fittedSize) < 0.1 ? prev : fittedSize));
    };

    recalc();
    const resizeObserver = new ResizeObserver(recalc);
    resizeObserver.observe(node);

    return () => resizeObserver.disconnect();
  }, [name]);

  return (
    <span ref={nameRef} className={nameClassName} style={{ fontSize: `${fontSize}px`, color: textColor }}>
      {name}
    </span>
  );
}
