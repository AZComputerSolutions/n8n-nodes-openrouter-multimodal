import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeConnectionTypes,
  NodeApiError,
  NodeOperationError,
  IHttpRequestOptions,
  IBinaryData,
} from 'n8n-workflow';

import { readFile } from 'fs/promises';

interface IModelInfo {
  id: string;
  name: string;
  modalities: string[];
  input_modalities?: string[];
  output_modalities?: string[];
}

interface IModelsResponse {
  data: IModelInfo[];
}

export class OpenRouterMultimodal implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'OpenRouter Multimodal',
    name: 'openRouterMultimodal',
    icon: 'file:openrouter-multimodal.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["model"]}}',
    description: 'Process images, audio, and video using OpenRouter multimodal models',
    defaults: {
      name: 'OpenRouter Multimodal',
    },
    inputs: [
      {
        displayName: 'Binary Input',
        type: NodeConnectionTypes.Main,
      },
    ],
    outputs: [
      {
        displayName: 'Main',
        type: NodeConnectionTypes.Main,
      },
    ],
    credentials: [
      {
        // Reuses the existing openRouterApi credential from n8n-nodes-langchain
        name: 'openRouterApi',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Analyze Image',
            value: 'imageAnalyze',
            description: 'Analyze or describe an image using a vision model',
            action: 'Analyze an image',
          },
          {
            name: 'Transcribe/Process Audio',
            value: 'audioProcess',
            description: 'Transcribe audio or analyze audio content',
            action: 'Process audio',
          },
          {
            name: 'Analyze Video',
            value: 'videoAnalyze',
            description: 'Analyze video content (frame extraction or model-native)',
            action: 'Analyze video',
          },
        ],
        default: 'imageAnalyze',
      },
      {
        displayName: 'Model',
        name: 'model',
        type: 'optionsLoader',
        typeOptions: {
          searchListMethod: 'getModels',
          searchable: true,
        },
        displayOptions: {
          show: {
            operation: ['imageAnalyze', 'audioProcess', 'videoAnalyze'],
          },
        },
        default: '',
        required: true,
        description: 'Choose a multimodal model that supports the selected operation',
      },
      {
        displayName: 'Prompt',
        name: 'prompt',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'e.g., Describe what you see in this image',
        description: 'Text prompt to send along with the media',
        typeOptions: {
          rows: 4,
        },
      },
      {
        displayName: 'Binary Property',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        required: true,
        description: 'Name of the binary property containing the file to process',
        displayOptions: {
          show: {
            operation: ['imageAnalyze', 'audioProcess', 'videoAnalyze'],
          },
        },
      },
      {
        displayName: 'Additional Options',
        name: 'additionalOptions',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        options: [
          {
            displayName: 'System Prompt',
            name: 'systemPrompt',
            type: 'string',
            default: '',
            description: 'Optional system message to set context',
            typeOptions: {
              rows: 3,
            },
          },
          {
            displayName: 'Temperature',
            name: 'temperature',
            type: 'number',
            default: 0.7,
            typeOptions: {
              minValue: 0,
              maxValue: 2,
              numberPrecision: 2,
            },
            description: 'Sampling temperature (0 = deterministic, 2 = most creative)',
          },
          {
            displayName: 'Max Tokens',
            name: 'maxTokens',
            type: 'number',
            default: 1024,
            description: 'Maximum number of tokens in the response',
          },
          {
            displayName: 'Site URL (HTTP-Referer)',
            name: 'siteUrl',
            type: 'string',
            default: '',
            description: 'Optional URL for OpenRouter app attribution',
          },
          {
            displayName: 'App Title (X-OpenRouter-Title)',
            name: 'appTitle',
            type: 'string',
            default: 'n8n OpenRouter Multimodal',
            description: 'Optional app title for OpenRouter leaderboards',
          },
          {
            displayName: 'Video Frame Interval (seconds)',
            name: 'videoFrameInterval',
            type: 'number',
            default: 2,
            displayOptions: {
              show: {
                '/operation': ['videoAnalyze'],
              },
            },
            description: 'Extract a frame every N seconds for video analysis (for non-native video models)',
          },
        ],
      },
    ],
  };

  methods = {
    listSearch: {
      async getModels(this: IExecuteFunctions): Promise<IModelInfo[]> {
        const credentials = await this.getCredentials('openRouterApi');
        const apiKey = credentials.apiKey as string;

        const options: IHttpRequestOptions = {
          method: 'GET',
          url: 'https://openrouter.ai/api/v1/models',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        };

        const response = await this.helpers.httpRequestWithAuthentication.call(
          this,
          'openRouterApi',
          options,
        );

        const models = (response as IModelsResponse).data || [];

        return models.map((m) => ({
          id: m.id,
          name: m.name || m.id,
          modalities: [
            ...(m.input_modalities || []),
            ...(m.output_modalities || []),
          ].filter((v, i, a) => a.indexOf(v) === i),
          input_modalities: m.input_modalities || [],
          output_modalities: m.output_modalities || [],
        }));
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const credentials = await this.getCredentials('openRouterApi');
    const apiKey = credentials.apiKey as string;

    const operation = this.getNodeParameter('operation', 0) as string;
    const model = this.getNodeParameter('model', 0) as string;
    const prompt = this.getNodeParameter('prompt', 0) as string;
    const additionalOptions = this.getNodeParameter('additionalOptions', 0, {}) as {
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      siteUrl?: string;
      appTitle?: string;
      videoFrameInterval?: number;
    };

    for (let i = 0; i < items.length; i++) {
      try {
        const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
        const binaryData = items[i].binary?.[binaryPropertyName] as IBinaryData | undefined;

        if (!binaryData) {
          throw new NodeOperationError(
            this.getNode(),
            `No binary data found in property "${binaryPropertyName}"`,
            { itemIndex: i },
          );
        }

        const messages: any[] = [];

        if (additionalOptions.systemPrompt) {
          messages.push({
            role: 'system',
            content: additionalOptions.systemPrompt,
          });
        }

        // Build the content array based on operation
        const content: any[] = [
          {
            type: 'text',
            text: prompt,
          },
        ];

        if (operation === 'imageAnalyze') {
          content.push({
            type: 'image_url',
            image_url: {
              url: `data:${binaryData.mimeType};base64,${binaryData.data}`,
            },
          });
        } else if (operation === 'audioProcess') {
          content.push({
            type: 'input_audio',
            input_audio: {
              data: binaryData.data,
              format: this.getAudioFormat(binaryData.mimeType),
            },
          });
        } else if (operation === 'videoAnalyze') {
          // Video is typically sent as frames for non-native models,
          // or as URL for native video-supporting models
          const frameData = await this.extractVideoFrames(
            binaryData,
            additionalOptions.videoFrameInterval || 2,
          );
          content.push(...frameData);
        }

        messages.push({
          role: 'user',
          content,
        });

        const headers: Record<string, string> = {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        };

        if (additionalOptions.siteUrl) {
          headers['HTTP-Referer'] = additionalOptions.siteUrl;
        }
        if (additionalOptions.appTitle) {
          headers['X-OpenRouter-Title'] = additionalOptions.appTitle;
        }

        const body: any = {
          model,
          messages,
        };

        if (additionalOptions.temperature !== undefined) {
          body.temperature = additionalOptions.temperature;
        }
        if (additionalOptions.maxTokens) {
          body.max_tokens = additionalOptions.maxTokens;
        }

        const requestOptions: IHttpRequestOptions = {
          method: 'POST',
          url: 'https://openrouter.ai/api/v1/chat/completions',
          headers,
          body,
        };

        const response = await this.helpers.httpRequestWithAuthentication.call(
          this,
          'openRouterApi',
          requestOptions,
        );

        const assistantMessage =
          (response as any).choices?.[0]?.message?.content ?? '';

        returnData.push({
          json: {
            ...items[i].json,
            response: assistantMessage,
            model,
            usage: (response as any).usage,
            raw: response,
          },
          pairedItem: { item: i },
        });
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: error.message,
              item: i,
            },
            pairedItem: { item: i },
          });
          continue;
        }
        throw new NodeApiError(this.getNode(), error as any, { itemIndex: i });
      }
    }

    return [returnData];
  }

  private getAudioFormat(mimeType: string): string {
    const map: Record<string, string> = {
      'audio/wav': 'wav',
      'audio/wave': 'wav',
      'audio/x-wav': 'wav',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/ogg': 'ogg',
      'audio/webm': 'webm',
    };
    return map[mimeType] || 'wav';
  }

  private async extractVideoFrames(
    binaryData: IBinaryData,
    _intervalSeconds: number,
  ): Promise<any[]> {
    // For now, send video as a single reference; production version should
    // use ffmpeg to extract frames. Models like Gemini handle video natively
    // when passed as base64 or URL.
    return [
      {
        type: 'image_url',
        image_url: {
          url: `data:${binaryData.mimeType};base64,${binaryData.data}`,
        },
      },
    ];
  }
}
