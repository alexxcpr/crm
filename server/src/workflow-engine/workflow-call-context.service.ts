import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

interface WorkflowCallStore {
  executionId: string;
  depth: number;
}

@Injectable()
export class WorkflowCallContextService {
  private readonly storage =
    new AsyncLocalStorage<WorkflowCallStore>();

  get current(): WorkflowCallStore | undefined {
    return this.storage.getStore();
  }

  run<T>(
    store: WorkflowCallStore,
    callback: () => Promise<T>,
  ): Promise<T> {
    return this.storage.run(store, callback);
  }
}
