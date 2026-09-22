// Mirrors apps/frontend/src/utils/requestChat.ts so both clients treat the AI chat the same way.
const READY_RE = /(собрал заявку|можно проверить|можно публиковать|заявканы жинадым|жариялауға болады)/i;

export const READY_TEXT = 'Собрал заявку. Можно проверить и опубликовать.';

export function shouldSkipAssistantReply(
  lastAssistantText: string | undefined,
  nextText: string,
  done: boolean,
) {
  if (!nextText.trim()) return true;
  if (!lastAssistantText) return false;
  if (lastAssistantText === nextText) return true;
  return done && READY_RE.test(lastAssistantText) && READY_RE.test(nextText);
}
