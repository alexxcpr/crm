import { SetMetadata } from '@nestjs/common';
import type { GlobalCapability } from './access-control.types';

export const CAPABILITIES_KEY =
  'required-global-capabilities';

export const RequireCapability = (
  ...capabilities: GlobalCapability[]
) => SetMetadata(CAPABILITIES_KEY, capabilities);
