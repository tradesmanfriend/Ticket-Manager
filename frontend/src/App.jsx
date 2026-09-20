import React, { useState, useEffect, useMemo } from "react";
import {
  Wrench,
  AlertTriangle,
  Plus,
  X,
  Search,
  Clock,
  CheckCircle2,
  Circle,
  Trash2,
  Home,
  ChevronRight,
  ClipboardList,
  DollarSign,
  CalendarDays,
  User,
  Settings,
  Copy,
  Download,
  LogOut,
  ArrowLeft,
  Building2,
  Users,
} from "lucide-react";
import { api, saveSession, loadSession, clearSession, updateStoredStaff } from "./api.js";

// ---------------------------------------------------------------------------
// Constants + helpers
// ---------------------------------------------------------------------------

const STAGES = [
  { key: "reported", label: "Reported" },
  { key: "assessed", label: "Assessed" },
  { key: "quoted", label: "Quote received" },
  { key: "scheduled", label: "Scheduled" },
  { key: "completed", label: "Completed" },
];

const SEVERITY = {
  low: { label: "Low", weight: 1 },
  medium: { label: "Medium", weight: 2 },
  high: { label: "High", weight: 3 },
};

// Presets used only to pre-fill the permission checkboxes when adding or
// re-labeling a staff member — every checkbox stays individually editable
// afterward, so this is a starting point, not an enforced tier.
const ROLE_PRESETS = {
  admin: { canCreate: true, canEditStatus: true, canEditFinancials: true, canDelete: true, canManageProperty: true, allDepartments: true },
  manager: { canCreate: true, canEditStatus: true, canEditFinancials: true, canDelete: true, canManageProperty: false, allDepartments: true },
  staff: { canCreate: true, canEditStatus: true, canEditFinancials: false, canDelete: false, canManageProperty: false, allDepartments: false },
  viewer: { canCreate: false, canEditStatus: false, canEditFinancials: false, canDelete: false, canManageProperty: false, allDepartments: true },
};

const DAY_MS = 86400000;

function daysOpen(reportedAt, until) {
  return Math.max(0, Math.floor(((until || Date.now()) - reportedAt) / DAY_MS));
}
function tier(t) {
  return t.hazard ? "hazard" : t.severity;
}
function priorityScore(t) {
  const severityWeight = SEVERITY[t.severity]?.weight || 1;
  const hazardBonus = t.hazard ? 1000 : 0;
  return hazardBonus + severityWeight * 100 + daysOpen(t.reportedAt);
}
function fmtDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function ticketNo(id) {
  return "#" + String(id).slice(-4).toUpperCase();
}
function csvEscape(val) {
  const s = String(val ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function visibleDepartmentNames(staff, departments) {
  if (!staff) return [];
  return staff.allDepartments ? departments.map((d) => d.name) : staff.departments;
}

// ---------------------------------------------------------------------------
// Shared UI atoms
// ---------------------------------------------------------------------------

function TierTag({ t }) {
  const which = tier(t);
  const label = t.hazard ? "Hazard" : SEVERITY[t.severity]?.label || "Low";
  return (
    <span className={`tier-tag tier-${which}`}>
      {t.hazard && <AlertTriangle size={11} strokeWidth={2.5} />}
      {label}
    </span>
  );
}
function StageChip({ stage }) {
  const s = STAGES[stage];
  return <span className={`stage-chip stage-${s.key}`}>{s.label}</span>;
}

function TicketCard({ t, onOpen }) {
  const which = tier(t);
  const age = daysOpen(t.reportedAt, t.completedAt);
  return (
    <button className={`tag-card tier-edge-${which}`} onClick={() => onOpen(t.id)}>
      <span className="tag-hole" />
      <div className="tag-card-top">
        <span className="tag-no">{ticketNo(t.id)}</span>
        <span className="tag-unit">
          <Home size={12} strokeWidth={2.5} /> Unit {t.unit}
        </span>
      </div>
      <div className="tag-title">{t.title}</div>
      <div className="tag-meta">
        <TierTag t={t} />
        <span className="tag-cat">{t.department}</span>
        <span className="tag-age">
          <Clock size={11} /> {age === 0 ? "today" : `${age}d open`}
        </span>
      </div>
      <div className="tag-bottom">
        <StageChip stage={t.stage} />
        <ChevronRight size={16} className="tag-chevron" />
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Onboarding / login
// ---------------------------------------------------------------------------

function OnboardingScreen({ onComplete }) {
  const [mode, setMode] = useState("choose"); // choose | create | login
  const [propertyName, setPropertyName] = useState("");
  const [cUsername, setCUsername] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cDisplayName, setCDisplayName] = useState("");
  const [lSlug, setLSlug] = useState("");
  const [lUsername, setLUsername] = useState("");
  const [lPassword, setLPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function finish(res) {
    saveSession(res.token, res.property, res.staff);
    onComplete({ property: res.property, staff: res.staff });
  }

  async function submitCreate() {
    if (!propertyName.trim() || !cUsername.trim() || cPassword.length < 6 || !cDisplayName.trim()) {
      setError("Fill in every field — your password needs at least 6 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api.createProperty(propertyName.trim(), cUsername.trim(), cPassword, cDisplayName.trim());
      finish(res);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function submitLogin() {
    if (!lSlug.trim() || !lUsername.trim() || !lPassword) {
      setError("Enter the property code, your username, and your password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api.login(lSlug.trim().toLowerCase(), lUsername.trim(), lPassword);
      finish(res);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="onboarding-screen">
      <div className="onboarding-card">
        <div className="onboarding-brand">
          <Wrench size={22} strokeWidth={2.2} />
          <span className="cond onboarding-brand-text">Work Order Board</span>
        </div>

        {mode === "choose" && (
          <>
            <p className="onboarding-lede">Set up a new property, or log in to your account on one that's already running.</p>
            <button className="choice-card" onClick={() => setMode("create")}>
              <Building2 size={18} />
              <span>
                <strong>Set up a new property</strong>
                <small>You'll become its first admin account</small>
              </span>
              <ChevronRight size={16} className="tag-chevron" />
            </button>
            <button className="choice-card" onClick={() => setMode("login")}>
              <User size={18} />
              <span>
                <strong>Log in</strong>
                <small>Use the account an admin set up for you</small>
              </span>
              <ChevronRight size={16} className="tag-chevron" />
            </button>
          </>
        )}

        {mode === "create" && (
          <>
            <button className="text-btn" style={{ marginBottom: 10 }} onClick={() => { setMode("choose"); setError(""); }}>
              <ArrowLeft size={13} style={{ verticalAlign: -2, marginRight: 3 }} /> Back
            </button>
            <label className="field">
              <span>Property name</span>
              <input value={propertyName} onChange={(e) => setPropertyName(e.target.value)} placeholder="e.g. Ridgeline Apartments" />
            </label>
            <label className="field" style={{ marginTop: 10 }}>
              <span>Choose a username</span>
              <input value={cUsername} onChange={(e) => setCUsername(e.target.value)} placeholder="e.g. jordan" />
            </label>
            <label className="field" style={{ marginTop: 10 }}>
              <span>Choose a password</span>
              <input type="password" value={cPassword} onChange={(e) => setCPassword(e.target.value)} placeholder="6+ characters" />
            </label>
            <label className="field" style={{ marginTop: 10 }}>
              <span>Your name</span>
              <input value={cDisplayName} onChange={(e) => setCDisplayName(e.target.value)} placeholder="For the ticket log" />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="btn-primary" style={{ marginTop: 14 }} disabled={busy} onClick={submitCreate}>
              {busy ? "Setting up…" : "Create the board"}
            </button>
          </>
        )}

        {mode === "login" && (
          <>
            <button className="text-btn" style={{ marginBottom: 10 }} onClick={() => { setMode("choose"); setError(""); }}>
              <ArrowLeft size={13} style={{ verticalAlign: -2, marginRight: 3 }} /> Back
            </button>
            <label className="field">
              <span>Property code</span>
              <input value={lSlug} onChange={(e) => setLSlug(e.target.value)} placeholder="Given to you by your manager" />
            </label>
            <label className="field" style={{ marginTop: 10 }}>
              <span>Username</span>
              <input value={lUsername} onChange={(e) => setLUsername(e.target.value)} />
            </label>
            <label className="field" style={{ marginTop: 10 }}>
              <span>Password</span>
              <input type="password" value={lPassword} onChange={(e) => setLPassword(e.target.value)} />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="btn-primary" style={{ marginTop: 14 }} disabled={busy} onClick={submitLogin}>
              {busy ? "Checking…" : "Log in"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team & departments management
// ---------------------------------------------------------------------------

function AddStaffForm({ departments, onCancel, onCreated }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("staff");
  const [allDepartments, setAllDepartments] = useState(false);
  const [depts, setDepts] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function applyRole(r) {
    setRole(r);
    setAllDepartments(ROLE_PRESETS[r].allDepartments);
  }
  function toggleDept(name) {
    setDepts((d) => (d.includes(name) ? d.filter((x) => x !== name) : [...d, name]));
  }

  async function submit() {
    if (!username.trim() || password.length < 6 || !displayName.trim()) {
      setError("Username, a password of 6+ characters, and a name are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const preset = ROLE_PRESETS[role];
      await api.createStaff({
        username: username.trim(),
        password,
        displayName: displayName.trim(),
        role,
        allDepartments,
        departments: depts,
        canCreate: preset.canCreate,
        canEditStatus: preset.canEditStatus,
        canEditFinancials: preset.canEditFinancials,
        canDelete: preset.canDelete,
        canManageProperty: preset.canManageProperty,
      });
      onCreated();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="add-staff-form">
      <label className="field">
        <span>Username</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} />
      </label>
      <label className="field">
        <span>Temporary password</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6+ characters" />
      </label>
      <label className="field">
        <span>Name</span>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label className="field">
        <span>Role</span>
        <select value={role} onChange={(e) => applyRole(e.target.value)}>
          <option value="admin">Admin — full access</option>
          <option value="manager">Manager — all departments, no team management</option>
          <option value="staff">Staff — assigned departments only</option>
          <option value="viewer">Viewer — read only</option>
        </select>
      </label>
      {!allDepartments && (
        <div>
          <span className="section-label" style={{ marginBottom: 4 }}>Departments</span>
          <div className="chip-row">
            {departments.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`dept-chip selectable ${depts.includes(d.name) ? "active" : ""}`}
                onClick={() => toggleDept(d.name)}
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn-secondary" style={{ flex: 1, justifyContent: "center", display: "flex" }} onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary" style={{ flex: 1 }} disabled={busy} onClick={submit}>
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}

function StaffRow({ staff, departments, expanded, onToggle, onChanged, onError }) {
  const [form, setForm] = useState(staff);
  const [busy, setBusy] = useState(false);
  const [showResetPw, setShowResetPw] = useState(false);
  const [newPw, setNewPw] = useState("");

  useEffect(() => {
    setForm(staff);
  }, [staff]);

  function applyRole(role) {
    setForm((f) => ({ ...f, role, ...ROLE_PRESETS[role] }));
  }
  function toggleDept(name) {
    setForm((f) => {
      const has = f.departments.includes(name);
      return { ...f, departments: has ? f.departments.filter((d) => d !== name) : [...f.departments, name] };
    });
  }

  async function save() {
    setBusy(true);
    try {
      await api.updateStaff(staff.id, {
        displayName: form.displayName,
        role: form.role,
        allDepartments: form.allDepartments,
        departments: form.departments,
        canCreate: form.canCreate,
        canEditStatus: form.canEditStatus,
        canEditFinancials: form.canEditFinancials,
        canDelete: form.canDelete,
        canManageProperty: form.canManageProperty,
      });
      onChanged();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    setBusy(true);
    try {
      await api.updateStaff(staff.id, { active: !staff.active });
      onChanged();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (newPw.length < 6) {
      onError("New password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      await api.resetStaffPassword(staff.id, newPw);
      setShowResetPw(false);
      setNewPw("");
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.removeStaff(staff.id);
      onChanged();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="staff-row">
      <button className="staff-row-head" onClick={onToggle}>
        <span>
          <strong>{staff.displayName}</strong>
          <small>
            @{staff.username} · {staff.role}
            {!staff.active ? " · inactive" : ""}
          </small>
        </span>
        <ChevronRight size={16} className={`tag-chevron ${expanded ? "rotated" : ""}`} />
      </button>
      {expanded && (
        <div className="staff-row-body">
          <label className="field">
            <span>Name</span>
            <input value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
          </label>

          <label className="field">
            <span>Role preset</span>
            <select value={form.role} onChange={(e) => applyRole(e.target.value)}>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>

          <label className="checkbox-row">
            <input type="checkbox" checked={form.allDepartments} onChange={(e) => setForm((f) => ({ ...f, allDepartments: e.target.checked }))} />
            All departments
          </label>
          {!form.allDepartments && (
            <div className="chip-row">
              {departments.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`dept-chip selectable ${form.departments.includes(d.name) ? "active" : ""}`}
                  onClick={() => toggleDept(d.name)}
                >
                  {d.name}
                </button>
              ))}
            </div>
          )}

          <label className="checkbox-row">
            <input type="checkbox" checked={form.canCreate} onChange={(e) => setForm((f) => ({ ...f, canCreate: e.target.checked }))} />
            Can create tickets
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.canEditStatus} onChange={(e) => setForm((f) => ({ ...f, canEditStatus: e.target.checked }))} />
            Can update status, vendor, and notes
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.canEditFinancials} onChange={(e) => setForm((f) => ({ ...f, canEditFinancials: e.target.checked }))} />
            Can edit quote amounts
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.canDelete} onChange={(e) => setForm((f) => ({ ...f, canDelete: e.target.checked }))} />
            Can delete tickets
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.canManageProperty} onChange={(e) => setForm((f) => ({ ...f, canManageProperty: e.target.checked }))} />
            Can manage team, departments, and property name
          </label>

          <button className="btn-primary" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save changes"}
          </button>

          <div className="staff-row-actions">
            <button className="text-btn" onClick={() => setShowResetPw(!showResetPw)}>
              Reset password
            </button>
            <button className="text-btn" onClick={toggleActive} disabled={busy}>
              {staff.active ? "Deactivate" : "Reactivate"}
            </button>
            <button className="text-btn danger" onClick={remove} disabled={busy}>
              Remove
            </button>
          </div>
          {showResetPw && (
            <div className="note-add">
              <input type="password" placeholder="New password (6+ characters)" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
              <button className="btn-secondary" onClick={resetPassword}>
                Set
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TeamSheet({ departments, onDepartmentsChanged, onClose }) {
  const [staffList, setStaffList] = useState(null);
  const [error, setError] = useState("");
  const [newDeptName, setNewDeptName] = useState("");
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadStaff() {
    try {
      setStaffList(await api.getStaff());
    } catch (e) {
      setError(e.message);
    }
  }

  async function addDepartment() {
    const name = newDeptName.trim();
    if (!name) return;
    try {
      await api.createDepartment(name);
      setNewDeptName("");
      onDepartmentsChanged();
    } catch (e) {
      setError(e.message);
    }
  }
  async function removeDepartment(id) {
    try {
      await api.deleteDepartment(id);
      onDepartmentsChanged();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet sheet-tall" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <span className="sheet-title">Team &amp; departments</span>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="sheet-body">
          {error && <div className="form-error">{error}</div>}

          <div>
            <span className="section-label">Departments</span>
            <div className="chip-row">
              {departments.map((d) => (
                <span className="dept-chip" key={d.id}>
                  {d.name}
                  <button onClick={() => removeDepartment(d.id)} aria-label={`Remove ${d.name}`}>
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
            <div className="note-add" style={{ marginTop: 8 }}>
              <input
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="Add a department"
                onKeyDown={(e) => e.key === "Enter" && addDepartment()}
              />
              <button className="btn-secondary" onClick={addDepartment}>
                Add
              </button>
            </div>
          </div>

          <div className="settings-divider" />

          <div>
            <span className="section-label">Staff</span>
            {staffList === null ? (
              <div className="empty-state" style={{ padding: 12 }}>Loading…</div>
            ) : (
              <div className="staff-list">
                {staffList.map((s) => (
                  <StaffRow
                    key={s.id}
                    staff={s}
                    departments={departments}
                    expanded={expandedId === s.id}
                    onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
                    onChanged={loadStaff}
                    onError={setError}
                  />
                ))}
              </div>
            )}
          </div>

          {!showAddStaff ? (
            <button className="btn-secondary" style={{ width: "100%", justifyContent: "center", display: "flex" }} onClick={() => setShowAddStaff(true)}>
              <Plus size={14} style={{ marginRight: 6 }} /> Add staff member
            </button>
          ) : (
            <AddStaffForm
              departments={departments}
              onCancel={() => setShowAddStaff(false)}
              onCreated={() => {
                setShowAddStaff(false);
                loadStaff();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings sheet
// ---------------------------------------------------------------------------

function SettingsSheet({ property, staff, tickets, departments, onDepartmentsChanged, onClose, onRenamed, onStaffUpdated, onSwitch }) {
  const [name, setName] = useState(property.name);
  const [renameError, setRenameError] = useState("");
  const [myName, setMyName] = useState(staff.displayName);
  const [copied, setCopied] = useState(false);
  const [confirmingSwitch, setConfirmingSwitch] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [showTeam, setShowTeam] = useState(false);

  async function saveName() {
    if (!name.trim() || name.trim() === property.name) return;
    try {
      await api.renameProperty(name.trim());
      setRenameError("");
      onRenamed(name.trim());
    } catch (e) {
      setRenameError(e.message);
    }
  }

  async function saveMyName() {
    const trimmed = myName.trim();
    if (!trimmed || trimmed === staff.displayName) return;
    try {
      const updated = await api.updateMe(trimmed);
      onStaffUpdated(updated);
    } catch (e) {
      // leave the field as typed; a top-level banner isn't wired here, so
      // just revert visually on failure
      setMyName(staff.displayName);
    }
  }

  async function submitPasswordChange() {
    if (newPw.length < 6) {
      setPwError("New password must be at least 6 characters.");
      return;
    }
    setPwBusy(true);
    setPwError("");
    try {
      await api.changeMyPassword(currentPw, newPw);
      setPwSuccess(true);
      setCurrentPw("");
      setNewPw("");
      setTimeout(() => {
        setPwOpen(false);
        setPwSuccess(false);
      }, 1200);
    } catch (e) {
      setPwError(e.message);
    } finally {
      setPwBusy(false);
    }
  }

  function copyCode() {
    try {
      navigator.clipboard.writeText(property.slug);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // clipboard unavailable — ignore
    }
  }

  function exportCsv() {
    const cols = [
      "Ticket", "Unit", "Department", "Title", "Description", "Severity", "Hazard", "Stage",
      "Vendor", "Quote amount", "Scheduled date", "Reported at", "Completed at", "Created by", "Log",
    ];
    const rows = tickets.map((t) => [
      ticketNo(t.id), t.unit, t.department, t.title, t.description,
      SEVERITY[t.severity]?.label || t.severity, t.hazard ? "Yes" : "No", STAGES[t.stage]?.label || "",
      t.vendor, t.quoteAmount, t.scheduledDate,
      t.reportedAt ? new Date(t.reportedAt).toISOString() : "",
      t.completedAt ? new Date(t.completedAt).toISOString() : "",
      t.createdBy || "",
      (t.notes || []).map((n) => `[${fmtDateTime(n.ts)}${n.by ? " " + n.by : ""}] ${n.text}`).join(" | "),
    ]);
    const csv = [cols, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${property.slug}-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <span className="sheet-title">Settings</span>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="sheet-body">
          <div>
            <span className="section-label">My account</span>
            <label className="field">
              <span>Name</span>
              <input value={myName} onChange={(e) => setMyName(e.target.value)} onBlur={saveMyName} />
            </label>
            <div className="account-meta">@{staff.username} · {staff.role}</div>
            {!pwOpen ? (
              <button className="text-btn" onClick={() => setPwOpen(true)}>
                Change my password
              </button>
            ) : (
              <div className="field" style={{ gap: 8, marginTop: 8 }}>
                <input type="password" placeholder="Current password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
                <input type="password" placeholder="New password (6+ characters)" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                {pwError && <div className="form-error">{pwError}</div>}
                {pwSuccess && <div className="form-success">Password updated.</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-secondary" style={{ flex: 1, justifyContent: "center", display: "flex" }} onClick={() => setPwOpen(false)}>
                    Cancel
                  </button>
                  <button className="btn-primary" style={{ flex: 1 }} disabled={pwBusy} onClick={submitPasswordChange}>
                    {pwBusy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="settings-divider" />

          <label className="field">
            <span>Property name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} disabled={!staff.canManageProperty} />
          </label>
          {renameError && <div className="form-error">{renameError}</div>}

          <div className="field">
            <span>Property code — share this so teammates can log in</span>
            <div className="copy-row">
              <span className="mono code-display">{property.slug}</span>
              <button className="btn-secondary" onClick={copyCode}>
                <Copy size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {staff.canManageProperty && (
            <button className="btn-secondary" style={{ width: "100%", justifyContent: "center", display: "flex" }} onClick={() => setShowTeam(true)}>
              <Users size={14} style={{ marginRight: 6 }} />
              Manage team &amp; departments
            </button>
          )}

          <button className="btn-secondary" style={{ width: "100%", justifyContent: "center", display: "flex" }} onClick={exportCsv}>
            <Download size={14} style={{ marginRight: 6 }} />
            Export all tickets as CSV
          </button>

          <div className="settings-divider" />

          {confirmingSwitch ? (
            <div className="switch-confirm">
              <p>Log out of this account? You can log back in any time with your username and password.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-secondary" onClick={() => setConfirmingSwitch(false)} style={{ flex: 1, justifyContent: "center", display: "flex" }}>
                  Cancel
                </button>
                <button className="btn-danger" onClick={onSwitch} style={{ flex: 1 }}>
                  Log out
                </button>
              </div>
            </div>
          ) : (
            <button className="text-btn danger" onClick={() => setConfirmingSwitch(true)}>
              <LogOut size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              Log out
            </button>
          )}
        </div>
      </div>

      {showTeam && <TeamSheet departments={departments} onDepartmentsChanged={onDepartmentsChanged} onClose={() => setShowTeam(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New ticket sheet
// ---------------------------------------------------------------------------

function NewTicketSheet({ staff, departments, onClose, onCreated }) {
  const availableDepts = visibleDepartmentNames(staff, departments);
  const [unit, setUnit] = useState("");
  const [department, setDepartment] = useState(availableDepts[0] || "");
  const [severity, setSeverity] = useState("medium");
  const [hazard, setHazard] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (availableDepts.length === 0) {
    return (
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-header">
            <span className="sheet-title">New ticket</span>
            <button className="icon-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          <div className="sheet-body">
            <div className="empty-state">You haven't been assigned to any departments yet. Ask your property admin to update your account in Settings.</div>
          </div>
        </div>
      </div>
    );
  }

  async function submit() {
    if (!unit.trim() || !title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const ticket = await api.createTicket({
        unit: unit.trim(),
        department,
        title: title.trim(),
        description: description.trim(),
        severity,
        hazard,
      });
      onCreated(ticket);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <span className="sheet-title">New ticket</span>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="sheet-body">
          <label className="field">
            <span>Unit</span>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. 214" inputMode="numeric" />
          </label>
          <label className="field">
            <span>What's the issue?</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" />
          </label>
          <label className="field">
            <span>Details</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What the resident reported, anything noticed on the call"
              rows={3}
            />
          </label>
          <label className="field">
            <span>Department</span>
            <select value={department} onChange={(e) => setDepartment(e.target.value)}>
              {availableDepts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Severity</span>
            <div className="seg">
              {Object.entries(SEVERITY).map(([key, v]) => (
                <button key={key} type="button" className={`seg-btn ${severity === key ? "active" : ""}`} onClick={() => setSeverity(key)}>
                  {v.label}
                </button>
              ))}
            </div>
          </label>
          <button type="button" className={`hazard-toggle ${hazard ? "active" : ""}`} onClick={() => setHazard(!hazard)}>
            <span className="hazard-toggle-box">{hazard && <AlertTriangle size={13} strokeWidth={3} />}</span>
            <span className="hazard-toggle-text">
              <strong>Safety hazard</strong>
              <small>Gas, fire, flooding, electrical, no heat/AC in extreme weather</small>
            </span>
          </button>
          {error && <div className="form-error">{error}</div>}
        </div>
        <div className="sheet-footer">
          <button className="btn-primary" disabled={!unit.trim() || !title.trim() || busy} onClick={submit}>
            {busy ? "Creating…" : "Create ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticket detail sheet
// ---------------------------------------------------------------------------

function TicketDetailSheet({ ticket, unitHistory, staff, onClose, onUpdated, onDeleted, onError }) {
  const [noteText, setNoteText] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [vendor, setVendor] = useState(ticket.vendor);
  const [quoteAmount, setQuoteAmount] = useState(ticket.quoteAmount);
  const [savingStage, setSavingStage] = useState(false);

  useEffect(() => {
    setVendor(ticket.vendor);
    setQuoteAmount(ticket.quoteAmount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  async function patch(body) {
    try {
      const updated = await api.patchTicket(ticket.id, body);
      onUpdated(updated);
      return updated;
    } catch (e) {
      onError(e.message);
      return null;
    }
  }

  async function setStage(idx) {
    if (idx === ticket.stage || savingStage || !staff.canEditStatus) return;
    setSavingStage(true);
    const body = { stage: idx, note: { text: `Status changed to ${STAGES[idx].label}.` } };
    if (idx === 4) body.completedAt = Date.now();
    if (idx < 4 && ticket.completedAt) body.completedAt = null;
    await patch(body);
    setSavingStage(false);
  }

  async function addNote() {
    const text = noteText.trim();
    if (!text || !staff.canEditStatus) return;
    const updated = await patch({ note: { text } });
    if (updated) setNoteText("");
  }

  function saveVendor() {
    if (staff.canEditStatus && vendor !== ticket.vendor) patch({ vendor });
  }
  function saveQuote() {
    if (staff.canEditFinancials && quoteAmount !== ticket.quoteAmount) patch({ quoteAmount });
  }
  function onScheduledDateChange(e) {
    if (staff.canEditStatus) patch({ scheduledDate: e.target.value });
  }

  async function handleDelete() {
    try {
      await api.deleteTicket(ticket.id);
      onDeleted(ticket.id);
    } catch (e) {
      onError(e.message);
    }
  }

  const which = tier(ticket);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet sheet-tall" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <span className="sheet-title">
            {ticketNo(ticket.id)} · Unit {ticket.unit}
          </span>
          <div className="sheet-header-actions">
            {staff.canDelete &&
              (confirmingDelete ? (
                <>
                  <button className="text-btn danger" onClick={handleDelete}>
                    Delete for good
                  </button>
                  <button className="text-btn" onClick={() => setConfirmingDelete(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button className="icon-btn" onClick={() => setConfirmingDelete(true)} aria-label="Delete ticket">
                  <Trash2 size={17} />
                </button>
              ))}
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="sheet-body">
          <div className={`detail-edge tier-edge-${which}`}>
            <div className="detail-title-row">
              <TierTag t={ticket} />
              <span className="tag-cat">{ticket.department}</span>
            </div>
            <h3 className="detail-title">{ticket.title}</h3>
            {ticket.description && <p className="detail-desc">{ticket.description}</p>}
            <div className="detail-sub">
              Reported {fmtDate(ticket.reportedAt)}
              {ticket.createdBy ? ` by ${ticket.createdBy}` : ""} · {daysOpen(ticket.reportedAt, ticket.completedAt)}d
              {ticket.completedAt ? " total" : " open"}
            </div>
          </div>

          <div className="stepper">
            {STAGES.map((s, idx) => (
              <React.Fragment key={s.key}>
                <button className="stepper-node" onClick={() => setStage(idx)} type="button" disabled={savingStage || !staff.canEditStatus}>
                  <span className={`stepper-dot ${idx <= ticket.stage ? "done" : ""}`}>
                    {idx <= ticket.stage ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </span>
                  <span className={`stepper-label ${idx === ticket.stage ? "current" : ""}`}>{s.label}</span>
                </button>
                {idx < STAGES.length - 1 && <span className={`stepper-line ${idx < ticket.stage ? "done" : ""}`} />}
              </React.Fragment>
            ))}
          </div>

          <div className="field-row">
            <label className="field">
              <span>
                <User size={12} /> Vendor / assigned to
              </span>
              <input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                onBlur={saveVendor}
                placeholder="In-house or vendor name"
                disabled={!staff.canEditStatus}
              />
            </label>
            <label className="field">
              <span>
                <DollarSign size={12} /> Quote amount
              </span>
              <input
                value={quoteAmount}
                onChange={(e) => setQuoteAmount(e.target.value)}
                onBlur={saveQuote}
                placeholder="e.g. 285"
                inputMode="decimal"
                disabled={!staff.canEditFinancials}
              />
            </label>
          </div>
          <label className="field">
            <span>
              <CalendarDays size={12} /> Scheduled date
            </span>
            <input type="date" defaultValue={ticket.scheduledDate} onChange={onScheduledDateChange} disabled={!staff.canEditStatus} />
          </label>

          <div className="notes-section">
            <span className="section-label">Log</span>
            <div className="notes-list">
              {ticket.notes
                .slice()
                .reverse()
                .map((n) => (
                  <div className="note" key={n.id}>
                    <span className="note-ts">
                      {fmtDateTime(n.ts)}
                      {n.by ? ` · ${n.by}` : ""}
                    </span>
                    <span className="note-text">{n.text}</span>
                  </div>
                ))}
            </div>
            {staff.canEditStatus && (
              <div className="note-add">
                <input
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add a note — what you found, who you called…"
                  onKeyDown={(e) => e.key === "Enter" && addNote()}
                />
                <button className="btn-secondary" onClick={addNote}>
                  Add
                </button>
              </div>
            )}
          </div>

          {unitHistory.length > 0 && (
            <div className="unit-history">
              <span className="section-label">
                Unit {ticket.unit} history ({unitHistory.length})
              </span>
              {unitHistory.map((h) => (
                <div className="history-row" key={h.id}>
                  <CheckCircle2 size={14} className="history-check" />
                  <div>
                    <div className="history-title">{h.title}</div>
                    <div className="history-sub">
                      {h.department} · closed {fmtDate(h.completedAt)}
                      {h.vendor ? ` · ${h.vendor}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UnitsView({ tickets, onSelectUnit }) {
  const units = useMemo(() => {
    const map = new Map();
    for (const t of tickets) {
      if (!map.has(t.unit)) map.set(t.unit, { unit: t.unit, open: 0, done: 0 });
      const rec = map.get(t.unit);
      if (t.stage === 4) rec.done += 1;
      else rec.open += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.open - a.open || a.unit.localeCompare(b.unit));
  }, [tickets]);

  if (units.length === 0) return <div className="empty-state">No units yet. Create a ticket to get started.</div>;

  return (
    <div className="units-list">
      {units.map((u) => (
        <button className="unit-row" key={u.unit} onClick={() => onSelectUnit(u.unit)}>
          <span className="unit-row-num">
            <Home size={14} /> Unit {u.unit}
          </span>
          <span className="unit-row-counts">
            {u.open > 0 && <span className="pill pill-open">{u.open} open</span>}
            <span className="pill pill-done">{u.done} completed</span>
          </span>
          <ChevronRight size={16} className="tag-chevron" />
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main app
// ---------------------------------------------------------------------------

export default function App() {
  const [appState, setAppState] = useState("loading"); // loading | onboarding | ready | error
  const [property, setProperty] = useState(null);
  const [staff, setStaff] = useState(null);
  const [tickets, setTickets] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [tab, setTab] = useState("open");
  const [sortMode, setSortMode] = useState("priority");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [errorBanner, setErrorBanner] = useState("");
  const [loadErrorMsg, setLoadErrorMsg] = useState("");

  useEffect(() => {
    const session = loadSession();
    if (!session) {
      setAppState("onboarding");
      return;
    }
    setProperty(session.property);
    setStaff(session.staff);
    (async () => {
      try {
        const me = await api.getMe();
        setStaff(me);
        updateStoredStaff(me);
      } catch (e) {
        if (e.status === 401) {
          clearSession();
          setAppState("onboarding");
          return;
        }
        // non-fatal otherwise — proceed with the cached permissions
      }
      loadBoard();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadBoard() {
    setAppState("loading");
    try {
      const [depts, list] = await Promise.all([api.getDepartments(), api.getTickets()]);
      setDepartments(depts);
      setTickets(list);
      setAppState("ready");
    } catch (e) {
      if (e.status === 401) {
        clearSession();
        setAppState("onboarding");
      } else {
        setLoadErrorMsg(e.message || "Couldn't reach the server.");
        setAppState("error");
      }
    }
  }

  async function refreshDepartments() {
    try {
      setDepartments(await api.getDepartments());
    } catch (e) {
      flashError(e.message);
    }
  }

  function flashError(msg) {
    setErrorBanner(msg);
    setTimeout(() => setErrorBanner(""), 5000);
  }

  function handleTicketUpdated(updated) {
    setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }
  function handleTicketCreated(created) {
    setTickets((prev) => [created, ...(prev || [])]);
    setShowNew(false);
    setTab("open");
  }
  function handleTicketDeleted(id) {
    setTickets((prev) => prev.filter((t) => t.id !== id));
    setSelectedId(null);
  }
  function handleOnboarded({ property: p, staff: s }) {
    setProperty(p);
    setStaff(s);
    loadBoard();
  }
  function handleSwitch() {
    clearSession();
    setShowSettings(false);
    setProperty(null);
    setStaff(null);
    setTickets(null);
    setAppState("onboarding");
  }
  async function addExample() {
    const availableDepts = visibleDepartmentNames(staff, departments);
    if (availableDepts.length === 0) return;
    try {
      const ticket = await api.createTicket({
        unit: "101",
        department: availableDepts[0],
        title: "Example: Kitchen faucet dripping",
        description: "This is a sample ticket — delete it whenever you're ready to start using the board for real.",
        severity: "low",
        hazard: false,
      });
      handleTicketCreated(ticket);
    } catch (e) {
      flashError(e.message);
    }
  }

  const scopedDeptNames = useMemo(() => visibleDepartmentNames(staff, departments), [staff, departments]);
  const noDepartmentAccess = staff && !staff.allDepartments && staff.departments.length === 0;

  const filtered = useMemo(() => {
    if (!tickets) return [];
    let list = tickets;
    if (tab === "open") list = list.filter((t) => t.stage < 3);
    else if (tab === "scheduled") list = list.filter((t) => t.stage === 3);
    else if (tab === "done") list = list.filter((t) => t.stage === 4);
    if (deptFilter !== "all") list = list.filter((t) => t.department === deptFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => t.unit.toLowerCase().includes(q) || t.title.toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (sortMode === "priority") sorted.sort((a, b) => priorityScore(b) - priorityScore(a));
    else if (sortMode === "newest") sorted.sort((a, b) => b.reportedAt - a.reportedAt);
    else if (sortMode === "oldest") sorted.sort((a, b) => a.reportedAt - b.reportedAt);
    return sorted;
  }, [tickets, tab, sortMode, search, deptFilter]);

  const counts = useMemo(() => {
    if (!tickets) return { open: 0, scheduled: 0, done: 0, hazard: 0 };
    return {
      open: tickets.filter((t) => t.stage < 3).length,
      scheduled: tickets.filter((t) => t.stage === 3).length,
      done: tickets.filter((t) => t.stage === 4).length,
      hazard: tickets.filter((t) => t.hazard && t.stage < 4).length,
    };
  }, [tickets]);

  const selectedTicket = tickets?.find((t) => t.id === selectedId) || null;
  const unitHistory = useMemo(() => {
    if (!selectedTicket || !tickets) return [];
    return tickets
      .filter((t) => t.unit === selectedTicket.unit && t.stage === 4 && t.id !== selectedTicket.id)
      .sort((a, b) => b.completedAt - a.completedAt);
  }, [selectedTicket, tickets]);

  if (appState === "onboarding") {
    return (
      <div className="board-root">
        <GlobalStyles />
        <OnboardingScreen onComplete={handleOnboarded} />
      </div>
    );
  }

  if (appState === "error") {
    return (
      <div className="board-root">
        <GlobalStyles />
        <div className="onboarding-screen">
          <div className="onboarding-card">
            <div className="onboarding-brand">
              <Wrench size={22} strokeWidth={2.2} />
              <span className="cond onboarding-brand-text">Work Order Board</span>
            </div>
            <p className="onboarding-lede">{loadErrorMsg}</p>
            <button className="btn-primary" onClick={loadBoard} style={{ marginBottom: 10 }}>
              Try again
            </button>
            <button className="text-btn" onClick={handleSwitch}>
              Log out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (appState === "loading" && !property) {
    return (
      <div className="board-root">
        <GlobalStyles />
        <div className="empty-state">Loading…</div>
      </div>
    );
  }

  return (
    <div className="board-root">
      <GlobalStyles />

      <div className="board-header">
        <div className="board-title-row">
          <h1 className="board-title">
            <Wrench size={22} strokeWidth={2.2} />
            {property?.name}
          </h1>
          <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Settings">
            <Settings size={19} />
          </button>
        </div>
        <div className="board-subtitle">Maintenance work order board {staff && `· ${staff.displayName}`}</div>

        {errorBanner && <div className="save-banner">{errorBanner}</div>}

        <div className="stat-row">
          <div className="stat hazard">
            <div className="stat-num">{counts.hazard}</div>
            <div className="stat-label">Hazard</div>
          </div>
          <div className="stat">
            <div className="stat-num">{counts.open}</div>
            <div className="stat-label">Open</div>
          </div>
          <div className="stat">
            <div className="stat-num">{counts.scheduled}</div>
            <div className="stat-label">Scheduled</div>
          </div>
          <div className="stat">
            <div className="stat-num">{counts.done}</div>
            <div className="stat-label">Completed</div>
          </div>
        </div>

        <div className="search-row">
          <Search size={15} />
          <input placeholder="Search by unit or issue" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {scopedDeptNames.length > 1 && (
          <div className="dept-filter-row">
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
              <option value="all">All departments</option>
              {scopedDeptNames.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="tabs">
          <button className={`tab-btn ${tab === "open" ? "active" : ""}`} onClick={() => setTab("open")}>
            Open
          </button>
          <button className={`tab-btn ${tab === "scheduled" ? "active" : ""}`} onClick={() => setTab("scheduled")}>
            Scheduled
          </button>
          <button className={`tab-btn ${tab === "done" ? "active" : ""}`} onClick={() => setTab("done")}>
            Completed
          </button>
          <button className={`tab-btn ${tab === "units" ? "active" : ""}`} onClick={() => setTab("units")}>
            <ClipboardList size={12} style={{ display: "inline", marginRight: 3, verticalAlign: -2 }} />
            Units
          </button>
        </div>

        {tab !== "units" && (
          <div className="sort-row">
            Sort
            <span className="seg">
              <button className={`seg-btn ${sortMode === "priority" ? "active" : ""}`} onClick={() => setSortMode("priority")}>
                Priority
              </button>
              <button className={`seg-btn ${sortMode === "newest" ? "active" : ""}`} onClick={() => setSortMode("newest")}>
                Newest
              </button>
              <button className={`seg-btn ${sortMode === "oldest" ? "active" : ""}`} onClick={() => setSortMode("oldest")}>
                Oldest
              </button>
            </span>
          </div>
        )}
      </div>

      {appState === "loading" || tickets === null ? (
        <div className="empty-state">Loading board…</div>
      ) : tab === "units" ? (
        <UnitsView
          tickets={tickets}
          onSelectUnit={(u) => {
            setSearch(u);
            setTab("open");
          }}
        />
      ) : noDepartmentAccess ? (
        <div className="empty-state">You haven't been assigned to any departments yet. Ask your property admin to update your account in Settings.</div>
      ) : (
        <div className="list">
          {filtered.length === 0 && tickets.length === 0 ? (
            <div className="empty-state">
              <p>No tickets yet — this board is ready for your team.</p>
              {staff?.canCreate && (
                <button className="btn-secondary" onClick={addExample}>
                  Add an example ticket
                </button>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">Nothing here right now.</div>
          ) : (
            filtered.map((t) => <TicketCard key={t.id} t={t} onOpen={setSelectedId} />)
          )}
        </div>
      )}

      {staff?.canCreate && (
        <button className="fab" onClick={() => setShowNew(true)} aria-label="New ticket">
          <Plus size={26} strokeWidth={2.5} />
        </button>
      )}

      {showNew && (
        <NewTicketSheet staff={staff} departments={departments} onClose={() => setShowNew(false)} onCreated={handleTicketCreated} />
      )}

      {selectedTicket && (
        <TicketDetailSheet
          ticket={selectedTicket}
          unitHistory={unitHistory}
          staff={staff}
          onClose={() => setSelectedId(null)}
          onUpdated={handleTicketUpdated}
          onDeleted={handleTicketDeleted}
          onError={flashError}
        />
      )}

      {showSettings && property && staff && (
        <SettingsSheet
          property={property}
          staff={staff}
          tickets={tickets || []}
          departments={departments}
          onDepartmentsChanged={refreshDepartments}
          onClose={() => setShowSettings(false)}
          onRenamed={(newName) => setProperty((p) => ({ ...p, name: newName }))}
          onStaffUpdated={(updated) => {
            setStaff(updated);
            updateStoredStaff(updated);
          }}
          onSwitch={handleSwitch}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

      html, body, #root { height: 100%; margin: 0; }

      .board-root {
        --canvas: #14181a; --paper: #ece6d6; --ink: #1f2421; --ink-soft: #52584f;
        --hazard: #c1440e; --hazard-soft: #f0d9cd; --high: #d9a62e; --high-soft: #f3e6c2;
        --medium: #7c8b5b; --medium-soft: #dfe4d0; --low: #7c8b99; --low-soft: #dfe3e5;
        --done: #4c7a5e; --done-soft: #d9e5dc; --line: #3a4245;
        font-family: 'IBM Plex Sans', sans-serif; background: var(--canvas); color: var(--paper);
        min-height: 100vh; width: 100%; box-sizing: border-box; padding-bottom: 90px;
      }
      .board-root * { box-sizing: border-box; }
      .cond { font-family: 'Barlow Condensed', sans-serif; }
      .mono { font-family: 'IBM Plex Mono', monospace; }

      .board-header { padding: 20px 16px 12px; border-bottom: 1px solid var(--line); }
      .board-title-row { display: flex; justify-content: space-between; align-items: center; }
      .board-title { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 26px; color: var(--paper); display: flex; align-items: center; gap: 8px; margin: 0; }
      .board-subtitle { color: #8a938f; font-size: 13px; margin: 2px 0 14px 0; }
      .save-banner { background: #2a1c15; border: 1px solid var(--hazard); color: #f0c3a4; font-size: 12px; padding: 6px 10px; border-radius: 6px; margin-bottom: 10px; }

      .stat-row { display: flex; gap: 14px; margin-bottom: 14px; flex-wrap: wrap; }
      .stat { font-family: 'Barlow Condensed', sans-serif; }
      .stat-num { font-size: 20px; font-weight: 700; color: var(--paper); line-height: 1; }
      .stat-label { font-size: 11px; color: #8a938f; }
      .stat.hazard .stat-num { color: var(--hazard); }

      .search-row { display: flex; align-items: center; gap: 8px; background: #1c2224; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; }
      .search-row input { background: transparent; border: none; outline: none; color: var(--paper); font-size: 14px; width: 100%; font-family: 'IBM Plex Sans', sans-serif; }
      .search-row input::placeholder { color: #656d69; }
      .search-row svg { color: #656d69; flex-shrink: 0; }

      .dept-filter-row { margin-bottom: 12px; }
      .dept-filter-row select { background: #1c2224; border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; color: var(--paper); font-size: 13px; font-family: 'IBM Plex Sans', sans-serif; }

      .tabs { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
      .tab-btn { font-family: 'Barlow Condensed', sans-serif; font-weight: 600; font-size: 14px; background: transparent; border: 1px solid var(--line); color: #9aa39e; padding: 6px 12px; border-radius: 999px; cursor: pointer; }
      .tab-btn.active { background: var(--paper); color: var(--ink); border-color: var(--paper); }

      .sort-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #8a938f; }
      .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; }
      .seg-btn { font-family: 'IBM Plex Sans', sans-serif; font-size: 12px; padding: 5px 10px; background: #1c2224; color: #9aa39e; border: none; border-right: 1px solid var(--line); cursor: pointer; }
      .seg-btn:last-child { border-right: none; }
      .seg-btn.active { background: var(--paper); color: var(--ink); font-weight: 600; }

      .list { padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
      .tag-card { position: relative; background: var(--paper); border: none; border-radius: 3px 10px 10px 3px; padding: 12px 14px 12px 20px; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 6px; border-left: 7px solid var(--low); width: 100%; }
      .tag-card.tier-edge-hazard { border-left-color: var(--hazard); }
      .tag-card.tier-edge-high { border-left-color: var(--high); }
      .tag-card.tier-edge-medium { border-left-color: var(--medium); }
      .tag-card.tier-edge-low { border-left-color: var(--low); }
      .tag-hole { position: absolute; left: -3px; top: 14px; width: 8px; height: 8px; background: var(--canvas); border-radius: 50%; }
      .tag-card-top { display: flex; justify-content: space-between; align-items: center; }
      .tag-no { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-soft); }
      .tag-unit { font-family: 'Barlow Condensed', sans-serif; font-weight: 600; font-size: 13px; color: var(--ink); display: flex; align-items: center; gap: 4px; }
      .tag-title { font-size: 15px; font-weight: 600; color: var(--ink); line-height: 1.3; }
      .tag-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .tag-cat { font-size: 12px; color: var(--ink-soft); }
      .tag-age { font-size: 12px; color: var(--ink-soft); display: flex; align-items: center; gap: 3px; }
      .tag-bottom { display: flex; justify-content: space-between; align-items: center; margin-top: 2px; }
      .tag-chevron { color: var(--ink-soft); flex-shrink: 0; transition: transform 0.15s; }
      .tag-chevron.rotated { transform: rotate(90deg); }

      .tier-tag { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; padding: 2px 7px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px; }
      .tier-hazard { background: var(--hazard); color: #fff2ea; }
      .tier-high { background: var(--high-soft); color: #6b4e12; }
      .tier-medium { background: var(--medium-soft); color: #454f31; }
      .tier-low { background: var(--low-soft); color: #3b444a; }

      .stage-chip { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 5px; background: #d8d2bf; color: var(--ink-soft); }
      .stage-completed { background: var(--done-soft); color: #2d4c3a; }

      .empty-state { padding: 40px 20px; text-align: center; color: #8a938f; font-size: 14px; display: flex; flex-direction: column; align-items: center; gap: 12px; }

      .units-list { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
      .unit-row { background: #1c2224; border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; color: var(--paper); width: 100%; }
      .unit-row-num { font-family: 'Barlow Condensed', sans-serif; font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 6px; }
      .unit-row-counts { display: flex; gap: 6px; margin-left: auto; }
      .pill { font-size: 11px; padding: 3px 8px; border-radius: 999px; font-weight: 600; }
      .pill-open { background: var(--hazard-soft); color: #7a3410; }
      .pill-done { background: var(--done-soft); color: #2d4c3a; }

      .fab { position: fixed; bottom: 22px; right: 20px; width: 54px; height: 54px; border-radius: 50%; background: var(--hazard); color: #fff2ea; border: none; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 18px rgba(0,0,0,0.4); cursor: pointer; }

      .sheet-backdrop { position: fixed; inset: 0; background: rgba(10,12,13,0.7); display: flex; align-items: flex-end; z-index: 50; }
      .sheet { background: var(--canvas); width: 100%; max-height: 88vh; border-radius: 16px 16px 0 0; display: flex; flex-direction: column; border-top: 1px solid var(--line); margin: 0 auto; max-width: 480px; }
      .sheet-tall { max-height: 92vh; }
      .sheet-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 16px 12px; border-bottom: 1px solid var(--line); }
      .sheet-title { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 18px; color: var(--paper); }
      .sheet-header-actions { display: flex; align-items: center; gap: 6px; }
      .icon-btn { background: transparent; border: none; color: #9aa39e; cursor: pointer; padding: 6px; display: flex; }
      .text-btn { background: transparent; border: none; color: #9aa39e; font-size: 12px; cursor: pointer; font-weight: 600; white-space: nowrap; }
      .text-btn.danger { color: var(--hazard); }
      .text-btn:disabled { opacity: 0.5; cursor: default; }

      .sheet-body { padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
      .sheet-footer { padding: 12px 16px 18px; border-top: 1px solid var(--line); }

      .field { display: flex; flex-direction: column; gap: 5px; }
      .field span { font-size: 12px; color: #9aa39e; font-weight: 600; display: flex; align-items: center; gap: 4px; }
      .field input, .field select, .field textarea { background: #1c2224; border: 1px solid var(--line); border-radius: 7px; padding: 9px 10px; color: var(--paper); font-size: 14px; font-family: 'IBM Plex Sans', sans-serif; outline: none; width: 100%; }
      .field input:disabled, .field select:disabled, .field textarea:disabled { opacity: 0.5; cursor: not-allowed; }
      .field textarea { resize: vertical; }
      .field-row { display: flex; gap: 10px; }
      .field-row .field { flex: 1; }
      .form-error { font-size: 12px; color: var(--hazard); }
      .form-success { font-size: 12px; color: var(--done); }
      .account-meta { font-size: 12px; color: #8a938f; margin: 2px 0 8px 0; }

      .checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--paper); cursor: pointer; }
      .checkbox-row input { width: 15px; height: 15px; accent-color: var(--hazard); }

      .chip-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
      .dept-chip { display: inline-flex; align-items: center; gap: 5px; background: #1c2224; border: 1px solid var(--line); color: var(--paper); font-size: 12px; padding: 4px 6px 4px 10px; border-radius: 999px; }
      .dept-chip button { background: transparent; border: none; color: #8a938f; display: flex; cursor: pointer; padding: 2px; }
      .dept-chip.selectable { padding: 5px 12px; cursor: pointer; border: 1px solid var(--line); }
      .dept-chip.selectable.active { background: var(--paper); color: var(--ink); border-color: var(--paper); font-weight: 600; }

      .staff-list { display: flex; flex-direction: column; gap: 6px; }
      .staff-row { background: #1c2224; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
      .staff-row-head { width: 100%; display: flex; align-items: center; justify-content: space-between; background: transparent; border: none; color: var(--paper); padding: 10px 12px; cursor: pointer; text-align: left; }
      .staff-row-head strong { display: block; font-size: 14px; }
      .staff-row-head small { display: block; font-size: 11px; color: #8a938f; margin-top: 2px; }
      .staff-row-body { padding: 12px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; }
      .staff-row-actions { display: flex; gap: 14px; padding-top: 4px; }
      .add-staff-form { display: flex; flex-direction: column; gap: 10px; background: #1c2224; border: 1px solid var(--line); border-radius: 8px; padding: 12px; }

      .hazard-toggle { display: flex; align-items: center; gap: 10px; background: #1c2224; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; cursor: pointer; text-align: left; width: 100%; }
      .hazard-toggle.active { border-color: var(--hazard); background: #241a15; }
      .hazard-toggle-box { width: 20px; height: 20px; border-radius: 5px; border: 1.5px solid #656d69; display: flex; align-items: center; justify-content: center; color: var(--hazard); flex-shrink: 0; }
      .hazard-toggle.active .hazard-toggle-box { border-color: var(--hazard); }
      .hazard-toggle-text { display: flex; flex-direction: column; gap: 2px; }
      .hazard-toggle-text strong { font-size: 13px; color: var(--paper); }
      .hazard-toggle-text small { font-size: 11px; color: #8a938f; line-height: 1.3; }

      .btn-primary { width: 100%; background: var(--hazard); color: #fff2ea; border: none; border-radius: 8px; padding: 12px; font-size: 15px; font-weight: 600; cursor: pointer; }
      .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
      .btn-secondary { background: #2a3134; color: var(--paper); border: 1px solid var(--line); border-radius: 7px; padding: 9px 14px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; align-items: center; }
      .btn-danger { background: var(--hazard); color: #fff2ea; border: none; border-radius: 7px; padding: 9px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }

      .detail-edge { border-left: 5px solid var(--low); padding-left: 12px; }
      .detail-edge.tier-edge-hazard { border-left-color: var(--hazard); }
      .detail-edge.tier-edge-high { border-left-color: var(--high); }
      .detail-edge.tier-edge-medium { border-left-color: var(--medium); }
      .detail-edge.tier-edge-low { border-left-color: var(--low); }
      .detail-title-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
      .detail-title { font-family: 'Barlow Condensed', sans-serif; font-size: 20px; font-weight: 700; color: var(--paper); margin: 0 0 6px 0; }
      .detail-desc { font-size: 13px; color: #b7bdb8; line-height: 1.5; margin: 0 0 6px 0; }
      .detail-sub { font-size: 12px; color: #8a938f; }

      .stepper { display: flex; align-items: flex-start; padding: 4px 0; }
      .stepper-node { background: transparent; border: none; display: flex; flex-direction: column; align-items: center; gap: 5px; cursor: pointer; flex: 1; min-width: 0; }
      .stepper-node:disabled { opacity: 0.6; cursor: default; }
      .stepper-dot { color: #4a5257; }
      .stepper-dot.done { color: var(--done); }
      .stepper-label { font-size: 10px; color: #8a938f; text-align: center; line-height: 1.2; }
      .stepper-label.current { color: var(--paper); font-weight: 700; }
      .stepper-line { flex: 0.6; height: 1.5px; background: #3a4245; margin-top: 10px; }
      .stepper-line.done { background: var(--done); }

      .section-label { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 14px; color: var(--paper); display: block; margin-bottom: 8px; }
      .notes-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; max-height: 160px; overflow-y: auto; }
      .note { display: flex; flex-direction: column; gap: 1px; border-left: 2px solid var(--line); padding-left: 8px; }
      .note-ts { font-size: 10px; color: #737b76; font-family: 'IBM Plex Mono', monospace; }
      .note-text { font-size: 13px; color: #d4d8d0; }
      .note-add { display: flex; gap: 8px; }
      .note-add input { flex: 1; background: #1c2224; border: 1px solid var(--line); border-radius: 7px; padding: 8px 10px; color: var(--paper); font-size: 13px; outline: none; }

      .unit-history { border-top: 1px solid var(--line); padding-top: 14px; }
      .history-row { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; }
      .history-check { color: var(--done); margin-top: 2px; flex-shrink: 0; }
      .history-title { font-size: 13px; color: var(--paper); font-weight: 500; }
      .history-sub { font-size: 11px; color: #8a938f; }

      .onboarding-screen { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px 16px; }
      .onboarding-card { width: 100%; max-width: 380px; }
      .onboarding-brand { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; }
      .onboarding-brand-text { font-weight: 700; font-size: 20px; }
      .onboarding-lede { font-size: 13px; color: #9aa39e; margin: 0 0 16px 0; line-height: 1.5; }
      .choice-card { width: 100%; display: flex; align-items: center; gap: 12px; background: #1c2224; border: 1px solid var(--line); border-radius: 10px; padding: 14px; color: var(--paper); cursor: pointer; margin-bottom: 10px; text-align: left; }
      .choice-card strong { display: block; font-size: 14px; }
      .choice-card small { display: block; font-size: 12px; color: #8a938f; margin-top: 2px; }
      .choice-card svg:first-child { flex-shrink: 0; color: var(--paper); }

      .copy-row { display: flex; gap: 8px; align-items: center; }
      .code-display { background: #1c2224; border: 1px solid var(--line); border-radius: 7px; padding: 9px 10px; flex: 1; font-size: 14px; }
      .settings-divider { border-top: 1px solid var(--line); margin: 4px 0; }
      .switch-confirm p { font-size: 12px; color: #9aa39e; margin: 0 0 10px 0; }
    `}</style>
  );
}
