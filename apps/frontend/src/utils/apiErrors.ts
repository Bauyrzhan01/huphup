import { ApiError } from '../api/client';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const SUPPLIER_MEMBERSHIP = 'Supplier company membership required';
const COMPANY_NOT_FOUND = 'Company not found';

/**
 * The API throws NestJS exceptions with English messages. Show users a translation instead;
 * anything unknown falls back to a message for its HTTP status (see statusKey).
 */
const MESSAGE_KEYS: Record<string, string> = {
  [SUPPLIER_MEMBERSHIP]: 'products.noCompany',
  [COMPANY_NOT_FOUND]: 'products.noCompany',
  'Create a company profile first': 'products.noCompany',

  'User not found': 'apiErrors.userNotFound',
  'Request not found': 'apiErrors.requestNotFound',
  'Product not found': 'apiErrors.productNotFound',
  'Offer not found': 'apiErrors.offerNotFound',
  'Lead not found': 'apiErrors.leadNotFound',
  'Task not found': 'apiErrors.taskNotFound',
  'Invite not found': 'apiErrors.inviteNotFound',
  'Member not found': 'apiErrors.memberNotFound',
  'Conversation not found': 'apiErrors.conversationNotFound',
  'Wallet not found': 'apiErrors.walletNotFound',
  'Image not found': 'apiErrors.fileNotFound',
  'File not found': 'apiErrors.fileNotFound',
  'Attachment not found': 'apiErrors.fileNotFound',

  'Invalid credentials': 'apiErrors.invalidCredentials',
  'User is inactive or not found': 'apiErrors.accountInactive',
  'Current password is incorrect': 'apiErrors.wrongCurrentPassword',
  'New password must differ from current': 'apiErrors.samePassword',
  'Invalid or expired reset token': 'apiErrors.resetTokenInvalid',
  'Email already registered': 'apiErrors.emailTaken',
  'Admin accounts cannot be self-registered': 'apiErrors.accessDenied',
  'email must be an email': 'apiErrors.invalidEmail',

  'Not request owner': 'apiErrors.accessDenied',
  'Access denied': 'apiErrors.accessDenied',
  'Not your offer': 'apiErrors.accessDenied',
  'Not a conversation member': 'apiErrors.accessDenied',
  'Not a company member': 'apiErrors.accessDenied',
  'Forbidden resource': 'apiErrors.accessDenied',
  'Only company owner can do this': 'apiErrors.ownerOnly',
  'Only company owner can reassign leads': 'apiErrors.ownerOnly',
  'Only company owner can edit automation': 'apiErrors.ownerOnly',
  'Only company owner can edit CRM stages': 'apiErrors.ownerOnly',

  'You already belong to another company': 'apiErrors.alreadyInCompany',
  'You already belong to a company': 'apiErrors.alreadyInCompany',
  'Company already exists for this user': 'apiErrors.alreadyInCompany',
  'This person is already in the company': 'apiErrors.alreadyMember',
  'Owner is already in the company': 'apiErrors.alreadyMember',
  'Cannot remove company owner': 'apiErrors.cannotRemoveOwner',
  'Assignee must be a company member': 'apiErrors.assigneeNotMember',
  'Only manager role can be invited': 'apiErrors.managerOnlyInvite',
  'Employee email is required': 'apiErrors.emailRequired',
  'Sign in with the invited email': 'apiErrors.inviteWrongEmail',
  'Invite expired': 'apiErrors.inviteExpired',
  'Invite already used': 'apiErrors.inviteUsed',

  'Request is not open for offers': 'apiErrors.requestClosed',
  'Offer is not pending': 'apiErrors.offerNotPending',
  'Lead already assigned to another manager': 'apiErrors.leadTaken',
  'Cannot review your own product': 'apiErrors.ownReview',
  'Insufficient balance': 'apiErrors.insufficientBalance',
  'Nothing to update': 'apiErrors.nothingToUpdate',
  'Message body is required': 'apiErrors.messageRequired',
  'Only image files are allowed': 'apiErrors.imagesOnly',
  'Image file is required': 'apiErrors.fileRequired',
  'File is required': 'apiErrors.fileRequired',
  'File exceeds 10 MB limit': 'apiErrors.fileTooLarge',
};

const PASSWORD_MIN = /^password must be longer than or equal to (\d+) characters$/;
const CYRILLIC = /[Ѐ-ӿ]/;

function statusKey(status: number): string {
  if (status === 400 || status === 422) return 'apiErrors.badRequest';
  if (status === 401) return 'apiErrors.unauthorized';
  if (status === 403) return 'apiErrors.accessDenied';
  if (status === 404) return 'apiErrors.notFound';
  if (status === 409) return 'apiErrors.conflict';
  if (status === 413) return 'apiErrors.fileTooLarge';
  if (status === 429) return 'apiErrors.tooManyRequests';
  if (status >= 500) return 'apiErrors.server';
  return 'common.error';
}

export function mapApiError(err: unknown, t: Translate): string {
  if (err instanceof ApiError) {
    if (err.message === 'network') return t('requests.networkError');
    if (err.message === 'timeout') return t('requests.timeoutError');
    // class-validator errors arrive as one string joined with ", "
    for (const part of [err.message, ...err.message.split(', ')]) {
      const key = MESSAGE_KEYS[part];
      if (key) return t(key);
      const min = part.match(PASSWORD_MIN);
      if (min) return t('apiErrors.passwordTooShort', { min: Number(min[1]) });
    }
    // Some API messages and all of the app's own messages are already localized.
    if (CYRILLIC.test(err.message)) return err.message;
    return t(statusKey(err.status));
  }
  if (err instanceof Error && /failed to fetch/i.test(err.message)) {
    return t('requests.networkError');
  }
  return err instanceof Error && err.message ? err.message : t('common.error');
}

export function isNoCompanyError(err: unknown) {
  if (!(err instanceof ApiError)) return false;
  return (
    err.status === 404 ||
    err.message === SUPPLIER_MEMBERSHIP ||
    err.message === COMPANY_NOT_FOUND
  );
}
