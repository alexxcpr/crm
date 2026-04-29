export interface User {
  id: string;
  date_created: Date;
  date_updated: Date;
  email: string;
  hash: string;
  first_name: string | null;
  last_name: string | null;
}

export interface UserWithRoles extends Omit<User, 'hash'> {
  roles: string[];
}

export interface Role {
  id_role: string;
  name: string;
  slug: string;
  description: string | null;
  is_system: boolean;
  date_created: Date;
  date_updated: Date;
}

export interface UserRole {
  id_user: string;
  id_role: string;
}

export interface RolePermission {
  id_permission: string;
  id_role: string;
  id_module: string | null;
  id_entity: string | null;
  action: string;
}

export interface Module {
  id_module: string;
  name: string;
  slug: string;
  icon: string | null;
  rank: number;
  is_active: boolean;
  date_created: Date;
  date_updated: Date;
}

export interface Entity {
  id_entity: string;
  id_module: string | null;
  name: string;
  slug: string;
  table_name: string;
  icon: string | null;
  is_system: boolean;
  label_singular: string | null;
  label_plural: string | null;
  rank: number;
  date_created: Date;
  date_updated: Date;
}

export interface Field {
  id_field: string;
  id_entity: string;
  name: string;
  slug: string;
  column_name: string;
  data_type: string;
  ui_type: string;
  default_value: string | null;
  placeholder: string | null;
  help_text: string | null;
  options: any;
  is_required: boolean;
  is_unique: boolean;
  is_filterable: boolean;
  is_sortable: boolean;
  visible_in_table: boolean;
  visible_in_form: boolean;
  is_system: boolean;
  validation_rules: any;
  id_relation_entity: string | null;
  relation_display_field: string | null;
  group_name: string;
  rank: number;
  grid_col: number;
  col_span: number;
  date_created: Date;
  date_updated: Date;
}

export interface FieldWithRelation extends Field {
  relation_entity: Entity | null;
}

export interface TenantInfo {
  dbName: string;
  plan: string;
  isActive: boolean;
  maxUsers: number;
}

export interface JwtPayload {
  sub: string;
  email: string;
  tenant: string;
  dbName: string;
}
