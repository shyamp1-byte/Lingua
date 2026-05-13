import { SUPPORTED_LANGUAGES } from "../types";
import { useSessionStore } from "../store/session";

export default function LanguageSelector() {
  const { targetLanguage, setTargetLanguage, status } = useSessionStore();
  const disabled = status === "active";

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{
        display: "block", fontSize: 11, fontWeight: 700,
        color: "#4a4438", marginBottom: 6, letterSpacing: 1,
        textTransform: "uppercase",
      }}>
        Translate To
      </label>
      <select
        value={targetLanguage}
        onChange={(e) => setTargetLanguage(e.target.value)}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "10px 14px",
          fontSize: 14,
          borderRadius: 9,
          border: "1px solid #2e2924",
          background: "#1a1715",
          color: disabled ? "#4a4438" : "#e8dcc8",
          cursor: disabled ? "not-allowed" : "pointer",
          appearance: "none",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%234a4438' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 14px center",
          paddingRight: 36,
        }}
      >
        {SUPPORTED_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}
