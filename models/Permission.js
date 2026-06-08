const db = require("../config/database");

class Permission {
  static all() {
    return db.prepare(`
      SELECT id, code_permission, label, description, category, is_system
      FROM permissions
      ORDER BY category, code_permission
    `).all();
  }

  static configurableRoles() {
    return db.prepare(`
      SELECT DISTINCT code_role, label
      FROM roles
      WHERE code_role <> 'admin'
      ORDER BY label
    `).all();
  }

  static matrix() {
    const permissions = this.all();
    const roles = this.configurableRoles();
    const rolePermissions = db.prepare(`
      SELECT
        rp.role,
        p.code_permission,
        rp.allowed,
        rp.locked,
        rp.source
      FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role <> 'admin'
    `).all();
    const rolePermissionIndex = rolePermissions.reduce((index, entry) => {
      index[`${entry.role}:${entry.code_permission}`] = entry;
      return index;
    }, {});

    return {
      permissions,
      roles,
      rolePermissionIndex
    };
  }

  static updateRoleMatrix(input, actorUserId = null) {
    const validRoles = new Set(this.configurableRoles().map((role) => role.code_role));
    const submittedRoles = new Set(Array.isArray(input?.roles) ? input.roles : []);
    const roles = [...submittedRoles].filter((role) => validRoles.has(role));
    const matrix = input?.matrix || {};
    const configurablePermissions = db.prepare(`
      SELECT id, code_permission
      FROM permissions
      WHERE is_system = 0
    `).all();
    const permissionByCode = configurablePermissions.reduce((index, permission) => {
      index[permission.code_permission] = permission;
      return index;
    }, {});
    const removePermission = db.prepare(`
      DELETE FROM role_permissions
      WHERE role = ?
        AND permission_id = ?
        AND locked = 0
    `);
    const upsertPermission = db.prepare(`
      INSERT INTO role_permissions (
        role, permission_id, allowed, locked, source
      ) VALUES (
        @role, @permission_id, 1, 0, 'admin'
      )
      ON CONFLICT(role, permission_id) DO UPDATE SET
        allowed = 1,
        locked = 0,
        source = 'admin',
        updated_at = CURRENT_TIMESTAMP
      WHERE role_permissions.locked = 0
    `);

    return db.transaction(() => {
      let changes = 0;
      roles.forEach((role) => {
        configurablePermissions.forEach((permission) => {
          const enabled = Boolean(matrix?.[role]?.[permission.code_permission]);
          if (enabled) {
            changes += upsertPermission.run({
              role,
              permission_id: permission.id
            }).changes;
          } else {
            changes += removePermission.run(role, permission.id).changes;
          }
        });
      });

      return {
        changes,
        actorUserId,
        roles: roles.length,
        permissions: Object.keys(permissionByCode).length
      };
    })();
  }

  static rolePermissions(role) {
    return db.prepare(`
      SELECT
        p.code_permission,
        rp.allowed,
        rp.locked,
        rp.source
      FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role = ?
    `).all(role);
  }

  static userOverrides(userId) {
    return db.prepare(`
      SELECT
        p.code_permission,
        upo.allowed
      FROM user_permission_overrides upo
      JOIN permissions p ON p.id = upo.permission_id
      WHERE upo.user_id = ?
    `).all(userId);
  }
}

module.exports = Permission;
