export interface GeneratorAttribute {
  name: string;
  description?: string;
  default?: string;
  required?: boolean;
}

export interface GeneratorMetadata {
  key: string;
  name: string;
  language: string;
  description: string;
  attributes: GeneratorAttribute[];
}

export interface GeneratorError {
  code: string;
  message: string;
}

export interface GeneratedFilePayload {
  name: string;
  dir: string;
  contents: string;
}

export interface InvocationResponse {
  files: GeneratedFilePayload[];
  source: string;
}

export interface ApibuilderServiceJson {
  name?: string;
  namespace: string;
  description?: string;
  organization?: { key: string };
  application?: { key: string };
  version?: string;
  enums?: Record<string, { values: Array<{ name: string; description?: string }> }>;
  unions?: Record<
    string,
    {
      discriminator?: string;
      types: Array<{ type: string; description?: string }>;
    }
  >;
  models?: Record<
    string,
    {
      description?: string;
      fields: Array<{
        name: string;
        type: string;
        required?: boolean;
        description?: string;
        default?: string;
        minimum?: number;
        maximum?: number;
        max_length?: number;
      }>;
    }
  >;
  resources?: Record<
    string,
    {
      path: string;
      operations: Array<{
        method: string;
        path?: string;
        description?: string;
        parameters?: Array<{
          name: string;
          type: string;
          required?: boolean;
          description?: string;
        }>;
        body?: { type: string };
        responses: Record<string, { type: string; description?: string }>;
      }>;
    }
  >;
  imports?: Array<{ uri: string }>;
}

export interface InvocationForm {
  service: ApibuilderServiceJson;
  imported_services?: ApibuilderServiceJson[];
  attributes?: Array<{ name: string; value?: string }>;
  user_agent?: string;
}

export type GeneratorFn = (form: InvocationForm) => Promise<GeneratedFilePayload[]>;

export interface RegisteredGenerator extends GeneratorMetadata {
  generate: GeneratorFn;
}
