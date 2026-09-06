import { NodeRegistryService } from './node-registry.service';

describe('NodeRegistryService', () => {
  it('expune nodul pentru timpul curent al serverului', () => {
    const definition = new NodeRegistryService().get('datetime_now');

    expect(definition).toMatchObject({
      type: 'datetime_now',
      category: 'system',
      defaults: {},
      configFields: [],
      outputKind: 'value',
      outputFields: [
        {
          key: 'datetime',
          dataType: 'datetime',
          uiType: 'datetimepicker',
        },
      ],
    });
  });
});
