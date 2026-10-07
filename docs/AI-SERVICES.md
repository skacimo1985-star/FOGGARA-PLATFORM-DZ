# FOGGARA-DZ Operational AI & Geospatial Model Stack

This document defines model/runtime roles for production services. Models do not replace deterministic engineering calculations or verified measurements.

## 1. Sovereign language / multimodal runtime

Preferred edge/local starting point:
- Qwen3.5 4B: https://huggingface.co/Qwen/Qwen3.5-4B
- Ollama Qwen3.5 packages: https://ollama.com/library/qwen3.5

Alternative:
- Gemma: https://github.com/google-deepmind/gemma
- Gemma documentation: https://ai.google.dev/gemma/docs

Serving:
- Ollama: https://github.com/ollama/ollama
- vLLM: https://github.com/vllm-project/vllm

FOGGARA integration:
- API: POST /api/ai/field-advisory
- API: POST /api/ai/investor-brief
- The model receives sanitized derived context only.
- Field advisory never receives parcel names, coordinates, or source references.
- Output is PROPOSED, never VERIFIED, and cannot execute field actions.

Example local configuration:

```env
AI_LOCAL_ENABLED=true
AI_LOCAL_BASE_URL=http://ollama:11434/v1
AI_LOCAL_MODEL=qwen3.5:4b
AI_LOCAL_API_KEY=
AI_EXTERNAL_ENABLED=false
```

## 2. Earth Observation foundation models

Use as separate GPU workers, not inside the synchronous web process.

- Prithvi-EO-2.0 (IBM/NASA): https://github.com/NASA-IMPACT/Prithvi-EO-2.0
- TerraMind (IBM/ESA): https://github.com/IBM/terramind
- TerraTorch inference/fine-tuning toolkit: https://github.com/torchgeo/terratorch
- Clay Foundation Model: https://github.com/Clay-foundation/model

Target FOGGARA services:
- crop/land-cover classification
- change detection
- field embeddings and similarity
- anomaly detection
- downstream regression after Algeria-specific validation

These model outputs remain INFERRED until independently validated.

## 3. Deterministic satellite analytics already in FOGGARA

The production API uses trusted Sentinel-2 L2A COG assets with SCL masking and bounded raster processing.

Current/added indices:
- NDVI
- EVI
- SAVI
- NDWI
- NDMI
- LSWI
- BSI

These calculations must remain deterministic and source-traceable. Foundation models complement them; they do not replace them.

## 4. Document intelligence

- Docling: https://github.com/docling-project/docling
- PaddleOCR: https://github.com/PaddlePaddle/PaddleOCR

Target services:
- laboratory report extraction
- calibration certificate extraction
- invoice/contract/table parsing
- Arabic/French/English OCR
- structured ingestion into the Data Room review queue

Extracted content is OBSERVED_FROM_DOCUMENT / proposed for review; it does not become VERIFIED automatically.

## 5. Retrieval and knowledge base

- Qdrant: https://github.com/qdrant/qdrant

Use for:
- regulations and standards retrieval
- equipment manuals
- project evidence search
- engineering references
- multilingual semantic search

Tenant/org metadata filters are mandatory for every retrieval.

## 6. Deployment boundaries

Web/API process:
- FastAPI
- deterministic calculations
- authorization/audit
- small synchronous Sentinel jobs

AI worker:
- Ollama for lightweight local/edge deployment
- vLLM for GPU server deployment
- Qwen/Gemma for language, vision-language, structured reasoning

EO worker:
- TerraTorch
- Prithvi / TerraMind / Clay
- asynchronous GPU jobs for classification/change detection/regression

Document worker:
- Docling / PaddleOCR

Never place heavy EO foundation-model inference in the public web process. Queue jobs, enforce per-tenant quotas, persist provenance, and expose model/version/input fingerprints with every result.
