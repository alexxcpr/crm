export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'manage' | 'change_ownership';
export type PermissionScope = 'all' | 'owner';

export interface RequestProfile {
  id_profile: string;
  id_user: string;
  username: string;
  email: string;
  display_name: string | null;
  is_default: boolean;
  is_active: boolean;
}

export interface AuthenticatedUser {
  id: string;
  login_username: string;
  must_change_password: boolean;
  is_active: boolean;
  profile: RequestProfile;
  profileId: string;
  roles: string[];
  tenant: string;
  dbName: string;
}
