import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login',
};

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <p className="eyebrow">Internal operations</p>
        <h1 id="login-title">AR Collections OS</h1>
        <p className="page-description">
          Masuk untuk melanjutkan pekerjaan collection organization Anda.
        </p>

        <form className="login-form">
          <label className="field">
            Email
            <input
              className="input"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="operator@company.co.id"
            />
          </label>
          <label className="field">
            Password
            <input
              className="input"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Masukkan password"
            />
          </label>
          <button className="button" type="submit">
            Masuk
          </button>
        </form>
      </section>
    </main>
  );
}
