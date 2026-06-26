const GroupStatus = {
  UPCOMING: "upcoming",
  ACTIVE: "active",
  ARCHIVED: "archived",
  DISSOLVED: "dissolved"
};

const MembershipStatus = {
  ACTIVE: "active",
  EXITED: "exited",
  REMOVED: "removed"
};

const TargetConfigStatus = {
  UNSET: "unset",
  SET: "set",
  LOCKED: "locked"
};

const CheckinRecordStatus = {
  VALID: "valid",
  EDITED: "edited",
  INVALIDATED: "invalidated"
};

module.exports = {
  GroupStatus,
  MembershipStatus,
  TargetConfigStatus,
  CheckinRecordStatus
};
