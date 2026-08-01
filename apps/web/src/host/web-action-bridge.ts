export interface OpenVariablesBridge {
  open(variableName?: string): void;
  register(handler: (variableName?: string) => void): () => void;
}

/**
 * The shared playground owns the Variables dialog, while the Web host owns
 * the buttons that request it. Keep one active-tab handler and make stale
 * disposers harmless when tabs switch quickly.
 */
export function createOpenVariablesBridge(): OpenVariablesBridge {
  let activeHandler: ((variableName?: string) => void) | null = null;

  return {
    open(variableName) {
      activeHandler?.(variableName);
    },
    register(handler) {
      activeHandler = handler;
      return () => {
        if (activeHandler === handler) {
          activeHandler = null;
        }
      };
    },
  };
}
