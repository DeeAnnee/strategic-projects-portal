export const DATE_ORDER_ERROR_MESSAGE = "Closure Date cannot be before Start Date.";

const toDateKey = (value?: string) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const directMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) {
    return directMatch[1];
  }

  const asDate = new Date(trimmed);
  if (Number.isNaN(asDate.getTime())) {
    return null;
  }

  return asDate.toISOString().slice(0, 10);
};

export const isEndBeforeStart = (startDate?: string, endDate?: string) => {
  const start = toDateKey(startDate);
  const end = toDateKey(endDate);
  if (!start || !end) {
    return false;
  }

  return end < start;
};
