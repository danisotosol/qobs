import { useState, useEffect, useMemo, useRef } from "react"
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom"
import axios from "axios"
import './App.css'

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtNum(n, decimals = 1) {
  if (n == null) return "—"
  return Number(n).toFixed(decimals)
}

function fmtDuration(seconds) {
  if (seconds == null) return "—"
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`
  const h = Math.floor(m / 60)
  const remM = m % 60
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`
}

function fmtDateTime(str) {
  if (!str) return "—"
  return new Date(str).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  })
}

function fmtHour(isoStr) {
  if (!isoStr) return ""
  return new Date(isoStr).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", hour12: true,
  })
}

function fmtK(n) {
  if (n == null) return "—"
  if (n >= 1000) return (n / 1000).toFixed(1) + "k"
  return String(n)
}

// ── Spark path ────────────────────────────────────────────────────────────────
function buildSparkPath(values) {
  if (!values || values.length < 2) return ""
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = Math.max(1, max - min)
  return values.map((v, i) => {
    const x = (i / (values.length - 1)) * 120
    const y = 26 - ((v - min) / range) * 24
    return (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1)
  }).join(" ")
}

// ── MetricCard ────────────────────────────────────────────────────────────────
function MetricCard({ label, value, unit, delta, sparkline }) {
  return (
    <div style={{
      background: "var(--bg-1)",
      border: "1px solid var(--line-soft)",
      borderRadius: "var(--radius-lg)",
      padding: "16px 18px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      minWidth: 0,
    }}>
      <div style={{
        color: "var(--fg-2)",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        fontFamily: "'JetBrains Mono', monospace",
      }}>{label}</div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 28,
          fontWeight: 600,
          color: "var(--fg-0)",
          letterSpacing: "-0.02em",
        }}>{value}</div>
        {unit && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "var(--fg-2)" }}>
            {unit}
          </div>
        )}
      </div>

      {delta != null && (
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: delta >= 0 ? "var(--green)" : "var(--red)",
        }}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%{" "}
          <span style={{ color: "var(--fg-3)" }}>vs. prev 1h</span>
        </div>
      )}

      {sparkline && (
        <svg viewBox="0 0 120 28" preserveAspectRatio="none"
          style={{ width: "100%", height: 28, marginTop: 4 }}>
          <path d={sparkline} stroke="var(--accent)" strokeWidth="1.2" fill="none"
            vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  )
}

// ── LegendDot ─────────────────────────────────────────────────────────────────
function LegendDot({ color, label, dashed }) {
  return (
    <div className="mono" style={{
      display: "flex", alignItems: "center", gap: 6,
      fontSize: 11, color: "var(--fg-1)",
    }}>
      {dashed ? (
        <svg width="14" height="2">
          <line x1="0" y1="1" x2="14" y2="1" stroke={color} strokeWidth="2" strokeDasharray="3 2" />
        </svg>
      ) : (
        <span style={{ display: "inline-block", width: 10, height: 2, background: color }} />
      )}
      {label}
    </div>
  )
}

// ── ThroughputChart ───────────────────────────────────────────────────────────
function ThroughputChart({ data }) {
  const W = 1200, H = 360
  const pad = { top: 24, right: 24, bottom: 36, left: 48 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom

  if (!data.length) return (
    <div style={{
      background: "var(--bg-1)", border: "1px solid var(--line-soft)",
      borderRadius: "var(--radius-lg)", padding: 20,
      display: "flex", alignItems: "center", justifyContent: "center",
      height: 120,
    }}>
      <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
        No throughput data yet — add jobs to see the chart.
      </span>
    </div>
  )

  const maxY = useMemo(() => {
    const m = Math.max(...data.map(d => d.success))
    return Math.max(1, Math.ceil(m / 5) * 5)
  }, [data])

  const xFor = (i) => pad.left + (i / (data.length - 1)) * innerW
  const yFor = (v) => pad.top + innerH - (v / maxY) * innerH

  const successPath = data.map((d, i) =>
    (i === 0 ? "M" : "L") + xFor(i).toFixed(1) + " " + yFor(d.success).toFixed(1)
  ).join(" ")
  const successArea =
    successPath +
    ` L ${xFor(data.length - 1).toFixed(1)} ${(pad.top + innerH).toFixed(1)}` +
    ` L ${pad.left} ${(pad.top + innerH).toFixed(1)} Z`

  const [hover, setHover] = useState(null)
  const ref = useRef(null)

  function onMove(e) {
    const rect = ref.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    if (x < pad.left || x > pad.left + innerW) { setHover(null); return }
    const idx = Math.round(((x - pad.left) / innerW) * (data.length - 1))
    setHover(Math.max(0, Math.min(data.length - 1, idx)))
  }

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(p => Math.round(maxY * p))

  return (
    <div style={{
      background: "var(--bg-1)",
      border: "1px solid var(--line-soft)",
      borderRadius: "var(--radius-lg)",
      padding: 20,
    }}>
      <div style={{
        display: "flex", alignItems: "flex-start",
        justifyContent: "space-between", gap: 16, marginBottom: 12,
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-0)" }}>
              Job throughput
            </div>
            <div className="mono" style={{
              fontSize: 11, color: "var(--fg-3)",
              textTransform: "uppercase", letterSpacing: "0.08em",
            }}>· hourly buckets</div>
          </div>
          <div className="mono" style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 4 }}>
            jobs collected per hour, across all backends
          </div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <LegendDot color="var(--accent)" label="Jobs" />
        </div>
      </div>

      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: 360, display: "block", cursor: "crosshair" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* y gridlines + labels */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={pad.left} x2={W - pad.right}
              y1={yFor(v)} y2={yFor(v)}
              stroke="var(--line-soft)"
              strokeDasharray={i === 0 ? "" : "2 4"}
              strokeWidth="1"
            />
            <text
              x={pad.left - 10} y={yFor(v) + 4}
              textAnchor="end"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="10"
              fill="var(--fg-3)"
            >{v}</text>
          </g>
        ))}

        {/* x tick labels — one every ~6 visible ticks */}
        {data.map((d, i) => {
          const step = Math.max(1, Math.ceil(data.length / 6))
          return i % step === 0 && (
            <text key={i}
              x={xFor(i)} y={H - pad.bottom + 18}
              textAnchor="middle"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="10"
              fill="var(--fg-3)"
            >{fmtHour(d.hour)}</text>
          )
        })}

        {/* success area fill + line */}
        <path d={successArea} fill="url(#successGrad)" />
        <path d={successPath} stroke="var(--accent)" strokeWidth="1.75"
          fill="none" vectorEffect="non-scaling-stroke" />

        {/* hover crosshair + tooltip */}
        {hover != null && (
          <g>
            <line
              x1={xFor(hover)} x2={xFor(hover)}
              y1={pad.top} y2={pad.top + innerH}
              stroke="var(--fg-2)" strokeDasharray="2 3" strokeWidth="1"
            />
            <circle cx={xFor(hover)} cy={yFor(data[hover].success)}
              r="4" fill="var(--bg-0)" stroke="var(--accent)" strokeWidth="2" />

            <g transform={`translate(${Math.min(xFor(hover) + 12, W - pad.right - 160)}, ${pad.top + 8})`}>
              <rect width="160" height="48" rx="6" fill="var(--bg-2)" stroke="var(--line)" />
              <text x="12" y="20" fontFamily="'JetBrains Mono', monospace"
                fontSize="10" fill="var(--fg-3)" letterSpacing="0.06em">
                {data[hover].hour ? fmtHour(data[hover].hour) : ""}
              </text>
              <circle cx="14" cy="36" r="3" fill="var(--accent)" />
              <text x="24" y="40" fontFamily="'JetBrains Mono', monospace"
                fontSize="11" fill="var(--fg-0)">
                jobs <tspan fontWeight="600">{data[hover].success}</tspan>
              </text>
            </g>
          </g>
        )}
      </svg>
    </div>
  )
}

// ── AddJobForm ────────────────────────────────────────────────────────────────
function AddJobForm({ value, onChange, onAdd, adding, error }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        display: "flex",
        background: "var(--bg-2)",
        border: "1px solid var(--line-soft)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
      }}>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onAdd()}
          placeholder="job id…"
          disabled={adding}
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--fg-0)",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            padding: "5px 10px",
            width: 200,
          }}
        />
        <button
          onClick={onAdd}
          disabled={adding || !value.trim()}
          style={{
            background: adding
              ? "var(--bg-3)"
              : "color-mix(in oklch, var(--accent) 12%, transparent)",
            border: "none",
            borderLeft: "1px solid var(--line-soft)",
            color: adding ? "var(--fg-3)" : "var(--accent)",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            fontWeight: 500,
            padding: "5px 14px",
            cursor: adding || !value.trim() ? "default" : "pointer",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
          }}
        >{adding ? "Fetching…" : "+ Add"}</button>
      </div>
      {error && (
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: "var(--red)",
          letterSpacing: "0.02em",
        }}>{error}</span>
      )}
    </div>
  )
}

// ── FilterTabs ────────────────────────────────────────────────────────────────
function FilterTabs({ filter, onFilter, counts }) {
  const tabs = [{ id: "all", label: "All" }]
  return (
    <div style={{
      display: "inline-flex",
      background: "var(--bg-2)",
      border: "1px solid var(--line-soft)",
      borderRadius: "var(--radius)",
      padding: 2,
    }}>
      {tabs.map(t => {
        const active = filter === t.id
        return (
          <button key={t.id} onClick={() => onFilter(t.id)} style={{
            background: active ? "var(--bg-3)" : "transparent",
            border: "none",
            color: active ? "var(--fg-0)" : "var(--fg-2)",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            padding: "5px 10px",
            borderRadius: 4,
            cursor: "pointer",
            transition: "color 120ms",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}>
            {t.label}
            <span style={{ color: "var(--fg-3)", fontSize: 10 }}>{counts[t.id]}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── JobsTable ─────────────────────────────────────────────────────────────────
function JobsTable({ jobs, filter, onFilter, search, onSearch, onDelete, addInput, onAddInput, onAdd, adding, addError }) {
  const [confirmId, setConfirmId] = useState(null)

  const filtered = jobs.filter(j => {
    if (search && !(
      String(j.id).toLowerCase().includes(search.toLowerCase()) ||
      String(j.backend || "").toLowerCase().includes(search.toLowerCase())
    )) return false
    return true
  })

  const counts = useMemo(() => ({ all: jobs.length }), [jobs])

  const headers = [
    { label: "Job ID",    align: "left"   },
    { label: "Backend",   align: "left"   },
    { label: "Queue",     align: "right"  },
    { label: "Exec",      align: "right"  },
    { label: "Shots",     align: "right"  },
    { label: "Created",   align: "left"   },
    ...(onDelete ? [{ label: "", align: "center" }] : []),
  ]

  return (
    <div style={{
      background: "var(--bg-1)",
      border: "1px solid var(--line-soft)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
    }}>
      {/* header bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 18px",
        borderBottom: "1px solid var(--line-soft)",
        gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Jobs</div>
          <div className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
            {filtered.length} of {jobs.length}
          </div>
          {onAdd && (
            <>
              <div style={{ width: 1, height: 16, background: "var(--line)" }} />
              <AddJobForm
                value={addInput}
                onChange={onAddInput}
                onAdd={onAdd}
                adding={adding}
                error={addError}
              />
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FilterTabs filter={filter} onFilter={onFilter} counts={counts} />
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--bg-2)",
            border: "1px solid var(--line-soft)",
            borderRadius: "var(--radius)",
            padding: "5px 10px",
            width: 220,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="var(--fg-3)" strokeWidth="2">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="search id, backend…"
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--fg-0)",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                width: "100%",
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
        }}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} style={{
                  textAlign: h.align,
                  padding: "10px 16px",
                  color: "var(--fg-3)",
                  fontWeight: 500,
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  borderBottom: "1px solid var(--line)",
                  background: "var(--bg-1)",
                  position: "sticky",
                  top: 0,
                }}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((j, idx) => (
              <tr key={j.id}
                style={{
                  borderBottom: "1px solid var(--line-soft)",
                  background: idx % 2 === 0
                    ? "transparent"
                    : "color-mix(in oklch, var(--bg-2) 30%, transparent)",
                  transition: "background 120ms",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-2)"}
                onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0
                  ? "transparent"
                  : "color-mix(in oklch, var(--bg-2) 30%, transparent)"}
              >
                <td style={cellStyle()}>
                  <span style={{ color: "var(--accent)", cursor: "default" }} title={j.id}>
                    {j.id.slice(0, 8)}
                  </span>
                </td>
                <td style={cellStyle()}>
                  <span style={{ color: "var(--fg-1)" }}>{j.backend}</span>
                </td>
                <td style={cellStyle("right")}>
                  <span style={{ color: "var(--fg-1)" }}>{fmtDuration(j.queue_time)}</span>
                </td>
                <td style={cellStyle("right")}>
                  <span style={{ color: "var(--fg-1)" }}>{fmtDuration(j.execution_time)}</span>
                </td>
                <td style={cellStyle("right")}>
                  <span style={{ color: "var(--fg-1)" }}>
                    {j.shots != null ? j.shots.toLocaleString() : "—"}
                  </span>
                </td>
                <td style={cellStyle()}>
                  <span style={{ color: "var(--fg-2)" }}>{fmtDateTime(j.created_at)}</span>
                </td>
                {onDelete && <td style={cellStyle("center")}>
                  {confirmId === j.id ? (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <button
                        onClick={() => { onDelete(j.id); setConfirmId(null) }}
                        title="Confirm delete"
                        style={{
                          background: "color-mix(in oklch, var(--red) 14%, transparent)",
                          border: "1px solid color-mix(in oklch, var(--red) 35%, transparent)",
                          color: "var(--red)",
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 10,
                          padding: "3px 8px",
                          borderRadius: 4,
                          cursor: "pointer",
                          letterSpacing: "0.04em",
                        }}
                      >Delete</button>
                      <button
                        onClick={() => setConfirmId(null)}
                        title="Cancel"
                        style={{
                          background: "transparent",
                          border: "1px solid var(--line-soft)",
                          color: "var(--fg-3)",
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 10,
                          padding: "3px 8px",
                          borderRadius: 4,
                          cursor: "pointer",
                        }}
                      >Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmId(j.id)}
                      title="Delete job"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--fg-3)",
                        cursor: "pointer",
                        padding: "2px 6px",
                        borderRadius: 4,
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--red)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--fg-3)"}
                    >
                      <svg width="13" height="14" viewBox="0 0 13 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 3.5 12 3.5" />
                        <path d="M2.5 3.5V12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3.5" />
                        <path d="M4.5 3.5V2a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1.5" />
                        <line x1="5" y1="6.5" x2="5" y2="10" />
                        <line x1="8" y1="6.5" x2="8" y2="10" />
                      </svg>
                    </button>
                  )}
                </td>}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={headers.length}
                  style={{ padding: 32, textAlign: "center", color: "var(--fg-3)" }}>
                  No jobs match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function cellStyle(align = "left") {
  return { padding: "11px 16px", textAlign: align, whiteSpace: "nowrap", verticalAlign: "middle" }
}

// ── Logo ──────────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="var(--accent)" strokeWidth="1.4" />
        <ellipse cx="12" cy="12" rx="9" ry="3.5" stroke="var(--accent)"
          strokeWidth="1.1" opacity="0.7" />
        <ellipse cx="12" cy="12" rx="9" ry="3.5" stroke="var(--magenta)"
          strokeWidth="1.1" opacity="0.7" transform="rotate(60 12 12)" />
        <circle cx="12" cy="12" r="2" fill="var(--accent)" />
      </svg>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="mono" style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.04em" }}>
          QOBS
        </span>
        <span className="mono" style={{
          fontSize: 10, color: "var(--fg-3)",
          textTransform: "uppercase", letterSpacing: "0.12em",
        }}>v0.1</span>
      </div>
    </div>
  )
}

// ── TopBar ────────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { label: "Overview", to: "/"         },
  { label: "Jobs",     to: "/jobs"     },
  { label: "Backends", to: "/backends" },
  { label: "Circuits", to: "/circuits" },
  { label: "Logs",     to: "/logs"     },
]

function TopBar() {
  const location = useLocation()

  return (
    <header style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "16px 28px",
      borderBottom: "1px solid var(--line-soft)",
      background: "color-mix(in oklch, var(--bg-0) 80%, transparent)",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      position: "sticky",
      top: 0,
      zIndex: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Logo />
        <div style={{ width: 1, height: 20, background: "var(--line)" }} />
        <nav style={{ display: "flex", gap: 4 }}>
          {NAV_ITEMS.map(item => {
            const active = location.pathname === item.to
            return (
              <Link
                key={item.label}
                to={item.to}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: active ? "var(--fg-0)" : "var(--fg-2)",
                  padding: "6px 10px",
                  borderRadius: 4,
                  background: active ? "var(--bg-2)" : "transparent",
                  textDecoration: "none",
                }}
              >{item.label}</Link>
            )
          })}
        </nav>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div className="mono" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 11, color: "var(--accent)",
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: 999,
            background: "var(--accent)",
            animation: "pulse 1.6s ease-out infinite",
          }} />
          LIVE
        </div>
        <div style={{
          width: 28, height: 28,
          borderRadius: 999,
          background: "linear-gradient(135deg, var(--accent), var(--magenta))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 600, color: "var(--bg-0)",
          fontFamily: "'JetBrains Mono', monospace",
        }}>AC</div>
      </div>
    </header>
  )
}

// ── Placeholder page ──────────────────────────────────────────────────────────
function PlaceholderPage({ title }) {
  return (
    <main style={{ padding: "28px 28px 48px", maxWidth: 1480, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>
          {title}
        </h1>
      </div>
      <p className="mono" style={{ color: "var(--fg-3)", fontSize: 12, marginTop: 8 }}>
        Coming soon.
      </p>
    </main>
  )
}

// ── Overview (read-only dashboard, latest 10 jobs) ────────────────────────────
function Overview() {
  const [jobs, setJobs] = useState([])
  const [throughput, setThroughput] = useState([])
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")

  useEffect(() => {
    axios.get("http://localhost:8000/jobs")
      .then(r => setJobs(r.data))
      .catch(console.error)
    axios.get("http://localhost:8000/metrics/throughput")
      .then(r => setThroughput(r.data.map((d, i) => ({ t: i, hour: d.hour, success: d.count }))))
      .catch(console.error)
  }, [])

  const stats = useMemo(() => {
    if (!jobs.length) return { total: 0, avgQueue: 0, avgExec: 0, totalShots: 0 }
    const total = jobs.length
    const avgQueue = jobs.reduce((s, j) => s + (j.queue_time || 0), 0) / total
    const avgExec  = jobs.reduce((s, j) => s + (j.execution_time || 0), 0) / total
    const totalShots = jobs.reduce((s, j) => s + (j.shots || 0), 0)
    return { total, avgQueue, avgExec, totalShots }
  }, [jobs])

  const sparkSlice = jobs.slice(0, 13)

  return (
    <main style={{ padding: "28px 28px 48px", maxWidth: 1480, margin: "0 auto" }}>

      {/* page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>
            Quantum Job Observability
          </h1>
          <span className="mono" style={{
            fontSize: 10, color: "var(--accent)",
            border: "1px solid var(--accent-line)",
            padding: "2px 6px", borderRadius: 4,
            textTransform: "uppercase", letterSpacing: "0.1em",
            background: "var(--accent-dim)",
          }}>prod</span>
        </div>
        <p style={{ margin: 0, color: "var(--fg-2)", fontSize: 13 }}>
          Real-time monitoring of quantum circuit executions across QPU backends
          — track queue depth and runtime in one place.
        </p>
      </div>

      {/* metrics row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 14,
        marginBottom: 18,
      }}>
        <MetricCard
          label="Total Jobs"
          value={stats.total}
          unit="jobs"
          delta={6.4}
          sparkline={buildSparkPath(sparkSlice.map((_, i) => i + 1))}
        />
        <MetricCard
          label="Avg Queue"
          value={fmtNum(stats.avgQueue)}
          unit="s"
          delta={-4.2}
          sparkline={buildSparkPath(sparkSlice.map(j => j.queue_time || 0))}
        />
        <MetricCard
          label="Avg Exec"
          value={fmtNum(stats.avgExec)}
          unit="s"
          delta={1.8}
          sparkline={buildSparkPath(sparkSlice.map(j => j.execution_time || 0))}
        />
        <MetricCard
          label="Total Shots"
          value={fmtK(stats.totalShots)}
          delta={2.1}
          sparkline={buildSparkPath(sparkSlice.map(j => j.shots || 0))}
        />
      </div>

      {/* throughput chart */}
      <div style={{ marginBottom: 18 }}>
        <ThroughputChart data={throughput} />
      </div>

      {/* jobs preview — latest 10, read-only */}
      <JobsTable
        jobs={jobs.slice(0, 10)}
        filter={filter}
        onFilter={setFilter}
        search={search}
        onSearch={setSearch}
      />

      {/* view-all link */}
      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
        <Link to="/jobs" style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: "var(--accent)",
          textDecoration: "none",
          letterSpacing: "0.04em",
        }}>
          View all jobs →
        </Link>
      </div>

      {/* footer */}
      <div className="mono" style={{
        color: "var(--fg-3)", fontSize: 10, marginTop: 24,
        display: "flex", justifyContent: "space-between", letterSpacing: "0.06em",
      }}>
        <span>QOBS · quantum job observability</span>
        <span>region us-east-1 · cluster qpu-prod-04</span>
      </div>

    </main>
  )
}

// ── Jobs page (full CRUD) ─────────────────────────────────────────────────────
function JobsPage() {
  const [jobs, setJobs] = useState([])
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [addInput, setAddInput] = useState("")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(null)

  useEffect(() => {
    axios.get("http://localhost:8000/jobs")
      .then(r => setJobs(r.data))
      .catch(console.error)
  }, [])

  function addJob() {
    if (!addInput.trim()) return
    setAdding(true)
    setAddError(null)
    axios.post("http://localhost:8000/jobs", { job_id: addInput.trim() })
      .then(r => { setJobs(prev => [r.data, ...prev]); setAddInput("") })
      .catch(err => setAddError(err.response?.data?.detail || "Failed to add job"))
      .finally(() => setAdding(false))
  }

  function deleteJob(jobId) {
    axios.delete(`http://localhost:8000/jobs/${jobId}`)
      .then(() => setJobs(prev => prev.filter(j => j.id !== jobId)))
      .catch(err => console.error("Delete failed:", err))
  }

  return (
    <main style={{ padding: "28px 28px 48px", maxWidth: 1480, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>
          Jobs
        </h1>
        <p style={{ margin: "6px 0 0", color: "var(--fg-2)", fontSize: 13 }}>
          Full job history — add, search, and delete entries.
        </p>
      </div>
      <JobsTable
        jobs={jobs}
        filter={filter} onFilter={setFilter}
        search={search} onSearch={setSearch}
        addInput={addInput} onAddInput={setAddInput}
        onAdd={addJob} adding={adding} addError={addError}
        onDelete={deleteJob}
      />
    </main>
  )
}

// ── Backends page ─────────────────────────────────────────────────────────────
function BackendsPage() {
  const [backends, setBackends] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get("http://localhost:8000/backends")
      .then(r => setBackends(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <main style={{ padding: "28px 28px 48px", maxWidth: 1480, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>
          Backends
        </h1>
        <p style={{ margin: "6px 0 0", color: "var(--fg-2)", fontSize: 13 }}>
          Aggregated performance metrics per IBM Quantum backend.
        </p>
      </div>

      {loading && (
        <p className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>Loading…</p>
      )}

      {!loading && backends.length === 0 && (
        <p className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
          No backend data yet — add jobs to see metrics here.
        </p>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 14,
      }}>
        {backends.map(b => (
          <div key={b.name} style={{
            background: "var(--bg-1)",
            border: "1px solid var(--line-soft)",
            borderRadius: "var(--radius-lg)",
            padding: "20px 22px",
          }}>
            {/* backend name */}
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 15, fontWeight: 600,
                color: "var(--accent)", letterSpacing: "0.02em",
              }}>{b.name}</div>
            </div>

            {/* stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { label: "Total Jobs", value: b.total_jobs, unit: "" },
                { label: "Avg Queue",  value: fmtDuration(b.avg_queue_time),  unit: "" },
                { label: "Avg Exec",   value: fmtDuration(b.avg_execution_time), unit: "" },
              ].map(stat => (
                <div key={stat.label}>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9, fontWeight: 500,
                    color: "var(--fg-3)", textTransform: "uppercase",
                    letterSpacing: "0.1em", marginBottom: 4,
                  }}>{stat.label}</div>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 20, fontWeight: 600,
                    color: "var(--fg-0)", letterSpacing: "-0.01em",
                  }}>{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}

// ── Circuits page ─────────────────────────────────────────────────────────────
function CircuitsPage() {
  const [circuits, setCircuits] = useState([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get("http://localhost:8000/circuits")
      .then(r => setCircuits(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = circuits.filter(c =>
    !search ||
    c.id.toLowerCase().includes(search.toLowerCase()) ||
    (c.backend || "").toLowerCase().includes(search.toLowerCase())
  )

  const headers = ["Job ID", "Backend", "Qubits", "Depth", "Created"]

  return (
    <main style={{ padding: "28px 28px 48px", maxWidth: 1480, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>
          Circuits
        </h1>
        <p style={{ margin: "6px 0 0", color: "var(--fg-2)", fontSize: 13 }}>
          Circuit structure for every collected job — qubit count and depth.
        </p>
      </div>

      <div style={{
        background: "var(--bg-1)",
        border: "1px solid var(--line-soft)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}>
        {/* header bar */}
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: "1px solid var(--line-soft)",
          gap: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Circuits</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
              {loading ? "…" : `${filtered.length} of ${circuits.length}`}
            </div>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--bg-2)", border: "1px solid var(--line-soft)",
            borderRadius: "var(--radius)", padding: "5px 10px", width: 220,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="var(--fg-3)" strokeWidth="2">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search id, backend…"
              style={{
                background: "transparent", border: "none", outline: "none",
                color: "var(--fg-0)", fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, width: "100%",
              }}
            />
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%", borderCollapse: "collapse",
            fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
          }}>
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={i} style={{
                    textAlign: i >= 2 && i <= 3 ? "right" : "left",
                    padding: "10px 16px",
                    color: "var(--fg-3)", fontWeight: 500, fontSize: 10,
                    textTransform: "uppercase", letterSpacing: "0.1em",
                    borderBottom: "1px solid var(--line)",
                    background: "var(--bg-1)", position: "sticky", top: 0,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, idx) => (
                <tr key={c.id}
                  style={{
                    borderBottom: "1px solid var(--line-soft)",
                    background: idx % 2 === 0 ? "transparent"
                      : "color-mix(in oklch, var(--bg-2) 30%, transparent)",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--bg-2)"}
                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0
                    ? "transparent" : "color-mix(in oklch, var(--bg-2) 30%, transparent)"}
                >
                  <td style={cellStyle()}>
                    <span style={{ color: "var(--accent)", cursor: "default" }} title={c.id}>
                      {c.id.slice(0, 8)}
                    </span>
                  </td>
                  <td style={cellStyle()}>
                    <span style={{ color: "var(--fg-1)" }}>{c.backend}</span>
                  </td>
                  <td style={cellStyle("right")}>
                    <span style={{ color: c.num_qubits != null ? "var(--fg-0)" : "var(--fg-3)" }}>
                      {c.num_qubits ?? "—"}
                    </span>
                  </td>
                  <td style={cellStyle("right")}>
                    <span style={{ color: c.circuit_depth != null ? "var(--fg-0)" : "var(--fg-3)" }}>
                      {c.circuit_depth ?? "—"}
                    </span>
                  </td>
                  <td style={cellStyle()}>
                    <span style={{ color: "var(--fg-2)" }}>{fmtDateTime(c.created_at)}</span>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 32, textAlign: "center", color: "var(--fg-3)" }}>
                    No circuits match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}

// ── App (router shell) ────────────────────────────────────────────────────────
function App() {
  return (
    <BrowserRouter>
      <div>
        <TopBar />
        <Routes>
          <Route path="/"         element={<Overview />} />
          <Route path="/jobs"     element={<JobsPage />} />
          <Route path="/backends" element={<BackendsPage />} />
          <Route path="/circuits" element={<CircuitsPage />} />
          <Route path="/logs"     element={<PlaceholderPage title="Logs" />} />
        </Routes>
      </div>

      <style>{`
        @keyframes pulse {
          0%   { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
          70%  { box-shadow: 0 0 0 6px transparent; opacity: 0.6; }
          100% { box-shadow: 0 0 0 0 transparent; opacity: 1; }
        }
        ::selection { background: var(--accent-dim); color: var(--fg-0); }
        ::-webkit-scrollbar { height: 8px; width: 8px; }
        ::-webkit-scrollbar-thumb { background: var(--bg-3); border-radius: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </BrowserRouter>
  )
}

export default App
