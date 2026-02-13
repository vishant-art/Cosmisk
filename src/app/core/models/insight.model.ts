export type InsightPriority = 'alert' | 'positive' | 'pattern' | 'info';

export interface AiInsight {
  id: string;
  priority: InsightPriority;
  title: string;
  description: string;
  actionLabel: string;
  actionRoute: string;
  creativeId?: string;
  createdAt: string;
}
