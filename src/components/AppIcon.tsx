import type { LucideIcon, LucideProps } from 'lucide-react';

type AppIconProps = LucideProps & {
  icon: LucideIcon;
};

export function AppIcon({
  icon: Icon,
  className = '',
  size = 18,
  strokeWidth = 2,
  ...rest
}: AppIconProps) {
  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      className={`ui-icon ${className}`.trim()}
      aria-hidden
      {...rest}
    />
  );
}
