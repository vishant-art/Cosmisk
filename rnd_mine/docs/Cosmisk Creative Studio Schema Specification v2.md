# **Cosmisk Creative Studio Schema Specification v2**

**Version:** 2.0  
**Status:** Draft  
**Last Updated:** July 2026

---

# **1\. Context**

Modern multimodal AI systems increasingly rely on structured data rather than monolithic prompts to coordinate complex reasoning and generation tasks. While large language models excel at interpreting natural language, production-grade AI systems require deterministic contracts between independent services to ensure reproducibility, scalability, and maintainability.

Creative generation presents a particularly challenging orchestration problem. A single advertisement requires contributions from multiple specialized systems, including business context ingestion, creative planning, character design, storyboard generation, image synthesis, video synthesis, computer vision, speech generation, quality assurance, and media composition. Without clearly defined interfaces, these components become tightly coupled through provider-specific prompts, making the overall system difficult to evolve and nearly impossible to debug.

Cosmisk Creative Studio addresses this challenge by representing every stage of the creative workflow as a sequence of structured intermediate artifacts. Rather than exchanging prompts or model-specific inputs, each service communicates exclusively through canonical JSON schemas. These schemas capture business knowledge, creative intent, execution planning, and generated outputs in a provider-independent format, enabling every module to operate as an isolated, deterministic component.

This document formally defines those schemas. Together they constitute the internal communication protocol of Creative Studio and represent the authoritative specification governing data exchange between all services.

---

# **2\. Introduction**

The Cosmisk Creative Studio Schema Specification defines the canonical data contracts used throughout the Creative Studio architecture. Every service within the platform consumes one or more structured objects, performs a narrowly scoped responsibility, and produces one or more downstream objects. These objects are represented as versioned JSON documents whose structure is independent of any individual provider, model, or implementation language.

Unlike the Architecture document, which focuses on system design and component responsibilities, this specification defines the exact structure, lifecycle, ownership, and validation requirements of every schema used throughout the platform. It serves as the implementation contract between independent services and should be considered the single source of truth for all inter-service communication.

Each schema described within this document is designed to satisfy several architectural objectives. Schemas should be self-contained, human-readable, extensible, and versioned. They should represent complete business concepts rather than fragmented relational records, allowing services to consume coherent objects without requiring extensive database joins or provider-specific transformations. Where appropriate, schemas also serve as persistent knowledge artifacts that may be reused across multiple creative generation workflows.

The schemas described here are intentionally technology-agnostic. Although the reference implementation stores these documents within PostgreSQL JSONB columns and exchanges them through Python services, the schema definitions themselves remain independent of storage engine, programming language, or workflow implementation.

---

# **3\. Related Documents**

This document should be read alongside the companion architecture specification.

| Document | Purpose |
| ----- | ----- |
| **Cosmisk Creative Studio Architecture v2** | Describes the overall system architecture, service responsibilities, workflow orchestration, technology choices, and rationale behind the schemas defined within this specification. |
| *(Future)* **Architecture Decision Records (ADR)** | Documents the reasoning behind major architectural decisions, including repository design, workflow orchestration, storage strategy, and provider selection. |

The Architecture document explains **how the system operates**.

This document explains **how data moves through the system**.

Both documents should be considered complementary and maintained together.

---

# **4\. Scope**

This specification defines the canonical JSON contracts used internally by Creative Studio.

Specifically, this document specifies:

* the purpose of every schema,  
* schema ownership,  
* lifecycle and persistence,  
* producer and consumer relationships,  
* canonical object structures,  
* field definitions,  
* validation rules,  
* API normalization mappings,  
* schema dependencies,  
* versioning strategy,  
* migration principles.

The following topics are intentionally outside the scope of this document:

* workflow orchestration,  
* service implementation,  
* API endpoint definitions,  
* database indexing strategies,  
* prompt engineering,  
* model selection,  
* deployment architecture.

These topics are documented within the companion Architecture Specification.

---

# **5\. Design Philosophy**

The schema system follows a small number of architectural principles that guide every object defined within this specification.

---

## **5.1 Schemas Represent Business Concepts**

Schemas should model meaningful business entities rather than provider responses or database tables.

For example:

* `Product.json` represents a merchant product, **not** a Shopify product payload.  
* `Campaign.json` represents a marketing campaign, **not** a Meta Ads campaign object.  
* `CreativeSpec.json` represents creative intent, **not** an LLM prompt.

Every schema should remain meaningful even if the underlying providers are replaced.

---

## **5.2 Services Exchange Structured Objects**

No service communicates with another through prompts.

Instead:

Service

↓

JSON

↓

Service

↓

JSON

↓

Service

This approach provides:

* deterministic communication,  
* inspectable execution,  
* reproducible workflows,  
* independent testing,  
* provider portability.

---

## **5.3 Schemas Are Self-Contained**

Every schema should contain sufficient information for downstream consumers to understand its meaning without repeatedly querying unrelated objects.

This philosophy intentionally favors moderately larger documents over deeply normalized relational models.

---

## **5.4 Providers Are Implementation Details**

External APIs evolve independently.

Internal schemas should not.

Provider-specific terminology should therefore be translated into Creative Studio terminology during ingestion.

For example:

Shopify Product

↓

Product.json

NOT

ShopifyProduct.json

The remainder of the platform remains isolated from provider changes.

---

## **5.5 Planning Before Execution**

Planning artifacts represent decisions.

Execution artifacts represent work.

Repository objects represent knowledge.

Maintaining these categories separately greatly improves workflow clarity.

---

## **5.6 Explicit Ownership**

Every schema has exactly one producer.

Multiple services may consume the schema.

However, ownership always remains unambiguous.

This prevents conflicting updates and simplifies reasoning about data flow.

---

# **6\. Schema Lifecycle**

Every schema progresses through a predictable lifecycle.

Rather than exchanging raw API responses or prompts, the platform gradually transforms business knowledge into executable work.

External APIs  
      │  
      ▼  
────────────────────────────────────────────  
Repository Objects  
────────────────────────────────────────────

BrandContext.json  
Product.json  
Campaign.json

      │  
      ▼  
────────────────────────────────────────────  
Planning Objects  
────────────────────────────────────────────

CreativeSpec.json

↓

CharacterSheet.json

↓

ShotSpec.json

      │  
      ▼  
────────────────────────────────────────────  
Execution Objects  
────────────────────────────────────────────

GenerationTask.json

      │  
      ▼  
────────────────────────────────────────────  
Output Objects  
────────────────────────────────────────────

AssetManifest.json

QAReport.json

Every transformation narrows the scope of information while increasing execution specificity.

Repository objects describe the business.

Planning objects describe the creative.

Execution objects describe the work.

Output objects describe the results.

---

# **7\. Schema Categories**

To simplify reasoning, all schemas belong to one of four categories.

| Category | Schemas | Persistence | Purpose |
| ----- | ----- | ----- | ----- |
| Repository | BrandContext, Product, Campaign | Persistent | Long-lived business knowledge |
| Planning | CreativeSpec, CharacterSheet, ShotSpec | Persistent | Creative decisions and planning artifacts |
| Execution | GenerationTask | Ephemeral | Worker execution package |
| Output | AssetManifest, QAReport | Persistent | Generated media and validation records |

This categorization is fundamental to the architecture and should remain stable as the platform evolves.

---

# **8\. Schema Conventions**

Every schema defined within this specification follows a common set of structural conventions.

---

## **Naming**

* PascalCase for schema names.  
* camelCase for JSON fields.  
* Arrays use plural nouns.  
* Enums use lowercase strings.  
* Identifiers end with `Id`.

---

## **Dates**

All timestamps use ISO-8601 UTC.

Example:

"createdAt": "2026-07-21T15:42:18Z"

---

## **References**

Objects reference one another through stable identifiers rather than nested duplication wherever practical.

---

## **Optional Fields**

Optional fields should be omitted unless meaningful.

Null values should be avoided unless they represent an explicit unknown state.

---

## **Metadata**

Every schema begins with a common metadata section.

This metadata enables tracing, validation, migration, and auditing across the platform.

---

# **9\. Global Metadata Fields**

Every canonical schema begins with the following metadata block.

{  
  "schemaVersion": "2.0",  
  "objectType": "Product",  
  "id": "prod\_9fd82c",  
  "createdAt": "2026-07-21T15:42:18Z",  
  "updatedAt": "2026-07-21T15:42:18Z",  
  "status": "active",  
  "source": "shopify"  
}

| Field | Description |
| ----- | ----- |
| `schemaVersion` | Canonical schema version. |
| `objectType` | Type of schema represented by the document. |
| `id` | Stable internal identifier. |
| `createdAt` | Creation timestamp (UTC). |
| `updatedAt` | Last modification timestamp (UTC). |
| `status` | Current lifecycle status (active, archived, deleted, etc.). |
| `source` | Originating system (shopify, meta, google, planner, orchestrator, etc.). |

Additional metadata fields may be introduced by individual schemas where appropriate, but this common header provides a consistent foundation across the entire platform.

---

# **10\. ID Strategy**

All object relationships are based on stable internal identifiers rather than provider-specific IDs.

For example:

brandId

productId

campaignId

creativeSpecId

characterId

shotId

generationId

assetId

qaReportId

Provider IDs (such as Shopify product IDs or Meta campaign IDs) are retained within provider metadata for traceability but are never used as primary identifiers within Creative Studio.

This decoupling allows the platform to integrate multiple providers simultaneously without introducing identifier collisions or provider-specific assumptions.

---

# **11\. Versioning Strategy**

Every schema includes a `schemaVersion` field.

Schema versions describe the structure of the object rather than the business data contained within it.

Minor versions (e.g., `2.1`) introduce backward-compatible additions such as new optional fields.

Major versions (e.g., `3.0`) indicate breaking structural changes that require consumer updates or migration logic.

Services should validate supported schema versions before processing incoming objects. Objects using unsupported versions must either be migrated or rejected according to the service's compatibility policy.

---

# **12\. Overall Schema Evolution Diagram**

The following diagram summarizes the complete evolution of data throughout the Creative Studio platform.

External Provider APIs  
        │  
        ▼  
Context Ingestion  
        │  
        ▼  
──────────────────────────────────────────  
Repository Objects  
──────────────────────────────────────────

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
        ▼  
Character Generator  
        │  
        ▼  
CharacterSheet.json  
        │  
        ▼  
Story Planner  
        │  
        ▼  
ShotSpec.json  
        │  
        ▼  
Generation Orchestrator  
        │  
        ▼  
GenerationTask.json  
        │  
        ▼  
Image / Video / Voice Workers  
        │  
        ▼  
Product Replacement  
        │  
        ▼  
Quality Assurance  
        │  
        ▼  
AssetManifest.json  
QAReport.json

This diagram represents the canonical transformation pipeline used throughout Creative Studio. Every subsequent chapter in this specification elaborates on one or more of these schemas, defining their structure, lifecycle, validation rules, and role within the broader architecture.

# **13\. BrandContext.json**

## **Purpose**

BrandContext represents the long-term identity of a merchant within Creative Studio. It consolidates branding information, business metadata, creative guidelines, audience definitions, and persistent marketing knowledge into a single canonical object.

Unlike campaign or product data, BrandContext changes relatively infrequently and serves as the foundational knowledge source for all creative planning workflows.

The object intentionally abstracts provider-specific implementations and instead models how Creative Studio understands a brand.

---

## **Ownership**

| Property | Value |
| ----- | ----- |
| Producer | Context Ingestion Layer |
| Primary Consumers | Creative Intelligence Engine |
| Secondary Consumers | Character Generator, Story Planner |
| Storage | PostgreSQL JSONB |
| Lifecycle | Persistent |
| Update Strategy | Incremental Synchronization |

BrandContext is **read-only** outside the Context Ingestion Layer.

No downstream service may modify this object.

---

## **Lifecycle**

Merchant Connects Shopify

↓

Merchant Connects Meta Ads

↓

Merchant Connects Google Ads

↓

Context Ingestion

↓

BrandContext.json Created

↓

Periodic Synchronization

↓

BrandContext Updated

↓

Consumed by Planning Services

Unlike execution artifacts, BrandContext is designed to persist across many advertisement generation sessions.

---

## **Responsibilities**

BrandContext stores information that describes the merchant rather than any individual advertisement.

Examples include:

* brand identity  
* tone of voice  
* target audience  
* positioning  
* visual style  
* messaging guidelines  
* creative preferences  
* historical marketing learnings

It intentionally excludes:

* products  
* campaigns  
* generated assets  
* execution metadata

These belong to separate schemas.

---

# **High-Level Structure**

BrandContext

├── Metadata

├── Business

├── Branding

├── Audience

├── Creative Guidelines

├── Historical Learnings

├── Platform Connections

├── User Preferences

└── Embeddings

---

# **JSON Structure**

{  
  "schemaVersion": "2.0",

  "objectType": "BrandContext",

  "id": "brand\_xxx",

  "createdAt": "...",

  "updatedAt": "...",

  "status": "active",

  "business": {},

  "branding": {},

  "audience": {},

  "creativeGuidelines": {},

  "historicalInsights": {},

  "platformConnections": {},

  "userPreferences": {},

  "embeddings": {}  
}

---

# **Field Definitions**

## **business**

General merchant information.

| Field | Type | Description |
| ----- | ----- | ----- |
| brandName | string | Public-facing brand name |
| legalName | string | Registered business name |
| website | string | Primary storefront URL |
| industry | string | Primary business category |
| subIndustry | string | Optional niche |
| description | string | Short business description |

---

## **branding**

Represents the brand identity.

| Field | Type |
| ----- | ----- |
| positioning | string |
| toneOfVoice | string |
| personality | array\[string\] |
| values | array\[string\] |
| colorPalette | array\[string\] |
| typography | array\[string\] |
| tagline | string |

Example

{  
  "positioning": "Affordable Luxury",

  "toneOfVoice": "Confident",

  "personality": \[  
    "Modern",  
    "Minimal",  
    "Premium"  
  \]  
}

---

## **audience**

Defines the intended customer.

{  
  "primaryAgeRange": "22-35",

  "gender": "all",

  "locations": \[  
    "India"  
  \],

  "interests": \[  
    "Fashion",  
    "Streetwear"  
  \],

  "incomeLevel": "Mid Premium"  
}

---

## **creativeGuidelines**

Stores persistent creative direction.

Example fields

| Field | Description |
| ----- | ----- |
| preferredStyles | Long-term preferred aesthetics |
| avoidStyles | Creative styles to avoid |
| preferredPlatforms | Instagram, Facebook, etc. |
| preferredLighting | Natural, Studio, Cinematic |
| preferredCameraStyle | Handheld, Static |
| preferredColorMood | Warm, Cool, Neutral |

These are **long-term** preferences.

Session-specific preferences belong elsewhere.

---

## **historicalInsights**

Contains distilled marketing learnings.

Unlike Campaign.json, which stores campaign-level information, this section stores reusable knowledge.

Example

{  
  "winningHooks": \[

    "This went viral",

    "POV:",

    "Nobody tells you this"

  \],

  "bestPerformingCTA": "Shop Now",

  "highestCTRPlatform": "Instagram",

  "notes": \[

    "UGC outperforms polished studio videos"

  \]  
}

This object is periodically updated after campaign synchronization.

---

## **platformConnections**

Records connected external providers.

{  
  "shopify": {

    "connected": true,

    "lastSync": "...",

    "storeId": "..."  
  },

  "meta": {

    "connected": true

  },

  "googleAds": {

    "connected": true

  }  
}

Only synchronization metadata is stored here.

Raw provider payloads are never embedded.

---

## **userPreferences**

Stores merchant-defined creative defaults.

Unlike creativeGuidelines (which describe the brand), these fields describe how the merchant prefers Creative Studio to behave.

Example

{  
  "defaultAspectRatio": "9:16",

  "defaultLanguage": "English",

  "defaultPlatform": "Instagram",

  "allowExperimentalStyles": false,

  "defaultVoiceGender": "Female"  
}

These settings are optional.

Generation-specific preferences supplied during an individual request are **not** persisted here.

---

## **embeddings**

Stores semantic representations.

{  
  "brandEmbedding": "...",

  "creativeEmbedding": "...",

  "audienceEmbedding": "..."  
}

These embeddings support similarity retrieval within PostgreSQL pgvector.

---

# **Relationships**

BrandContext is referenced by:

CreativeSpec

↓

CharacterSheet

↓

ShotSpec

It is never referenced directly by generation workers.

Planning services derive all required information before execution begins.

---

# **Validation Rules**

A valid BrandContext object must satisfy the following constraints.

### **Required**

* brandName  
* industry  
* branding  
* audience  
* platformConnections

---

### **Recommended**

* positioning  
* toneOfVoice  
* preferredStyles  
* winningHooks

---

### **Constraints**

Exactly one:

* brandName

At least one connected platform:

* Shopify

or

* Meta

or

* Google Ads

Embeddings are optional but recommended once sufficient historical data exists.

---

# **Update Strategy**

BrandContext is updated through incremental synchronization.

Examples include:

* merchant changes brand description,  
* new preferred style is configured,  
* Meta synchronization updates historical learnings,  
* Google Ads synchronization identifies new successful messaging.

Updates should modify only affected sections rather than replacing the entire document.

---

# **Example Object**

BrandContext  
│  
├── Business  
├── Branding  
├── Audience  
├── Creative Guidelines  
├── Historical Insights  
├── Platform Connections  
├── User Preferences  
└── Embeddings

The complete JSON example is intentionally omitted from this section for readability and is provided in **Appendix D — Complete Schema Examples**, where all canonical objects are shown in full.

---

# **Future Extensions**

BrandContext has been intentionally designed to support future expansion without requiring structural redesign.

Potential additions include:

* multilingual branding guidelines,  
* regional audience segmentation,  
* seasonal creative preferences,  
* influencer partnerships,  
* competitor insights,  
* brand safety rules,  
* legal or regulatory constraints,  
* sustainability messaging,  
* AI-generated brand summaries.

As these additions describe persistent characteristics of the brand rather than individual campaigns or generation sessions, they naturally belong within BrandContext and can be introduced as backward-compatible schema extensions.

---

# **14\. Product.json**

## **Purpose**

Product represents a merchant product within Creative Studio and serves as the authoritative source of truth for all product-related information used throughout the creative generation pipeline.

Unlike Shopify's product model, which is primarily designed for e-commerce operations, Product is optimized for AI-driven media generation. It combines commercial metadata, visual assets, computer vision outputs, semantic representations, and generation-ready references into a single canonical object.

Every advertisement generated by Creative Studio references exactly one Product object.

---

## **Ownership**

| Property | Value |
| ----- | ----- |
| Producer | Context Ingestion Layer |
| Secondary Producers | Product Asset Pipeline |
| Primary Consumers | Creative Intelligence Engine |
| Secondary Consumers | Image Pipeline, Video Pipeline, Product Replacement Pipeline |
| Storage | PostgreSQL JSONB |
| Asset Storage | Cloudflare R2 |
| Lifecycle | Persistent |
| Update Strategy | Incremental Synchronization |

Unlike BrandContext, Product has two producers.

The Context Ingestion Layer creates the base object from Shopify, while the Product Asset Pipeline enriches it by generating cutouts, masks, embeddings, and other AI-specific assets.

Neither planning services nor generation workers modify Product.

---

# **Lifecycle**

Shopify Product

↓

Context Ingestion

↓

Product.json

↓

Asset Processing

↓

Cutouts

Masks

Embeddings

Placement Assets

↓

Cloudflare R2

↓

Product.json Updated

↓

Creative Planning

↓

Generation

Unlike execution artifacts, Product evolves over time as additional derived assets become available.

---

# **Responsibilities**

Product represents everything Creative Studio knows about a product.

It stores:

* Shopify metadata  
* pricing  
* variants  
* collections  
* original media  
* isolated product assets  
* segmentation outputs  
* embeddings  
* placement assets  
* generation metadata

It intentionally does **not** contain:

* campaign performance  
* creative planning  
* generated advertisements  
* QA results

Those belong elsewhere.

---

# **High-Level Structure**

Product

├── Metadata

├── Shopify

├── Commercial

├── Variants

├── Collections

├── Original Assets

├── Derived Assets

├── Placement Assets

├── AI Metadata

├── Embeddings

└── Provider Metadata

---

# **JSON Structure**

{

  "schemaVersion": "2.0",

  "objectType": "Product",

  "id": "product\_xxx",

  "createdAt": "...",

  "updatedAt": "...",

  "status": "active",

  "shopify": {},

  "commercial": {},

  "variants": \[\],

  "collections": \[\],

  "originalAssets": {},

  "derivedAssets": {},

  "placementAssets": {},

  "aiMetadata": {},

  "embeddings": {},

  "providerMetadata": {}

}

---

# **Field Definitions**

## **shopify**

Contains normalized Shopify information.

| Field | Description |
| ----- | ----- |
| shopifyProductId | Original Shopify ID |
| handle | Shopify handle |
| vendor | Vendor |
| productType | Product category |
| tags | Shopify tags |
| status | Active/Draft |

---

## **commercial**

Represents merchant-facing information.

{

    "title": "...",

    "description": "...",

    "price": "...",

    "currency": "INR",

    "compareAtPrice": "...",

    "availability": "in\_stock"

}

This section is used heavily during creative planning.

---

## **variants**

One object per Shopify variant.

Each variant contains:

* variant ID  
* SKU  
* option values  
* inventory  
* pricing  
* image reference

The complete variant payload is intentionally preserved because fashion products often require size- and colour-specific creatives.

---

## **collections**

Stores collection membership.

Example

\[

    "Summer Collection",

    "Premium Collection",

    "Best Sellers"

\]

Collections provide useful semantic context during planning.

---

# **Original Assets**

This section references merchant media exactly as received from Shopify.

Original Assets

├── Images

├── Videos

├── Featured Asset

└── Thumbnails

Each asset stores:

* R2 URL  
* dimensions  
* MIME type  
* upload timestamp  
* checksum

Creative Studio never edits original assets.

---

# **Derived Assets**

This is where Creative Studio begins adding value.

Derived assets are generated internally.

Derived Assets

├── Transparent Cutout

├── Garment Mask

├── Alpha Mask

├── Bounding Box

├── Dominant Colours

├── Texture Analysis

├── Material Classification

These are produced automatically after ingestion.

---

## **Transparent Cutout**

Generated using

BiRefNet

The transparent cutout becomes the canonical product asset used throughout the generation pipeline.

Rather than repeatedly processing Shopify images, downstream services always reference this precomputed cutout.

---

## **Garment Mask**

Represents the exact product pixels.

Unlike the transparent PNG, this object contains segmentation metadata useful for placement.

Typical fields include:

* mask URI  
* dimensions  
* segmentation confidence  
* generation model  
* creation timestamp

---

## **Placement Assets**

Contains everything required by BRIA Product Shot.

Placement Assets

├── Product Cutout

├── Preferred Anchor Points

├── Scale Hints

├── Placement Metadata

└── Rendering Constraints

These assets are optimized specifically for product replacement.

---

# **AI Metadata**

Stores machine-generated product descriptors.

Example

{

    "category": "Suit",

    "style": "Luxury",

    "material": "Linen",

    "fit": "Slim",

    "season": "Summer",

    "gender": "Menswear"

}

These descriptors are produced through vision models and are intended for creative planning rather than commerce.

---

# **Embeddings**

Semantic representations stored using pgvector.

Embeddings

├── Product

├── Visual

├── Marketing

└── Style

Different embeddings support different retrieval tasks.

For example:

Product embedding

→ Similar products

Visual embedding

→ Similar appearance

Marketing embedding

→ Similar messaging

Style embedding

→ Similar aesthetics

---

# **Provider Metadata**

Stores provider-specific information required for synchronization.

Examples include:

* Shopify GraphQL IDs  
* ETags  
* Sync timestamps  
* Webhook metadata  
* API version

No downstream service should depend on this section.

---

# **Relationships**

Product

↓

CreativeSpec

↓

GenerationTask

↓

Image Pipeline

↓

Video Pipeline

↓

Product Replacement

Product is one of the few repository objects referenced throughout nearly every stage of the system.

---

# **Validation Rules**

### **Required**

* title  
* price  
* at least one original image  
* transparent cutout  
* commercial section

---

### **Recommended**

* embeddings  
* garment mask  
* AI metadata  
* dominant colours

---

### **Constraints**

Exactly one featured asset.

At least one original image.

Every original asset must have an R2 reference.

Every cutout must reference an originating original image.

Every placement asset must correspond to a valid transparent cutout.

---

# **Update Strategy**

Product is updated incrementally through two independent processes.

**Commerce synchronization** updates merchant-owned fields such as pricing, descriptions, variants, collections, and availability.

**Asset enrichment** updates AI-generated fields such as cutouts, segmentation masks, embeddings, colour analysis, and placement metadata.

These update streams operate independently but converge into the same canonical Product object.

---

# **Shopify Mapping**

The Context Ingestion Layer maps Shopify resources into Product as follows.

| Shopify | Product.json |
| ----- | ----- |
| Product | commercial |
| Product Status | shopify.status |
| Product Type | shopify.productType |
| Vendor | shopify.vendor |
| Tags | shopify.tags |
| Variants | variants |
| Collections | collections |
| Media | originalAssets |
| Featured Media | originalAssets.featured |
| Metafields | providerMetadata.metafields |

The mapping deliberately normalizes Shopify terminology into Creative Studio concepts while retaining provider metadata for synchronization and traceability.

---

# **Future Extensions**

The Product schema is intentionally extensible and can accommodate future AI capabilities without structural redesign.

Potential additions include:

* multi-view 3D product reconstructions,  
* physics simulation parameters for cloth draping,  
* try-on compatibility metadata,  
* material property estimation,  
* garment keypoints,  
* product-specific safety constraints,  
* regional pricing and localization,  
* product lifecycle analytics,  
* multimodal retrieval embeddings.

As Creative Studio evolves, Product will remain the canonical representation of merchant products, allowing new AI capabilities to build upon an already enriched product object rather than introducing additional repositories or duplicate asset stores.

Perfect. This is the last repository schema. Unlike `BrandContext` and `Product`, this one is **not** trying to store the entirety of Meta Ads or Google Ads. Its purpose is to distill historical advertising performance into reusable marketing knowledge for the planner.

That's an important distinction: **Campaign.json is a creative intelligence object, not an analytics warehouse.**

---

# **15\. Campaign.json**

## **Purpose**

Campaign represents the historical advertising knowledge available to Creative Studio for a particular marketing campaign. It consolidates campaign metadata, creative assets, audience information, performance metrics, and distilled learnings from advertising platforms into a normalized representation optimized for creative planning.

Unlike provider-specific campaign models, Campaign is designed to answer questions relevant to advertisement generation rather than campaign management. It captures *what worked*, *why it worked*, and *how future creatives can benefit* from historical performance.

Campaign objects provide the Creative Intelligence Engine with historical context, enabling it to generate advertisements that align with proven creative strategies instead of relying solely on inference.

---

# **Ownership**

| Property | Value |
| ----- | ----- |
| Producer | Context Ingestion Layer |
| Primary Consumers | Creative Intelligence Engine |
| Secondary Consumers | Analytics (Future) |
| Storage | PostgreSQL JSONB |
| Lifecycle | Persistent |
| Update Strategy | Incremental Synchronization |

Campaign objects are immutable outside the Context Ingestion Layer.

Planning services consume campaign knowledge but never modify it.

---

# **Lifecycle**

Meta Ads

\+

Google Ads

↓

Context Ingestion

↓

Normalization

↓

Campaign.json

↓

Historical Analysis

↓

Creative Planning

Campaign objects are synchronized periodically as advertising platforms accumulate new performance data.

---

# **Responsibilities**

Campaign stores information describing historical marketing activity.

It contains:

* campaign metadata,  
* platform information,  
* creative summaries,  
* audience definitions,  
* performance metrics,  
* reusable creative learnings.

It intentionally excludes:

* raw provider payloads,  
* generated advertisements,  
* planning decisions,  
* execution artifacts,  
* product assets.

---

# **High-Level Structure**

Campaign

├── Metadata

├── Campaign Info

├── Platforms

├── Products

├── Audience

├── Creative Summary

├── Performance

├── Learnings

├── Assets

├── Embeddings

└── Provider Metadata

---

# **JSON Structure**

{

  "schemaVersion": "2.0",

  "objectType": "Campaign",

  "id": "campaign\_xxx",

  "createdAt": "...",

  "updatedAt": "...",

  "status": "active",

  "campaignInfo": {},

  "platforms": {},

  "products": \[\],

  "audience": {},

  "creativeSummary": {},

  "performance": {},

  "learnings": {},

  "assets": {},

  "embeddings": {},

  "providerMetadata": {}

}

---

# **Field Definitions**

## **campaignInfo**

Represents the campaign itself.

| Field | Description |
| ----- | ----- |
| campaignName | Internal campaign name |
| objective | Sales, Awareness, Leads, etc. |
| startDate | Campaign start |
| endDate | Campaign end |
| status | Active, Paused, Completed |
| budget | Campaign budget |
| currency | Currency |

---

## **platforms**

Describes where the campaign was executed.

Example

{

  "meta": true,

  "googleAds": true,

  "instagram": true,

  "facebook": true

}

This allows planners to identify platform-specific historical trends.

---

## **products**

References the Product objects promoted within the campaign.

\[

    "product\_01",

    "product\_02"

\]

Campaigns may promote multiple products.

Relationships remain identifier-based rather than embedding Product objects.

---

## **audience**

Normalized audience information.

Example

{

    "ageRange": "22-35",

    "gender": "all",

    "locations": \[

        "India"

    \],

    "interests": \[

        "Fashion",

        "Premium Clothing"

    \]

}

This section intentionally abstracts provider-specific audience targeting.

---

# **Creative Summary**

One of the most important sections.

Rather than storing every advertisement, Creative Studio stores reusable creative observations.

Example

{

    "primaryHook":

    "POV: You finally found the perfect suit.",

    "creativeStyle":

    "Luxury UGC",

    "visualStyle":

    "Natural Lighting",

    "cameraStyle":

    "Handheld",

    "voiceStyle":

    "Conversational",

    "cta":

    "Shop Now"

}

This information feeds directly into CreativeSpec generation.

---

# **Performance**

Performance is summarized rather than exhaustively stored.

Example

{

    "impressions": 812341,

    "clicks": 45182,

    "ctr": 5.56,

    "conversions": 3021,

    "roas": 6.1,

    "cpa": 118.42

}

The objective is to expose planning-relevant metrics rather than replace analytics platforms.

---

# **Learnings**

Perhaps the most valuable section.

This captures insights distilled from campaign history.

Example

{

    "winningHooks": \[

        "Nobody tells you this...",

        "POV:",

        "This changed everything"

    \],

    "bestThumbnail":

    "Close-up with direct eye contact",

    "bestOpeningDuration":

    2.0,

    "recommendedVideoLength":

    10,

    "notes": \[

        "Natural lighting consistently outperformed studio lighting.",

        "Handheld camera movement improved engagement."

    \]

}

Unlike raw metrics, these observations directly influence creative planning.

---

# **Assets**

Campaign stores lightweight references to historically successful creatives.

Assets

├── Images

├── Videos

├── Headlines

├── Descriptions

└── Landing Pages

Only metadata and storage references are retained.

Large media assets remain in Cloudflare R2.

---

# **Embeddings**

Semantic representations generated from historical campaign data.

Embeddings

├── Messaging

├── Creative

├── Audience

└── Performance

These support similarity retrieval during planning.

For example:

* campaigns with similar audiences,  
* campaigns with similar hooks,  
* campaigns with similar visual styles,  
* campaigns with similar objectives.

---

# **Provider Metadata**

Stores synchronization metadata.

Examples include:

* Meta campaign ID,  
* Google campaign ID,  
* synchronization timestamps,  
* API version,  
* webhook state.

Planning services should never depend on these fields.

---

# **Relationships**

Campaign

↓

CreativeSpec

↓

GenerationTask

Campaign is consumed only during planning.

Execution workers never reference Campaign directly.

---

# **Validation Rules**

### **Required**

* campaignName  
* objective  
* platform information  
* performance  
* creativeSummary

---

### **Recommended**

* learnings  
* audience  
* embeddings

---

### **Constraints**

At least one connected advertising platform.

At least one historical creative.

Performance metrics must correspond to the same reporting period.

Every referenced Product must exist within the Product Repository.

---

# **Update Strategy**

Campaign is synchronized independently from BrandContext and Product.

Updates occur when:

* new campaign metrics become available,  
* advertisements are added or removed,  
* campaign status changes,  
* additional performance history is collected.

The synchronization process updates only the affected sections while preserving stable identifiers.

---

# **Meta Ads Mapping**

The Context Ingestion Layer normalizes Meta Ads resources into Campaign as follows.

| Meta Ads | Campaign.json |
| ----- | ----- |
| Campaign | campaignInfo |
| Objective | campaignInfo.objective |
| Ad Sets | audience |
| Ads | assets |
| Ad Creatives | creativeSummary |
| Insights | performance |
| Metrics | performance |
| Campaign Status | campaignInfo.status |

---

# **Google Ads Mapping**

Google Ads data is similarly normalized.

| Google Ads | Campaign.json |
| ----- | ----- |
| Campaign | campaignInfo |
| Campaign Status | campaignInfo.status |
| Asset Groups | assets |
| Ads | assets |
| Audience Signals | audience |
| Metrics | performance |
| Performance Max Assets | creativeSummary |

Provider-specific naming differences are resolved during ingestion, ensuring downstream planning services operate exclusively on Creative Studio terminology.

---

# **Future Extensions**

Campaign has been designed to evolve alongside Creative Studio's creative intelligence capabilities.

Potential future additions include:

* A/B test outcomes,  
* audience segment performance,  
* seasonal campaign trends,  
* creative fatigue indicators,  
* platform-specific optimization recommendations,  
* attribution summaries,  
* competitor benchmarking,  
* automated creative scoring,  
* reinforcement learning signals.

As these enhancements describe historical marketing performance rather than execution workflows, they naturally extend the Campaign schema while preserving its role as the platform's canonical repository of advertising intelligence.

---

# **16\. CreativeSpec.json**

## **Purpose**

CreativeSpec represents the complete creative intent for a single advertisement generation request. It is the primary output of the Creative Intelligence Engine and serves as the canonical planning artifact consumed by all downstream planning and generation services.

Unlike repository objects, which describe persistent business knowledge, CreativeSpec represents a point-in-time creative decision. It combines brand identity, product information, historical campaign learnings, and user-specified creative preferences into a unified specification describing *what advertisement should be produced*.

CreativeSpec intentionally contains no provider-specific implementation details, prompts, or generation parameters. Instead, it describes the advertisement from a creative and marketing perspective, allowing downstream systems to independently determine how that intent should be realized.

Every advertisement generation request produces exactly one CreativeSpec object.

---

# **Ownership**

| Property | Value |
| ----- | ----- |
| Producer | Creative Intelligence Engine |
| Primary Consumers | Character Generator, Story Planner |
| Secondary Consumers | Generation Orchestrator |
| Storage | PostgreSQL JSONB |
| Lifecycle | Persistent |
| Generation Frequency | One per generation request |

CreativeSpec is immutable once generated.

If a user modifies the creative direction, a new CreativeSpec is produced rather than editing the existing one.

---

# **Lifecycle**

BrandContext

\+

Product

\+

Campaign

\+

Generation Request

↓

Creative Intelligence Engine

↓

CreativeSpec.json

↓

Character Generator

↓

Story Planner

↓

Generation

CreativeSpec represents the first object generated entirely by reasoning rather than ingestion.

---

# **Responsibilities**

CreativeSpec answers the fundamental creative questions required before media generation begins.

Specifically:

* What are we advertising?  
* Why are we advertising it?  
* Who is the audience?  
* What message should viewers remember?  
* What emotional response should be created?  
* What visual style should be used?  
* Which platform is the advertisement intended for?  
* What should the viewer do afterwards?

It intentionally does **not** specify:

* camera positions,  
* shot breakdowns,  
* dialogue,  
* character appearance,  
* prompts,  
* model parameters.

Those belong to downstream planning components.

---

# **High-Level Structure**

CreativeSpec

├── Metadata

├── Generation Context

├── Marketing Objective

├── Product Selection

├── Audience

├── Messaging

├── Creative Direction

├── Platform

├── Voice Strategy

├── Constraints

└── References

---

# **JSON Structure**

{

  "schemaVersion": "2.0",

  "objectType": "CreativeSpec",

  "id": "creative\_xxx",

  "createdAt": "...",

  "status": "completed",

  "generationContext": {},

  "marketingObjective": {},

  "product": {},

  "audience": {},

  "messaging": {},

  "creativeDirection": {},

  "platform": {},

  "voiceStrategy": {},

  "constraints": {},

  "references": {}

}

---

# **Field Definitions**

## **generationContext**

Describes why this CreativeSpec exists.

{

    "generationId": "...",

    "requestedBy": "...",

    "creativePreference":

    "Luxury handheld UGC",

    "requestedPlatform":

    "Instagram",

    "language":

    "English"

}

This section captures request-specific information supplied by the user.

Unlike BrandContext, these values are **not persistent** across future advertisements.

---

## **marketingObjective**

Defines the business objective.

Example

{

    "objective": "Conversions",

    "primaryGoal":

    "Increase purchases",

    "secondaryGoal":

    "Increase brand recall",

    "successMetric":

    "CTR"

}

The objective guides all downstream creative decisions.

---

## **product**

References the selected product.

{

    "productId":

    "product\_128",

    "reason":

    "Highest performing premium product",

    "priority":

    "Primary"

}

The planner selects exactly one product.

Execution workers retrieve the complete Product object separately.

---

## **audience**

Represents the intended viewer.

{

    "persona":

    "Young professionals",

    "ageRange":

    "24-35",

    "painPoints": \[

        "Finding premium formal wear",

        "Looking stylish at work"

    \],

    "motivations": \[

        "Confidence",

        "Luxury",

        "Professional appearance"

    \]

}

This audience description drives both messaging and character generation.

---

# **Messaging**

Perhaps the most important section.

It defines *what should be communicated*, not *how*.

Example

{

    "coreMessage":

    "Premium tailoring made effortless.",

    "hook":

    "POV: You finally found a suit that actually fits.",

    "supportingPoints": \[

        "Premium linen",

        "Comfortable",

        "Luxury finish"

    \],

    "cta":

    "Shop Now"

}

Story Planner later converts these concepts into dialogue.

---

# **Creative Direction**

This section defines the overall artistic vision.

{

    "style":

    "Luxury UGC",

    "visualMood":

    "Warm",

    "lighting":

    "Soft Natural",

    "cameraStyle":

    "Handheld",

    "editingStyle":

    "Minimal",

    "pacing":

    "Fast"

}

Notice that this is still conceptual.

It does not specify individual shots.

---

# **Platform**

Defines platform-specific optimization.

Example

{

    "platform":

    "Instagram",

    "aspectRatio":

    "9:16",

    "maxDuration":

    10,

    "safeMargins":

    true

}

Future platform-specific optimizations can be introduced without modifying downstream schemas.

---

# **Voice Strategy**

Determines how the advertisement should sound.

Example

{

    "tone":

    "Conversational",

    "energy":

    "High",

    "voiceGender":

    "Female",

    "delivery":

    "Authentic UGC"

}

The Voice Pipeline later transforms this into synthesized narration.

---

# **Constraints**

Defines planning constraints.

Example

{

    "maxShots": 3,

    "productMustAppear": true,

    "showBrandLogo": false,

    "avoidTextHeavyFrames": true

}

Constraints are enforced by downstream planners.

---

# **References**

Maintains traceability.

{

    "brandId": "...",

    "campaignIds": \[

        "...",

        "..."

    \],

    "productId": "...",

    "requestId": "..."

}

No business data is duplicated here.

Only identifiers.

---

# **Relationships**

BrandContext

      │

Product

      │

Campaign

      │

Generation Request

      │

      ▼

CreativeSpec

      │

 ┌────┴─────┐

 ▼          ▼

Character   Story

Generator   Planner

CreativeSpec is the root planning object.

Everything else derives from it.

---

# **Validation Rules**

### **Required**

* generationContext  
* marketingObjective  
* product  
* audience  
* messaging  
* creativeDirection  
* platform  
* voiceStrategy

---

### **Constraints**

Exactly one product.

Exactly one primary objective.

Exactly one CTA.

Maximum duration must equal platform limits.

Creative preference must always be present.

Language must always be specified.

---

# **Update Strategy**

CreativeSpec is immutable.

If any planning input changes—including:

* selected product,  
* creative preference,  
* target platform,  
* audience,  
* campaign objective,

a completely new CreativeSpec is generated.

This immutability guarantees reproducibility, auditability, and simplifies downstream caching.

---

# **Example Object**

CreativeSpec

│

├── Generation Context

├── Marketing Objective

├── Product

├── Audience

├── Messaging

├── Creative Direction

├── Platform

├── Voice Strategy

├── Constraints

└── References

The full canonical JSON example is provided in **Appendix D — Complete Schema Examples**.

---

# **Future Extensions**

CreativeSpec is intentionally positioned as the central planning contract and is expected to evolve as Creative Studio's creative capabilities expand.

Future additions may include:

* platform-specific creative variants,  
* multilingual messaging plans,  
* regulatory and compliance requirements,  
* seasonal campaign themes,  
* localization strategies,  
* experimentation metadata for A/B testing,  
* personalization directives,  
* creative confidence scores.

These extensions preserve CreativeSpec's role as the definitive expression of creative intent while allowing the planning engine to incorporate increasingly sophisticated reasoning without impacting downstream execution contracts.

---

## **One architectural improvement I'd recommend**

Now that we've fully specified `CreativeSpec`, I'd make one small but meaningful enhancement to the remaining planning schemas:

Instead of each downstream schema having its own independent `id`, I'd add a **`creativeSpecId`** reference to **CharacterSheet**, **ShotSpec**, **GenerationTask**, **AssetManifest**, and **QAReport**.

That creates a stable lineage for every artifact produced during a generation request:

CreativeSpec (creative\_001)

        │

        ├── CharacterSheet

        ├── ShotSpec

        ├── GenerationTask

        ├── AssetManifest

        └── QAReport

This makes it trivial to trace every generated asset, QA result, and execution task back to the exact creative decision that produced it, which is valuable for debugging, analytics, and future performance feedback loops. I think it's a worthwhile addition to the schema design.

---

# **17\. CharacterSheet.json**

## **Purpose**

CharacterSheet represents the canonical identity of the human subject appearing within an advertisement. It is the primary output of the Character Generator and serves as the authoritative source of visual identity for all downstream image and video generation tasks.

Modern multimodal generation models often struggle to maintain consistent identity across independently generated images and videos. Creative Studio addresses this limitation by generating a reusable CharacterSheet before any media synthesis occurs.

Rather than repeatedly describing a person through prompts, downstream services consume a structured identity package containing physical characteristics, personality traits, reference assets, and conditioning metadata.

Every advertisement generation request produces exactly one CharacterSheet.

---

# **Ownership**

| Property | Value |
| ----- | ----- |
| Producer | Character Generator |
| Primary Consumers | Story Planner |
| Secondary Consumers | Image Pipeline, Video Pipeline |
| Storage | PostgreSQL JSONB |
| Asset Storage | Cloudflare R2 |
| Lifecycle | Persistent |
| Parent Object | CreativeSpec |

CharacterSheet is immutable.

If the creative direction changes sufficiently to require a different spokesperson, an entirely new CharacterSheet is generated.

---

# **Lifecycle**

CreativeSpec

↓

Character Generator

↓

CharacterSheet.json

↓

Reference Portrait Generation

↓

Cloudflare R2

↓

Story Planner

↓

Image Generation

↓

Video Generation

Character generation occurs exactly once per advertisement.

Every downstream generation task references the same CharacterSheet.

---

# **Responsibilities**

CharacterSheet defines everything required to consistently recreate the same person across multiple independent generation tasks.

It contains:

* identity  
* demographics  
* physical appearance  
* expressions  
* personality  
* speaking characteristics  
* wardrobe guidance  
* reference assets  
* conditioning metadata

It intentionally excludes:

* dialogue  
* shot information  
* camera instructions  
* product placement  
* prompts

---

# **High-Level Structure**

CharacterSheet

├── Metadata

├── Identity

├── Appearance

├── Wardrobe

├── Personality

├── Expressions

├── Speaking Style

├── Reference Assets

├── Conditioning

└── References

---

# **JSON Structure**

{

  "schemaVersion": "2.0",

  "objectType": "CharacterSheet",

  "id": "character\_xxx",

  "creativeSpecId": "...",

  "createdAt": "...",

  "status": "completed",

  "identity": {},

  "appearance": {},

  "wardrobe": {},

  "personality": {},

  "expressions": {},

  "speakingStyle": {},

  "referenceAssets": {},

  "conditioning": {},

  "references": {}

}

---

# **Field Definitions**

## **identity**

Represents high-level demographic information.

Example

{

    "gender": "Female",

    "approximateAge": 27,

    "ethnicity": "South Asian",

    "role": "Young Professional",

    "occupationStyle": "Corporate"

}

These values guide casting rather than exact appearance.

---

## **appearance**

Defines stable physical characteristics.

Example

{

    "hair": {

        "color": "Dark Brown",

        "length": "Shoulder Length",

        "style": "Straight"

    },

    "eyes": {

        "color": "Brown"

    },

    "skinTone": "Medium",

    "bodyType": "Average",

    "facialFeatures": \[

        "Sharp Jawline",

        "Defined Eyebrows",

        "Friendly Smile"

    \]

}

These attributes should remain constant across every generated asset.

---

# **Wardrobe**

One important clarification.

**Wardrobe does NOT describe the advertised product.**

Instead, it defines everything else the character wears.

Example

{

    "style": "Minimal Premium",

    "accessories": \[

        "Watch"

    \],

    "footwear": "White Sneakers",

    "avoid": \[

        "Bright Logos",

        "Busy Patterns"

    \]

}

The advertised garment comes from Product.json.

This separation prevents conflicts during product replacement.

---

# **Personality**

Defines behavioural characteristics.

Example

{

    "traits": \[

        "Confident",

        "Approachable",

        "Authentic"

    \],

    "energy": "High",

    "cameraComfort": "Natural",

    "overallPresence": "Premium UGC Creator"

}

Personality influences expressions and voice delivery.

---

# **Expressions**

Defines permissible facial expressions.

Example

{

    "default": "Smile",

    "allowed": \[

        "Smile",

        "Curious",

        "Excited",

        "Confident"

    \],

    "avoid": \[

        "Angry",

        "Confused"

    \]

}

Maintaining a bounded expression set improves consistency across shots.

---

# **Speaking Style**

Defines how the character communicates.

Example

{

    "pace": "Conversational",

    "tone": "Friendly",

    "energy": "High",

    "delivery": "Authentic UGC",

    "accent": "Neutral Indian English"

}

This information is consumed by the Voice Pipeline.

---

# **Reference Assets**

Perhaps the most important section.

Rather than storing descriptive text alone, CharacterSheet references generated conditioning assets.

Reference Assets

├── Primary Portrait

├── Side Profile

├── Three-Quarter Portrait

├── Neutral Expression

└── Smile Expression

Every asset is stored in Cloudflare R2.

---

## **Primary Portrait**

The primary portrait serves as the canonical identity reference.

{

    "assetId": "...",

    "r2Uri": "...",

    "resolution": "1024x1024",

    "isPrimary": true

}

All downstream image and video generation tasks receive this portrait.

---

# **Conditioning**

This section stores generation-specific identity information.

Example

{

    "seed": 873621,

    "identityVersion": 1,

    "conditioningStrength": 0.85,

    "referenceStrategy": "portrait"

}

This allows future model adapters to maintain identity consistently while remaining provider-independent.

---

# **References**

Maintains lineage.

{

    "creativeSpecId": "...",

    "brandId": "...",

    "generationId": "..."

}

---

# **Relationships**

CreativeSpec

      │

      ▼

CharacterSheet

      │

 ┌────┴─────┐

 ▼          ▼

Image      Video

Pipeline   Pipeline

CharacterSheet is never consumed directly by repository services.

It exists solely to maintain identity throughout media generation.

---

# **Validation Rules**

### **Required**

* identity  
* appearance  
* personality  
* referenceAssets.primaryPortrait  
* speakingStyle

---

### **Recommended**

* side profile  
* three-quarter portrait  
* multiple expressions  
* conditioning metadata

---

### **Constraints**

Exactly one primary portrait.

At least one facial expression.

Exactly one personality profile.

Wardrobe must not reference the advertised product.

Every reference asset must exist within Cloudflare R2.

Every CharacterSheet must reference exactly one CreativeSpec.

---

# **Update Strategy**

CharacterSheet is immutable.

If:

* creative direction changes,  
* demographic changes,  
* identity changes,  
* spokesperson changes,  
* reference portrait changes,

a completely new CharacterSheet is generated.

Previously generated advertisements continue referencing their original CharacterSheet.

---

# **Example Object**

CharacterSheet

│

├── Identity

├── Appearance

├── Wardrobe

├── Personality

├── Expressions

├── Speaking Style

├── Reference Assets

├── Conditioning

└── References

The full JSON example is provided in **Appendix D — Complete Schema Examples**.

---

# **Future Extensions**

CharacterSheet is intentionally designed to support increasingly sophisticated identity conditioning as multimodal generation models evolve.

Potential extensions include:

* multi-image identity packs,  
* full-body turnaround references,  
* pose libraries,  
* gesture preferences,  
* lip-sync conditioning metadata,  
* motion reference clips,  
* emotion-specific portraits,  
* age variation profiles,  
* multilingual speaking styles,  
* reusable brand ambassadors shared across multiple campaigns.

By treating identity as a reusable asset package rather than a prompt, CharacterSheet provides a stable foundation for consistent human representation across image and video generation workflows while remaining independent of any specific model provider or conditioning technique.

---

# **18\. ShotSpec.json**

## **Purpose**

ShotSpec represents the complete storyboard and execution plan for a single advertisement. It defines the sequence of shots, their creative objectives, dialogue, camera behaviour, product visibility, timing, and media requirements required to produce the final advertisement.

Unlike CreativeSpec, which describes *what* the advertisement should communicate, ShotSpec defines *how* that communication is delivered over time.

Creative Studio follows a fixed three-shot advertisement structure. Every advertisement is decomposed into exactly three sequential shots, each serving a distinct marketing purpose.

By standardizing advertisements into a consistent narrative structure, downstream generation services can independently generate images, videos, narration, and product placement while remaining synchronized.

---

# **Ownership**

| Property | Value |
| ----- | ----- |
| Producer | Story Planner |
| Primary Consumers | Generation Orchestrator |
| Secondary Consumers | Image Pipeline, Video Pipeline, Voice Pipeline, Product Replacement Pipeline |
| Storage | PostgreSQL JSONB |
| Lifecycle | Persistent |
| Parent Object | CreativeSpec |

ShotSpec is immutable.

Any modification to story flow, messaging, or shot order results in a new ShotSpec.

---

# **Lifecycle**

CreativeSpec

\+

CharacterSheet

↓

Story Planner

↓

ShotSpec.json

↓

Generation Orchestrator

↓

Image  
Video  
Voice  
Product Replacement

ShotSpec is the final planning artifact before execution begins.

---

# **Responsibilities**

ShotSpec defines the complete execution plan for an advertisement.

It specifies:

* overall narrative flow,  
* timing,  
* dialogue,  
* camera behaviour,  
* visual composition,  
* product visibility,  
* character actions,  
* transition intent,  
* rendering requirements.

It intentionally excludes:

* prompts,  
* provider parameters,  
* model names,  
* generation seeds,  
* storage locations.

Those are execution concerns handled later.

---

# **High-Level Structure**

ShotSpec

├── Metadata

├── Story Structure

├── Timing

├── Global Style

├── Shots\[3\]

├── Transition Rules

├── Rendering Rules

└── References

---

# **JSON Structure**

{  
  "schemaVersion": "2.0",

  "objectType": "ShotSpec",

  "id": "shotspec\_xxx",

  "creativeSpecId": "...",

  "characterId": "...",

  "createdAt": "...",

  "storyStructure": {},

  "timing": {},

  "globalStyle": {},

  "shots": \[\],

  "transitionRules": {},

  "renderingRules": {},

  "references": {}  
}

---

# **Story Structure**

Every advertisement follows a fixed three-shot narrative.

Shot 1

↓

HOOK

↓

Shot 2

↓

PRODUCT

↓

Shot 3

↓

CTA

The planner is not allowed to alter this sequence.

Instead, creativity emerges within each stage.

---

# **Timing**

Timing controls the overall pacing.

Example

{  
    "totalDuration": 10,

    "shotDurations": \[

        3,

        4,

        3

    \]  
}

The total duration should remain approximately ten seconds.

Minor variation (±0.5 s) is acceptable.

---

# **Global Style**

Defines characteristics shared across every shot.

{  
    "aspectRatio": "9:16",

    "fps": 30,

    "lighting": "Soft Natural",

    "editingStyle": "Fast",

    "cameraStyle": "Handheld"  
}

Individual shots may override these values where necessary.

---

# **Shots**

The core of the schema.

Exactly three Shot objects exist.

ShotSpec

├── Shot 1

├── Shot 2

└── Shot 3

Each Shot is structurally identical.

---

# **Shot Object**

Shot

├── Identity

├── Narrative

├── Camera

├── Character

├── Product

├── Dialogue

├── Audio

├── Composition

└── Constraints

---

# **Identity**

Basic metadata.

{  
    "shotNumber": 1,

    "purpose": "Hook",

    "duration": 3  
}

Purposes are fixed.

* Hook  
* Product  
* CTA

---

# **Narrative**

Describes what happens.

Example

{  
    "summary":

    "Character notices perfectly fitting blazer.",

    "goal":

    "Capture attention",

    "viewerEmotion":

    "Curiosity"  
}

Narrative remains implementation-independent.

---

# **Camera**

Defines camera behaviour.

{  
    "shotType": "Medium",

    "angle": "Eye Level",

    "movement": "Handheld",

    "focus": "Character",

    "lens": "35mm"  
}

These fields later influence prompts.

---

# **Character**

Defines character behaviour.

{  
    "expression": "Excited",

    "pose": "Standing",

    "gaze": "Camera",

    "action":

    "Shows sleeve details"  
}

The CharacterSheet defines identity.

ShotSpec defines behaviour.

---

# **Product**

Defines product presentation.

{  
    "visibility": "High",

    "placement":

    "Worn",

    "focus":

    "Upper Body",

    "replacementRequired": true  
}

Notice something important.

ShotSpec never specifies the actual product.

It only specifies *how* the product should appear.

The actual product comes from Product.json.

---

# **Dialogue**

Dialogue is generated here.

Example

{  
    "spokenText":

    "I wasn't expecting this suit to fit this well.",

    "subtitle":

    "Premium tailoring made effortless."  
}

This becomes input to the Voice Pipeline.

---

# **Audio**

Defines non-verbal sound.

{  
    "music":

    "Modern Lifestyle",

    "ambience":

    "Coffee Shop",

    "sfx": \[

        "Fabric Rustle"  
    \]  
}

---

# **Composition**

Visual layout guidance.

{  
    "subjectPosition":

    "Center",

    "productVisibility":

    "Primary",

    "background":

    "Modern Office"  
}

This is particularly useful for Product Replacement.

---

# **Constraints**

Per-shot rules.

{  
    "mustShowFace": true,

    "mustShowProduct": true,

    "allowTextOverlay": false  
}

These are enforced during QA.

---

# **Transition Rules**

Defines continuity.

Example

{  
    "transition12": "Match Cut",

    "transition23": "Quick Dissolve"  
}

Future video models may leverage this information directly.

---

# **Rendering Rules**

Execution-independent rendering requirements.

{  
    "safeMargins": true,

    "captionAreaReserved": true,

    "maxMotion": "Medium"  
}

---

# **References**

Maintains lineage.

{  
    "creativeSpecId": "...",

    "characterId": "...",

    "productId": "...",

    "generationId": "..."  
}

---

# **Relationships**

CreativeSpec  
      │  
      ▼  
CharacterSheet  
      │  
      ▼  
ShotSpec  
      │  
 ┌────┼────┬──────────────┐  
 ▼    ▼    ▼              ▼  
Image Video Voice Product  
Pipe  Pipe  Pipe Replacement

ShotSpec is the **last planning object**.

Every execution pipeline derives its work from it.

---

# **Validation Rules**

### **Required**

* Exactly three shots.  
* Global style.  
* Timing.  
* References.

---

### **Constraints**

Exactly:

* 3 Shot objects.  
* 1 Hook.  
* 1 Product.  
* 1 CTA.

Total duration ≈ 10 seconds.

Every shot must contain:

* camera,  
* narrative,  
* dialogue,  
* character,  
* product,  
* composition.

Every shot must reference the same CharacterSheet.

Every shot must reference the same Product.

The sequence **Hook → Product → CTA** cannot be altered.

---

# **Update Strategy**

ShotSpec is immutable.

Any modification to:

* dialogue,  
* shot timing,  
* pacing,  
* transitions,  
* composition,  
* camera behaviour,  
* story flow,

results in the creation of a new ShotSpec rather than updating an existing one.

This ensures every execution workflow can be reproduced exactly from the planning artifacts.

---

# **Example Object**

ShotSpec  
│  
├── Story Structure  
├── Timing  
├── Global Style  
├── Shot 1 (Hook)  
├── Shot 2 (Product)  
├── Shot 3 (CTA)  
├── Transition Rules  
├── Rendering Rules  
└── References

The full canonical JSON example is provided in **Appendix D — Complete Schema Examples**.

---

# **Future Extensions**

The ShotSpec schema is designed to remain stable while supporting richer storytelling capabilities over time.

Potential extensions include:

* multi-character interactions,  
* alternate shot variants for A/B testing,  
* branching narratives,  
* platform-specific storyboards,  
* camera path definitions,  
* emotion timelines,  
* synchronized animation cues,  
* scene continuity metadata,  
* dynamic subtitle timing,  
* fine-grained lip-sync markers.

Despite these future enhancements, ShotSpec will continue to serve as the canonical storyboard contract that bridges creative planning and execution, ensuring all downstream generation pipelines remain synchronized around a single, deterministic shot plan.

---

# **19\. GenerationTask.json**

## **Purpose**

GenerationTask represents the executable work package consumed by the media generation pipelines. It is the sole execution-layer schema within Creative Studio and is responsible for translating high-level planning artifacts into deterministic, worker-ready tasks.

Unlike the planning schemas, which describe creative intent, GenerationTask describes **execution**. It contains all information required by image, video, voice, and product replacement workers to perform generation without requiring additional reasoning.

GenerationTask is intentionally ephemeral. It exists only for the duration of a generation workflow and is discarded once execution completes successfully.

Rather than persisting prompts or provider-specific payloads, GenerationTask acts as a provider-agnostic compilation artifact that can be transformed into model-specific requests by each worker independently.

---

# **Ownership**

| Property | Value |
| ----- | ----- |
| Producer | Generation Orchestrator |
| Primary Consumers | Image Pipeline, Video Pipeline, Voice Pipeline, Product Replacement Pipeline |
| Storage | In-Memory / Redis (Optional) |
| Lifecycle | Ephemeral |
| Parent Object | CreativeSpec |

GenerationTask is never manually created or edited.

It is assembled automatically by the Generation Orchestrator immediately before execution.

---

# **Lifecycle**

CreativeSpec  
CharacterSheet  
ShotSpec  
Product

↓

Generation Orchestrator

↓

GenerationTask

↓

Image Worker

Video Worker

Voice Worker

↓

Product Replacement

↓

Destroyed

Unlike every previous schema, GenerationTask is not intended for long-term storage.

---

# **Responsibilities**

GenerationTask serves one purpose:

**Compile planning artifacts into executable tasks.**

It contains:

* worker instructions,  
* references,  
* execution metadata,  
* asset locations,  
* rendering parameters,  
* synchronization information.

It intentionally excludes:

* creative reasoning,  
* business context,  
* historical campaign information,  
* provider prompts,  
* generated outputs.

---

# **High-Level Structure**

GenerationTask

├── Metadata

├── Context

├── Global Configuration

├── Shot Tasks

├── Worker Tasks

├── Asset References

├── Execution Rules

└── References

---

# **JSON Structure**

{  
  "schemaVersion": "2.0",

  "objectType": "GenerationTask",

  "id": "generation\_xxx",

  "creativeSpecId": "...",

  "status": "pending",

  "context": {},

  "globalConfiguration": {},

  "shotTasks": \[\],

  "workerTasks": {},

  "assetReferences": {},

  "executionRules": {},

  "references": {}  
}

---

# **Context**

Provides high-level execution context.

Example

{  
    "generationId": "...",

    "platform": "Instagram",

    "language": "English",

    "creativeStyle": "Luxury UGC"  
}

---

# **Global Configuration**

Configuration shared by every worker.

{  
    "resolution": "1080x1920",

    "fps": 30,

    "duration": 10,

    "aspectRatio": "9:16"  
}

This prevents duplication across worker tasks.

---

# **Shot Tasks**

GenerationTask contains exactly three Shot Tasks.

GenerationTask

├── Shot Task 1

├── Shot Task 2

└── Shot Task 3

Each Shot Task is compiled directly from ShotSpec.

---

## **Shot Task Structure**

Shot Task

├── Shot Metadata

├── Image Task

├── Video Task

├── Voice Task

├── Product Task

└── Synchronization

---

### **Shot Metadata**

{  
    "shotNumber": 1,

    "duration": 3,

    "purpose": "Hook"  
}

---

### **Image Task**

Contains everything required for image generation.

{  
    "characterReference": "...",

    "shotReference": "...",

    "style": "Luxury UGC",

    "needsProductReplacement": true  
}

Notice there are still **no prompts**.

Workers derive prompts internally.

---

### **Video Task**

Contains video-specific execution data.

{  
    "motion": "Medium",

    "cameraMovement": "Handheld",

    "inputImage": "...",

    "duration": 3  
}

This is later translated into Seedance requests.

---

### **Voice Task**

{  
    "script":  
    "...",

    "voiceProfile":  
    "...",

    "language":  
    "English"  
}

Consumed by the Voice Pipeline.

---

### **Product Task**

{  
    "productId": "...",

    "cutoutUri": "...",

    "maskUri": "...",

    "placementRequired": true  
}

Consumed by Product Replacement.

---

### **Synchronization**

Coordinates worker outputs.

{  
    "imageOutput": "...",

    "videoOutput": "...",

    "voiceOutput": "...",

    "finalShotOutput": "..."  
}

The orchestrator monitors these references during execution.

---

# **Worker Tasks**

Rather than forcing every worker to inspect the entire GenerationTask, the orchestrator prepares worker-specific execution views.

Worker Tasks

├── Image Pipeline

├── Video Pipeline

├── Voice Pipeline

└── Product Replacement

Each worker consumes only the subset relevant to it.

This minimizes coupling between execution services.

---

# **Asset References**

References all required input assets.

{  
    "characterPortrait": "...",

    "productCutout": "...",

    "garmentMask": "...",

    "referenceImages": \[

        "...",

        "..."  
    \]  
}

Every URI points to Cloudflare R2.

No binary media is embedded.

---

# **Execution Rules**

Defines orchestration behaviour.

Example

{  
    "parallelGeneration": true,

    "retryLimit": 2,

    "requiresQA": true,

    "blockingWorkers": \[

        "ProductReplacement"  
    \]  
}

These rules guide execution but remain independent of any workflow engine.

---

# **References**

Maintains lineage.

{  
    "creativeSpecId": "...",

    "characterId": "...",

    "shotSpecId": "...",

    "productId": "...",

    "generationRequestId": "..."  
}

---

# **Relationships**

CreativeSpec  
      │  
CharacterSheet  
      │  
ShotSpec  
      │  
Product  
      │  
      ▼  
GenerationTask  
      │  
 ┌────┼──────────┬─────────┐  
 ▼    ▼          ▼         ▼  
Image Video     Voice   Product  
Worker Worker   Worker  Worker

GenerationTask is the only schema consumed directly by execution workers.

---

# **Validation Rules**

### **Required**

* context  
* globalConfiguration  
* exactly three Shot Tasks  
* workerTasks  
* assetReferences  
* references

---

### **Constraints**

Exactly:

* 3 Shot Tasks  
* 1 Image Task per shot  
* 1 Video Task per shot  
* 1 Voice Task per shot  
* 1 Product Task per shot

Every asset reference must resolve to a valid Cloudflare R2 object.

Every GenerationTask must reference exactly one:

* CreativeSpec,  
* CharacterSheet,  
* ShotSpec,  
* Product.

GenerationTask must never contain provider-specific request payloads.

---

# **Storage Strategy**

GenerationTask is classified as an **ephemeral execution artifact**.

The recommended implementation is:

* Construct in memory by the Generation Orchestrator.  
* Optionally cache in Redis while execution is active.  
* Destroy automatically once all downstream workers complete successfully.  
* Persist only lightweight execution metadata (status, timestamps, identifiers) for audit purposes.

This approach minimizes storage overhead while preserving full reproducibility through the persistent planning schemas.

---

# **Example Object**

GenerationTask  
│  
├── Context  
├── Global Configuration  
├── Shot Task 1  
├── Shot Task 2  
├── Shot Task 3  
├── Worker Tasks  
├── Asset References  
├── Execution Rules  
└── References

The complete canonical JSON example is provided in **Appendix D — Complete Schema Examples**.

---

# **Future Extensions**

GenerationTask has been intentionally designed as a compilation artifact and can evolve alongside execution infrastructure without affecting upstream planning schemas.

Potential future enhancements include:

* distributed worker scheduling,  
* GPU affinity hints,  
* provider failover strategies,  
* batch generation directives,  
* streaming execution,  
* checkpoint and resume support,  
* execution cost estimation,  
* priority queues,  
* model selection policies,  
* multi-provider redundancy.

Regardless of these enhancements, GenerationTask will remain an ephemeral, provider-agnostic execution contract whose sole responsibility is to bridge creative planning and media generation.

Perfect. We're now in the **Output Layer**. These schemas represent the final deliverables of the generation pipeline.

Unlike the planning schemas, these don't contain intent—they describe **what was actually produced**.

I think `AssetManifest` should **not** just be a list of generated files. It should act as the canonical catalog of a generation, allowing the UI, future edits, analytics, and exports to work from one object.

---

# **20\. AssetManifest.json**

## **Purpose**

AssetManifest represents the complete catalog of all assets produced during a single advertisement generation workflow. It serves as the authoritative inventory of generated media, intermediate outputs, derived assets, and final deliverables.

Rather than storing media directly, AssetManifest maintains structured metadata and references to every asset produced throughout the generation pipeline. It provides a single entry point from which the user interface, export services, editing workflows, and quality assurance systems can locate every generated resource.

Every successful generation produces exactly one AssetManifest.

---

# **Ownership**

| Property | Value |
| ----- | ----- |
| Producer | Export Pipeline |
| Primary Consumers | User Interface, Export Service |
| Secondary Consumers | QA Pipeline, Future Editing Pipelines |
| Storage | PostgreSQL JSONB |
| Asset Storage | Cloudflare R2 |
| Lifecycle | Persistent |
| Parent Object | CreativeSpec |

AssetManifest is append-only.

Assets are never modified in place. Regenerations create new versions while preserving historical references.

---

# **Lifecycle**

GenerationTask

↓

Image Generation

↓

Video Generation

↓

Voice Generation

↓

Product Replacement

↓

Composition

↓

AssetManifest.json

↓

Export / UI

AssetManifest is created only after the complete advertisement has been successfully assembled.

---

# **Responsibilities**

AssetManifest records:

* generated images,  
* generated videos,  
* generated voiceovers,  
* composed advertisement,  
* thumbnails,  
* previews,  
* downloadable assets,  
* storage references,  
* media metadata.

It intentionally excludes:

* planning decisions,  
* prompts,  
* business context,  
* quality scores.

Those belong to other schemas.

---

# **High-Level Structure**

AssetManifest

├── Metadata

├── Generation Summary

├── Source References

├── Image Assets

├── Video Assets

├── Audio Assets

├── Final Deliverables

├── Preview Assets

├── Storage Metadata

└── References

---

# **JSON Structure**

{  
  "schemaVersion": "2.0",

  "objectType": "AssetManifest",

  "id": "manifest\_xxx",

  "creativeSpecId": "...",

  "createdAt": "...",

  "generationSummary": {},

  "sourceReferences": {},

  "imageAssets": \[\],

  "videoAssets": \[\],

  "audioAssets": \[\],

  "deliverables": {},

  "previewAssets": {},

  "storageMetadata": {},

  "references": {}  
}

---

# **Generation Summary**

Provides a quick overview.

{  
    "generationId": "...",

    "status": "completed",

    "durationSeconds": 10,

    "shots": 3,

    "language": "English"  
}

Useful for UI listings without inspecting every asset.

---

# **Source References**

Maintains lineage back to planning artifacts.

{  
    "creativeSpecId": "...",

    "characterSheetId": "...",

    "shotSpecId": "...",

    "productId": "..."  
}

This allows every output to be traced back to its planning inputs.

---

# **Image Assets**

Stores every generated image.

Image Assets

├── Shot 1 Keyframe

├── Shot 2 Keyframe

├── Shot 3 Keyframe

├── Character Portrait

└── Product Mockup

Each image object contains:

{  
    "assetId": "...",

    "type": "shot",

    "shotNumber": 2,

    "r2Uri": "...",

    "resolution": "1080x1920",

    "format": "png",

    "sizeBytes": 2183924  
}

---

# **Video Assets**

Stores raw generated clips.

Video Assets

├── Shot 1 Clip

├── Shot 2 Clip

└── Shot 3 Clip

Each clip contains:

* asset ID,  
* duration,  
* FPS,  
* resolution,  
* codec,  
* Cloudflare R2 URI.

These clips exist **before** final composition.

---

# **Audio Assets**

Stores generated narration.

Audio Assets

├── Voiceover

├── Background Music

└── Sound Effects

Example

{  
    "voiceover": {

        "assetId": "...",

        "duration": 9.7,

        "language": "English",

        "r2Uri": "..."  
    }  
}

---

# **Final Deliverables**

Represents user-facing outputs.

Deliverables

├── Final MP4

├── Final Image

├── Instagram Export

├── Thumbnail

└── Metadata

Example

{  
    "primaryVideo": {

        "assetId": "...",

        "r2Uri": "...",

        "duration": 10,

        "resolution": "1080x1920"  
    }  
}

The UI should primarily consume this section.

---

# **Preview Assets**

Contains lightweight media.

Example

{  
    "thumbnail": "...",

    "animatedPreview": "...",

    "compressedPreview": "..."  
}

Used for dashboard rendering and quick previews.

---

# **Storage Metadata**

Describes where assets are stored.

{  
    "provider": "Cloudflare R2",

    "bucket": "creative-assets",

    "region": "...",

    "totalSizeBytes": 91832421  
}

Storage metadata is informational only.

---

# **References**

Maintains lineage.

{  
    "creativeSpecId": "...",

    "generationId": "...",

    "qaReportId": "..."  
}

---

# **Relationships**

GenerationTask  
        │  
        ▼  
Image  
Video  
Voice  
Composition  
        │  
        ▼  
AssetManifest  
        │  
 ┌──────┼─────────┐  
 ▼      ▼         ▼  
UI    Export   Editing

AssetManifest becomes the canonical representation of generated outputs.

---

# **Validation Rules**

### **Required**

* generationSummary  
* imageAssets  
* videoAssets  
* deliverables  
* references

---

### **Constraints**

Exactly:

* 3 shot videos.  
* 3 keyframe images.  
* 1 final composed video.

Every asset must have:

* unique asset ID,  
* valid Cloudflare R2 URI,  
* media metadata.

Every deliverable must reference existing generated assets.

---

# **Storage Strategy**

AssetManifest stores **metadata only**.

Binary media is never embedded.

Every asset is stored within Cloudflare R2 and referenced using immutable object URIs.

This allows assets to be independently cached, versioned, and served without modifying the manifest.

---

# **Example Object**

AssetManifest  
│  
├── Generation Summary  
├── Source References  
├── Image Assets  
├── Video Assets  
├── Audio Assets  
├── Deliverables  
├── Preview Assets  
├── Storage Metadata  
└── References

The full canonical JSON example is provided in **Appendix D — Complete Schema Examples**.

---

# **Future Extensions**

AssetManifest is intentionally designed as a media catalog and can expand as Creative Studio supports richer output formats.

Potential future additions include:

* platform-specific export variants,  
* editable project bundles,  
* layered PSD or Figma exports,  
* subtitle files (SRT/VTT),  
* multiple language voiceover variants,  
* 4K and square-format renders,  
* social media metadata packages,  
* downloadable source bundles,  
* edit history and version lineage,  
* CDN optimization metadata.

Regardless of future capabilities, AssetManifest will remain the single source of truth for every media asset produced during a generation workflow, providing a stable interface for user-facing applications and downstream export processes.

---

# **21\. QAReport.json**

## **Purpose**

QAReport represents the comprehensive quality assessment of a completed advertisement generation. It records the results of automated validation performed across every stage of the generation pipeline, including image quality, video quality, voice synthesis, product placement, composition, and overall creative compliance.

Rather than serving as a simple pass/fail indicator, QAReport provides structured diagnostics that enable Creative Studio to identify generation issues, support automatic regeneration workflows, and provide detailed feedback to both users and internal services.

Every completed generation produces exactly one QAReport.

---

# **Ownership**

| Property | Value |
| ----- | ----- |
| Producer | Quality Assurance Pipeline |
| Primary Consumers | Export Pipeline, User Interface |
| Secondary Consumers | Analytics, Future Auto-Regeneration Engine |
| Storage | PostgreSQL JSONB |
| Lifecycle | Persistent |
| Parent Object | CreativeSpec |

QAReport is immutable.

Each generation has its own independent QAReport.

---

# **Lifecycle**

Generation Completed

↓

Quality Assurance

↓

Image Validation

↓

Video Validation

↓

Voice Validation

↓

Product Validation

↓

Composition Validation

↓

QAReport.json

↓

Export Decision

QA executes only after the final composed advertisement has been produced.

---

# **Responsibilities**

QAReport records:

* validation results,  
* quality scores,  
* detected issues,  
* compliance status,  
* regeneration recommendations,  
* execution statistics.

It intentionally excludes:

* generated assets,  
* business context,  
* planning artifacts,  
* prompts.

---

# **High-Level Structure**

QAReport

├── Metadata

├── Overall Result

├── Image QA

├── Video QA

├── Voice QA

├── Product QA

├── Composition QA

├── Compliance

├── Issues

├── Recommendations

└── References

---

# **JSON Structure**

{  
  "schemaVersion": "2.0",

  "objectType": "QAReport",

  "id": "qa\_xxx",

  "creativeSpecId": "...",

  "createdAt": "...",

  "overallResult": {},

  "imageQA": {},

  "videoQA": {},

  "voiceQA": {},

  "productQA": {},

  "compositionQA": {},

  "compliance": {},

  "issues": \[\],

  "recommendations": {},

  "references": {}  
}

---

# **Overall Result**

Provides a high-level summary.

{  
    "status": "Passed",

    "overallScore": 94,

    "approvedForExport": true,

    "requiresRegeneration": false  
}

This section is sufficient for most UI dashboards.

---

# **Image QA**

Evaluates generated keyframes.

Checks include:

* resolution  
* sharpness  
* realism  
* anatomical correctness  
* lighting consistency  
* artifact detection

Example

{  
    "overallScore": 96,

    "sharpness": 98,

    "realism": 95,

    "artifactScore": 99,

    "lightingConsistency": 94  
}

---

# **Video QA**

Evaluates generated clips.

Checks include:

* temporal consistency  
* flicker  
* motion stability  
* frame quality  
* scene continuity  
* identity consistency

Example

{  
    "overallScore": 91,

    "identityConsistency": 96,

    "temporalConsistency": 90,

    "motionSmoothness": 89,

    "flickerScore": 94  
}

---

# **Voice QA**

Evaluates synthesized narration.

Checks include:

* pronunciation  
* pacing  
* loudness  
* clipping  
* emotion  
* synchronization

Example

{  
    "overallScore": 95,

    "clarity": 97,

    "emotion": 94,

    "timing": 96,

    "lipSyncAlignment": 93  
}

---

# **Product QA**

Probably the most important validation section.

Checks include:

* correct product inserted,  
* garment alignment,  
* scale,  
* perspective,  
* visibility,  
* occlusion quality,  
* segmentation quality.

Example

{  
    "overallScore": 97,

    "correctProduct": true,

    "visibility": 99,

    "alignment": 95,

    "segmentationQuality": 98,

    "perspectiveMatch": 94  
}

This validates the BRIA placement stage.

---

# **Composition QA**

Evaluates the final advertisement.

Checks include:

* pacing,  
* subtitle placement,  
* safe margins,  
* CTA visibility,  
* transition quality,  
* visual balance.

Example

{  
    "overallScore": 93,

    "subtitleSafety": true,

    "ctaVisibility": 98,

    "transitionQuality": 91  
}

---

# **Compliance**

Ensures output satisfies planning constraints.

Example

{  
    "threeShots": true,

    "tenSecondDuration": true,

    "productVisibleEveryShot": true,

    "hookPresent": true,

    "ctaPresent": true,

    "brandSafe": true  
}

This validates the original `ShotSpec`.

---

# **Issues**

Rather than a boolean failure, QA records structured issues.

Example

\[  
    {  
        "severity": "warning",

        "category": "video",

        "message": "Minor temporal flicker detected in Shot 2."  
    },  
    {  
        "severity": "critical",

        "category": "product",

        "message": "Garment placement misaligned in Shot 3."  
    }  
\]

Issues are categorized by severity to support automated decision-making.

---

# **Recommendations**

Provides guidance for downstream actions.

Example

{  
    "recommendedAction": "Regenerate Shot 3",

    "retryStage": "ProductReplacement",

    "reason": "Garment alignment below threshold."  
}

Future orchestrators can consume this directly.

---

# **References**

Maintains lineage.

{  
    "creativeSpecId": "...",

    "generationTaskId": "...",

    "assetManifestId": "...",

    "productId": "..."  
}

---

# **Relationships**

GenerationTask  
        │  
        ▼  
Generated Assets  
        │  
        ▼  
Quality Assurance  
        │  
        ▼  
QAReport  
        │  
 ┌──────┴───────────┐  
 ▼                  ▼  
Export        Regeneration

QAReport is the final evaluation artifact produced by the pipeline.

---

# **Validation Rules**

### **Required**

* overallResult  
* imageQA  
* videoQA  
* voiceQA  
* productQA  
* compositionQA  
* compliance  
* references

---

### **Constraints**

Exactly one QAReport per generation.

Overall score must be between 0–100.

Every failed validation must appear in the `issues` list.

A generation cannot be marked `approvedForExport = true` if any critical issue exists.

Every recommendation must reference a valid pipeline stage.

---

# **Storage Strategy**

QAReport stores structured validation metadata only.

It never stores screenshots, generated media, or binary artifacts.

Where visual evidence is required, issue entries may reference Cloudflare R2 assets containing diagnostic images or overlays generated during validation.

---

# **Example Object**

QAReport  
│  
├── Overall Result  
├── Image QA  
├── Video QA  
├── Voice QA  
├── Product QA  
├── Composition QA  
├── Compliance  
├── Issues  
├── Recommendations  
└── References

The full canonical JSON example is provided in **Appendix D — Complete Schema Examples**.

---

# **Future Extensions**

QAReport is designed to evolve alongside Creative Studio's validation capabilities.

Potential future enhancements include:

* AI-generated qualitative feedback,  
* platform-specific compliance checks (Meta, TikTok, Google Ads),  
* OCR validation for text overlays,  
* brand guideline compliance scoring,  
* accessibility evaluation (captions, contrast, readability),  
* cost and latency reporting,  
* human review workflows,  
* historical quality trend analysis,  
* reinforcement learning signals for future planning.

As Creative Studio matures, QAReport will become the foundation for closed-loop optimization, enabling the platform not only to assess generated advertisements but also to learn from quality outcomes and automatically improve future generations through targeted regeneration and planning feedback.

