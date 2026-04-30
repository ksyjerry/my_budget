// ── Wizard Types ──────────────────────────────────────────
// Extracted from page.tsx — do NOT add React-specific types here.

export interface ProjectInfo {
  project_code: string;
  project_name: string;
  department: string;
  el_empno: string;
  el_name: string;
  pm_empno: string;
  pm_name: string;
  qrp_empno: string;
  qrp_name: string;
  contract_hours: number;
  axdx_hours: number;
  qrp_hours: number;
  rm_hours: number;
  el_hours: number;
  pm_hours: number;
  ra_elpm_hours: number;
  et_controllable_budget: number;
  fulcrum_hours: number;
  ra_staff_hours: number;
  specialist_hours: number;
  travel_hours: number;
  total_budget_hours: number;
  template_status: string;
  service_type: string;
  fiscal_start?: string | null;
  fiscal_end?: string | null;
}

export interface ClientInfo {
  client_code: string;
  client_name: string;
  industry: string;
  asset_size: string;
  listing_status: string;
  business_report: string;
  gaap: string;
  consolidated: string;
  subsidiary_count: string;
  internal_control: string;
  initial_audit: string;
  needs_detail?: boolean;
}

export interface Member {
  id?: number;
  role: string;
  name: string;
  empno: string;
  grade: string;
  activity_mapping: string;
  sort_order: number;
}

export interface BudgetUnit {
  category: string;
  unit_name: string;
  sort_order: number;
}

export interface TemplateRow {
  budget_category: string;
  budget_unit: string;
  empno: string;
  emp_name: string;
  grade: string;
  months: Record<string, number>;
  enabled: boolean;
}
