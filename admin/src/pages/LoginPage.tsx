import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { loginAsAdmin } from "@/api/client";
import { useI18n } from "@/i18n";

// Admin login — film-lab ops aesthetic
export function LoginPage() {
  const { t: tx } = useI18n();
  const navigate = useNavigate();
  /*
   * email login email
   * password login password
   * loading submit state
   */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Submit credentials and enter dashboard
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await loginAsAdmin(email.trim(), password);
      toast.success(tx("login.signed"));
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx("login.signFailed"));
    } finally {
      setLoading(false);
    }
  }

  const sprocketOffsets = ["8%", "22%", "36%", "50%", "64%", "78%", "90%"];

  return (
    <div className="login-shell">
      <section className="login-brand" aria-label={tx("login.brand")}>
        <div className="login-sprocket" aria-hidden>
          {sprocketOffsets.map((top) => (
            <span key={top} style={{ top }} />
          ))}
        </div>
        <div className="login-eyebrow">Ops Console</div>
        <h1 className="login-title">
          PRINT
          <br />
          FILM
        </h1>
      </section>

      <section className="login-panel">
        <div className="login-form-wrap">
          <h2>{tx("login.signAdmin")}</h2>
          <form onSubmit={onSubmit}>
            <div className="login-field">
              <label htmlFor="email">{tx("login.email")}</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="login-field">
              <label htmlFor="password">{tx("login.password")}</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button className="login-submit" type="submit" disabled={loading}>
              {loading ? tx("login.verifying") : tx("login.enterConsole")}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
