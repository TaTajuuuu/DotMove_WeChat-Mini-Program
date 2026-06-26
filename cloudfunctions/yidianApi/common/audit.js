function createAuditDraft(actionType, fields = {}) {
  return {
    actionType,
    ...fields
  };
}

module.exports = {
  createAuditDraft
};
