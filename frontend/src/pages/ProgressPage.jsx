import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api";

function normalizeStatus(status) {
    const value = String(status || "").toLowerCase();
    if (value === "done") return "done";
    if (value === "in_progress") return "in progress";
    return "todo";
}

function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function getPhaseStats(phase) {
    const items = phase?.items || [];
    const allUnits = items.flatMap((item) => {
        const subItems = Array.isArray(item.subItems) ? item.subItems : [];
        return subItems.length ? subItems : [item];
    });
    const done = allUnits.filter((item) => String(item.status).toLowerCase() === "done").length;
    const inProgress = allUnits.filter((item) => String(item.status).toLowerCase() === "in_progress").length;
    const todo = Math.max(0, allUnits.length - done - inProgress);
    return { total: allUnits.length, done, inProgress, todo };
}

function getItemStatus(item) {
    const subItems = Array.isArray(item.subItems) ? item.subItems : [];
    if (!subItems.length) return normalizeStatus(item.status);
    const done = subItems.filter((sub) => String(sub.status).toLowerCase() === "done").length;
    const inProgress = subItems.filter((sub) => String(sub.status).toLowerCase() === "in_progress").length;
    if (done === subItems.length) return "done";
    if (inProgress > 0 || done > 0) return "in progress";
    return "todo";
}

export default function ProgressPage() {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        async function run() {
            try {
                const payload = await apiRequest("/api/dashboard/progress");
                setData(payload);
            } catch (apiError) {
                setError(apiError.message);
            }
        }
        run();
    }, []);

    const totals = useMemo(() => {
        if (!data?.phases) return { done: 0, total: 0 };
        const allUnits = data.phases
            .flatMap((phase) => phase.items || [])
            .flatMap((item) => {
                const subItems = Array.isArray(item.subItems) ? item.subItems : [];
                return subItems.length ? subItems : [item];
            });
        const done = allUnits.filter((item) => String(item.status).toLowerCase() === "done").length;
        return { done, total: allUnits.length };
    }, [data]);

    const inProgress = data?.phases
        ? data.phases
            .flatMap((phase) => phase.items || [])
            .flatMap((item) => {
                const subItems = Array.isArray(item.subItems) ? item.subItems : [];
                return subItems.length ? subItems : [item];
            })
            .filter((item) => String(item.status).toLowerCase() === "in_progress").length
        : 0;
    const percent = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;
    const todo = Math.max(0, totals.total - totals.done - inProgress);
    const checkpointLabel = data?.timeline?.meetingCheckpoint?.dateTime
        ? new Date(data.timeline.meetingCheckpoint.dateTime).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit"
        })
        : "Not set";

    const timelineMilestones = Array.isArray(data?.timeline?.milestones) ? data.timeline.milestones : [];
    if (error) {
        return (
            <div className="page">
                <div className="card">
                    <h3>Progress load failed</h3>
                    <p className="msg error">{error}</p>
                    <p className="muted">Please confirm API is running (`http://localhost:3001`) and then refresh.</p>
                </div>
            </div>
        );
    }

    if (!data) {
        return <div className="page"><div className="card">Loading progress...</div></div>;
    }

    return (
        <div className="page">
            <div className="page-head">
                <h2>{data.title || "Progress"}</h2>
                <p>Last updated: {data.lastUpdated || "N/A"} | Daily checkpoint: {checkpointLabel}</p>
            </div>

            <section className="mini-stat-grid">
                <article className="mini-stat-card">
                    <p>Total Steps</p>
                    <strong>{totals.total}</strong>
                </article>
                <article className="mini-stat-card">
                    <p>Done</p>
                    <strong>{totals.done}</strong>
                </article>
                <article className="mini-stat-card">
                    <p>In Progress</p>
                    <strong>{inProgress}</strong>
                </article>
                <article className="mini-stat-card">
                    <p>To Do</p>
                    <strong>{todo}</strong>
                </article>
            </section>

            <section className="card">
                <div className="row-between">
                    <h3>Overall progress</h3>
                    <p className="font-semibold text-gray-700">{totals.done} / {totals.total} ({percent}%)</p>
                </div>
                <div className="progress-track">
                    <div className="progress-fill bg-gradient-to-r from-brand-500 to-brand-300" style={{ width: `${percent}%` }} />
                </div>
            </section>

            {timelineMilestones.length > 0 && (
                <section className="card">
                    <h3>Timeline</h3>
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Milestone</th>
                                    <th>Owner</th>
                                    <th>Start</th>
                                    <th>End</th>
                                </tr>
                            </thead>
                            <tbody>
                                {timelineMilestones.map((milestone) => (
                                    <tr key={milestone.id}>
                                        <td>{milestone.title}</td>
                                        <td>{milestone.owner || "-"}</td>
                                        <td>{formatDate(milestone.startDate)}</td>
                                        <td>{formatDate(milestone.endDate)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            <section className="card">
                <h3>Phase execution</h3>
                <div className="phase-list">
                    {data.phases?.map((phase) => (
                        <article key={phase.id} className="phase-item">
                            {(() => {
                                const phaseStats = getPhaseStats(phase);
                                const phasePercent = phaseStats.total
                                    ? Math.round((phaseStats.done / phaseStats.total) * 100)
                                    : 0;
                                return (
                                    <>
                                        <div className="row-between">
                                            <div>
                                                <h4>{phase.title}</h4>
                                                <p className="muted">{phase.description}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-semibold text-gray-700">Deadline</p>
                                                <p className="text-sm text-gray-500">{formatDate(phase.deadline?.endDate)}</p>
                                            </div>
                                        </div>
                                        <div className="chip-wrap">
                                            <span className="pill done">{phaseStats.done} done</span>
                                            <span className="pill in-progress">{phaseStats.inProgress} in progress</span>
                                            <span className="pill todo">{phaseStats.todo} to do</span>
                                            <span className="chip">{phasePercent}% complete</span>
                                        </div>
                                    </>
                                );
                            })()}
                            <div className="task-list">
                                {(phase.items || []).map((item) => (
                                    Array.isArray(item.subItems) && item.subItems.length > 0 ? (
                                        <div key={item.id} className="task-item task-item-nested">
                                            <div className="task-item-head">
                                                <div className="flex-1">
                                                    <strong>{item.title}</strong>
                                                    <p className="muted">{item.details}</p>
                                                </div>
                                                <span className={`pill ${getItemStatus(item).replace(" ", "-")}`}>
                                                    {getItemStatus(item)}
                                                </span>
                                            </div>
                                            <div className="subtask-list">
                                                {item.subItems.map((subItem) => (
                                                    <div key={subItem.id} className="subtask-item">
                                                        <p className="subtask-title">{subItem.title}</p>
                                                        <span className={`pill ${normalizeStatus(subItem.status).replace(" ", "-")}`}>
                                                            {normalizeStatus(subItem.status)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div key={item.id} className="task-item">
                                            <div className="flex-1">
                                                <strong>{item.title}</strong>
                                                <p className="muted">{item.details}</p>
                                            </div>
                                            <span className={`pill ${getItemStatus(item).replace(" ", "-")}`}>
                                                {getItemStatus(item)}
                                            </span>
                                        </div>
                                    )
                                ))}
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </div>
    );
}

