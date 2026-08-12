import { useState, useEffect, useCallback, useRef } from "react";
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import { db } from "./firebase.js";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const shortId = (id) => "WO-" + id.slice(-5).toUpperCase();

const todayStr = () => {
  const d = new Date();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const DOC_REF = doc(db, "workorders", "main");

const STATUS = {
  assigned: { label: "Assigned", color: "var(--steel)" },
  in_progress: { label: "In Progress", color: "var(--safety)" },
  done: { label: "Complete", color: "var(--route-green)" },
};

export default function WorkOrdersApp() {
  const [loading, setLoading] = useState(true);
  const [connError, setConnError] = useState(false);
  const [roster, setRoster] = useState([]);
  const [tasks, setTasks] = useState([]);
  const dataRef = useRef({ roster: [], tasks: [] });

  const [session, setSession] = useState(null);
  const [loginRole, setLoginRole] = useState(null);
  const [loginName, setLoginName] = useState("");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [setupPin, setSetupPin] = useState("");
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpPin, setNewEmpPin] = useState("");
  const [showNewTask, setShowNewTask] = useState(false);
  const [taskDraft, setTaskDraft] = useState({ title: "", details: "", assignee: "", priority: "normal" });
  const [completeNoteFor, setCompleteNoteFor] = useState(null);
  const [completeNote, setCompleteNote] = useState("");
  const [filter, setFilter] = useState("all");

  // Real-time sync: listens for changes from any device (supervisor or crew) and
  // pushes local writes back up. This is what makes the board update live everywhere.
  useEffect(() => {
    let unsub;
    (async () => {
      try {
        const snap = await getDoc(DOC_REF);
        if (!snap.exists()) {
          await setDoc(DOC_REF, { roster: [], tasks: [] });
        }
        unsub = onSnapshot(
          DOC_REF,
          (s) => {
            const data = s.data() || { roster: [], tasks: [] };
            dataRef.current = data;
            setRoster(data.roster || []);
            setTasks(data.tasks || []);
            setLoading(false);
          },
          (err) => {
            console.error("Firestore listen error", err);
            setConnError(true);
            setLoading(false);
          }
        );
      } catch (err) {
        console.error("Firestore init error", err);
        setConnError(true);
        setLoading(false);
      }
    })();
    return () => unsub && unsub();
  }, []);

  const persistTasks = useCallback(async (next) => {
    setTasks(next);
    await setDoc(DOC_REF, { ...dataRef.current, tasks: next }, { merge: true });
  }, []);
  const persistRoster = useCallback(async (next) => {
    setRoster(next);
    await setDoc(DOC_REF, { ...dataRef.current, roster: next }, { merge: true });
  }, []);

  const supervisorExists = roster.some((p) => p.role === "supervisor");
  const employees = roster.filter((p) => p.role === "employee");

  function resetLoginForm() {
    setLoginName("");
    setPin("");
    setLoginError("");
    setSetupPin("");
  }

  async function handleSupervisorSetup(e) {
    e.preventDefault();
    if (setupPin.length < 4) {
      setLoginError("Choose a PIN of at least 4 digits.");
      return;
    }
    const supervisor = { id: uid(), name: "Supervisor", role: "supervisor", pin: setupPin };
    await persistRoster([...roster, supervisor]);
    setSession(supervisor);
    resetLoginForm();
    setLoginRole(null);
  }

  function handleSupervisorLogin(e) {
    e.preventDefault();
    const sup = roster.find((p) => p.role === "supervisor");
    if (sup && sup.pin === pin) {
      setSession(sup);
      resetLoginForm();
      setLoginRole(null);
    } else {
      setLoginError("Wrong PIN.");
    }
  }

  function handleEmployeeLogin(e) {
    e.preventDefault();
    const emp = employees.find((p) => p.name === loginName);
    if (emp && emp.pin === pin) {
      setSession(emp);
      resetLoginForm();
      setLoginRole(null);
    } else {
      setLoginError("Name and PIN don't match.");
    }
  }

  async function addEmployee(e) {
    e.preventDefault();
    if (!newEmpName.trim() || newEmpPin.length < 4) return;
    const emp = { id: uid(), name: newEmpName.trim(), role: "employee", pin: newEmpPin };
    await persistRoster([...roster, emp]);
    setNewEmpName("");
    setNewEmpPin("");
    setShowAddEmployee(false);
  }

  async function removeEmployee(id) {
    await persistRoster(roster.filter((p) => p.id !== id));
  }

  async function createTask(e) {
    e.preventDefault();
    if (!taskDraft.title.trim() || !taskDraft.assignee) return;
    const task = {
      id: uid(),
      title: taskDraft.title.trim(),
      details: taskDraft.details.trim(),
      assignee: taskDraft.assignee,
      priority: taskDraft.priority,
      status: "assigned",
      createdAt: todayStr(),
      completedAt: null,
      note: "",
      seenBySupervisor: true,
    };
    await persistTasks([task, ...tasks]);
    setTaskDraft({ title: "", details: "", assignee: "", priority: "normal" });
    setShowNewTask(false);
  }

  async function startTask(id) {
    await persistTasks(tasks.map((t) => (t.id === id ? { ...t, status: "in_progress" } : t)));
  }

  function openCompleteDialog(id) {
    setCompleteNoteFor(id);
    setCompleteNote("");
  }

  async function completeTask() {
    await persistTasks(
      tasks.map((t) =>
        t.id === completeNoteFor
          ? { ...t, status: "done", completedAt: todayStr(), note: completeNote.trim(), seenBySupervisor: false }
          : t
      )
    );
    setCompleteNoteFor(null);
    setCompleteNote("");
  }

  async function markSeen(id) {
    await persistTasks(tasks.map((t) => (t.id === id ? { ...t, seenBySupervisor: true } : t)));
  }

  async function markAllSeen() {
    await persistTasks(tasks.map((t) => ({ ...t, seenBySupervisor: true })));
  }

  const unseenCompleted = tasks.filter((t) => t.status === "done" && !t.seenBySupervisor).length;

  const styles = `
    .wo-root { --ink:#1C1F22; --paper:#F3F0E8; --paper-dark:#E7E2D5; --safety:#F2B705; --route-green:#3C7A5C; --caution-red:#B8452F; --steel:#6B7176;
      font-family: -apple-system, "Segoe UI", system-ui, sans-serif; color: var(--ink); background: var(--paper);
      min-height: 100vh; }
    .wo-display { font-family: "Arial Narrow", "Helvetica Neue Condensed", Impact, sans-serif; font-weight: 800; letter-spacing: 0.02em; text-transform: uppercase; }
    .wo-mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
    .wo-ticket { position: relative; background: #fff; border: 1px solid #d8d2c2; border-radius: 2px;
      box-shadow: 0 1px 0 rgba(0,0,0,0.04); overflow: hidden; }
    .wo-ticket::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 6px;
      background-image: radial-gradient(circle, var(--paper) 2px, transparent 2.5px);
      background-size: 6px 12px; background-position: 0 4px; background-color: var(--ink); }
    .wo-stamp { position: absolute; top: 14px; right: 14px; font-family: "Arial Narrow", sans-serif; font-weight: 900;
      letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 10px; border: 3px solid currentColor;
      border-radius: 4px; transform: rotate(-7deg); opacity: 0.85; font-size: 11px; pointer-events: none; }
    .wo-btn { font-family: "Arial Narrow", sans-serif; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase;
      transition: transform 0.08s ease, filter 0.15s ease; }
    .wo-btn:active { transform: scale(0.97); }
    input[type=text].wo-input, input[type=password].wo-input, textarea.wo-input, select.wo-input {
      background: var(--paper); border: 1px solid #cfc8b4; border-radius: 3px; padding: 10px 12px; font-size: 15px; width: 100%; }
    input.wo-input:focus, textarea.wo-input:focus, select.wo-input:focus { outline: 2px solid var(--safety); outline-offset: 1px; border-color: var(--safety); }
  `;

  if (connError) {
    return (
      <div className="wo-root flex items-center justify-center p-10 text-center">
        <style>{styles}</style>
        <div className="max-w-sm">
          <div className="wo-display text-lg mb-2" style={{ color: "var(--caution-red)" }}>Can't reach the database</div>
          <div className="text-sm" style={{ color: "var(--steel)" }}>
            Check that the Firebase config in src/firebase.js has been filled in with your real project keys, and that Firestore is enabled in your Firebase console. See SETUP.md.
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="wo-root flex items-center justify-center p-10">
        <style>{styles}</style>
        <div className="wo-mono text-sm" style={{ color: "var(--steel)" }}>loading dispatch board…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="wo-root flex flex-col items-center px-5 py-10">
        <style>{styles}</style>
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="wo-display text-3xl" style={{ letterSpacing: "0.06em" }}>Work Orders</div>
            <div className="wo-mono text-xs mt-1" style={{ color: "var(--steel)" }}>crew dispatch board</div>
          </div>

          {!supervisorExists ? (
            <form onSubmit={handleSupervisorSetup} className="wo-ticket p-6 pl-8">
              <div className="wo-display text-sm mb-1" style={{ color: "var(--steel)" }}>First-time setup</div>
              <div className="text-sm mb-4">Set a PIN for the supervisor account. You'll use this to log in and assign work.</div>
              <input
                className="wo-input mb-3"
                type="password"
                placeholder="Choose a PIN (4+ digits)"
                value={setupPin}
                onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
              />
              {loginError && <div className="text-sm mb-3" style={{ color: "var(--caution-red)" }}>{loginError}</div>}
              <button type="submit" className="wo-btn w-full py-3 rounded text-white text-sm" style={{ background: "var(--ink)" }}>
                Create Supervisor Account
              </button>
            </form>
          ) : loginRole === null ? (
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setLoginRole("supervisor"); resetLoginForm(); }}
                className="wo-btn wo-ticket p-5 pl-8 text-left text-sm"
              >
                Supervisor
              </button>
              <button
                onClick={() => { setLoginRole("employee"); resetLoginForm(); }}
                className="wo-btn wo-ticket p-5 pl-8 text-left text-sm"
              >
                Crew
              </button>
            </div>
          ) : loginRole === "supervisor" ? (
            <form onSubmit={handleSupervisorLogin} className="wo-ticket p-6 pl-8">
              <div className="wo-display text-sm mb-4" style={{ color: "var(--steel)" }}>Supervisor Login</div>
              <input
                className="wo-input mb-3"
                type="password"
                placeholder="PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                autoFocus
              />
              {loginError && <div className="text-sm mb-3" style={{ color: "var(--caution-red)" }}>{loginError}</div>}
              <button type="submit" className="wo-btn w-full py-3 rounded text-white text-sm mb-2" style={{ background: "var(--ink)" }}>
                Log In
              </button>
              <button type="button" onClick={() => setLoginRole(null)} className="wo-btn w-full py-2 text-xs" style={{ color: "var(--steel)" }}>
                Back
              </button>
            </form>
          ) : (
            <form onSubmit={handleEmployeeLogin} className="wo-ticket p-6 pl-8">
              <div className="wo-display text-sm mb-4" style={{ color: "var(--steel)" }}>Crew Login</div>
              {employees.length === 0 ? (
                <div className="text-sm mb-3" style={{ color: "var(--steel)" }}>
                  No crew accounts yet. Ask your supervisor to add you.
                </div>
              ) : (
                <select className="wo-input mb-3" value={loginName} onChange={(e) => setLoginName(e.target.value)}>
                  <option value="">Select your name</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.name}>{e.name}</option>
                  ))}
                </select>
              )}
              <input
                className="wo-input mb-3"
                type="password"
                placeholder="PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
              />
              {loginError && <div className="text-sm mb-3" style={{ color: "var(--caution-red)" }}>{loginError}</div>}
              <button type="submit" className="wo-btn w-full py-3 rounded text-white text-sm mb-2" style={{ background: "var(--ink)" }} disabled={employees.length === 0}>
                Log In
              </button>
              <button type="button" onClick={() => setLoginRole(null)} className="wo-btn w-full py-2 text-xs" style={{ color: "var(--steel)" }}>
                Back
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (session.role === "supervisor") {
    const visibleTasks = tasks.filter((t) => filter === "all" || t.status === filter);
    return (
      <div className="wo-root min-h-screen">
        <style>{styles}</style>
        <header className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #d8d2c2" }}>
          <div>
            <div className="wo-display text-xl">Dispatch Board</div>
            <div className="wo-mono text-xs" style={{ color: "var(--steel)" }}>{todayStr()}</div>
          </div>
          <div className="flex items-center gap-3">
            {unseenCompleted > 0 && (
              <button onClick={markAllSeen} className="wo-btn text-xs px-3 py-1.5 rounded-full text-white" style={{ background: "var(--route-green)" }}>
                {unseenCompleted} new completed ●
              </button>
            )}
            <button onClick={() => setSession(null)} className="wo-btn text-xs" style={{ color: "var(--steel)" }}>Log out</button>
          </div>
        </header>

        <div className="px-5 py-3 text-xs wo-mono" style={{ background: "var(--paper-dark)", color: "var(--steel)" }}>
          ⚠ Email/text alerts aren't connected yet — this board syncs live in-app across phones. Add a Cloud Function (or a service like Twilio/SendGrid) triggered on task completion to add real alerts.
        </div>

        <div className="px-5 py-4 flex flex-wrap gap-2 items-center">
          <button onClick={() => setShowNewTask(true)} className="wo-btn px-4 py-2 rounded text-white text-sm" style={{ background: "var(--ink)" }}>
            + New Work Order
          </button>
          <button onClick={() => setShowAddEmployee(true)} className="wo-btn px-4 py-2 rounded text-sm" style={{ border: "1px solid var(--steel)" }}>
            + Add Crew Member
          </button>
          <div className="flex gap-1 ml-auto">
            {["all", "assigned", "in_progress", "done"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="wo-btn text-xs px-3 py-1.5 rounded-full"
                style={{
                  background: filter === f ? "var(--ink)" : "transparent",
                  color: filter === f ? "#fff" : "var(--steel)",
                  border: "1px solid " + (filter === f ? "var(--ink)" : "#cfc8b4"),
                }}
              >
                {f === "all" ? "All" : STATUS[f].label}
              </button>
            ))}
          </div>
        </div>

        {employees.length > 0 && (
          <div className="px-5 pb-2 flex flex-wrap gap-2">
            {employees.map((e) => (
              <span key={e.id} className="wo-mono text-xs px-2 py-1 rounded flex items-center gap-2" style={{ background: "var(--paper-dark)" }}>
                {e.name}
                <button onClick={() => removeEmployee(e.id)} style={{ color: "var(--caution-red)" }}>×</button>
              </span>
            ))}
          </div>
        )}

        <div className="px-5 pb-10 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {visibleTasks.length === 0 && (
            <div className="text-sm col-span-full py-10 text-center" style={{ color: "var(--steel)" }}>
              No work orders here. Create one to get the crew moving.
            </div>
          )}
          {visibleTasks.map((t) => (
            <div key={t.id} className="wo-ticket p-5 pl-8" onClick={() => !t.seenBySupervisor && markSeen(t.id)}>
              {t.status === "done" && <div className="wo-stamp" style={{ color: "var(--route-green)" }}>Complete</div>}
              {t.priority === "urgent" && t.status !== "done" && <div className="wo-stamp" style={{ color: "var(--caution-red)" }}>Urgent</div>}
              <div className="wo-mono text-xs mb-1" style={{ color: "var(--steel)" }}>{shortId(t.id)} · {t.createdAt}</div>
              <div className="font-semibold text-base mb-1 pr-20">{t.title}</div>
              {t.details && <div className="text-sm mb-2" style={{ color: "var(--steel)" }}>{t.details}</div>}
              <div className="text-sm mb-2">Assigned to <strong>{t.assignee}</strong></div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full" style={{ background: STATUS[t.status].color }}></span>
                <span className="text-xs wo-mono" style={{ color: "var(--steel)" }}>{STATUS[t.status].label}</span>
              </div>
              {t.status === "done" && t.note && (
                <div className="text-sm mt-2 p-2 rounded" style={{ background: "var(--paper-dark)" }}>
                  <span className="wo-mono text-xs" style={{ color: "var(--steel)" }}>Crew note:</span> {t.note}
                </div>
              )}
              {t.status === "done" && !t.seenBySupervisor && (
                <div className="text-xs mt-2" style={{ color: "var(--route-green)" }}>● tap to mark reviewed</div>
              )}
            </div>
          ))}
        </div>

        {showNewTask && (
          <Modal onClose={() => setShowNewTask(false)}>
            <form onSubmit={createTask} className="flex flex-col gap-3">
              <div className="wo-display text-sm" style={{ color: "var(--steel)" }}>New Work Order</div>
              <input className="wo-input" placeholder="Title (e.g. Clear storm drain, Elm St)" value={taskDraft.title}
                onChange={(e) => setTaskDraft({ ...taskDraft, title: e.target.value })} autoFocus />
              <textarea className="wo-input" placeholder="Details (optional)" rows={3} value={taskDraft.details}
                onChange={(e) => setTaskDraft({ ...taskDraft, details: e.target.value })} />
              <select className="wo-input" value={taskDraft.assignee} onChange={(e) => setTaskDraft({ ...taskDraft, assignee: e.target.value })}>
                <option value="">Assign to…</option>
                {employees.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
              </select>
              <div className="flex gap-2">
                {["normal", "urgent"].map((p) => (
                  <button type="button" key={p} onClick={() => setTaskDraft({ ...taskDraft, priority: p })}
                    className="wo-btn flex-1 py-2 rounded text-xs"
                    style={{
                      background: taskDraft.priority === p ? (p === "urgent" ? "var(--caution-red)" : "var(--ink)") : "transparent",
                      color: taskDraft.priority === p ? "#fff" : "var(--steel)",
                      border: "1px solid " + (taskDraft.priority === p ? "transparent" : "#cfc8b4"),
                    }}>
                    {p === "urgent" ? "Urgent" : "Normal"}
                  </button>
                ))}
              </div>
              <button type="submit" className="wo-btn py-3 rounded text-white text-sm" style={{ background: "var(--ink)" }}
                disabled={employees.length === 0}>
                {employees.length === 0 ? "Add crew members first" : "Create Work Order"}
              </button>
            </form>
          </Modal>
        )}

        {showAddEmployee && (
          <Modal onClose={() => setShowAddEmployee(false)}>
            <form onSubmit={addEmployee} className="flex flex-col gap-3">
              <div className="wo-display text-sm" style={{ color: "var(--steel)" }}>Add Crew Member</div>
              <input className="wo-input" placeholder="Full name" value={newEmpName} onChange={(e) => setNewEmpName(e.target.value)} autoFocus />
              <input className="wo-input" placeholder="Set their PIN (4+ digits)" type="password" inputMode="numeric"
                value={newEmpPin} onChange={(e) => setNewEmpPin(e.target.value.replace(/\D/g, ""))} />
              <button type="submit" className="wo-btn py-3 rounded text-white text-sm" style={{ background: "var(--ink)" }}>Add</button>
            </form>
          </Modal>
        )}
      </div>
    );
  }

  const myTasks = tasks.filter((t) => t.assignee === session.name);
  const openTasks = myTasks.filter((t) => t.status !== "done");
  const doneTasks = myTasks.filter((t) => t.status === "done");

  return (
    <div className="wo-root min-h-screen">
      <style>{styles}</style>
      <header className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #d8d2c2" }}>
        <div>
          <div className="wo-display text-xl">My Work Orders</div>
          <div className="wo-mono text-xs" style={{ color: "var(--steel)" }}>{session.name} · {todayStr()}</div>
        </div>
        <button onClick={() => setSession(null)} className="wo-btn text-xs" style={{ color: "var(--steel)" }}>Log out</button>
      </header>

      <div className="px-5 py-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {openTasks.length === 0 && (
          <div className="text-sm col-span-full py-10 text-center" style={{ color: "var(--steel)" }}>
            Nothing on your board right now.
          </div>
        )}
        {openTasks.map((t) => (
          <div key={t.id} className="wo-ticket p-5 pl-8">
            {t.priority === "urgent" && <div className="wo-stamp" style={{ color: "var(--caution-red)" }}>Urgent</div>}
            <div className="wo-mono text-xs mb-1" style={{ color: "var(--steel)" }}>{shortId(t.id)} · {t.createdAt}</div>
            <div className="font-semibold text-base mb-1 pr-20">{t.title}</div>
            {t.details && <div className="text-sm mb-3" style={{ color: "var(--steel)" }}>{t.details}</div>}
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full" style={{ background: STATUS[t.status].color }}></span>
              <span className="text-xs wo-mono" style={{ color: "var(--steel)" }}>{STATUS[t.status].label}</span>
            </div>
            {t.status === "assigned" ? (
              <button onClick={() => startTask(t.id)} className="wo-btn w-full py-2 rounded text-white text-sm" style={{ background: "var(--ink)" }}>
                Start Job
              </button>
            ) : (
              <button onClick={() => openCompleteDialog(t.id)} className="wo-btn w-full py-2 rounded text-white text-sm" style={{ background: "var(--route-green)" }}>
                Mark Complete
              </button>
            )}
          </div>
        ))}
      </div>

      {doneTasks.length > 0 && (
        <div className="px-5 pb-10">
          <div className="wo-display text-sm mb-2" style={{ color: "var(--steel)" }}>Completed</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {doneTasks.map((t) => (
              <div key={t.id} className="wo-ticket p-5 pl-8" style={{ opacity: 0.75 }}>
                <div className="wo-stamp" style={{ color: "var(--route-green)" }}>Complete</div>
                <div className="wo-mono text-xs mb-1" style={{ color: "var(--steel)" }}>{shortId(t.id)}</div>
                <div className="font-semibold text-base pr-20">{t.title}</div>
                <div className="text-xs mt-1" style={{ color: "var(--steel)" }}>Finished {t.completedAt}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {completeNoteFor && (
        <Modal onClose={() => setCompleteNoteFor(null)}>
          <div className="flex flex-col gap-3">
            <div className="wo-display text-sm" style={{ color: "var(--steel)" }}>Mark Complete</div>
            <textarea className="wo-input" placeholder="Anything the supervisor should know? (optional)" rows={3}
              value={completeNote} onChange={(e) => setCompleteNote(e.target.value)} autoFocus />
            <button onClick={completeTask} className="wo-btn py-3 rounded text-white text-sm" style={{ background: "var(--route-green)" }}>
              Confirm Complete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(28,31,34,0.5)", zIndex: 50 }} onClick={onClose}>
      <div className="wo-ticket p-6 pl-8 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
