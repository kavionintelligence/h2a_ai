export type AdapterFactory<TAdapter, TContext> = (context: TContext) => TAdapter;

export class UnsupportedAdapterModeError extends Error {
  public constructor(public readonly mode: string) {
    super(`No adapter is registered for feature mode: ${mode}`);
    this.name = 'UnsupportedAdapterModeError';
  }
}

export class AdapterRegistry<TMode extends string, TAdapter, TContext = undefined> {
  private readonly factories = new Map<TMode, AdapterFactory<TAdapter, TContext>>();

  public register(mode: TMode, factory: AdapterFactory<TAdapter, TContext>): this {
    if (this.factories.has(mode)) throw new Error(`Adapter mode is already registered: ${mode}`);
    this.factories.set(mode, factory);
    return this;
  }

  public create(mode: TMode, context: TContext): TAdapter {
    const factory = this.factories.get(mode);
    if (!factory) throw new UnsupportedAdapterModeError(mode);
    return factory(context);
  }

  public has(mode: TMode): boolean {
    return this.factories.has(mode);
  }

  public listModes(): TMode[] {
    return [...this.factories.keys()];
  }
}
