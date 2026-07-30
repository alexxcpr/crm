export type WorkflowScheduleStatus =
  | 'active'
  | 'paused'
  | 'completed'

export interface WorkflowScheduleExecution {
  id_execution: string
  status: 'running' | 'completed' | 'failed' | 'skipped'
  error_code?: string | null
  error_message?: string | null
  date_started: string
  date_finished?: string | null
  scheduled_for?: string | null
  duration_ms?: number | null
}

export interface WorkflowSchedule {
  id_schedule: string
  id_workflow: string
  workflow_name: string
  workflow_status: string
  workflow_is_valid: boolean
  name: string
  schedule_type: 'cron' | 'once'
  cron_expression: string | null
  run_at: string | null
  timezone: string
  is_active: boolean
  next_run_at: string | null
  schedule_status: WorkflowScheduleStatus
  description: string
  is_running: boolean
  last_execution: WorkflowScheduleExecution | null
  date_created: string
  date_updated: string
}

export interface WorkflowSchedulePayload {
  name: string
  workflowId: string
  scheduleType: 'cron' | 'once'
  cronExpression?: string
  runAt?: string
  timezone: string
  isActive: boolean
}

interface ApiResponse<T> {
  data: T
  mesaj?: string
  meta?: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export function useWorkflowSchedules() {
  const { apiFetch } = useApi()
  const schedules = ref<WorkflowSchedule[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  function errorMessage(err: any, fallback: string) {
    return err?.data?.message || err?.message || fallback
  }

  async function fetchSchedules() {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<WorkflowSchedule[]>>(
        '/v1/admin/workflow-schedules'
      )
      schedules.value = response.data
    } catch (err: any) {
      error.value = errorMessage(err, 'Programarile nu au putut fi incarcate.')
    } finally {
      loading.value = false
    }
  }

  async function createSchedule(payload: WorkflowSchedulePayload) {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<WorkflowSchedule>>(
        '/v1/admin/workflow-schedules',
        { method: 'POST', body: payload }
      )
      await fetchSchedules()
      return response.data
    } catch (err: any) {
      error.value = errorMessage(err, 'Programarea nu a putut fi creata.')
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateSchedule(id: string, payload: WorkflowSchedulePayload) {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<WorkflowSchedule>>(
        `/v1/admin/workflow-schedules/${id}`,
        { method: 'PUT', body: payload }
      )
      await fetchSchedules()
      return response.data
    } catch (err: any) {
      error.value = errorMessage(err, 'Programarea nu a putut fi actualizata.')
      return null
    } finally {
      loading.value = false
    }
  }

  async function removeSchedule(id: string) {
    loading.value = true
    error.value = null
    try {
      await apiFetch(`/v1/admin/workflow-schedules/${id}`, { method: 'DELETE' })
      await fetchSchedules()
      return true
    } catch (err: any) {
      error.value = errorMessage(err, 'Programarea nu a putut fi stearsa.')
      return false
    } finally {
      loading.value = false
    }
  }

  async function setActive(id: string, active: boolean) {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<WorkflowSchedule>>(
        `/v1/admin/workflow-schedules/${id}/${active ? 'activate' : 'deactivate'}`,
        { method: 'POST' }
      )
      await fetchSchedules()
      return response.data
    } catch (err: any) {
      error.value = errorMessage(err, 'Statusul programarii nu a putut fi schimbat.')
      return null
    } finally {
      loading.value = false
    }
  }

  async function runNow(id: string) {
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<{ executionId: string }>>(
        `/v1/admin/workflow-schedules/${id}/run-now`,
        { method: 'POST' }
      )
      await fetchSchedules()
      return response.data
    } catch (err: any) {
      error.value = errorMessage(err, 'Workflow-ul nu a putut fi rulat.')
      return null
    }
  }

  async function preview(cronExpression: string, timezone: string) {
    const response = await apiFetch<ApiResponse<{
      cronExpression: string
      timezone: string
      occurrences: Array<{ utc: string, local: string }>
    }>>('/v1/admin/workflow-schedules/preview', {
      method: 'POST',
      body: { cronExpression, timezone }
    })
    return response.data
  }

  async function fetchExecutions(id: string, page = 1, limit = 10) {
    const response = await apiFetch<ApiResponse<WorkflowScheduleExecution[]>>(
      `/v1/admin/workflow-schedules/${id}/executions`,
      { query: { page, limit } }
    )
    return {
      data: response.data,
      meta: response.meta ?? { total: 0, page, limit, totalPages: 0 }
    }
  }

  return {
    schedules,
    loading,
    error,
    fetchSchedules,
    createSchedule,
    updateSchedule,
    removeSchedule,
    setActive,
    runNow,
    preview,
    fetchExecutions
  }
}
