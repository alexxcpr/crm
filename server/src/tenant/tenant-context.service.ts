import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { Knex } from 'knex';

interface TenantStore {
  knex: Knex;
  slug: string;
  dbName: string;
}

@Injectable()
export class TenantContext {
  private als = new AsyncLocalStorage<TenantStore>();

  run<T>(store: TenantStore, callback: (...args: any[]) => T): T {
    return this.als.run(store, callback);
  }

  get knex(): Knex {
    const store = this.als.getStore();
    if (!store) throw new Error('Tenant context not initialized — request outside tenant scope');
    return store.knex;
  }

  get slug(): string {
    const store = this.als.getStore();
    if (!store) throw new Error('Tenant context not initialized');
    return store.slug;
  }

  get dbName(): string {
    const store = this.als.getStore();
    if (!store) throw new Error('Tenant context not initialized');
    return store.dbName;
  }

  get isAvailable(): boolean {
    return !!this.als.getStore();
  }
}
