# n8n-nodes-openrouter-multimodal

Please note, this node is not ready for production use.  At the moment, I am working on development.

# n8n-nodes-openrouter-multimodal

Use OpenRouter multimodal models (vision, audio, video) directly in n8n.

## Features

- **Image analysis** — Send images to any vision-capable model
- **Audio processing** — Transcription and audio understanding
- **Video analysis** — Frame extraction or native video model support
- **Dynamic model loading** — Pulls the live model catalog from OpenRouter
- **Reuses existing OpenRouter credentials** — No new auth setup required

## Installation (Community Nodes)

In n8n, go to **Settings → Community Nodes → Install** and enter:

n8n-nodes-openrouter-multimodal


## Local Development

```bash
npm install
npm run build
# Then link to your n8n installation

Authentication
This node reuses the openRouterApi credential from the existing
n8n-nodes-langchain package. Configure your OpenRouter API key once and
both nodes will share the same credentials.


## Key Design Decisions

1. **Credential reuse** — The node references `openRouterApi` directly in its `credentials` array, so any user who has the standard OpenRouter LangChain node installed will already have the credential configured [1].

2. **Single endpoint, multiple modalities** — All three operations hit the same `/api/v1/chat/completions` endpoint [2]; only the `content` array structure differs per modality.

3. **Dynamic model loading** — Uses n8n's `optionsLoader` pattern with a `listSearch` method that calls `GET /api/v1/models`, returning a searchable dropdown instead of hardcoded model slugs [2].

4. **Binary-first input** — Accepts files via n8n's binary data system, so it works seamlessly with `HTTP Request`, `Read Binary File`, `Google Drive`, `S3`, etc. nodes upstream.

5. **Attribution headers** — Includes optional `HTTP-Referer` and `X-OpenRouter-Title` headers so your workflows show up on OpenRouter's app leaderboards [2].

6. **Phase alignment** — Follows the n8n four-phase workflow (Plan → Build → Test → Deploy) [1]. The package is structured so you can run `npm run dev` to test locally and `npm run release` to publish.

## Before Publishing

1. **Test locally** using `npm link` against an n8n dev install
2. **Verify model filtering** — currently the model dropdown shows all models; you may want to filter by `input_modalities` containing `image`, `audio`, or `video` per operation
3. **Consider frame extraction** — for video, production use should integrate `ffmpeg` to extract proper frames at intervals, rather than passing the raw video as a single image

## Sources

- n8n node creation workflow (planning → building → testing → deploying) [1]
- OpenRouter API authentication via Bearer token and the `/api/v1/chat/completions` endpoint supporting multimodal content [2]
