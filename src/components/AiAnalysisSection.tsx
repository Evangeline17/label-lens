import {
  Check,
  Clipboard,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  TriangleAlert,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AiAnalyzePayload,
  AiAnalysisResult,
  AiTaskStatusResult,
} from '../lib/aiAnalysis'
import {
  cancelAiAnalysis,
  getAiAnalysisStatus,
  startAiAnalysis,
} from '../lib/aiAnalysis'
import {
  loadAiSession,
  saveAiSession,
  storedAiNeedsStatusQuery,
} from '../lib/sessionState'
import { MarkdownReport } from './MarkdownReport'

type AnalysisState =
  | { status: 'idle' }
  | { status: 'starting' }
  | {
      status: 'processing'
      taskId: string
      createdAt: string
      progress: string
      localWaitEnded: boolean
      checkError?: string
    }
  | { status: 'success'; result: AiAnalysisResult }
  | { status: 'failed'; message: string; taskId?: string; createdAt?: string }
  | { status: 'format_error'; message: string; taskId: string; createdAt?: string }
  | { status: 'unknown'; taskId: string; createdAt: string; message: string }
  | { status: 'not_found'; taskId?: string; createdAt?: string }
  | { status: 'cancelled'; taskId?: string; createdAt?: string }

const POLL_INTERVAL_MS = 9_000
const LONG_RUNNING_MS = 5 * 60_000

function restoreAnalysisState(): AnalysisState {
  const stored = loadAiSession()
  if (!stored) return { status: 'idle' }
  if (stored.status === 'completed' && stored.taskId && stored.report) {
    return {
      status: 'success',
      result: {
        taskId: stored.taskId,
        report: stored.report,
        normalized: stored.normalized,
        normalizationWarnings: stored.normalizationWarnings,
      },
    }
  }
  if (storedAiNeedsStatusQuery(stored) && stored.taskId) {
    return {
      status: 'processing',
      taskId: stored.taskId,
      createdAt: stored.createdAt ?? new Date().toISOString(),
      progress: stored.progress ?? '正在恢复上次的分析任务',
      localWaitEnded: Boolean(stored.localWaitEnded),
    }
  }
  if (stored.status === 'failed') {
    return {
      status: 'failed',
      taskId: stored.taskId,
      createdAt: stored.createdAt,
      message: stored.error ?? 'InfiniSynapse 上游任务明确失败。',
    }
  }
  if (stored.status === 'format_error' && stored.taskId) {
    return {
      status: 'format_error',
      taskId: stored.taskId,
      createdAt: stored.createdAt,
      message: stored.error ?? '任务已完成，但最终报告格式未通过校验。',
    }
  }
  if (stored.status === 'not_found') {
    return { status: 'not_found', taskId: stored.taskId, createdAt: stored.createdAt }
  }
  if (stored.status === 'cancelled') {
    return { status: 'cancelled', taskId: stored.taskId, createdAt: stored.createdAt }
  }
  return { status: 'idle' }
}

export function AiAnalysisSection({ payload }: { payload: AiAnalyzePayload }) {
  const [state, setState] = useState<AnalysisState>(restoreAnalysisState)
  const [copied, setCopied] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)

  const applyTaskStatus = useCallback(
    (result: AiTaskStatusResult, fallbackCreatedAt?: string) => {
      if (result.status === 'completed' && result.report) {
        setState({
          status: 'success',
          result: {
            taskId: result.taskId,
            report: result.report,
            normalized: result.normalized,
            normalizationWarnings: result.normalizationWarnings,
          },
        })
        return
      }
      if (result.status === 'failed') {
        setState({
          status: 'failed',
          taskId: result.taskId,
          createdAt: result.createdAt ?? fallbackCreatedAt,
          message: result.error || 'InfiniSynapse 上游任务明确失败。',
        })
        return
      }
      if (result.status === 'format_error') {
        setState({
          status: 'format_error',
          taskId: result.taskId,
          createdAt: result.createdAt ?? fallbackCreatedAt,
          message: result.error || '任务已完成，但最终报告格式未通过校验。',
        })
        return
      }
      if (result.status === 'not_found') {
        setState({
          status: 'not_found',
          taskId: result.taskId,
          createdAt: result.createdAt ?? fallbackCreatedAt,
        })
        return
      }
      if (result.status === 'cancelled') {
        setState({
          status: 'cancelled',
          taskId: result.taskId,
          createdAt: result.createdAt ?? fallbackCreatedAt,
        })
        return
      }
      if (result.status === 'unknown') {
        const createdAt = result.createdAt || fallbackCreatedAt || new Date().toISOString()
        setState({
          status: 'unknown',
          taskId: result.taskId,
          createdAt,
          message: result.error || '任务状态暂时无法识别，请稍后再次检查。',
        })
        return
      }

      const createdAt = result.createdAt || fallbackCreatedAt || new Date().toISOString()
      setState({
        status: 'processing',
        taskId: result.taskId,
        createdAt,
        progress: result.progress || 'InfiniSynapse 正在后台分析',
        localWaitEnded: Boolean(result.localWaitEnded),
      })
    },
    [],
  )

  const checkTask = useCallback(
    async (taskId: string, createdAt: string) => {
      const controller = new AbortController()
      controllerRef.current = controller
      try {
        const result = await getAiAnalysisStatus(taskId, controller.signal)
        applyTaskStatus(result, createdAt)
      } catch (error) {
        if (controller.signal.aborted) return
        setState((current) =>
          (current.status === 'processing' || current.status === 'unknown') &&
            current.taskId === taskId
            ? {
                ...current,
                ...(current.status === 'processing'
                  ? {
                      checkError:
                        error instanceof Error
                          ? error.message
                          : '暂时无法查询状态，请稍后再次检查。',
                    }
                  : {
                      message:
                        error instanceof Error
                          ? error.message
                          : '暂时无法查询状态，请稍后再次检查。',
                    }),
              }
            : current,
        )
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null
      }
    },
    [applyTaskStatus],
  )

  useEffect(() => {
    if (state.status === 'success') {
      saveAiSession({
        status: 'completed',
        taskId: state.result.taskId,
        report: state.result.report,
        normalized: state.result.normalized,
        normalizationWarnings: state.result.normalizationWarnings,
      })
      return
    }
    if (state.status === 'processing') {
      saveAiSession({
        status: 'processing',
        taskId: state.taskId,
        createdAt: state.createdAt,
        progress: state.progress,
        localWaitEnded: state.localWaitEnded,
        error: state.checkError,
      })
      return
    }
    if (state.status === 'unknown') {
      saveAiSession({
        status: 'unknown',
        taskId: state.taskId,
        createdAt: state.createdAt,
        error: state.message,
      })
      return
    }
    if (state.status === 'failed') {
      saveAiSession({
        status: 'failed',
        taskId: state.taskId,
        createdAt: state.createdAt,
        error: state.message,
      })
      return
    }
    if (state.status === 'format_error') {
      saveAiSession({
        status: 'format_error',
        taskId: state.taskId,
        createdAt: state.createdAt,
        error: state.message,
      })
      return
    }
    if (state.status === 'not_found' || state.status === 'cancelled') {
      saveAiSession({
        status: state.status,
        taskId: state.taskId,
        createdAt: state.createdAt,
      })
      return
    }
    saveAiSession({ status: state.status })
  }, [state])

  const processingTaskId =
    state.status === 'processing' || state.status === 'unknown' ? state.taskId : null
  const processingCreatedAt =
    state.status === 'processing' || state.status === 'unknown' ? state.createdAt : null

  useEffect(() => {
    if (!processingTaskId || !processingCreatedAt) return
    void checkTask(processingTaskId, processingCreatedAt)
    const timer = window.setInterval(
      () => void checkTask(processingTaskId, processingCreatedAt),
      POLL_INTERVAL_MS,
    )
    return () => window.clearInterval(timer)
  }, [checkTask, processingCreatedAt, processingTaskId])

  useEffect(
    () => () => {
      controllerRef.current?.abort()
    },
    [],
  )

  const generate = async () => {
    if (state.status !== 'idle' && state.status !== 'failed') return
    setCopied(false)
    const controller = new AbortController()
    controllerRef.current = controller
    setState({ status: 'starting' })
    try {
      const result = await startAiAnalysis(payload, controller.signal)
      applyTaskStatus(result)
    } catch (error) {
      if (controller.signal.aborted) return
      setState({
        status: 'failed',
        message: error instanceof Error ? error.message : '任务创建失败。',
      })
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }

  const cancelTask = async () => {
    if (state.status !== 'processing') return
    const { taskId, createdAt } = state
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      const result = await cancelAiAnalysis(taskId, controller.signal)
      applyTaskStatus(result, createdAt)
    } catch (error) {
      if (controller.signal.aborted) return
      setState((current) =>
        current.status === 'processing'
          ? {
              ...current,
              checkError:
                error instanceof Error
                  ? error.message
                  : '取消请求没有成功，任务可能仍在后台运行。',
            }
          : current,
      )
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }

  const copyReport = async () => {
    if (state.status !== 'success') return
    try {
      await navigator.clipboard.writeText(state.result.report)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const isLongRunning =
    state.status === 'processing' &&
    (state.localWaitEnded || Date.now() - Date.parse(state.createdAt) >= LONG_RUNNING_MS)

  return (
    <section className="rounded-3xl border border-orange/20 bg-[#fff8ee] p-5 shadow-card sm:p-7">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-orange text-white">
          <Sparkles size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-[0.14em] text-orange">INFINISYNAPSE</p>
          <h2 className="mt-1 text-xl font-black tracking-tight">AI 综合选购建议</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            AI 只解释上方已经计算和核对的数据，不替代确定性结果，也不会上传本地图片。
          </p>
        </div>
      </div>

      {state.status === 'idle' && (
        <div className="mt-5 rounded-2xl border border-orange/15 bg-white p-4">
          <p className="text-sm font-semibold text-stone-600">尚未生成。</p>
          <button
            type="button"
            onClick={() => void generate()}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-orange px-5 font-black text-white sm:w-auto"
          >
            <Sparkles size={18} aria-hidden="true" />
            生成AI综合选购建议
          </button>
        </div>
      )}

      {state.status === 'starting' && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-orange/15 bg-white p-4">
          <LoaderCircle className="shrink-0 animate-spin text-orange" size={21} aria-hidden="true" />
          <div>
            <p className="text-sm font-black">正在创建后台分析任务</p>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              服务端正在建立 SSE 连接并提交一次任务。
            </p>
          </div>
        </div>
      )}

      {state.status === 'processing' && (
        <div className="mt-5 rounded-2xl border border-orange/15 bg-white p-4" aria-live="polite">
          <div className="flex items-start gap-3">
            {isLongRunning ? (
              <Clock3 className="mt-0.5 shrink-0 text-orange" size={21} aria-hidden="true" />
            ) : (
              <LoaderCircle
                className="mt-0.5 shrink-0 animate-spin text-orange"
                size={21}
                aria-hidden="true"
              />
            )}
            <div className="min-w-0">
              <p className="text-sm font-black">{state.progress}</p>
              <p className="mt-1 text-xs leading-5 text-stone-500">
                {isLongRunning
                  ? '分析时间较长，你可以继续等待或稍后回来检查。'
                  : '页面会每约 9 秒自动检查一次，不会重复创建任务。'}
              </p>
              {state.checkError && (
                <p className="mt-2 text-xs leading-5 text-brick">{state.checkError}</p>
              )}
            </div>
          </div>
          <p className="mt-3 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-500">
            taskId：
            <code className="ml-1 break-all font-mono text-stone-700">{state.taskId}</code>
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void checkTask(state.taskId, state.createdAt)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-black text-stone-700"
            >
              <Search size={16} aria-hidden="true" />
              检查结果
            </button>
            <button
              type="button"
              onClick={() => void cancelTask()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-brick/30 bg-white px-4 text-sm font-black text-brick"
            >
              <Square size={15} aria-hidden="true" />
              取消任务
            </button>
          </div>
        </div>
      )}

      {state.status === 'failed' && (
        <div className="mt-5 rounded-2xl border border-brick/20 bg-white p-4">
          <div className="flex gap-3">
            <TriangleAlert className="mt-0.5 shrink-0 text-brick" size={20} aria-hidden="true" />
            <div>
              <p className="text-sm font-black text-brick">生成失败</p>
              <p className="mt-1 text-sm leading-6 text-stone-600">{state.message}</p>
              <p className="mt-2 text-xs text-stone-500">上方确定性比较结果不受影响。</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void generate()}
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-black text-stone-700"
          >
            <RefreshCw size={16} aria-hidden="true" />
            重新生成
          </button>
        </div>
      )}

      {state.status === 'unknown' && (
        <div className="mt-5 rounded-2xl border border-amber-300 bg-white p-4">
          <div className="flex gap-3">
            <TriangleAlert className="mt-0.5 shrink-0 text-orange" size={20} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-black">暂时无法识别任务状态</p>
              <p className="mt-1 text-sm leading-6 text-stone-600">{state.message}</p>
              <p className="mt-2 break-all font-mono text-xs text-stone-500">
                taskId：{state.taskId}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void checkTask(state.taskId, state.createdAt)}
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-black text-stone-700"
          >
            <Search size={16} aria-hidden="true" />
            再次检查
          </button>
        </div>
      )}

      {state.status === 'format_error' && (
        <div className="mt-5 rounded-2xl border border-amber-300 bg-white p-4">
          <div className="flex gap-3">
            <TriangleAlert className="mt-0.5 shrink-0 text-orange" size={20} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-black">任务已完成，但最终报告格式未通过校验。</p>
              <p className="mt-1 text-sm leading-6 text-stone-600">{state.message}</p>
              <p className="mt-2 break-all font-mono text-xs text-stone-500">
                taskId：{state.taskId}
              </p>
              <p className="mt-2 text-xs text-stone-500">上方确定性比较结果不受影响。</p>
            </div>
          </div>
        </div>
      )}

      {state.status === 'not_found' && (
        <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-sm font-black">没有找到这项任务</p>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            本地和 InfiniSynapse 均未找到对应 taskId，现有比较结果不受影响。
          </p>
        </div>
      )}

      {state.status === 'cancelled' && (
        <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-sm font-black">任务已取消</p>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            取消操作由你主动发起，没有创建替代任务。
          </p>
        </div>
      )}

      {state.status === 'success' && (
        <div className="mt-5">
          <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
            <MarkdownReport markdown={state.result.report} />
            {state.result.normalized && (
              <p className="mt-5 border-t border-stone-100 pt-3 text-xs leading-5 text-stone-400">
                部分AI措辞已按客户端数据边界自动规范。
              </p>
            )}
          </div>
          <div className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs text-stone-500">
            真实 taskId：
            <code className="ml-1 break-all font-mono text-stone-700">{state.result.taskId}</code>
          </div>
          <button
            type="button"
            onClick={() => void copyReport()}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-black text-stone-700 sm:w-auto"
          >
            {copied ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Clipboard size={16} aria-hidden="true" />
            )}
            {copied ? '已复制' : '复制报告'}
          </button>
        </div>
      )}
    </section>
  )
}
