import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import {
  Radio,
  FolderKanban,
  Layers,
  List,
  LayoutGrid,
  User,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleDot,
  Wrench,
  Megaphone,
  LifeBuoy,
  Tag,
  ChevronDown,
  Plus,
  Timer,
  X,
  Upload,
  Download,
  LogOut,
  Menu,
} from "lucide-react";

// Inlined rather than imported from ./firebaseConfig.js: babel-standalone
// executes this file from a blob: URL, which has no meaningful base for
// resolving relative import specifiers (see firebaseConfig.js for the
// same values kept as a readable reference / for a future bundler setup).
const firebaseConfig = {
  apiKey: "AIzaSyBLMirFofzHnF-E_UipEUmX_fN2UQR1tsY",
  authDomain: "rs-task-tracker.firebaseapp.com",
  projectId: "rs-task-tracker",
  storageBucket: "rs-task-tracker.firebasestorage.app",
  messagingSenderId: "311423351982",
  appId: "1:311423351982:web:ea2ceac478c20dc044413f",
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// ── Sample data ─────────────────────────────────────────────────────────
// Only used when the user explicitly clicks "載入範例資料" on an empty
// board. Real data always comes from the local work_log.json the user
// opens/creates — nothing here is loaded automatically.
const SAMPLE_PROJECTS = [
  {
    project_id: "p1",
    title: "PCB E-Tester integration, AIBC",
    status: "進行中",
    customer: "MPI",
    department: "PCB",
    target_date: "2026-12-31",
  },
  {
    project_id: "p2",
    title: "OE/EO integration",
    status: "進行中",
    customer: "MPI",
    department: "AST",
    target_date: "2026-12-31",
  },
];

const SAMPLE_TOPICS = [
  {
    topic_id: "t1",
    title: "VNA basic presentation and training",
    project_id: null,
    status: "待處理",
    customer: "WNC",
    department: null,
    type: "未分類",
    due_date: "2026-08-25",
  },
  {
    topic_id: "t3",
    title: "VNA measurement discussion",
    project_id: "p1",
    status: "待處理",
    customer: "MPI",
    department: "PCB",
    type: "未分類",
    due_date: "2026-08-24",
  },
];

// ── Status / type tokens ────────────────────────────────────────────────
// Instrument-panel indicator language: every status is an LED, not a pill.
const PROJECT_STATUS_STYLE = {
  進行中: { dot: "#F5A623", glow: "rgba(245,166,35,0.55)", text: "text-[#F5C463]" },
  暫緩: { dot: "#E5484D", glow: "rgba(229,72,77,0.5)", text: "text-[#F0898C]" },
  完成: { dot: "#45D9B0", glow: "rgba(69,217,176,0.5)", text: "text-[#7EE7C7]" },
};

const TOPIC_STATUS_STYLE = {
  待處理: { dot: "#6B7280", glow: "rgba(107,114,128,0.45)", text: "text-[#9CA3AF]", label: "待處理" },
  執行中: { dot: "#F5A623", glow: "rgba(245,166,35,0.55)", text: "text-[#F5C463]", label: "執行中" },
  結案: { dot: "#45D9B0", glow: "rgba(69,217,176,0.5)", text: "text-[#7EE7C7]", label: "結案" },
};

const TOPIC_TYPE_STYLE = {
  內部支援: { icon: Wrench, text: "text-[#8FB3F5]", border: "border-[#2E4067]", bg: "bg-[#182238]" },
  "客戶 Trouble-shooting": { icon: LifeBuoy, text: "text-[#F0898C]", border: "border-[#4A2A2C]", bg: "bg-[#241819]" },
  產品推廣: { icon: Megaphone, text: "text-[#C9A6F5]", border: "border-[#3A2E56]", bg: "bg-[#1E1830]" },
  未分類: { icon: Tag, text: "text-[#8A90A0]", border: "border-[#2A2F3A]", bg: "bg-[#1A1D24]" },
};

const KANBAN_COLUMNS = ["待處理", "執行中", "結案"];

// ── Date helpers ─────────────────────────────────────────────────────────
// Internally every date is stored as "YYYY-MM-DD" — it sorts correctly as
// a plain string, parses natively with `new Date(...)`, and has no locale
// ambiguity. normalizeDate() converts anything else (e.g. "31 DEC, 2026"
// from an older export) into that shape the moment data is loaded.
const DAY_MS = 86400000;

function normalizeDate(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  const due = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - today) / DAY_MS);
}

function dueLabel(days) {
  if (days === null) return "";
  if (days < 0) return `已逾期 ${Math.abs(days)} 天`;
  if (days === 0) return "今天到期";
  return `${days} 天後到期`;
}

const DUE_WINDOWS = [
  { days: 7, label: "一週內" },
  { days: 14, label: "兩週內" },
  { days: 30, label: "一個月內" },
];

// ── Auth ─────────────────────────────────────────────────────────────────
// Email/password sign-in so the same account (and therefore the same
// Firestore data) can be reached from any device — phone, laptop, whatever
// — without an install step. There's only one real user; Firestore rules
// scope every document under users/{uid} so nobody else's account (if
// anyone ever created one) could see this data.
function translateAuthError(code) {
  switch (code) {
    case "auth/invalid-email":
      return "Email 格式不正確";
    case "auth/weak-password":
      return "密碼至少需要 6 碼";
    case "auth/email-already-in-use":
      return "這組 Email 已經註冊過，請改用「登入」";
    case "auth/user-not-found":
      return "帳號不存在，請改用「建立帳號」";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "帳號或密碼錯誤";
    case "auth/operation-not-allowed":
    case "auth/configuration-not-found":
      return "尚未在 Firebase 主控台啟用 Email/Password 登入方式（Authentication → Sign-in method）";
    default:
      return code || "發生未知錯誤";
  }
}

function AuthGate({ children }) {
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      setError(translateAuthError(err.code));
    } finally {
      setBusy(false);
    }
  };

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F1115] text-[#565C6B] text-[13px]">
        連接中…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F1115] px-4">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm rounded-lg border border-[#2A2F3A] bg-[#171A21] p-6"
        >
          <div className="flex items-center gap-2 mb-1">
            <Radio size={16} className="text-[#F5A623]" strokeWidth={2} />
            <span className="font-mono text-[10px] tracking-[0.2em] text-[#565C6B] uppercase">
              Work Log Console
            </span>
          </div>
          <p className="text-[12px] text-[#565C6B] mb-5">
            {mode === "login" ? "登入以同步您的資料" : "第一次使用？設定一組帳號密碼（之後在任何裝置用同一組登入即可同步）"}
          </p>
          <Field label="Email">
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@example.com"
            />
          </Field>
          <Field label="密碼（至少 6 碼）">
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </Field>
          {error && <p className="mb-3 text-[11px] text-[#F0898C]">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-[#F5A623] text-[#171208] py-2 text-[13px] font-semibold hover:bg-[#F7B84D] transition-colors disabled:opacity-50"
          >
            {busy ? "處理中…" : mode === "login" ? "登入" : "建立帳號並登入"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
            className="w-full mt-3 text-[11px] text-[#565C6B] hover:text-[#8FB3F5] transition-colors"
          >
            {mode === "login" ? "還沒有帳號？點此建立" : "已經有帳號？點此登入"}
          </button>
        </form>
      </div>
    );
  }

  return children(user);
}

// ── Firestore persistence ───────────────────────────────────────────────
// Every project/topic lives under users/{uid}/projects and
// users/{uid}/topics. onSnapshot keeps every open tab/device live — edit
// on the phone, watch it update on the laptop with no refresh.
function normalizeLoaded(data) {
  const projects = (Array.isArray(data?.projects) ? data.projects : []).map((p) => ({
    ...p,
    target_date: normalizeDate(p.target_date),
  }));
  const topics = (Array.isArray(data?.topics) ? data.topics : []).map((t) => ({
    ...t,
    due_date: normalizeDate(t.due_date),
  }));
  return { projects, topics };
}

function useFirestoreStore(uid) {
  const [projects, setProjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [status, setStatus] = useState("同步中…");

  const projectsCol = useMemo(() => collection(db, "users", uid, "projects"), [uid]);
  const topicsCol = useMemo(() => collection(db, "users", uid, "topics"), [uid]);

  useEffect(() => {
    const unsub = onSnapshot(
      projectsCol,
      (snap) => {
        setProjects(snap.docs.map((d) => ({ project_id: d.id, ...d.data() })));
        setStatus(`即時同步中 · ${new Date().toLocaleTimeString("zh-TW")}`);
      },
      (err) => setStatus(`專案同步失敗：${err.message}`)
    );
    return unsub;
  }, [projectsCol]);

  useEffect(() => {
    const unsub = onSnapshot(topicsCol, (snap) => {
      setTopics(snap.docs.map((d) => ({ topic_id: d.id, ...d.data() })));
    });
    return unsub;
  }, [topicsCol]);

  const updateTopicStatus = useCallback(
    (topicId, newStatus) => {
      updateDoc(doc(topicsCol, topicId), { status: newStatus }).catch((e) => setStatus(`更新失敗：${e.message}`));
    },
    [topicsCol]
  );

  const updateTopicDueDate = useCallback(
    (topicId, newDate) => {
      updateDoc(doc(topicsCol, topicId), { due_date: normalizeDate(newDate) }).catch((e) =>
        setStatus(`更新失敗：${e.message}`)
      );
    },
    [topicsCol]
  );

  const updateProjectDueDate = useCallback(
    (projectId, newDate) => {
      updateDoc(doc(projectsCol, projectId), { target_date: normalizeDate(newDate) }).catch((e) =>
        setStatus(`更新失敗：${e.message}`)
      );
    },
    [projectsCol]
  );

  const addProject = useCallback(
    (data) =>
      addDoc(projectsCol, data).catch((e) => {
        setStatus(`新增失敗：${e.message}`);
        return null;
      }),
    [projectsCol]
  );

  const addTopic = useCallback(
    (data) => {
      addDoc(topicsCol, data).catch((e) => setStatus(`新增失敗：${e.message}`));
    },
    [topicsCol]
  );

  const updateTopic = useCallback(
    (topicId, data) => {
      updateDoc(doc(topicsCol, topicId), data).catch((e) => setStatus(`更新失敗：${e.message}`));
    },
    [topicsCol]
  );

  const deleteTopic = useCallback(
    (topicId) => {
      deleteDoc(doc(topicsCol, topicId)).catch((e) => setStatus(`刪除失敗：${e.message}`));
    },
    [topicsCol]
  );

  const importBulk = useCallback(
    async (data) => {
      const normalized = normalizeLoaded(data);
      const idMap = {};
      const batch = writeBatch(db);
      normalized.projects.forEach((p) => {
        const { project_id, ...rest } = p;
        const ref = doc(projectsCol);
        idMap[project_id] = ref.id;
        batch.set(ref, rest);
      });
      normalized.topics.forEach((t) => {
        const { topic_id, project_id, ...rest } = t;
        const ref = doc(topicsCol);
        batch.set(ref, { ...rest, project_id: project_id ? idMap[project_id] || null : null });
      });
      try {
        await batch.commit();
        setStatus(`已匯入 ${normalized.projects.length} 個專案、${normalized.topics.length} 個任務`);
      } catch (e) {
        setStatus(`匯入失敗：${e.message}`);
      }
    },
    [projectsCol, topicsCol]
  );

  const exportFile = useCallback(() => {
    const blob = new Blob([JSON.stringify({ projects, topics }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "work_log.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("已匯出備份：work_log.json");
  }, [projects, topics]);

  const loadSample = useCallback(() => importBulk({ projects: SAMPLE_PROJECTS, topics: SAMPLE_TOPICS }), [
    importBulk,
  ]);

  return {
    projects,
    topics,
    status,
    updateTopicStatus,
    updateTopicDueDate,
    updateProjectDueDate,
    addProject,
    addTopic,
    updateTopic,
    deleteTopic,
    importBulk,
    exportFile,
    loadSample,
  };
}

// ── Small building blocks ───────────────────────────────────────────────
function Led({ color, glow, size = 8 }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        boxShadow: `0 0 6px 1px ${glow}`,
      }}
    />
  );
}

function StatusChip({ status, styleMap }) {
  const s = styleMap[status];
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wide uppercase">
      <Led color={s.dot} glow={s.glow} />
      <span className={s.text}>{status}</span>
    </span>
  );
}

// Interactive status control — click the LED chip to reassign a topic's
// status from a dropdown, styled like selecting a channel on an instrument.
function StatusSelect({ status, onChange, compact = false }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const s = TOPIC_STATUS_STYLE[status];

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wide uppercase rounded transition-colors -mx-1.5 -my-0.5 px-1.5 py-0.5 ${
          open ? "bg-[#232833]" : "hover:bg-[#1E222B]"
        }`}
      >
        <Led color={s.dot} glow={s.glow} />
        {!compact && <span className={s.text}>{status}</span>}
        <ChevronDown size={11} className="text-[#4A5062]" />
      </button>

      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 w-36 rounded-md border border-[#2A2F3A] bg-[#1B1F28] shadow-lg shadow-black/50 py-1">
          {KANBAN_COLUMNS.map((st) => {
            const os = TOPIC_STATUS_STYLE[st];
            return (
              <button
                key={st}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(st);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide transition-colors hover:bg-[#242832] ${
                  st === status ? "bg-[#20242E]" : ""
                }`}
              >
                <Led color={os.dot} glow={os.glow} />
                <span className={os.text}>{st}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TypeChip({ type }) {
  const s = TOPIC_TYPE_STYLE[type];
  const Icon = s.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border ${s.border} ${s.bg} ${s.text} px-2 py-0.5 text-[11px] font-medium`}
    >
      <Icon size={12} strokeWidth={2} />
      {type}
    </span>
  );
}

function MetaBit({ icon: Icon, children }) {
  if (!children) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-[#8A90A0]">
      <Icon size={12} strokeWidth={2} />
      {children}
    </span>
  );
}

// ── Topic card (list view) ──────────────────────────────────────────────
function TopicRow({ topic, onStatusChange, onDueDateChange, onEdit, projectLabel, dueSoonMode }) {
  const days = dueSoonMode ? daysUntil(topic.due_date) : null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEdit(topic)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onEdit(topic);
      }}
      title="點擊編輯任務"
      className="group flex items-center justify-between gap-4 rounded-md border border-[#242832] bg-[#171A21] px-4 py-3.5 transition-colors hover:border-[#3A3F4C] hover:bg-[#1B1F28] cursor-pointer"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <StatusSelect status={topic.status} onChange={(st) => onStatusChange(topic.topic_id, st)} />
          {projectLabel && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wide text-[#565C6B] border border-[#242832] rounded px-1.5 py-0.5">
              <FolderKanban size={10} />
              {projectLabel}
            </span>
          )}
          {days !== null && (
            <span
              className={`text-[10px] font-mono uppercase tracking-wide ${
                days < 0 ? "text-[#F0898C]" : days <= 3 ? "text-[#F5C463]" : "text-[#565C6B]"
              }`}
            >
              {dueLabel(days)}
            </span>
          )}
        </div>
        <p className="truncate text-[14px] text-[#E7E9EE] font-medium mb-2">{topic.title}</p>
        <div className="flex flex-wrap items-center gap-3">
          <TypeChip type={topic.type} />
          <MetaBit icon={User}>{topic.customer}</MetaBit>
          <MetaBit icon={Building2}>{topic.department}</MetaBit>
          <DueDateEditor date={topic.due_date} onSave={(d) => onDueDateChange(topic.topic_id, d)} />
        </div>
      </div>
      <ChevronRight size={16} className="shrink-0 text-[#3A3F4C] group-hover:text-[#6B7280] transition-colors" />
    </div>
  );
}

// ── Topic card (kanban view) ────────────────────────────────────────────
function TopicCard({ topic, onStatusChange, onDueDateChange, onEdit, projectLabel, dueSoonMode }) {
  const days = dueSoonMode ? daysUntil(topic.due_date) : null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEdit(topic)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onEdit(topic);
      }}
      title="點擊編輯任務"
      className="rounded-md border border-[#242832] bg-[#171A21] p-3.5 hover:border-[#3A3F4C] transition-colors cursor-pointer"
    >
      <div className="flex items-center justify-between mb-2">
        <StatusSelect status={topic.status} onChange={(st) => onStatusChange(topic.topic_id, st)} compact />
        <TypeChip type={topic.type} />
      </div>
      {(projectLabel || days !== null) && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {projectLabel && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wide text-[#565C6B] border border-[#242832] rounded px-1.5 py-0.5">
              <FolderKanban size={10} />
              {projectLabel}
            </span>
          )}
          {days !== null && (
            <span
              className={`text-[10px] font-mono uppercase tracking-wide ${
                days < 0 ? "text-[#F0898C]" : days <= 3 ? "text-[#F5C463]" : "text-[#565C6B]"
              }`}
            >
              {dueLabel(days)}
            </span>
          )}
        </div>
      )}
      <p className="text-[13.5px] text-[#E7E9EE] font-medium leading-snug mb-3">{topic.title}</p>
      <div className="flex flex-wrap items-center gap-3">
        <MetaBit icon={User}>{topic.customer}</MetaBit>
        <MetaBit icon={Building2}>{topic.department}</MetaBit>
        <DueDateEditor date={topic.due_date} onSave={(d) => onDueDateChange(topic.topic_id, d)} />
      </div>
    </div>
  );
}

// Inline editor for a project's due date. Click the date (or the "add due
// date" affordance when it's missing) to type a value; Enter saves, Esc
// cancels. Stops propagation so it never triggers the parent's select.
function DueDateEditor({ date, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(date || "");
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = value.trim();
    setEditing(false);
    if (trimmed && trimmed !== date) onSave(normalizeDate(trimmed));
    if (!trimmed) setValue(date || "");
  };

  const cancel = () => {
    setValue(date || "");
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancel();
        }}
        placeholder="例如 2026-12-31"
        className="w-full bg-[#0F1115] border border-[#3A3F4C] rounded px-1.5 py-0.5 text-[11px] text-[#E7E9EE] font-mono outline-none focus:border-[#F5A623]"
      />
    );
  }

  if (!date) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className="flex items-center gap-1 text-[11px] text-[#565C6B] hover:text-[#8FB3F5] transition-colors"
      >
        <Plus size={11} />
        設定到期日
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="flex items-center gap-1 text-[11px] text-[#565C6B] hover:text-[#8FB3F5] transition-colors"
      title="點擊修改到期日"
    >
      <CalendarClock size={11} />
      {date}
    </button>
  );
}

// ── Modal shell ──────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-[#2A2F3A] bg-[#171A21] shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#242832]">
          <h3 className="text-[14px] font-semibold text-[#E7E9EE]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#565C6B] hover:text-[#B3B8C4] transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="block text-[10px] font-mono uppercase tracking-wide text-[#565C6B] mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full bg-[#0F1115] border border-[#2A2F3A] rounded px-3 py-2 text-[13px] text-[#E7E9EE] outline-none focus:border-[#F5A623] transition-colors placeholder:text-[#4A5062]";

// ── Add Project form ────────────────────────────────────────────────────
function AddProjectForm({ onSubmit, onClose }) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("進行中");
  const [customer, setCustomer] = useState("");
  const [department, setDepartment] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("請輸入專案名稱");
      return;
    }
    onSubmit({
      title: title.trim(),
      status,
      customer: customer.trim() || null,
      department: department.trim() || null,
      target_date: normalizeDate(targetDate.trim()) || null,
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit}>
      <Field label="專案名稱 *">
        <input
          autoFocus
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError("");
          }}
          placeholder="例如 GB200 測試方案導入"
          className={inputClass}
        />
        {error && <p className="mt-1 text-[11px] text-[#F0898C]">{error}</p>}
      </Field>
      <Field label="狀態">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
          {Object.keys(PROJECT_STATUS_STYLE).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="客戶（選填）">
        <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="例如 NVIDIA" className={inputClass} />
      </Field>
      <Field label="部門（選填）">
        <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="例如 RD" className={inputClass} />
      </Field>
      <Field label="目標日期（選填，建議 YYYY-MM-DD）">
        <input value={targetDate} onChange={(e) => setTargetDate(e.target.value)} placeholder="2026-12-31" className={inputClass} />
      </Field>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-[12px] text-[#8A90A0] hover:text-[#B3B8C4] transition-colors">
          取消
        </button>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-md bg-[#F5A623] text-[#171208] px-3.5 py-1.5 text-[12px] font-semibold hover:bg-[#F7B84D] transition-colors"
        >
          <Plus size={13} />
          新增專案
        </button>
      </div>
    </form>
  );
}

// ── Add Topic form ───────────────────────────────────────────────────────
function AddTopicForm({ projects, defaultProjectId, onSubmit, onClose }) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [status, setStatus] = useState("待處理");
  const [customer, setCustomer] = useState("");
  const [department, setDepartment] = useState("");
  const [type, setType] = useState("未分類");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("請輸入任務名稱");
      return;
    }
    onSubmit({
      title: title.trim(),
      project_id: projectId || null,
      status,
      customer: customer.trim() || null,
      department: department.trim() || null,
      type,
      due_date: normalizeDate(dueDate.trim()) || null,
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit}>
      <Field label="任務名稱 *">
        <input
          autoFocus
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError("");
          }}
          placeholder="例如 VNA measurement discussion"
          className={inputClass}
        />
        {error && <p className="mt-1 text-[11px] text-[#F0898C]">{error}</p>}
      </Field>
      <Field label="所屬專案">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputClass}>
          <option value="">獨立任務（無所屬專案）</option>
          {projects.map((p) => (
            <option key={p.project_id} value={p.project_id}>
              {p.title}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="狀態">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            {KANBAN_COLUMNS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="類型">
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
            {Object.keys(TOPIC_TYPE_STYLE).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="客戶（選填）">
          <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="例如 MPI" className={inputClass} />
        </Field>
        <Field label="部門（選填）">
          <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="例如 PCB" className={inputClass} />
        </Field>
      </div>
      <Field label="到期日（選填，建議 YYYY-MM-DD）">
        <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder="2026-08-25" className={inputClass} />
      </Field>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-[12px] text-[#8A90A0] hover:text-[#B3B8C4] transition-colors">
          取消
        </button>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-md bg-[#F5A623] text-[#171208] px-3.5 py-1.5 text-[12px] font-semibold hover:bg-[#F7B84D] transition-colors"
        >
          <Plus size={13} />
          新增任務
        </button>
      </div>
    </form>
  );
}

// ── Edit Topic form ──────────────────────────────────────────────────────
// Same fields as AddTopicForm, pre-filled — this is also how a topic gets
// re-filed under a different project (or made standalone) after the fact,
// which the inline status/due-date editors on the card can't do.
function EditTopicForm({ topic, projects, onSubmit, onDelete, onClose }) {
  const [title, setTitle] = useState(topic.title);
  const [projectId, setProjectId] = useState(topic.project_id || "");
  const [status, setStatus] = useState(topic.status);
  const [customer, setCustomer] = useState(topic.customer || "");
  const [department, setDepartment] = useState(topic.department || "");
  const [type, setType] = useState(topic.type);
  const [dueDate, setDueDate] = useState(topic.due_date || "");
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("請輸入任務名稱");
      return;
    }
    onSubmit({
      title: title.trim(),
      project_id: projectId || null,
      status,
      customer: customer.trim() || null,
      department: department.trim() || null,
      type,
      due_date: normalizeDate(dueDate.trim()) || null,
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit}>
      <Field label="任務名稱 *">
        <input
          autoFocus
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError("");
          }}
          className={inputClass}
        />
        {error && <p className="mt-1 text-[11px] text-[#F0898C]">{error}</p>}
      </Field>
      <Field label="所屬專案">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputClass}>
          <option value="">獨立任務（無所屬專案）</option>
          {projects.map((p) => (
            <option key={p.project_id} value={p.project_id}>
              {p.title}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="狀態">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            {KANBAN_COLUMNS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="類型">
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
            {Object.keys(TOPIC_TYPE_STYLE).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="客戶（選填）">
          <input value={customer} onChange={(e) => setCustomer(e.target.value)} className={inputClass} />
        </Field>
        <Field label="部門（選填）">
          <input value={department} onChange={(e) => setDepartment(e.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="到期日（選填，建議 YYYY-MM-DD）">
        <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder="2026-08-25" className={inputClass} />
      </Field>
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            if (confirmingDelete) {
              onDelete();
              onClose();
            } else {
              setConfirmingDelete(true);
            }
          }}
          className={`px-2.5 py-1.5 text-[12px] rounded-md transition-colors ${
            confirmingDelete
              ? "bg-[#4A2A2C] text-[#F0898C] hover:bg-[#5A3234]"
              : "text-[#8A6A6D] hover:text-[#F0898C]"
          }`}
        >
          {confirmingDelete ? "確定刪除？再按一次" : "刪除任務"}
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-[12px] text-[#8A90A0] hover:text-[#B3B8C4] transition-colors">
            取消
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md bg-[#F5A623] text-[#171208] px-3.5 py-1.5 text-[12px] font-semibold hover:bg-[#F7B84D] transition-colors"
          >
            儲存變更
          </button>
        </div>
      </div>
    </form>
  );
}

// ── Sidebar project item ────────────────────────────────────────────────
function ProjectItem({ project, active, onClick, count, onSetDueDate }) {
  const s = PROJECT_STATUS_STYLE[project.status];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className={`w-full text-left rounded-md px-3 py-3 transition-colors border cursor-pointer ${
        active
          ? "bg-[#1E222B] border-[#3A3F4C]"
          : "bg-transparent border-transparent hover:bg-[#171A21] hover:border-[#242832]"
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Led color={s.dot} glow={s.glow} />
          <span className={`font-mono text-[10px] uppercase tracking-wide ${s.text}`}>{project.status}</span>
        </div>
        <span className="font-mono text-[10px] text-[#565C6B]">{count}</span>
      </div>
      <p className={`text-[13px] font-medium leading-snug ${active ? "text-[#E7E9EE]" : "text-[#B3B8C4]"}`}>
        {project.title}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {project.customer && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[#8FB3F5]">
            <User size={11} />
            {project.customer}
          </span>
        )}
        <DueDateEditor date={project.target_date} onSave={(d) => onSetDueDate(project.project_id, d)} />
      </div>
    </div>
  );
}

// ── Sync / account panel ────────────────────────────────────────────────
function SyncPanel({ store, user }) {
  const fileInputRef = useRef(null);
  const isEmpty = store.projects.length === 0 && store.topics.length === 0;

  return (
    <div className="relative mt-3 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#565C6B]">
        <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0 bg-[#45D9B0]" />
        <span className="truncate">{store.status}</span>
      </div>
      <div className="flex items-center justify-between gap-1.5 text-[10px] font-mono text-[#565C6B]">
        <span className="truncate">{user.email}</span>
        <button type="button" onClick={() => signOut(auth)} className={fileBtnClass}>
          <LogOut size={11} />
          登出
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => fileInputRef.current?.click()} className={fileBtnClass}>
          <Upload size={11} />
          匯入 JSON
        </button>
        <button type="button" onClick={store.exportFile} className={fileBtnClass}>
          <Download size={11} />
          匯出備份
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
              try {
                store.importBulk(JSON.parse(reader.result || "{}"));
              } catch (err) {
                // ignore malformed file — status stays as-is
              }
            };
            reader.readAsText(f);
            e.target.value = "";
          }}
        />
        {isEmpty && (
          <button type="button" onClick={store.loadSample} className={fileBtnClass}>
            載入範例
          </button>
        )}
      </div>
    </div>
  );
}

const fileBtnClass =
  "inline-flex items-center gap-1 rounded border border-[#242832] px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-[#8A90A0] hover:text-[#E7E9EE] hover:border-[#3A3F4C] transition-colors";

// ── Main app ─────────────────────────────────────────────────────────────
const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 280;

function WorkLogConsole({ user }) {
  const store = useFirestoreStore(user.uid);
  const {
    projects,
    topics,
    updateTopicStatus,
    updateTopicDueDate,
    updateProjectDueDate,
    addTopic,
    updateTopic,
    deleteTopic,
  } = store;

  const [selected, setSelected] = useState("standalone");
  const [viewMode, setViewMode] = useState("list"); // 'list' | 'kanban'
  const [dueSoonWindow, setDueSoonWindow] = useState(7);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [editingTopic, setEditingTopic] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const selectView = useCallback((id) => {
    setSelected(id);
    setMobileNavOpen(false);
  }, []);

  const addProject = useCallback(
    async (data) => {
      const ref = await store.addProject(data);
      if (ref) setSelected(ref.id);
    },
    [store.addProject]
  );

  // ── Resizable sidebar ──
  const containerRef = useRef(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [isDragging, setIsDragging] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const checkWidth = () => setIsDesktop(window.innerWidth >= 768);
    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

  const handleDragMove = useCallback((e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, clientX - rect.left));
    setSidebarWidth(next);
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    window.addEventListener("mousemove", handleDragMove);
    window.addEventListener("mouseup", handleDragEnd);
    window.addEventListener("touchmove", handleDragMove);
    window.addEventListener("touchend", handleDragEnd);
    return () => {
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchmove", handleDragMove);
      window.removeEventListener("touchend", handleDragEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const topicCounts = useMemo(() => {
    const map = {};
    projects.forEach((p) => {
      map[p.project_id] = topics.filter((t) => t.project_id === p.project_id).length;
    });
    map.standalone = topics.filter((t) => t.project_id === null).length;
    map.duesoon = topics.filter((t) => t.due_date && t.status !== "結案" && daysUntil(t.due_date) <= 7).length;
    return map;
  }, [topics, projects]);

  const projectsById = useMemo(() => {
    const map = {};
    projects.forEach((p) => (map[p.project_id] = p.title));
    return map;
  }, [projects]);

  const isDueSoonMode = selected === "duesoon";
  const activeProject =
    selected === "standalone" || isDueSoonMode ? null : projects.find((p) => p.project_id === selected);

  const filteredTopics = useMemo(() => {
    if (isDueSoonMode) {
      return topics
        .filter((t) => t.due_date && t.status !== "結案" && daysUntil(t.due_date) <= dueSoonWindow)
        .sort((a, b) => a.due_date.localeCompare(b.due_date));
    }
    if (selected === "standalone") return topics.filter((t) => t.project_id === null);
    return topics.filter((t) => t.project_id === selected);
  }, [selected, topics, isDueSoonMode, dueSoonWindow]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full min-h-[640px] bg-[#0F1115] flex flex-col md:flex-row font-sans text-[#E7E9EE] ${
        isDragging ? "select-none cursor-col-resize" : ""
      }`}
    >
      {/* ── Mobile drawer backdrop ── */}
      {!isDesktop && mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      {/* On mobile this is an off-canvas drawer (fixed + translate), toggled by
          the header's menu button, so the main content is visible immediately
          instead of requiring a long scroll past the whole nav list. */}
      <aside
        style={isDesktop ? { width: sidebarWidth } : undefined}
        className={`fixed inset-y-0 left-0 z-40 w-[85%] max-w-[320px] transform transition-transform duration-200 ease-in-out ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        } md:static md:z-auto md:w-[280px] md:translate-x-0 md:transition-none md:max-w-none shrink-0 border-b md:border-b-0 md:border-r border-[#242832] bg-[#12141A] flex flex-col overflow-hidden`}
      >
        <div className="px-5 pt-5 pb-4 border-b border-[#242832] relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.06] pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(#8FB3F5 1px, transparent 1px), linear-gradient(90deg, #8FB3F5 1px, transparent 1px)",
              backgroundSize: "14px 14px",
            }}
          />
          <div className="relative flex items-center gap-2 mb-1">
            <Radio size={16} className="text-[#F5A623]" strokeWidth={2} />
            <span className="font-mono text-[10px] tracking-[0.2em] text-[#565C6B] uppercase">Work Log Console</span>
          </div>
          <h1 className="relative text-[16px] font-semibold text-[#E7E9EE]">工作任務與專案追蹤（本地版）</h1>
          <SyncPanel store={store} user={user} />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="px-2 mb-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wide text-[#565C6B]">
            <Timer size={11} />
            Views
          </div>
          <button
            onClick={() => selectView("duesoon")}
            className={`w-full text-left rounded-md px-3 py-3 mb-5 transition-colors border ${
              isDueSoonMode
                ? "bg-[#1E222B] border-[#3A3F4C]"
                : "bg-transparent border-transparent hover:bg-[#171A21] hover:border-[#242832]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[13px] font-medium ${isDueSoonMode ? "text-[#E7E9EE]" : "text-[#B3B8C4]"}`}>
                即將到期 (Due Soon)
              </span>
              {topicCounts.duesoon > 0 && (
                <span className="font-mono text-[10px] rounded-full bg-[#3A2A1A] text-[#F5C463] px-1.5 py-0.5">
                  {topicCounts.duesoon}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-[#565C6B]">7 天內到期的任務數</p>
          </button>

          <div className="px-2 mb-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-wide text-[#565C6B]">
            <span className="flex items-center gap-1.5">
              <FolderKanban size={11} />
              Projects
            </span>
            <button
              type="button"
              onClick={() => setShowAddProject(true)}
              className="flex items-center gap-0.5 text-[#565C6B] hover:text-[#F5C463] transition-colors"
              title="新增專案"
            >
              <Plus size={12} />
            </button>
          </div>
          <div className="flex flex-col gap-1.5 mb-5">
            {projects.map((p) => (
              <ProjectItem
                key={p.project_id}
                project={p}
                active={selected === p.project_id}
                count={topicCounts[p.project_id]}
                onClick={() => selectView(p.project_id)}
                onSetDueDate={updateProjectDueDate}
              />
            ))}
          </div>

          <div className="px-2 mb-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wide text-[#565C6B]">
            <Layers size={11} />
            Unassigned
          </div>
          <button
            onClick={() => selectView("standalone")}
            className={`w-full text-left rounded-md px-3 py-3 transition-colors border ${
              selected === "standalone"
                ? "bg-[#1E222B] border-[#3A3F4C]"
                : "bg-transparent border-transparent hover:bg-[#171A21] hover:border-[#242832]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-[13px] font-medium ${
                  selected === "standalone" ? "text-[#E7E9EE]" : "text-[#B3B8C4]"
                }`}
              >
                獨立任務 (Standalone Topics)
              </span>
              <span className="font-mono text-[10px] text-[#565C6B]">{topicCounts.standalone}</span>
            </div>
          </button>
        </div>
      </aside>

      {/* ── Resize handle ── */}
      <div
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        className={`hidden md:flex relative w-[5px] shrink-0 cursor-col-resize items-center justify-center group ${
          isDragging ? "bg-[#F5A623]/40" : "bg-[#242832] hover:bg-[#3A3F4C]"
        }`}
      >
        <span
          className={`absolute w-[3px] h-8 rounded-full transition-colors ${
            isDragging ? "bg-[#F5A623]" : "bg-[#3A3F4C] group-hover:bg-[#565C6B]"
          }`}
        />
      </div>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="px-6 pt-6 pb-4 border-b border-[#242832]">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="md:hidden mb-4 inline-flex items-center gap-1.5 rounded-md border border-[#242832] bg-[#171A21] px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-[#8A90A0] hover:text-[#E7E9EE] transition-colors"
          >
            <Menu size={14} />
            專案 / 檢視
          </button>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              {isDueSoonMode ? (
                <>
                  <span className="font-mono text-[10px] tracking-wide uppercase text-[#565C6B]">
                    Cross-project View
                  </span>
                  <h2 className="text-[19px] font-semibold text-[#E7E9EE] leading-tight mt-1 mb-3">
                    即將到期任務
                  </h2>
                  <div className="flex items-center gap-1 rounded-md border border-[#242832] bg-[#171A21] p-1 w-fit">
                    {DUE_WINDOWS.map((w) => (
                      <button
                        key={w.days}
                        onClick={() => setDueSoonWindow(w.days)}
                        className={`rounded px-3 py-1.5 text-[12px] font-medium transition-colors ${
                          dueSoonWindow === w.days
                            ? "bg-[#2A2F3A] text-[#E7E9EE]"
                            : "text-[#8A90A0] hover:text-[#B3B8C4]"
                        }`}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : activeProject ? (
                <>
                  <div className="flex items-center gap-2 mb-1.5">
                    <StatusChip status={activeProject.status} styleMap={PROJECT_STATUS_STYLE} />
                  </div>
                  <h2 className="text-[19px] font-semibold text-[#E7E9EE] leading-tight">{activeProject.title}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    <MetaBit icon={User}>{activeProject.customer}</MetaBit>
                    <MetaBit icon={Building2}>{activeProject.department}</MetaBit>
                    <MetaBit icon={CalendarClock}>{`目標日期 ${activeProject.target_date}`}</MetaBit>
                  </div>
                </>
              ) : (
                <>
                  <span className="font-mono text-[10px] tracking-wide uppercase text-[#565C6B]">
                    No Project Binding
                  </span>
                  <h2 className="text-[19px] font-semibold text-[#E7E9EE] leading-tight mt-1">
                    獨立任務 (Standalone Topics)
                  </h2>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowAddTopic(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#F5A623] text-[#171208] px-3 py-1.5 text-[12px] font-semibold hover:bg-[#F7B84D] transition-colors"
              >
                <Plus size={13} />
                新增任務
              </button>

              {/* View toggle */}
              <div className="flex items-center gap-1 rounded-md border border-[#242832] bg-[#171A21] p-1">
                <button
                  onClick={() => setViewMode("list")}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    viewMode === "list" ? "bg-[#2A2F3A] text-[#E7E9EE]" : "text-[#8A90A0] hover:text-[#B3B8C4]"
                  }`}
                >
                  <List size={13} />
                  清單
                </button>
                <button
                  onClick={() => setViewMode("kanban")}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    viewMode === "kanban" ? "bg-[#2A2F3A] text-[#E7E9EE]" : "text-[#8A90A0] hover:text-[#B3B8C4]"
                  }`}
                >
                  <LayoutGrid size={13} />
                  看板
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {filteredTopics.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <CircleDot size={22} className="text-[#3A3F4C] mb-3" />
              <p className="text-[13px] text-[#565C6B]">
                {isDueSoonMode ? "這段期間內沒有到期任務" : "尚無任務記錄"}
              </p>
              {projects.length === 0 && topics.length === 0 && (
                <p className="mt-2 text-[11px] text-[#3A3F4C]">
                  點左側「載入範例」試用，或用「新增專案／新增任務」開始記錄
                </p>
              )}
            </div>
          ) : viewMode === "list" ? (
            <div className="flex flex-col gap-2.5 max-w-5xl">
              {filteredTopics.map((t) => (
                <TopicRow
                  key={t.topic_id}
                  topic={t}
                  onStatusChange={updateTopicStatus}
                  onDueDateChange={updateTopicDueDate}
                  onEdit={setEditingTopic}
                  projectLabel={isDueSoonMode ? projectsById[t.project_id] || "獨立任務" : null}
                  dueSoonMode={isDueSoonMode}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {KANBAN_COLUMNS.map((col) => {
                const colStyle = TOPIC_STATUS_STYLE[col];
                const items = filteredTopics.filter((t) => t.status === col);
                return (
                  <div key={col} className="flex flex-col min-w-0">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide">
                        <Led color={colStyle.dot} glow={colStyle.glow} />
                        <span className={colStyle.text}>{col}</span>
                      </span>
                      <span className="font-mono text-[10px] text-[#565C6B]">{items.length}</span>
                    </div>
                    <div className="flex flex-col gap-2.5 rounded-md bg-[#12141A] border border-[#1D212A] p-2.5 min-h-[120px]">
                      {items.length === 0 ? (
                        <p className="text-[11px] text-[#3A3F4C] text-center py-6">—</p>
                      ) : (
                        items.map((t) => (
                          <TopicCard
                            key={t.topic_id}
                            topic={t}
                            onStatusChange={updateTopicStatus}
                            onDueDateChange={updateTopicDueDate}
                            onEdit={setEditingTopic}
                            projectLabel={isDueSoonMode ? projectsById[t.project_id] || "獨立任務" : null}
                            dueSoonMode={isDueSoonMode}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {showAddProject && (
        <Modal title="新增專案" onClose={() => setShowAddProject(false)}>
          <AddProjectForm onSubmit={addProject} onClose={() => setShowAddProject(false)} />
        </Modal>
      )}

      {showAddTopic && (
        <Modal title="新增任務" onClose={() => setShowAddTopic(false)}>
          <AddTopicForm
            projects={projects}
            defaultProjectId={isDueSoonMode || selected === "standalone" ? "" : selected}
            onSubmit={addTopic}
            onClose={() => setShowAddTopic(false)}
          />
        </Modal>
      )}

      {editingTopic && (
        <Modal title="編輯任務" onClose={() => setEditingTopic(null)}>
          <EditTopicForm
            topic={editingTopic}
            projects={projects}
            onSubmit={(data) => updateTopic(editingTopic.topic_id, data)}
            onDelete={() => deleteTopic(editingTopic.topic_id)}
            onClose={() => setEditingTopic(null)}
          />
        </Modal>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <AuthGate>{(user) => <WorkLogConsole user={user} />}</AuthGate>
);
