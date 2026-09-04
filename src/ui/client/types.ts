export interface ParsedScope {
  method: string;
  path: string;
  raw: string;
}

export interface AndCondition {
  id: number;
  conditionType: string;
  value: string;
  valueSubType: string;
  notInnerType: string | null;
  notInnerSubType: string | null;
  notInnerValue: string | null;
}

export interface FilterData {
  id: number;
  objectPath: string;
  filterType: string;
  values: string[];
  valueSubTypes: string[];
  notInnerType?: string;
  notInnerSubType?: string;
  notInnerValue?: string;
  andConditions?: AndCondition[];
}

// Une valeur de query est toujours une chaine sur le fil : pas de sous-type a saisir,
// a aucune profondeur d'imbrication (§19.3, §12.14).
export interface QueryAndCondition {
  id: number;
  conditionType: string;
  value: string;
  notInnerType: string | null;
  notInnerValue: string | null;
}

export interface QueryFilterData {
  id: number;
  param: string;
  required: boolean;
  filterType: string;
  values: string[];
  notInnerType?: string;
  notInnerValue?: string;
  andConditions?: QueryAndCondition[];
}

export interface SerializedFilterValue {
  type: string;
  value: unknown;
}

export interface SerializedFilter {
  objectPath: string;
  objectValue: SerializedFilterValue[];
}

// Les deux axes decrivent le meme ScopeEntry : ils voyagent ensemble partout ou une
// configuration de scope est lue ou serialisee.
export interface ScopeFiltersData {
  bodyFiltersData: Record<string, FilterData[]>;
  queryFiltersData: Record<string, QueryFilterData[]>;
}

export interface SerializedQueryFilter {
  param: string;
  values: SerializedFilterValue[];
  required?: boolean;
}

export interface ScopeWithFilters {
  methods: string[];
  pattern: string;
  bodyFilters?: SerializedFilter[];
  queryFilters?: SerializedQueryFilter[];
}

export type SerializedScope = string | ScopeWithFilters;

export interface SelectOption {
  value: string;
  label: string;
}

export interface AppPermissions {
  read: boolean;
  deploy: boolean;
  deployBranches: string;
  varsRead: boolean;
  varsWrite: boolean;
  scaleRestart: boolean;
}

export type AppsPermissionsState = Record<string, AppPermissions>;

export function defaultAppPermissions(): AppPermissions {
  return {
    read: false,
    deploy: false,
    deployBranches: "",
    varsRead: false,
    varsWrite: false,
    scaleRestart: false,
  };
}
