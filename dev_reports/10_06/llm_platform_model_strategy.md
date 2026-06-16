# LLM Platform & Model Strategy (2026-06-10)

> Decision analysis: which provider platform (OpenRouter / AWS Bedrock / Google direct / other) and which models to use across Cosmisk's lanes — chat, competitor search, watchdog reasoning, comment-mining, and Creative Studio. Grounded in the existing `llm-gateway.ts` abstraction + RH-1 consolidation spec. Prices are mid-2026, verified against official pages (sources at bottom); they change — re-check before committing budget.

---

## Bottom line

**Go hybrid, not single-platform — your own constraints force it:**

- **Creative Studio (Gemini-locked, needs Veo video) → Google direct** (AI Studio paid tier now, Vertex AI later). This is *forced*: **AWS Bedrock hosts no Gemini model**, and **OpenRouter carries Gemini text + Nano Banana images but NOT Veo video.** Neither aggregator can serve Creative Studio. Only Google can.
- **Everything text (chat, competitor search, watchdog reasoning, comment-mining) → OpenRouter**, plugged in behind the existing `llm-gateway` as one more transport. This is the experimentation phase: one key, swap model by string, compare Haiku vs Flash-Lite vs GPT-mini vs DeepSeek/Qwen with automatic fallback.
- **Skip AWS Bedrock for now.** It can't host Gemini (central to two lanes), and its per-region model enablement + provisioned-throughput + IAM overhead is the wrong weight for a 2-engineer experimentation phase. Revisit only if Cosmisk goes AWS-native and needs VPC-private Claude/DeepSeek at scale with enterprise compliance.

The repo already has the right seam: `llm-gateway.ts` (`createMessage`) abstracts the provider per call and writes a per-provider cost ledger + daily caps. OpenRouter slots in as the text-lane transport **without losing caps/ledger**, and unifies billing visibility. Once a winning 1–2 text models emerge, collapse the hot path to the direct provider API to shave the fee/latency.

---

## Platform comparison (provider pros/cons)

| Platform | Best for | Pros | Cons |
|---|---|---|---|
| **OpenRouter** | The experimentation lane (text) | One API/key for 300+ models incl. Gemini text, Nano Banana, Claude, GPT, DeepSeek/Qwen/Kimi; swap by string; auto fallback/load-balance; **no markup on token price** (pass-through); unified billing + per-model analytics; BYOK free <1M req/mo; fastest time-to-first-token in one benchmark | **No Veo video** (can't serve Creative Studio); **5.5% fee on credit top-ups** (+$0.80 min) / 5% BYOK above 1M req/mo; **+50–70ms** latency; **no SLA**, 3 outages in 8 mo (35–50 min each); adds a 3rd party to the data path — for client ad data set *no-log + training-toggle-off* |
| **Google direct** (AI Studio / Vertex AI) | Creative Studio + Gemini chat default | **Only way to get Veo + full Nano Banana + native Gemini at source price** (no markup, cheapest Gemini); unified Gen AI SDK (easy AI Studio→Vertex migration); Vertex adds SLA, IAM, EU data residency, no-train guarantee, BigQuery/GCS | AI Studio **free tier has no SLA + may train on your data + rate limits change without notice** → use the **paid tier** or Vertex for prod; Vertex setup heavier (GCP project, service accounts, IAM); Gemini-only |
| **AWS Bedrock** | Enterprise AWS-native scale (later, not now) | IAM/VPC/PrivateLink/KMS/CloudTrail, real SLA; broad catalog (Claude, DeepSeek, Qwen, Nova, Llama, Mistral, Stability) + 100+ marketplace; provisioned throughput; data stays in-region, no training; consolidated AWS bill | **No Gemini at all** → can't do the Gemini chat default *or* Creative Studio; per-region model enablement friction; some models need provisioned-throughput commitments; steeper setup; another stack for 2 people |
| **Direct** (Anthropic/OpenAI/DeepSeek) | Collapsing winning models post-experiment | Lowest cost (no router fee); best per-provider features (prompt caching, batch −50%); first to new models | N integrations, N keys, N invoices, N rate-limit systems; no cross-provider fallback |
| **Groq / Cerebras** | If raw latency becomes the bottleneck | **500–3,000 tok/s** (Groq fastest TTFT for chat, Cerebras highest throughput); $0.05/M cheapest tier; generous free tier | Open-weight models only (Llama/Qwen/DeepSeek-distill), no Gemini/Claude/GPT |

---

## Model recommendations per use case (cost + pros/cons)

Prices USD per 1M tokens (input / output), mid-2026. Batch API = −50%; prompt caching = −90% on cached input.

### Chat — "good, fast, cheap, low cognition" (default lane)
| Model | Cost (in/out) | Pros | Cons |
|---|---|---|---|
| **Gemini 2.5 Flash-Lite** ⭐cheapest | **$0.10 / $0.40** | Cheapest viable chat model; 1M-token context; fast; already on Gemini | Weakest reasoning of the set; older generation |
| **Gemini 3.1 Flash-Lite** ⭐your pick | **$0.25 / $1.50** | Gen-3 quality at a low price; good default chat | 3.75× the output cost of 2.5 Flash-Lite |
| **GPT-5 nano** | **$0.05 / $0.40** | Cheapest input *anywhere*; great for routing/classification | Smallest cognition; OpenAI lane |
| **Claude Haiku 4.5** | **$1.00 / $5.00** | Best instruction-following + tool use of the "mini" tier; 200K ctx | Priciest mini by far; overkill for pure chat |
| **DeepSeek V3.2** | **$0.14–0.28 / $0.28–0.42** | Strong quality per dollar; 90% cache discount | Chinese-hosted (route via OpenRouter/Bedrock for data-path control) |

**Pick:** Gemini 2.5 Flash-Lite as the floor; A/B against Gemini 3.1 Flash-Lite when quality complaints surface.

### Competitor search / competitor-creative-intel (relevance filter + creative analysis)
- **Relevance/classification step:** Gemini 3.1 Flash-Lite ($0.25/$1.50) or GPT-5 nano ($0.05/$0.40) — cheap, high-volume.
- **Analysis step (some reasoning):** Gemini 3 Flash ($0.50 / $3.00) or Claude Haiku 4.5 ($1/$5).
- **Vision on ad creatives:** Gemini Flash family (native multimodal, cheap) — keep what you have.

### Watchdog / strategic synthesis ("THE ONE THING") — the one place to NOT cheap out
The "not much cognition" rule holds for routine watchdog decisions (Flash-Lite/Haiku is fine), but the **worldview-synthesis / THE ONE THING step (Phase A)** is exactly where a weak model produces the generic output the `ANTI_PATTERNS`/quality-gate rejects. Reserve a stronger model *only* there:
- **Claude Sonnet 4.6** (already in use) or **Gemini 3 Flash / 3.5 Flash** ($0.50/$3 or $1.50/$9).

### Comment-mining (classification + concept extraction, very high volume)
- **Gemini 2.5 Flash-Lite ($0.10/$0.40)**, **GPT-5 nano ($0.05/$0.40)**, or **DeepSeek V3.2**. Classification is the canonical Flash-Lite/nano job.

### Creative Studio — LOCKED to Gemini, Google-direct (image + video + scoring)
| Asset | Model | Cost |
|---|---|---|
| Image (fast/standard) | **Nano Banana 2** = `gemini-3.1-flash-image` *(already referenced in code)* | $0.045 (0.5K) / $0.067 (1K) / $0.101 (2K) / $0.151 (4K) per image |
| Image (premium) | **Nano Banana Pro** = `gemini-3-pro-image` | $0.134 (1K/2K) / $0.24 (4K) per image |
| Image (legacy) | **Nano Banana** = `gemini-2.5-flash-image` *(in code)* | ~$0.039/image |
| Video | **Veo 3.1** | Standard $0.40/sec (720p/1080p), $0.60/sec (4K); **Fast $0.10–0.30/sec** |
| Video (cheap) | **Veo 3.1 Lite** | ~$0.03–0.05/sec |
| Creative scoring | **Gemini 3 Flash / Flash-Lite** | as above |

**Tip:** the **Batch API halves all image prices** (24h turnaround) — use it for non-interactive creative generation.

---

## Concrete wiring for the repo

1. **Text lane → add a single OpenRouter transport** inside `llm-gateway.ts` alongside `createMessage` (Anthropic) and the planned `createGeminiMessage`. RH-1's "consolidate ONE client/transport" goal becomes "OpenRouter is that transport for text." Keep `cost_ledger` per-provider rows + daily caps — populate `api_provider` from OpenRouter's per-response model/usage. This kills most of RH-1 Part 1+2 in one move (no more `new Anthropic` / `new GoogleGenerativeAI` singletons).
2. **Creative + multimodal lane → Google direct.** Veo + Nano Banana + `visual-analyzer`'s file-upload multimodal calls go to AI Studio (paid) / Vertex — matches RH-1's recommendation to keep image-gen out of the text gateway and instrument cost via `recordCost`.
3. **Set OpenRouter privacy:** no-log default + training-toggle OFF (routing client ad-spend data).
4. **System/no-user caps (RH-1 Part 3):** reserve a `'system'` userId for cron-context calls so router spend stays bounded.

**Privacy note:** for the most sensitive client data, prefer Google direct/Vertex (and direct Anthropic) over the router; OpenRouter adds a third party to the data path even with no-log on.

---

## Sources
- [OpenRouter pricing](https://openrouter.ai/pricing) · [OpenRouter FAQ](https://openrouter.ai/docs/faq) · [Is OpenRouter Reliable? (2026)](https://ofox.ai/blog/is-openrouter-reliable-honest-review-2026/) · [OpenRouter Feb 2026 outages](https://openrouter.ai/announcements/openrouter-outages-on-february-17-and-19-2026) · [OpenRouter image models](https://openrouter.ai/collections/image-models)
- [Amazon Bedrock supported models](https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html) · [Bedrock model choice](https://aws.amazon.com/bedrock/model-choice/) · [AWS↔Gemini integration note](https://www.workato.com/integrations/aws-bedrock~google-gemini)
- [Google Gemini API pricing (official)](https://ai.google.dev/gemini-api/docs/pricing) · [AI Studio vs Vertex AI](https://hoerrsolutions.com/google-ai-studio-gemini-vertex-ai-comparison/) · [Vertex data residency](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency)
- [Gemini 3.1 Flash-Lite pricing](https://devtk.ai/en/models/gemini-3-1-flash-lite/) · [Gemini 2.5 Flash-Lite vs 3 Flash](https://llm-stats.com/models/compare/gemini-3-flash-preview-vs-gemini-2.5-flash-lite) · [Nano Banana Pro pricing](https://pricepertoken.com/pricing-page/model/google-gemini-3-pro-image-preview) · [Veo 3.1 pricing](https://www.aifreeapi.com/en/posts/veo-3-1-pricing)
- [Claude Haiku 4.5 pricing](https://platform.claude.com/docs/en/about-claude/pricing) · [GPT-5 mini/nano pricing](https://pricepertoken.com/pricing-page/model/openai-gpt-5-mini) · [DeepSeek V3.2 pricing](https://api-docs.deepseek.com/quick_start/pricing) · [Kimi/Qwen/GLM pricing](https://costgoat.com/compare/llm-api) · [Groq vs Cerebras](https://www.gmicloud.ai/en/blog/fastest-llm-platform-compare)
