const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

function getToken() {
  return localStorage.getItem("token");
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const err = new Error("Couldn't reach the server. Check your connection and try again.");
    err.status = 0;
    throw err;
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // no JSON body
  }

  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function saveSession(token, property, staff) {
  localStorage.setItem("token", token);
  localStorage.setItem("property", JSON.stringify(property));
  localStorage.setItem("staff", JSON.stringify(staff));
}
export function loadSession() {
  const token = localStorage.getItem("token");
  const property = localStorage.getItem("property");
  const staff = localStorage.getItem("staff");
  if (!token || !property || !staff) return null;
  try {
    return { token, property: JSON.parse(property), staff: JSON.parse(staff) };
  } catch (e) {
    return null;
  }
}
export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("property");
  localStorage.removeItem("staff");
}
export function updateStoredStaff(staff) {
  localStorage.setItem("staff", JSON.stringify(staff));
}

export const api = {
  createProperty: (propertyName, username, password, displayName) =>
    request("/api/properties", { method: "POST", body: { propertyName, username, password, displayName }, auth: false }),
  login: (propertySlug, username, password) =>
    request("/api/auth/login", { method: "POST", body: { propertySlug, username, password }, auth: false }),

  getProperty: () => request("/api/property"),
  renameProperty: (name) => request("/api/property", { method: "PATCH", body: { name } }),

  getMe: () => request("/api/staff/me"),
  updateMe: (displayName) => request("/api/staff/me", { method: "PATCH", body: { displayName } }),
  changeMyPassword: (currentPassword, newPassword) =>
    request("/api/staff/me/password", { method: "PATCH", body: { currentPassword, newPassword } }),

  getStaff: () => request("/api/staff"),
  createStaff: (payload) => request("/api/staff", { method: "POST", body: payload }),
  updateStaff: (id, patch) => request(`/api/staff/${id}`, { method: "PATCH", body: patch }),
  resetStaffPassword: (id, newPassword) => request(`/api/staff/${id}/password`, { method: "PATCH", body: { newPassword } }),
  removeStaff: (id) => request(`/api/staff/${id}`, { method: "DELETE" }),

  getDepartments: () => request("/api/departments"),
  createDepartment: (name) => request("/api/departments", { method: "POST", body: { name } }),
  deleteDepartment: (id) => request(`/api/departments/${id}`, { method: "DELETE" }),

  getTickets: () => request("/api/tickets"),
  createTicket: (payload) => request("/api/tickets", { method: "POST", body: payload }),
  patchTicket: (id, patch) => request(`/api/tickets/${id}`, { method: "PATCH", body: patch }),
  deleteTicket: (id) => request(`/api/tickets/${id}`, { method: "DELETE" }),
};
