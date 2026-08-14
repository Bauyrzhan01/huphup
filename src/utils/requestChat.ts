const READY_RE =
  /(собрал заявку|можно проверить|можно публиковать|заявканы жинадым|жариялауға болады)/i;

const CONFIRM_RE =
  /^(сделай(те)?|да|ок|ok|yes|иә|жарайды|жарияла(у)?|опублик(овать|уй)?|publish)$/i;

export function isConfirmReply(text: string) {
  return CONFIRM_RE.test(text.trim());
}

export function isReadyAssistantMessage(text: string) {
  return READY_RE.test(text);
}

export function shouldSkipAssistantReply(
  lastAssistantText: string | undefined,
  nextText: string,
  done: boolean,
) {
  if (!lastAssistantText) return false;
  if (lastAssistantText === nextText) return true;
  if (done && isReadyAssistantMessage(lastAssistantText) && isReadyAssistantMessage(nextText)) {
    return true;
  }
  return false;
}
