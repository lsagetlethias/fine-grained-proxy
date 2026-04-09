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

export interface SerializedFilterValue {
  type: string;
  value: unknown;
}

export interface SerializedFilter {
  objectPath: string;
  objectValue: SerializedFilterValue[];
}

export interface ScopeWithFilters {
  methods: string[];
  pattern: string;
  bodyFilters: SerializedFilter[];
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
