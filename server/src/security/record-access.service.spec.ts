/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import type { Entity } from 'src/types/entities';
import { RecordAccessService } from './record-access.service';

const root = entity('root', 'ent_root');
const middle = entity('middle', 'ent_middle');
const child = entity('child', 'ent_child');

function entity(
  slug: string,
  tableName: string,
): Entity {
  return {
    id_entity: `${slug}-id`,
    id_module: null,
    name: slug,
    slug,
    table_name: tableName,
    icon: null,
    is_system: false,
    label_singular: slug,
    label_plural: slug,
    rank: 1,
    date_created: new Date(),
    date_updated: new Date(),
  };
}

function actor() {
  return {
    profileId: 'profile-1',
  } as any;
}

function service(
  scope: 'all' | 'owner' | null = 'owner',
) {
  const authorization = {
    getScope: jest.fn().mockResolvedValue(scope),
  };
  const instance = new RecordAccessService(
    { knex: jest.fn() } as any,
    authorization as any,
  );
  jest
    .spyOn(instance, 'compositionChain')
    .mockResolvedValue({
      rootEntity: root,
      steps: [
        {
          childEntity: child,
          relationField: {
            column_name: 'cf_middle_id',
          },
          parentEntity: middle,
        },
        {
          childEntity: middle,
          relationField: {
            column_name: 'cf_root_id',
          },
          parentEntity: root,
        },
      ],
    });
  return { instance, authorization };
}

describe('RecordAccessService', () => {
  it('mapeaza read-ul copilului pe read-ul radacinii', async () => {
    const { instance, authorization } = service();
    const policy = await instance.getPolicy(
      actor(),
      child,
      'read',
    );

    expect(policy?.effectiveAction).toBe('read');
    expect(
      authorization.getScope,
    ).toHaveBeenCalledWith(
      expect.anything(),
      root.id_entity,
      'read',
    );
  });

  it.each([
    'create',
    'update',
    'delete',
  ] as const)(
    'mapeaza %s copil pe update la radacina',
    async (action) => {
      const { instance, authorization } =
        service();
      const policy = await instance.getPolicy(
        actor(),
        child,
        action,
      );

      expect(policy?.effectiveAction).toBe(
        'update',
      );
      expect(
        authorization.getScope,
      ).toHaveBeenCalledWith(
        expect.anything(),
        root.id_entity,
        'update',
      );
    },
  );

  it('foloseste root.delete pentru stergerea agregatului', async () => {
    const { instance } = service('all');
    const policy = await instance.getPolicy(
      actor(),
      child,
      'delete',
      true,
    );

    expect(policy?.effectiveAction).toBe(
      'delete',
    );
  });

  it('dezactiveaza schimbarea ownerului pe composition', async () => {
    const { instance, authorization } = service();

    expect(
      await instance.getPolicy(
        actor(),
        child,
        'change_ownership',
      ),
    ).toBeNull();
    expect(
      authorization.getScope,
    ).not.toHaveBeenCalled();
  });

  it('aplica join-urile pana la radacina si scope-ul owner acolo', async () => {
    const { instance } = service('owner');
    const policy = await instance.getPolicy(
      actor(),
      child,
      'read',
    );
    const query = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
    } as any;

    instance.applyScope(
      query,
      'source',
      policy!,
      'profile-1',
    );

    expect(
      query.leftJoin,
    ).toHaveBeenNthCalledWith(
      1,
      'ent_middle as access_parent_0',
      'source.cf_middle_id',
      'access_parent_0.id',
    );
    expect(
      query.leftJoin,
    ).toHaveBeenNthCalledWith(
      2,
      'ent_root as access_parent_1',
      'access_parent_0.cf_root_id',
      'access_parent_1.id',
    );
    expect(query.where).toHaveBeenCalledWith(
      'access_parent_1.id_profile',
      'profile-1',
    );
  });
});
