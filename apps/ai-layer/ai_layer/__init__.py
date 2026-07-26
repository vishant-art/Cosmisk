"""cosmisk ai-layer -- Meta Ads analytics/AI package (Phase 1 packaging of rnd/).

Public surface:
  meta_transform : L1 transform + typed contract (CampaignDayFact, Dataset)
  meta_live      : live Meta ingestion (fetch_dataset/fetch_envelope, list_accounts)
  brain          : deterministic NL statements + EDA charts (no LLM)
  chat           : context-injection RAG chatbot (LLM)
  cost_ledger    : Python-side LLM cost tracking
  config         : env + paths
"""
__version__ = "0.1.0"
