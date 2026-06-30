const { formatMonthKey, getMonthLifecycle } = require("./date");

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

function isValidDate(value) {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime());
}

function inferMonthKey(group, now = new Date()) {
  if (MONTH_KEY_RE.test(String(group && group.monthKey || ""))) {
    return group.monthKey;
  }

  const candidates = [
    group && group.lifecycleStartAt,
    group && group.createdAt,
    now
  ];
  const source = candidates.find(isValidDate) || now;
  return formatMonthKey(source);
}

function buildLifecyclePatch(group, now = new Date()) {
  const monthKey = inferMonthKey(group, now);
  const lifecycle = getMonthLifecycle(monthKey);
  const patch = {};

  if (group.monthKey !== monthKey) {
    patch.monthKey = monthKey;
  }
  if (!isValidDate(group.lifecycleStartAt)) {
    patch.lifecycleStartAt = lifecycle.lifecycleStartAt;
  }
  if (!isValidDate(group.lifecycleEndAt)) {
    patch.lifecycleEndAt = lifecycle.lifecycleEndAt;
  }

  return patch;
}

async function ensureGroupLifecycle(db, group, now = new Date()) {
  if (!group || !group._id) return group;

  const patch = buildLifecyclePatch(group, now);
  if (Object.keys(patch).length === 0) {
    return group;
  }

  const updateData = {
    ...patch,
    updatedAt: now,
    updatedBy: "system:lifecycle-migration"
  };
  await db.collection("groups").doc(group._id).update({ data: updateData });
  Object.assign(group, updateData);
  return group;
}

module.exports = {
  inferMonthKey,
  buildLifecyclePatch,
  ensureGroupLifecycle
};
