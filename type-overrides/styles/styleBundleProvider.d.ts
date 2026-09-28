export interface StyleBundleProviderContext<User = unknown> {
  user?: User | null;
  [key: string]: unknown;
}

export interface StyleBundleDocument {
  id: string;
  label: string;
  schema: 'toonlab/style-bundle';
  version: number;
  slots: Record<string, unknown>;
  [key: string]: unknown;
}

export interface StyleBundleProvider<User = unknown> {
  readonly defaultBundleId: string;
  readonly id: string;
  readonly version: number;
  get(id: string, context?: StyleBundleProviderContext<User>): Promise<StyleBundleDocument | null>;
  list(context?: StyleBundleProviderContext<User>): Promise<StyleBundleDocument[]>;
}

export const STYLE_BUNDLE_PROVIDER_VERSION: 1;

export function createStyleBundleProvider<User = unknown>(options: {
  defaultBundleId?: string;
  id?: string;
  getBundle?: (id: string, context: StyleBundleProviderContext<User>) => StyleBundleDocument | null | Promise<StyleBundleDocument | null>;
  listBundles: (context: StyleBundleProviderContext<User>) => StyleBundleDocument[] | Promise<StyleBundleDocument[]>;
}): StyleBundleProvider<User>;

export function createOssStyleBundleProvider(options?: {
  bundles?: StyleBundleDocument[] | null;
}): StyleBundleProvider<never>;

export function createUserStyleBundleProvider<User = unknown>(options: {
  loadUserBundles: (user: User, context: StyleBundleProviderContext<User>) => StyleBundleDocument[] | Promise<StyleBundleDocument[]>;
}): StyleBundleProvider<User>;

export function resolveStyleBundleSelection<User = unknown>(
  provider: StyleBundleProvider<User>,
  requestedId?: string | null,
  context?: StyleBundleProviderContext<User>,
): Promise<{ options: StyleBundleDocument[]; selected: StyleBundleDocument | null }>;
