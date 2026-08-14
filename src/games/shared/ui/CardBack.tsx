interface CardBackProps {
  className?: string;
}

export function CardBack({ className = '' }: CardBackProps) {
  return <div className={`card-back ${className}`.trim()} aria-hidden="true" />;
}
