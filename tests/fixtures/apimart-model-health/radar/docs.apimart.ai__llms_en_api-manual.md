# APIMart: English API Manual

## API Manual

### Overview

- [APIMart — OpenAI-Compatible API Gateway (GPT-5, Claude, Gemini)](https://docs.apimart.ai/en/index.md): OpenAI-compatible API for GPT-5, Claude, Gemini. Multi-provider routing, transparent pricing, low latency. Enterprise SLA, SDK support, pay-as-you-go.

### Models

- [Models List Metadata API](https://docs.apimart.ai/en/api-reference/texts/models/list.md): - GET /v1/models — basic list - + `expand` query parameter to include category, capability tags, and parameter schema - For automation, dynamic forms, pre-validation

### Text Series

- [General Chat API (Default Streaming)](https://docs.apimart.ai/en/api-reference/texts/general/chat-completions.md): - Unified chat API interface supporting all text generation models - Select different AI models via the model parameter - Compatible with OpenAI Chat Completions API format
- [General Chat API (Default Non-Streaming)](https://docs.apimart.ai/en/api-reference/texts/general/chat-completions-nostream.md): - Unified chat API interface supporting all text generation models - Select different AI models via the model parameter - Compatible with OpenAI Chat Completions API format - Non-streaming output, returns complete response at once
- [Claude Messages API](https://docs.apimart.ai/en/api-reference/texts/general/claude-messages.md): - Fully compatible with the native Anthropic Claude Messages protocol (`POST /v1/messages`) - Supports multi-turn conversations, streaming SSE, tool use, and extended thinking - Supports multimodal content including text and images - Responses are upstream passthrough with no `{code, data}` wrapper
- [Gemini Native Format](https://docs.apimart.ai/en/api-reference/texts/gemini/quickstart.md): - Call Gemini models using Google Native API format - Synchronous processing mode with real-time response - Minimal parameters for quick start
- [OpenAI Multimodal Responses API](https://docs.apimart.ai/en/api-reference/texts/openai/responses.md): - Fully compatible with OpenAI Responses API format - Supports multimodal input with text and images - Supports tool extensions: web search, file search, function calling, remote MCP
- [Gemini Context Caching Guide](https://docs.apimart.ai/en/api-reference/texts/gemini/context-cache.md): Create and reuse Gemini context caches (Context Cache) through the OpenAI-compatible Chat Completions API or the native Gemini API. Use cache_control to cache stable prefixes and reduce token costs for repeated long content.
- [Claude Context Caching Guide](https://docs.apimart.ai/en/api-reference/texts/general/claude-context-cache.md): Cache reusable prompt prefixes through the Claude Messages API or the OpenAI-compatible Chat Completions API to reduce token costs from repeatedly processing long content.

#### qwen3.8-max

- [qwen3.8-max Integration Guide](https://docs.apimart.ai/en/api-reference/texts/qwen3.8-max/guide.md): - OpenAI-compatible: chat/completions and Responses - Built-in tools only on Responses; thinking cannot be disabled - Implicit/explicit context cache; PDF on chat endpoint only - Billing = token fees + per-call tool fees
- [Model Pricing API](https://docs.apimart.ai/en/api-reference/texts/qwen3.8-max/pricing.md): - GET /api/pricing/model for display rates - Read only data.pricing; effective_rates is what users pay - Tool prices must be multiplied by price_factor - Contract is generic for TokenPricingV2 models

### Image Series

#### Nano banana2

- [Nano banana2 Image Generation](https://docs.apimart.ai/en/api-reference/images/gemini-3.1-flash/generation.md): - Supports text-to-image and image-to-image, up to 4K resolution output - Up to 14 reference images for style/character consistency - Supports extreme aspect ratios (1:4, 4:1, 1:8, 8:1) - Integrated Google Search enhancement for more realistic image generation
- [Nano Banana Lite Image Generation](https://docs.apimart.ai/en/api-reference/images/gemini-3.1-flash/generation-lite.md): - The fastest and cheapest image model in the Gemini 3.1 family, designed for large-scale, low-cost image generation - Supports 1K resolution only (passing 2K/4K/0.5K is automatically downgraded to 1K without an error) - Supports text-to-image and image-to-image, up to 14 reference images - Billed b…

#### Nano banana Pro

- [Nano banana Pro Image Generation](https://docs.apimart.ai/en/api-reference/images/gemini-3-pro/generation.md): - Asynchronous processing mode, returns task ID for subsequent queries - High-quality image generation, professional-grade image creation - Generated image links are valid for 24 hours, please save them promptly

#### Nano banana

- [Nano banana Image Generation](https://docs.apimart.ai/en/api-reference/images/gemini-2.5-flash/generation.md): - Asynchronous processing mode, returns task ID for subsequent queries - Fast generation speed, optimized for quick image creation - Generated image links are valid for 24 hours, please save them promptly

#### Imagen-4.0

- [Imagen 4.0 Apimart Image Generation](https://docs.apimart.ai/en/api-reference/images/imagen-4.0-apimart/generation.md): - Asynchronous processing mode, returns task ID for subsequent queries - Based on Google Imagen 4 model, high-quality image generation - Only supports text-to-image, does not support image-to-image / reference images - Supported ratios: 16:9 (landscape), 9:16 (portrait) - Generated image links are v…

#### GPT-Image(1/1.5)

- [GPT-Image(1/1.5) Image Generation](https://docs.apimart.ai/en/api-reference/images/gpt-image-1/generation.md): - Asynchronous processing mode, returns task ID for subsequent queries - Supports text-to-image, image-to-image, and inpainting generation modes - Supports transparent backgrounds, multiple output formats, and quality tiers - Generate up to 4 images per request, with up to 15 reference images

#### GPT-Image-2

- [GPT-Image-2 Image Generation](https://docs.apimart.ai/en/api-reference/images/gpt-image-2/generation.md): - Asynchronous processing mode, returns task ID for subsequent queries - OpenAI Images compatible protocol, supports text-to-image / image-to-image - 15 image aspect ratios supported via the `size` field - Output pixel tier controlled via `resolution` (`1k` / `2k` / `4k`)
- [GPT-Image-2 Official Channel Image Generation](https://docs.apimart.ai/en/api-reference/images/gpt-image-2/official.md): - OpenAI official `gpt-image-2` model, based on `/v1/images/generations` compatible protocol - Asynchronous processing, returns `task_id` for subsequent queries - Text-to-image / image-to-image / inpainting (mask) — all-in-one - Supports PNG / WebP transparent backgrounds (Alpha channel) - New `reso…

#### GPT-Image-2.5

- [GPT-Image-2.5 Image Generation](https://docs.apimart.ai/en/api-reference/images/gpt-image-2.5/generation.md): - Choose between gpt-image-2.5-flare and gpt-image-2.5-sunburst - Asynchronous processing returns a task_id for status queries - Supports text-to-image and image editing with up to 16 reference images - Supports local inpainting with transparent PNG masks - Supports 15 aspect ratios, exact pixel dim…

#### GPT-Image-2.5 Ext

- [GPT-Image-2.5 Ext Image Generation](https://docs.apimart.ai/en/api-reference/images/gpt-image-2.5-ext/generation.md): - Use gpt-image-2.5-ext and select Flare or Sunburst with version - Asynchronous processing: query results using the task ID after submission - Supports text-to-image and image-to-image with up to 16 reference images - Supports 10 aspect ratios and auto, with 1K / 2K / 4K resolution tiers - Generate…

#### Seedream-4.0

- [Seedream-4.0 Image Generation](https://docs.apimart.ai/en/api-reference/images/seedream-4/generation.md): - Asynchronous processing mode, returns task ID for subsequent queries - Supports multiple generation modes including text-to-image, image-to-image, and image editing - Generated image links are valid for 24 hours, please save them promptly

#### Seedream-4.5

- [Seedream-4.5 Image Generation](https://docs.apimart.ai/en/api-reference/images/seedream-4.5/generation.md): - Asynchronous processing mode, returns task ID for subsequent queries - Supports multiple generation modes including text-to-image, image-to-image, and image editing - Generated image links are valid for 24 hours, please save them promptly

#### Seedream-5.0-Lite

- [Seedream-5.0-Lite Image Generation](https://docs.apimart.ai/en/api-reference/images/seedream-5-lite/generation.md): - Asynchronous processing mode, returns task ID for subsequent queries - Supports multiple generation modes including text-to-image, image-to-image, and sequential image generation - Supports 2K / 3K resolution with PNG / JPEG output formats - Generated image links are valid for 72 hours, please sav…

#### Seedream-5.0-Pro

- [Seedream-5.0-Pro Image Generation](https://docs.apimart.ai/en/api-reference/images/seedream-5-0-pro/generation.md): - Asynchronous processing mode, returns a task ID for subsequent queries - Supports text-to-image, single-image-to-image, and multi-reference image-to-image (up to 10 reference images) - Supports 1K / 1.5K / 2K resolution tiers, or exact pixels via `size` - Single-image model: one image per request;…

#### Seedream-5.0-Flash

- [Seedream-5.0-Flash Image Generation](https://docs.apimart.ai/en/api-reference/images/seedream-5-0-flash/generation.md): - Asynchronous processing mode, returns a task ID for subsequent queries - Supports text-to-image, single-image-to-image, and multi-reference image-to-image (up to 10 reference images) - Supports 1K / 1.5K / 2K resolution tiers, or exact pixels via `size` - Single-image model: one image per request;…

#### Flux Kontext

- [FLUX Kontext Image Generation and Editing](https://docs.apimart.ai/en/api-reference/images/flux-kontext/generation.md): Submit asynchronous FLUX Kontext image generation or image editing tasks. The API returns a task ID; poll the task endpoint for the generated image.

#### Flux 2.0

- [FLUX.2 Image Generation](https://docs.apimart.ai/en/api-reference/images/flux-2/generation.md): Submit asynchronous FLUX.2 text-to-image or reference-image generation tasks. The API returns a task ID; poll the task endpoint for the generated image.

#### Qwen Image 2.0

- [Qwen Image 2.0 Image Generation](https://docs.apimart.ai/en/api-reference/images/qwen-image/generation.md): - Asynchronous processing mode, returns task ID for subsequent queries - Supports text-to-image, image-to-image and other generation modes - Supports 1K/2K resolution tiers, generate up to 6 images

#### Qwen Image 3.0

- [Qwen Image 3.0 Image Generation](https://docs.apimart.ai/en/api-reference/images/qwen-image-3.0/generation.md): - Asynchronous processing mode, returns a task ID for subsequent queries - Supports text-to-image and image-to-image (1-3 reference images for editing) - Supports 1K / 2K resolution, up to 6 images per request - Standard and Pro variants (Pro is stronger for dense layout and text)

#### Z-Image-Turbo

- [Z-Image-Turbo Image Generation](https://docs.apimart.ai/en/api-reference/images/z-image-turbo/generation.md): - Asynchronous processing mode, returns task ID for subsequent queries - Lightweight and fast image generation, supports Chinese and English - Supports 1K/2K resolution tiers, supports smart prompt rewriting

#### Grok Imagine

- [Grok Imagine Image Generation](https://docs.apimart.ai/en/api-reference/images/grok-imagine/generation.md): - Async processing mode, returns task ID for subsequent queries - Supports text-to-image and reference-based image editing - Also documents the grok-imagine-image and grok-imagine-image-quality models - Generated image links are valid for 24 hours; please save them promptly

#### Grok Imagine 2.0 Ext

- [Grok Imagine 2.0 Ext Image Generation](https://docs.apimart.ai/en/api-reference/images/grok-imagine-2.0-ext/generation.md): - Async text-to-image; poll with task_id - 1–12 images per request; billed per successfully delivered image ($0.08 each) - URL output only; no image-to-image / streaming - Image URLs expire in 72 hours
- [Grok Imagine 2.0 Ext Layers and Region Editing](https://docs.apimart.ai/en/api-reference/images/grok-imagine-2.0-ext/layer-region-edit.md): Use segment to retrieve object layers and precise masks, then edit polygons, boxes, or detected objects with region_edit.
- [Grok Imagine Image 2.0 Official Generation and Editing](https://docs.apimart.ai/en/api-reference/images/grok-imagine-2.0-ext/official.md): Asynchronous image generation and editing with grok-imagine-image-2.0

#### wan2.7-image

- [wan2.7 Image Generation & Editing](https://docs.apimart.ai/en/api-reference/images/wan2.7-image/generation.md): - Wan2.7 image series: supports text-to-image, image editing, interactive editing, sequential generation, and multi-image reference - Asynchronous processing mode — submit a task and poll for results using the returned task_id - Supports 1K / 2K / 4K resolution; wan2.7-image-pro supports up to 4K fo…

#### Midjourney

- [Midjourney API overview](https://docs.apimart.ai/en/api-reference/images/midjourney/generation.md): - Overview of Midjourney text-to-image (Imagine) / image-guided / follow-up actions / image-to-video endpoints - Async task mode: receive task_id after submission, poll for the result - New routes auto-inject model=midjourney and support native MJ args, structured body fields, and metadata
- [Imagine (text-to-image)](https://docs.apimart.ai/en/api-reference/images/midjourney/imagine.md): Midjourney text-to-image / image-guided generation. The default entry /v1/midjourney/generations and the explicit /imagine entry behave the same
- [Blend (multi-image blend)](https://docs.apimart.ai/en/api-reference/images/midjourney/blend.md): Blend 2–4 images into a new image (the classic MJ blend); image-only, no prompt supported
- [Describe (image to text)](https://docs.apimart.ai/en/api-reference/images/midjourney/describe.md): Reverse a prompt from an image; responds synchronously (1–3s), result in the prompt / description fields
- [Edits (image edit)](https://docs.apimart.ai/en/api-reference/images/midjourney/edits.md): Rewrite the whole image from an existing image + prompt. Good for background replacement, style transfer, content changes
- [Upscale](https://docs.apimart.ai/en/api-reference/images/midjourney/upscale.md): Pick one of U1–U4 from an Imagine grid to produce a single image; composed locally and usually returns instantly
- [Variation](https://docs.apimart.ai/en/api-reference/images/midjourney/variation.md): Subtle variation (varySubtle, equivalent to V1–V4) on one tile of an Imagine grid
- [High Variation](https://docs.apimart.ai/en/api-reference/images/midjourney/high-variation.md): Strong variation (varyStrong, Vary (Strong)) on a single upscaled image
- [Low Variation](https://docs.apimart.ai/en/api-reference/images/midjourney/low-variation.md): Subtle variation (varySubtle, same behavior as Variation, only the billing key differs) on a single upscaled image
- [Reroll](https://docs.apimart.ai/en/api-reference/images/midjourney/reroll.md): Regenerate 4 images from the source task's prompt (🔄). The whole grid is re-rolled, no index needed
- [Zoom](https://docs.apimart.ai/en/api-reference/images/midjourney/zoom.md): Zoom Out (outpaint) on a single upscaled image: the original is kept and more background is filled outward (Outpaint / CustomZoom)
- [Pan](https://docs.apimart.ai/en/api-reference/images/midjourney/pan.md): Pan out in a direction on a single upscaled image; chain pans to stitch a panorama (v6 / v6.1 / v7 / v8.1 / v8.2 / niji 6 only)
- [Inpaint](https://docs.apimart.ai/en/api-reference/images/midjourney/inpaint.md): Region inpaint entry (Vary (Region)); after submission the task enters MODAL, then call modal with mask + prompt
- [Modal (submit parameters)](https://docs.apimart.ai/en/api-reference/images/midjourney/modal.md): Supply mask + prompt to complete a MODAL-state inpaint task
- [Video (image-to-video)](https://docs.apimart.ai/en/api-reference/images/midjourney/video.md): Midjourney image-to-video (i2v), fixed FAST, no t2v support, ~5 second duration
- [Remix (reshape, v8.1 / v8.2 only)](https://docs.apimart.ai/en/api-reference/images/midjourney/remix.md): The v8 panel's reshape: regenerates the parent image and can change the prompt, in strong / subtle strengths
- [Get task](https://docs.apimart.ai/en/api-reference/images/midjourney/query.md): Query Midjourney task status and results. Unified task API /v1/tasks/{task_id} and MJ-style API /v1/midjourney/{task_id}
- [Best Practices](https://docs.apimart.ai/en/api-reference/images/midjourney/best-practices.md): Polling patterns, prompt design, image guidance, error-retry strategies, concurrency, and troubleshooting tips for Midjourney integration
- [End-to-End Workflow Examples](https://docs.apimart.ai/en/api-reference/images/midjourney/workflow.md): End-to-end curl walkthroughs for imagine → upscale → inpaint → video, with bash / Python / TS client wrappers

### Video Series

#### seedance-1-0-pro

- [seedance-1-0-pro Video Generation](https://docs.apimart.ai/en/api-reference/videos/doubao/generation.md): - Async processing mode, returns task ID for subsequent queries - Supports text-to-video, image-to-video (first frame/last frame) - Supports landscape, portrait, and square aspect ratios

#### seedance-1-5-pro

- [seedance-1-5-pro Video Generation](https://docs.apimart.ai/en/api-reference/videos/seedance-1-5-pro/generation.md): - Async processing mode, returns task ID for subsequent queries - Supports text-to-video, image-to-video (first frame/last frame) - Supports audio generation - Supports landscape, portrait, and square aspect ratios

#### seedance-2-0

- [seedance-2.0 Video Generation](https://docs.apimart.ai/en/api-reference/videos/seedance-2-0/generation.md): - Async processing mode, returns task ID for subsequent queries - Supports text-to-video, image-to-video (first frame/last frame) - Supports reference video, reference audio, audio-enabled video - Supports landscape, portrait, square, ultra-wide, and adaptive aspect ratios
- [Virtual Avatar Assets](https://docs.apimart.ai/en/api-reference/videos/seedance-2-0/private-avatar.md): - Private-domain virtual avatar asset submission API - Supports batch submission, up to 20 assets per request - Automatically creates or reuses asset groups; returns a task ID for status polling - Approved assets can be used directly in Seedance 2.0 video generation

#### seedance-2-5

- [seedance-2.5 Video Generation](https://docs.apimart.ai/en/api-reference/videos/seedance-2-5/generation.md): - Async API; returns task_id for polling - Text-to-video / multimodal reference / edit / extend / first–last frame - Up to 30s per job; up to 30 images + 10 videos + 10 audios as references - Resolution supports 480p / 720p / 1080p; mp4 or mov output

#### VEO3

- [VEO3 Video Generation](https://docs.apimart.ai/en/api-reference/videos/veo3/generation.md): - Asynchronous processing mode, returns task ID for subsequent queries - Supports multiple generation modes including text-to-video and image-to-video - Supports **4K** resolution output - Generated video links are valid for 24 hours, please save them promptly
- [VEO3 Video Remix](https://docs.apimart.ai/en/api-reference/videos/veo3/remix.md): - Extend generated videos by continuing from 8 seconds to 15 seconds - Asynchronous processing mode, returns task ID for subsequent queries - Generated video links are valid for 24 hours, please save them promptly
- [VEO3 Official Video Generation](https://docs.apimart.ai/en/api-reference/videos/veo3/generation-official.md): - Asynchronous processing mode, returns task ID for subsequent queries - Supports text-to-video and image-to-video (first frame / first & last frame control) - Supports 720P and 1080P resolution - Supports 4/6/8 second video duration - Supports audio track generation - Supports person generation pol…

#### MiniMax-Hailuo-02

- [MiniMax-Hailuo-02 Video Generation](https://docs.apimart.ai/en/api-reference/videos/minimax-hailuo/generation.md): - Asynchronous processing mode, returns task ID for subsequent queries - Supports text-to-video, image-to-video (first frame/last frame) - Supports 5 and 10 second durations, multiple resolutions available - Supports automatic prompt optimization and watermark control

#### MiniMax-Hailuo-2.3

- [MiniMax-Hailuo-2.3 Video Generation](https://docs.apimart.ai/en/api-reference/videos/minimax-hailuo-2.3/generation.md): - Async processing mode, returns task ID for subsequent queries - Supports text-to-video, image-to-video (first frame image) - Supports 6s and 10s duration, 768p/1080p resolution - Supports 15 camera movement commands, prompt auto-optimization, and watermark control

#### MiniMax-H3

- [MiniMax-H3 Video Generation](https://docs.apimart.ai/en/api-reference/videos/minimax-h3/generation.md): - Async processing mode, returns a task ID for subsequent queries - Supports text-to-video, image-to-video (first / last / first+last frame), and multimodal reference-to-video (reference images + videos + audio) - Supports 2K / 768P resolution, duration 4 ~ 15 seconds, with audio track - Shares the…
- [MiniMax-H3-Max Video Generation](https://docs.apimart.ai/en/api-reference/videos/minimax-h3/max.md): - MiniMax Video Generation V2 fast model with asynchronous task submission - Supports text-to-video, first/last-frame control, and multimodal reference generation - Supports 480P / 768P / 1080P, durations of 5–15 seconds, with audio - Supports reference images, videos, and audio; 2K and middle frame…
- [MiniMax-H3 Context-IR Prompt Enhancement](https://docs.apimart.ai/en/api-reference/videos/minimax-h3/context-ir.md): - Multimodal context understanding that produces an enhanced structured prompt (text only, no video) - Shares the same media fields and mutual-exclusion rules as H3 video generation - Token-based billing; typically completes in 20~40 seconds - Use alone, or as step 1 of the 768P preview → 2K regener…
- [MiniMax-H3 Regeneration](https://docs.apimart.ai/en/api-reference/videos/minimax-h3/regeneration.md): - Regenerate MiniMax-H3 768P video into 2K - Prefer source_task_id only; the platform auto-fills prompt, media, and source video - Not generic upscaling: source must be an H3 768P output - Per-second billing ($0.045/s output + same rate for reference videos)

#### FLUX 3 Video

- [FLUX 3 Video Generation](https://docs.apimart.ai/en/api-reference/videos/flux-3-video/generation.md): - Asynchronous processing mode, returns a task ID for subsequent queries - Unified entry: text-to-video / image-to-video / video continuation / draft two-step - Output H.264 + AAC with synced audio, duration 5~20 seconds - Resolution hd / fhd, seven aspect ratios

#### SkyReels V4

- [SkyReels V4 Video Generation](https://docs.apimart.ai/en/api-reference/videos/skyreels-v4/generation.md): - Two model tiers: Fast (speed-optimized) and Std (quality-optimized) - Three modes auto-routed by request fields: Text-to-Video (T2V), Image-to-Video (I2V), Multimodal Reference (Omni) - 480p / 720p / 1080p resolution, 3 ~ 15 seconds duration - Advanced features: first/end/key frame, reference imag…

#### HappyHorse

- [HappyHorse 1.0 Video Generation](https://docs.apimart.ai/en/api-reference/videos/happyhorse-1.0/generation.md): - Alibaba Cloud Bailian HappyHorse 1.0 video generation model (unified entry, single-model auto-routing) - Auto-routes by parameters: T2V (prompt only) / I2V (first_frame_image) / R2V (image_urls) / EDIT (video_url) - Supports 720P/1080P resolutions and any integer duration from 3 to 15 seconds - Bi…
- [HappyHorse 1.1 Video Generation](https://docs.apimart.ai/en/api-reference/videos/happyhorse-1.1/generation.md): - Alibaba Cloud Bailian HappyHorse 1.1 video generation model (unified entry, single-model auto-routing) - Auto-routes by parameters: T2V (prompt only) / I2V (first_frame_image) / R2V (image_urls) - Supports 720P/1080P resolutions and any integer duration from 3 to 15 seconds - Billed by resolution…

#### Wan3.0

- [Wan3.0 Video Generation](https://docs.apimart.ai/en/api-reference/videos/wan3.0-video/generation.md): - Alibaba Cloud Wanxiang 3.0 all-in-one reference video model - Text-to-video / first frame / first+last frame / multi-modal reference / file or link reference - Resolution 480P / 720P / 1080P, duration 2–30 seconds, or `-1` for model-chosen length - Supports images, video, audio, documents, and pub…

#### Wan2.7

- [Wan2.7 Video Generation](https://docs.apimart.ai/en/api-reference/videos/wan2.7/generation.md): - Alibaba Cloud Wanxiang 2.7 video generation model (unified entry) - Automatically routed based on parameters: Text-to-Video / Image-to-Video (first frame, first-last frame, video continuation) - Supports 720P/1080P resolution, 2-15 seconds duration - Supports custom audio (background music in text…
- [Wan2.7-R2V Reference-to-Video](https://docs.apimart.ai/en/api-reference/videos/wan2.7-r2v/generation.md): - Alibaba Cloud Wanxiang 2.7 reference-to-video model - Generate a new video with consistent style, characters, and scenes based on one or more reference images/videos - Supports character consistency, style transfer, and multi-asset combination - Supports reference voice (reference_voice) to contro…
- [Wan2.7-VideoEdit Video Editing](https://docs.apimart.ai/en/api-reference/videos/wan2.7-videoedit/generation.md): - Alibaba Cloud Wanxiang 2.7 video editing model - AI editing based on existing videos: style transfer, content replacement, element addition - Optionally accepts reference images to specify target style or appearance - Supports keeping the original video duration or customizing the output duration

#### Wan2.6

- [Wan2.6 Video Generation](https://docs.apimart.ai/en/api-reference/videos/wan2.6/generation.md): - Alibaba Cloud Wanxiang video generation model - Supports Text-to-Video and Image-to-Video - Supports 720p/1080p resolution, 5/10/15 seconds duration - Supports automatic prompt extension and audio generation
- [wan2.6-i2v-flash Image-to-Video](https://docs.apimart.ai/en/api-reference/videos/wan2.6/i2v-flash-generation.md): - Wanxiang 2.6 fast image-to-video model - Generates smooth video from first-frame image and text prompts - Supports audio/silent toggle, multi-shot narration, custom audio - Supports 720p/1080p resolution, 2-15 seconds duration - Supports video effect templates

#### Wan2.5

- [wan2.5-preview Video Generation](https://docs.apimart.ai/en/api-reference/videos/wan2.5/generation.md): - Wanxiang 2.5 preview video generation model - Supports Text-to-Video and Image-to-Video - Supports 480p/720p/1080p resolution, 5 or 10 seconds duration - Supports auto prompt extension, auto audio and custom audio

#### Kling 2.6

- [Kling 2.6 Video Generation](https://docs.apimart.ai/en/api-reference/videos/kling-v2-6/generation.md): - Async processing mode, returns task ID for subsequent queries - Supports text-to-video, image-to-video (first frame/first-last frame control) - Supports standard mode (720P) and professional mode (1080P) - Professional mode supports automatic audio generation and voice selection
- [Kling v2.6 Motion Control Video Generation](https://docs.apimart.ai/en/api-reference/videos/kling-v2-6/kling-v2-6-motion-control-generation.md): - Kling motion control model (reference image + reference video) - Called via unified endpoint `/v1/videos/generations` - Supports image / video character orientation, max duration 10s / 30s respectively - Asynchronous task — returns task_id on submission

#### Kling v3

- [Kling v3 Video Generation](https://docs.apimart.ai/en/api-reference/videos/kling-v3/generation.md): - Async processing mode, returns task ID for subsequent queries - Supports text-to-video, image-to-video (first frame/first-last frame control) - Supports standard mode (720P), professional mode (1080P), and 4K mode - Supports video durations from 3 to 15 seconds - Supports generating videos with au…

#### Kling 3.0 Turbo

- [Kling 3.0 Turbo Video Generation](https://docs.apimart.ai/en/api-reference/videos/kling-3.0-turbo/generation.md): - Asynchronous processing mode, returns a task ID for subsequent queries - Supports text-to-video and image-to-video (first-frame control) - Supports two resolution tiers: 720P / 1080P - Supports video durations of 3-15 seconds - Supports multi-shot storyboards (expressed via a fixed-format prompt)

#### Kling v3 Omni

- [Kling v3 Omni Video Generation](https://docs.apimart.ai/en/api-reference/videos/kling-v3-omni/generation.md): - Async processing mode, returns task ID for subsequent queries - Unified text-to-video/image-to-video interface with image reference syntax - Supports standard mode (720P), professional mode (1080P), and 4K mode - Reference images in prompts using image_N syntax - Supports generating videos with au…

#### Kling Video O1

- [Kling Video O1 Video Generation](https://docs.apimart.ai/en/api-reference/videos/kling-video-o1/generation.md): - Reasoning-enhanced model for highest quality video generation - Async processing mode, returns task ID for subsequent queries - Unified text-to-video/image-to-video interface with image reference syntax - Supports standard mode (720P) and professional mode (1080P) - Reference images in prompts usi…

#### Vidu Q3(pro/turbo)

- [Vidu Q3(pro/turbo) Video Generation](https://docs.apimart.ai/en/api-reference/videos/vidu-q3-pro/generation.md): - Async processing mode, returns task ID for subsequent queries - Supports text-to-video, image-to-video, first-last frame video generation - Supports 540p / 720p / 1080p resolution - Duration range 1-16 seconds, audio enabled by default

#### Vidu Q3(mix/standard)

- [Vidu Q3(mix/standard) Reference-to-Video](https://docs.apimart.ai/en/api-reference/videos/vidu-q3/generation.md): - Async processing mode, returns task ID for subsequent queries - Upload 1-7 reference images + text prompt to generate short videos containing reference subjects - Supports 540p / 720p / 1080p resolution - Duration range 1-16 seconds, suitable for character consistency and style continuation

#### Grok Imagine

- [Grok Imagine 1.5 Video Generation](https://docs.apimart.ai/en/api-reference/videos/grok-imagine/generation.md): - Async processing mode, returns task ID for subsequent queries - High-quality AI video generation, supports text-to-video and image-to-video - Flexible aspect ratio and quality options for different creative needs
- [Grok Official Video Models](https://docs.apimart.ai/en/api-reference/videos/grok-imagine/official.md): Generate videos from text or reference images with grok-imagine-video and grok-imagine-video-1.5, or edit a source video with the base model.

#### Pixverse v6

- [Pixverse v6 Video Generation](https://docs.apimart.ai/en/api-reference/videos/pixverse-v6/generation.md): - Pixverse v6 unified video generation model - Supports text-to-video, image-to-video, first/last frame transition, multi-reference fusion, and video extension - Supports 360p/540p/720p/1080p resolutions with 1-15 seconds duration - Asynchronous task API; query the result by task ID after submission

#### gemini-omni-1.1-flash-ext

- [gemini-omni-1.1-flash-ext Video Generation](https://docs.apimart.ai/en/api-reference/videos/omni-flash-ext/generation.md): - gemini-omni-1.1-flash-ext unified video generation model - Supports Text-to-Video, single-image Image-to-Video, reference video, and 3-reference-image fusion - Supports 720p/1080p/4k resolution and 4/6/8/10 second duration - Asynchronous task API. Submit a task first, then query the result by task…

#### Gemini Omni 1.1 Flash

- [Gemini Omni 1.1 Flash Video Generation](https://docs.apimart.ai/en/api-reference/videos/gemini-omni-1.1-flash/generation.md): - Google's official Gemini Omni 1.1 Flash all-in-one multimodal video generation model - Supports text-to-video, image-to-video, multi-subject references, first-and-last-frame interpolation, video editing, and extension - Supports 360p / 720p / 1080p / 4K, 24fps, 3–10 second output with generated au…

#### Gemini Omni Flash

- [Gemini Omni Flash Video Generation](https://docs.apimart.ai/en/api-reference/videos/gemini-omni-flash-preview/generation.md): - Google's official Gemini Omni Flash all-in-one multimodal video generation model - Supports Text-to-Video, Image-to-Video, and Video-to-Video (editing), with mixed text + image + video input - Outputs 720p / 24fps, 3-10 seconds, with audio; supports conversational multi-turn editing - Asynchronous…

### Audio Series

- [Whisper-1 Audio Transcription](https://docs.apimart.ai/en/api-reference/audios/whisper-1.md): - Supports speech recognition in 99 languages - Multiple output formats: json, text, srt, vtt, etc. - Maximum file size 25 MB
- [TTS Text-to-Speech](https://docs.apimart.ai/en/api-reference/audios/tts.md): - Support multiple voice models and voice selections - Output high-quality audio formats: wav, opus, aac, flac, pcm - Maximum input text of 4096 characters

#### Flow Music

- [Generate Music](https://docs.apimart.ai/en/api-reference/audios/flow-music/music.md): Flow Music text-to-music generation. Supports style prompts / lyrics / BPM / duration control, generating one track per request
- [Lyria 3.5 Generate Music](https://docs.apimart.ai/en/api-reference/audios/flow-music/music-lyria-3-5.md): Use Lyria 3.5 for Flow Music text-to-music generation with style prompts, lyrics, BPM, and duration control
- [Generate Lyrics](https://docs.apimart.ai/en/api-reference/audios/flow-music/lyrics.md): Flow Music generates lyrics from a prompt. The result can be filled into the lyrics field of the Generate Music endpoint
- [Extend Music](https://docs.apimart.ai/en/api-reference/audios/flow-music/extend.md): Flow Music continues a previously generated audio clip. Extends the music from a specified time point according to an editing instruction
- [Lyria 3.5 Extend Music](https://docs.apimart.ai/en/api-reference/audios/flow-music/extend-lyria-3-5.md): Use Lyria 3.5 to extend previously generated music from a specified time point
- [Replace Section](https://docs.apimart.ai/en/api-reference/audios/flow-music/replace.md): Flow Music replaces a section of previously generated audio. Regenerates the segment between start_s and end_s according to an editing instruction
- [Lyria 3.5 Replace Section](https://docs.apimart.ai/en/api-reference/audios/flow-music/replace-lyria-3-5.md): Use Lyria 3.5 to replace a specified section of previously generated audio
- [Cover Rearrangement](https://docs.apimart.ai/en/api-reference/audios/flow-music/cover.md): Flow Music rearranges an entire song into a new style (cover / restyle), with strength controlling the editing intensity
- [Lyria 3.5 Cover Rearrangement](https://docs.apimart.ai/en/api-reference/audios/flow-music/cover-lyria-3-5.md): Use Lyria 3.5 to rearrange the style of an entire song
- [Stem Separation](https://docs.apimart.ai/en/api-reference/audios/flow-music/stems.md): Flow Music separates vocal / instrumental tracks, delivered as a zip stem package
- [Upload Audio](https://docs.apimart.ai/en/api-reference/audios/flow-music/upload-audio.md): Import external audio into Flow Music in exchange for a clip_id for subsequent extend / replace / cover / stem operations
- [Download Audio](https://docs.apimart.ai/en/api-reference/audios/flow-music/download-audio.md): Flow Music exports a clip as an audio file in the specified format (wav / mp3)
- [Music Video Rendering](https://docs.apimart.ai/en/api-reference/audios/flow-music/video-clip.md): Flow Music renders music into an mp4 video from a template, supporting three presets: simple / modern / player
- [Query Task](https://docs.apimart.ai/en/api-reference/audios/flow-music/query.md): Query the execution status, progress, and generated results of Flow Music asynchronous tasks

#### Suno

- [Suno V6 General Agreements and Task Inquiry](https://docs.apimart.ai/en/api-reference/audios/suno/overview.md): Suno V6 version selection, custom models, asynchronous task lifecycle, source track reference and result structure
- [Generate music](https://docs.apimart.ai/en/api-reference/audios/suno/generation.md): - Generate a song from a prompt: `custom=false` is inspiration mode (`prompt` used as an inspiration prompt), `=true` is custom mode (`prompt` used as lyrics). - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Generate lyrics](https://docs.apimart.ai/en/api-reference/audios/suno/lyrics.md): - Generate lyrics text based on a theme. - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Inspiration generation (inspo)](https://docs.apimart.ai/en/api-reference/audios/suno/inspo.md): - Generate a new song using 1–4 pieces of public audio as inspiration references (pass the audio URLs directly, not via task_id). - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Sound effect generation](https://docs.apimart.ai/en/api-reference/audios/suno/sounds.md): - Generate a sound effect from a description. - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Tag enhancement](https://docs.apimart.ai/en/api-reference/audios/suno/upsample-tags.md): - Optimize / expand style tags to improve prompt quality. - Asynchronous tasks: submit with `task_id` to get a task ID, then poll with `GET /v1/music/tasks/:task_id` for the result.
- [Upload audio](https://docs.apimart.ai/en/api-reference/audios/suno/upload.md): - Import a piece of public audio to obtain a track that can be referenced later (for cover / continuation, etc.); once complete, this job's `task_id` can serve as the source (`audio_index=1`). - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Upload Audio and Create a Cover](https://docs.apimart.ai/en/api-reference/audios/suno/upload-cover.md): Upload a public audio URL and create a cover with Suno V6
- [Upload and Extend Audio](https://docs.apimart.ai/en/api-reference/audios/suno/upload-extend.md): Upload a public audio URL and extend the song from a specified point with Suno V6
- [Create a Custom Model](https://docs.apimart.ai/en/api-reference/audios/suno/create-model.md): Create a custom Suno V6 model from 6–24 reference audio clips
- [Continuation and extension](https://docs.apimart.ai/en/api-reference/audios/suno/extend.md): - Continue and extend an existing song from a given point in time. - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Style cover](https://docs.apimart.ai/en/api-reference/audios/suno/cover-song.md): - Cover an existing song in a different style. - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Mastering](https://docs.apimart.ai/en/api-reference/audios/suno/remaster.md): - Master an already generated song to improve audio quality, clarity, and overall texture. - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Stem extraction](https://docs.apimart.ai/en/api-reference/audios/suno/stems.md): - Separate a specified track (e.g. vocals) from a song. - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Full stem separation](https://docs.apimart.ai/en/api-reference/audios/suno/stems-all.md): - Full multi-track separation. - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Add vocals](https://docs.apimart.ai/en/api-reference/audios/suno/add-vocals.md): - Layer vocals onto an existing (accompaniment / track). - Use `task_id` + `audio_index` to reference a track from an `uploadTask` upload task. - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Add accompaniment](https://docs.apimart.ai/en/api-reference/audios/suno/add-instrumental.md): - Layer accompaniment onto an existing (vocals / track). - Use `task_id` + `audio_index` to reference a track from an `uploadTask` upload task. - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Add stem (add stem)](https://docs.apimart.ai/en/api-reference/audios/suno/add-stem.md): - Layer a stem onto an existing track. - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Extract Vox (deprecated)](https://docs.apimart.ai/en/api-reference/audios/suno/vox.md): - The voice clip extraction interface that is compatible with the old workflow; for new integrations, simply create a Persona. - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/…
- [Create voice](https://docs.apimart.ai/en/api-reference/audios/suno/create-voice.md): - Create a reusable voice from a track. - Referencing the source track: this endpoint does NOT use `task_id` + `audio_index` — provide a publicly accessible `audio_url` directly - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Persona](https://docs.apimart.ai/en/api-reference/audios/suno/persona.md): - Create a reusable Singer Persona by directly using existing songs. - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Section replacement](https://docs.apimart.ai/en/api-reference/audios/suno/replace-music.md): - Replace a section of a song (infill). - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Remove segment](https://docs.apimart.ai/en/api-reference/audios/suno/remove-section.md): - Remove a time range from a song. - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Crop audio](https://docs.apimart.ai/en/api-reference/audios/suno/crop.md): - Crop to keep the specified range. - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Fade in](https://docs.apimart.ai/en/api-reference/audios/suno/fade-in.md): - Fade in at the beginning. - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Fade out](https://docs.apimart.ai/en/api-reference/audios/suno/fade-out.md): - Fade out at the end. - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Adjust speed](https://docs.apimart.ai/en/api-reference/audios/suno/adjust-speed.md): - Change speed (without changing pitch). - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Full song synthesis / concatenation](https://docs.apimart.ai/en/api-reference/audios/suno/concat.md): - Synthesize segments into a complete song. - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Generate mashup (mashup)](https://docs.apimart.ai/en/api-reference/audios/suno/mashup.md): - Remix a song into a new creation. - Referencing source tracks: requires **exactly 2**, specified via `task_ids` (an array of length 2) + optional `audio_indexes` - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Sample to song (sample)](https://docs.apimart.ai/en/api-reference/audios/suno/sample.md): - Generate a song based on a sample. - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Generate MIDI](https://docs.apimart.ai/en/api-reference/audios/suno/midi.md): - Generate MIDI from a song. - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Lyrics timeline](https://docs.apimart.ai/en/api-reference/audios/suno/aligned-lyrics.md): - Generate a line-by-line aligned lyrics timeline. - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [BPM analysis](https://docs.apimart.ai/en/api-reference/audios/suno/bpm.md): - Analyze a song's BPM. - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Generate music video (MV)](https://docs.apimart.ai/en/api-reference/audios/suno/generate-mp4.md): - Generate an MV video for the song. - Reference the source track: specified by `task_id` + `audio_index`, no need to record any extra id - Async task: submitting returns a `task_id`; poll `GET /v1/music/tasks/:task_id` for the result
- [Download Audio Files](https://docs.apimart.ai/en/api-reference/audios/suno/wav.md): - Download Suno songs as MP3, M4A, or WAV files - Request multiple formats at once and receive a URL for each file - Select the source song with task_id and audio_index - Submit asynchronously and query the music task endpoint for results

### Moderation Series

#### omni-moderation-latest

- [omni-moderation-latest Content Moderation](https://docs.apimart.ai/en/api-reference/moderations/omni-moderation-latest/generation.md): - Supports text, image, and mixed text+image content moderation - Compatible with single text, text array, and content block array inputs - Images support public URLs and base64 Data URIs

### Upload Management

- [Upload Image](https://docs.apimart.ai/en/api-reference/uploads/images.md): Upload an image to get a URL for use with image/video generation APIs

### Task Management

- [Get Task Status](https://docs.apimart.ai/en/api-reference/tasks/status.md): - Query the execution status and result of an asynchronous task - Real-time status updates and progress tracking - Retrieve generation results when tasks are completed - Error messages available in 10 languages (en/zh/ja/ko/ru/fr/de/id/pt/es)
- [Task Completion Callback (Webhook)](https://docs.apimart.ai/en/api-reference/tasks/webhook.md): Include a callback URL when submitting an async generation task, and we'll POST the result once it finishes, with an optional language for failure messages.

### Account Management

- [Query Token Balance](https://docs.apimart.ai/en/api-reference/account/token-balance.md): - Query remaining and used credits of the current API Key - Monitor single token usage - CORS support for cross-origin requests - Real-time balance monitoring
- [Query User Balance](https://docs.apimart.ai/en/api-reference/account/user-balance.md): - Query overall remaining and used credits of user account - Get user-level balance information - CORS support for cross-origin requests - Real-time balance monitoring
- [Query Usage and Spending](https://docs.apimart.ai/en/api-reference/account/usage.md): - Query spending and request statistics for a specified time range - Filter by model and group by model or calendar day - Query usage for the current API Key or the entire account - Returns USD amounts, credits, request counts, and token usage
