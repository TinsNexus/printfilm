import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { loginAsAdmin } from "@/api/client";

// Admin login — film-lab ops aesthetic
export function LoginPage() {
  const navigate = useNavigate();
  /*
   * email login email
   * password login password
   * loading submit state
   */
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Submit credentials and enter dashboard
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await loginAsAdmin(email.trim(), password);
      toast.success("登录成功");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  const sprocketOffsets = ["8%", "22%", "36%", "50%", "64%", "78%", "90%"];

  return (
    <div className="login-shell">
      <section className="login-brand" aria-label="品牌">
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
        <p className="login-sub">管理用户、订单、项目与模板。同一套账号体系，仅管理员可进入。</p>
      </section>

      <section className="login-panel">
        <div className="login-form-wrap">
          <h2>登录后台</h2>
          <p>使用已授权的管理员邮箱与密码</p>
          <form onSubmit={onSubmit}>
            <div className="login-field">
              <label htmlFor="email">邮箱</label>
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
              <label htmlFor="password">密码</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="输入密码"
              />
            </div>
            <button className="login-submit" type="submit" disabled={loading}>
              {loading ? "验证中…" : "进入控制台"}
            </button>
          </form>
          <p className="login-hint">本地演示账号已预填邮箱，密码见 README / 团队约定。</p>
        </div>
      </section>
    </div>
  );
}
