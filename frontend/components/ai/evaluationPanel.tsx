"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
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
  Zap,
  Trophy,
  ChevronDown,
  ChevronRight,
  MessageSquareText,
  ShieldCheck,
  ShieldX,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts"
import type { Props as LabelProps } from "recharts/types/component/Label"

const API_URL = "http://localhost:8000"
const DATASET_ID = "de2d4160-063f-4b6a-b3ef-53ccd018ee8d"
const MAX_MODEL_SELECTION = 5

type RunStatus = "idle" | "running" | "fetching_details" | "done"

type TestRunSummary = {
  totalItems: number
  passedItems: number
  failedItems: number
  durationMs: number
  totalCostUsd: number
  averageLatencyMs: number
}

type EvaluatorResult = {
  score?: number
  isPassed?: boolean
  reason?: string
  threshold?: number
}

type RunItem = {
  id: string
  runStatus?: "pending" | "running" | "completed"
  evalStatus?: "pending" | "passed" | "failed"
  input?: string
  expectedOutput?: string
  taskOutput?: string
  evaluatorResults?: Record<string, EvaluatorResult>
}

type RunDetails = {
  id: string
  name: string
  status: string
  evaluationStatus: string
  turnType?: "single" | "multi" | null
  testRunSummary?: TestRunSummary | null
  items?: RunItem[]
  redirectUrl?: string | null
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
  provider?: string
  status: "pending" | "running" | "success" | "error" | "fetching"
  elapsed?: number
  error?: string
  result?: SimulationResult
  details?: RunDetails | null
}

type ProviderInfo = {
  id: string
  name: string
  models: string[]
}

type ResultView = "summary" | "charts"

const MODEL_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#14b8a6",
]

const PROVIDER_ICONS: Record<string, string> = {
  openai: "O",
  anthropic: "A",
  google: "G",
  litellm: "L",
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  anthropic: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  google: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  litellm: "bg-purple-500/15 text-purple-400 border-purple-500/30",
}

function getModelColor(index: number): string {
  return MODEL_COLORS[index % MODEL_COLORS.length]
}

function getAllEvaluatorNames(runs: ModelRun[]): string[] {
  const nameSet = new Set<string>()
  for (const r of runs) {
    for (const item of r.details?.items ?? []) {
      for (const name of Object.keys(item.evaluatorResults ?? {})) {
        nameSet.add(name)
      }
    }
  }
  return Array.from(nameSet)
}

function getEvaluatorThreshold(runs: ModelRun[], evalName: string): number | null {
  for (const r of runs) {
    for (const item of r.details?.items ?? []) {
      const er = item.evaluatorResults?.[evalName]
      if (er?.threshold != null) return er.threshold
    }
  }
  return null
}

function ReasoningDropdown({ reasons }: { reasons: { model: string; itemId: string; input?: string; reason?: string; score?: number; isPassed?: boolean }[] }) {
  const [open, setOpen] = useState(false)

  if (reasons.length === 0) return null

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <MessageSquareText className="h-3.5 w-3.5" />
        <span className="font-medium">LLM Reasoning</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 max-h-[280px] overflow-y-auto space-y-2 pr-1">
          {reasons.map((r, i) => (
            <div key={`${r.model}-${r.itemId}-${i}`} className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold text-foreground">{r.model}</span>
                  {r.input && (
                    <span className="text-[10px] text-muted-foreground max-w-[200px] truncate">
                      &mdash; {r.input}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {r.score != null && (
                    <span className="text-[10px] font-mono font-bold tabular-nums text-foreground/70">
                      {r.score.toFixed(2)}
                    </span>
                  )}
                  {r.isPassed != null && (
                    r.isPassed
                      ? <ShieldCheck className="h-3.5 w-3.5 text-green-400" />
                      : <ShieldX className="h-3.5 w-3.5 text-red-400" />
                  )}
                </div>
              </div>
              {r.reason && (
                <p className="text-[11px] text-foreground/60 leading-relaxed whitespace-pre-wrap">{r.reason}</p>
              )}
              {!r.reason && (
                <p className="text-[11px] text-foreground/30 italic">No reasoning provided</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function EvaluationPanel() {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [, setSelectedProviderMap] = useState<Record<string, string>>({})
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [runStatus, setRunStatus] = useState<RunStatus>("idle")
  const [runs, setRuns] = useState<ModelRun[]>([])
  const [resultView, setResultView] = useState<ResultView>("summary")
  const abortRef = useRef<AbortController | null>(null)

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/providers`)
      if (!res.ok) return
      const data = await res.json()
      setProviders(data.providers ?? [])
    } catch {
      // backend unreachable
    }
  }, [])

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  const makeSelKey = (provider: string, model: string) => `${provider}::${model}`
  const parseSelKey = (key: string) => {
    const [provider, ...rest] = key.split("::")
    return { provider, model: rest.join("::") }
  }

  const atSelectionLimit = selected.size >= MAX_MODEL_SELECTION

  const toggle = (provider: string, model: string) => {
    const key = makeSelKey(provider, model)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else if (next.size < MAX_MODEL_SELECTION) {
        next.add(key)
      }
      return next
    })
    setSelectedProviderMap((prev) => ({ ...prev, [key]: provider }))
  }

  const selectAll = () => {
    if (selected.size > 0) {
      setSelected(new Set())
      return
    }
    const allKeys: string[] = []
    const provMap: Record<string, string> = {}
    providers.forEach((p) => {
      p.models.forEach((m) => {
        const key = makeSelKey(p.id, m)
        allKeys.push(key)
        provMap[key] = p.id
      })
    })
    const capped = allKeys.slice(0, MAX_MODEL_SELECTION)
    setSelected(new Set(capped))
    setSelectedProviderMap(provMap)
  }

  const totalModels = providers.reduce((acc, p) => acc + p.models.length, 0)

  const fetchRunDetails = async (
    runId: string,
    signal: AbortSignal
  ): Promise<RunDetails | null> => {
    try {
      const res = await fetch(`${API_URL}/evaluation/run/${runId}`, { signal })
      if (!res.ok) return null
      const json = await res.json()
      const d = json.data ?? json
      const result: RunDetails = {
        id: d.id ?? runId,
        name: d.name ?? "",
        status: d.status ?? "",
        evaluationStatus: d.evaluationStatus ?? "",
        testRunSummary: d.testRunSummary ?? null,
        redirectUrl: d.redirectUrl ?? null,
      }

      if (d.turnType) result.turnType = d.turnType
      if (Array.isArray(d.items) && d.items.length > 0) {
        result.items = d.items
          .filter((item: unknown) => item != null && typeof item === "object")
          .map((item: Record<string, unknown>, idx: number) => {
            const mapped: RunItem = { id: (item.id as string) ?? `item-${idx}` }
            if (item.runStatus) mapped.runStatus = item.runStatus as RunItem["runStatus"]
            if (item.evalStatus) mapped.evalStatus = item.evalStatus as RunItem["evalStatus"]
            if (item.input != null) mapped.input = String(item.input)
            if (item.expectedOutput != null) mapped.expectedOutput = String(item.expectedOutput)
            if (item.taskOutput != null) mapped.taskOutput = String(item.taskOutput)
            if (item.evaluatorResults && typeof item.evaluatorResults === "object") {
              mapped.evaluatorResults = item.evaluatorResults as Record<string, EvaluatorResult>
            }
            return mapped
          })
      }

      return result
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
    const entries = Array.from(selected).map(parseSelKey)
    if (entries.length === 0) return

    const controller = new AbortController()
    abortRef.current = controller

    const initialRuns: ModelRun[] = entries.map((e) => ({
      model: e.model,
      provider: e.provider,
      status: "pending",
    }))
    setRuns(initialRuns)
    setRunStatus("running")
    setResultView("summary")

    for (let i = 0; i < entries.length; i++) {
      if (controller.signal.aborted) break

      const { model, provider } = entries[i]
      setRuns((prev) =>
        prev.map((r) => (r.model === model && r.provider === provider ? { ...r, status: "running" } : r))
      )

      const start = Date.now()

      try {
        await fetch(`${API_URL}/model`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, provider }),
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
              r.model === model && r.provider === provider
                ? { ...r, status: "error", elapsed, error: err.error ?? `HTTP ${res.status}` }
                : r
            )
          )
          continue
        }

        const result: SimulationResult = await res.json()

        setRuns((prev) =>
          prev.map((r) =>
            r.model === model && r.provider === provider
              ? { ...r, status: result.run_id ? "fetching" : "success", elapsed, result }
              : r
          )
        )

        if (result.run_id) {
          const details = await pollRunDetails(result.run_id, controller.signal)
          setRuns((prev) =>
            prev.map((r) =>
              r.model === model && r.provider === provider ? { ...r, status: "success", details } : r
            )
          )
        }
      } catch (e: unknown) {
        if (controller.signal.aborted) break
        const elapsed = Date.now() - start
        setRuns((prev) =>
          prev.map((r) =>
            r.model === model && r.provider === provider
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
    setResultView("summary")
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
  const withSummary = completedRuns.filter((r) => r.details?.testRunSummary)
  const hasDetails = withSummary.length > 0
  const hasItems = completedRuns.some((r) => r.details?.items && r.details.items.length > 0)
  const isRunning = runStatus === "running" || runStatus === "fetching_details"

  const allEvaluatorNames = hasItems ? getAllEvaluatorNames(completedRuns) : []

  const getBest = (key: "rate" | "cost" | "latency") => {
    if (withSummary.length === 0) return { value: 0, models: [] as string[] }
    if (key === "rate") {
      const best = Math.max(...withSummary.map((r) => r.details!.testRunSummary!.passedItems / (r.details!.testRunSummary!.totalItems || 1)))
      return { value: best, models: withSummary.filter((r) => Math.abs(r.details!.testRunSummary!.passedItems / (r.details!.testRunSummary!.totalItems || 1) - best) < 0.001).map((r) => r.model) }
    }
    if (key === "cost") {
      const best = Math.min(...withSummary.map((r) => r.details!.testRunSummary!.totalCostUsd))
      return { value: best, models: withSummary.filter((r) => Math.abs(r.details!.testRunSummary!.totalCostUsd - best) < 0.0001).map((r) => r.model) }
    }
    const best = Math.min(...withSummary.map((r) => r.details!.testRunSummary!.averageLatencyMs))
    return { value: best, models: withSummary.filter((r) => Math.abs(r.details!.testRunSummary!.averageLatencyMs - best) < 1).map((r) => r.model) }
  }

  const getModelLabel = (r: ModelRun) => {
    if (r.provider) {
      const pName = PROVIDER_ICONS[r.provider] ?? r.provider
      return `[${pName}] ${r.model}`
    }
    return r.model
  }

  return (
    <Dialog onOpenChange={(open) => { if (open) fetchProviders() }}>
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
        className={`flex flex-col p-0 gap-0 max-h-[90vh] transition-all ${
          hasDetails && runStatus === "done" ? "sm:max-w-[860px]" : "sm:max-w-[640px]"
        }`}
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
            <div className="flex-1">
              <h3 className="font-semibold text-base">Netra Evaluation</h3>
              <p className="text-xs text-muted-foreground">
                Multi-model simulation runner
              </p>
            </div>
            {hasDetails && runStatus === "done" && completedRuns[0]?.details?.redirectUrl && (
              <a
                href={completedRuns[0].details.redirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Open in Netra <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {!(hasDetails && runStatus === "done") && (
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              Run your agent through Netra&apos;s evaluation pipeline across multiple models
              side by side. Select the models you want to benchmark, hit run, and
              compare cost, latency, and pass rates on the same simulation dataset.
            </p>
          )}
        </div>

        <ScrollArea className="flex-1 overflow-auto">
          <div className="p-5 space-y-5">

            {/* Provider + Model selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Models</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums ${
                    atSelectionLimit
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {selected.size}/{MAX_MODEL_SELECTION}
                  </span>
                </div>
                <button
                  onClick={selectAll}
                  disabled={isRunning}
                  className="text-xs text-primary hover:underline disabled:opacity-40 cursor-pointer"
                >
                  {selected.size > 0 ? "Deselect all" : `Select first ${MAX_MODEL_SELECTION}`}
                </button>
              </div>

              {providers.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
                  No providers available. Is the backend running?
                </div>
              ) : (
                <div className="space-y-1">
                  {providers.map((provider) => {
                    const isExpanded = expandedProvider === provider.id
                    const providerSelected = provider.models.filter((m) => selected.has(makeSelKey(provider.id, m))).length
                    return (
                      <div key={provider.id} className="rounded-lg border border-border/50 overflow-hidden">
                        <button
                          onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                          disabled={isRunning}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs cursor-pointer transition-colors hover:bg-muted/30 disabled:opacity-60"
                        >
                          <span className={`inline-flex items-center justify-center h-6 w-6 rounded-md text-[11px] font-bold border ${PROVIDER_COLORS[provider.id] ?? "bg-muted text-muted-foreground border-border"}`}>
                            {PROVIDER_ICONS[provider.id] ?? "?"}
                          </span>
                          <span className="font-semibold text-[13px] flex-1 text-left">{provider.name}</span>
                          {providerSelected > 0 && (
                            <span className="text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full tabular-nums">
                              {providerSelected}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground tabular-nums">{provider.models.length} models</span>
                          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                        </button>
                        {isExpanded && (
                          <div className="border-t border-border/30 px-2 py-1.5 space-y-0.5 bg-muted/10">
                            {provider.models.map((m) => {
                              const key = makeSelKey(provider.id, m)
                              const isSelected = selected.has(key)
                              const isDisabled = isRunning || (!isSelected && atSelectionLimit)
                              const run = runs.find((r) => r.model === m && r.provider === provider.id)

                              return (
                                <label
                                  key={m}
                                  className={`group flex items-center gap-3 px-3 py-2 rounded-md transition-all select-none ${
                                    isDisabled
                                      ? "cursor-default opacity-50"
                                      : isSelected
                                        ? "bg-primary/5 cursor-pointer"
                                        : "hover:bg-muted/40 cursor-pointer"
                                  }`}
                                >
                                  <div
                                    className={`flex items-center justify-center h-[18px] w-[18px] rounded-[4px] border-[1.5px] transition-colors shrink-0 ${
                                      isSelected
                                        ? "bg-primary border-primary"
                                        : isDisabled
                                          ? "border-muted-foreground/20"
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
                                    onChange={() => toggle(provider.id, m)}
                                    disabled={isDisabled}
                                    className="sr-only"
                                  />
                                  <span className="text-[12px] flex-1 font-mono">{m}</span>

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
                      key={`${r.provider}-${r.model}`}
                      className="text-xs bg-destructive/10 text-destructive rounded-md px-3 py-2 font-mono"
                    >
                      <span className="font-semibold">{getModelLabel(r)}:</span> {r.error}
                    </div>
                  ))}
              </div>
            )}

            {/* ── RESULTS SECTION ── */}
            {hasDetails && runStatus === "done" && (
              <div className="space-y-4 border-t pt-5">

                {/* View toggle + title */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-chart-5" />
                    <span className="text-sm font-medium">Results</span>
                  </div>
                  {hasItems && (
                    <div className="flex items-center rounded-lg border bg-muted/40 p-0.5">
                      <button
                        onClick={() => setResultView("summary")}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                          resultView === "summary"
                            ? "bg-background shadow-sm text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Summary
                      </button>
                      <button
                        onClick={() => setResultView("charts")}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                          resultView === "charts"
                            ? "bg-background shadow-sm text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Charts
                      </button>
                    </div>
                  )}
                </div>

                {/* ── SUMMARY VIEW ── */}
                {resultView === "summary" && (
                  <div className="space-y-4">

                    {/* Winner cards */}
                    {withSummary.length > 1 && (() => {
                      const best = {
                        rate: getBest("rate"),
                        cost: getBest("cost"),
                        latency: getBest("latency"),
                      }
                      return (
                        <div className="grid grid-cols-3 gap-2.5">
                          <div className="rounded-xl border border-green-600/30 bg-green-950/20 p-3.5 text-center space-y-1.5">
                            <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-green-600/20 text-green-400 mx-auto">
                              <Trophy className="h-4 w-4" />
                            </div>
                            <p className="text-[10px] uppercase tracking-wider text-foreground/60 font-semibold">Best Pass Rate</p>
                            {best.rate.models.map((m) => (
                              <p key={m} className="text-[13px] font-mono font-bold text-green-400 truncate">{m}</p>
                            ))}
                            <p className="text-xs text-foreground/70 font-semibold tabular-nums">
                              {Math.round(best.rate.value * 100)}%{best.rate.models.length > 1 ? " (tie)" : ""}
                            </p>
                          </div>
                          <div className="rounded-xl border border-blue-600/30 bg-blue-950/20 p-3.5 text-center space-y-1.5">
                            <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-600/20 text-blue-400 mx-auto">
                              <Zap className="h-4 w-4" />
                            </div>
                            <p className="text-[10px] uppercase tracking-wider text-foreground/60 font-semibold">Fastest</p>
                            {best.latency.models.map((m) => (
                              <p key={m} className="text-[13px] font-mono font-bold text-blue-400 truncate">{m}</p>
                            ))}
                            <p className="text-xs text-foreground/70 font-semibold tabular-nums">
                              {fmt.latency(best.latency.value)}{best.latency.models.length > 1 ? " (tie)" : ""}
                            </p>
                          </div>
                          <div className="rounded-xl border border-amber-600/30 bg-amber-950/20 p-3.5 text-center space-y-1.5">
                            <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-amber-600/20 text-amber-400 mx-auto">
                              <DollarSign className="h-4 w-4" />
                            </div>
                            <p className="text-[10px] uppercase tracking-wider text-foreground/60 font-semibold">Cheapest</p>
                            {best.cost.models.map((m) => (
                              <p key={m} className="text-[13px] font-mono font-bold text-amber-400 truncate">{m}</p>
                            ))}
                            <p className="text-xs text-foreground/70 font-semibold tabular-nums">
                              {fmt.cost(best.cost.value)}{best.cost.models.length > 1 ? " (tie)" : ""}
                            </p>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Comparison table */}
                    <div className="rounded-xl border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/60 border-b">
                            <th className="text-left font-semibold px-3 py-2.5 text-foreground/80">Model</th>
                            <th className="text-center font-semibold px-3 py-2.5 text-foreground/80">Pass Rate</th>
                            <th className="text-center font-semibold px-3 py-2.5 text-foreground/80">Cost</th>
                            <th className="text-center font-semibold px-3 py-2.5 text-foreground/80">Avg Latency</th>
                            <th className="text-center font-semibold px-3 py-2.5 text-foreground/80">Duration</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {withSummary.map((r, i) => {
                            const s = r.details!.testRunSummary!
                            const total = s.totalItems
                            const rate = total > 0 ? Math.round((s.passedItems / total) * 100) : 0
                            const isBestRate = withSummary.length > 1 && getBest("rate").models.includes(r.model)
                            const isBestCost = withSummary.length > 1 && getBest("cost").models.includes(r.model)
                            const isBestLatency = withSummary.length > 1 && getBest("latency").models.includes(r.model)

                            return (
                              <tr
                                key={`${r.provider}-${r.model}`}
                                className={`transition-colors hover:bg-muted/30 ${i < withSummary.length - 1 ? "border-b border-border/50" : ""}`}
                              >
                                <td className="px-3 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: getModelColor(i) }} />
                                    <div>
                                      <div className="flex items-center gap-1.5">
                                        {r.provider && (
                                          <span className={`inline-flex items-center justify-center h-4 w-4 rounded text-[8px] font-bold border ${PROVIDER_COLORS[r.provider] ?? ""}`}>
                                            {PROVIDER_ICONS[r.provider] ?? "?"}
                                          </span>
                                        )}
                                        <span className="font-mono font-semibold text-[13px] text-foreground">{r.model}</span>
                                      </div>
                                      <div className="text-[10px] text-foreground/50 mt-0.5 flex items-center gap-1.5">
                                        {s.passedItems}/{total} passed
                                        {r.details?.turnType && (
                                          <span className="inline-flex items-center px-1.5 py-px rounded text-[9px] font-medium bg-muted border text-foreground/60">
                                            {r.details.turnType}-turn
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold tabular-nums ${
                                    rate === 100 ? "bg-green-500/20 text-green-400"
                                    : rate >= 80 ? "bg-yellow-500/20 text-yellow-400"
                                    : "bg-red-500/20 text-red-400"
                                  }`}>
                                    {isBestRate && <Trophy className="h-2.5 w-2.5" />}
                                    {rate}%
                                  </span>
                                </td>
                                <td className={`px-3 py-3 text-center font-mono tabular-nums text-[12px] ${isBestCost ? "text-green-400 font-bold" : "text-foreground/70"}`}>
                                  {fmt.cost(s.totalCostUsd)}
                                </td>
                                <td className={`px-3 py-3 text-center font-mono tabular-nums text-[12px] ${isBestLatency ? "text-blue-400 font-bold" : "text-foreground/70"}`}>
                                  {fmt.latency(s.averageLatencyMs)}
                                </td>
                                <td className="px-3 py-3 text-center text-foreground/50 tabular-nums text-[12px]">
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
                                      <ExternalLink className="h-3.5 w-3.5 text-foreground/40" />
                                    </a>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── CHARTS VIEW — score-based with pass/fail + threshold + reasoning ── */}
                {resultView === "charts" && hasItems && (() => {
                  const modelEntries = withSummary.map((r) => ({ model: r.model, provider: r.provider }))
                  const modelNames = modelEntries.map((e) => e.model)

                  const overallData = modelEntries.map((entry, mi) => {
                    const r = withSummary.find((r) => r.model === entry.model && r.provider === entry.provider)
                    const s = r?.details?.testRunSummary
                    const total = s?.totalItems || 1
                    const passRate = s ? s.passedItems / total : 0
                    const passed = s ? s.passedItems >= s.totalItems : false
                    return {
                      name: entry.model,
                      score: parseFloat(passRate.toFixed(2)),
                      isPassed: passed,
                      fill: getModelColor(mi),
                    }
                  })

                  const evaluatorCharts = allEvaluatorNames.map((evalName) => {
                    const threshold = getEvaluatorThreshold(completedRuns, evalName)
                    const data = modelEntries.map((entry, mi) => {
                      const r = withSummary.find((r) => r.model === entry.model && r.provider === entry.provider)
                      const items = r?.details?.items ?? []
                      const scores = items
                        .map((it) => it.evaluatorResults?.[evalName]?.score)
                        .filter((s): s is number => s != null)
                      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
                      const passedCount = items.filter((it) => it.evaluatorResults?.[evalName]?.isPassed).length
                      const totalCount = items.filter((it) => it.evaluatorResults?.[evalName]).length
                      const allPassed = totalCount > 0 && passedCount === totalCount
                      return {
                        name: entry.model,
                        score: parseFloat(avgScore.toFixed(2)),
                        isPassed: allPassed,
                        passedCount,
                        totalCount,
                        fill: getModelColor(mi),
                      }
                    })

                    const reasons: { model: string; itemId: string; input?: string; reason?: string; score?: number; isPassed?: boolean }[] = []
                    withSummary.forEach((r) => {
                      for (const item of r.details?.items ?? []) {
                        const er = item.evaluatorResults?.[evalName]
                        if (er) {
                          reasons.push({
                            model: r.model,
                            itemId: item.id,
                            input: item.input,
                            reason: er.reason,
                            score: er.score,
                            isPassed: er.isPassed,
                          })
                        }
                      }
                    })

                    return { evalName, data, threshold, reasons }
                  })

                  const chartHeight = Math.max(200, modelNames.length * 48 + 80)

                  return (
                    <div className="space-y-6">
                      {/* Legend */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
                        {modelEntries.map((entry, mi) => (
                          <div key={`${entry.provider}-${entry.model}`} className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded shrink-0" style={{ backgroundColor: getModelColor(mi) }} />
                            {entry.provider && (
                              <span className={`inline-flex items-center justify-center h-4 w-4 rounded text-[8px] font-bold border ${PROVIDER_COLORS[entry.provider] ?? ""}`}>
                                {PROVIDER_ICONS[entry.provider] ?? "?"}
                              </span>
                            )}
                            <span className="text-xs font-mono font-medium text-foreground">{entry.model}</span>
                          </div>
                        ))}
                      </div>

                      {/* Overall pass rate chart — uses scores */}
                      <div className="rounded-xl border bg-card p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <Trophy className="h-4 w-4 text-amber-400" />
                            <span className="text-sm font-semibold text-foreground">Overall Pass Rate</span>
                          </div>
                        </div>
                        <div style={{ height: chartHeight }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={overallData} margin={{ left: 8, right: 16, top: 32, bottom: 8 }} barGap={8}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.08)" />
                              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.6)" }} axisLine={false} tickLine={false} />
                              <YAxis domain={[0, 1]} tickFormatter={(v: number) => v.toFixed(1)} tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} width={40} />
                              <Tooltip
                                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                                content={({ active, payload }) => {
                                  if (!active || !payload?.length) return null
                                  const d = payload[0]?.payload as typeof overallData[number] | undefined
                                  if (!d) return null
                                  return (
                                    <div className="bg-popover border border-border rounded-lg shadow-xl px-3.5 py-2.5 text-xs space-y-1.5">
                                      <div className="flex items-center gap-2">
                                        <span className="h-2.5 w-2.5 rounded shrink-0" style={{ backgroundColor: d.fill }} />
                                        <span className="font-mono font-medium text-foreground">{d.name}</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-4">
                                        <span className="text-foreground/60">Score</span>
                                        <span className="font-bold tabular-nums">{d.score.toFixed(2)}</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-4">
                                        <span className="text-foreground/60">Status</span>
                                        <span className={`font-semibold ${d.isPassed ? "text-green-400" : "text-red-400"}`}>
                                          {d.isPassed ? "PASS" : "FAIL"}
                                        </span>
                                      </div>
                                    </div>
                                  )
                                }}
                              />
                              <Bar dataKey="score" radius={[6, 6, 0, 0]} maxBarSize={52}
                                label={((props: LabelProps) => {
                                  const x = Number(props.x ?? 0)
                                  const y = Number(props.y ?? 0)
                                  const w = Number(props.width ?? 0)
                                  const v = Number(props.value ?? 0)
                                  const runtimeProps = props as LabelProps & { payload?: typeof overallData[number] }
                                  const passed = runtimeProps.payload?.isPassed ?? false
                                  return (
                                    <g>
                                      <text x={x + w / 2} y={y - 8} textAnchor="middle" fontSize={12} fontWeight={700} fill="rgba(255,255,255,0.85)">
                                        {v.toFixed(2)}
                                      </text>
                                      <text x={x + w / 2} y={y - 22} textAnchor="middle" fontSize={9} fontWeight={600} fill={passed ? "#4ade80" : "#f87171"}>
                                        {passed ? "PASS" : "FAIL"}
                                      </text>
                                    </g>
                                  )
                                })}
                              >
                                {overallData.map((entry, idx) => (
                                  <Cell key={idx} fill={entry.fill} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* One chart per evaluator — with scores, threshold label, pass/fail, reasoning */}
                      {evaluatorCharts.map(({ evalName, data, threshold, reasons }) => (
                        <div key={evalName} className="rounded-xl border bg-card p-5 space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <BarChart3 className="h-4 w-4 text-foreground/40" />
                              <span className="text-sm font-semibold text-foreground">{evalName}</span>
                            </div>
                            {threshold != null && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-md">
                                Threshold: {threshold.toFixed(2)}
                              </span>
                            )}
                          </div>
                          <div style={{ height: chartHeight }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={data} margin={{ left: 8, right: 16, top: 32, bottom: 8 }} barGap={8}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.08)" />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.6)" }} axisLine={false} tickLine={false} />
                                <YAxis domain={[0, 1]} tickFormatter={(v: number) => v.toFixed(1)} tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} width={40} />
                                {threshold != null && (
                                  <ReferenceLine
                                    y={threshold}
                                    stroke="#fbbf24"
                                    strokeDasharray="6 3"
                                    strokeWidth={1.5}
                                    label={{
                                      value: `Threshold ${threshold.toFixed(2)}`,
                                      position: "right",
                                      fill: "#fbbf24",
                                      fontSize: 10,
                                      fontWeight: 600,
                                    }}
                                  />
                                )}
                                <Tooltip
                                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                                  content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null
                                    const d = payload[0]?.payload as typeof data[number] | undefined
                                    if (!d) return null
                                    return (
                                      <div className="bg-popover border border-border rounded-lg shadow-xl px-3.5 py-2.5 text-xs space-y-1.5">
                                        <p className="font-semibold text-foreground text-[11px]">{evalName}</p>
                                        <div className="flex items-center gap-2">
                                          <span className="h-2.5 w-2.5 rounded shrink-0" style={{ backgroundColor: d.fill }} />
                                          <span className="font-mono font-medium text-foreground">{d.name}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4">
                                          <span className="text-foreground/60">Avg Score</span>
                                          <span className="font-bold tabular-nums">{d.score.toFixed(2)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4">
                                          <span className="text-foreground/60">Passed</span>
                                          <span className="tabular-nums">{d.passedCount}/{d.totalCount}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4">
                                          <span className="text-foreground/60">Status</span>
                                          <span className={`font-semibold ${d.isPassed ? "text-green-400" : "text-red-400"}`}>
                                            {d.isPassed ? "PASS" : "FAIL"}
                                          </span>
                                        </div>
                                        {threshold != null && (
                                          <div className="flex items-center justify-between gap-4">
                                            <span className="text-foreground/60">Threshold</span>
                                            <span className="text-amber-400 tabular-nums font-medium">{threshold.toFixed(2)}</span>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  }}
                                />
                                <Bar dataKey="score" radius={[6, 6, 0, 0]} maxBarSize={52}
                                  label={((props: LabelProps) => {
                                    const x = Number(props.x ?? 0)
                                    const y = Number(props.y ?? 0)
                                    const w = Number(props.width ?? 0)
                                    const v = Number(props.value ?? 0)
                                    const runtimeProps = props as LabelProps & { payload?: typeof data[number] }
                                    const passed = runtimeProps.payload?.isPassed ?? false
                                    return (
                                      <g>
                                        <text x={x + w / 2} y={y - 8} textAnchor="middle" fontSize={12} fontWeight={700} fill="rgba(255,255,255,0.85)">
                                          {v.toFixed(2)}
                                        </text>
                                        <text x={x + w / 2} y={y - 22} textAnchor="middle" fontSize={9} fontWeight={600} fill={passed ? "#4ade80" : "#f87171"}>
                                          {passed ? "PASS" : "FAIL"}
                                        </text>
                                      </g>
                                    )
                                  })}
                                >
                                  {data.map((entry, idx) => (
                                    <Cell key={idx} fill={entry.fill} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <ReasoningDropdown reasons={reasons} />
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Fallback comparison when we have simulation results but no Netra details */}
            {!hasDetails && completedRuns.length > 0 && runStatus === "done" && (
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-chart-5" />
                  <span className="text-sm font-medium">Results</span>
                </div>
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/60 border-b">
                        <th className="text-left font-semibold px-3 py-2.5 text-foreground/80">Model</th>
                        <th className="text-center font-semibold px-3 py-2.5 text-foreground/80">Items</th>
                        <th className="text-center font-semibold px-3 py-2.5 text-foreground/80">Completed</th>
                        <th className="text-center font-semibold px-3 py-2.5 text-foreground/80">Failed</th>
                        <th className="text-right font-semibold px-3 py-2.5 text-foreground/80">Time</th>
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
                            key={`${r.provider}-${r.model}`}
                            className={`hover:bg-muted/30 transition-colors ${i < completedRuns.length - 1 ? "border-b border-border/50" : ""}`}
                          >
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5">
                                {r.provider && (
                                  <span className={`inline-flex items-center justify-center h-4 w-4 rounded text-[8px] font-bold border ${PROVIDER_COLORS[r.provider] ?? ""}`}>
                                    {PROVIDER_ICONS[r.provider] ?? "?"}
                                  </span>
                                )}
                                <span className="font-mono font-semibold text-foreground">{r.model}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center text-foreground/70">{total}</td>
                            <td className="px-3 py-2.5 text-center text-green-400 font-semibold">{completed}</td>
                            <td className="px-3 py-2.5 text-center text-red-400 font-semibold">
                              {failed > 0 ? failed : <span className="text-foreground/30">&mdash;</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right text-foreground/50 tabular-nums">
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
