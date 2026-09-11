import type {
  BootstrapResponse, BranchInfo, CheckResult, CreateSessionBody, Defect, DefectListResponse,
  DiffStat, DirtyConflict, FeatureSpec, FetchMode, GitStatus, QaPromptPayload, Session, Settings,
  ProbeResult, SourceConfig, TaskPromptPayload, ValidateResult,
  Workspace, WorkspaceColor,
} from '@shared/types'

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly body: unknown) {
    super(message)
  }

  /** 409 ตอน working tree สกปรก — dialog ต้องถามผู้ใช้ก่อนไปต่อ */
  get dirty(): DirtyConflict | null {
    const b = this.body as DirtyConflict | null
    return this.status === 409 && b?.error === 'dirty' ? b : null
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    })
  } catch {
    throw new ApiError(0, 'ต่อ server ไม่ได้ — pat ยังรันอยู่หรือเปล่า', null)
  }

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error ?? `เกิดข้อผิดพลาด (${res.status})`
    throw new ApiError(res.status, message, body)
  }
  return body as T
}

const post = <T>(path: string, body?: unknown) =>
  req<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

export const api = {
  bootstrap: () => req<BootstrapResponse>('/api/bootstrap'),

  settings: {
    patch: (patch: Partial<Settings>) =>
      req<Settings>('/api/settings', { method: 'PATCH', body: JSON.stringify(patch) }),
  },

  workspaces: {
    list: () => req<Workspace[]>('/api/workspaces'),
    validate: (path: string) => post<ValidateResult>('/api/workspaces/validate', { path }),
    create: (input: Omit<Workspace, 'id'>) =>
      post<Workspace>('/api/workspaces', input),
    update: (id: string, patch: Partial<Workspace>) =>
      req<Workspace>(`/api/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    remove: (id: string) => req<{ ok: true }>(`/api/workspaces/${id}`, { method: 'DELETE' }),
    status: (id: string) => req<GitStatus>(`/api/workspaces/${id}/status`),
    branches: (id: string) => req<BranchInfo[]>(`/api/workspaces/${id}/branches`),
  },

  defects: {
    /** mode=cache คืน null เมื่อยังไม่เคย cache ไว้ — ฝั่งเรียกเอาไปตัดสินใจว่าจะขึ้น skeleton ไหม */
    list: (workspaceId?: string | null, mode: FetchMode = 'auto') => {
      const q = new URLSearchParams()
      if (workspaceId) q.set('workspaceId', workspaceId)
      if (mode !== 'auto') q.set('mode', mode)
      return req<DefectListResponse | null>(`/api/defects${q.size ? `?${q}` : ''}`)
    },
    get: (id: string, workspaceId?: string | null) =>
      req<Defect>(
        `/api/defects/${encodeURIComponent(id)}${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`,
      ),
  },

  sources: {
    list: () => req<SourceConfig[]>('/api/sources'),
    test: (id: string, vars: Record<string, string>, workspaceId?: string | null) =>
      post<CheckResult[]>(
        `/api/sources/${encodeURIComponent(id)}/test${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`,
        { vars },
      ),
    /** ลองยิง source ที่ยังไม่ได้บันทึก — คืน field ที่เจอพร้อมค่าที่พบจริง */
    probe: (source: SourceConfig, vars: Record<string, string>) =>
      post<ProbeResult>('/api/sources/probe', { source, vars }),
    create: (source: SourceConfig) => post<SourceConfig>('/api/sources', source),
    update: (id: string, source: SourceConfig) =>
      req<SourceConfig>(`/api/sources/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(source),
      }),
    remove: (id: string) =>
      req<{ ok: true }>(`/api/sources/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    /** ชื่อ secret ที่มีค่าอยู่แล้ว — ค่าจริงไม่เคยออกจาก server */
    secretRefs: () => req<string[]>('/api/sources/secrets'),
    saveSecret: (ref: string, value: string) =>
      req<{ ok: true }>('/api/sources/secrets', {
        method: 'PUT',
        body: JSON.stringify({ ref, value }),
      }),
  },

  sessions: {
    list: () => req<Session[]>('/api/sessions'),
    get: (id: string) => req<Session & { live: boolean }>(`/api/sessions/${id}`),
    create: (body: CreateSessionBody) => post<Session>('/api/sessions', body),
    previewPrompt: (workspaceId: string, defectIds: string[], feature?: FeatureSpec) =>
      post<TaskPromptPayload>('/api/sessions/preview-prompt', { workspaceId, defectIds, feature }),
    append: (id: string, defectIds: string[]) => post<Session>(`/api/sessions/${id}/append`, { defectIds }),
    diff: (id: string) => req<DiffStat>(`/api/sessions/${id}/diff`),
    rename: (id: string, name: string) => post<Session>(`/api/sessions/${id}/rename`, { name }),
    close: (id: string) => post<Session>(`/api/sessions/${id}/close`),
    discard: (id: string) => post<Session>(`/api/sessions/${id}/discard`),
    reopen: (id: string) => post<Session>(`/api/sessions/${id}/reopen`),
    openEditor: (id: string) => post<{ ok: true }>(`/api/sessions/${id}/open-editor`),
    qaPrompt: (id: string) => req<QaPromptPayload>(`/api/sessions/${id}/qa-prompt`),
    sendQa: (id: string, prompt: string) => post<Session>(`/api/sessions/${id}/qa`, { prompt }),
  },
}
