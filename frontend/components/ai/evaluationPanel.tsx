"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  FlaskConical,
  Play,
  Square,
  Check,
  X,
  Loader2,
  Clock,
  CircleDot,
  BarChart3,
  RotateCcw,
  ExternalLink,
  DollarSign,
  Timer,
  Zap,
} from "lucide-react"

const API_URL = "http://localhost:8000"
const DATASET_ID = "de2d4160-063f-4b6a-b3ef-53ccd018ee8d"

type RunStatus = "idle" | "running" | "fetching_details" | "done"

type TestRunSummary = {
  totalItems: number
  passedItems: number
  failedItems: number
  durationMs: number
  totalCostUsd: number
  averageLatencyMs: number
}

type RunDetails = {
  id: string
  name: string
  status: string
  evaluationStatus: string
  testRunSummary: TestRunSummary | null
  redirectUrl: string | null
}

type SimulationResult = {
  success?: boolean
  completed?: unknown[]
  failed?: unknown[]
  total_items?: number
  run_id?: string
}

type ModelRun = {
  model: string
  status: "pending" | "running" | "success" | "error" | "fetching"
  elapsed?: number
  error?: string
  result?: SimulationResult
  details?: RunDetails | null
}

export function EvaluationPanel() {
  const [models, setModels] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [runStatus, setRunStatus] = useState<RunStatus>("idle")
  const [runs, setRuns] = useState<ModelRun[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/models`)
      if (!res.ok) return
      const data = await res.json()
      setModels(data.models ?? [])
    } catch {
      // backend unreachable
    }
  }, [])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  const toggle = (model: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(model)) next.delete(model)
      else next.add(model)
      return next
    })
  }

  const selectAll = () => {
    if (selected.size === models.length) setSelected(new Set())
    else setSelected(new Set(models))
  }

  const fetchRunDetails = async (
    runId: string,
    signal: AbortSignal
  ): Promise<RunDetails | null> => {
    try {
      const res = await fetch(`${API_URL}/evaluation/run/${runId}`, { signal })
      if (!res.ok) return null
      const json = await res.json()
      const d = json.data ?? json
      return {
        id: d.id ?? runId,
        name: d.name ?? "",
        status: d.status ?? "",
        evaluationStatus: d.evaluationStatus ?? "",
        testRunSummary: d.testRunSummary ?? null,
        redirectUrl: d.redirectUrl ?? null,
      }
    } catch {
      return null
    }
  }

  const pollRunDetails = async (
    runId: string,
    signal: AbortSignal,
    maxAttempts = 20,
    intervalMs = 5000
  ): Promise<RunDetails | null> => {
    for (let i = 0; i < maxAttempts; i++) {
      if (signal.aborted) return null
      const details = await fetchRunDetails(runId, signal)
      if (
        details?.evaluationStatus === "completed" ||
        details?.evaluationStatus === "failed"
      ) {
        return details
      }
      await new Promise((r) => setTimeout(r, intervalMs))
    }
    return await fetchRunDetails(runId, signal)
  }

  const runEvaluation = async () => {
    const modelList = Array.from(selected)
    if (modelList.length === 0) return

    const controller = new AbortController()
    abortRef.current = controller

    const initialRuns: ModelRun[] = modelList.map((m) => ({
      model: m,
      status: "pending",
    }))
    setRuns(initialRuns)
    setRunStatus("running")

    for (let i = 0; i < modelList.length; i++) {
      if (controller.signal.aborted) break

      const model = modelList[i]
      setRuns((prev) =>
        prev.map((r) => (r.model === model ? { ...r, status: "running" } : r))
      )

      const start = Date.now()

      try {
        await fetch(`${API_URL}/model`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model }),
          signal: controller.signal,
        })

        const res = await fetch(`${API_URL}/simulation/${DATASET_ID}`, {
          method: "POST",
          signal: controller.signal,
        })

        const elapsed = Date.now() - start

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          setRuns((prev) =>
            prev.map((r) =>
              r.model === model
                ? { ...r, status: "error", elapsed, error: err.error ?? `HTTP ${res.status}` }
                : r
            )
          )
          continue
        }

        const result: SimulationResult = await res.json()

        setRuns((prev) =>
          prev.map((r) =>
            r.model === model
              ? { ...r, status: result.run_id ? "fetching" : "success", elapsed, result }
              : r
          )
        )

        if (result.run_id) {
          const details = await pollRunDetails(result.run_id, controller.signal)
          setRuns((prev) =>
            prev.map((r) =>
              r.model === model ? { ...r, status: "success", details } : r
            )
          )
        }
      } catch (e: unknown) {
        if (controller.signal.aborted) break
        const elapsed = Date.now() - start
        setRuns((prev) =>
          prev.map((r) =>
            r.model === model
              ? { ...r, status: "error", elapsed, error: e instanceof Error ? e.message : "Unknown error" }
              : r
          )
        )
      }
    }

    setRunStatus("done")
    abortRef.current = null
  }

  const cancelRun = () => {
    abortRef.current?.abort()
    setRuns((prev) =>
      prev.map((r) =>
        r.status === "pending" || r.status === "running" || r.status === "fetching"
          ? { ...r, status: "error", error: "Cancelled" }
          : r
      )
    )
    setRunStatus("done")
  }

  const resetPanel = () => {
    setRuns([])
    setRunStatus("idle")
  }

  const fmt = {
    duration(ms: number) {
      if (ms < 1000) return `${ms}ms`
      if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
      const mins = Math.floor(ms / 60000)
      const secs = ((ms % 60000) / 1000).toFixed(0)
      return `${mins}m ${secs}s`
    },
    cost(usd: number) {
      if (usd < 0.01) return `$${usd.toFixed(4)}`
      return `$${usd.toFixed(3)}`
    },
    latency(ms: number) {
      if (ms < 1000) return `${Math.round(ms)}ms`
      return `${(ms / 1000).toFixed(1)}s`
    },
  }

  const completedRuns = runs.filter((r) => r.status === "success")
  const errorCount = runs.filter((r) => r.status === "error").length
  const hasDetails = completedRuns.some((r) => r.details?.testRunSummary)
  const isRunning = runStatus === "running" || runStatus === "fetching_details"

  return (
    <Dialog onOpenChange={(open) => { if (open) fetchModels() }}>
      <DialogTrigger asChild>
        <Button
          className="fixed bottom-8 left-8 h-16 w-16 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 z-50 bg-chart-5 hover:bg-chart-5/90 text-background"
          size="icon"
        >
          <FlaskConical className="h-7 w-7" />
          <span className="sr-only">Run Evaluation</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton
        className="sm:max-w-[640px] flex flex-col p-0 gap-0 max-h-[90vh]"
      >
        <DialogTitle className="sr-only">Netra Evaluation Runner</DialogTitle>
        <DialogDescription className="sr-only">
          Run Netra simulation evaluations across multiple LLM models.
        </DialogDescription>

        {/* Header */}
        <div className="p-5 border-b space-y-3">
          <div className="flex items-center gap-3">
            <div className="bg-chart-5/15 p-2.5 rounded-xl">
              <FlaskConical className="h-5 w-5 text-chart-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Netra Evaluation</h3>
              <p className="text-xs text-muted-foreground">
                Multi-model simulation runner
              </p>
            </div>
          </div>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Run your agent through Netra&apos;s evaluation pipeline across multiple models
            side by side. Select the models you want to benchmark, hit run, and
            compare cost, latency, and pass rates on the same simulation dataset.
          </p>
        </div>

        <ScrollArea className="flex-1 overflow-auto">
          <div className="p-5 space-y-5">

            {/* Model selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Models</span>
                <button
                  onClick={selectAll}
                  disabled={isRunning}
                  className="text-xs text-primary hover:underline disabled:opacity-40 cursor-pointer"
                >
                  {selected.size === models.length ? "Deselect all" : "Select all"}
                </button>
              </div>

              {models.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
                  No models available. Is the backend running?
                </div>
              ) : (
                <div className="grid gap-1.5">
                  {models.map((m) => {
                    const run = runs.find((r) => r.model === m)
                    const isSelected = selected.has(m)

                    return (
                      <label
                        key={m}
                        className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all select-none ${
                          isRunning
                            ? "cursor-default opacity-80"
                            : isSelected
                              ? "border-primary/40 bg-primary/5"
                              : "border-transparent hover:border-border hover:bg-muted/40"
                        }`}
                      >
                        <div
                          className={`flex items-center justify-center h-[18px] w-[18px] rounded-[4px] border-[1.5px] transition-colors shrink-0 ${
                            isSelected
                              ? "bg-primary border-primary"
                              : "border-muted-foreground/30 group-hover:border-muted-foreground/50"
                          }`}
                        >
                          {isSelected && (
                            <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
                          )}
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(m)}
                          disabled={isRunning}
                          className="sr-only"
                        />
                        <span className="text-[13px] flex-1 font-mono">{m}</span>

                        {run && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {(run.status === "running" || run.status === "fetching") && (
                              <Loader2 className="h-3.5 w-3.5 text-chart-5 animate-spin" />
                            )}
                            {run.status === "fetching" && (
                              <span className="text-[10px] text-muted-foreground">scoring</span>
                            )}
                            {run.status === "success" && (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            )}
                            {run.status === "error" && (
                              <X className="h-3.5 w-3.5 text-destructive" />
                            )}
                            {run.status === "pending" && (
                              <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
                            )}
                            {run.elapsed !== undefined && (
                              <span className="text-[10px] text-muted-foreground tabular-nums w-12 text-right">
                                {fmt.duration(run.elapsed)}
                              </span>
                            )}
                          </div>
                        )}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Progress summary */}
            {runs.length > 0 && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground border-t pt-4">
                <span className="flex items-center gap-1.5">
                  <CircleDot className="h-3 w-3" />
                  {runs.length} total
                </span>
                {completedRuns.length > 0 && (
                  <span className="flex items-center gap-1.5 text-green-500">
                    <Check className="h-3 w-3" />
                    {completedRuns.length} completed
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="flex items-center gap-1.5 text-destructive">
                    <X className="h-3 w-3" />
                    {errorCount} failed
                  </span>
                )}
              </div>
            )}

            {/* Error details */}
            {runs.filter((r) => r.status === "error" && r.error).length > 0 && (
              <div className="space-y-1.5">
                {runs
                  .filter((r) => r.status === "error" && r.error)
                  .map((r) => (
                    <div
                      key={r.model}
                      className="text-xs bg-destructive/10 text-destructive rounded-md px-3 py-2 font-mono"
                    >
                      <span className="font-semibold">{r.model}:</span> {r.error}
                    </div>
                  ))}
              </div>
            )}

            {/* Results comparison — rich cards */}
            {hasDetails && runStatus === "done" && (
              <div className="space-y-4 border-t pt-5">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-chart-5" />
                  <span className="text-sm font-medium">Results Comparison</span>
                </div>

                {/* Comparison table */}
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left font-medium px-3 py-2.5 text-muted-foreground">Model</th>
                        <th className="text-center font-medium px-3 py-2.5 text-muted-foreground">
                          <span className="flex items-center justify-center gap-1"><Check className="h-3 w-3" />Pass Rate</span>
                        </th>
                        <th className="text-center font-medium px-3 py-2.5 text-muted-foreground">
                          <span className="flex items-center justify-center gap-1"><DollarSign className="h-3 w-3" />Cost</span>
                        </th>
                        <th className="text-center font-medium px-3 py-2.5 text-muted-foreground">
                          <span className="flex items-center justify-center gap-1"><Zap className="h-3 w-3" />Avg Latency</span>
                        </th>
                        <th className="text-center font-medium px-3 py-2.5 text-muted-foreground">
                          <span className="flex items-center justify-center gap-1"><Timer className="h-3 w-3" />Duration</span>
                        </th>
                        <th className="text-center font-medium px-3 py-2.5 text-muted-foreground w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedRuns.map((r, i) => {
                        const s = r.details?.testRunSummary
                        if (!s) return null
                        const total = s.totalItems
                        const rate = total > 0 ? Math.round((s.passedItems / total) * 100) : 0

                        return (
                          <tr
                            key={r.model}
                            className={i < completedRuns.length - 1 ? "border-b border-border/50" : ""}
                          >
                            <td className="px-3 py-3 font-mono font-medium text-[13px]">
                              {r.model}
                              <div className="text-[10px] text-muted-foreground font-normal mt-0.5">
                                {s.passedItems}/{total} items passed
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${
                                  rate === 100
                                    ? "bg-green-500/15 text-green-500"
                                    : rate >= 80
                                      ? "bg-yellow-500/15 text-yellow-600"
                                      : "bg-destructive/15 text-destructive"
                                }`}
                              >
                                {rate}%
                              </span>
                            </td>
                            <td className="px-3 py-3 text-center font-mono tabular-nums">
                              {fmt.cost(s.totalCostUsd)}
                            </td>
                            <td className="px-3 py-3 text-center font-mono tabular-nums">
                              {fmt.latency(s.averageLatencyMs)}
                            </td>
                            <td className="px-3 py-3 text-center text-muted-foreground tabular-nums">
                              {fmt.duration(s.durationMs)}
                            </td>
                            <td className="px-2 py-3 text-center">
                              {r.details?.redirectUrl && (
                                <a
                                  href={r.details.redirectUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-muted transition-colors"
                                  title="View on Netra"
                                >
                                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                </a>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Stat highlight cards */}
                {completedRuns.filter((r) => r.details?.testRunSummary).length > 1 && (() => {
                  const withSummary = completedRuns.filter((r) => r.details?.testRunSummary)

                  const bestRate = Math.max(
                    ...withSummary.map((r) => r.details!.testRunSummary!.passedItems / (r.details!.testRunSummary!.totalItems || 1))
                  )
                  const bestPassModels = withSummary.filter((r) => {
                    const rate = r.details!.testRunSummary!.passedItems / (r.details!.testRunSummary!.totalItems || 1)
                    return Math.abs(rate - bestRate) < 0.001
                  })

                  const bestLatency = Math.min(
                    ...withSummary.map((r) => r.details!.testRunSummary!.averageLatencyMs)
                  )
                  const fastestModels = withSummary.filter((r) =>
                    Math.abs(r.details!.testRunSummary!.averageLatencyMs - bestLatency) < 1
                  )

                  const bestCost = Math.min(
                    ...withSummary.map((r) => r.details!.testRunSummary!.totalCostUsd)
                  )
                  const cheapestModels = withSummary.filter((r) =>
                    Math.abs(r.details!.testRunSummary!.totalCostUsd - bestCost) < 0.0001
                  )

                  const isTie = (models: ModelRun[]) => models.length > 1

                  return (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg border bg-green-500/5 border-green-500/20 p-3 text-center space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Best Pass Rate</p>
                        <div className="space-y-0.5">
                          {bestPassModels.map((m) => (
                            <p key={m.model} className="text-sm font-mono font-semibold text-green-500">{m.model}</p>
                          ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {Math.round(bestRate * 100)}%{isTie(bestPassModels) ? " (tie)" : ""}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-chart-5/5 border-chart-5/20 p-3 text-center space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Fastest</p>
                        <div className="space-y-0.5">
                          {fastestModels.map((m) => (
                            <p key={m.model} className="text-sm font-mono font-semibold text-chart-5">{m.model}</p>
                          ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {fmt.latency(bestLatency)}{isTie(fastestModels) ? " (tie)" : ""}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-primary/5 border-primary/20 p-3 text-center space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Cheapest</p>
                        <div className="space-y-0.5">
                          {cheapestModels.map((m) => (
                            <p key={m.model} className="text-sm font-mono font-semibold text-primary">{m.model}</p>
                          ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {fmt.cost(bestCost)}{isTie(cheapestModels) ? " (tie)" : ""}
                        </p>
                      </div>
                    </div>
                  )
                })()}

                <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                  Each model ran the same Netra simulation dataset. Evaluation scores, cost,
                  and latency are computed by Netra. Click the arrow icon to see full details
                  on the Netra dashboard.
                </p>
              </div>
            )}

            {/* Fallback comparison when we have simulation results but no Netra details */}
            {!hasDetails && completedRuns.length > 0 && runStatus === "done" && (
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-chart-5" />
                  <span className="text-sm font-medium">Results</span>
                </div>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left font-medium px-3 py-2.5 text-muted-foreground">Model</th>
                        <th className="text-center font-medium px-3 py-2.5 text-muted-foreground">Items</th>
                        <th className="text-center font-medium px-3 py-2.5 text-muted-foreground">Completed</th>
                        <th className="text-center font-medium px-3 py-2.5 text-muted-foreground">Failed</th>
                        <th className="text-right font-medium px-3 py-2.5 text-muted-foreground">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedRuns.map((r, i) => {
                        const res = r.result
                        const total = res?.total_items ?? 0
                        const completed = res?.completed?.length ?? 0
                        const failed = res?.failed?.length ?? 0

                        return (
                          <tr
                            key={r.model}
                            className={i < completedRuns.length - 1 ? "border-b border-border/50" : ""}
                          >
                            <td className="px-3 py-2.5 font-mono font-medium">{r.model}</td>
                            <td className="px-3 py-2.5 text-center text-muted-foreground">{total}</td>
                            <td className="px-3 py-2.5 text-center text-green-500 font-medium">{completed}</td>
                            <td className="px-3 py-2.5 text-center text-destructive font-medium">
                              {failed > 0 ? failed : <span className="text-muted-foreground/40">&mdash;</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">
                              {r.elapsed !== undefined ? fmt.duration(r.elapsed) : "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer actions */}
        <div className="p-4 border-t">
          {isRunning ? (
            <Button
              onClick={cancelRun}
              variant="destructive"
              className="w-full gap-2"
            >
              <Square className="h-4 w-4" />
              Cancel Evaluation
            </Button>
          ) : runStatus === "done" ? (
            <Button
              onClick={resetPanel}
              variant="outline"
              className="w-full gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Run Again
            </Button>
          ) : (
            <Button
              onClick={runEvaluation}
              disabled={selected.size === 0}
              className="w-full gap-2"
            >
              <Play className="h-4 w-4" />
              Run Evaluation
              {selected.size > 0 && (
                <span className="bg-primary-foreground/20 text-[11px] px-1.5 py-0.5 rounded-md tabular-nums">
                  {selected.size} {selected.size === 1 ? "model" : "models"}
                </span>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
