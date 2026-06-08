const Permission = require("../models/Permission");

function resolveUserPermissions(user) {
  if (!user) {
    return new Set();
  }

  const permissions = new Set();

  Permission.rolePermissions(user.role).forEach((entry) => {
    if (entry.allowed) {
      permissions.add(entry.code_permission);
    } else {
      permissions.delete(entry.code_permission);
    }
  });

  Permission.userOverrides(user.id).forEach((entry) => {
    if (entry.allowed) {
      permissions.add(entry.code_permission);
    } else {
      permissions.delete(entry.code_permission);
    }
  });

  return permissions;
}

function hasPermission(user, permissionCode) {
  return resolveUserPermissions(user).has(permissionCode);
}

module.exports = {
  hasPermission,
  resolveUserPermissions
};
