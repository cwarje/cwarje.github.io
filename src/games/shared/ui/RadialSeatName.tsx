import { AutoFitSeatName } from '../AutoFitSeatName';

interface RadialSeatNameProps {
  name: string;
  textColor: string;
  className?: string;
}

export function RadialSeatName({ name, textColor, className = 'radial-seatName' }: RadialSeatNameProps) {
  return <AutoFitSeatName name={name} textColor={textColor} nameClassName={className} />;
}
