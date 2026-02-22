const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const MULTI_SPACE_REGEX = /[ \t]{2,}/g;

export const sanitizePlainText = (value: string, maxLength = 6000): string =>
  value
    .replace(CONTROL_CHAR_REGEX, "")
    .replace(MULTI_SPACE_REGEX, " ")
    .trim()
    .slice(0, maxLength);

export const sanitizeContext = (context: unknown, maxLength = 8000): string => {
  if (context === undefined || context === null) {
    return "";
  }

  if (typeof context === "string") {
    return sanitizePlainText(context, maxLength);
  }

  try {
    const serialized = JSON.stringify(context);
    return sanitizePlainText(serialized, maxLength);
  } catch {
    return "";
  }
};

const PROMPT_INJECTION_SIGNALS = [
  "ignore previous instructions",
  "reveal system prompt",
  "show hidden instructions",
  "developer message",
  "bypass safety",
  "disable safety",
  "exfiltrate",
  "list secrets",
  "print env"
];

export const hasPromptInjectionSignal = (value: string): boolean => {
  const normalized = value.toLowerCase();
  return PROMPT_INJECTION_SIGNALS.some((signal) => normalized.includes(signal));
};
