import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { getErrorMessage } from "../services/api";
import { useAuth } from "../context/AuthContext";
import Toast from "../components/Toast";
import Spinner from "../components/Spinner";
import Badge from "../components/Badge";
import PasswordInput from "../components/PasswordInput";
import ConfirmModal from "../components/ConfirmModal";

const EMPTY_FORM = { name: "", username: "", password: "", confirmPassword: "" };

export default function Register() {
  const { bootstrap, isBootstrapMode, bootstrapChecked } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [notify, setNotify] = useState(null);
  const [fieldError, setFieldError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadAdmins = useCallback(async () => {
    if (isBootstrapMode) { setAdmins([]); setListLoading(false); return; }
    setListLoading(true);
    try {
      const { data } = await api.get("/api/auth/admins");
      setAdmins(data.data || []);
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: "error" });
    } finally {
      setListLoading(false);
    }
  }, [isBootstrapMode]);

  useEffect(() => { loadAdmins(); }, [loadAdmins]);

  const setField = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const validate = () => {
    if (!form.username.trim()) return "Username is required.";
    if (isBootstrapMode) {
      if (!/^[a-z0-9._-]{3,30}$/.test(form.username.trim())) {
        return "Username must be 3-30 lowercase letters, numbers, dot, underscore or hyphen only.";
      }
    } else if (!/^[a-zA-Z0-9._-]{3,30}$/.test(form.username.trim())) {
      return "Username must be 3-30 characters - letters, numbers, dot, underscore or hyphen only.";
    }
    if ((form.password || "").length < 8) return "Password must be at least 8 characters.";
    if (form.password !== form.confirmPassword) return "Passwords do not match.";
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const message = validate();
    if (message) { setFieldError(message); return; }
    setFieldError("");
    setLoading(true);
    try {
      const payload = {
        username: form.username.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
      };
      if (form.name.trim()) payload.name = form.name.trim();

      if (isBootstrapMode) {
        const { data } = await api.post("/api/auth/boot", payload);
        bootstrap({ token: data.token, admin: data.admin });
        setNotify({ message: "Admin account created and signed in", type: "success" });
        navigate("/", { replace: true });
      } else {
        const { data } = await api.post("/api/auth/register", payload);
        setNotify({ message: "Admin account created", type: "success" });
        setForm({ ...EMPTY_FORM });
        loadAdmins();
      }
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: "error", duration: 8000 });
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete("/api/auth/admins/" + deleteTarget.id);
      setNotify({ message: "Admin removed", type: "success" });
      setDeleteTarget(null);
      loadAdmins();
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: "error" });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  if (!bootstrapChecked) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: "center", padding: "40px" }}>
          <Spinner label="Initializing session…" />
        </div>
      </div>
    );
  }
  return (
    <div className="page-wrap">
      <div className="page-head">
        <h1>{isBootstrapMode ? "Create First Admin Account" : "Register Administrator"}</h1>
        <p className="muted">
          {isBootstrapMode
            ? "No administrator account exists yet. Create the first admin to get started."
            : "Create a new administrator account."}
        </p>
      </div>

      <div className="register-grid">
        <div className="card">
          <h3 className="card-title">{isBootstrapMode ? "Create First Admin" : "New Administrator"}</h3>
          {notify ? (
            <Toast key={notify.message} message={notify.message} type={notify.type}
              duration={notify.duration} onClose={() => setNotify(null)} />
          ) : null}
          <form className="register-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="reg-username">Username *</label>
              <input id="reg-username" className="input" value={form.username}
                onChange={setField("username")}
                placeholder={isBootstrapMode ? "e.g. admin123" : "Enter a username"}
                autoComplete="username" required />
              <div className="hint-text">
                {isBootstrapMode
                  ? "3-30 lowercase letters, numbers, dot, underscore or hyphen."
                  : "3-30 letters, numbers, dot, underscore or hyphen."}
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="reg-name">Full Name (optional)</label>
              <input id="reg-name" className="input" value={form.name}
                onChange={setField("name")}
                placeholder={isBootstrapMode ? "e.g. Election Commissioner" : "Enter full name"}
                autoComplete="name" />
            </div>
            <div className="form-group">
              <label htmlFor="reg-password">Password *</label>
              <PasswordInput id="reg-password" value={form.password}
                onChange={setField("password")} placeholder="At least 8 characters"
                autoComplete="new-password" />
            </div>
            <div className="form-group">
              <label htmlFor="reg-confirm">Confirm Password *</label>
              <PasswordInput id="reg-confirm" value={form.confirmPassword}
                onChange={setField("confirmPassword")} placeholder="Re-enter the password"
                autoComplete="new-password" />
              {fieldError ? <div className="field-error">{fieldError}</div> : null}
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Creating…" : "Create Admin Account"}
              </button>
            </div>
          </form>
        </div>

        {!isBootstrapMode && (
          <div className="card">
            <h3 className="card-title">Existing Administrators</h3>
            {listLoading ? (
              <Spinner label="Loading admins…" small />
            ) : (
              <div className="table-wrap">
                <table className="table table-sm">
                  <thead>
                    <tr><th>Username</th><th>Name</th><th>Created</th><th className="col-actions">Actions</th></tr>
                  </thead>
                  <tbody>
                    {admins.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <span className="mono">{a.username}</span>
                          {a.isSelf ? <Badge tone="green">You</Badge> : null}
                        </td>
                        <td>{a.name || "—"}</td>
                        <td>{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : "—"}</td>
                        <td className="col-actions">
                          {a.isSelf ? (
                            <span className="muted">Current session</span>
                          ) : (
                            <button type="button" className="btn btn-sm btn-danger"
                              onClick={() => setDeleteTarget(a)}>Remove</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="hint-text" style={{ marginTop: 10 }}>
              Removing an admin signs that account out immediately. At least one administrator
              must always remain, and you cannot remove the account you are signed in with.
            </p>
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Remove Administrator"
        message={"Remove admin account \x27" + (deleteTarget?.username || "") + "\x27? That account will be signed out permanently."}
        confirmLabel="Remove"
        tone="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
