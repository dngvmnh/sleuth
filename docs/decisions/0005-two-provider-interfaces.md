# 0005 Two provider interfaces

## Context
The first plan had five AI stages. Modern multimodal models can read on-screen text and describe frames in one call.

## Decision
Two interfaces in `packages/media`:
- `TranscriptionProvider`: audio in, text with word-level timestamps out.
- `VideoAnalysisProvider`: sampled frames or a short clip in, timestamped observations (including on-screen text) out.

Mock implementations ship first. The media owner picks real providers later behind the same interfaces. A separate OCR stage is added only if evaluation shows it is needed.

## Consequences
- Less integration work for the media owner.
- Provider output is untrusted and validated with Zod.
- Swapping vendors does not change contracts.
