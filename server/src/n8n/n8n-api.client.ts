import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface N8nWorkflowJson {
  name: string;
  nodes: any[];
  connections: Record<string, any>;
  settings?: Record<string, any>;
  tags?: Array<{ name: string }>;
}

export interface N8nExecution {
  id: string;
  finished: boolean;
  mode: string;
  startedAt: string;
  stoppedAt?: string;
  data?: any;
  status: string;
}

export interface N8nWorkflowResponse {
  id: string;
  name: string;
  active: boolean;
  nodes: any[];
  connections: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  tags?: Array<{ id: string; name: string }>;
}

@Injectable()
export class N8nApiClient implements OnModuleInit {
  private readonly logger = new Logger(N8nApiClient.name);
  private baseUrl: string;
  private apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get<string>('N8N_API_URL', 'http://localhost:5678');
    this.apiKey = config.get<string>('N8N_API_KEY', '');
  }

  async onModuleInit() {
    if (!this.apiKey) {
      this.logger.warn(
        'N8N_API_KEY not set — n8n integration will not work until configured',
      );
    }
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': this.apiKey,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;

    const options: RequestInit = {
      method,
      headers: this.headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `n8n API ${method} ${path} failed (${response.status}): ${errorBody}`,
      );
      throw new Error(
        `n8n API error: ${response.status} ${response.statusText}`,
      );
    }

    return response.json() as Promise<T>;
  }

  async createWorkflow(
    workflow: N8nWorkflowJson,
  ): Promise<N8nWorkflowResponse> {
    this.logger.log(`Creating n8n workflow: ${workflow.name}`);
    return this.request<N8nWorkflowResponse>('POST', '/workflows', workflow);
  }

  async updateWorkflow(
    id: string,
    workflow: Partial<N8nWorkflowJson>,
  ): Promise<N8nWorkflowResponse> {
    this.logger.log(`Updating n8n workflow: ${id}`);
    return this.request<N8nWorkflowResponse>('PUT', `/workflows/${id}`, workflow);
  }

  async activateWorkflow(id: string): Promise<N8nWorkflowResponse> {
    this.logger.log(`Activating n8n workflow: ${id}`);
    return this.request<N8nWorkflowResponse>('POST', `/workflows/${id}/activate`);
  }

  async deactivateWorkflow(id: string): Promise<N8nWorkflowResponse> {
    this.logger.log(`Deactivating n8n workflow: ${id}`);
    return this.request<N8nWorkflowResponse>('POST', `/workflows/${id}/deactivate`);
  }

  async deleteWorkflow(id: string): Promise<void> {
    this.logger.log(`Deleting n8n workflow: ${id}`);
    await this.request<any>('DELETE', `/workflows/${id}`);
  }

  async getWorkflow(id: string): Promise<N8nWorkflowResponse> {
    return this.request<N8nWorkflowResponse>('GET', `/workflows/${id}`);
  }

  async executeWebhook(
    path: string,
    data: Record<string, any>,
    n8nWorkflowId?: string,
  ): Promise<any> {
    const url = `${this.baseUrl}/webhook/${path}`;
    this.logger.log(`Calling n8n webhook: ${url}`);
    const startedAt = Date.now();

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `n8n webhook ${path} failed (${response.status}): ${errorBody}`,
      );

      // Try to extract a meaningful message — first from the response body,
      // then by querying n8n's execution history for the actual node error.
      let detail = errorBody;
      try {
        const parsed = JSON.parse(errorBody);
        if (parsed.data?.error?.message) {
          detail = parsed.data.error.message;
        } else if (parsed.data?.message) {
          detail = parsed.data.message;
        } else if (parsed.error?.message) {
          detail = parsed.error.message;
        } else if (parsed.message && parsed.message !== 'Error in workflow') {
          detail = parsed.message;
        }
      } catch {
        // not JSON, use raw text
      }

      // If the response was just the generic placeholder, try to get the
      // real error from n8n's execution history.
      if ((detail === errorBody || detail === 'Error in workflow') && n8nWorkflowId) {
        try {
          const execError = await this.fetchLastExecutionError(n8nWorkflowId);
          if (execError) {
            detail = execError;
          }
        } catch {
          // best-effort
        }
      }

      throw new Error(`n8n: ${detail}`);
    }

    const result = await response.json();

    // Some n8n webhook executions can return HTTP 200 even though a later node
    // failed internally. Check the execution log for an error created by this
    // call before reporting success to Moduvis.
    if (n8nWorkflowId) {
      const execError = await this.fetchRecentExecutionError(
        n8nWorkflowId,
        startedAt,
      );
      if (execError) {
        throw new Error(`n8n: ${execError}`);
      }
    }

    return result;
  }

  /**
   * Fetches the most recent failed execution for a workflow and extracts
   * the error from the failing node. Returns null if nothing useful is found.
   */
  private async fetchRecentExecutionError(
    n8nWorkflowId: string,
    startedAfterMs: number,
  ): Promise<string | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const error = await this.fetchLastExecutionError(
        n8nWorkflowId,
        startedAfterMs,
      );
      if (error) return error;
      await new Promise((r) => setTimeout(r, 300));
    }
    return null;
  }

  private async fetchLastExecutionError(
    n8nWorkflowId: string,
    startedAfterMs?: number,
  ): Promise<string | null> {
    // 1. List recent error executions
    const listResult = await this.request<any>(
      'GET',
      `/executions?workflowId=${n8nWorkflowId}&limit=3&status=error`,
    );

    const executions = listResult?.data ?? listResult ?? [];
    const list = Array.isArray(executions) ? executions : [];
    if (list.length === 0) {
      this.logger.warn(`fetchLastExecutionError: no error executions found for ${n8nWorkflowId}`);
      return null;
    }

    // 2. Fetch the full execution detail (list endpoint omits per-node runData).
    //    n8n may still be persisting the execution when the webhook returns,
    //    so retry once after a short delay if data is missing.
    const latest = list[0];
    const executionId = latest.id;
    if (!executionId) return null;

    if (startedAfterMs && latest.startedAt) {
      const executionStartedAt = new Date(latest.startedAt).getTime();
      if (
        Number.isFinite(executionStartedAt) &&
        executionStartedAt < startedAfterMs - 1000
      ) {
        return null;
      }
    }

    let fullExec = await this.request<any>(
      'GET',
      `/executions/${executionId}?includeData=true`,
    );

    if (!fullExec?.data?.resultData) {
      await new Promise((r) => setTimeout(r, 500));
      fullExec = await this.request<any>(
        'GET',
        `/executions/${executionId}?includeData=true`,
      );
    }

    // 3. Extract the real error. n8n nests the HTTP response body inside
    //    resultData.error.messages[] (plural, array of strings like
    //    "400 - {...}"). The singular .message is just n8n's generic wrapper.
    const resultData = fullExec?.data?.resultData;
    const extracted = this.extractN8nError(resultData);
    if (extracted) return extracted;

    return `Workflow execution failed (${executionId})`;
  }

  private extractN8nError(resultData: any): string | null {
    if (!resultData) return null;

    const error = resultData.error;
    if (!error) return null;

    // 1. Check messages[] array (plural) — these contain the raw HTTP responses
    if (Array.isArray(error.messages) && error.messages.length > 0) {
      for (const msg of error.messages) {
        const unwrapped = this.unwrapN8nError(String(msg));
        if (unwrapped) return unwrapped;
      }
    }

    // 2. Check description (sometimes contains useful info)
    if (error.description && error.description !== 'Bad Request') {
      return error.description;
    }

    // 3. Fallback to the generic n8n message
    if (error.message && error.message !== 'Bad request - please check your parameters') {
      return error.message;
    }

    // 4. Walk per-node runData to find the failing node's error output
    const runData = resultData.runData ?? {};
    for (const runs of Object.values(runData)) {
      if (!Array.isArray(runs)) continue;
      for (const run of runs) {
        if (run?.error?.message) {
          const uw = this.unwrapN8nError(run.error.message);
          if (uw && uw !== 'Bad request - please check your parameters') return uw;
        }
      }
    }

    return null;
  }

  /**
   * n8n wraps raw HTTP responses as: "400 - {\"success\":false,...}".
   * Extract the inner CRM message.
   */
  private unwrapN8nError(msg: string): string | null {
    // Try the "STATUS - BODY" pattern first
    const statusMatch = msg.match(/^\d+\s*-\s*(.+)$/s);
    const body = statusMatch ? statusMatch[1].trim() : msg;
    try {
      // n8n double-encodes: the body is a JSON string that itself contains JSON.
      // First parse → yields a string. Second parse → yields the object.
      let parsed: any = JSON.parse(body);
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }
      if (parsed?.message) {
        return typeof parsed.message === 'string' ? parsed.message : JSON.stringify(parsed.message);
      }
    } catch { /* not JSON */ }
    // No status-prefix pattern and not a generic placeholder — return the raw message
    if (!statusMatch && msg && msg !== 'Error in workflow' && msg !== 'Bad request - please check your parameters') {
      return msg;
    }
    return null;
  }

  async getExecution(id: string): Promise<N8nExecution> {
    return this.request<N8nExecution>('GET', `/executions/${id}`);
  }

  async isHealthy(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/healthz`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
