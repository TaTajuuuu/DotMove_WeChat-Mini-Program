const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toBeijingParts(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  const shifted = new Date(date.getTime() + BEIJING_OFFSET_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    millisecond: shifted.getUTCMilliseconds()
  };
}

function getBeijingNow() {
  return new Date();
}

function formatDateKey(input = new Date()) {
  const parts = toBeijingParts(input);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function formatMonthKey(input = new Date()) {
  const parts = toBeijingParts(input);
  return `${parts.year}-${pad2(parts.month)}`;
}

function assertDateKey(dateKey) {
  if (!DATE_KEY_RE.test(dateKey)) {
    throw new Error("dateKey must be YYYY-MM-DD.");
  }
}

function assertMonthKey(monthKey) {
  if (!MONTH_KEY_RE.test(monthKey)) {
    throw new Error("monthKey must be YYYY-MM.");
  }
}

function beijingDateToUtcDate(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second, millisecond));
}

function parseDateKeyStart(dateKey) {
  assertDateKey(dateKey);
  const [year, month, day] = dateKey.split("-").map(Number);
  return beijingDateToUtcDate(year, month, day);
}

function addDaysToDateKey(dateKey, offset) {
  const base = parseDateKeyStart(dateKey);
  return formatDateKey(new Date(base.getTime() + offset * 24 * 60 * 60 * 1000));
}

function getYesterdayDateKey(submitDateKey = formatDateKey()) {
  return addDaysToDateKey(submitDateKey, -1);
}

function getDayBeforeYesterdayDateKey(submitDateKey = formatDateKey()) {
  return addDaysToDateKey(submitDateKey, -2);
}

function isYesterdayOrDayBefore(sportDateKey, submitDateKey = formatDateKey()) {
  return sportDateKey === getYesterdayDateKey(submitDateKey) ||
    sportDateKey === getDayBeforeYesterdayDateKey(submitDateKey);
}

function getMonthLifecycle(monthKey) {
  assertMonthKey(monthKey);
  const [year, month] = monthKey.split("-").map(Number);
  const lifecycleStartAt = beijingDateToUtcDate(year, month, 1, 0, 0, 0, 0);
  const nextMonthStartAt = month === 12
    ? beijingDateToUtcDate(year + 1, 1, 1, 0, 0, 0, 0)
    : beijingDateToUtcDate(year, month + 1, 1, 0, 0, 0, 0);
  const lifecycleEndAt = new Date(nextMonthStartAt.getTime() - 1);

  return {
    monthKey,
    lifecycleStartAt,
    lifecycleEndAt
  };
}

function getCurrentMonthLifecycle(now = new Date()) {
  return getMonthLifecycle(formatMonthKey(now));
}

function getNextMonthLifecycle(now = new Date()) {
  const parts = toBeijingParts(now);
  const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
  const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
  return getMonthLifecycle(`${nextYear}-${pad2(nextMonth)}`);
}

function resolveGroupStatusByLifecycle(lifecycleStartAt, lifecycleEndAt, now = new Date()) {
  if (now.getTime() < new Date(lifecycleStartAt).getTime()) {
    return "upcoming";
  }
  if (now.getTime() > new Date(lifecycleEndAt).getTime()) {
    return "archived";
  }
  return "active";
}

module.exports = {
  BEIJING_OFFSET_MS,
  toBeijingParts,
  getBeijingNow,
  formatDateKey,
  formatMonthKey,
  parseDateKeyStart,
  addDaysToDateKey,
  getYesterdayDateKey,
  getDayBeforeYesterdayDateKey,
  isYesterdayOrDayBefore,
  getMonthLifecycle,
  getCurrentMonthLifecycle,
  getNextMonthLifecycle,
  resolveGroupStatusByLifecycle
};
