const READY_RE =
  /(собрал заявку|можно проверить|можно публиковать|заявканы жинадым|жариялауға болады)/i;

export function isReadyAssistantMessage(text: string) {
  return READY_RE.test(text);
}

export function shouldSkipAssistantReply(
  lastAssistantText: string | undefined,
  nextText: string,
  done: boolean,
) {
  if (!nextText.trim()) return true;
  if (!lastAssistantText) return false;
  if (lastAssistantText === nextText) return true;
  if (done && isReadyAssistantMessage(lastAssistantText) && isReadyAssistantMessage(nextText)) {
    return true;
  }
  return false;
}
