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
  ): Promise<any> {
    const url = `${this.baseUrl}/webhook/${path}`;
    this.logger.log(`Calling n8n webhook: ${url}`);

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
      throw new Error(`n8n webhook error: ${response.status} ${errorBody}`);
    }

    return response.json();
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
