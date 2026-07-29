import { BadRequestException } from '@nestjs/common';
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */
import { RelatedDataService } from './related-data.service';

const actor = {
  id: 'user-1',
  profileId: 'profile-1',
} as any;

const parentEntity = {
  id_entity: 'parent-entity',
  slug: 'dosar',
  table_name: 'ent_dosar',
};

const childEntity = {
  id_entity: 'child-entity',
  slug: 'dosar_fisa',
  table_name: 'ent_dosar_fisa',
};

const collection = {
  id_related_collection: 'collection-1',
  collection_slug: 'fise',
  relation_kind: 'composition',
  relation_field_id: 'relation-field',
  relation_field_slug: 'dosar',
  relation_column_name: 'cf_dosar',
  parent_entity: parentEntity,
  child_entity: childEntity,
  allow_create: true,
  allow_update: true,
  allow_delete: true,
};

describe('RelatedDataService', () => {
  const data = {
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const recordAccess = {
    assertRecord: jest.fn(),
    capabilities: jest.fn(),
  };
  let service: RelatedDataService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RelatedDataService(
      { knex: jest.fn() } as any,
      data as any,
      recordAccess as any,
    );
    jest
      .spyOn(service as any, 'resolve')
      .mockResolvedValue(collection as any);
    recordAccess.assertRecord.mockResolvedValue({
      record: { id: 'parent-1' },
    });
  });

  it('injecteaza FK-ul parintelui la create', async () => {
    data.create.mockResolvedValue({
      data: { id: 'child-1' },
    });

    await service.create(
      'dosar',
      'parent-1',
      'fise',
      { titlu: 'Fisa A' },
      actor,
    );

    expect(data.create).toHaveBeenCalledWith(
      'dosar_fisa',
      {
        titlu: 'Fisa A',
        dosar: 'parent-1',
      },
      actor,
    );
  });

  it('respinge un parinte conflictual din payload', async () => {
    await expect(
      service.create(
        'dosar',
        'parent-1',
        'fise',
        { dosar: 'parent-2' },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(data.create).not.toHaveBeenCalled();
  });

  it('aplica FK fix, paginare si capabilities pe lista nested', async () => {
    data.findAll.mockResolvedValue({
      data: [],
      meta: {
        total: 0,
        page: 2,
        limit: 10,
        totalPages: 0,
      },
    });
    recordAccess.capabilities.mockResolvedValue({
      read: 'owner',
      create: 'owner',
      update: 'owner',
      delete: 'owner',
    });

    const result = await service.findAll(
      'dosar',
      'parent-1',
      'fise',
      { page: '2', limit: '10' },
      actor,
    );

    expect(data.findAll).toHaveBeenCalledWith(
      'dosar_fisa',
      { page: '2', limit: '10' },
      actor,
      {
        tableOnly: false,
        fixedWhere: {
          cf_dosar: 'parent-1',
        },
      },
    );
    expect(result.capabilities).toEqual({
      read: true,
      create: true,
      update: true,
      delete: true,
    });
  });

  it('elimina FK-ul parintelui din update dupa verificarea apartenentei', async () => {
    jest
      .spyOn(service as any, 'assertMembership')
      .mockResolvedValue(undefined);
    data.update.mockResolvedValue({
      data: { id: 'child-1' },
    });

    await service.update(
      'dosar',
      'parent-1',
      'fise',
      'child-1',
      {
        dosar: 'parent-1',
        cf_dosar: 'parent-1',
        titlu: 'Actualizat',
      },
      actor,
    );

    expect(data.update).toHaveBeenCalledWith(
      'dosar_fisa',
      'child-1',
      { titlu: 'Actualizat' },
      actor,
    );
  });
});
