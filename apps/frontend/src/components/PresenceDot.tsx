import { useTranslation } from 'react-i18next';
import { isUserOnline } from '../utils/presence';

type Props = {
  lastSeenAt?: string | null;
  className?: string;
  showLabel?: boolean;
};

export function PresenceDot({ lastSeenAt, className = '', showLabel = false }: Props) {
  const { t } = useTranslation();
  const online = isUserOnline(lastSeenAt);
  return (
    <span
      className={`presence-dot${online ? ' is-online' : ' is-offline'}${className ? ` ${className}` : ''}`}
      title={online ? t('presence.online') : t('presence.offline')}
    >
      <span className="presence-dot-mark" aria-hidden />
      {showLabel ? (
        <span className="presence-dot-label">
          {online ? t('presence.online') : t('presence.offline')}
        </span>
      ) : (
        <span className="sr-only">
          {online ? t('presence.online') : t('presence.offline')}
        </span>
      )}
    </span>
  );
}
