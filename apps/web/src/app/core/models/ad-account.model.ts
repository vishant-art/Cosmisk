export interface AdAccount {
  id: string;              // "act_921159353090591"
  account_id: string;      // "921159353090591"
  name: string;
  business_name: string;
  status: 'active' | 'inactive';
  currency: string;
  credential_group: 'system' | 'personal' | 'oauth';
}
