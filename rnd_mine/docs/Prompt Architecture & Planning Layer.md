# **Response 1 — Prompt Architecture & Planning Layer**

This response covers every GPT (OpenRouter GPT-5.4 Mini) reasoning stage.

---

## **1\. Context**

Purpose of the document.

Goals.

Design philosophy.

Prompting principles.

---

## **2\. Prompt Architecture**

Overall prompt flow.

Repository JSONs

↓

Context Builder

↓

GPT Prompt

↓

Structured JSON

↓

Validator

↓

Next Stage

Explain why prompts never directly generate media.

---

## **3\. Shared Prompt Framework**

System Prompt

Developer Prompt

User Prompt

Retrieved Context

Output Schema

Validation

Retry Strategy

Temperature

Structured Output

Hallucination constraints

---

## **4\. Context Builder**

How BrandContext, Product, Campaign and GenerationRequest become the context window.

How token budgeting works.

What gets summarized.

What gets embedded.

---

## **5\. Creative Intelligence Prompt**

Purpose

Inputs

Reasoning

Output (CreativeSpec)

Prompt template

Expected JSON

Validation

Failure cases

---

## **6\. Character Generator Prompt**

Purpose

Inputs

Reasoning

Output (CharacterSheet)

Identity rules

Consistency rules

Prompt template

Validation

---

## **7\. Story Planner Prompt**

Purpose

Inputs

Reasoning

Three-shot structure

Dialogue generation

Shot timing

Output (ShotSpec)

Prompt template

Validation

---

## **8\. Prompt Engineering Guidelines**

Prompt style

Few-shot

Chain-of-thought handling (internal only)

JSON formatting

Determinism

Retry policy

Guardrails

---

# **Response 2 — Generation Prompt Builders**

This covers everything after planning.

---

## **9\. Image Prompt Builder**

How ShotSpec becomes Flux prompts.

How CharacterSheet is injected.

How Product is excluded.

Positive prompt.

Negative prompt.

Style tokens.

Camera tokens.

Lighting tokens.

Output examples.

---

## **10\. Portrait Generation Prompt**

Character portrait prompt.

Reference image creation.

Consistency strategy.

---

## **11\. Product Mockup Prompt**

Mock garment generation.

Garment mask generation.

Background generation.

BRIA integration.

---

## **12\. Video Prompt Builder**

How ShotSpec becomes Seedance prompts.

Motion instructions.

Camera movement.

Continuity.

Reference portrait injection.

Reference image injection.

Product placeholder.

---

## **13\. Voice Prompt Builder**

Script creation.

Speaking style.

Emotion.

Pacing.

SSML (if applicable).

Fal voice generation.

---

## **14\. Product Replacement Prompting**

BiRefNet cutout flow.

BRIA placement flow.

Mask refinement.

Placement constraints.

Fallback logic.

---

## **15\. QA Prompting (Optional AI QA)**

If GPT is used for qualitative QA:

Visual critique prompt.

Marketing critique prompt.

Brand compliance prompt.

Regeneration recommendation prompt.

---

## **16\. Prompt Versioning**

Prompt IDs.

Versioning strategy.

A/B testing.

Regression testing.

Prompt changelog.

---

## **17\. Appendix**

Complete prompt templates for:

* Creative Intelligence  
* Character Generator  
* Story Planner  
* Flux Builder  
* Portrait Builder  
* Seedance Builder  
* Voice Builder  
* QA Builder

---

### **One addition I'd strongly recommend**

I would **not** store raw prompts in code.

Instead, define each prompt as a versioned asset:

PromptDefinition

├── promptId  
├── version  
├── model  
├── purpose  
├── systemPrompt  
├── developerPrompt  
├── template  
├── outputSchema  
├── validationRules  
└── changelog

This lets you update prompts independently of deployments, roll back regressions, compare prompt versions in production, and reproduce historical generations exactly. For a system intended to evolve over time, prompt versioning becomes as important as API versioning.

# **Cosmisk Creative Studio v2**

## **Prompt & Generation Specification**

### **Response 2 — Generation Prompt Builders**

This document defines how Creative Studio converts structured planning objects into executable prompts for image, video, voice, and product generation models. Unlike the Planning Layer, whose responsibility is creative reasoning, the Generation Layer is responsible for deterministic translation of planning artifacts into provider-specific requests.

The philosophy of the Generation Layer is that no downstream model should perform marketing decisions. Every generation model receives a fully planned specification and is only responsible for rendering media according to that specification. This separation ensures reproducibility, model interchangeability, and predictable outputs across different providers.

---

# **9\. Image Prompt Builder**

## **Purpose**

The Image Prompt Builder converts a single Shot within a ShotSpec into a production-ready Flux image generation prompt.

It is intentionally **not** an LLM. It is a deterministic compiler that assembles prompts using structured data from previous planning stages.

This guarantees that image generation is driven entirely by the approved creative plan rather than introducing new reasoning during execution.

---

## **Inputs**

The builder consumes:

* CreativeSpec  
* CharacterSheet  
* ShotSpec  
* Product  
* GenerationRequest

No additional context is retrieved.

---

## **Responsibilities**

The builder is responsible for generating:

* positive prompt  
* negative prompt  
* reference image attachments  
* conditioning parameters  
* generation metadata

It never performs:

* creative rewriting  
* marketing decisions  
* shot planning

---

## **Prompt Construction Pipeline**

ShotSpec

\+

CharacterSheet

\+

CreativeSpec

↓

Scene Builder

↓

Appearance Builder

↓

Camera Builder

↓

Style Builder

↓

Lighting Builder

↓

Composition Builder

↓

Prompt Assembly

↓

Flux Request

---

## **Prompt Sections**

Every image prompt is composed from independent blocks.

Positive Prompt

├── Scene

├── Character

├── Camera

├── Environment

├── Lighting

├── Style

├── Composition

├── Product Placeholder

└── Quality Tokens

---

### **Scene**

Generated directly from ShotSpec narrative.

Example

Young professional adjusting blazer while walking confidently through a modern office.

---

### **Character**

Generated from CharacterSheet.

Includes

* age  
* gender  
* hairstyle  
* facial features  
* body type  
* expression

No clothing description for the advertised garment is included.

---

### **Camera**

Derived entirely from ShotSpec.

Example

Medium shot  
Eye level  
35mm lens  
Handheld camera

---

### **Environment**

Derived from Shot composition.

Example

Modern office with warm afternoon lighting.

---

### **Lighting**

Example

Soft natural sunlight,  
warm shadows,  
realistic reflections.

---

### **Style**

Derived from CreativeSpec.

Example

Luxury UGC,  
premium fashion advertisement,  
social media aesthetic.

---

### **Product Placeholder**

A critical architectural decision.

Flux does **not** generate the final garment.

Instead it generates a realistic placeholder garment occupying the correct physical location.

Later:

Placeholder

↓

BiRefNet Mask

↓

BRIA Product Placement

↓

Final Product

This dramatically improves product fidelity.

---

### **Quality Tokens**

Example

ultra realistic

high detail

8k

professional photography

cinematic

sharp focus

---

## **Negative Prompt**

Standardized globally.

Example

low quality

blurry

extra fingers

extra arms

deformed anatomy

poor lighting

cropped face

duplicate body

watermark

text

logo

artifacts

incorrect clothing folds

---

## **Reference Images**

Flux receives:

* Character portrait  
* Optional previous shot keyframe

This improves identity consistency.

---

## **Output**

Flux Prompt

\+

Negative Prompt

\+

Portrait Reference

\+

Parameters

↓

FAL Flux 2

---

# **10\. Portrait Generation Prompt**

## **Purpose**

Generates the canonical character identity before any advertisement assets are created.

This is the first image generation step.

---

## **Inputs**

CharacterSheet only.

---

## **Responsibilities**

Generate:

* primary portrait  
* side profile  
* three-quarter profile  
* smiling portrait  
* neutral portrait

---

## **Prompt Structure**

Identity

↓

Appearance

↓

Facial Features

↓

Lighting

↓

Background

↓

Portrait Style

Example

Professional portrait of a 27-year-old South Asian woman with shoulder-length dark brown hair, warm smile, medium skin tone, photographed against a neutral studio background with soft diffused lighting.

---

## **Output**

Stored in Cloudflare R2.

CharacterSheet updated with:

Primary Portrait

Side Portrait

Smile Portrait

Neutral Portrait

---

# **11\. Product Mockup Builder**

## **Purpose**

Creates a realistic placeholder representation of the product before BRIA replacement.

This step is optional for products that already contain suitable isolated assets.

---

## **Inputs**

Product.json

---

## **Responsibilities**

Generate

* mannequin version  
* folded version  
* floating garment  
* clean catalog shot

depending on garment type.

---

## **Product Isolation**

Pipeline

Shopify Image

↓

BiRefNet

↓

Garment Mask

↓

Clean Garment

↓

Cloudflare R2

---

## **Mockup Prompt**

Example

Minimal studio photograph of premium linen blazer floating naturally, neutral gray background, soft studio lighting.

---

## **Output**

Product repository updated.

---

# **12\. Video Prompt Builder**

## **Purpose**

Converts every Shot into a Seedance video generation request.

---

## **Inputs**

* ShotSpec  
* Character portrait  
* Flux keyframe  
* Product placeholder

---

## **Responsibilities**

Generate

* motion description  
* camera movement  
* subject movement  
* environment  
* pacing

---

## **Prompt Pipeline**

Shot

↓

Narrative

↓

Motion Builder

↓

Camera Builder

↓

Reference Injection

↓

Seedance Prompt

---

## **Motion**

Derived from ShotSpec.

Example

Walk forward slowly.

Adjust sleeve naturally.

Maintain eye contact with camera.

---

## **Camera**

Example

Handheld

Slight bobbing

Medium shot

Slow push-in

---

## **Continuity**

Every shot receives:

* previous frame reference  
* character portrait  
* previous shot metadata

to improve temporal consistency.

---

## **Output**

Seedance Prompt

\+

Reference Images

↓

FAL Seedance

---

# **13\. Voice Prompt Builder**

## **Purpose**

Generate advertisement narration matching the creative strategy.

---

## **Inputs**

* CreativeSpec  
* ShotSpec  
* CharacterSheet

---

## **Script**

Generated earlier by Story Planner.

No rewriting occurs.

---

## **Voice Parameters**

Derived from CharacterSheet.

Example

Language

English

Accent

Neutral Indian

Energy

High

Tone

Friendly

Speed

Conversational

---

## **Voice Generation**

Script

\+

Voice Style

↓

FAL Speech Model

↓

Voice WAV

---

## **Timing**

Voice duration is aligned to:

Shot 1

↓

Shot 2

↓

Shot 3

↓

≈10 seconds

Small timing adjustments are permitted during composition.

---

# **14\. Product Replacement Pipeline**

## **Purpose**

Replace placeholder garments with the actual Shopify product while preserving realism.

This is the defining capability of Creative Studio and ensures that advertisements always showcase the client's real merchandise rather than AI-invented clothing.

---

## **Pipeline**

Generated Image / Video Frame

↓

Placeholder Detection

↓

Garment Mask

↓

BiRefNet Refinement

↓

BRIA Product Placement

↓

Color Matching

↓

Lighting Matching

↓

Shadow Matching

↓

Final Frame

---

## **Inputs**

* Product cutout  
* Product mask  
* Generated frame  
* Garment mask  
* ShotSpec

---

## **Responsibilities**

Maintain:

* scale  
* folds  
* perspective  
* shadows  
* occlusion  
* texture fidelity

---

## **Constraints**

Never alter:

* face  
* hands  
* hair  
* background

Only the garment region may be modified.

---

# **15\. AI-Assisted QA Prompting (Optional)**

Although most validation should be deterministic or model-based, GPT can provide qualitative evaluation where subjective judgment is useful.

Potential prompt categories include:

* Marketing effectiveness ("Is the hook compelling?")  
* Brand consistency ("Does this reflect the brand tone?")  
* Visual critique ("Is the composition balanced?")  
* Copy review ("Is the CTA clear and concise?")

These prompts should never approve or reject outputs on their own. They supplement automated QA with human-like creative feedback.

---

# **16\. Prompt Versioning**

Every prompt in Creative Studio is treated as a versioned engineering artifact.

Each prompt definition contains:

PromptDefinition

├── promptId  
├── version  
├── model  
├── owner  
├── purpose  
├── systemPrompt  
├── developerPrompt  
├── template  
├── variables  
├── outputSchema  
├── validationRules  
├── changelog  
└── status

Prompt versions are immutable once deployed. Historical generations always reference the exact prompt version used, enabling reproducibility, regression testing, and safe prompt iteration.

---

# **17\. Provider Mapping**

The execution layer remains provider-agnostic internally, with provider-specific translation isolated in adapters.

| Pipeline | Provider | Model |
| ----- | ----- | ----- |
| Planning | OpenRouter | GPT-5.4 Mini |
| Portrait Generation | FAL | Flux 2 |
| Image Generation | FAL | Flux 2 |
| Video Generation | FAL | Seedance |
| Product Cutout | FAL | BiRefNet |
| Product Placement | FAL | BRIA Product Shot |
| Voice Generation | FAL | Selected Speech/TTS Model |
| Asset Storage | Cloudflare | R2 |
| Metadata Storage | PostgreSQL | JSONB |

This abstraction allows future model replacements (e.g., Flux → another image model) without changing planning logic or data contracts.

---

# **18\. Prompt Design Principles**

The following principles apply to every prompt in Creative Studio:

1. **Reason once, render many.** All creative decisions are made in the Planning Layer; generation models only render.  
2. **Structured inputs over free text.** Prompts are assembled from JSON objects rather than handwritten descriptions.  
3. **Provider independence.** Prompt builders emit provider-neutral intent before adapter-specific formatting.  
4. **Determinism over creativity.** Temperature, retries, and validation are configured to maximize reproducibility.  
5. **Version everything.** Prompt templates, schemas, and model mappings are all version-controlled.  
6. **Never trust model memory.** Every prompt contains all required context explicitly.  
7. **Real products first.** AI-generated garments are placeholders; final advertisements always use the client's isolated Shopify assets via BRIA placement.

---

# **Appendix A — End-to-End Prompt Flow**

GenerationRequest  
        │  
        ▼  
Creative Intelligence (GPT-5.4 Mini)  
        │  
        ▼  
CreativeSpec  
        │  
        ▼  
Character Generator (GPT-5.4 Mini)  
        │  
        ▼  
CharacterSheet  
        │  
        ▼  
Portrait Generation (Flux 2\)  
        │  
        ▼  
Story Planner (GPT-5.4 Mini)  
        │  
        ▼  
ShotSpec  
        │  
        ▼  
Generation Orchestrator  
        │  
 ┌──────┼───────────────┬───────────────┐  
 ▼      ▼               ▼               ▼  
Flux 2  Seedance     Speech Model   BRIA/BiRefNet  
(Image) (Video)      (Voice)        (Product)  
        │  
        └───────────────┬───────────────┘  
                        ▼  
                 Composition Pipeline  
                        ▼  
                  Quality Assurance  
                        ▼  
                  AssetManifest  
                        ▼  
                     Export

---

# **Final Summary**

The Prompt & Generation Specification completes the Cosmisk Creative Studio v2 design by defining the transformation from structured creative planning into executable media generation. Combined with the Architecture Document and Schema Specification, it establishes a clean separation between **reasoning**, **planning**, **execution**, and **validation**, allowing AI models, providers, and rendering technologies to evolve independently while preserving deterministic, auditable, and reproducible advertisement generation workflows.

