import { BadgeCheck, Star } from 'lucide-react';
import { AppIcon } from './AppIcon';

export function RatingStar({
  size = 14,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <AppIcon
      icon={Star}
      size={size}
      strokeWidth={2}
      fill="currentColor"
      className={`rating-star ${className}`.trim()}
    />
  );
}

export function VerifiedMark({
  size = 14,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <AppIcon
      icon={BadgeCheck}
      size={size}
      strokeWidth={2}
      className={`verified-icon ${className}`.trim()}
    />
  );
}
