import { useEffect, useState } from "react";

function SkeletonLoader() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{
          background: "#1a1715", borderRadius: 10, padding: "13px 16px",
          border: "1px solid #2e2924",
        }}>
          <div className="skeleton" style={{ height: 14, width: "55%", marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 11, width: "35%" }} />
        </div>
      ))}
    </div>
  );
}

interface Session {
  id: number;
  started_at: string;
  ended_at: string | null;
  source_language: string | null;
  target_language: string | null;
  title: string | null;
  summary: string | null;
  key_points: string[] | null;
  title_en: string | null;
  summary_en: string | null;
  key_points_en: string[] | null;
  duration_seconds: number | null;
  word_count: number | null;
  transcript?: string;
  transcript_translated?: string | null;
}

const API = "http://127.0.0.1:8000";

const C = {
  bg:        "#0f0e0c",
  surface:   "#1a1715",
  surfaceHi: "#242018",
  border:    "#2e2924",
  accent:    "#c8923a",
  accentDim: "#9a6e28",
  text:      "#e8dcc8",
  textSec:   "#9a8e80",
  textMuted: "#4a4438",
};

function pad(n: number) { return String(n).padStart(2, "0"); }
function toDateStr(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatDuration(s: number | null) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${Math.floor(s % 60)}s` : `${Math.floor(s)}s`;
}

function buildCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [...Array(firstDay).fill(null)];
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function SessionCard({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [fullSession, setFullSession] = useState<Session | null>(null);

  const toggle = async () => {
    if (!open && !fullSession) {
      const res = await fetch(`${API}/sessions/${session.id}`);
      const fetched: Session = await res.json();
      setFullSession(fetched);
      if (fetched.title && !fetched.title_en) {
        fetch(`${API}/sessions/${session.id}/regenerate`, { method: "POST" })
          .then((r) => r.json())
          .then((updated: Session) => setFullSession(updated))
          .catch(() => {});
      }
    }
    setOpen((v) => !v);
    if (open) setTranscriptOpen(false);
  };

  const data = fullSession ?? session;
  const fetched = fullSession !== null;
  const hasAI = !!(data.title || data.summary);
  const hasTranslation = !!(
    data.transcript_translated ||
    (data.title_en && data.title_en !== data.title)
  );

  const displayTitle = showOriginal && data.title_en ? data.title_en : data.title;
  const displaySummary = showOriginal && data.summary_en ? data.summary_en : data.summary;
  const displayKeyPoints = showOriginal && data.key_points_en ? data.key_points_en : data.key_points;

  const LangToggle = hasTranslation ? (
    <div style={{
      display: "flex", background: C.bg, borderRadius: 7,
      overflow: "hidden", border: `1px solid ${C.border}`,
    }}>
      <button
        onClick={() => setShowOriginal(false)}
        style={{
          background: !showOriginal ? C.accent : "transparent",
          border: "none", borderRadius: 0,
          color: !showOriginal ? "#111" : C.textMuted,
          fontSize: 11, fontWeight: !showOriginal ? 700 : 400,
          padding: "5px 11px", cursor: "pointer",
          letterSpacing: 0.2,
        }}
      >
        Translated
      </button>
      <button
        onClick={() => setShowOriginal(true)}
        style={{
          background: showOriginal ? C.accent : "transparent",
          border: "none", borderRadius: 0,
          color: showOriginal ? "#111" : C.textMuted,
          fontSize: 11, fontWeight: showOriginal ? 700 : 400,
          padding: "5px 11px", cursor: "pointer",
          letterSpacing: 0.2,
        }}
      >
        EN
      </button>
    </div>
  ) : null;

  return (
    <div style={{
      background: C.surface, borderRadius: 10, marginBottom: 8,
      overflow: "hidden", border: `1px solid ${C.border}`,
    }}>
      <button
        onClick={toggle}
        style={{
          width: "100%", textAlign: "left", background: "none", border: "none",
          padding: "13px 16px", cursor: "pointer", display: "flex",
          justifyContent: "space-between", alignItems: "center",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            color: C.accent, fontWeight: 600, fontSize: 14,
            marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {displayTitle ?? "Untitled Session"}
          </div>
          <div style={{ color: C.textMuted, fontSize: 12 }}>
            {formatTime(session.started_at)}
            {data.duration_seconds ? ` · ${formatDuration(data.duration_seconds)}` : ""}
            {data.word_count ? ` · ${data.word_count} words` : ""}
          </div>
        </div>
        <span style={{ color: C.textMuted, fontSize: 11, marginLeft: 12 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.border}` }}>
          {/* Language toggle */}
          {fetched && hasTranslation && (
            <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 12, marginBottom: 12 }}>
              {LangToggle}
            </div>
          )}

          {fetched && !hasAI && (
            <p style={{ color: C.textMuted, fontSize: 12, fontStyle: "italic", margin: "12px 0 0" }}>
              AI summary not available — add OPENAI_API_KEY to .env to enable
            </p>
          )}

          {displaySummary && (
            <p style={{ color: C.textSec, fontSize: 13, lineHeight: 1.65, margin: "0 0 12px" }}>
              {displaySummary}
            </p>
          )}

          {displayKeyPoints && displayKeyPoints.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{
                color: C.textMuted, fontSize: 10, fontWeight: 700,
                letterSpacing: 1, marginBottom: 6, textTransform: "uppercase",
              }}>
                Key Points
              </div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {displayKeyPoints.map((pt, i) => (
                  <li key={i} style={{ color: C.textSec, fontSize: 13, lineHeight: 1.6 }}>{pt}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Transcript */}
          {fetched && data.transcript ? (
            <>
              <button
                onClick={() => setTranscriptOpen((v) => !v)}
                style={{
                  background: "none", border: `1px solid ${C.border}`, borderRadius: 7,
                  color: C.textMuted, fontSize: 12, padding: "5px 12px",
                  cursor: "pointer", marginTop: 2,
                }}
              >
                {transcriptOpen ? "Hide transcript ▲" : "Full transcript ▼"}
              </button>
              {transcriptOpen && (
                <div style={{
                  background: C.bg, borderRadius: 8, padding: "12px 14px",
                  color: C.textSec, fontSize: 12, lineHeight: 1.7,
                  maxHeight: 200, overflowY: "auto", marginTop: 8,
                  border: `1px solid ${C.border}`,
                }}>
                  {showOriginal || !data.transcript_translated
                    ? data.transcript
                    : data.transcript_translated}
                </div>
              )}
            </>
          ) : fetched ? (
            <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>No transcript recorded</p>
          ) : (
            <p style={{ color: C.textMuted, fontSize: 12, fontStyle: "italic", margin: 0 }}>Loading…</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function History() {
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(toDateStr(now.getFullYear(), now.getMonth(), now.getDate()));
  const [sessionDates, setSessionDates] = useState<Set<string>>(new Set());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/sessions/dates`)
      .then((r) => r.json())
      .then((dates: string[]) => setSessionDates(new Set(dates)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/sessions?date=${selectedDate}`)
      .then((r) => r.json())
      .then((data) => { setSessions(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedDate]);

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentYear((y) => y - 1); setCurrentMonth(11); }
    else setCurrentMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentYear((y) => y + 1); setCurrentMonth(0); }
    else setCurrentMonth((m) => m + 1);
  };

  const calDays = buildCalendarDays(currentYear, currentMonth);

  const formatSelectedDate = () => {
    const d = new Date(selectedDate + "T00:00:00");
    return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  };

  return (
    <div style={{ padding: "0 2px" }}>
      {/* Calendar */}
      <div style={{
        background: C.surface, borderRadius: 12, padding: "14px 16px",
        marginBottom: 16, border: `1px solid ${C.border}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <button onClick={prevMonth} style={{
            background: "none", border: "none", color: C.textMuted,
            cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px",
          }}>‹</button>
          <span style={{ color: C.textSec, fontSize: 13, fontWeight: 600 }}>
            {MONTH_NAMES[currentMonth]} {currentYear}
          </span>
          <button onClick={nextMonth} style={{
            background: "none", border: "none", color: C.textMuted,
            cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px",
          }}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {DAY_NAMES.map((d) => (
            <div key={d} style={{
              textAlign: "center", color: C.textMuted,
              fontSize: 10, fontWeight: 700, paddingBottom: 6, letterSpacing: 0.5,
            }}>{d}</div>
          ))}
          {calDays.map((day, i) => {
            if (!day) return <div key={i} />;
            const ds = toDateStr(currentYear, currentMonth, day);
            const hasSession = sessionDates.has(ds);
            const isSelected = ds === selectedDate;
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(ds)}
                style={{
                  background: isSelected ? C.accent : "transparent",
                  border: "none", borderRadius: 7,
                  color: isSelected ? "#111" : hasSession ? C.text : C.textMuted,
                  cursor: "pointer", fontSize: 12,
                  fontWeight: isSelected ? 700 : hasSession ? 500 : 400,
                  padding: "5px 0",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 3,
                }}
              >
                {day}
                {hasSession && !isSelected && (
                  <span style={{
                    width: 3, height: 3, borderRadius: "50%",
                    background: C.accentDim, display: "block",
                  }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Date label */}
      <div style={{
        color: C.textMuted, fontSize: 10, fontWeight: 700,
        letterSpacing: 1, marginBottom: 10, textTransform: "uppercase",
      }}>
        {formatSelectedDate()}
      </div>

      {loading && <SkeletonLoader />}

      {!loading && sessions.length === 0 && (
        <p style={{ color: C.textMuted, fontSize: 13, textAlign: "center", marginTop: 28 }}>
          No sessions on this day
        </p>
      )}

      {sessions.map((s) => <SessionCard key={s.id} session={s} />)}
    </div>
  );
}
