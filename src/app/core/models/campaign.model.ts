export interface Campaign {
  id: string;
  name: string;
  brandId: string;
  objective: 'conversions' | 'traffic' | 'awareness' | 'engagement';
  status: 'active' | 'paused' | 'ended' | 'draft';
  budget: number;
  budgetType: 'daily' | 'lifetime';
  spend: number;
  roas: number;
  startDate: string;
  endDate?: string;
  adSetsCount: number;
  creativesCount: number;
}
