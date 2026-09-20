// Whether a staff member's permissions let them act on tickets in the
// given department. Shared by ticket routes so the scoping rule is
// defined in exactly one place.
function canAccessDepartment(staff, department) {
  return staff.allDepartments || staff.departments.includes(department);
}

module.exports = { canAccessDepartment };
