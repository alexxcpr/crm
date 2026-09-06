import type {
  AccessLevel,
  GlobalCapability,
} from './access-control.types';
import type { IntegrationScope } from 'src/auth/integration-token.types';

export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'manage' | 'change_ownership';
export type PermissionScope = 'all' | 'owner';

export interface RequestProfile {
  id_profile: string;
  id_user: string;
  username: string;
  email: string;
  display_name: string | null;
  access_level: AccessLevel;
  is_default: boolean;
  is_active: boolean;
  is_system?: boolean;
  date_created?: Date;
  date_updated?: Date;
}

export interface AuthenticatedUser {
  id: string;
  login_username: string;
  must_change_password: boolean;
  is_active: boolean;
  is_system?: boolean;
  date_created?: Date;
  date_updated?: Date;
  sessionExp?: number;
  profile: RequestProfile;
  profileId: string;
  roles: string[];
  accessLevel: AccessLevel;
  globalCapabilities: GlobalCapability[];
  tenant: string;
  dbName: string;
  authType?: 'jwt' | 'integration_token';
  integrationTokenId?: string;
  integrationScopes?: IntegrationScope[];
}
