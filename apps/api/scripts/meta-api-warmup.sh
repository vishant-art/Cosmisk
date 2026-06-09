#!/bin/bash
# Meta Ads API Warmup Script
# Runs daily Ads Management API calls to build activity for Standard Access approval.
# Schedule via launchd to run every 6 hours.

TOKEN="EAAJmHPb6PrIBQz9ZBoxabKs2DHAOBSGgSno1q8LPO9fFUNeMtz44lMZBOZCdNVyzgJqbisASGXfeJ5vWTSom7yjuLSIZBuaVufus27EjHmV0VlZAyHNGUUGtZBVmXwH2rFpNRbZCfwU85NftgaaRIMZAJ66WHOPYFAHZBfBzGuAWaRMBwo7DpEQJR9A5efDQ3"
BASE="https://graph.facebook.com/v22.0"
LOG="/Users/vishatjain/Cosmisk/server/scripts/warmup.log"

# 3 ad accounts to cycle through
ACCOUNTS=("act_115495618939167" "act_1207555757835371" "act_866091634263757")

echo "===== $(date) — Meta API Warmup =====" >> "$LOG"

call_api() {
  local endpoint="$1"
  local label="$2"
  local response
  response=$(curl -s -o /dev/null -w "%{http_code}" "$endpoint")
  echo "  [$response] $label" >> "$LOG"
  sleep 2  # gentle spacing between calls
}

# 1. List ad accounts (Ads Management call)
call_api "$BASE/me/adaccounts?fields=name,account_id,account_status,currency&limit=50&access_token=$TOKEN" \
  "GET /me/adaccounts"

# 2. For each account: campaigns, insights, ads, adsets
for ACCT in "${ACCOUNTS[@]}"; do
  echo "  --- $ACCT ---" >> "$LOG"

  # Campaigns list
  call_api "$BASE/$ACCT/campaigns?fields=name,status,objective,daily_budget,lifetime_budget&limit=25&access_token=$TOKEN" \
    "GET /$ACCT/campaigns"

  # Account-level insights (last 7 days)
  call_api "$BASE/$ACCT/insights?fields=spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas&date_preset=last_7d&level=account&access_token=$TOKEN" \
    "GET /$ACCT/insights (account, 7d)"

  # Campaign-level insights
  call_api "$BASE/$ACCT/insights?fields=campaign_name,spend,impressions,clicks,ctr,actions,purchase_roas&level=campaign&date_preset=last_7d&limit=50&access_token=$TOKEN" \
    "GET /$ACCT/insights (campaign, 7d)"

  # Ad sets
  call_api "$BASE/$ACCT/adsets?fields=name,status,daily_budget,targeting,optimization_goal&limit=25&access_token=$TOKEN" \
    "GET /$ACCT/adsets"

  # Ads
  call_api "$BASE/$ACCT/ads?fields=name,status,creative{thumbnail_url}&limit=25&access_token=$TOKEN" \
    "GET /$ACCT/ads"

  # Daily insights breakdown
  call_api "$BASE/$ACCT/insights?fields=spend,impressions,clicks,actions&date_preset=last_14d&time_increment=1&level=account&access_token=$TOKEN" \
    "GET /$ACCT/insights (daily, 14d)"
done

TOTAL=$((1 + ${#ACCOUNTS[@]} * 6))
echo "  DONE: $TOTAL API calls completed" >> "$LOG"
echo "" >> "$LOG"
