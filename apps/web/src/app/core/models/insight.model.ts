export type InsightPriority = 'alert' | 'positive' | 'pattern' | 'info';
export type InsightActionType = 'navigate' | 'scale' | 'pause' | 'reduce' | 'increase';

export interface AiInsight {
  id: string;
  priority: InsightPriority;
  title: string;
  description: string;
  actionLabel: string;
  actionRoute: string;
  actionType?: InsightActionType;
  actionPayload?: Record<string, any>;
  creativeId?: string;
  createdAt: string;
}
