import { useEffect, useState } from 'react';
import { resolveMediaUrl } from '../api/client';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

type UserAvatarProps = {
  name: string;
  avatarUrl?: string | null;
  className?: string;
  imageClassName?: string;
};

export function UserAvatar({
  name,
  avatarUrl,
  className = 'avatar',
  imageClassName = 'avatar-image',
}: UserAvatarProps) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [avatarUrl]);

  return (
    <div className={className}>
      {avatarUrl && !broken ? (
        <img
          src={resolveMediaUrl(avatarUrl)}
          alt={name}
          className={imageClassName}
          onError={() => setBroken(true)}
        />
      ) : (
        initials(name || 'U')
      )}
    </div>
  );
}
