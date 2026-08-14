import type { WorkspaceMode } from '../hooks/useWorkspaceMode';
import { conversationsPath } from '../hooks/useWorkspaceMode';
import type { NotificationItem } from '../types';

export function getNotificationHref(
  n: NotificationItem,
  workspace: WorkspaceMode = 'buyer',
): string | null {
  const p = n.payload;
  if (!p) return null;
  switch (n.type) {
    case 'NEW_LEAD':
      return '/supplier/leads';
    case 'NEW_OFFER':
      return p.requestId ? `/offers?requestId=${p.requestId}` : '/offers';
    case 'OFFER_ACCEPTED':
      return conversationsPath('supplier', p.conversationId);
    case 'NEW_MESSAGE':
      return conversationsPath(workspace, p.conversationId);
    default:
      return null;
  }
}
