# **Cosmisk Creative Studio Architecture v2**

**Version:** 2.0  
**Status:** Draft  
**Last Updated:** July 2026

---

# **1\. Context**

Recent advances in multimodal generative artificial intelligence have significantly lowered the barrier to producing high-quality marketing content. State-of-the-art image, video, speech, and language models are now capable of generating visually compelling advertisements that rival traditionally produced creative assets. Despite these advancements, most existing AI creative platforms continue to operate as monolithic prompt-to-output systems, relying heavily on prompt engineering while offering limited control over consistency, product fidelity, regeneration, or long-term maintainability.

Commercial creative generation, however, extends far beyond media synthesis. Producing effective advertisements requires understanding a brand's identity, historical campaign performance, target audience, product catalogue, visual style, messaging strategy, and marketing objectives. These inputs originate from multiple external systems—including Shopify, Meta Ads, and Google Ads—and must be synthesized into a unified understanding before any creative assets are generated. Treating these systems merely as prompt context limits scalability and makes the generation process opaque and difficult to debug.

Cosmisk Creative Studio addresses this challenge by treating creative generation as a structured orchestration problem rather than a single inference problem. Instead of directly prompting generation models, the platform progressively transforms structured marketing knowledge into a series of deterministic intermediate representations. These representations capture business context, creative intent, visual identity, shot planning, and execution requirements before delegating specialized tasks to image, video, speech, and computer vision models.

This architectural approach separates decision-making from media generation. Large language models are responsible for planning and reasoning, while specialized multimodal models focus exclusively on producing visual or auditory assets. Computer vision pipelines ensure product fidelity, workflow orchestration coordinates distributed execution, and quality assurance validates every generated artifact before export. By introducing explicit intermediate contracts between each stage, the platform becomes modular, inspectable, reproducible, and resilient to changes in underlying AI providers.

---

# **2\. Introduction**

Cosmisk Creative Studio is an AI-native creative generation platform designed to automatically produce production-ready static advertisements and short-form UGC (User Generated Content) video advertisements for e-commerce brands. The system integrates with existing commerce and advertising platforms—including Shopify, Meta Ads, and Google Ads—to build a structured understanding of a brand, its products, historical campaign performance, and creative direction. This knowledge is subsequently transformed into complete advertising assets suitable for deployment across social media and digital advertising channels.

Unlike conventional AI creative tools, Creative Studio does not rely on direct prompt engineering as its primary abstraction. Instead, the platform is built around structured intermediate artifacts that progressively describe the creative process at increasing levels of specificity. High-level business objectives are transformed into creative specifications, creative specifications become character definitions and shot plans, shot plans become executable generation tasks, and generation tasks ultimately produce validated advertising assets. Every stage communicates exclusively through standardized JSON contracts, enabling deterministic orchestration, transparent debugging, reproducibility, and independent component evolution.

The architecture intentionally decouples creative reasoning from media synthesis. Large language models perform planning, interpretation, and creative decision-making, while image, video, voice, and computer vision models execute specialized tasks within well-defined boundaries. This separation allows individual providers or models to be replaced without requiring architectural changes elsewhere in the system.

Version 2 of the architecture formalizes several foundational design decisions adopted throughout the platform. These include a hybrid repository model based on PostgreSQL JSONB documents, Cloudflare R2 for asset storage, GPT-5.4 mini (via OpenRouter) for creative planning, Temporal for workflow orchestration, exactly three-shot video generation, reusable character conditioning across image and video generation, deterministic product replacement using computer vision, and structured JSON contracts governing communication between every service.

---

# **3\. Related Documents**

This document defines the overall architecture, responsibilities, design rationale, and interactions between the major components of Cosmisk Creative Studio.

Implementation details—including canonical JSON schemas, field definitions, validation rules, API mappings, and inter-service contracts—are intentionally omitted from this document and are specified separately.

| Document | Purpose |
| ----- | ----- |
| **Cosmisk Creative Studio Schema Specification v2** | Defines every JSON contract used throughout the platform, including object models, validation rules, producer/consumer relationships, provider normalization, and schema versioning. |
| *(Future)* **Architecture Decision Records (ADR)** | Documents the rationale behind major architectural decisions, including repository design, workflow orchestration, product replacement strategy, and storage architecture. |

The Architecture and Schema Specification documents should be treated as companion documents. Architectural modules described within this document communicate exclusively through the canonical JSON schemas defined in the Schema Specification.

---

# **4\. Goals**

The primary objective of Cosmisk Creative Studio is to automate the production of high-quality advertising creatives while preserving the level of control, consistency, and reliability expected from professional creative workflows. Rather than optimizing for maximum automation alone, the architecture prioritizes deterministic execution, modularity, and long-term maintainability.

The system is designed to satisfy the following goals.

---

## **4.1 Structured Creative Planning**

Creative generation should begin with structured business understanding rather than direct prompt engineering. External marketing data, product information, campaign history, and user-provided creative preferences should be transformed into explicit planning artifacts before any media generation occurs.

---

## **4.2 Provider Independence**

The architecture should remain largely independent of individual AI providers.

Image generation, video generation, voice synthesis, and language reasoning should communicate through standardized contracts rather than provider-specific prompts or APIs. Replacing one model with another should require minimal changes outside the corresponding provider adapter.

---

## **4.3 Product Fidelity**

Generated advertisements must accurately represent real products available within the merchant's Shopify catalogue.

The architecture intentionally separates visual composition from product representation by generating approximate compositions first and replacing placeholder products with extracted Shopify assets using computer vision techniques.

---

## **4.4 Deterministic Execution**

Every stage of the pipeline should produce deterministic intermediate artifacts that can be inspected, cached, regenerated, or replayed independently.

Failures within downstream services should not require complete pipeline regeneration.

---

## **4.5 Creative Consistency**

Characters, visual style, camera language, and creative direction should remain consistent across all generated assets belonging to the same advertisement.

The architecture therefore introduces reusable Character Sheets and standardized Shot Specifications as persistent planning artifacts shared across image and video generation.

---

## **4.6 Scalability**

The platform should support concurrent creative generation across multiple brands, campaigns, and products without requiring architectural modifications.

All generation services are designed as stateless workers coordinated through Temporal workflows.

---

## **4.7 Extensibility**

Future capabilities—including multilingual generation, additional advertising platforms, alternative image providers, or new media formats—should integrate without requiring redesign of the core architecture.

Structured intermediate representations serve as stable contracts between evolving system components.

---

# **5\. Design Principles**

The architecture is governed by the following principles.

---

## **Principle 1 — Structured Artifacts over Prompt Chaining**

Prompt chains are difficult to inspect, debug, cache, and version.

Instead of passing prompts directly between models, every stage communicates through structured JSON artifacts.

This transforms the pipeline into a deterministic workflow rather than a sequence of opaque inference calls.

---

## **Principle 2 — Planning before Generation**

Reasoning should occur before generation.

The system first determines *what* should be created, *why* it should be created, and *how* it should be presented before any image or video models are invoked.

Generation models therefore receive explicit execution instructions rather than broad creative requests.

---

## **Principle 3 — Separation of Responsibilities**

Each service should perform exactly one responsibility.

For example:

* Context ingestion collects marketing data.  
* The planning engine performs creative reasoning.  
* Character generation defines visual identity.  
* Story planning defines scene composition.  
* Image and video services synthesize media.  
* Computer vision preserves product fidelity.  
* Quality assurance validates outputs.

No service should assume responsibilities belonging to another.

---

## **Principle 4 — Product Truth over Generated Approximation**

Generative models excel at composition but remain unreliable at reproducing commercial products with pixel-level accuracy.

Accordingly, Creative Studio treats Shopify assets as the authoritative representation of every product. Generated placeholders are subsequently replaced using segmentation and product placement pipelines to ensure accurate colours, branding, logos, textures, and silhouettes.

---

## **Principle 5 — Reproducibility**

Every intermediate artifact should be sufficient to reproduce downstream outputs.

A completed Creative Specification, Character Sheet, and Shot Specification should allow advertisements to be regenerated without repeating upstream planning.

---

## **Principle 6 — Workflow Resilience**

Long-running generation workflows inevitably encounter failures.

Workflow orchestration should therefore support retries, checkpointing, resumability, and parallel execution without restarting successful stages.

Temporal is adopted specifically to provide these guarantees.

---

## **Principle 7 — Human Guidance, AI Execution**

The platform remains user-guided rather than fully autonomous.

A user-provided **Creative Preference** acts as a first-class planning input and influences every subsequent planning and generation stage. This allows users to steer the overall aesthetic, tone, pacing, and visual language without manually specifying low-level prompts.

---

# **6\. High-Level Architecture**

At a high level, Creative Studio transforms external business knowledge into production-ready advertising assets through a sequence of structured planning and execution stages.

                                    User  
                                       │  
                                       │  
                         Creative Preference  
                                       │  
                                       ▼  
                    ┌───────────────────────────────────┐  
                    │        Context Ingestion          │  
                    │ Shopify • Meta Ads • Google Ads  │  
                    └─────────────────┬─────────────────┘  
                                      │  
                                      ▼  
                    ┌───────────────────────────────────┐  
                    │     Brand Context Repository      │  
                    │ PostgreSQL (JSONB \+ pgvector)     │  
                    │ Assets stored in Cloudflare R2    │  
                    └─────────────────┬─────────────────┘  
                                      │  
                                      ▼  
                    ┌───────────────────────────────────┐  
                    │ Creative Intelligence Engine      │  
                    │ GPT-5.4 mini via OpenRouter       │  
                    └─────────────────┬─────────────────┘  
                                      │  
                                      ▼  
                           CreativeSpec.json  
                                      │  
                 ┌────────────────────┴────────────────────┐  
                 ▼                                         ▼  
          Character Generator                     Story Planner  
                 │                                         │  
                 ▼                                         ▼  
      CharacterSheet.json                        ShotSpec.json  
                 └────────────────────┬─────────────────────┘  
                                      ▼  
                           Generation Orchestrator  
                                 (Temporal)  
                                      │  
                ┌─────────────────────┼──────────────────────┐  
                ▼                     ▼                      ▼  
        Image Generation       Video Generation      Voice Generation  
         (FLUX 2 via Fal)    (Seedance via Fal)      (Fal AI TTS)  
                │                     │                      │  
                └─────────────────────┴──────────────────────┘  
                                      ▼  
                      Product Replacement & QA Layer  
                     (BiRefNet \+ BRIA Product Shot)  
                                      ▼  
                            FFmpeg Composition  
                                      ▼  
                              Exported Creatives

The architecture is intentionally layered.

Each layer consumes well-defined structured artifacts, performs a narrowly scoped responsibility, and produces new artifacts for downstream services. No component communicates directly with another through prompts, implicit assumptions, or provider-specific representations. Instead, every interaction is governed by standardized JSON contracts defined within the companion **Cosmisk Creative Studio Schema Specification v2**.

This layered approach enables independent development, simplified debugging, deterministic regeneration, provider portability, and long-term architectural evolution without introducing tight coupling between system components.

# **7\. System Components**

This chapter describes the responsibilities, boundaries, and interactions of every major component within the Creative Studio architecture. Each module performs a narrowly scoped responsibility and communicates exclusively through structured JSON contracts defined in the companion **Cosmisk Creative Studio Schema Specification v2**.

No module communicates directly with another using prompts, provider-specific APIs, or implicit assumptions. Instead, each module consumes one or more canonical objects, performs deterministic processing, and produces one or more downstream objects.

This separation enables modular development, reproducible execution, independent testing, and future replacement of individual providers without affecting the remainder of the system.

---

# **7.1 Context Ingestion Layer**

## **Overview**

The Context Ingestion Layer serves as the entry point into the Creative Studio pipeline. Its responsibility is to collect business and marketing information from external platforms and transform heterogeneous provider-specific APIs into a normalized internal representation.

The purpose of this layer is **not** to generate creative insights or perform reasoning. Instead, it establishes a consistent and structured foundation upon which downstream planning modules operate.

---

## **Inputs**

The Context Ingestion Layer currently integrates with four primary inputs:

| Source | Purpose |
| ----- | ----- |
| Shopify | Product catalogue, variants, media, pricing, collections and merchant metadata |
| Meta Ads | Historical campaign data, creatives, objectives and performance metrics |
| Google Ads | Campaign structure, advertisements, assets and historical performance |
| Creative Preference | User-provided design/style guidance for the current generation session |

Unlike earlier versions of the architecture, website ingestion is intentionally excluded. Website content often introduces noisy, inconsistent, or redundant information that is already represented through structured commerce and advertising platforms.

---

## **Responsibilities**

The Context Ingestion Layer is responsible for:

* Authenticating against external providers.  
* Fetching provider-specific resources.  
* Detecting updates since the previous synchronization.  
* Downloading product media.  
* Extracting campaign metadata.  
* Collecting historical performance metrics.  
* Recording user creative preferences.  
* Normalizing all provider responses into canonical repository objects.

Importantly, **no business reasoning occurs within this layer**. It should never attempt to infer creative strategy, identify winning campaigns, or interpret marketing performance. Those responsibilities belong exclusively to the Creative Intelligence Engine.

---

## **Normalization**

Each provider exposes its own API schema, naming conventions, and object hierarchy.

For example:

Shopify

Product  
 ├── Variants  
 ├── Media  
 ├── Collections  
 └── Metafields

Meta Ads

Campaign  
 ├── Ad Sets  
 ├── Ads  
 ├── Creatives  
 └── Insights

Google Ads

Campaign  
 ├── Ad Groups  
 ├── Ads  
 ├── Assets  
 └── Metrics

Rather than exposing these provider-specific structures to downstream services, the ingestion layer transforms them into the platform's internal repository objects.

External APIs

↓

Normalization Layer

↓

BrandContext.json

Product.json

Campaign.json

This normalization process isolates provider-specific implementation details from the remainder of the architecture and significantly simplifies downstream planning.

---

## **Creative Preference**

Creative Studio introduces a user-provided **Creative Preference** as a first-class planning input.

Unlike campaign objectives or product metadata, this information originates directly from the user for each generation request and captures subjective creative direction that cannot be inferred from historical marketing data.

Example preferences include:

* Minimalist  
* Luxury fashion  
* Streetwear aesthetic  
* Apple-style advertising  
* Film photography  
* Handheld UGC  
* Pinterest-inspired visuals  
* Dark cinematic lighting  
* Fast-paced edits  
* Soft pastel palette

Creative Preference is propagated through every planning stage and influences:

* Creative planning  
* Character generation  
* Story planning  
* Image generation  
* Video generation  
* Caption generation  
* Voiceover style

Treating Creative Preference as structured input rather than free-form prompt text enables deterministic propagation throughout the pipeline.

---

## **Outputs**

The Context Ingestion Layer produces three persistent repository objects:

BrandContext.json

Product.json

Campaign.json

These objects collectively represent the authoritative marketing knowledge available to the platform.

---

# **7.2 Brand Context Repository**

## **Overview**

The Brand Context Repository serves as the central knowledge store for Creative Studio. Rather than storing provider-specific API responses, the repository maintains normalized, platform-specific representations optimized for creative planning and generation.

The repository intentionally adopts a hybrid architecture consisting of three independent repositories:

* Brand Context Repository  
* Product Repository  
* Campaign Repository

This design avoids both excessive relational normalization and large monolithic documents while preserving flexibility and efficient retrieval.

---

## **Repository Architecture**

                   PostgreSQL

               JSONB \+ pgvector

        ┌────────────┼────────────┐

        ▼            ▼            ▼

 BrandContext    Products     Campaigns

      │             │             │

      └─────────────┼─────────────┘

                    ▼

          Creative Intelligence

Each repository evolves independently and is optimized for its own update frequency.

---

## **Brand Context**

The Brand Context repository contains information that changes relatively infrequently.

Examples include:

* Brand identity  
* Brand description  
* Marketing tone  
* Target audience  
* Colour palette  
* Creative guidelines  
* Positioning  
* Brand values  
* Historical creative learnings  
* User creative preferences  
* Frequently used messaging

This information represents the long-term identity of the brand rather than individual campaigns or products.

---

## **Product Repository**

The Product Repository contains one normalized Product object per Shopify product.

Each product exists independently and includes:

* Shopify metadata  
* Variants  
* Pricing  
* Images  
* Product embeddings  
* Extracted cutouts  
* Placement assets  
* Marketing metadata

Products change independently from brand identity and are therefore maintained separately.

---

## **Campaign Repository**

The Campaign Repository stores normalized advertising knowledge collected from Meta Ads and Google Ads.

Rather than preserving provider-specific hierarchies, campaign information is summarized into reusable marketing knowledge, including:

* Campaign objectives  
* Historical creatives  
* Winning hooks  
* Performance metrics  
* Audience segments  
* Platform  
* Marketing lessons

This repository serves primarily as historical context for future creative planning.

---

## **Why JSONB?**

Creative Studio intentionally stores repository objects as JSONB documents rather than fully normalized relational tables.

This decision is motivated by several architectural considerations:

* Repository schemas evolve frequently as new planning capabilities are introduced.  
* Large language models consume hierarchical documents more naturally than relational joins.  
* Nested structures such as campaign summaries and product metadata map directly to JSON.  
* PostgreSQL JSONB supports indexing, partial updates, and efficient querying without sacrificing flexibility.

The architecture therefore benefits from document-oriented storage while retaining the maturity and reliability of PostgreSQL.

---

## **Why pgvector?**

In addition to structured metadata, repository objects contain semantic embeddings stored using the pgvector extension.

Embeddings enable similarity-based retrieval that cannot be achieved through traditional SQL filtering.

Example use cases include:

* Finding visually similar products.  
* Retrieving campaigns with comparable messaging.  
* Identifying advertisements using similar creative styles.  
* Reusing successful hooks across related products.  
* Discovering campaigns targeting semantically similar audiences.

Embedding storage remains co-located with structured repository objects, avoiding the operational complexity of maintaining a separate vector database.

---

## **Asset Storage**

While PostgreSQL stores structured metadata, all binary assets are stored externally within **Cloudflare R2**.

Assets include:

* Original Shopify images  
* Product cutouts  
* Garment masks  
* Reference portraits  
* Generated images  
* Generated videos  
* Voiceover audio  
* Subtitle files  
* Intermediate generation artifacts

Repository objects contain references to these assets rather than embedding binary data directly.

This separation minimizes database size while enabling efficient asset retrieval throughout the generation pipeline.

---

# **7.3 Creative Intelligence Engine**

## **Overview**

The Creative Intelligence Engine is the primary reasoning component within the Creative Studio architecture. It is the only module responsible for interpreting business context, identifying marketing opportunities, and planning creative direction.

Unlike downstream media generation services, the Creative Intelligence Engine performs **reasoning rather than synthesis**. Its purpose is to transform structured business knowledge into structured creative intent.

The engine is implemented using **GPT-5.4 mini**, accessed through **OpenRouter**, and operates exclusively on normalized repository objects.

---

## **Responsibilities**

The Creative Intelligence Engine is responsible for:

* Interpreting brand identity.  
* Understanding product positioning.  
* Analyzing historical campaign performance.  
* Incorporating user creative preferences.  
* Selecting the most appropriate product for promotion.  
* Determining marketing objectives.  
* Identifying target audiences.  
* Developing advertising angles.  
* Generating messaging strategy.  
* Planning creative direction.

Importantly, the engine **does not generate prompts**.

Instead, it produces the first canonical planning artifact:

CreativeSpec.json

All downstream services derive their behaviour from this object.

---

## **Inputs**

The engine consumes:

BrandContext.json

\+

Product.json

\+

Campaign.json

\+

Creative Preference

These inputs are merged through retrieval and semantic search before being presented to the planner.

The engine may leverage pgvector to retrieve historically similar campaigns, related products, or previously successful messaging strategies, ensuring that planning decisions are grounded in prior performance rather than isolated inference.

---

## **Outputs**

The primary output is:

CreativeSpec.json

CreativeSpec defines the complete creative intent for the advertisement, including:

* campaign objective  
* selected product  
* target audience  
* messaging strategy  
* visual direction  
* creative preference  
* platform  
* call-to-action  
* overall narrative

It represents the boundary between **creative reasoning** and **creative execution**.

All downstream modules assume CreativeSpec to be the authoritative description of what the advertisement should communicate.

# **7.4 Character Generation**

## **Overview**

One of the primary challenges in AI-generated advertising is maintaining visual consistency across independently generated assets. Current image and video generation models exhibit significant variability even when provided with identical prompts, making it difficult to preserve the identity of human subjects across multiple images or video scenes.

Creative Studio addresses this limitation by introducing a dedicated **Character Generation** stage that produces a reusable **Character Sheet** prior to any media generation. Rather than repeatedly describing a person through prompts, every downstream generation task references a shared character definition containing persistent visual identity and conditioning assets.

The Character Generator therefore establishes a single source of truth for all human subjects appearing within an advertisement.

---

## **Responsibilities**

The Character Generator is responsible for:

* Creating a visually coherent advertising persona.  
* Translating creative direction into human appearance.  
* Producing reference portraits.  
* Defining persistent facial characteristics.  
* Defining clothing style independent of the advertised product.  
* Establishing consistent expressions.  
* Defining personality traits relevant to the advertisement.  
* Providing conditioning assets for image and video generation.

Unlike downstream generation services, the Character Generator does **not** produce advertising content. It produces only identity.

---

## **Inputs**

The Character Generator consumes:

CreativeSpec.json

\+

BrandContext.json

CreativeSpec determines:

* target demographic  
* advertisement style  
* platform  
* creative preference  
* marketing angle

BrandContext contributes:

* brand identity  
* audience  
* long-term creative style

---

## **Character Sheet**

The primary output is:

CharacterSheet.json

CharacterSheet acts as the canonical identity contract throughout the remainder of the pipeline.

Rather than repeatedly prompting image and video models with lengthy physical descriptions, all downstream services consume CharacterSheet as structured identity context.

CharacterSheet contains:

* demographic information  
* physical appearance  
* facial characteristics  
* hairstyle  
* clothing style  
* accessories  
* expressions  
* speaking style  
* personality descriptors  
* reference portrait  
* reference poses

The companion **Schema Specification** formally defines every field contained within CharacterSheet.

---

## **Reference Portrait**

After constructing the Character Sheet, the Character Generator produces a high-quality reference portrait.

This portrait serves as the conditioning image for every subsequent media generation task.

Character Sheet

↓

Reference Portrait

↓

Image Generation

↓

Video Generation

Using a shared reference portrait significantly improves identity consistency across independently generated assets compared to prompt-only conditioning.

---

## **Identity Persistence**

The Character Sheet remains constant for the duration of a single advertisement generation workflow.

Every generated image and each of the three video shots reference the same character definition.

This ensures that:

* facial identity remains stable,  
* expressions remain coherent,  
* clothing style remains consistent,  
* generated assets appear to belong to the same individual.

The architecture intentionally separates **identity generation** from **scene generation**, allowing either component to evolve independently.

---

# **7.5 Story Planner**

## **Overview**

Following creative planning and character generation, the Story Planner transforms high-level marketing intent into a structured storyboard suitable for media generation.

Rather than allowing image or video models to determine scene composition implicitly, the Story Planner explicitly defines every shot that will appear in the final advertisement.

This planning stage represents the transition from creative reasoning to production planning.

---

## **Responsibilities**

The Story Planner is responsible for:

* determining narrative progression,  
* defining shot sequence,  
* assigning dialogue,  
* planning camera language,  
* selecting backgrounds,  
* defining lighting,  
* planning transitions,  
* allocating durations,  
* determining product visibility.

The Story Planner does **not** generate prompts or media.

Its only responsibility is to produce structured shot definitions.

---

## **Fixed Three-Shot Architecture**

Creative Studio intentionally standardizes all advertisements into **exactly three shots**.

Unlike arbitrary video timelines, a fixed structure simplifies planning, orchestration, caching, quality assurance, and regeneration.

The narrative follows the structure:

Shot 1

Hook

↓

Shot 2

Product

↓

Shot 3

Call-To-Action

---

### **Shot 1 — Hook**

Purpose:

Capture viewer attention immediately.

Typical content includes:

* surprising statement  
* emotional reaction  
* lifestyle scene  
* relatable problem  
* curiosity

The product may appear but is not the primary focus.

---

### **Shot 2 — Product**

Purpose:

Introduce and demonstrate the product.

This shot contains:

* strongest product visibility  
* feature emphasis  
* product placement  
* close-ups  
* supporting dialogue

The computer vision pipeline later replaces the placeholder product with the authentic Shopify asset.

---

### **Shot 3 — Call-To-Action**

Purpose:

Conclude the advertisement.

Typical elements include:

* recommendation  
* offer  
* urgency  
* purchase encouragement  
* branding

This shot completes the advertisement.

---

## **Shot Specification**

The Story Planner produces:

ShotSpec.json

ShotSpec contains an array of exactly three structured shot objects.

Each shot defines:

* duration  
* purpose  
* dialogue  
* camera  
* movement  
* framing  
* background  
* lighting  
* transition  
* emotional tone  
* product visibility

The Story Planner intentionally avoids provider-specific prompting.

Instead, it describes **what** should happen rather than **how** a specific model should produce it.

---

## **Narrative Consistency**

All three shots share:

* CharacterSheet  
* CreativeSpec  
* selected product  
* creative preference  
* overall advertising objective

This ensures visual and narrative continuity across independently generated clips.

---

# **7.6 Generation Orchestrator**

## **Overview**

The Generation Orchestrator coordinates execution across all downstream media generation services.

Unlike the Creative Intelligence Engine, the orchestrator performs **no creative reasoning**.

Its responsibilities are operational rather than semantic.

The orchestrator is implemented using **Temporal**, providing durable execution, workflow persistence, retries, checkpointing, and parallel task scheduling.

---

## **Responsibilities**

The Generation Orchestrator is responsible for:

* workflow scheduling,  
* dependency management,  
* task distribution,  
* retry handling,  
* state persistence,  
* caching,  
* execution tracking,  
* artifact management.

Every downstream media generation task originates from the orchestrator.

---

## **GenerationTask**

Rather than requiring every worker to retrieve multiple upstream objects, the orchestrator compiles a temporary execution object.

BrandContext

\+

Product

\+

CreativeSpec

\+

CharacterSheet

\+

ShotSpec

↓

GenerationTask.json

GenerationTask is an **ephemeral internal artifact**.

Unlike repository objects, it is not permanently stored.

Instead, it represents a complete work order for a single generation task.

Each image worker, video worker, and voice worker receives exactly one GenerationTask.

---

## **Parallel Execution**

Because the advertisement contains exactly three shots, the orchestrator can execute generation tasks concurrently.

              ShotSpec

                  │

      ┌───────────┼───────────┐

      ▼           ▼           ▼

   Shot 1      Shot 2      Shot 3

      │           │           │

      └───────────┼───────────┘

                  ▼

          Product Replacement

                  ▼

                 QA

                  ▼

            Composition

Parallel execution significantly reduces overall generation time while preserving deterministic workflow ordering.

---

## **Workflow Resilience**

Media generation can involve long-running inference tasks lasting several minutes.

Temporal provides durable execution through:

* automatic retries,  
* workflow checkpointing,  
* resumable execution,  
* timeout handling,  
* worker recovery,  
* distributed scheduling.

If an individual generation task fails, only the failed task is re-executed.

Previously completed tasks remain cached and are not regenerated.

This substantially improves reliability while minimizing inference costs.

---

## **Output**

The orchestrator coordinates the production of:

* generated images,  
* generated video shots,  
* voiceovers,  
* captions,  
* intermediate assets,

before passing execution to the Product Replacement Pipeline and subsequent Quality Assurance stage.

---

# **7.7 Image Generation Pipeline**

## **Overview**

The Image Generation Pipeline is responsible for producing high-quality static advertising creatives that accurately represent the selected product while adhering to the planned visual style, character identity, and creative direction.

Unlike conventional text-to-image workflows, Creative Studio intentionally separates **scene composition** from **product fidelity**. The image generation model is responsible for generating composition, lighting, pose, camera angle, and overall aesthetic, while the actual product is inserted later through a dedicated product replacement pipeline.

This separation significantly improves consistency and eliminates many of the inaccuracies commonly introduced by generative image models.

---

## **Responsibilities**

The Image Generation Pipeline is responsible for:

* generating scene composition,  
* generating the advertising character,  
* positioning placeholder products,  
* maintaining visual consistency,  
* preserving lighting and perspective,  
* producing assets suitable for downstream product replacement.

It is **not** responsible for accurately reproducing the merchant's product.

---

## **Inputs**

The pipeline consumes:

GenerationTask.json

GenerationTask contains all information required for generation, including:

* CreativeSpec  
* CharacterSheet  
* ShotSpec  
* Product metadata  
* Creative Preference  
* Platform requirements

The image worker never retrieves repository objects directly.

---

## **Generation**

Static image generation is performed using:

FLUX 2

(via Fal AI)

FLUX receives a provider-specific prompt generated internally from GenerationTask.

Prompt construction remains isolated inside the provider adapter and is intentionally hidden from the remainder of the architecture.

This allows FLUX to be replaced without affecting upstream planning components.

---

## **Placeholder Product Generation**

Rather than attempting to recreate the exact Shopify product, FLUX generates an approximate visual placeholder.

For example:

Shopify Product

↓

Designer Beige Suit

↓

FLUX

↓

Generic Beige Suit

The placeholder preserves:

* silhouette,  
* approximate colour,  
* product category,  
* pose compatibility,

while allowing the downstream computer vision pipeline to replace it with the authentic product.

---

## **Output**

The Image Generation Pipeline produces:

* Generated Scene  
* Generation Metadata

These outputs are subsequently forwarded to the Product Replacement Pipeline.

---

# **7.8 Video Generation Pipeline**

## **Overview**

The Video Generation Pipeline produces short-form UGC advertisements composed of exactly three independently generated shots.

Instead of generating a continuous ten-second video, Creative Studio generates each planned shot separately before composing them into a final advertisement.

This design substantially improves controllability, regeneration efficiency, and production reliability.

---

## **Responsibilities**

The Video Generation Pipeline is responsible for:

* generating realistic human performance,  
* preserving character identity,  
* maintaining planned camera movement,  
* generating cinematic motion,  
* producing temporally coherent clips.

It intentionally avoids product fidelity responsibilities.

---

## **Inputs**

The pipeline consumes:

GenerationTask.json

Each GenerationTask corresponds to one of the three planned shots.

The orchestrator dispatches three independent generation tasks:

GenerationTask

↓

Shot 1

↓

GenerationTask

↓

Shot 2

↓

GenerationTask

↓

Shot 3

---

## **Video Generation**

Video generation is performed using:

Seedance

(via Fal AI)

Each shot is generated independently while sharing:

* Character Sheet  
* Creative Specification  
* Creative Preference  
* Product metadata

This shared context ensures narrative and visual consistency.

---

## **Independent Shot Generation**

Each shot is treated as an independent inference task.

Advantages include:

* parallel execution,  
* reduced regeneration cost,  
* easier quality assurance,  
* simpler editing,  
* improved workflow resilience.

If one shot fails validation, only that shot is regenerated.

---

## **Character Consistency**

All shots reference the same Character Sheet and conditioning portrait.

This architecture minimizes identity drift between independently generated clips while avoiding repeated prompt engineering.

---

## **Output**

Each video worker produces:

* one generated video clip,  
* generation metadata.

The orchestrator later combines all three validated clips during composition.

---

# **7.9 Voice Generation Pipeline**

## **Overview**

The Voice Generation Pipeline produces the spoken narration accompanying the advertisement.

Rather than generating generic narration after the video has been produced, voice generation is planned alongside the storyboard so that dialogue, pacing, subtitles, and visual timing remain synchronized.

Voice synthesis is therefore treated as an independent production stage rather than a post-processing task.

---

## **Responsibilities**

The Voice Pipeline is responsible for:

* generating advertising narration,  
* maintaining speaking style,  
* matching shot timing,  
* producing subtitle text,  
* aligning narration with storyboard timing.

---

## **Narrative Structure**

Every advertisement follows the same three-stage narrative:

Shot 1

Hook

↓

Shot 2

Product Introduction

↓

Shot 3

Call-To-Action

The voice script follows this structure directly.

For example:

Shot 1

"I wasn't expecting this to look this good."

↓

Shot 2

"This designer suit is lightweight, tailored perfectly,  
and honestly feels premium."

↓

Shot 3

"If you're looking to upgrade your wardrobe,  
this is definitely worth checking out."

The exact wording is determined during creative planning.

---

## **Voice Synthesis**

Voice synthesis is performed using a text-to-speech model hosted through **Fal AI**.

The architecture intentionally abstracts the underlying provider so that future TTS models may be substituted without requiring architectural changes.

---

## **Synchronization**

Voice timing is synchronized with the Story Planner.

Each narration segment corresponds directly to one planned shot.

This enables:

* subtitle alignment,  
* transition timing,  
* visual synchronization,  
* composition automation.

---

## **Outputs**

The Voice Pipeline produces:

* narration audio,  
* subtitle transcript,  
* timing metadata.

These artifacts are subsequently consumed during the Composition stage.

---

# **7.10 Product Replacement Pipeline**

## **Overview**

Product fidelity is one of the defining architectural features of Creative Studio.

Modern image and video generation models excel at composition and realism but remain unreliable when reproducing commercial products with exact colours, logos, textures, stitching, and branding.

Creative Studio therefore treats generated products as temporary placeholders.

The authentic Shopify product is inserted afterwards using computer vision.

---

## **Responsibilities**

The Product Replacement Pipeline is responsible for:

* extracting merchant products,  
* isolating products from original imagery,  
* generating transparent assets,  
* identifying replacement regions,  
* inserting authentic products,  
* harmonizing lighting and shadows.

This pipeline represents the authoritative source of product truth throughout the system.

---

## **Product Extraction**

Products are downloaded from Shopify and processed using:

BiRefNet

BiRefNet removes backgrounds and generates high-quality transparent cutouts suitable for insertion into generated scenes.

The resulting cutouts are stored within Cloudflare R2 and referenced by Product.json.

---

## **Placement**

Following image or video generation, placeholder garments are replaced using:

BRIA Product Shot

The placement model receives:

* generated scene,  
* garment region,  
* product cutout,  
* placement guidance.

Its responsibility is to integrate the authentic product into the generated media while preserving perspective, lighting, folds, and realism.

---

## **Garment Mask**

During generation, a garment segmentation mask is produced alongside each scene.

This mask provides explicit localization information indicating where product replacement should occur.

Generated Scene

↓

Garment Mask

\+

Product Cutout

↓

BRIA Product Placement

↓

Final Asset

The segmentation mask improves placement precision and minimizes unnecessary image modifications.

---

## **Product Truth**

Following replacement, every advertisement contains the merchant's actual product rather than a generated approximation.

This approach provides significantly higher visual accuracy while allowing generative models to focus on storytelling and composition.

---

# **7.11 Quality Assurance Layer**

## **Overview**

Media generation models inevitably produce imperfect outputs. Despite advances in multimodal generation, artifacts such as incorrect product placement, distorted hands, inconsistent faces, illegible text, poor lighting, or visual discontinuities remain common.

Creative Studio therefore treats media generation as an intermediate step rather than the final output. Every generated asset must pass through an independent Quality Assurance (QA) layer before it can be composed into a finished advertisement.

Unlike traditional software testing, QA within Creative Studio evaluates perceptual quality, visual consistency, product fidelity, and compliance with the planned creative specification.

---

## **Responsibilities**

The Quality Assurance Layer is responsible for:

* validating product replacement,  
* verifying character consistency,  
* detecting visual artifacts,  
* checking image quality,  
* validating scene continuity,  
* verifying subtitle timing,  
* ensuring creative specification compliance,  
* determining whether regeneration is required.

Quality Assurance never modifies media directly. It only evaluates outputs and determines whether downstream composition should proceed.

---

## **Validation Categories**

The QA layer evaluates generated assets across multiple categories.

### **Product Validation**

Ensures that:

* the correct Shopify product is present,  
* colours match the original asset,  
* logos remain visible,  
* proportions are preserved,  
* placement appears natural.

---

### **Character Consistency**

Validates that all generated shots correspond to the same Character Sheet.

Checks may include:

* facial similarity,  
* hairstyle consistency,  
* accessories,  
* clothing continuity (excluding the advertised product),  
* body proportions.

---

### **Visual Quality**

Evaluates:

* sharpness,  
* lighting,  
* image artifacts,  
* unwanted object generation,  
* anatomical correctness,  
* background consistency.

---

### **Narrative Validation**

Confirms that:

* the Hook appears first,  
* the Product shot appears second,  
* the CTA concludes the advertisement,  
* dialogue aligns with visuals,  
* timing matches the Story Planner.

---

### **Technical Validation**

Verifies:

* resolution,  
* aspect ratio,  
* frame rate,  
* subtitle formatting,  
* audio duration,  
* encoding requirements.

---

## **QA Report**

The QA Layer produces the final execution artifact:

QAReport.json

The report contains:

* validation status,  
* quality scores,  
* detected issues,  
* regeneration recommendations,  
* overall pass/fail result.

The companion Schema Specification formally defines all QA metrics and scoring methodologies.

---

## **Regeneration**

If validation fails, QA requests regeneration through Temporal.

Only the failed component is regenerated.

Examples include:

Image fails

↓

Regenerate Image

✓

Video unaffected

or

Shot 2 fails

↓

Regenerate Shot 2

✓

Shots 1 and 3 reused

This selective regeneration significantly reduces inference cost while improving workflow reliability.

---

# **7.12 Composition Layer**

## **Overview**

The Composition Layer assembles validated assets into production-ready advertisements.

Unlike generation services, composition performs no creative reasoning. Instead, it synchronizes previously generated media into a coherent final deliverable.

---

## **Responsibilities**

The Composition Layer is responsible for:

* sequencing validated video clips,  
* synchronizing narration,  
* applying transitions,  
* rendering subtitles,  
* inserting branding,  
* generating multiple export formats,  
* preparing platform-specific outputs.

---

## **Composition Pipeline**

Validated Images

\+

Validated Video Clips

\+

Voiceover

\+

Subtitle Timing

\+

Brand Assets

↓

Composition

↓

Final Advertisement

---

## **Video Assembly**

The three validated video shots are assembled sequentially.

Shot 1

↓

Shot 2

↓

Shot 3

↓

Final Video

Because shot durations are defined during planning, no additional editing decisions are required during composition.

---

## **Subtitle Rendering**

Subtitle timing originates from the Voice Pipeline.

The Composition Layer simply renders subtitles according to predefined timestamps while preserving platform-safe margins.

---

## **Branding**

Optional brand assets may be inserted during composition, including:

* logo overlays,  
* end cards,  
* promotional banners,  
* website URLs,  
* discount codes.

Brand placement is defined within CreativeSpec rather than determined during composition.

---

## **Media Processing**

Composition uses FFmpeg for:

* video concatenation,  
* audio synchronization,  
* subtitle rendering,  
* codec conversion,  
* bitrate optimization,  
* export formatting.

Keeping composition deterministic ensures reproducible outputs regardless of the upstream generation provider.

---

# **7.13 Export Layer**

## **Overview**

The Export Layer prepares completed advertisements for downstream consumption.

Its responsibility is not generation but packaging.

Generated assets are organized, stored, indexed, and made available for future retrieval.

---

## **Responsibilities**

The Export Layer:

* stores completed assets,  
* uploads media to Cloudflare R2,  
* updates repository metadata,  
* records generation history,  
* exposes downloadable outputs,  
* prepares assets for future campaign reuse.

---

## **Stored Assets**

Typical outputs include:

Final Static Image

Final Video

Voiceover

Subtitles

Thumbnail

QA Report

Generation Metadata

Each asset is associated with the originating Product, Campaign, and Creative Specification.

---

## **Asset Manifest**

The Export Layer updates:

AssetManifest.json

This object acts as the canonical inventory of all generated media associated with a generation session.

Rather than embedding binary data, AssetManifest stores references to Cloudflare R2 objects together with metadata describing each artifact.

---

## **Storage Architecture**

Generated Assets

↓

Cloudflare R2

↓

AssetManifest.json

↓

Repository

Separating binary storage from structured metadata minimizes database growth while enabling efficient retrieval and lifecycle management.

---

# **8\. Repository Architecture**

## **Overview**

Creative Studio adopts a **hybrid document repository** built on PostgreSQL.

Instead of decomposing the domain into dozens of relational tables or introducing a dedicated graph database, the architecture stores a small number of large, self-contained JSONB documents representing the platform's core business entities.

This design balances flexibility, query performance, and implementation simplicity.

---

## **Repository Structure**

PostgreSQL

│

├── BrandContext Repository

├── Product Repository

├── Campaign Repository

└── Generation Metadata

Each repository evolves independently while remaining connected through stable identifiers defined within the JSON schemas.

---

## **JSONB Documents**

The architecture intentionally favors coarse-grained JSON documents over highly normalized relational models.

Advantages include:

* schema evolution without frequent migrations,  
* natural mapping to LLM inputs,  
* reduced join complexity,  
* straightforward serialization,  
* simplified caching,  
* easier debugging.

The authoritative structure of each document is defined in the Schema Specification.

---

## **pgvector Integration**

Each repository may optionally contain semantic embeddings stored using PostgreSQL's pgvector extension.

Embeddings support similarity search for:

* products,  
* campaigns,  
* creative styles,  
* messaging,  
* audiences.

By co-locating vectors with structured metadata, the platform avoids operational overhead associated with maintaining an external vector database.

---

# **9\. JSON Flow**

The architecture is built around structured JSON contracts.

Every major service consumes canonical objects, performs deterministic processing, and produces new objects.

This eliminates hidden prompt chains and creates a transparent, inspectable workflow.

---

## **Context Layer**

BrandContext.json

Product.json

Campaign.json

Produced by:

Context Ingestion.

---

## **Planning Layer**

CreativeSpec.json

CharacterSheet.json

ShotSpec.json

Produced by:

Creative Intelligence Engine, Character Generator, and Story Planner.

---

## **Orchestration Layer**

GenerationTask.json

Produced by:

Generation Orchestrator.

GenerationTask is ephemeral and exists only for the duration of a generation task.

---

## **Execution Layer**

AssetManifest.json

QAReport.json

Produced by:

Generation workers, Product Replacement, QA, and Export.

---

## **JSON Lifecycle**

Context

↓

Planning

↓

GenerationTask

↓

Generation

↓

QA

↓

Export

Every downstream module depends exclusively on structured contracts rather than provider-specific APIs.

---

# **10\. Technology Stack**

| Layer | Technology |
| ----- | ----- |
| Backend API | FastAPI |
| Workflow Orchestration | Temporal |
| LLM Planning | GPT-5.4 mini (via OpenRouter) |
| Image Generation | FLUX 2 (Fal AI) |
| Video Generation | Seedance (Fal AI) |
| Voice Synthesis | Fal AI TTS |
| Product Segmentation | BiRefNet |
| Product Placement | BRIA Product Shot |
| Database | PostgreSQL |
| Document Storage | JSONB |
| Semantic Search | pgvector |
| Asset Storage | Cloudflare R2 |
| Media Processing | FFmpeg |

The architecture intentionally isolates provider-specific integrations behind service adapters, allowing future replacement without affecting the broader system.

---

# **11\. Future Extensions**

Although Version 2 targets static advertisements and short-form UGC videos, the architecture is designed to accommodate future capabilities without requiring fundamental redesign.

Potential extensions include:

* multilingual advertisement generation,  
* regional voice localization,  
* multi-character advertisements,  
* A/B creative exploration,  
* automated campaign publishing,  
* platform-specific optimization,  
* creative performance feedback loops,  
* reinforcement learning from campaign outcomes,  
* support for additional commerce and advertising platforms.

Because each capability integrates through existing JSON contracts, these features can be introduced incrementally while preserving compatibility with existing services.

---

# **12\. Conclusion**

Cosmisk Creative Studio reimagines AI-powered advertisement generation as a structured production pipeline rather than a sequence of loosely connected model invocations. By separating creative reasoning from media synthesis, treating structured JSON artifacts as the primary communication mechanism, and enforcing deterministic orchestration through Temporal, the platform achieves a level of transparency, reproducibility, and modularity that is difficult to obtain through prompt-centric architectures alone.

The resulting system combines large language models, multimodal generation, computer vision, and workflow orchestration into a cohesive architecture capable of producing production-ready advertising assets while preserving product fidelity, creative consistency, and operational resilience. Every major component has a clearly defined responsibility, every interaction is governed by explicit contracts, and every stage can evolve independently, providing a robust foundation for future expansion as multimodal AI capabilities continue to mature.

---

I actually think we can do better than a simple sequence diagram.

For a document of this caliber, I'd end with what companies like Uber, Stripe, and Netflix often include: a **worked example**. Instead of abstractly describing the architecture, we trace one real request through every module, showing the evolution of the data at each step. This makes the system much easier to understand and also serves as an implementation reference.

I'd make it the final appendix.

---

# **Appendix A — End-to-End Generation Walkthrough**

This appendix illustrates how a single creative generation request flows through the entire Creative Studio architecture. Rather than describing individual components in isolation, it demonstrates how they interact to transform business context into production-ready advertising assets.

The example below assumes the following scenario.

> A clothing brand wishes to generate a 10-second Instagram UGC advertisement for one of its premium designer suits. The user provides the creative preference: **"Luxury, handheld UGC, soft natural lighting, minimal text."**

---

# **Step 1 — User Request**

The workflow begins with a generation request submitted through the Creative Studio API.

Brand:  
    TailorX

Product:  
    Premium Linen Suit

Platform:  
    Instagram Reels

Creative Preference:  
    Luxury handheld UGC  
    Natural lighting  
    Premium aesthetic

Output:  
    Static Image  
    10-second Video

The request itself contains very little information. The majority of creative context is obtained from external systems during ingestion.

---

# **Step 2 — Context Ingestion**

The Context Ingestion Layer retrieves information from connected provider APIs.

Shopify

↓

Products  
Variants  
Media  
Pricing  
Collections

Meta Ads

↓

Previous Ads

CTR

Winning Creatives

Audience

Google Ads

↓

Campaigns

Search Assets

Performance

The user's Creative Preference is attached to the ingestion session.

No reasoning occurs during this stage.

---

# **Step 3 — Repository Population**

The ingestion layer normalizes provider responses into the platform's canonical repository objects.

BrandContext.json

↓

TailorX

Luxury Menswear

Premium Positioning

Brand Voice

Target Audience

Product.json

↓

Premium Linen Suit

Variants

Images

Pricing

Embeddings

Product Cutout Pending

Campaign.json

↓

Top Performing Ads

Best Hooks

Historical Metrics

Audience Learnings

These three repository objects become the knowledge base used throughout planning.

---

# **Step 4 — Product Asset Preparation**

Before creative planning begins, Shopify product imagery is prepared for later replacement.

Original Shopify Image

↓

BiRefNet

↓

Transparent Product Cutout

↓

Cloudflare R2

The Product Repository is updated with references to:

* original assets,  
* transparent cutouts,  
* segmentation metadata,  
* placement assets.

These assets become the authoritative representation of the merchant's product throughout the remainder of the workflow.

---

# **Step 5 — Creative Planning**

The Creative Intelligence Engine retrieves:

* BrandContext  
* Product  
* Campaign  
* Creative Preference

and constructs a unified planning prompt for GPT-5.4 mini.

Rather than requesting media directly, the planner determines:

* campaign objective,  
* audience,  
* messaging,  
* tone,  
* platform,  
* product,  
* creative direction.

The resulting artifact is:

CreativeSpec.json

Example summary:

Objective

Increase purchases

Audience

Young professionals

Tone

Luxury

Visual Style

Premium UGC

Primary Message

Tailored elegance

No image or video has been generated yet.

---

# **Step 6 — Character Generation**

CreativeSpec is forwarded to the Character Generator.

The generator creates:

CharacterSheet.json

describing:

* age,  
* appearance,  
* hairstyle,  
* facial structure,  
* clothing style,  
* expressions,  
* personality,  
* speaking characteristics.

A high-quality reference portrait is then generated.

Character Sheet

↓

Reference Portrait

Every future image and video references this portrait.

---

# **Step 7 — Story Planning**

CreativeSpec and CharacterSheet are transformed into a structured storyboard.

ShotSpec.json

containing exactly three shots.

Shot 1

Hook

Woman:  
"I wasn't expecting this..."

↓

Shot 2

Product

Shows Suit

↓

Shot 3

CTA

"Highly recommend."

Each shot specifies:

* framing,  
* dialogue,  
* duration,  
* movement,  
* lighting,  
* transition,  
* product visibility.

---

# **Step 8 — GenerationTask Construction**

Temporal now prepares execution tasks.

Rather than forcing every worker to retrieve multiple objects, it assembles an ephemeral work package.

BrandContext

\+

Product

\+

CreativeSpec

\+

CharacterSheet

\+

ShotSpec

↓

GenerationTask.json

GenerationTask is never treated as a persistent business object.

It exists solely to execute one generation workflow.

---

# **Step 9 — Parallel Media Generation**

Temporal dispatches independent workers.

GenerationTask

↓

Image Worker

↓

Static Advertisement

GenerationTask

↓

Video Worker

↓

Shot 1

GenerationTask

↓

Video Worker

↓

Shot 2

GenerationTask

↓

Video Worker

↓

Shot 3

GenerationTask

↓

Voice Worker

↓

Narration

All workers execute concurrently.

---

# **Step 10 — Placeholder Media**

At this stage the generated assets contain only approximate products.

For example:

Generated Image

↓

Generic Beige Suit

Similarly,

Generated Video

↓

Approximate Garment

The overall composition is correct.

The product itself is not yet authoritative.

---

# **Step 11 — Product Replacement**

The Product Replacement Pipeline retrieves:

Generated Scene

\+

Garment Mask

\+

Shopify Product Cutout

↓

BRIA Product Shot

↓

Authentic Product

The placeholder garment is replaced with the merchant's real product.

This stage establishes product truth across every asset.

---

# **Step 12 — Quality Assurance**

Each artifact undergoes validation.

Checks include:

✓ Product correctness

✓ Character consistency

✓ Lighting

✓ Subtitle timing

✓ Resolution

✓ Composition

✓ Platform requirements

Results are stored in:

QAReport.json

If any validation fails, Temporal regenerates only the affected asset.

---

# **Step 13 — Composition**

Validated assets are combined.

Shot 1

↓

Shot 2

↓

Shot 3

↓

Voice

↓

Subtitles

↓

Final MP4

Static advertisements are similarly finalized after successful product replacement.

---

# **Step 14 — Export**

Final assets are uploaded.

Cloudflare R2

↓

Static Image

Video

Voice

Subtitles

Thumbnail

The Export Layer records these assets in:

AssetManifest.json

allowing future retrieval, regeneration, and campaign reuse.

---

# **Final Pipeline Summary**

User Request  
      │  
      ▼  
Context Ingestion  
      │  
      ▼  
BrandContext.json  
Product.json  
Campaign.json  
      │  
      ▼  
Creative Intelligence Engine  
      │  
      ▼  
CreativeSpec.json  
      │  
      ├───────────────┐  
      ▼               ▼  
CharacterSheet     ShotSpec  
      │               │  
      └──────┬────────┘  
             ▼  
     GenerationTask.json  
             │  
             ▼  
   ┌───────────────────────────────┐  
   │ Image │ Video │ Voice Workers │  
   └───────────────────────────────┘  
             │  
             ▼  
 Product Replacement (BiRefNet \+ BRIA)  
             │  
             ▼  
      Quality Assurance  
             │  
             ▼  
        FFmpeg Composition  
             │  
             ▼  
      Cloudflare R2 Export  
             │  
             ▼  
      Static Image \+ Video

