export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface ProviderWeeklyTemplate {
  id: string;
  provider_id: string;
  day_of_week: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  slots: Array<{ start: string; end: string }>;
  created_at: string;
  updated_at: string;
}

export interface ProviderTimeOff {
  id: string;
  provider_id: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
